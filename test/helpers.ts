import { env } from 'cloudflare:test';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

export const db = (env as unknown as { DB: D1Database }).DB;

export function settings(overrides: Partial<Settings['catalog']> = {}): Settings {
  return { ...DEFAULT_SETTINGS, catalog: { ...DEFAULT_SETTINGS.catalog, ...overrides } };
}

let seq = 0;

export async function makePurse(fields: Partial<{ name: string; price_cents: number; sale_price_cents: number | null; status: string; sold_out: number; position: number; category_id: number | null; photo: string }> = {}): Promise<number> {
  seq++;
  const name = fields.name ?? `Test Purse ${seq}`;
  const row = await db
    .prepare(
      `INSERT INTO products (name, slug, description, price_cents, sale_price_cents, status, sold_out, position, category_id, published_at)
       VALUES (?, ?, 'Soft leather.', ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
    )
    .bind(name, `${name.toLowerCase().replace(/\W+/g, '-')}-${seq}`, fields.price_cents ?? 4800, fields.sale_price_cents ?? null, fields.status ?? 'live', fields.sold_out ?? 0, fields.position ?? seq, fields.category_id ?? null)
    .first<{ id: number }>();
  const id = row!.id;
  await db.prepare('INSERT INTO photos (product_id, key, width, height) VALUES (?, ?, 800, 1000)').bind(id, fields.photo ?? `purses/${id}/a.jpg`).run();
  return id;
}

export const store = env as unknown as import('$lib/server/mcp/env').StoreEnv;

export function jpeg(width: number, height: number): Uint8Array<ArrayBuffer> {
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, ...sof, 0xff, 0xd9]);
}

export function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

export function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64Big(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
