import { byIds, type Product } from '$lib/server/catalog';
import { pictureFrom, PhotoProblem, MAX_PHOTOS_PER_CALL, type Picture, type PhotoInput } from './images';

export class OwnerProblem extends Error {}

export type Status = 'draft' | 'live' | 'hidden';
export type StyleChoice = { id: number; name: string; slug: string; group: string | null };

export type NewPurse = {
  name: string;
  price: number;
  description?: string;
  style?: string | null;
  sale_price?: number | null;
  status?: Status;
};

export type PurseChanges = Partial<{
  name: string;
  price: number;
  sale_price: number | null;
  description: string;
  style: string | null;
  status: Status;
  sold: boolean;
  position: number;
}>;

export type PhotoResult = { added: { id: number; key: string; width: number; height: number }[]; problems: string[] };

export function toCents(dollars: number, label: string): number {
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 100_000) throw new OwnerProblem(`${label} should be a dollar amount above 0, like 58 or 44.50.`);
  return Math.round(dollars * 100);
}

export function cleanName(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 120) throw new OwnerProblem('The purse name should be 2 to 120 characters.');
  return n;
}

export function cleanDescription(text: string): string {
  const t = text.trim();
  if (t.length > 4000) throw new OwnerProblem('The description is too long. Keep it under 4,000 characters.');
  return t;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'purse'
  );
}

export async function styles(db: D1Database): Promise<StyleChoice[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.slug, g.name AS "group" FROM categories c LEFT JOIN categories g ON g.id = c.parent_id
       WHERE c.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id) ORDER BY g.sort, c.sort, c.name`,
    )
    .all<StyleChoice>();
  return results;
}

export async function styleId(db: D1Database, style: string | null | undefined): Promise<number | null> {
  if (style === null || style === undefined || style.trim() === '') return null;
  const all = await styles(db);
  const want = style.trim().toLowerCase();
  const plural = (a: string, b: string) => a === b || `${a}s` === b || `${b}s` === a || `${a}es` === b || `${b}es` === a;
  const hit = all.find((s) => s.slug === slugify(want) || plural(s.name.toLowerCase(), want));
  if (!hit) throw new OwnerProblem(`"${style}" is not one of the store's styles. Pick one of: ${all.map((s) => s.name).join(', ')}.`);
  return hit.id;
}

async function uniqueSlug(db: D1Database, name: string, exceptId = 0): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 200; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await db.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?').bind(slug, exceptId).first();
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function purse(db: D1Database, id: number): Promise<Product> {
  const [p] = await byIds(db, [id]);
  if (!p) throw new OwnerProblem(`There is no purse with id ${id}.`);
  return p;
}

export async function createPurse(db: D1Database, input: NewPurse): Promise<Product> {
  const name = cleanName(input.name);
  const price = toCents(input.price, 'The price');
  const sale = input.sale_price === null || input.sale_price === undefined ? null : toCents(input.sale_price, 'The sale price');
  if (sale !== null && sale >= price) throw new OwnerProblem('The sale price should be lower than the regular price.');
  const status: Status = input.status ?? 'live';
  const category = await styleId(db, input.style);
  const slug = await uniqueSlug(db, name);
  const row = await db
    .prepare(
      `INSERT INTO products (category_id, name, slug, description, price_cents, sale_price_cents, status, position, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MIN(position), 1) - 1 FROM products), CASE WHEN ? = 'live' THEN datetime('now') END) RETURNING id`,
    )
    .bind(category, name, slug, cleanDescription(input.description ?? ''), price, sale, status, status)
    .first<{ id: number }>();
  return purse(db, row!.id);
}

