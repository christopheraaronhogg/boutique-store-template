import { fail, redirect } from '@sveltejs/kit';
import { asNew, readFields, readUploads } from '$lib/server/admin/purseForm';
import { createPurse, OwnerProblem, storePictures, styles } from '$lib/server/owner/purses';
import { ownerOnly } from '$lib/server/owner/sessions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({ styles: await styles(locals.db) });

export const actions: Actions = {
  default: async ({ locals, request, platform }) => {
    ownerOnly(locals);
    const form = await request.formData();
    const fields = readFields(form);
    const uploads = await readUploads(form);
    if (uploads.problems.length) return fail(422, { fields, problems: uploads.problems });
    try {
      const created = await createPurse(locals.db, asNew(fields));
      await storePictures(locals.db, platform!.env.PHOTOS, created.id, uploads.pictures);
      redirect(303, `/admin/purses/${created.id}?added=1`);
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(422, { fields, problems: [e.message] });
      throw e;
    }
  },
};
