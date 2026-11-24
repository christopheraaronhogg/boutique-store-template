import { afterEach, describe, expect, it, vi } from 'vitest';
import { bagLines, parseBag } from '$lib/server/bag';
import { createOrder, findOrder, setPaymentLink } from '$lib/server/orders';
import { paymentDriver, paymentUrl, realPaymentsOn, testPaymentsOn } from '$lib/server/payments';
import { applySquareEvent, createPaymentLink, receiveSquareWebhook, squarePaidReference, squareReference, verifySquareSignature } from '$lib/server/square';
import { db, makePurse, settings, store } from './helpers';

const shopper = { customer_name: 'Dana Smith', email: 'dana@example.com', phone: '870-555-0100', customer_note: '' };
const sq = { ...store, PAYMENT_DRIVER: '', SQUARE_ACCESS_TOKEN: 'sandbox-token-0123456789', SQUARE_LOCATION_ID: 'LOC1', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sig-key', SQUARE_ENVIRONMENT: 'sandbox' };

async function squareOrder(price = 5800, qty = 2) {
  const tote = await makePurse({ name: 'Camel Tote', price_cents: price });
  const { lines } = await bagLines(db, parseBag(`${tote}:${qty}`), settings());
  return createOrder(db, settings(), lines, shopper, 'square', true);
}

async function sign(key: string, url: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(url + body)))));
}

afterEach(() => vi.restoreAllMocks());

