import type { ConsentDescription, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { checkPassword } from '$lib/server/owner/signIn';
import { fontsUrl, themeCss, type Settings } from '$lib/settings';
import type { OwnerProps } from './api';
import { STORE_SCOPE, type StoreEnv } from './env';

type Page = { details: ConsentDescription; handle: string; problem?: string };
type OAuthProblem = { redirectTo?: string; description?: string };

export async function consentGet(request: Request, env: StoreEnv, s: Settings): Promise<Response> {
  const oauth = helpers(env);
  if (!oauth) return notFound();
  return guard(async () => {
    const auth = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(auth);
    const consent = await oauth.beginConsent(auth);
    consent.headers.set('Content-Type', 'text/html; charset=utf-8');
    consent.headers.set('Cache-Control', 'no-store');
    return new Response(page(s, { details, handle: consent.handle }), { headers: consent.headers });
  });
}

export async function consentPost(request: Request, env: StoreEnv, s: Settings, ip: string): Promise<Response> {
  const oauth = helpers(env);
  if (!oauth) return notFound();
  return guard(async () => {
    const form = await request.formData().catch(() => null);
    if (!form) return plain('Please start again from your assistant.', 400);
    const handle = String(form.get('handle') ?? '');
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const details = await oauth.describeConsent(await oauth.parseAuthRequest(request));
    if (!handle) return plain('Please start again from your assistant.', 400);
    const check = await checkPassword(env.DB, env.OWNER_PASSWORD, String(form.get('password') ?? ''), ip);
    if (!check.ok) {
      return new Response(page(s, { details, handle, problem: check.problem }), { status: check.status, headers: htmlHeaders() });
    }
    const approved = await oauth.approveConsent(request, handle, { scope: [STORE_SCOPE, 'offline_access'] });
    const props: OwnerProps = { owner: true, via: 'oauth' };
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: 'owner',
      metadata: { approved_at: new Date().toISOString() },
      scope: approved.request.scope,
      props,
    });
    approved.headers.set('Location', redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  });
}

function helpers(env: StoreEnv): OAuthHelpers | undefined {
  return env.OAUTH_PROVIDER;
}

function notFound(): Response {
  return plain('Not found', 404);
}

function plain(text: string, status: number): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const problem = oauthProblem(e);
    if (problem?.redirectTo) return Response.redirect(problem.redirectTo, 302);
    if (problem) {
      const reason = (problem.description ?? 'This app could not be verified').replace(/[.\s]+$/, '');
      return plain(`This sign-in link didn’t work: ${reason}. Please start again from your assistant.`, 400);
    }
    throw e;
  }
}

function oauthProblem(e: unknown): OAuthProblem | null {
  if (!(e instanceof Error)) return null;
  if (e.name === 'CimdFetchError') return {};
  if (e.name !== 'AuthorizationError') return null;
  const { redirectTo, description } = e as Error & OAuthProblem;
  return { redirectTo, description };
}

function htmlHeaders(): Headers {
  return new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Cache-Control': 'no-store',
  });
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(s: Settings, p: Page): string {
  const store = escape(s.store.name);
  const client = escape(p.details.clientName || 'An app');
  const who = p.details.clientDomain
    ? `This app is published by <b>${escape(p.details.clientDomain)}</b>.`
    : 'This app named itself, so its name isn’t verified.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Connect ${client} to ${store}</title>
<link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="${escape(fontsUrl(s))}"><style>${themeCss(s)}</style>
<style>.connect{max-width:520px;margin:40px auto;padding:0 16px}.connect ul{margin:0 0 16px;padding-left:20px}.connect .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.connect .small{color:var(--mute);font-size:14px}</style>
</head><body data-look="lady"><main class="connect"><div class="panel">
<h2>Connect <span class="script pk">${client}</span></h2>
<p><b>${client}</b> wants to manage <b>${store}</b>. It will be able to:</p>
<ul><li>add purses and photos, and change or hide them</li><li>see orders and their customers, and mark orders ordered, ready, picked up or cancelled</li><li>change store hours, the banner and other settings</li></ul>
<p class="small">${who} Access goes to <b>${escape(p.details.redirectHost)}</b>. Only continue if you just asked your assistant to connect.</p>
${p.details.redirectIsLoopback ? '<p class="notice sorry"><b>This sends access to an app on a computer.</b> Continue only if you started this from that computer.</p>' : ''}
${p.problem ? `<p class="notice sorry" role="alert">${escape(p.problem)}</p>` : ''}
<form method="post">
<input type="hidden" name="handle" value="${escape(p.handle)}">
<div class="field"><label for="password">Store password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
<div class="row"><button class="btn btn-hot" name="decision" value="approve">Allow</button><button class="btn btn-line" name="decision" value="deny" formnovalidate>Don’t allow</button></div>
</form></div></main></body></html>`;
}
