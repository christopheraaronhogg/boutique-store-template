import type { Settings } from '$lib/settings';
export { effectivePriceOf as effectivePrice, isOnSale as onSale } from '$lib/price';

export type Photo = { id: number; key: string; width: number; height: number };

export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  sale_price_cents: number | null;
  status: 'draft' | 'live' | 'hidden';
  sold_out: boolean;
  is_sample: boolean;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  photos: Photo[];
};

type ProductRow = Omit<Product, 'photos' | 'sold_out' | 'is_sample'> & { sold_out: number; is_sample: number };

const SELECT = `SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.sale_price_cents, p.status, p.sold_out, p.is_sample,
  p.category_id, c.name AS category_name, c.slug AS category_slug
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

export async function shelf(db: D1Database, s: Settings, limit = 200): Promise<Product[]> {
  const hideSold = s.catalog.show_sold ? '' : ' AND p.sold_out = 0';
  const { results } = await db
    .prepare(`${SELECT} WHERE p.status = 'live'${hideSold} ORDER BY p.position, p.id DESC LIMIT ?`)
    .bind(limit)
    .all<ProductRow>();
  return withPhotos(db, results);
}

export async function justIn(db: D1Database, limit = 2): Promise<Product[]> {
  const { results } = await db
    .prepare(`${SELECT} WHERE p.status = 'live' AND p.sold_out = 0 ORDER BY p.published_at DESC, p.id DESC LIMIT ?`)
    .bind(limit)
    .all<ProductRow>();
  return withPhotos(db, results);
}

export async function bySlug(db: D1Database, slug: string): Promise<Product | null> {
  const row = await db.prepare(`${SELECT} WHERE p.slug = ?`).bind(slug).first<ProductRow>();
  return row ? (await withPhotos(db, [row]))[0] : null;
}

export async function byIds(db: D1Database, ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(`${SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<ProductRow>();
  return withPhotos(db, results);
}

export async function moreLike(db: D1Database, product: Product, limit = 3): Promise<Product[]> {
  const { results } = await db
    .prepare(`${SELECT} WHERE p.status = 'live' AND p.sold_out = 0 AND p.id != ? ORDER BY (p.category_id IS ?) DESC, p.position LIMIT ?`)
    .bind(product.id, product.category_id, limit)
    .all<ProductRow>();
  return withPhotos(db, results);
}

export type Style = { name: string; slug: string };

export async function stylesOnShelf(db: D1Database): Promise<Style[]> {
  const { results } = await db
    .prepare(
      `SELECT c.name, c.slug FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.status = 'live') ORDER BY c.sort, c.name`,
    )
    .all<Style>();
  return results;
}

async function withPhotos(db: D1Database, rows: ProductRow[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { results } = await db
    .prepare(`SELECT id, product_id, key, width, height FROM photos WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`)
    .bind(...ids)
    .all<Photo & { product_id: number }>();
  return rows.map((r) => ({
    ...r,
    sold_out: r.sold_out === 1,
    is_sample: r.is_sample === 1,
    photos: results.filter((ph) => ph.product_id === r.id).map(({ id, key, width, height }) => ({ id, key, width, height })),
  }));
}
