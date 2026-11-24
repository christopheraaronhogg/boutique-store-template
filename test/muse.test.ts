import { describe, expect, it } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import type { StoreEnv } from '$lib/server/mcp/env';
import { storeProvider } from '$lib/server/mcp/provider';
import { httpsRedirect, storeOrigin } from '$lib/server/mcp/env';
import { consentGet, consentPost } from '$lib/server/mcp/consent';
import { loadSettings } from '$lib/server/settings';
import { mcpApi, TOO_BIG } from '$lib/server/mcp/api';
import { ownerToolCall } from '$lib/server/mcp/webmcp';
import { base64, base64Big, jpeg, makePurse, store } from './helpers';

const base = 'https://shop.example';
const redirect = 'https://muse.example/callback';

const site = {
  async fetch(request: Request, env: StoreEnv): Promise<Response> {
    if (new URL(request.url).pathname !== '/authorize') return new Response('site');
    const s = await loadSettings(env.DB);
    return request.method === 'POST' ? consentPost(request, env, s, request.headers.get('x-test-ip') ?? '192.0.2.1') : consentGet(request, env, s);
  },
};

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await storeProvider(store, site).fetch(new Request(`${base}${path}`, init), store, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function rpc(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await send('/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, text, body: res.status === 200 ? (JSON.parse(text) as { result: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean } }) : null };
}

async function tool(token: string, name: string, args: Record<string, unknown>) {
  const { body } = await rpc(token, 'tools/call', { name, arguments: args });
  const text = body!.result.content![0].text;
  return body!.result.isError ? { error: text } : JSON.parse(text);
}

async function openConsent(scope: string) {
  const reg = (await (await send('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Muse <b>', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json()) as { client_id: string };
  const verifier = 'v'.repeat(64);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, scope, state: 's', code_challenge: challenge, code_challenge_method: 'S256' });
  const page = await send(`/authorize?${q}`);
  const html = await page.text();
  const cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const handle = html.match(/name="handle" value="([^"]+)"/)![1];
  const answer = (password: string, ip = '192.0.2.1') =>
    send(`/authorize?${q}`, { method: 'POST', headers: { cookie, 'x-test-ip': ip, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ handle, password, decision: 'approve' }) });
  return { reg, verifier, html, answer };
}

