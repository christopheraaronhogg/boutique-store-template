import { error } from '@sveltejs/kit';
import { bySlug, moreLike } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const product = await bySlug(locals.db, params.slug);
  if (!product || product.status !== 'live') error(404, 'That purse isn’t here anymore.');
  return { product, more: await moreLike(locals.db, product), url: url.href };
};
