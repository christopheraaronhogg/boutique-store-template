import { describe, expect, it } from 'vitest';
import { decodeBase64, download, isHeic, PhotoProblem, readPicture } from '$lib/server/owner/images';
import { addPhotos, changePurse, clearSamples, coverPhoto, createPurse, listPurses, OwnerProblem, purse, removePhoto } from '$lib/server/owner/purses';
import { changeSettings, describeEditable } from '$lib/server/owner/settings';
import { makeUploadLink, publishOnce, uploadLink } from '$lib/server/owner/uploads';
import { checkPassword } from '$lib/server/owner/signIn';
import { moveOrder, ownerOrders } from '$lib/server/orders';
import { createOrder } from '$lib/server/orders';
import { bagLines, parseBag } from '$lib/server/bag';
import { loadSettings } from '$lib/server/settings';
import { DEFAULT_SETTINGS, themeCss, upcomingClosures } from '$lib/settings';
import { storeToday } from '$lib/dates';
import { base64, db, jpeg, makePurse, png, settings, store } from './helpers';

async function styles() {
  await db.prepare('DELETE FROM categories').run();
  await db.prepare("INSERT INTO categories (id, name, slug) VALUES (1, 'Handbags', 'handbags'), (2, 'Totes', 'totes'), (3, 'Crossbody', 'crossbody')").run();
  await db.prepare('UPDATE categories SET parent_id = 1 WHERE id IN (2, 3)').run();
}

describe('photos sent by the assistant', () => {
  it('reads JPEG and PNG sizes and refuses other files in plain words', () => {
    expect(readPicture(jpeg(1200, 1500))).toMatchObject({ mime: 'image/jpeg', width: 1200, height: 1500 });
    expect(readPicture(png(640, 480))).toMatchObject({ mime: 'image/png', width: 640, height: 480 });
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0]);
    expect(isHeic(heic)).toBe(true);
    expect(() => readPicture(heic)).toThrow('iPhone HEIC');
    expect(() => readPicture(new TextEncoder().encode('<svg onload=alert(1)>'))).toThrow('not a JPEG, PNG or WebP');
  });

  it('accepts base64 with or without a data: prefix', () => {
    const bytes = jpeg(10, 20);
    expect(decodeBase64(`data:image/jpeg;base64,${base64(bytes)}`)).toEqual(bytes);
    expect(() => decodeBase64('not base64 at all!')).toThrow(PhotoProblem);
    expect(() => decodeBase64('A')).toThrow('not valid base64');
    expect(() => decodeBase64('AB=')).toThrow('not valid base64');
  });

  it('downloads only https links, and stops past 15 MB', async () => {
    await expect(download('http://example.com/a.jpg')).rejects.toThrow('https://');
    const big = async () => new Response('x', { headers: { 'content-length': String(16 * 1024 * 1024) } });
    await expect(download('https://example.com/a.jpg', big as typeof fetch)).rejects.toThrow('over 15 MB');
    const ok = async () => new Response(jpeg(5, 5));
    expect(await download('https://example.com/a.jpg', ok as typeof fetch)).toEqual(jpeg(5, 5));
  });
});

