import type { Settings } from '$lib/settings';
import { money } from '$lib/money';
import type { Order } from './orders';

export type OrderMail = { to: string[]; from: string; subject: string; text: string };
export type Mailer = { send(message: OrderMail): Promise<unknown> };
export type MailEnv = { EMAIL?: unknown; ORDER_EMAIL_FROM?: string; PUBLIC_URL: string };

export function senderAddress(env: Pick<MailEnv, 'ORDER_EMAIL_FROM'>, s?: Settings): string | null {
  return env.ORDER_EMAIL_FROM?.trim() || s?.store.order_email_from?.trim() || null;
}

export function orderEmailsOff(env: MailEnv, s: Settings): string | null {
  if (!isMailer(env.EMAIL)) return 'the store has no email sender (the EMAIL binding in wrangler.jsonc)';
  if (!senderAddress(env, s)) return 'no sending address is set yet (order_email_from); order emails start once the store has its own domain (see SETUP-PASTE.md step 7)';
  if (s.store.notify_emails.length === 0) return 'no email address is set for new orders (notify_emails)';
  return null;
}

export function newOrderEmail(s: Settings, order: Order, origin: string): Omit<OrderMail, 'to' | 'from'> {
  const items = order.items.map((i) => `- ${i.quantity} × ${i.name}: ${money(i.line_total_cents)}`);
  const lines = [
    `${order.customer_name} just paid for order ${order.number}.`,
    order.is_test ? 'This was a TEST order. No money was taken.' : '',
    '',
    ...items,
    `Total: ${money(order.total_cents)}`,
    '',
    `Phone: ${order.phone}`,
    `Email: ${order.email}`,
    order.customer_note ? `Note: ${order.customer_note}` : '',
    '',
    `See it in your store manager: ${origin}/admin`,
  ];
  return {
    subject: `${order.is_test ? 'TEST ' : ''}New order ${order.number} · ${money(order.total_cents)} · ${s.store.name}`,
    text: lines.filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== '')).join('\n'),
  };
}

export async function tellOwnerAboutOrder(env: MailEnv, s: Settings, order: Order): Promise<string> {
  const off = orderEmailsOff(env, s);
  if (off) return `no order email: ${off}`;
  return send(env, s, newOrderEmail(s, order, new URL(env.PUBLIC_URL).origin), `order email for ${order.number}`);
}

export async function sendTestOrderEmail(env: MailEnv, s: Settings): Promise<string> {
  const off = orderEmailsOff(env, s);
  if (off) return `Order emails are off: ${off}.`;
  const sample = { subject: `TEST New order email · ${s.store.name}`, text: `This is a test from your store. New paid orders will arrive like this, from ${senderAddress(env, s)}.\n\nSee your orders: ${new URL(env.PUBLIC_URL).origin}/admin` };
  const did = await send(env, s, sample, 'test order email');
  return did.includes('failed') ? `${did}. Check that Email Routing is on for the domain and that each new-order address is verified there.` : `${did} to ${s.store.notify_emails.join(', ')}. Ask her to check her inbox (and spam).`;
}

async function send(env: MailEnv, s: Settings, mail: Omit<OrderMail, 'to' | 'from'>, what: string): Promise<string> {
  try {
    await (env.EMAIL as Mailer).send({ to: s.store.notify_emails, from: senderAddress(env, s)!, ...mail });
    return `${what} sent`;
  } catch (e) {
    const code = (e as { code?: string }).code;
    return `${what} failed${code ? ` (${code})` : ''}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function isMailer(x: unknown): x is Mailer {
  return typeof (x as Mailer | undefined)?.send === 'function';
}
