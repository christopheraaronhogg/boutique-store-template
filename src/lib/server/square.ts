import type { StoreEnv } from './mcp/env';
import { findOrderById, markPaid, type Order } from './orders';

export const SQUARE_VERSION = '2025-01-23';

type SquareEnv = Pick<StoreEnv, 'SQUARE_ENVIRONMENT' | 'SQUARE_ACCESS_TOKEN' | 'SQUARE_LOCATION_ID' | 'SQUARE_WEBHOOK_SIGNATURE_KEY'>;

export function squareLive(env: Pick<StoreEnv, 'SQUARE_ENVIRONMENT'>): boolean {
  return env.SQUARE_ENVIRONMENT?.trim().toLowerCase() === 'production';
}

function base(env: SquareEnv): string {
  return squareLive(env) ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

export function squareMissing(env: SquareEnv): string | null {
  const missing = [
    !env.SQUARE_ACCESS_TOKEN?.trim() && 'SQUARE_ACCESS_TOKEN',
    !env.SQUARE_LOCATION_ID?.trim() && 'SQUARE_LOCATION_ID',
    !env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim() && 'SQUARE_WEBHOOK_SIGNATURE_KEY',
  ].filter(Boolean);
  return missing.length ? `Square is not connected yet (missing ${missing.join(', ')}). Add it in Cloudflare: Workers & Pages, the store, Settings, Variables and Secrets (type Secret). See SQUARE.md.` : null;
}

export class SquareError extends Error {}

async function square<T>(env: SquareEnv, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${base(env)}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN?.trim()}`,
      'square-version': SQUARE_VERSION,
      'content-type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { code?: string; detail?: string }[] };
  if (!res.ok || data.errors?.length) {
    const e = data.errors?.[0];
    throw new SquareError(`Square said no (${res.status}${e?.code ? ` ${e.code}` : ''}): ${e?.detail ?? 'no details'}`);
  }
  return data;
}

export async function createPaymentLink(env: SquareEnv, order: Order, returnUrl: string): Promise<{ url: string; orderId: string }> {
  const money = (cents: number) => ({ amount: cents, currency: 'USD' });
  const data = await square<{ payment_link: { url: string; order_id: string } }>(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: `${order.number}-${order.access_key.slice(0, 16)}`,
      order: {
        location_id: env.SQUARE_LOCATION_ID?.trim(),
        reference_id: order.number,
        line_items: order.items.map((i) => ({ name: i.name.slice(0, 500), quantity: String(i.quantity), base_price_money: money(i.unit_price_cents) })),
        metadata: { store_order: order.number },
      },
      checkout_options: { redirect_url: returnUrl, ask_for_shipping_address: false },
      pre_populated_data: { buyer_email: order.email },
      payment_note: `Order ${order.number}`,
    },
  });
  return { url: data.payment_link.url, orderId: data.payment_link.order_id };
}

export async function squarePaidReference(env: SquareEnv, providerOrderId: string, totalCents: number): Promise<string | null> {
  const { order } = await square<{ order: SquareOrder }>(env, `/v2/orders/${encodeURIComponent(providerOrderId)}`);
  const tenders = order.tenders ?? [];
  const paid = tenders.reduce((n, t) => n + (t.amount_money?.amount ?? 0), 0);
  if (!tenders.length || paid < totalCents || (order.net_amount_due_money?.amount ?? 0) > 0) return null;
  return tenders[0].payment_id ?? tenders[0].id;
}

export async function squareReference(env: SquareEnv, providerOrderId: string): Promise<string | null> {
  const { order } = await square<{ order: { reference_id?: string; location_id?: string } }>(env, `/v2/orders/${encodeURIComponent(providerOrderId)}`);
  return order.location_id === env.SQUARE_LOCATION_ID?.trim() ? (order.reference_id ?? null) : null;
}

type SquareOrder = { tenders?: { id: string; payment_id?: string; amount_money?: { amount: number } }[]; net_amount_due_money?: { amount: number } };

export async function verifySquareSignature(signatureKey: string, notificationUrl: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(signatureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(notificationUrl + body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}


type SquareEvent = {
  type?: string;
  data?: {
    object?: {
      payment?: { id: string; status: string; order_id?: string; amount_money?: { amount: number } };
      refund?: { id: string; status: string; order_id?: string; payment_id?: string; amount_money?: { amount: number } };
    };
  };
};

async function orderFor(db: D1Database, providerOrderId?: string, paymentId?: string): Promise<Order | null> {
  const row = await db
    .prepare("SELECT id FROM orders WHERE payment_driver = 'square' AND ((provider_order_id IS NOT NULL AND provider_order_id = ?) OR (payment_reference IS NOT NULL AND payment_reference = ?))")
    .bind(providerOrderId ?? null, paymentId ?? null)
    .first<{ id: number }>();
  return row ? findOrderById(db, row.id) : null;
}

async function orderByNumber(db: D1Database, number: string): Promise<Order | null> {
  const row = await db.prepare("SELECT id FROM orders WHERE payment_driver = 'square' AND number = ?").bind(number).first<{ id: number }>();
  return row ? findOrderById(db, row.id) : null;
}

export type ReferenceOf = (providerOrderId: string) => Promise<string | null>;

export type OnPaid = (order: Order) => Promise<string>;

export async function applySquareEvent(db: D1Database, event: SquareEvent, referenceOf?: ReferenceOf, onPaid?: OnPaid): Promise<string> {
  const payment = event.data?.object?.payment;
  if (event.type?.startsWith('payment.') && payment) {
    if (payment.status !== 'COMPLETED') return `payment ${payment.id} is ${payment.status}`;
    let order = await orderFor(db, payment.order_id);
    if (!order && payment.order_id && referenceOf) {
      const number = await referenceOf(payment.order_id);
      if (number) order = await orderByNumber(db, number);
    }
    if (!order) return `payment ${payment.id} is not for this store`;
    if ((payment.amount_money?.amount ?? 0) < order.total_cents) return `payment ${payment.id} is less than order ${order.number}`;
    if (!(await markPaid(db, order, payment.id))) return `order ${order.number} was already ${order.status}`;
    return onPaid ? `order ${order.number} paid; ${await onPaid(order)}` : `order ${order.number} paid`;
  }
  const refund = event.data?.object?.refund;
  if (event.type?.startsWith('refund.') && refund) {
    if (refund.status !== 'COMPLETED') return `refund ${refund.id} is ${refund.status}`;
    const order = await orderFor(db, refund.order_id, refund.payment_id);
    if (!order) return `refund ${refund.id} is not for this store`;
    const amount = refund.amount_money?.amount ?? 0;
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO payment_refunds (refund_id, order_id, amount_cents) VALUES (?, ?, ?)').bind(refund.id, order.id, amount),
      db.prepare('UPDATE orders SET refunded_cents = (SELECT COALESCE(SUM(amount_cents), 0) FROM payment_refunds WHERE order_id = ?) WHERE id = ?').bind(order.id, order.id),
    ]);
    return `order ${order.number} refund ${refund.id} recorded`;
  }
  return `ignored ${event.type ?? 'unknown event'}`;
}

export async function receiveSquareWebhook(db: D1Database, env: SquareEnv, request: Request, onPaid?: OnPaid): Promise<{ status: number; did: string }> {
  const signatureKey = env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  if (!signatureKey) return { status: 503, did: 'Square is not connected.' };
  const url = new URL(request.url);
  const body = await request.text();
  if (!(await verifySquareSignature(signatureKey, `${url.origin}${url.pathname}`, body, request.headers.get('x-square-hmacsha256-signature')))) return { status: 403, did: 'Bad signature.' };
  let event: SquareEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return { status: 400, did: 'Not JSON.' };
  }
  const referenceOf = env.SQUARE_ACCESS_TOKEN?.trim() ? (id: string) => squareReference(env, id) : undefined;
  try {
    return { status: 200, did: await applySquareEvent(db, event, referenceOf, onPaid) };
  } catch (e) {
    if (e instanceof SquareError || e instanceof TypeError) return { status: 503, did: `Could not ask Square about it yet, Square will send it again: ${e.message}` };
    throw e;
  }
}
