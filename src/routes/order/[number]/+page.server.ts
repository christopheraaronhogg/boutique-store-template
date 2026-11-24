import { error } from '@sveltejs/kit';
import { findOrder } from '$lib/server/orders';
import { paymentUrl } from '$lib/server/payments';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const key = url.searchParams.get('key');
  const order = key ? await findOrder(locals.db, params.number, key) : null;
  if (!order) error(404, 'We couldn’t find that order.');
  return { order, payUrl: order.status === 'pending_payment' ? paymentUrl(order) : null };
};
