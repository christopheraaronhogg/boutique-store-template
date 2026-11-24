import type { Settings } from '$lib/settings';
import { subtotal, type BagLine } from './bag';

import { nextStatuses, type OrderStatus } from '$lib/orderStatus';
export { nextStatuses, type OrderStatus };

export type Order = {
  id: number;
  number: string;
  access_key: string;
  status: OrderStatus;
  customer_name: string;
  email: string;
  phone: string;
  customer_note: string;
  subtotal_cents: number;
  total_cents: number;
  payment_driver: string;
  is_test: boolean;
  created_at: string;
  paid_at: string | null;
  cancel_reason: string | null;
  payment_reference: string | null;
  provider_order_id: string | null;
  provider_pay_url: string | null;
  refunded_cents: number;
  items: OrderItem[];
};

export type OrderItem = { name: string; photo_key: string | null; unit_price_cents: number; quantity: number; line_total_cents: number };

export type Customer = { customer_name: string; email: string; phone: string; customer_note: string };

export type CustomerErrors = Partial<Record<keyof Customer, string>>;

export function validateCustomer(form: Record<string, unknown>): { customer: Customer; errors: CustomerErrors } {
  const text = (k: string, max: number) => String(form[k] ?? '').trim().slice(0, max);
  const customer: Customer = {
    customer_name: text('customer_name', 80),
    email: text('email', 254).toLowerCase(),
    phone: text('phone', 40),
    customer_note: text('customer_note', 1000),
  };
  const errors: CustomerErrors = {};
  if (customer.customer_name.length < 2) errors.customer_name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) errors.email = 'Please enter an email address like name@example.com.';
  const digits = customer.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a phone number we can call.';
  return { customer, errors };
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createOrder(db: D1Database, s: Settings, lines: BagLine[], customer: Customer, driver: string, isTest: boolean): Promise<Order> {
  if (lines.length === 0) throw new Error('The bag is empty.');
  const total = subtotal(lines);
  const accessKey = randomKey();
  const created = await db
    .prepare(
      `INSERT INTO orders (access_key, customer_name, email, phone, customer_note, subtotal_cents, total_cents, payment_driver, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(accessKey, customer.customer_name, customer.email, customer.phone, customer.customer_note, total, total, driver, isTest ? 1 : 0)
    .first<{ id: number }>();
  if (!created) throw new Error('The order could not be saved.');
  const number = `${s.store.order_prefix}${1000 + created.id}`;
  await db.batch([
    db.prepare('UPDATE orders SET number = ? WHERE id = ?').bind(number, created.id),
    ...lines.map((l) =>
      db
        .prepare('INSERT INTO order_items (order_id, product_id, name, photo_key, unit_price_cents, quantity, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(created.id, l.product.id, l.product.name, l.product.photos[0]?.key ?? null, l.unit, l.qty, l.line),
    ),
  ]);
  const order = await findOrder(db, number, accessKey);
  if (!order) throw new Error('The order could not be read back.');
  return order;
}

export async function findOrder(db: D1Database, number: string, accessKey: string): Promise<Order | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE number = ?').bind(number).first<OrderRow>();
  if (!row || !timingSafeEqual(row.access_key, accessKey)) return null;
  return withItems(db, row);
}

export async function findOrderById(db: D1Database, id: number): Promise<Order | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return row ? withItems(db, row) : null;
}

type OrderRow = Omit<Order, 'items' | 'is_test'> & { is_test: number };

async function withItems(db: D1Database, row: OrderRow): Promise<Order> {
  const { results } = await db
    .prepare('SELECT name, photo_key, unit_price_cents, quantity, line_total_cents FROM order_items WHERE order_id = ? ORDER BY id')
    .bind(row.id)
    .all<OrderItem>();
  return { ...row, is_test: row.is_test === 1, items: results };
}

export async function setPaymentLink(db: D1Database, order: Order, providerOrderId: string, payUrl: string): Promise<Order> {
  await db.prepare('UPDATE orders SET provider_order_id = ?, provider_pay_url = ? WHERE id = ?').bind(providerOrderId, payUrl, order.id).run();
  return { ...order, provider_order_id: providerOrderId, provider_pay_url: payUrl };
}

export async function markPaid(db: D1Database, order: Order, reference: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now'), payment_reference = ? WHERE id = ? AND status = 'pending_payment'")
    .bind(reference, order.id)
    .run();
  return res.meta.changes === 1;
}

export async function cancelUnpaid(db: D1Database, order: Order, reason: string): Promise<Map<number, number> | null> {
  const res = await db
    .prepare("UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ? WHERE id = ? AND status = 'pending_payment'")
    .bind(reason, order.id)
    .run();
  if (res.meta.changes !== 1) return null;
  const { results } = await db
    .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL')
    .bind(order.id)
    .all<{ product_id: number; quantity: number }>();
  return new Map(results.map((r) => [r.product_id, r.quantity]));
}

export function isPaid(o: Pick<Order, 'status'>): boolean {
  return o.status !== 'pending_payment' && o.status !== 'cancelled';
}

export function shopperStatus(o: Pick<Order, 'status'>): string {
  return {
    pending_payment: 'Waiting for payment',
    paid: 'Paid. We’re ordering it for you.',
    ordered: 'Ordered. We’ll email you when it’s in.',
    ready: 'Ready for pickup',
    picked_up: 'Picked up',
    cancelled: 'Cancelled',
  }[o.status];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type OwnerOrderFilter = 'open' | 'all' | OrderStatus;


const STAMP: Partial<Record<OrderStatus, string>> = { ordered: 'ordered_at', ready: 'ready_at', picked_up: 'picked_up_at', cancelled: 'cancelled_at' };


export async function ownerOrders(db: D1Database, filter: OwnerOrderFilter = 'open', limit = 50): Promise<Order[]> {
  const where =
    filter === 'open' ? "WHERE status IN ('paid', 'ordered', 'ready')" : filter === 'all' ? '' : 'WHERE status = ?';
  const stmt = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ?`);
  const bound = filter === 'open' || filter === 'all' ? stmt.bind(Math.min(Math.max(limit, 1), 200)) : stmt.bind(filter, Math.min(Math.max(limit, 1), 200));
  const { results } = await bound.all<Omit<Order, 'items' | 'is_test'> & { is_test: number }>();
  if (results.length === 0) return [];
  const { results: items } = await db
    .prepare(`SELECT order_id, name, photo_key, unit_price_cents, quantity, line_total_cents FROM order_items WHERE order_id IN (${results.map(() => '?').join(',')}) ORDER BY id`)
    .bind(...results.map((r) => r.id))
    .all<OrderItem & { order_id: number }>();
  return results.map((r) => ({
    ...r,
    is_test: r.is_test === 1,
    items: items.filter((i) => i.order_id === r.id).map(({ order_id: _, ...i }) => i),
  }));
}

