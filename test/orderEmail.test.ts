import { describe, expect, it, vi } from 'vitest';
import { bagLines, parseBag } from '$lib/server/bag';
import { createOrder, setPaymentLink } from '$lib/server/orders';
import { newOrderEmail, orderEmailsOff, sendTestOrderEmail, senderAddress, tellOwnerAboutOrder, type OrderMail } from '$lib/server/orderEmail';
import { receiveSquareWebhook } from '$lib/server/square';
import { setupStoreValue } from '$lib/server/owner/settings';
import { db, makePurse, settings } from './helpers';

const shopper = { customer_name: 'Dana Smith', email: 'dana@example.com', phone: '870-555-0100', customer_note: 'Gift wrap please' };
const withEmails = (list: string[], from = '') => {
  const s = settings();
  return { ...s, store: { ...s.store, name: 'Three Times a Lady Boutique', notify_emails: list, order_email_from: from } };
};

async function paidOrder(test = false) {
  const tote = await makePurse({ name: 'Camel Tote', price_cents: 5800 });
  const { lines } = await bagLines(db, parseBag(`${tote}:2`), settings());
  return createOrder(db, settings(), lines, shopper, test ? 'test' : 'square', test);
}

function mailer(fail?: Error & { code?: string }) {
  const sent: OrderMail[] = [];
  return { sent, EMAIL: { send: vi.fn(async (m: OrderMail) => (fail ? Promise.reject(fail) : (sent.push(m), { messageId: 'm1' }))) } };
}

