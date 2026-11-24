import { describe, expect, it } from 'vitest';
import { bagLines, parseBag, serializeBag, setQuantity, subtotal } from '$lib/server/bag';
import { bySlug, justIn, shelf, stylesOnShelf } from '$lib/server/catalog';
import { cancelUnpaid, createOrder, findOrder, markPaid, validateCustomer } from '$lib/server/orders';
import { loadSettings, saveSection } from '$lib/server/settings';
import { activeBanner, DEFAULT_SETTINGS, fullAddress, telHref, themeCss } from '$lib/settings';
import { photoSrc } from '$lib/photos';
import { db, makePurse, settings } from './helpers';

const shopper = { customer_name: 'Dana Smith', email: 'dana@example.com', phone: '(870) 555-0100', customer_note: '' };

describe('settings', () => {
  it('falls back to the starter brand and merges what the owner saved', async () => {
    const saved = { name: 'Three Times a Lady Boutique', phone: '(870) 206-8021', address_line1: '2111 Race Street', address_line2: 'Suite 4', city: 'Jonesboro', state: 'AR', zip: '72401' };
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store', ?)").bind(JSON.stringify(saved)).run();
    await saveSection(db, 'banner', { ...(await loadSettings(db)).banner, headline: 'Mother’s Day sale' });
    const s = await loadSettings(db);
    expect(s.store.name).toBe('Three Times a Lady Boutique');
    expect(s.store.order_prefix).toBe(DEFAULT_SETTINGS.store.order_prefix);
    expect(s.banner.headline).toBe('Mother’s Day sale');
    expect(s.banner.text).toBe(DEFAULT_SETTINGS.banner.text);
    expect(fullAddress(s)).toBe('2111 Race Street Suite 4, Jonesboro, AR 72401');
    expect(telHref(s)).toBe('tel:+18702068021');
    expect(JSON.stringify(DEFAULT_SETTINGS)).not.toMatch(/Jonesboro|Pamela|870|501-207/);
    await db.prepare("DELETE FROM settings WHERE key IN ('store', 'banner')").run();
  });

  it('only puts hex colors and a known font into the page style', () => {
    const s = settings();
    const evil = { ...s, theme: { ...s.theme, pink: '</style><script>alert(1)</script>', font_script: 'Comic</style>' } };
    expect(themeCss(evil)).not.toContain('<');
    expect(themeCss(evil)).toContain("--font-script:'Dancing Script'");
  });

  it('shows a banner only inside its dates', () => {
    const s = settings();
    const b = { ...s, banner: { ...s.banner, enabled: true, headline: 'Holiday purses are in', starts_on: '2026-12-01', ends_on: '2026-12-24' } };
    expect(activeBanner(b, '2026-11-30')).toBeNull();
    expect(activeBanner(b, '2026-12-10')?.headline).toBe('Holiday purses are in');
    expect(activeBanner(b, '2026-12-25')).toBeNull();
  });
});

describe('the shelf', () => {
  it('lists live purses in her order, with photos, and leaves out drafts and hidden ones', async () => {
    const second = await makePurse({ name: 'Blush Flap Bag', position: 2 });
    const first = await makePurse({ name: 'Camel Tote', position: 1 });
    await makePurse({ name: 'Draft Clutch', status: 'draft' });
    await makePurse({ name: 'Hidden Satchel', status: 'hidden' });
    const shown = await shelf(db, settings());
    expect(shown.map((p) => p.id)).toEqual([first, second]);
    expect(shown[0].photos[0].key).toBe(`purses/${first}/a.jpg`);
  });

  it('can hide sold purses, and never offers them as just in', async () => {
    const sold = await makePurse({ name: 'Cherry Satchel', sold_out: 1 });
    expect((await shelf(db, settings({ show_sold: true }))).some((p) => p.id === sold)).toBe(true);
    expect((await shelf(db, settings({ show_sold: false }))).some((p) => p.id === sold)).toBe(false);
    expect((await justIn(db, 10)).some((p) => p.id === sold)).toBe(false);
  });

  it('finds a purse by its link and lists only styles that have live purses', async () => {
    const id = await makePurse({ name: 'Oatmeal Tweed Tote', category_id: 2 });
    const slug = (await db.prepare('SELECT slug FROM products WHERE id = ?').bind(id).first<{ slug: string }>())!.slug;
    const p = await bySlug(db, slug);
    expect(p?.category_name).toBe('Totes');
    expect(await stylesOnShelf(db)).toEqual([{ name: 'Totes', slug: 'totes' }]);
  });

  it('serves photos through Cloudflare resizing only when it is on', () => {
    expect(photoSrc('samples/tote-01.jpg', 'medium', false)).toBe('/photos/samples/tote-01.jpg');
    expect(photoSrc('samples/tote-01.jpg', 'medium', true)).toBe('/cdn-cgi/image/width=640,fit=scale-down,format=auto/photos/samples/tote-01.jpg');
  });
});

