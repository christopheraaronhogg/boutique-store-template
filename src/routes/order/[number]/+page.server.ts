import { error } from '@sveltejs/kit';
import { findOrder, markPaid } from '$lib/server/orders';
import { paymentUrl } from '$lib/server/payments';
import { squarePaidReference } from '$lib/server/square';
import { tellOwnerAboutOrder } from '$lib/server/orderEmail';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, platform }) => {
  const key = url.searchParams.get('key');
  let order = key ? await findOrder(locals.db, params.number, key) : null;
  if (!order) error(404, 'We couldn’t find that order.');
  if (order.status === 'pending_payment' && order.payment_driver === 'square' && order.provider_order_id && platform?.env.SQUARE_ACCESS_TOKEN) {
    try {
      const ref = await squarePaidReference(platform.env, order.provider_order_id, order.total_cents);
      if (ref && (await markPaid(locals.db, order, ref))) {
        console.log(await tellOwnerAboutOrder(platform.env, locals.settings, order));
        order = (await findOrder(locals.db, params.number, key!))!;
      }
    } catch (e) {
      console.error('Square check failed', order.number, e instanceof Error ? e.message : e);
    }
  }
  return { order, payUrl: order.status === 'pending_payment' ? paymentUrl(order) : null };
};
