import type { Settings } from '$lib/settings';
import { byIds, effectivePrice, type Product } from './catalog';

export type Bag = Map<number, number>;

export type BagLine = { product: Product; qty: number; unit: number; line: number; max: number };

export const BAG_COOKIE = 'bag';
const MAX_LINES = 20;
const MADE_TO_ORDER_MAX = 10;

export function parseBag(raw: string | undefined): Bag {
  const bag: Bag = new Map();
  for (const part of (raw ?? '').split(',').slice(0, MAX_LINES)) {
    const m = /^(\d{1,9}):(\d{1,2})$/.exec(part);
    if (m && Number(m[2]) > 0) bag.set(Number(m[1]), Number(m[2]));
  }
  return bag;
}

export function serializeBag(bag: Bag): string {
  return [...bag].map(([id, qty]) => `${id}:${qty}`).join(',');
}

export function bagCount(bag: Bag): number {
  return [...bag.values()].reduce((a, b) => a + Math.min(b, MADE_TO_ORDER_MAX), 0);
}

export function maxQuantity(s: Settings): number {
  return s.catalog.made_to_order ? MADE_TO_ORDER_MAX : 1;
}

export function setQuantity(bag: Bag, productId: number, qty: number, s: Settings): Bag {
  const next = new Map(bag);
  const clamped = Math.min(Math.max(Math.trunc(qty), 0), maxQuantity(s));
  if (clamped === 0) next.delete(productId);
  else if (next.has(productId) || next.size < MAX_LINES) next.set(productId, clamped);
  return next;
}

export async function bagLines(db: D1Database, bag: Bag, s: Settings): Promise<{ lines: BagLine[]; notes: string[]; bag: Bag }> {
  const products = await byIds(db, [...bag.keys()]);
  const lines: BagLine[] = [];
  const notes: string[] = [];
  const kept: Bag = new Map();
  const max = maxQuantity(s);
  for (const [id, qty] of bag) {
    const product = products.find((p) => p.id === id);
    if (!product || product.status !== 'live') {
      notes.push(product ? `${product.name} isn't available anymore, so we took it out of your bag.` : 'Something in your bag isn’t available anymore, so we took it out.');
      continue;
    }
    if (product.sold_out) {
      notes.push(`${product.name} sold, so we took it out of your bag.`);
      continue;
    }
    const q = Math.min(qty, max);
    const unit = effectivePrice(product);
    kept.set(id, q);
    lines.push({ product, qty: q, unit, line: unit * q, max });
  }
  return { lines, notes, bag: kept };
}

export function subtotal(lines: BagLine[]): number {
  return lines.reduce((sum, l) => sum + l.line, 0);
}