describe('the bag', () => {
  it('reads only well-formed lines from the cookie', () => {
    expect([...parseBag('12:1,15:2,bad,7:0,9:999,1:1')]).toEqual([
      [12, 1],
      [15, 2],
      [1, 1],
    ]);
    expect(serializeBag(new Map([[3, 2]]))).toBe('3:2');
  });

  it('lets a made-to-order shopper take up to 10 of a purse, and a one-of-a-kind shop only 1', () => {
    expect(setQuantity(new Map(), 5, 50, settings({ made_to_order: true })).get(5)).toBe(10);
    expect(setQuantity(new Map(), 5, 3, settings({ made_to_order: false })).get(5)).toBe(1);
    expect(setQuantity(new Map([[5, 2]]), 5, 0, settings()).has(5)).toBe(false);
  });

  it('prices from the store, uses the sale price, and drops purses that sold or were taken down', async () => {
    const tote = await makePurse({ name: 'Camel Tote', price_cents: 5800 });
    const clutch = await makePurse({ name: 'Champagne Clutch', price_cents: 5200, sale_price_cents: 4400 });
    const sold = await makePurse({ name: 'Cherry Satchel', sold_out: 1 });
    const hidden = await makePurse({ name: 'Hidden Bag', status: 'hidden' });
    const { lines, notes, bag } = await bagLines(db, parseBag(`${tote}:2,${clutch}:1,${sold}:1,${hidden}:1,99999:1`), settings());
    expect(lines.map((l) => [l.product.name, l.unit, l.line])).toEqual([
      ['Camel Tote', 5800, 11600],
      ['Champagne Clutch', 4400, 4400],
    ]);
    expect(subtotal(lines)).toBe(16000);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain('Cherry Satchel sold');
    expect([...bag.keys()]).toEqual([tote, clutch]);
  });
});

describe('checkout', () => {
  it('checks the shopper’s details in plain words', () => {
    const { errors } = validateCustomer({ customer_name: 'D', email: 'nope', phone: '12' });
    expect(errors).toEqual({
      customer_name: 'Please enter your name.',
      email: 'Please enter an email address like name@example.com.',
      phone: 'Please enter a phone number we can call.',
    });
    expect(validateCustomer({ ...shopper, email: ' Dana@Example.com ' }).customer.email).toBe('dana@example.com');
  });

  it('saves the order with its own number and a private link, then pays it once', async () => {
    const tote = await makePurse({ name: 'Camel Tote', price_cents: 5800 });
    const { lines } = await bagLines(db, parseBag(`${tote}:2`), settings());
    const order = await createOrder(db, settings(), lines, shopper, 'test', true);
    expect(order.number).toMatch(/^SHOP-1\d{3}$/);
    expect(order.total_cents).toBe(11600);
    expect(order.items).toEqual([{ name: 'Camel Tote', photo_key: `purses/${tote}/a.jpg`, unit_price_cents: 5800, quantity: 2, line_total_cents: 11600 }]);
    expect(await findOrder(db, order.number, 'wrong'.padEnd(48, '0'))).toBeNull();
    expect(await markPaid(db, order, 'test-1')).toBe(true);
    expect(await markPaid(db, order, 'test-2')).toBe(false);
    expect((await findOrder(db, order.number, order.access_key))?.status).toBe('paid');
  });

  it('puts the purses back in the bag when the shopper backs out of paying', async () => {
    const tote = await makePurse({ name: 'Camel Tote' });
    const { lines } = await bagLines(db, parseBag(`${tote}:1`), settings());
    const order = await createOrder(db, settings(), lines, shopper, 'test', true);
    const restored = await cancelUnpaid(db, order, 'The checkout was not finished.');
    expect([...restored!]).toEqual([[tote, 1]]);
    expect(await cancelUnpaid(db, order, 'again')).toBeNull();
    expect((await findOrder(db, order.number, order.access_key))?.status).toBe('cancelled');
  });

  it('refuses an empty bag', async () => {
    await expect(createOrder(db, settings(), [], shopper, 'test', true)).rejects.toThrow('The bag is empty.');
  });
});
