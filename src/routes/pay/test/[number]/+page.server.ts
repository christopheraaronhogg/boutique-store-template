import { error, redirect } from '@sveltejs/kit';
import { BAG_COOKIE, serializeBag } from '$lib/server/bag';
import { cancelUnpaid, findOrder, markPaid } from '$lib/server/orders';
import { orderUrl, testPaymentsOn } from '$lib/server/payments';
import { tellOwnerAboutOrder } from '$lib/server/orderEmail';
import type { Actions, PageServerLoad } from './$types';

async function openOrder(db: D1Database, number: string, key: string | null, env: App.Platform['env'] | undefined) {
  const order = key && testPaymentsOn(env) ? await findOrder(db, number, key) : null;
  if (!order || order.payment_driver !== 'test') error(404, 'We couldn’t find that checkout.');
  return order;
}

export const load: PageServerLoad = async ({ locals, params, url, platform }) => {
  const order = await openOrder(locals.db, params.number, url.searchParams.get('key'), platform?.env);
  if (order.status !== 'pending_payment') redirect(303, orderUrl(order));
  return { order };
};

export const actions: Actions = {
  pay: async ({ locals, params, request, platform }) => {
    const order = await openOrder(locals.db, params.number, String((await request.formData()).get('key') ?? ''), platform?.env);
    if (await markPaid(locals.db, order, `test-${crypto.randomUUID()}`)) console.log(await tellOwnerAboutOrder(platform!.env, locals.settings, order));
    redirect(303, orderUrl(order));
  },
  cancel: async ({ locals, params, request, cookies, platform }) => {
    const order = await openOrder(locals.db, params.number, String((await request.formData()).get('key') ?? ''), platform?.env);
    const restored = await cancelUnpaid(locals.db, order, 'The checkout was not finished.');
    if (restored) cookies.set(BAG_COOKIE, serializeBag(restored), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
    redirect(303, '/bag');
  },
};