export async function changePurse(db: D1Database, id: number, changes: PurseChanges): Promise<Product> {
  const current = await purse(db, id);
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  const set = (col: string, v: string | number | null) => {
    sets.push(`${col} = ?`);
    values.push(v);
  };
  if (changes.name !== undefined) {
    const name = cleanName(changes.name);
    set('name', name);
  }
  const price = changes.price !== undefined ? toCents(changes.price, 'The price') : current.price_cents;
  if (changes.price !== undefined) set('price_cents', price);
  const sale = changes.sale_price === undefined ? current.sale_price_cents : changes.sale_price === null ? null : toCents(changes.sale_price, 'The sale price');
  if (sale !== null && sale >= price) throw new OwnerProblem('The sale price should be lower than the regular price.');
  if (changes.sale_price !== undefined || changes.price !== undefined) set('sale_price_cents', sale);
  if (changes.description !== undefined) set('description', cleanDescription(changes.description));
  if (changes.style !== undefined) set('category_id', await styleId(db, changes.style));
  if (changes.status !== undefined) {
    set('status', changes.status);
    if (changes.status === 'live') sets.push("published_at = COALESCE(published_at, datetime('now'))");
  }
  if (changes.sold !== undefined) set('sold_out', changes.sold ? 1 : 0);
  if (changes.position !== undefined) set('position', Math.trunc(changes.position));
  if (sets.length === 0) return current;
  sets.push("updated_at = datetime('now')", 'is_sample = 0');
  await db
    .prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return purse(db, id);
}

export type PurseFilter = 'all' | 'live' | 'draft' | 'hidden' | 'sold' | 'samples';

