import { storeToday } from '$lib/dates';
import { justIn, shelf, stylesOnShelf } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const [products, newest, styles] = await Promise.all([shelf(locals.db, locals.settings), justIn(locals.db), stylesOnShelf(locals.db)]);
  const cat = url.searchParams.get('cat') ?? '';
  return { products, newest, styles, cat, today: storeToday() };
};
