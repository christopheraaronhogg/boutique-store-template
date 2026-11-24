import { loadSettings, sectionWrite } from '$lib/server/settings';
import type { Settings } from '$lib/settings';
import { PhotoProblem, pictureFrom, type Picture, type PhotoInput } from './images';
import { OwnerProblem } from './purses';
import { EDITABLE_SECTIONS, nextSection, SETUP_STORE_KEYS, setupStoreValue, type EditableSection } from './settings';

export const BRAND_IMAGES = ['logo', 'logo_mark', 'logo_tall', 'logo_footer', 'icon'] as const;
export type BrandImage = (typeof BRAND_IMAGES)[number];
export type SetupStoreKey = (typeof SETUP_STORE_KEYS)[number];

export type SetupProfile = {
  sections?: Partial<Record<EditableSection, unknown>>;
  store_setup?: Partial<Record<SetupStoreKey, unknown>>;
  brand_images?: Partial<Record<BrandImage, PhotoInput>>;
  owner_photo?: PhotoInput;
  top_photo?: PhotoInput;
};

export type SetupResult = { changed: string[]; images: Record<string, string> };

export const MAX_SETUP_BYTES = 40 * 1024 * 1024;

const PHOTO_SPOT = { owner_photo: ['about', 'photo_key', 'store/about'], top_photo: ['home', 'hero_photo_key', 'store/home'] } as const;

export async function applySetup(db: D1Database, bucket: R2Bucket, profile: SetupProfile, fetcher: typeof fetch = fetch): Promise<SetupResult> {
  const current = await loadSettings(db);
  const next: Partial<Record<EditableSection, unknown>> = {};

  for (const [section, changes] of Object.entries(profile.sections ?? {})) {
    if (!EDITABLE_SECTIONS.includes(section as EditableSection)) throw new OwnerProblem(`"${section}" is not a settings section. Sections: ${EDITABLE_SECTIONS.join(', ')}.`);
    if (changes === undefined) continue;
    try {
      next[section as EditableSection] = nextSection(current, section as EditableSection, changes);
    } catch (e) {
      if (e instanceof OwnerProblem) throw new OwnerProblem(`${section}: ${e.message}`);
      throw e;
    }
  }

  const store: Record<string, unknown> = { ...((next.store as Settings['store'] | undefined) ?? current.store) };
  for (const [key, value] of Object.entries(profile.store_setup ?? {})) {
    if (!SETUP_STORE_KEYS.includes(key as SetupStoreKey)) throw new OwnerProblem(`"${key}" is not a setup field. Fields: ${SETUP_STORE_KEYS.join(', ')}.`);
    try {
      store[key] = setupStoreValue(key as SetupStoreKey, value);
    } catch (e) {
      if (e instanceof OwnerProblem) throw new OwnerProblem(`store_setup: ${e.message}`);
      throw e;
    }
  }

  const brand = Object.entries(profile.brand_images ?? {}).filter((e): e is [string, PhotoInput] => e[1] !== undefined);
  for (const [field] of brand) {
    if (!BRAND_IMAGES.includes(field as BrandImage)) throw new OwnerProblem(`"${field}" is not a brand image. Images: ${BRAND_IMAGES.join(', ')}.`);
  }
  const spots = (['owner_photo', 'top_photo'] as const).filter((spot) => profile[spot] !== undefined);

  const pictures = new Map<string, Picture>();
  let total = 0;
  for (const [field, input] of [...brand, ...spots.map((spot) => [spot, profile[spot]!] as const)]) {
    try {
      const picture = await pictureFrom(input, fetcher);
      total += picture.bytes.byteLength;
      if (total > MAX_SETUP_BYTES) throw new OwnerProblem(`${field}: the pictures add up to more than 40 MB. Send smaller copies, or set some later with set_store_photo.`);
      pictures.set(field, picture);
    } catch (e) {
      if (e instanceof PhotoProblem) throw new OwnerProblem(`${field}: ${e.message}`);
      throw e;
    }
  }

  const written: string[] = [];
  const images: Record<string, string> = {};
  const keyFor = (field: string, picture: Picture) => {
    const folder = field in PHOTO_SPOT ? PHOTO_SPOT[field as keyof typeof PHOTO_SPOT][2] : 'store/brand';
    const name = field in PHOTO_SPOT ? crypto.randomUUID() : `${field}-${crypto.randomUUID()}`;
    return `${folder}/${name}.${picture.ext}`;
  };

  try {
    for (const [field, picture] of pictures) {
      const key = keyFor(field, picture);
      await bucket.put(key, picture.bytes, { httpMetadata: { contentType: picture.mime, cacheControl: 'public, max-age=31536000, immutable' } });
      written.push(key);
      images[field] = `/photos/${key}`;
      if (field in PHOTO_SPOT) {
        const [section, slot] = PHOTO_SPOT[field as keyof typeof PHOTO_SPOT];
        const base = { ...((next[section] as Record<string, unknown> | undefined) ?? current[section]) } as Record<string, unknown>;
        base[slot] = key;
        next[section] = base;
      } else {
        store[field] = `/photos/${key}`;
      }
    }

    if (profile.store_setup || brand.length > 0 || next.store !== undefined) next.store = store;
    const writes = Object.entries(next).map(([section, value]) => sectionWrite(db, section as EditableSection, value));
    if (writes.length > 0) await db.batch(writes);
  } catch (e) {
    if (written.length > 0) await bucket.delete(written).catch(() => undefined);
    throw e;
  }

  return { changed: Object.keys(next), images };
}