export async function listPurses(db: D1Database, filter: PurseFilter = 'all', search = '', limit = 50): Promise<Product[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  if (filter === 'sold') where.push('sold_out = 1');
  else if (filter === 'samples') where.push('is_sample = 1');
  else if (filter !== 'all') {
    where.push('status = ?');
    values.push(filter);
  }
  if (search.trim()) {
    where.push('(name LIKE ? OR description LIKE ?)');
    const like = `%${search.trim().replace(/[%_]/g, '')}%`;
    values.push(like, like);
  }
  const { results } = await db
    .prepare(`SELECT id FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY position, id DESC LIMIT ?`)
    .bind(...values, Math.min(Math.max(limit, 1), 200))
    .all<{ id: number }>();
  const found = await byIds(
    db,
    results.map((r) => r.id),
  );
  const order = new Map(results.map((r, i) => [r.id, i]));
  return found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export async function storePictures(db: D1Database, bucket: R2Bucket, productId: number, pictures: Picture[], asCover = false): Promise<PhotoResult['added']> {
  if (pictures.length === 0) return [];
  const edge = await db
    .prepare('SELECT COALESCE(MIN(sort), 0) AS lo, COALESCE(MAX(sort), 0) AS hi FROM photos WHERE product_id = ?')
    .bind(productId)
    .first<{ lo: number; hi: number }>();
  const added: PhotoResult['added'] = [];
  for (const [i, pic] of pictures.entries()) {
    const key = `purses/${productId}/${crypto.randomUUID()}.${pic.ext}`;
    await bucket.put(key, pic.bytes, { httpMetadata: { contentType: pic.mime, cacheControl: 'public, max-age=31536000, immutable' } });
    const sort = asCover ? edge!.lo - pictures.length + i : edge!.hi + 1 + i;
    const row = await db
      .prepare('INSERT INTO photos (product_id, key, width, height, sort) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(productId, key, pic.width, pic.height, sort)
      .first<{ id: number }>();
    added.push({ id: row!.id, key, width: pic.width, height: pic.height });
  }
  await db.prepare("UPDATE products SET updated_at = datetime('now'), is_sample = 0 WHERE id = ?").bind(productId).run();
  return added;
}

export async function addPhotos(db: D1Database, bucket: R2Bucket, productId: number, inputs: PhotoInput[], asCover = false, fetcher: typeof fetch = fetch): Promise<PhotoResult> {
  await purse(db, productId);
  if (inputs.length > MAX_PHOTOS_PER_CALL) throw new OwnerProblem(`Send up to ${MAX_PHOTOS_PER_CALL} photos at a time.`);
  const pictures: Picture[] = [];
  const problems: string[] = [];
  for (const [i, input] of inputs.entries()) {
    try {
      pictures.push(await pictureFrom(input, fetcher));
    } catch (e) {
      if (!(e instanceof PhotoProblem)) throw e;
      problems.push(`Photo ${i + 1}: ${e.message}`);
    }
  }
  return { added: await storePictures(db, bucket, productId, pictures, asCover), problems };
}

export async function removePhoto(db: D1Database, photoId: number): Promise<{ product_id: number }> {
  const row = await db.prepare('SELECT product_id, key FROM photos WHERE id = ?').bind(photoId).first<{ product_id: number; key: string }>();
  if (!row) throw new OwnerProblem(`There is no photo with id ${photoId}.`);
  await db.prepare('DELETE FROM photos WHERE id = ?').bind(photoId).run();
  return { product_id: row.product_id };
}

export async function coverPhoto(db: D1Database, photoId: number): Promise<void> {
  const row = await db.prepare('SELECT product_id FROM photos WHERE id = ?').bind(photoId).first<{ product_id: number }>();
  if (!row) throw new OwnerProblem(`There is no photo with id ${photoId}.`);
  await db
    .prepare('UPDATE photos SET sort = (SELECT MIN(sort) FROM photos WHERE product_id = ?) - 1 WHERE id = ?')
    .bind(row.product_id, photoId)
    .run();
}

export async function clearSamples(db: D1Database): Promise<number> {
  const { results } = await db.prepare('DELETE FROM products WHERE is_sample = 1 RETURNING id').all<{ id: number }>();
  return results.length;
}

export type Placed = { id: number; pos: number };
export type MoveTo = number | 'top';

export function planMove(ordered: Placed[], id: number, to: MoveTo): Map<number, number> {
  const at = ordered.findIndex((r) => r.id === id);
  if (at < 0) throw new OwnerProblem('That isn’t in this list anymore.');
  const next = ordered.map((r) => r.id);
  if (to === 'top') {
    if (at === 0) return new Map();
    const lowest = Math.min(...ordered.map((r) => r.pos));
    return new Map([[id, lowest - 1]]);
  }
  const other = ordered.findIndex((r) => r.id === to);
  if (other < 0) throw new OwnerProblem('That isn’t in this list anymore.');
  if (other === at) return new Map();
  [next[at], next[other]] = [next[other], next[at]];
  let first = Math.min(at, other);
  let last = Math.max(at, other);
  while (first > 0 && ordered[first - 1].pos >= ordered[first].pos) first--;
  while (last < ordered.length - 1 && ordered[last + 1].pos <= ordered[last].pos) last++;
  const strictly = ordered.slice(first, last + 1).every((r, i, rows) => i === 0 || r.pos > rows[i - 1].pos);
  const changes = new Map<number, number>();
  if (strictly) {
    changes.set(id, ordered[other].pos);
    changes.set(to, ordered[at].pos);
    return changes;
  }
  const size = last - first + 1;
  const below = first > 0 ? ordered[first - 1].pos : null;
  const above = last < ordered.length - 1 ? ordered[last + 1].pos : null;
  let start: number;
  let from = first;
  let upto = last;
  if (below === null) start = (above ?? size + 1) - size;
  else if (above === null || above - below - 1 >= size) start = below + 1;
  else {
    from = 0;
    upto = ordered.length - 1;
    start = 1;
  }
  for (let i = from; i <= upto; i++) {
    const want = start + (i - from);
    if (ordered.find((r) => r.id === next[i])!.pos !== want) changes.set(next[i], want);
  }
  return changes;
}

export async function purseOrder(db: D1Database): Promise<Placed[]> {
  const { results } = await db.prepare('SELECT id, position AS pos FROM products ORDER BY position, id DESC').all<Placed>();
  return results;
}

export async function photoOrder(db: D1Database, productId: number): Promise<Placed[]> {
  const { results } = await db.prepare('SELECT id, sort AS pos FROM photos WHERE product_id = ? ORDER BY sort, id').bind(productId).all<Placed>();
  return results;
}

const PAIRS_PER_STATEMENT = 30;

async function writeOrder(db: D1Database, table: 'products' | 'photos', column: 'position' | 'sort', changes: Map<number, number>): Promise<void> {
  const pairs = [...changes];
  const writes: D1PreparedStatement[] = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_STATEMENT) {
    const chunk = pairs.slice(i, i + PAIRS_PER_STATEMENT);
    writes.push(
      db
        .prepare(`UPDATE ${table} SET ${column} = CASE id ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${chunk.map(() => '?').join(', ')})`)
        .bind(...chunk.flat(), ...chunk.map(([id]) => id)),
    );
  }
  if (writes.length) await db.batch(writes);
}

export async function movePurse(db: D1Database, changes: Map<number, number>): Promise<void> {
  await writeOrder(db, 'products', 'position', changes);
}

export async function movePhoto(db: D1Database, changes: Map<number, number>): Promise<void> {
  await writeOrder(db, 'photos', 'sort', changes);
}