describe('new-order emails to the owner', () => {
  it('sends only from an address she saved, never one guessed from the web address', () => {
    expect(senderAddress({}, withEmails(['pam@example.com']))).toBeNull();
    expect(senderAddress({}, withEmails(['pam@example.com'], ' orders@pamsbags.com '))).toBe('orders@pamsbags.com');
    expect(senderAddress({ ORDER_EMAIL_FROM: 'hello@pam.example' }, withEmails(['pam@example.com'], 'orders@pamsbags.com'))).toBe('hello@pam.example');
  });

  it('uses the saved sending address even when Square calls the workers.dev address', async () => {
    const s = withEmails(['pam@example.com'], 'orders@pamsbags.com');
        const order = await paidOrder();
    const m = mailer();
    expect(await tellOwnerAboutOrder({ EMAIL: m.EMAIL, PUBLIC_URL: 'https://my-shop.someone.workers.dev' }, s, order)).toBe(`order email for ${order.number} sent`);
    expect(m.sent[0].from).toBe('orders@pamsbags.com');
  });

  it('sends a test email on request and says what to fix when it fails', async () => {
    const s = withEmails(['pam@example.com'], 'orders@pamsbags.com');
    const ok = mailer();
    expect(await sendTestOrderEmail({ EMAIL: ok.EMAIL, PUBLIC_URL: 'https://pamsbags.com' }, s)).toContain('sent to pam@example.com');
    expect(ok.sent[0].subject).toMatch(/^TEST/);
    const bad = mailer(Object.assign(new Error('not verified'), { code: 'E_RECIPIENT_NOT_ALLOWED' }));
    expect(await sendTestOrderEmail({ EMAIL: bad.EMAIL, PUBLIC_URL: 'https://pamsbags.com' }, s)).toContain('E_RECIPIENT_NOT_ALLOWED');
    expect(await sendTestOrderEmail({ EMAIL: ok.EMAIL, PUBLIC_URL: 'https://x.workers.dev' }, withEmails(['pam@example.com']))).toContain('Order emails are off');
  });

  it('lets setup save one sending address, or clear it', () => {
    expect(setupStoreValue('order_email_from', ' Orders@PamsBags.com ')).toBe('orders@pamsbags.com');
    expect(setupStoreValue('order_email_from', '')).toBe('');
    expect(() => setupStoreValue('order_email_from', 'orders at pams')).toThrow('one email address');
  });

  it('says plainly why emails are off', () => {
    const { EMAIL } = mailer();
    expect(orderEmailsOff({ PUBLIC_URL: 'https://shop.example' }, withEmails(['pam@example.com']))).toContain('EMAIL binding');
    expect(orderEmailsOff({ EMAIL, PUBLIC_URL: 'https://x.workers.dev' }, withEmails(['pam@example.com']))).toContain('order_email_from');
    expect(orderEmailsOff({ EMAIL, PUBLIC_URL: 'https://shop.example' }, withEmails([], 'orders@shop.example'))).toContain('notify_emails');
    expect(orderEmailsOff({ EMAIL, PUBLIC_URL: 'https://shop.example' }, withEmails(['pam@example.com'], 'orders@shop.example'))).toBeNull();
  });

  it('writes an email with everything she needs to fill the order', async () => {
    const order = await paidOrder();
    const mail = newOrderEmail(withEmails(['pam@example.com']), order, 'https://shop.example');
    expect(mail.subject).toBe(`New order ${order.number} · $116.00 · Three Times a Lady Boutique`);
    expect(mail.text).toContain('Dana Smith just paid');
    expect(mail.text).toContain('- 2 × Camel Tote: $116.00');
    expect(mail.text).toContain('Phone: 870-555-0100');
    expect(mail.text).toContain('Note: Gift wrap please');
    expect(mail.text).toContain('https://shop.example/admin');
    expect(mail.text).not.toMatch(/\n\n\n/);
    const test = newOrderEmail(withEmails(['pam@example.com']), await paidOrder(true), 'https://shop.example');
    expect(test.subject).toMatch(/^TEST New order/);
    expect(test.text).toContain('TEST order');
  });

  it('sends to every notify address and never throws when sending fails', async () => {
    const order = await paidOrder();
    const ok = mailer();
    const s = withEmails(['pam@example.com', 'shop@example.com'], 'orders@shop.example');
    expect(await tellOwnerAboutOrder({ EMAIL: ok.EMAIL, PUBLIC_URL: 'https://shop.example' }, s, order)).toBe(`order email for ${order.number} sent`);
    expect(ok.sent[0]).toMatchObject({ to: ['pam@example.com', 'shop@example.com'], from: 'orders@shop.example' });
    const bad = mailer(Object.assign(new Error('not verified'), { code: 'E_RECIPIENT_NOT_ALLOWED' }));
    expect(await tellOwnerAboutOrder({ EMAIL: bad.EMAIL, PUBLIC_URL: 'https://shop.example' }, s, order)).toBe(`order email for ${order.number} failed (E_RECIPIENT_NOT_ALLOWED): not verified`);
    const off = mailer();
    expect(await tellOwnerAboutOrder({ EMAIL: off.EMAIL, PUBLIC_URL: 'https://x.workers.dev' }, withEmails(['pam@example.com']), order)).toContain('no order email');
    expect(off.EMAIL.send).not.toHaveBeenCalled();
  });

  it('emails once when Square’s webhook marks an order paid, even if Square sends it twice', async () => {
    const order = await setPaymentLink(db, await paidOrder(), 'SQ-MAIL-1', 'https://square.link/u/m');
    const body = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { id: 'PAY-M', status: 'COMPLETED', order_id: 'SQ-MAIL-1', amount_money: { amount: 11600 } } } } });
    const at = 'https://shop.example/square/webhook';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('sig-key'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(at + body)))));
    const onPaid = vi.fn(async () => 'emailed');
    const post = () => receiveSquareWebhook(db, { SQUARE_WEBHOOK_SIGNATURE_KEY: 'sig-key' }, new Request(at, { method: 'POST', body, headers: { 'x-square-hmacsha256-signature': signature } }), onPaid);
    expect((await post()).did).toBe(`order ${order.number} paid; emailed`);
    expect((await post()).did).toBe(`order ${order.number} was already paid`);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });
});
