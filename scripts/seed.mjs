#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const where = process.argv.includes('--remote') ? '--remote' : '--local';
const withSamples = !process.argv.includes('--no-samples');
const brandAt = process.argv.indexOf('--brand');
const brandName = brandAt > -1 ? process.argv[brandAt + 1] : 'starter';
if (!/^[a-z0-9-]+$/.test(brandName ?? '')) throw new Error('--brand takes a file name from src/lib/brand, like three-times-a-lady.');
const brand = JSON.parse(readFileSync(join(root, 'src/lib/brand', `${brandName}.json`), 'utf8'));
const bucket = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8')).r2_buckets[0].bucket_name;

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return { width: 0, height: 0 };
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

const settings = { ...brand.settings };
if (!withSamples) {
  settings.banner = { ...settings.banner, enabled: false, is_sample: false };
  settings.home = { ...settings.home, hero_photo_key: null, shop_note: '' };
}

const sql = [];
for (const [key, value] of Object.entries(settings)) {
  sql.push(`INSERT INTO settings (key, value) VALUES (${q(key)}, ${q(JSON.stringify(value))}) ON CONFLICT(key) DO NOTHING;`);
}
let catId = 0;
const styleIds = {};
for (const group of brand.categories) {
  const groupId = ++catId;
  sql.push(
    `INSERT OR IGNORE INTO categories (id, name, slug, sort, icon, noun_one, noun_many) VALUES (${groupId}, ${q(group.name)}, ${q(slugify(group.name))}, ${groupId}, ${q(group.icon)}, ${q(group.one)}, ${q(group.many)});`,
  );
  group.styles.forEach((style, i) => {
    const id = ++catId;
    styleIds[slugify(style)] = id;
    sql.push(`INSERT OR IGNORE INTO categories (id, parent_id, name, slug, sort) VALUES (${id}, ${groupId}, ${q(style)}, ${q(slugify(style))}, ${i + 1});`);
  });
}

const uploads = [];
if (withSamples) {
  brand.samples.forEach((s, i) => {
    const id = i + 1;
    const file = join(root, 'samples', s.file);
    const { width, height } = jpegSize(readFileSync(file));
    const key = `samples/${s.file}`;
    uploads.push({ key, file });
    sql.push(
      `INSERT OR IGNORE INTO products (id, category_id, name, slug, description, price_cents, sale_price_cents, status, sold_out, is_sample, position, published_at)
       VALUES (${id}, ${q(styleIds[s.style] ?? null)}, ${q(s.name)}, ${q(slugify(s.name))}, ${q(s.description)}, ${s.price_cents}, ${q(s.sale_price_cents)}, 'live', ${s.sold_out ? 1 : 0}, 1, ${id}, datetime('now', '-${i} hours'));`,
    );
    sql.push(
      `INSERT OR IGNORE INTO photos (product_id, key, width, height, sort) SELECT ${id}, ${q(key)}, ${width}, ${height}, 0 WHERE EXISTS (SELECT 1 FROM products WHERE id = ${id} AND is_sample = 1 AND slug = ${q(slugify(s.name))});`,
    );
  });
}

const dir = mkdtempSync(join(tmpdir(), 'ttl-seed-'));
const sqlFile = join(dir, 'seed.sql');
writeFileSync(sqlFile, sql.join('\n') + '\n');
const wrangler = join(root, 'node_modules/.bin/wrangler');
execFileSync(wrangler, ['d1', 'execute', 'DB', where, '--file', sqlFile], { cwd: root, stdio: 'inherit' });
for (const u of uploads) {
  execFileSync(wrangler, ['r2', 'object', 'put', `${bucket}/${u.key}`, '--file', u.file, '--content-type', 'image/jpeg', where], { cwd: root, stdio: 'inherit' });
}
console.log(`Seeded ${withSamples ? brand.samples.length : 0} sample purses (${where}).`);
