import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, sessionValid } from '$lib/server/owner/sessions';
import { loadSettings } from '$lib/server/settings';
import { BAG_COOKIE, parseBag } from '$lib/server/bag';
import { look } from '$lib/settings';
import { inAdmin, needsOwner } from '$lib/adminArea';

export const handle: Handle = async ({ event, resolve }) => {
  const env = event.platform?.env;
  if (!env) throw new Error('The store needs its Cloudflare bindings (DB, PHOTOS).');
  event.locals.db = env.DB;
  event.locals.owner = false;
  if (event.url.pathname.startsWith('/photos/')) return resolve(event);
  const admin = inAdmin(event.route.id, event.url.pathname);
  if (admin) event.locals.owner = await sessionValid(env.DB, event.cookies.get(SESSION_COOKIE), env.OWNER_PASSWORD);
  if (needsOwner(event.route.id, event.url.pathname) && !event.locals.owner) {
    return new Response(null, { status: 303, headers: { Location: '/admin/sign-in', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  event.locals.settings = await loadSettings(env.DB);
  event.locals.bag = parseBag(event.cookies.get(BAG_COOKIE));
  const theme = look(event.locals.settings);
  const response = await resolve(event, { transformPageChunk: ({ html }) => html.replace('%store.look%', theme) });
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (admin) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Robots-Tag', 'noindex');
  }
  return response;
};