describe('adding and changing purses', () => {
  it('adds a live purse first on the shelf, in cents, with its style and a unique link', async () => {
    await styles();
    const a = await createPurse(db, { name: 'Camel Tote', price: 58, style: 'totes', description: ' Roomy. ' });
    const b = await createPurse(db, { name: 'Camel Tote', price: 44.5, style: 'Tote' });
    expect([a.price_cents, a.category_name, a.status, a.description]).toEqual([5800, 'Totes', 'live', 'Roomy.']);
    expect(b.slug).toBe('camel-tote-2');
    expect((await listPurses(db, 'live')).slice(0, 2).map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('explains bad prices and unknown styles', async () => {
    await styles();
    await expect(createPurse(db, { name: 'Bag', price: 0 })).rejects.toThrow('above 0');
    await expect(createPurse(db, { name: 'Bag', price: 40, sale_price: 45 })).rejects.toThrow('lower than the regular price');
    await expect(createPurse(db, { name: 'Bag', price: 40, style: 'Pillows' })).rejects.toThrow('Crossbody, Totes');
  });

  it('keeps the purse link when it is renamed', async () => {
    const p = await createPurse(db, { name: 'Camel Tote', price: 58 });
    expect((await changePurse(db, p.id, { name: 'Camel Leather Tote' })).slug).toBe(p.slug);
  });

  it('marks sold, hides, puts on sale and clears the sale', async () => {
    const id = await makePurse({ name: 'Cherry Satchel', price_cents: 6000 });
    expect((await changePurse(db, id, { sold: true, sale_price: 50 })).sale_price_cents).toBe(5000);
    const p = await changePurse(db, id, { status: 'hidden', sale_price: null });
    expect([p.sold_out, p.status, p.sale_price_cents]).toEqual([true, 'hidden', null]);
    await expect(changePurse(db, id, { price: 40, sale_price: 45 })).rejects.toThrow(OwnerProblem);
    await expect(changePurse(db, 99999, { sold: true })).rejects.toThrow('no purse with id 99999');
  });

  it('stores good photos in R2, reports bad ones, and can make one the cover or remove it', async () => {
    const id = await makePurse({ name: 'Blush Bag' });
    const result = await addPhotos(db, store.PHOTOS, id, [{ data: base64(jpeg(800, 1000)) }, { data: base64(new TextEncoder().encode('hello')) }]);
    expect(result.problems).toEqual(['Photo 2: That file is not a JPEG, PNG or WebP photo.']);
    const [added] = result.added;
    expect(added).toMatchObject({ width: 800, height: 1000 });
    const object = await store.PHOTOS.get(added.key);
    expect(object?.httpMetadata?.contentType).toBe('image/jpeg');
    await coverPhoto(db, added.id);
    expect((await purse(db, id)).photos[0].id).toBe(added.id);
    await removePhoto(db, added.id);
    expect(await store.PHOTOS.get(added.key)).not.toBeNull();
    expect((await purse(db, id)).photos).toHaveLength(1);
  });

  it('removes only the sample purses', async () => {
    const mine = await makePurse({ name: 'Her Own Bag' });
    const sample = await makePurse({ name: 'Sample Bag' });
    await db.prepare('UPDATE products SET is_sample = 1 WHERE id = ?').bind(sample).run();
    expect(await clearSamples(db)).toBeGreaterThanOrEqual(1);
    expect((await listPurses(db, 'samples')).length).toBe(0);
    expect((await listPurses(db)).map((p) => p.id)).toContain(mine);
  });
});

describe('the phone photo link', () => {
  it('works for its purse until it expires', async () => {
    const id = await makePurse({ name: 'Linked Bag' });
    const link = await makeUploadLink(db, 'https://shop.example', id);
    const token = link.url.split('/').pop()!;
    expect(link.url).toMatch(/^https:\/\/shop\.example\/add-photos\/[0-9a-f]{48}$/);
    expect(await uploadLink(db, token)).toEqual({ productId: id, publish: false });
    const publishing = await makeUploadLink(db, 'https://shop.example', id, true);
    expect((await uploadLink(db, publishing.url.split('/').pop()!))?.publish).toBe(true);
    await db.prepare("UPDATE photo_upload_links SET expires_at = datetime('now', '-1 minute')").run();
    expect(await uploadLink(db, token)).toBeNull();
    expect(await uploadLink(db, '../../etc')).toBeNull();
  });

  it('publishes a draft once and never brings back a purse the owner hid', async () => {
    const id = await makePurse({ name: 'Retake Bag' });
    await changePurse(db, id, { status: 'draft' });
    const token = (await makeUploadLink(db, 'https://shop.example', id, true)).url.split('/').pop()!;
    expect(await publishOnce(db, id)).toBe(true);
    expect((await purse(db, id)).status).toBe('live');
    expect((await uploadLink(db, token))?.publish).toBe(false);
    await changePurse(db, id, { status: 'hidden' });
    expect(await publishOnce(db, id)).toBe(false);
    expect((await purse(db, id)).status).toBe('hidden');
    await changePurse(db, id, { status: 'draft' });
    expect(await publishOnce(db, id)).toBe(false);
    expect((await purse(db, id)).status).toBe('draft');
  });
});

describe('orders for the owner', () => {
  it('lists open orders and moves them along only in order', async () => {
    const tote = await makePurse({ name: 'Camel Tote', price_cents: 5800 });
    const { lines } = await bagLines(db, parseBag(`${tote}:1`), settings());
    const shopper = { customer_name: 'Dana Smith', email: 'dana@example.com', phone: '(870) 555-0100', customer_note: '' };
    const unpaid = await createOrder(db, settings(), lines, shopper, 'test', true);
    const paid = await createOrder(db, settings(), lines, shopper, 'test', true);
    await db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").bind(paid.id).run();
    expect((await ownerOrders(db, 'open')).map((o) => o.number)).toEqual([paid.number]);
    await expect(moveOrder(db, unpaid.number, 'ready')).rejects.toThrow('can move to cancelled');
    expect((await moveOrder(db, paid.number.toLowerCase(), 'ordered')).status).toBe('ordered');
    expect((await moveOrder(db, paid.number, 'ready')).status).toBe('ready');
    expect((await moveOrder(db, paid.number, 'picked_up')).status).toBe('picked_up');
    await expect(moveOrder(db, paid.number, 'cancelled')).rejects.toThrow('cannot change anymore');
  });
});

describe('store settings the assistant can change', () => {
  it('changes only known fields, with the right types, and keeps the logos locked and colors well formed', async () => {
    const banner = (await changeSettings(db, 'banner', { headline: 'Mother’s Day sale', starts_on: '2027-05-01', ends_on: null })) as Record<string, unknown>;
    expect(banner).toMatchObject({ headline: 'Mother’s Day sale', starts_on: '2027-05-01', ends_on: null });
    expect((await loadSettings(db)).banner.is_sample).toBe(false);
    await expect(changeSettings(db, 'banner', { color: 'red' })).rejects.toThrow('"color" is not a field');
    await expect(changeSettings(db, 'banner', { enabled: 'yes' })).rejects.toThrow('true or false');
    await expect(changeSettings(db, 'store', { logo: 'https://evil.example/x.png' })).rejects.toThrow('"logo" is not a field');
    await expect(changeSettings(db, 'store', { facebook_url: 'javascript:alert(1)' })).rejects.toThrow('https://');
    await expect(changeSettings(db, 'theme', { pink: '#000' })).rejects.toThrow('should be a color');
    await expect(changeSettings(db, 'theme', { look: 'neon' })).rejects.toThrow('look should be one of');
    await expect(changeSettings(db, 'theme', { font_script: 'Comic Sans' })).rejects.toThrow('font_script should be one of');
    expect(describeEditable(await loadSettings(db)).store).not.toHaveProperty('logo');
    await expect(changeSettings(db, 'home', { trust: ['Free pickup'] })).rejects.toThrow('should look like');
    await expect(changeSettings(db, 'home', { trust: [{ icon: 'bag', title: 'Free pickup', text: 'At the shop', extra: 'x' }] })).rejects.toThrow('should look like');
    const home = (await changeSettings(db, 'home', { trust: [{ icon: 'bag', title: 'Free pickup', text: 'At the shop' }] })) as { trust: unknown[] };
    expect(home.trust).toEqual([{ icon: 'bag', title: 'Free pickup', text: 'At the shop' }]);
    await expect(changeSettings(db, 'store', { notify_emails: ['a@b.co'] })).rejects.toThrow('is not a field');
    expect((await changeSettings(db, 'home', { ticks: ['Free store pickup'] }) as { ticks: string[] }).ticks).toEqual(['Free store pickup']);
  });

  it('replaces hours and closed days as whole lists, and shows closures coming up', async () => {
    await changeSettings(db, 'hours', [{ label: 'Saturday', value: '10 AM – 2 PM' }]);
    await changeSettings(db, 'closures', [{ date: '2026-12-25', note: 'Christmas' }, { date: '2026-12-24' }]);
    await expect(changeSettings(db, 'hours', [{ label: 'Saturday' }])).rejects.toThrow('label and a value');
    const s = await loadSettings(db);
    expect(s.hours).toEqual([{ label: 'Saturday', value: '10 AM – 2 PM' }]);
    expect(upcomingClosures(s, '2026-12-01').map((c) => c.label)).toEqual(['Thursday, December 24', 'Friday, December 25']);
    expect(upcomingClosures(s, '2027-03-01')).toEqual([]);
  });

  it('survives a broken settings row and keeps odd theme keys out of the page style', async () => {
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('banner', '{not json')").run();
    expect((await loadSettings(db)).banner).toEqual(DEFAULT_SETTINGS.banner);
    const s = settings();
    expect(themeCss({ ...s, theme: { ...s.theme, ['x}</style><script>' as 'pink']: '#fff' } })).not.toContain('<');
  });
});

describe('the store password', () => {
  it('counts guesses sent all at once, per address and for the whole store', async () => {
    await db.prepare('DELETE FROM owner_sign_in_attempts').run();
    const burst = await Promise.all(Array.from({ length: 20 }, () => checkPassword(db, 'right-password-1', 'wrong-guess', '203.0.113.9')));
    expect(burst.filter((r) => !r.ok && r.status === 401)).toHaveLength(8);
    expect(burst.filter((r) => !r.ok && r.status === 429)).toHaveLength(12);
    const spread = await Promise.all(Array.from({ length: 20 }, (_, i) => checkPassword(db, 'right-password-1', 'wrong-guess', `198.51.100.${i}`)));
    expect(spread.filter((r) => !r.ok && r.status === 429).length).toBeGreaterThanOrEqual(10);
    await db.prepare('DELETE FROM owner_sign_in_attempts').run();
    expect(await checkPassword(db, 'right-password-1', 'right-password-1', '203.0.113.9')).toEqual({ ok: true });
    expect((await db.prepare('SELECT COUNT(*) AS n FROM owner_sign_in_attempts').first<{ n: number }>())!.n).toBe(0);
    expect(await checkPassword(db, 'short', 'short', '203.0.113.9')).toMatchObject({ ok: false, status: 503 });
  });
});

describe('the store calendar', () => {
  it('uses Jonesboro’s date, not UTC', () => {
    expect(storeToday(new Date('2026-12-25T03:00:00Z'))).toBe('2026-12-24');
    expect(storeToday(new Date('2026-12-25T07:00:00Z'))).toBe('2026-12-25');
  });
});
