import { bagCount } from '$lib/server/bag';
import { testPaymentsOn } from '$lib/server/payments';
import { loadSettings } from '$lib/server/settings';
import { inAdmin } from '$lib/adminArea';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, platform, url, route, request }) => {
  const samples = await locals.db.prepare("SELECT 1 FROM products WHERE is_sample = 1 AND status = 'live' LIMIT 1").first();
  return {
    settings: request.method === 'GET' ? locals.settings : await loadSettings(locals.db),
    bagCount: bagCount(locals.bag),
    resizing: platform?.env.IMAGE_RESIZING === 'on',
    testMode: testPaymentsOn(platform?.env.PAYMENT_DRIVER),
    hasSamples: samples !== null,
    admin: inAdmin(route.id, url.pathname),
  };
};