describe('Square payments', () => {
  it('turns on by itself once the Square keys are added in the dashboard, and only when all are there', () => {
    expect(paymentDriver({ ...store, PAYMENT_DRIVER: '' })).toBe('test');
    expect(paymentDriver(sq)).toBe('square');
    expect(paymentDriver({ ...sq, PAYMENT_DRIVER: 'test' })).toBe('test');
    expect(() => paymentDriver({ ...sq, SQUARE_LOCATION_ID: undefined })).toThrow('Variables and Secrets');
    expect(() => paymentDriver({ ...sq, SQUARE_WEBHOOK_SIGNATURE_KEY: undefined })).toThrow('missing SQUARE_WEBHOOK_SIGNATURE_KEY');
    expect(() => paymentDriver({ ...store, PAYMENT_DRIVER: 'stripe' })).toThrow('not set up yet');
  });

  it('keeps the test banner until Square is live', () => {
    expect(testPaymentsOn({ ...store, PAYMENT_DRIVER: '' })).toBe(true);
    expect(testPaymentsOn(sq)).toBe(false);
    expect(realPaymentsOn(sq)).toBe(false);
    expect(realPaymentsOn({ ...sq, SQUARE_ENVIRONMENT: 'production' })).toBe(true);
    expect(realPaymentsOn({ ...store, PAYMENT_DRIVER: '', SQUARE_ENVIRONMENT: 'production' })).toBe(false);
    expect(realPaymentsOn({ ...sq, SQUARE_ENVIRONMENT: 'production', SQUARE_WEBHOOK_SIGNATURE_KEY: undefined })).toBe(false);
  });

  it('forgives pasted spaces and capitals in the Square settings', async () => {
    expect(realPaymentsOn({ ...sq, SQUARE_ENVIRONMENT: ' Production\n' })).toBe(true);
    expect(paymentDriver({ ...sq, SQUARE_ACCESS_TOKEN: '  ' })).toBe('test');
    const order = await squareOrder();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ payment_link: { url: 'u', order_id: 'o' } }));
    await createPaymentLink({ ...sq, SQUARE_ACCESS_TOKEN: 'tok-123\n', SQUARE_LOCATION_ID: ' LOC1 ' }, order, 'https://shop.example/r');
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
    expect(JSON.parse(String(init.body)).order.location_id).toBe('LOC1');
  });

  it('finds the order by its number when Square pays under a different Square order', async () => {
    const order = await setPaymentLink(db, await squareOrder(), 'SQ-LINK-1', 'https://square.link/u/l');
    const paid = { type: 'payment.updated', data: { object: { payment: { id: 'PAY-X', status: 'COMPLETED', order_id: 'SQ-OTHER-1', amount_money: { amount: 11600 } } } } };
    expect(await applySquareEvent(db, paid)).toContain('not for this store');
    const asked: string[] = [];
    expect(await applySquareEvent(db, paid, async (id) => (asked.push(id), order.number))).toBe(`order ${order.number} paid`);
    expect(asked).toEqual(['SQ-OTHER-1']);
    const stranger = { ...paid, data: { object: { payment: { ...paid.data.object.payment, id: 'PAY-Y', order_id: 'SQ-OTHER-2' } } } };
    expect(await applySquareEvent(db, stranger, async () => 'NOT-OURS-1')).toContain('not for this store');
    await expect(applySquareEvent(db, stranger, async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
  });

  it('trusts an order number from Square only for this store’s own location, and asks Square to retry when it can’t check', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    fetch.mockResolvedValueOnce(Response.json({ order: { reference_id: 'SHOP-1', location_id: 'OTHER-LOC' } }));
    expect(await squareReference(sq, 'SQ-9')).toBeNull();
    fetch.mockResolvedValueOnce(Response.json({ order: { reference_id: 'SHOP-1', location_id: 'LOC1' } }));
    expect(await squareReference(sq, 'SQ-9')).toBe('SHOP-1');
    const body = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { id: 'PAY-Z', status: 'COMPLETED', order_id: 'SQ-UNKNOWN', amount_money: { amount: 100 } } } } });
    const at = 'https://shop.example/square/webhook';
    fetch.mockResolvedValueOnce(new Response('busy', { status: 503 }));
    const res = await receiveSquareWebhook(db, sq, new Request(at, { method: 'POST', body, headers: { 'x-square-hmacsha256-signature': await sign('sig-key', at, body) } }));
    expect(res.status).toBe(503);
  });

  it('checks a webhook against the address Square called, whatever the store address is', async () => {
    const order = await setPaymentLink(db, await squareOrder(), 'SQ-HOOK-1', 'https://square.link/u/h');
    const body = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { id: 'PAY-H', status: 'COMPLETED', order_id: 'SQ-HOOK-1', amount_money: { amount: 11600 } } } } });
    const at = 'https://my-shop.someone.workers.dev/square/webhook';
    const post = async (key: string | undefined, signedFor: string, sent = body) =>
      receiveSquareWebhook(db, { ...sq, SQUARE_WEBHOOK_SIGNATURE_KEY: key }, new Request(at, { method: 'POST', body: sent, headers: { 'x-square-hmacsha256-signature': await sign('sig-key', signedFor, body) } }));
    expect((await post(undefined, at)).status).toBe(503);
    expect((await post('sig-key', 'https://shop.example/square/webhook')).status).toBe(403);
    expect((await post('sig-key', at, body + ' ')).status).toBe(403);
    expect(await post('sig-key', at)).toEqual({ status: 200, did: `order ${order.number} paid` });
  });

  it('makes an itemized Square payment link in the sandbox and remembers it', async () => {
    const order = await squareOrder();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ payment_link: { url: 'https://square.link/u/abc', order_id: 'SQ-ORDER-1' } }));
    const link = await createPaymentLink(sq, order, 'https://shop.example/order/x');
    expect(link).toEqual({ url: 'https://square.link/u/abc', orderId: 'SQ-ORDER-1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sandbox-token-0123456789');
    const body = JSON.parse(String(init.body));
    expect(body.order.location_id).toBe('LOC1');
    expect(body.order.reference_id).toBe(order.number);
    expect(body.order.line_items).toEqual([{ name: 'Camel Tote', quantity: '2', base_price_money: { amount: 5800, currency: 'USD' } }]);
    expect(body.checkout_options.redirect_url).toBe('https://shop.example/order/x');
    const saved = await setPaymentLink(db, order, link.orderId, link.url);
    expect(paymentUrl(saved)).toBe('https://square.link/u/abc');
  });

  it('uses the live Square address only in production', async () => {
    const order = await squareOrder();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ payment_link: { url: 'u', order_id: 'o' } }));
    await createPaymentLink({ ...sq, SQUARE_ENVIRONMENT: 'production' }, order, 'https://shop.example/r');
    expect(String(fetch.mock.calls[0][0])).toMatch(/^https:\/\/connect\.squareup\.com\//);
  });

  it('passes Square’s own error on in plain words', async () => {
    const order = await squareOrder();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ errors: [{ code: 'UNAUTHORIZED', detail: 'This request could not be authorized.' }] }, { status: 401 }));
    await expect(createPaymentLink(sq, order, 'https://shop.example/r')).rejects.toThrow('Square said no (401 UNAUTHORIZED): This request could not be authorized.');
  });

  it('believes only webhooks signed with the store’s key', async () => {
    const url = 'https://shop.example/square/webhook';
    const body = '{"type":"payment.updated"}';
    const good = await sign('sig-key', url, body);
    expect(await verifySquareSignature('sig-key', url, body, good)).toBe(true);
    expect(await verifySquareSignature('sig-key', url, body + ' ', good)).toBe(false);
    expect(await verifySquareSignature('other', url, body, good)).toBe(false);
    expect(await verifySquareSignature('sig-key', `${url}/`, body, good)).toBe(false);
    expect(await verifySquareSignature('sig-key', url, body, null)).toBe(false);
  });

  it('marks the order paid once when Square says the payment completed', async () => {
    const order = await setPaymentLink(db, await squareOrder(), 'SQ-PAID-1', 'https://square.link/u/p');
    const event = (status: string, amount = 11600) => ({ type: 'payment.updated', data: { object: { payment: { id: 'PAY1', status, order_id: 'SQ-PAID-1', amount_money: { amount } } } } });
    expect(await applySquareEvent(db, event('APPROVED'))).toBe('payment PAY1 is APPROVED');
    expect(await applySquareEvent(db, event('COMPLETED', 100))).toContain('less than');
    expect(await applySquareEvent(db, event('COMPLETED'))).toBe(`order ${order.number} paid`);
    expect(await applySquareEvent(db, event('COMPLETED'))).toBe(`order ${order.number} was already paid`);
    const after = await findOrder(db, order.number, order.access_key);
    expect(after?.status).toBe('paid');
    expect(after?.payment_reference).toBe('PAY1');
    expect(await applySquareEvent(db, { type: 'payment.updated', data: { object: { payment: { id: 'X', status: 'COMPLETED', order_id: 'SOMEONE-ELSE' } } } })).toContain('not for this store');
  });

  it('records refunds made in Square once each', async () => {
    const order = await setPaymentLink(db, await squareOrder(), 'SQ-REF-1', 'https://square.link/u/r');
    await applySquareEvent(db, { type: 'payment.updated', data: { object: { payment: { id: 'PAY-R', status: 'COMPLETED', order_id: 'SQ-REF-1', amount_money: { amount: 11600 } } } } });
    const refund = (id: string, amount: number, status = 'COMPLETED') => ({ type: 'refund.updated', data: { object: { refund: { id, status, payment_id: 'PAY-R', amount_money: { amount } } } } });
    await applySquareEvent(db, refund('R1', 5800, 'PENDING'));
    expect((await findOrder(db, order.number, order.access_key))?.refunded_cents).toBe(0);
    await applySquareEvent(db, refund('R1', 5800));
    await applySquareEvent(db, refund('R1', 5800));
    expect((await findOrder(db, order.number, order.access_key))?.refunded_cents).toBe(5800);
    await applySquareEvent(db, refund('R2', 1000));
    expect((await findOrder(db, order.number, order.access_key))?.refunded_cents).toBe(6800);
  });

  it('asks Square directly when the shopper comes back before the webhook', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ order: { tenders: [], net_amount_due_money: { amount: 11600 } } }))
      .mockResolvedValueOnce(Response.json({ order: { tenders: [{ id: 'T1', payment_id: 'PAY9', amount_money: { amount: 11600 } }], net_amount_due_money: { amount: 0 } } }));
    expect(await squarePaidReference(sq, 'SQ-1', 11600)).toBeNull();
    expect(await squarePaidReference(sq, 'SQ-1', 11600)).toBe('PAY9');
  });
});
