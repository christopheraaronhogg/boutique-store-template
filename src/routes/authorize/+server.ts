import { consentGet, consentPost } from '$lib/server/mcp/consent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, platform, locals }) => consentGet(request, platform!.env, locals.settings);

export const POST: RequestHandler = ({ request, platform, locals, getClientAddress }) => consentPost(request, platform!.env, locals.settings, getClientAddress());
