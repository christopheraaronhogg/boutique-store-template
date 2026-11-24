import { clearSamples, listPurses, type PurseFilter } from '$lib/server/owner/purses';
import { ownerOnly } from '$lib/server/owner/sessions';
import type { Actions, PageServerLoad } from './$types';

const FILTERS: PurseFilter[] = ['all', 'live', 'draft', 'hidden', 'sold', 'samples'];

export const load: PageServerLoad = async ({ locals, url }) => {
  const asked = url.searchParams.get('show') as PurseFilter;
  const show = FILTERS.includes(asked) ? asked : 'all';
  const search = (url.searchParams.get('q') ?? '').slice(0, 80);
  const samples = await locals.db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_sample = 1').first<{ n: number }>();
  return { show, search, purses: await listPurses(locals.db, show, search, 200), samples: samples?.n ?? 0 };
};

export const actions: Actions = {
  clearSamples: async ({ locals }) => {
    ownerOnly(locals);
    return { done: `Removed ${await clearSamples(locals.db)} sample purses.` };
  },
};
