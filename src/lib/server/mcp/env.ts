import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export type StoreEnv = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  OAUTH_KV: KVNamespace;
  ASSETS?: Fetcher;
  PAYMENT_DRIVER: string;
  IMAGE_RESIZING: string;
  PUBLIC_URL: string;
  OWNER_PASSWORD?: string;
  STORE_KEY?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
};

export type DeployedEnv = Omit<StoreEnv, 'PUBLIC_URL'> & { PUBLIC_URL?: string };

export const STORE_SCOPE = 'store';

export function publicOrigin(env: Pick<StoreEnv, 'PUBLIC_URL'>): string {
  const url = new URL(env.PUBLIC_URL);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('PUBLIC_URL must be the https address of the store.');
  return url.origin;
}

export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'http:' || local) return null;
  url.protocol = 'https:';
  return Response.redirect(url.href, 301);
}

export function storeOrigin(env: Pick<DeployedEnv, 'PUBLIC_URL'>, request: Request): string {
  return publicOrigin({ PUBLIC_URL: env.PUBLIC_URL || new URL(request.url).origin });
}
