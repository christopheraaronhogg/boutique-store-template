import { error, fail } from '@sveltejs/kit';
import { asChanges, readFields, readUploads } from '$lib/server/admin/purseForm';
import { tracked, undoFromForm } from '$lib/server/admin/tracked';
import { changePurse, movePhoto, OwnerProblem, photoOrder, planMove, purse, removePhoto, storePictures, styles } from '$lib/server/owner/purses';
import { ownerOnly } from '$lib/server/owner/sessions';
import type { Actions, PageServerLoad } from './$types';

function purseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');
  return id;
}

async function owned(db: D1Database, purseIdValue: number, photoId: number): Promise<boolean> {
  return (await db.prepare('SELECT 1 FROM photos WHERE id = ? AND product_id = ?').bind(photoId, purseIdValue).first()) !== null;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const id = purseId(params.id);
  try {
    const added = Number(url.searchParams.get('added'));
    return { product: await purse(locals.db, id), styles: await styles(locals.db), added: url.searchParams.has('added'), addedChange: Number.isInteger(added) && added > 0 ? added : null };
  } catch (e) {
    if (e instanceof OwnerProblem) error(404, 'That purse isn’t here anymore.');
    throw e;
  }
};

export const actions: Actions = {
  save: async ({ locals, params, request, platform }) => {
    ownerOnly(locals);
    const id = purseId(params.id);
    const form = await request.formData();
    const fields = readFields(form);
    const uploads = await readUploads(form);
    if (uploads.problems.length) return fail(422, { fields, problems: uploads.problems });
    try {
      const { change_id } = await tracked(
        locals.db,
        { purses: [id] },
        async () => {
          await changePurse(locals.db, id, asChanges(fields));
          await storePictures(locals.db, platform!.env.PHOTOS, id, uploads.pictures);
        },
        () => `Changed purse "${fields.name}"${uploads.pictures.length ? ` and added ${uploads.pictures.length} photo${uploads.pictures.length === 1 ? '' : 's'}` : ''}`,
      );
      return { done: 'Saved.', change_id };
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(422, { fields, problems: [e.message] });
      throw e;
    }
  },
  movePhoto: async ({ locals, params, request }) => {
    ownerOnly(locals);
    const id = purseId(params.id);
    const form = await request.formData();
    const photo = Number(form.get('photo_id'));
    const to = Number(form.get('to'));
    if (!(await owned(locals.db, id, photo)) || !(await owned(locals.db, id, to))) return fail(404, { problems: ['That photo isn’t on this purse.'] });
    const { name } = await purse(locals.db, id);
    const plan = planMove(await photoOrder(locals.db, id), photo, to);
    const { change_id } = await tracked(locals.db, { purses: [id] }, () => movePhoto(locals.db, plan), () => `Changed the photo order of "${name}"`);
    return { done: 'Photo moved.', change_id };
  },
  undo: async ({ locals, request }) => {
    ownerOnly(locals);
    return undoFromForm(locals.db, await request.formData());
  },
  removePhoto: async ({ locals, params, request }) => {
    ownerOnly(locals);
    const id = purseId(params.id);
    const photo = Number((await request.formData()).get('photo_id'));
    if (!(await owned(locals.db, id, photo))) return fail(404, { problems: ['That photo isn’t on this purse.'] });
    const { name } = await purse(locals.db, id);
    const { change_id } = await tracked(locals.db, { purses: [id] }, () => removePhoto(locals.db, photo), () => `Removed a photo from "${name}"`);
    return { done: 'Photo removed.', change_id };
  },
};
