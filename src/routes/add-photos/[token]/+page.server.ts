import { error, fail } from '@sveltejs/kit';
import { MAX_PHOTOS_PER_CALL, PhotoProblem, readPicture, type Picture } from '$lib/server/owner/images';
import { purse, storePictures } from '$lib/server/owner/purses';
import { beforeChange, recordChange } from '$lib/server/owner/history';
import { publishOnce, uploadLink, type UploadLink } from '$lib/server/owner/uploads';
import type { Actions, PageServerLoad } from './$types';

async function linked(db: D1Database, token: string): Promise<UploadLink> {
  const link = await uploadLink(db, token);
  if (!link) error(404, 'This photo link has expired. Ask your assistant for a new one.');
  return link;
}

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  const link = await linked(locals.db, params.token);
  return { product: await purse(locals.db, link.productId), publish: link.publish };
};

export const actions: Actions = {
  default: async ({ locals, params, request, platform }) => {
    const link = await linked(locals.db, params.token);
    const form = await request.formData().catch(() => null);
    const files = (form?.getAll('photos') ?? []).filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return fail(422, { problems: ['Pick at least one photo.'], added: 0 });
    if (files.length > MAX_PHOTOS_PER_CALL) return fail(422, { problems: [`Pick up to ${MAX_PHOTOS_PER_CALL} photos at a time.`], added: 0 });
    const pictures: Picture[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        pictures.push(readPicture(new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        if (!(e instanceof PhotoProblem)) throw e;
        problems.push(`${file.name || 'A photo'}: ${e.message}`);
      }
    }
    const pending = await beforeChange(locals.db, { purses: [link.productId] });
    const added = await storePictures(locals.db, platform!.env.PHOTOS, link.productId, pictures);
    if (added.length > 0 && link.publish) await publishOnce(locals.db, link.productId);
    if (added.length > 0) {
      const name = (await purse(locals.db, link.productId)).name;
      await recordChange(locals.db, 'photo_upload_link', `Added ${added.length} photo${added.length === 1 ? '' : 's'} to "${name}" from the phone link`, pending);
    }
    return { problems, added: added.length };
  },
};
