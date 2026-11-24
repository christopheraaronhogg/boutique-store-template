import { redirect } from '@sveltejs/kit';
import { SIGN_IN_ROUTE } from '$lib/adminArea';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, route }) => {
  if (route.id === SIGN_IN_ROUTE) return { signedIn: false };
  if (!locals.owner) redirect(303, SIGN_IN_ROUTE);
  return { signedIn: true };
};
