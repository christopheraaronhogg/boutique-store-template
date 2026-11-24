import { redirect, type Cookies } from '@sveltejs/kit';
import { BAG_COOKIE, bagLines, serializeBag, setQuantity, subtotal, type Bag } from '$lib/server/bag';
import type { Actions, PageServerLoad } from './$types';

function saveBag(cookies: Cookies, bag: Bag): void {
  cookies.set(BAG_COOKIE, serializeBag(bag), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const { lines, notes, bag } = await bagLines(locals.db, locals.bag, locals.settings);
  if (bag.size !== locals.bag.size) saveBag(cookies, bag);
  return { lines, notes, subtotal: subtotal(lines) };
};

export const actions: Actions = {
  add: async ({ request, locals, cookies }) => {
    const id = Number((await request.formData()).get('product_id'));
    if (Number.isInteger(id) && id > 0) {
      saveBag(cookies, setQuantity(locals.bag, id, (locals.bag.get(id) ?? 0) + 1, locals.settings));
    }
    redirect(303, '/bag');
  },
  update: async ({ request, locals, cookies }) => {
    const form = await request.formData();
    const id = Number(form.get('product_id'));
    const qty = Number(form.get('qty'));
    if (Number.isInteger(id) && id > 0 && Number.isFinite(qty)) {
      saveBag(cookies, setQuantity(locals.bag, id, qty, locals.settings));
    }
    redirect(303, '/bag');
  },
};
