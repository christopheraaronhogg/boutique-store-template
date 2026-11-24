import { fail } from '@sveltejs/kit';
import { changeSettings } from '$lib/server/owner/settings';
import { OwnerProblem } from '$lib/server/owner/purses';
import { ownerOnly } from '$lib/server/owner/sessions';
import { loadSettings } from '$lib/server/settings';
import { PhotoProblem, readPicture } from '$lib/server/owner/images';
import { clearStorePhoto, setStorePhoto, STORE_PHOTO_SPOTS, type StorePhotoSpot } from '$lib/server/owner/storePhotos';
import { THEME_COLORS, themeChanges } from '$lib/server/admin/themeForm';
import { SCRIPT_FONTS } from '$lib/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const s = await loadSettings(locals.db);
  return { banner: s.banner, hours: s.hours, closures: s.closures, aboutPhoto: s.about.photo_key, homePhoto: s.home.hero_photo_key, aboutOn: s.about.enabled, theme: s.theme, colors: THEME_COLORS, fonts: SCRIPT_FONTS };
};

function rows<A extends string, B extends string>(form: FormData, a: A, b: B): Record<A | B, string>[] {
  const left = form.getAll(a).map(String);
  const right = form.getAll(b).map(String);
  return left.map((v, i) => ({ [a]: v.trim(), [b]: (right[i] ?? '').trim() }) as Record<A | B, string>).filter((r) => r[a] !== '' || r[b] !== '');
}

async function problemWith(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof OwnerProblem) return e.message;
    throw e;
  }
}

function spotFrom(form: FormData): StorePhotoSpot | null {
  const spot = String(form.get('spot') ?? '');
  return (STORE_PHOTO_SPOTS as readonly string[]).includes(spot) ? (spot as StorePhotoSpot) : null;
}

export const actions: Actions = {
  photo: async ({ locals, request, platform }) => {
    ownerOnly(locals);
    const form = await request.formData();
    const spot = spotFrom(form);
    if (!spot) return fail(422, { problem: 'Pick which photo to change.' });
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return fail(422, { problem: 'Pick a photo first.' });
    try {
      await setStorePhoto(locals.db, platform!.env.PHOTOS, spot, readPicture(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      if (e instanceof PhotoProblem) return fail(422, { problem: e.message });
      throw e;
    }
    return { done: spot === 'about' ? 'Your photo is on the site.' : 'The top photo is on the site.' };
  },
  clearPhoto: async ({ locals, request }) => {
    ownerOnly(locals);
    const spot = spotFrom(await request.formData());
    if (!spot) return fail(422, { problem: 'Pick which photo to remove.' });
    await clearStorePhoto(locals.db, spot);
    return { done: 'Photo removed.' };
  },
  banner: async ({ locals, request }) => {
    ownerOnly(locals);
    const f = await request.formData();
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const banner = { enabled: f.get('enabled') === 'on', headline: text('headline'), text: text('text'), starts_on: text('starts_on') || null, ends_on: text('ends_on') || null };
    const problem = await problemWith(() => changeSettings(locals.db, 'banner', banner));
    return problem ? fail(422, { problem, banner }) : { done: 'Banner saved.' };
  },
  hours: async ({ locals, request }) => {
    ownerOnly(locals);
    const hours = rows(await request.formData(), 'label', 'value');
    const problem = await problemWith(() => changeSettings(locals.db, 'hours', hours));
    return problem ? fail(422, { problem, hours }) : { done: 'Hours saved.' };
  },
  theme: async ({ locals, request }) => {
    ownerOnly(locals);
    const changes = themeChanges(await request.formData());
    const problem = await problemWith(() => changeSettings(locals.db, 'theme', changes));
    return problem ? fail(422, { problem }) : { done: 'Colors saved.' };
  },
  closures: async ({ locals, request }) => {
    ownerOnly(locals);
    const closures = rows(await request.formData(), 'date', 'note');
    const problem = await problemWith(() => changeSettings(locals.db, 'closures', closures));
    return problem ? fail(422, { problem, closures }) : { done: 'Closed days saved.' };
  },
};
