import { fail, redirect } from '@sveltejs/kit';
import { BAG_COOKIE, bagLines, serializeBag, subtotal } from '$lib/server/bag';
import { cancelUnpaid, createOrder, setPaymentLink, validateCustomer } from '$lib/server/orders';
import { orderUrl, paymentDriver, paymentUrl } from '$lib/server/payments';
import { createPaymentLink, squareLive } from '$lib/server/square';
import { publicOrigin } from '$lib/server/mcp/env';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { lines, notes } = await bagLines(locals.db, locals.bag, locals.settings);
  if (lines.length === 0) redirect(303, '/bag');
  return { lines, notes, subtotal: subtotal(lines) };
};

export const actions: Actions = {
  default: async ({ request, locals, platform, cookies }) => {
    const form = Object.fromEntries(await request.formData());
    const { customer, errors } = validateCustomer(form);
    if (Object.keys(errors).length > 0) return fail(422, { customer, errors });
    const { lines } = await bagLines(locals.db, locals.bag, locals.settings);
    if (lines.length === 0) redirect(303, '/bag');
    const env = platform!.env;
    let driver: ReturnType<typeof paymentDriver>;
    try {
      driver = paymentDriver(env);
    } catch (e) {
      console.error('Checkout is not set up', e instanceof Error ? e.message : e);
      return fail(503, { customer, errors: {} as typeof errors, payProblem: 'Card checkout is being set up right now. Your bag is safe. Please call the store to order, or try again later.' });
    }
    let order = await createOrder(locals.db, locals.settings, lines, customer, driver, driver === 'test' || !squareLive(env));
    if (driver === 'square') {
      try {
        const link = await createPaymentLink(env, order, `${publicOrigin(env)}${orderUrl(order)}`);
        order = await setPaymentLink(locals.db, order, link.orderId, link.url);
      } catch (e) {
        console.error('Square payment link failed', order.number, e instanceof Error ? e.message : e);
        const restored = await cancelUnpaid(locals.db, order, 'Card checkout could not start.');
        if (restored) cookies.set(BAG_COOKIE, serializeBag(restored), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
        return fail(502, { customer, errors: {} as typeof errors, payProblem: 'We couldn’t open the card checkout just now. Your bag is safe. Please try again in a minute, or call the store.' });
      }
    }
    cookies.delete(BAG_COOKIE, { path: '/' });
    redirect(303, paymentUrl(order)!);
  },
};
