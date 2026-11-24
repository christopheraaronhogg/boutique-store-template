import { ownerToolCall } from '$lib/server/mcp/webmcp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, platform, locals }) => ownerToolCall(request, platform!.env, locals.owner);
