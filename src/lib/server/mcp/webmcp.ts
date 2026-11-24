import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { TOO_BIG } from './api';
import { publicOrigin, type StoreEnv } from './env';
import { buildServer, MAX_CALL_BYTES } from './tools';

export async function ownerToolCall(request: Request, env: StoreEnv, owner: boolean): Promise<Response> {
  if (!owner) return Response.json({ error: 'Sign in to the store manager first.' }, { status: 403 });
  if (request.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return Response.json({ error: 'Send JSON.' }, { status: 415 });
  const server = buildServer({ db: env.DB, bucket: env.PHOTOS, origin: publicOrigin(env) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MAX_CALL_BYTES });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if (response.status !== 413) return response;
  return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: TOO_BIG } }, { status: 413 });
}