export async function ownerOrder(db: D1Database, number: string): Promise<Order | null> {
  const row = await db.prepare('SELECT number, access_key FROM orders WHERE number = ?').bind(number.trim().toUpperCase()).first<{ number: string; access_key: string }>();
  return row ? findOrder(db, row.number, row.access_key) : null;
}

export async function moveOrder(db: D1Database, number: string, to: OrderStatus, reason = ''): Promise<Order> {
  const order = await ownerOrder(db, number);
  if (!order) throw new Error(`There is no order ${number}.`);
  if (!nextStatuses(order.status).includes(to)) {
    const allowed = nextStatuses(order.status);
    throw new Error(`Order ${order.number} is ${order.status.replace('_', ' ')}${allowed.length ? `; it can move to ${allowed.map((s) => s.replace('_', ' ')).join(' or ')}` : ' and cannot change anymore'}.`);
  }
  const stamp = STAMP[to];
  const res = await db
    .prepare(`UPDATE orders SET status = ?${stamp ? `, ${stamp} = datetime('now')` : ''}${to === 'cancelled' ? ', cancel_reason = ?' : ''} WHERE id = ? AND status = ?`)
    .bind(...(to === 'cancelled' ? [to, reason.trim().slice(0, 300) || 'Cancelled by the store.', order.id, order.status] : [to, order.id, order.status]))
    .run();
  if (res.meta.changes !== 1) throw new Error(`Order ${order.number} changed while saving. Please try again.`);
  return (await ownerOrder(db, order.number))!;
}
