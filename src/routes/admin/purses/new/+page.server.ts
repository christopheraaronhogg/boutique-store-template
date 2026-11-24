import { fail, redirect } from '@sveltejs/kit';
import { asNew, readFields, readUploads } from '$lib/server/admin/purseForm';
import { ADMIN_TOOL } from '$lib/server/admin/tracked';
import { addedPurse, beforeChange, recordChange } from '$lib/server/owner/history';
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
    let goTo: string;
    try {
      const pending = await beforeChange(locals.db, {});
      const created = await createPurse(locals.db, asNew(fields));
      addedPurse(pending, created.id);
      await storePictures(locals.db, platform!.env.PHOTOS, created.id, uploads.pictures);
      const change = await recordChange(locals.db, ADMIN_TOOL, `Added purse "${created.name}"`, pending);
      goTo = `/admin/purses/${created.id}?added=${change ?? 0}`;
    } catch (e) {
      if (e instanceof OwnerProblem) return fail(422, { fields, problems: [e.message] });
      throw e;
    }
    redirect(303, goTo);
  },
};
