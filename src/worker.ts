import site from 'sveltekit-worker';
import type { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { httpsRedirect, storeOrigin, type DeployedEnv, type StoreEnv } from '$lib/server/mcp/env';
import { storeProvider } from '$lib/server/mcp/provider';

const providers = new Map<string, OAuthProvider<StoreEnv>>();

export default {
  async fetch(request: Request, deployed: DeployedEnv, ctx: ExecutionContext): Promise<Response> {
    const insecure = httpsRedirect(request);
    if (insecure) return insecure;
    const env: StoreEnv = { ...deployed, PUBLIC_URL: storeOrigin(deployed, request) };
    let provider = providers.get(env.PUBLIC_URL);
    if (!provider) {
      provider = storeProvider(env, site);
      providers.set(env.PUBLIC_URL, provider);
    }
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<DeployedEnv>;
