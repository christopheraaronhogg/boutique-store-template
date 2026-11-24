import { fail } from '@sveltejs/kit';
import { beforeChange, recordChange, undoChange, type Targets } from '$lib/server/owner/history';
import { OwnerProblem } from '$lib/server/owner/purses';

export const ADMIN_TOOL = 'store_manager';

export async function tracked<T>(db: D1Database, targets: Targets, fn: () => Promise<T>, summary: (result: T) => string): Promise<{ result: T; change_id: number | null }> {
  const pending = await beforeChange(db, targets);
  const result = await fn();
  return { result, change_id: await recordChange(db, ADMIN_TOOL, summary(result), pending) };
}

export async function undoFromForm(db: D1Database, form: FormData) {
  const id = Number(form.get('change_id'));
  if (!Number.isInteger(id) || id <= 0) return fail(422, { problem: 'Pick a change to undo.' });
  try {
    const { undid, undo_id } = await undoChange(db, id);
    const done = undid.what.startsWith('Undid: ') ? `Put back: ${undid.what.slice(7)}` : `Undid: ${undid.what}`;
    return { done: `${done}.`, change_id: undo_id, undo_label: 'Redo' };
  } catch (e) {
    if (e instanceof OwnerProblem) return fail(409, { problem: e.message.replace(/ Call recent_changes.*$/, '') });
    throw e;
  }
}