async function connect(scope = 'store offline_access'): Promise<string> {
  const { reg, verifier, answer } = await openConsent(scope);
  const location = (await answer('test-owner-password')).headers.get('location')!;
  const code = new URL(location).searchParams.get('code')!;
  const token = (await (await send('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }) })).json()) as { access_token: string };
  return token.access_token;
}


describe('connecting Muse', () => {
  it('points an unsigned request at the sign-in metadata', async () => {
    const res = await send('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    const meta = (await (await send('/.well-known/oauth-authorization-server')).json()) as Record<string, unknown>;
    expect(meta).toMatchObject({ registration_endpoint: `${base}/oauth/register`, authorization_endpoint: `${base}/authorize`, client_id_metadata_document_supported: true });
    expect(await (await send('/')).text()).toBe('site');
  });

  it('shows the Connect page safely and only lets the right password through', async () => {
    await store.DB.prepare('DELETE FROM owner_sign_in_attempts').run();
    const { html, answer } = await openConsent('store offline_access');
    expect(html).toContain('Muse &#60;b&#62;');
    expect(html).toContain('muse.example');
    const wrong = await answer('nope', '192.0.2.50');
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain('That password isn’t right.');
    const right = await answer('test-owner-password', '192.0.2.50');
    expect(right.status).toBe(302);
    expect(new URL(right.headers.get('location')!).searchParams.get('code')).toBeTruthy();
    expect((await answer('test-owner-password', '192.0.2.50')).status).toBe(400);
  });

  it('does not count a sign-in post that never opened the Connect page', async () => {
    await store.DB.prepare('DELETE FROM owner_sign_in_attempts').run();
    const bare = await send('/authorize', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password: 'x', decision: 'approve' }) });
    expect(bare.status).toBe(400);
    const { count } = (await store.DB.prepare('SELECT COUNT(*) AS count FROM owner_sign_in_attempts').first<{ count: number }>())!;
    expect(count).toBe(0);
  });

  it('signs in with OAuth and lists the store tools', async () => {
    const token = await connect();
    const { status, body } = await rpc(token, 'tools/list');
    expect(status).toBe(200);
    expect(body!.result.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(['add_purse', 'update_purse', 'add_photos', 'photo_upload_link', 'list_orders', 'update_order', 'update_store_settings']));
  });

  it('refuses a token that was not granted the store scope', async () => {
    const auth = { token: 'x', audience: `${base}/mcp`, scope: ['offline_access'] };
    const ctx = Object.assign(createExecutionContext(), { props: { owner: true as const, via: 'oauth' as const }, auth });
    const res = await mcpApi.fetch(new Request(`${base}/mcp`, { method: 'POST', body: '{}' }), store, ctx);
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toContain('insufficient_scope');
  });

  it('accepts the long store key and nothing shorter or different', async () => {
    expect((await rpc(store.STORE_KEY!, 'tools/list')).status).toBe(200);
    expect((await rpc('test-store-key', 'tools/list')).status).toBe(401);
    expect((await rpc(`${store.STORE_KEY}x`, 'tools/list')).status).toBe(401);
  });

  it('adds a purse with a photo in one call, and offers a phone link when there is none', async () => {
    const token = await connect();
    const added = await tool(token, 'add_purse', { name: 'Croc Satchel', price: 64, description: 'Structured.', photos: [{ data: base64(jpeg(900, 1200)) }] });
    expect(added.purse).toMatchObject({ name: 'Croc Satchel', price: '$64', status: 'live', link: `${base}/p/croc-satchel` });
    expect(added.purse.photos[0].url).toMatch(/^https:\/\/shop\.example\/photos\/purses\/\d+\/[0-9a-f-]+\.jpg$/);
    expect(added.photo_upload_link).toBeUndefined();
    const bare = await tool(token, 'add_purse', { name: 'Bare Clutch', price: 30 });
    expect(bare.purse.status).toBe('draft');
    expect(bare.photo_upload_link.url).toMatch(/^https:\/\/shop\.example\/add-photos\//);
    expect((await tool(token, 'add_purse', { name: 'Hidden Hobo', price: 30, status: 'hidden' })).purse.status).toBe('hidden');
    expect((await tool(token, 'add_purse', { name: 'Bag', price: 30, style: 'Pillows' })).error).toContain('not one of the store');
  });

  it('takes a full-size phone photo, and explains a call that is too big', async () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    big.set(jpeg(3024, 4032));
    const added = await tool(store.STORE_KEY!, 'add_purse', { name: 'Phone Photo Tote', price: 58, photos: [{ data: base64Big(big) }] });
    expect(added.purse.photos).toHaveLength(1);
    const huge = await rpc(store.STORE_KEY!, 'tools/call', { name: 'add_purse', arguments: { name: 'Too Big', price: 58, photos: [{ data: 'A'.repeat(25 * 1024 * 1024) }] } });
    expect(huge.status).toBe(413);
    expect(JSON.parse(huge.text).error.message).toBe(TOO_BIG);
  });

  it('cancels only through its own tool', async () => {
    const { body } = await rpc(store.STORE_KEY!, 'tools/list');
    const tools = (body!.result as unknown as { tools: { name: string; annotations?: { destructiveHint?: boolean } }[] }).tools;
    expect(tools.find((x) => x.name === 'cancel_order')?.annotations?.destructiveHint).toBe(true);
    expect((await tool(store.STORE_KEY!, 'update_order', { number: 'TTL-1', status: 'cancelled' })).error).toBeTruthy();
  });

  it('puts the owner photo on the store and takes it down again', async () => {
    const set = await tool(store.STORE_KEY!, 'set_store_photo', { spot: 'about', photo: { data: base64(jpeg(800, 1000)) } });
    expect(set.photo).toMatch(/^https:\/\/shop\.example\/photos\/store\/about\/[0-9a-f-]+\.jpg$/);
    const key = set.photo.split('/photos/')[1];
    expect((await loadSettings(store.DB)).about.photo_key).toBe(key);
    expect(await store.PHOTOS.head(key)).not.toBeNull();
    const again = await tool(store.STORE_KEY!, 'set_store_photo', { spot: 'about', photo: { data: base64(jpeg(800, 1000)) } });
    expect(await store.PHOTOS.head(key)).not.toBeNull();
    expect((await tool(store.STORE_KEY!, 'set_store_photo', { spot: 'about', photo: { data: 'aGVsbG8=' } })).error).toContain('not a JPEG');
    expect((await loadSettings(store.DB)).about.photo_key).toBe(again.photo.split('/photos/')[1]);
    expect((await tool(store.STORE_KEY!, 'set_store_photo', { spot: 'about', remove: true })).photo).toBeNull();
    expect((await loadSettings(store.DB)).about.photo_key).toBeNull();
    expect(await store.PHOTOS.head(again.photo.split('/photos/')[1])).not.toBeNull();
    expect((await tool(store.STORE_KEY!, 'undo_change', {})).undid.what).toBe('Took down the owner photo');
    expect((await loadSettings(store.DB)).about.photo_key).toBe(again.photo.split('/photos/')[1]);
  });

  it('marks a purse sold and finds it again', async () => {
    const id = await makePurse({ name: 'Cherry Satchel' });
    expect((await tool(store.STORE_KEY!, 'update_purse', { purse_id: id, sold: true })).sold).toBe(true);
    expect((await tool(store.STORE_KEY!, 'list_purses', { filter: 'sold' })).map((p: { id: number }) => p.id)).toEqual([id]);
  });
});

describe('making changes obvious to Muse', () => {
  it('tells Muse where to start and maps every request to a tool that exists', async () => {
    const init = await rpc(store.STORE_KEY!, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const instructions = (init.body!.result as unknown as { instructions: string }).instructions;
    expect(instructions).toContain('call what_can_i_change first');
    expect(instructions).toContain('"Change my hours" → update_store_settings section:"hours"');
    const names = (await rpc(store.STORE_KEY!, 'tools/list')).body!.result.tools!.map((t) => t.name);
    expect(names[0]).toBe('what_can_i_change');
    const guide = await tool(store.STORE_KEY!, 'what_can_i_change', {});
    expect(guide.website).toBe(base);
    expect(guide.settings_now.hours.length).toBeGreaterThan(0);
    for (const g of guide.changes as { she_says: string; do: string }[]) {
      const used = g.do.match(/\b[a-z]+_[a-z_]+\b/g)!.filter((w) => names.includes(w));
      expect(used.length, g.she_says).toBeGreaterThan(0);
    }
  });

  it('takes the examples in its own settings description as written', async () => {
    const banner = await tool(store.STORE_KEY!, 'update_store_settings', { section: 'banner', changes: { enabled: true, headline: 'Black Friday', text: '20% off all totes', ends_on: '2026-11-30' } });
    expect(banner.error).toBeUndefined();
    const hours = await tool(store.STORE_KEY!, 'update_store_settings', { section: 'hours', changes: [{ label: 'Monday – Saturday', value: '10 AM – 6 PM' }, { label: 'Sunday', value: 'Closed' }] });
    expect(hours.error).toBeUndefined();
    const closed = await tool(store.STORE_KEY!, 'update_store_settings', { section: 'closures', changes: [{ date: '2026-12-25', note: 'Merry Christmas' }] });
    expect(closed.error).toBeUndefined();
    const s = await loadSettings(store.DB);
    expect(s.banner.headline).toBe('Black Friday');
    expect(s.hours[1]).toEqual({ label: 'Sunday', value: 'Closed' });
  });
});

describe('WebMCP on the signed-in store manager', () => {
  const call = (init: RequestInit & { headers?: Record<string, string> }, owner = true) =>
    ownerToolCall(new Request(`${base}/admin/tools`, { method: 'POST', ...init }), store, owner);
  const json = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: base };
  const list = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

  it('only answers the signed-in owner from her own pages', async () => {
    expect((await call({ headers: json, body: list }, false)).status).toBe(403);
    expect((await call({ headers: { ...json, origin: 'https://evil.example' }, body: list })).status).toBe(403);
    expect((await call({ headers: { ...json, origin: '' }, body: list })).status).toBe(403);
    expect((await call({ headers: { ...json, 'content-type': 'text/plain' }, body: list })).status).toBe(415);
  });

  it('runs the same tools as /mcp', async () => {
    const res = await call({ headers: json, body: list });
    expect(res.status).toBe(200);
    const tools = ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(tools).toContain('what_can_i_change');
    expect(tools).toContain('update_store_settings');
    const done = await call({ headers: json, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'update_store_settings', arguments: { section: 'policies', changes: { returns: 'All sales final.' } } } }) });
    expect(done.status).toBe(200);
    expect((await loadSettings(store.DB)).policies.returns).toBe('All sales final.');
  });
});

