import { json } from '@sveltejs/kit';
import { receiveSquareWebhook } from '$lib/server/square';
import { tellOwnerAboutOrder } from '$lib/server/orderEmail';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const { status, did } = await receiveSquareWebhook(locals.db, platform!.env, request, (order) => tellOwnerAboutOrder(platform!.env, locals.settings, order));
  console.log('Square webhook:', did);
  return status === 200 ? json({ ok: true }) : json({ error: did }, { status });
};
