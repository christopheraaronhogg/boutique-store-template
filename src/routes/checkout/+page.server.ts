import { fail, redirect } from '@sveltejs/kit';
import { BAG_COOKIE, bagLines, subtotal } from '$lib/server/bag';
import { createOrder, validateCustomer } from '$lib/server/orders';
import { paymentDriver, paymentUrl } from '$lib/server/payments';
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
    const driver = paymentDriver(env);
    const order = await createOrder(locals.db, locals.settings, lines, customer, driver, driver === 'test');
    cookies.delete(BAG_COOKIE, { path: '/' });
    redirect(303, paymentUrl(order));
  },
};