describe('the store address', () => {
  it('uses PUBLIC_URL when set and the visited https address otherwise', () => {
    const visit = new Request('https://ttl.workers.example/mcp');
    expect(storeOrigin({ PUBLIC_URL: 'https://shop.example/' }, visit)).toBe('https://shop.example');
    expect(storeOrigin({}, visit)).toBe('https://ttl.workers.example');
    expect(storeOrigin({ PUBLIC_URL: '' }, new Request('http://127.0.0.1:8787/'))).toBe('http://127.0.0.1:8787');
    expect(() => storeOrigin({}, new Request('http://shop.example/'))).toThrow();
  });

  it('sends a plain http visit to the https address instead of failing', () => {
    const moved = httpsRedirect(new Request('http://shop.example/p/tote?x=1'))!;
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('https://shop.example/p/tote?x=1');
    expect(httpsRedirect(new Request('https://shop.example/'))).toBeNull();
    expect(httpsRedirect(new Request('http://127.0.0.1:8787/'))).toBeNull();
  });
});

describe('setting up a new store in one call', () => {
  const profile = () => ({
    sections: {
      store: { name: 'Three Times a Lady Boutique', city: 'Jonesboro', state: 'AR', phone: '870-206-8021' },
      hours: [{ label: 'Monday – Friday', value: '10 AM – 5 PM' }],
      theme: { hot: '#e0177c', font_script: 'Allura' },
      about: { title_script: 'Pamela', story: 'Her words.' },
    },
    store_setup: { order_prefix: 'TTL-', header_name: 'Three Times a Lady', notify_emails: [' Owner@Shop.Example '], logo_wide: true },
    brand_images: { logo: { data: base64(jpeg(600, 200)) } },
    owner_photo: { data: base64(jpeg(800, 1000)) },
  });
  const storeObjects = async () => (await store.PHOTOS.list({ prefix: 'store/' })).objects.map((o) => o.key).sort();

  it('applies the whole profile and stores its pictures', async () => {
    const done = await tool(store.STORE_KEY!, 'setup_store', profile());
    expect(done.error).toBeUndefined();
    expect(done.website).toBe(base);
    expect(done.changed.sort()).toEqual(['about', 'hours', 'store', 'theme']);
    const s = await loadSettings(store.DB);
    expect(s.store.name).toBe('Three Times a Lady Boutique');
    expect(s.store.order_prefix).toBe('TTL-');
    expect(s.store.notify_emails).toEqual(['owner@shop.example']);
    expect(s.store.logo_wide).toBe(true);
    expect(s.store.logo).toMatch(/^\/photos\/store\/brand\/logo-[0-9a-f-]+\.jpg$/);
    expect(s.theme.hot).toBe('#e0177c');
    expect(s.theme.font_script).toBe('Allura');
    expect(s.about.story_is_sample).toBe(false);
    expect(s.about.photo_key).toMatch(/^store\/about\//);
    expect(await storeObjects()).toEqual(expect.arrayContaining([s.about.photo_key, s.store.logo.slice('/photos/'.length)]));
  });

  it('saves nothing when any part is wrong, and names the part', async () => {
    const before = JSON.stringify(await loadSettings(store.DB));
    const objectsBefore = await storeObjects();
    const badColor = profile();
    badColor.sections.theme.hot = 'pink';
    expect((await tool(store.STORE_KEY!, 'setup_store', badColor)).error).toContain('theme: hot should be a color');
    const badPhoto = profile();
    badPhoto.owner_photo = { data: 'aGVsbG8=' };
    expect((await tool(store.STORE_KEY!, 'setup_store', badPhoto)).error).toContain('owner_photo: That file is not a JPEG');
    const badPrefix = profile();
    badPrefix.store_setup.order_prefix = 'ttl';
    expect((await tool(store.STORE_KEY!, 'setup_store', badPrefix)).error).toContain('order_prefix should be');
    for (const typo of [{ sections: { stores: { name: 'Typo' } } }, { store_setup: { order_prefx: 'ABC-' } }, { brand_images: { favicon: { url: 'https://shop.example/x.png' } } }, { theme: { hot: '#000000' } }, { owner_photo: { link: 'https://shop.example/x.jpg' } }]) {
      expect((await tool(store.STORE_KEY!, 'setup_store', typo)).error, JSON.stringify(typo)).toMatch(/stores|order_prefx|favicon|theme|link/);
    }
    expect(JSON.stringify(await loadSettings(store.DB))).toBe(before);
    expect(await storeObjects()).toEqual(objectsBefore);
  });

  it('can be run again, keeps the pictures it replaced, and undo puts them back', async () => {
    await tool(store.STORE_KEY!, 'setup_store', profile());
    const first = await storeObjects();
    const logo = (await loadSettings(store.DB)).store.logo;
    const again = await tool(store.STORE_KEY!, 'setup_store', profile());
    const second = await storeObjects();
    expect(second).toHaveLength(first.length + 2);
    expect(second).toEqual(expect.arrayContaining(first));
    expect((await loadSettings(store.DB)).store.logo).not.toBe(logo);
    const undone = await tool(store.STORE_KEY!, 'undo_change', { change_id: again.change_id });
    expect(undone.undid.what).toMatch(/^Set up the store/);
    expect((await loadSettings(store.DB)).store.logo).toBe(logo);
  });

  it('lets Muse change the colors later', async () => {
    expect((await tool(store.STORE_KEY!, 'update_store_settings', { section: 'theme', changes: { gold: '#c39a43' } })).gold).toBe('#c39a43');
    expect((await tool(store.STORE_KEY!, 'update_store_settings', { section: 'theme', changes: { sparkle: '#ffffff' } })).error).toContain('not a theme field');
  });
});
