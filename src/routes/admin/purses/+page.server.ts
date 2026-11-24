import { fail } from '@sveltejs/kit';
import { tracked, undoFromForm } from '$lib/server/admin/tracked';
import { quickChanges } from '$lib/server/admin/purseForm';
import { changePurse, clearSamples, listPurses, movePurse, OwnerProblem, planMove, purse, purseOrder, type PurseFilter } from '$lib/server/owner/purses';
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

function anId(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const actions: Actions = {
  clearSamples: async ({ locals }) => {
    ownerOnly(locals);
    return { done: `Removed ${await clearSamples(locals.db)} sample purses.` };
  },
  move: async ({ locals, request }) => {
    ownerOnly(locals);
    const form = await request.formData();
    const id = anId(form.get('id'));
    const to = form.get('to') === 'top' ? 'top' : anId(form.get('to'));
    if (id === null || to === null) return fail(422, { problem: 'Pick a purse to move.' });
    try {
      const plan = planMove(await purseOrder(locals.db), id, to);
      const name = (await purse(locals.db, id)).name;
      const { change_id } = await tracked(
        locals.db,
        { purses: [...plan.keys()] },
        () => movePurse(locals.db, plan),
        () => (to === 'top' ? `Moved "${name}" to the front` : `Moved "${name}"`),
      );
      return { done: to === 'top' ? `${name} shows first now.` : `Moved ${name}.`, change_id };
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(409, { problem: e.message });
      throw e;
    }
  },
  quick: async ({ locals, request }) => {
    ownerOnly(locals);
    const form = await request.formData();
    const id = anId(form.get('id'));
    if (id === null) return fail(422, { problem: 'Pick a purse.' });
    try {
      const { changes, said } = quickChanges(form);
      const { result, change_id } = await tracked(
        locals.db,
        { purses: [id] },
        () => changePurse(locals.db, id, changes),
        (p) => `Changed purse "${p.name}" (${Object.keys(changes).join(', ')})`,
      );
      return { done: `${result.name}: ${said}.`, change_id };
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(422, { problem: e.message });
      throw e;
    }
  },
  undo: async ({ locals, request }) => {
    ownerOnly(locals);
    return undoFromForm(locals.db, await request.formData());
  },
};
