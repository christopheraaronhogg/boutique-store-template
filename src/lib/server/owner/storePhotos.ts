import { loadSettings, saveSection } from '$lib/server/settings';
import type { Picture } from './images';

export const STORE_PHOTO_SPOTS = ['about', 'home'] as const;
export type StorePhotoSpot = (typeof STORE_PHOTO_SPOTS)[number];

async function swap(db: D1Database, spot: StorePhotoSpot, key: string | null): Promise<void> {
  const settings = await loadSettings(db);
  if (spot === 'about') await saveSection(db, 'about', { ...settings.about, photo_key: key });
  else await saveSection(db, 'home', { ...settings.home, hero_photo_key: key });
}

export async function setStorePhoto(db: D1Database, bucket: R2Bucket, spot: StorePhotoSpot, picture: Picture): Promise<string> {
  const key = `store/${spot}/${crypto.randomUUID()}.${picture.ext}`;
  await bucket.put(key, picture.bytes, { httpMetadata: { contentType: picture.mime, cacheControl: 'public, max-age=31536000, immutable' } });
  await swap(db, spot, key);
  return key;
}

export async function clearStorePhoto(db: D1Database, spot: StorePhotoSpot): Promise<void> {
  await swap(db, spot, null);
}
