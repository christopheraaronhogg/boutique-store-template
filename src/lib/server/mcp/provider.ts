import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { sameSecret } from '$lib/server/owner/secrets';
import { mcpApi, type OwnerProps } from './api';
import { publicOrigin, STORE_SCOPE, type StoreEnv } from './env';

type Handler = { fetch(request: Request, env: StoreEnv, ctx: ExecutionContext): Response | Promise<Response> };

export const MIN_STORE_KEY = 32;

export function storeProvider(env: StoreEnv, site: Handler): OAuthProvider<StoreEnv> {
  const origin = publicOrigin(env);
  return new OAuthProvider<StoreEnv>({
    apiRoute: '/mcp',
    apiHandler: mcpApi as never,
    defaultHandler: site as never,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [STORE_SCOPE, 'offline_access'],
    requiredScopes: [STORE_SCOPE],
    resourceMetadata: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      resource_name: 'Store manager',
    },
    resolveExternalToken: async ({ token, env: e }) => {
      const key = e.STORE_KEY ?? '';
      if (key.length < MIN_STORE_KEY || !(await sameSecret(token, key))) return null;
      const props: OwnerProps = { owner: true, via: 'store_key' };
      return { props, audience: `${origin}/mcp` };
    },
  });
}
