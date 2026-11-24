import { insufficientScope, type OAuthResourceAuth } from '@cloudflare/workers-oauth-provider';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { publicOrigin, STORE_SCOPE, type StoreEnv } from './env';
import { buildServer, MAX_CALL_BYTES } from './tools';

export type OwnerProps = { owner: true; via: 'oauth' | 'store_key' };

type ApiContext = ExecutionContext & { props?: Partial<OwnerProps>; auth?: OAuthResourceAuth };

export const TOO_BIG = `That was more than ${MAX_CALL_BYTES / 1024 / 1024} MB in one call. Send one photo per call with add_photos, or give the owner a photo_upload_link to pick the photos on her phone.`;

export const mcpApi = {
  async fetch(request: Request, env: StoreEnv, ctx: ApiContext): Promise<Response> {
    if (ctx.props?.owner !== true) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (ctx.props.via !== 'store_key' && !ctx.auth?.scope.includes(STORE_SCOPE)) {
      return ctx.auth ? insufficientScope(ctx.auth, [STORE_SCOPE]) : Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const server = buildServer({ db: env.DB, bucket: env.PHOTOS, origin: publicOrigin(env), mail: env });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MAX_CALL_BYTES });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    if (response.status !== 413) return response;
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: TOO_BIG } }, { status: 413 });
  },
};
