import { changePurse, purse } from './purses';
import { randomToken, sha256 } from './secrets';

export const UPLOAD_LINK_HOURS = 2;

export type UploadLink = { productId: number; publish: boolean };

export async function makeUploadLink(db: D1Database, origin: string, productId: number, publishOnUpload = false): Promise<{ url: string; expires_at: string }> {
  await purse(db, productId);
  await db.prepare("DELETE FROM photo_upload_links WHERE expires_at < datetime('now')").run();
  const token = randomToken();
  const row = await db
    .prepare(
      `INSERT INTO photo_upload_links (token_hash, product_id, publish_on_upload, expires_at) VALUES (?, ?, ?, datetime('now', '+${UPLOAD_LINK_HOURS} hours')) RETURNING expires_at`,
    )
    .bind(await sha256(token), productId, publishOnUpload ? 1 : 0)
    .first<{ expires_at: string }>();
  return { url: `${origin}/add-photos/${token}`, expires_at: `${row!.expires_at.replace(' ', 'T')}Z` };
}

export async function uploadLink(db: D1Database, token: string): Promise<UploadLink | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const row = await db
    .prepare("SELECT product_id, publish_on_upload FROM photo_upload_links WHERE token_hash = ? AND expires_at > datetime('now')")
    .bind(await sha256(token))
    .first<{ product_id: number; publish_on_upload: number }>();
  return row ? { productId: row.product_id, publish: row.publish_on_upload === 1 } : null;
}

export async function publishOnce(db: D1Database, productId: number): Promise<boolean> {
  const spent = await db.prepare('UPDATE photo_upload_links SET publish_on_upload = 0 WHERE product_id = ? AND publish_on_upload = 1').bind(productId).run();
  if (!spent.meta.changes) return false;
  if ((await purse(db, productId)).status !== 'draft') return false;
  await changePurse(db, productId, { status: 'live' });
  return true;
}
