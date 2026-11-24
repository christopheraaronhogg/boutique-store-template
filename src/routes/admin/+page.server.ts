import { fail } from '@sveltejs/kit';
import { moveOrder, ownerOrders, type OrderStatus } from '$lib/server/orders';
import { ownerOnly } from '$lib/server/owner/sessions';
import { publicOrigin } from '$lib/server/mcp/env';
import { CHANGE_GUIDE } from '$lib/server/mcp/tools';
import type { Actions, PageServerLoad } from './$types';

const TABS = ['open', 'pending_payment', 'picked_up', 'cancelled', 'all'] as const;
const MOVES: OrderStatus[] = ['ordered', 'ready', 'picked_up', 'cancelled'];

export const load: PageServerLoad = async ({ locals, url, platform }) => {
  const asked = url.searchParams.get('show');
  const show = (TABS as readonly string[]).includes(asked ?? '') ? (asked as (typeof TABS)[number]) : 'open';
  const muse = { url: `${publicOrigin(platform!.env)}/mcp`, examples: CHANGE_GUIDE.map((g) => g.she_says) };
  return { show, orders: await ownerOrders(locals.db, show, 100), muse };
};

export const actions: Actions = {
  move: async ({ locals, request }) => {
    ownerOnly(locals);
    const form = await request.formData();
    const number = String(form.get('number') ?? '');
    const to = String(form.get('to') ?? '') as OrderStatus;
    if (!MOVES.includes(to)) return fail(422, { problem: 'Pick what happened to the order.' });
    try {
      const order = await moveOrder(locals.db, number, to, '');
      return { done: `${order.number} is now ${to.replace('_', ' ')}.` };
    } catch (e) {
      return fail(409, { problem: (e as Error).message });
    }
  },
};
