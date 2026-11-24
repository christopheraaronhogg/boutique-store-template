import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_DAYS, sessionValid, startSession } from '$lib/server/owner/sessions';
import { checkPassword } from '$lib/server/owner/signIn';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, platform }) => {
  if (await sessionValid(locals.db, cookies.get(SESSION_COOKIE), platform?.env.OWNER_PASSWORD)) redirect(303, '/admin');
};

export const actions: Actions = {
  default: async ({ locals, request, cookies, platform, getClientAddress }) => {
    const form = await request.formData();
    const check = await checkPassword(locals.db, platform!.env.OWNER_PASSWORD, String(form.get('password') ?? ''), getClientAddress());
    if (!check.ok) return fail(check.status, { problem: check.problem });
    cookies.set(SESSION_COOKIE, await startSession(locals.db, platform!.env.OWNER_PASSWORD!), { path: '/admin', httpOnly: true, sameSite: 'strict', secure: true, maxAge: SESSION_DAYS * 86_400 });
    redirect(303, '/admin');
  },
};
