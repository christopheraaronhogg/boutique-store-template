import { error, fail } from '@sveltejs/kit';
import { asChanges, readFields, readUploads } from '$lib/server/admin/purseForm';
import { changePurse, coverPhoto, OwnerProblem, purse, removePhoto, storePictures, styles } from '$lib/server/owner/purses';
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
    return { product: await purse(locals.db, id), styles: await styles(locals.db), added: url.searchParams.has('added') };
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
      await changePurse(locals.db, id, asChanges(fields));
      await storePictures(locals.db, platform!.env.PHOTOS, id, uploads.pictures);
      return { done: 'Saved.' };
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(422, { fields, problems: [e.message] });
      throw e;
    }
  },
  cover: async ({ locals, params, request }) => {
    ownerOnly(locals);
    const id = purseId(params.id);
    const photo = Number((await request.formData()).get('photo_id'));
    if (!(await owned(locals.db, id, photo))) return fail(404, { problems: ['That photo isn’t on this purse.'] });
    await coverPhoto(locals.db, photo);
    return { done: 'That photo shows first now.' };
  },
  removePhoto: async ({ locals, params, request }) => {
    ownerOnly(locals);
    const id = purseId(params.id);
    const photo = Number((await request.formData()).get('photo_id'));
    if (!(await owned(locals.db, id, photo))) return fail(404, { problems: ['That photo isn’t on this purse.'] });
    await removePhoto(locals.db, photo);
    return { done: 'Photo removed.' };
  },
};
