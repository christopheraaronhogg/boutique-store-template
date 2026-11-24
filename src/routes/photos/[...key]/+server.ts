import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SAFE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(params.key) || params.key.includes('..')) error(404, 'Not found');
  const object = await platform!.env.PHOTOS.get(params.key);
  if (!object) error(404, 'Not found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!SAFE_TYPES.includes(headers.get('Content-Type') ?? '')) headers.set('Content-Type', 'application/octet-stream');
  return new Response(object.body, { headers });
};
