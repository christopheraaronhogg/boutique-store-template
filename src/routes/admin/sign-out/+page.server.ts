import { redirect } from '@sveltejs/kit';
import { endSession, SESSION_COOKIE } from '$lib/server/owner/sessions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/admin');

export const actions: Actions = {
  default: async ({ locals, cookies }) => {
    await endSession(locals.db, cookies.get(SESSION_COOKIE));
    cookies.delete(SESSION_COOKIE, { path: '/admin' });
    redirect(303, '/admin/sign-in');
  },
};
