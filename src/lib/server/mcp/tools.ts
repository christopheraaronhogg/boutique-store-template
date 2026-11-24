import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Product } from '$lib/server/catalog';
import { moneyShort } from '$lib/money';
import { loadSettings } from '$lib/server/settings';
import { fullAddress } from '$lib/settings';
import { moveOrder, nextStatuses, ownerOrder, ownerOrders, type Order, type OrderStatus } from '$lib/server/orders';
import { MAX_PHOTOS_PER_CALL, PhotoProblem, pictureFrom } from '$lib/server/owner/images';
import { clearStorePhoto, setStorePhoto, STORE_PHOTO_SPOTS } from '$lib/server/owner/storePhotos';
import { addPhotos, changePurse, clearSamples, coverPhoto, createPurse, listPurses, OwnerProblem, purse, removePhoto, styles } from '$lib/server/owner/purses';
import { changeSettings, describeEditable, EDITABLE_SECTIONS } from '$lib/server/owner/settings';
import { applySetup, BRAND_IMAGES } from '$lib/server/owner/setup';
import { addedPurse, beforeChange, recentChanges, recordChange, undoChange, type Targets } from '$lib/server/owner/history';
import { makeUploadLink, UPLOAD_LINK_HOURS } from '$lib/server/owner/uploads';

export type ToolContext = { db: D1Database; bucket: R2Bucket; origin: string; fetcher?: typeof fetch };

export const MAX_CALL_BYTES = 24 * 1024 * 1024;

const photo = z
  .object({
    url: z.string().optional().describe('A public https link to the photo. Preferred when you have one.'),
    data: z.string().optional().describe('The photo itself as base64 (a data: URL is fine). Send one photo per call this way; for photos over about 2 MB use photo_upload_link.'),
    mime_type: z.string().optional().describe('image/jpeg, image/png or image/webp.'),
  })
  .describe('One photo: give either url or data.');

const setupPhoto = photo.strict();
const photos = z.array(photo).max(MAX_PHOTOS_PER_CALL);
const status = z.enum(['live', 'draft', 'hidden']);

export const CHANGE_GUIDE: { she_says: string; do: string }[] = [
  { she_says: 'Add this purse (with photos and a price)', do: 'add_purse with name, price, description, style and photos' },
  { she_says: 'Change a price, name or description / put it on sale', do: 'list_purses search:"<words>" to find it, then update_purse (sale_price; null ends the sale)' },
  { she_says: 'This one sold / take it down / put it back up', do: 'update_purse sold:true, or status "hidden" / "live"' },
  { she_says: 'Add more photos / use this as the main photo', do: 'add_photos (as_cover:true for the main photo), or set_cover_photo' },
  { she_says: 'Use this picture of me on the site', do: 'set_store_photo spot:"about"' },
  { she_says: 'Change the big photo at the top of the site', do: 'set_store_photo spot:"home"' },
  { she_says: 'Change my hours', do: 'update_store_settings section:"hours" changes:[{label:"Monday – Friday", value:"10 AM – 5 PM"}, …] (send the whole list)' },
  { she_says: "We're closed on a day", do: 'update_store_settings section:"closures" changes:[{date:"2026-12-25", note:"Christmas"}] (send the whole list)' },
  { she_says: 'Announce a sale or event', do: 'update_store_settings section:"banner" changes:{enabled:true, headline:"…", text:"…", starts_on:"2026-12-01", ends_on:"2026-12-24"}' },
  { she_says: 'Change my story / the About section', do: 'update_store_settings section:"about" changes:{story:"<her words>"} (only words she gave you)' },
  { she_says: 'Change the words at the top of the home page', do: 'update_store_settings section:"home" changes:{hero_title, hero_script, hero_text}' },
  { she_says: 'New phone number, address or Facebook link', do: 'update_store_settings section:"store"' },
  { she_says: 'Pickup instructions / return policy', do: 'update_store_settings section:"fulfillment" {pickup_instructions} or section:"policies" {returns}' },
  { she_says: 'How long special orders take / hide sold purses', do: 'update_store_settings section:"catalog" {lead_time, show_sold}' },
  { she_says: 'Change the colors or the script font', do: 'update_store_settings section:"theme" changes:{hot:"#e0177c", font_script:"Allura"} (colors are #rrggbb)' },
  { she_says: 'Set up my new store (first time)', do: 'setup_store with the whole store profile in one call, after she says it looks right' },
  { she_says: 'Undo that / put it back the way it was', do: 'undo_change (no id undoes her last change; it puts back exactly what was there before)' },
  { she_says: 'What did we change? / undo the price change from yesterday', do: 'recent_changes, then undo_change change_id:<id>' },
  { she_says: 'What orders do I have?', do: 'list_orders (open orders by default)' },
  { she_says: 'I ordered it / it came in / they picked it up', do: 'update_order status "ordered" / "ready" / "picked_up"' },
];

const GUIDE_TEXT = CHANGE_GUIDE.map((g) => `- "${g.she_says}" → ${g.do}`).join('\n');

export const SERVER_INSTRUCTIONS = `This connector runs the owner's online purse store (made-to-order purses, store pickup only). Everything she asks to change on her website is a tool call here, and it shows on the site right away: no code, no deploy.
If you're not sure how to do something, call what_can_i_change first: it lists every kind of change with the exact field names and the store's current values.

What she says → what to call:
${GUIDE_TEXT}

Adding a purse: from her photos, suggest a short name and a warm two-paragraph description, pick the style from store_summary, and use the price she gave. Unless she already said to post it, show her the name, price and description in one message and ask before calling add_purse. Send one photo with add_purse and the rest with add_photos, one per call. If a photo is more than about 2 MB, or she has several, give her the photo upload link (photo_upload_link) instead: the store handles big photos best that way. A call over 24 MB is refused. If you can't pass photos, call add_purse without them: the purse waits as a draft, and the link it returns lets her pick the photos on her phone, which puts it on the site.
Prices are in US dollars. "sold" marks a one-of-a-kind purse as sold; "hidden" takes it off the site. Sample purses are placeholders; offer to remove them with remove_sample_purses once she has her own.
Orders: move an order to "ordered" when she orders it from her supplier, "ready" when it arrives, and "picked_up" when the customer has it. Only cancel an order when she asks to.
Undo: every change to purses, photos and store settings is saved in a history. When she says "undo that", "put it back" or "I liked it better before", call undo_change: with no id it undoes her most recent change, and you can undo again to step further back. To undo something older, call recent_changes and pass its change_id. Undoing an undo puts the change back. If undo_change says something was changed again since, tell her in plain words and undo the later change first. Order changes and emails to customers can't be undone. Changes to the website's code are not in this history; whoever set up her store rolls those back.
After a change, give her the website link so she can see it. If something she wants isn't in this list (a new kind of page or a different layout), tell her it's not something you can change yet and that whoever set up her store can add it.`;

export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'boutique-store', version: '1.0.0' }, { instructions: SERVER_INSTRUCTIONS });
  const run = (fn: () => Promise<unknown>) => answer(fn);
  const tracked = async <T>(tool: string, targets: Targets, fn: () => Promise<T>, summary: (result: T) => string): Promise<T | (T & { change_id: number })> => {
    const pending = await beforeChange(ctx.db, targets);
    const result = await fn();
    const id = await recordChange(ctx.db, tool, summary(result), pending);
    return id !== null && result !== null && typeof result === 'object' && !Array.isArray(result) ? { ...result, change_id: id } : result;
  };
  const photoPurse = async (photoId: number) => {
    const row = await ctx.db.prepare('SELECT product_id FROM photos WHERE id = ?').bind(photoId).first<{ product_id: number }>();
    if (!row) throw new OwnerProblem(`There is no photo with id ${photoId}.`);
    return row.product_id;
  };

  server.registerTool(
    'what_can_i_change',
    {
      title: 'What can I change?',
      description:
        'Start here when unsure. Lists every change the owner can make to her store, the tool that does each one, and every settings section with its exact field names and current values.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => ({
        website: ctx.origin,
        how_it_works: 'Every change below is live on the website as soon as the tool returns. Settings: send only the fields that change, except hours and closures, which take the whole list.',
        undo: 'Changes to purses, photos and settings can be undone: undo_change puts back her last change, recent_changes lists older ones with their change_id.',
        changes: CHANGE_GUIDE,
        settings_now: describeEditable(await loadSettings(ctx.db)),
        not_possible_yet: 'New kinds of pages and layout. Tell her whoever set up her store can add these.',
      })),
  );

  server.registerTool(
    'store_summary',
    {
      title: 'Store summary',
      description: 'How many purses are live, drafts, hidden, sold or samples; the purse styles; orders that need attention; and the store address and phone.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const counts = await ctx.db
          .prepare(
            `SELECT SUM(status = 'live') AS live, SUM(status = 'draft') AS drafts, SUM(status = 'hidden') AS hidden, SUM(sold_out = 1) AS sold, SUM(is_sample = 1) AS samples FROM products`,
          )
          .first<Record<string, number | null>>();
        const open = await ctx.db.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE status IN ('paid', 'ordered', 'ready') GROUP BY status").all<{ status: string; n: number }>();
        const s = await loadSettings(ctx.db);
        return {
          store: s.store.name,
          website: ctx.origin,
          address: fullAddress(s),
          phone: s.store.phone,
          purses: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, v ?? 0])),
          styles: (await styles(ctx.db)).map((st) => st.name),
          open_orders: Object.fromEntries(open.results.map((r) => [r.status, r.n])),
          made_to_order: s.catalog.made_to_order,
          lead_time: s.catalog.lead_time,
        };
      }),
  );

  server.registerTool(
    'list_purses',
    {
      title: 'List purses',
      description: 'List purses in the store, newest first in shelf order. Filter by status or search by words in the name or description.',
      inputSchema: {
        filter: z.enum(['all', 'live', 'draft', 'hidden', 'sold', 'samples']).default('all'),
        search: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    ({ filter, search, limit }) => run(async () => (await listPurses(ctx.db, filter, search ?? '', limit)).map((p) => card(ctx, p, false))),
  );

  server.registerTool(
    'get_purse',
    {
      title: 'Get a purse',
      description: 'Everything about one purse, including its photo ids and links.',
      inputSchema: { purse_id: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    ({ purse_id }) => run(async () => card(ctx, await purse(ctx.db, purse_id), true)),
  );

  server.registerTool(
    'add_purse',
    {
      title: 'Add a purse',
      description:
        'Add a new purse with its photos. With photos it goes live on the website right away unless status is "draft". Without photos it waits as a draft and returns a phone upload link; when she adds photos there, it goes live.',
      inputSchema: {
        name: z.string().min(2).max(120).describe('Short name shoppers see, like "Camel Pebbled Leather Tote".'),
        price: z.number().positive().describe('Price in US dollars, like 58.'),
        description: z.string().max(4000).default('').describe('Two short warm paragraphs about the purse.'),
        style: z.string().optional().describe('One of the store styles from store_summary, like Totes or Crossbody.'),
        sale_price: z.number().positive().optional().describe('Optional lower sale price in dollars.'),
        status: status.default('live'),
        photos: photos.default([]).describe('The purse photos; the first is the cover. One or two per call when sending base64.'),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    (args) =>
      run(async () => {
        const pending = await beforeChange(ctx.db, {});
        const created = await createPurse(ctx.db, { ...args, status: 'draft' });
        addedPurse(pending, created.id);
        const result = await addPhotos(ctx.db, ctx.bucket, created.id, args.photos, false, ctx.fetcher);
        if (result.added.length > 0) {
          const fresh = args.status === 'draft' ? created : await changePurse(ctx.db, created.id, { status: args.status });
          const change_id = await recordChange(ctx.db, 'add_purse', `Added purse "${created.name}"`, pending);
          return { purse: card(ctx, await purse(ctx.db, fresh.id), true), photo_problems: result.problems, change_id };
        }
        if (args.status === 'hidden') await changePurse(ctx.db, created.id, { status: 'hidden' });
        const link = await makeUploadLink(ctx.db, ctx.origin, created.id, args.status === 'live');
        const change_id = await recordChange(ctx.db, 'add_purse', `Added purse "${created.name}"`, pending);
        return {
          change_id,
          purse: card(ctx, await purse(ctx.db, created.id), true),
          photo_problems: result.problems,
          photo_upload_link: link,
          note: args.status === 'live' ? 'Saved as a draft with no photos. Send the owner the photo upload link; it goes live when she adds photos there.' : 'Saved with no photos. Send the owner the photo upload link.',
        };
      }),
  );

  server.registerTool(
    'update_purse',
    {
      title: 'Change a purse',
      description:
        'Change a purse: name, price, sale price (null removes the sale), description, style, status (live, draft, hidden), sold (true marks it sold), or position (lower shows first). Only send what changes.',
      inputSchema: {
        purse_id: z.number().int(),
        name: z.string().min(2).max(120).optional(),
        price: z.number().positive().optional(),
        sale_price: z.number().positive().nullable().optional(),
        description: z.string().max(4000).optional(),
        style: z.string().nullable().optional(),
        status: status.optional(),
        sold: z.boolean().optional(),
        position: z.number().int().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ purse_id, ...changes }) =>
      run(() =>
        tracked(
          'update_purse',
          { purses: [purse_id] },
          async () => card(ctx, await changePurse(ctx.db, purse_id, changes), true),
          (c) => `Changed purse "${c.name}" (${Object.keys(changes).join(', ')})`,
        ),
      ),
  );

  server.registerTool(
    'add_photos',
    {
      title: 'Add photos to a purse',
      description: 'Add up to 10 photos to an existing purse. Set as_cover to put them first.',
      inputSchema: { purse_id: z.number().int(), photos: photos.min(1), as_cover: z.boolean().default(false) },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    ({ purse_id, photos: list, as_cover }) =>
      run(async () => {
        let added = 0;
        return tracked(
          'add_photos',
          { purses: [purse_id] },
          async () => {
            const result = await addPhotos(ctx.db, ctx.bucket, purse_id, list, as_cover, ctx.fetcher);
            added = result.added.length;
            return { purse: card(ctx, await purse(ctx.db, purse_id), true), photo_problems: result.problems };
          },
          (r) => `Added ${added} photo${added === 1 ? '' : 's'} to "${r.purse.name}"${as_cover ? ' as the cover' : ''}`,
        );
      }),
  );

  server.registerTool(
    'photo_upload_link',
    {
      title: 'Phone photo upload link',
      description: `A private link the owner opens on her phone to pick photos for a purse. Works for ${UPLOAD_LINK_HOURS} hours. Use it when photos can't be sent through this connector.`,
      inputSchema: { purse_id: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ purse_id }) => run(() => makeUploadLink(ctx.db, ctx.origin, purse_id)),
  );

  server.registerTool(
    'set_cover_photo',
    {
      title: 'Choose the cover photo',
      description: 'Make one photo the first (cover) photo of its purse.',
      inputSchema: { photo_id: z.number().int() },
      annotations: { idempotentHint: true, destructiveHint: false },
    },
    ({ photo_id }) =>
      run(async () => {
        const product_id = await photoPurse(photo_id);
        return tracked(
          'set_cover_photo',
          { purses: [product_id] },
          async () => {
            await coverPhoto(ctx.db, photo_id);
            return card(ctx, await purse(ctx.db, product_id), true);
          },
          (c) => `Changed the cover photo of "${c.name}"`,
        );
      }),
  );

  server.registerTool(
    'remove_photo',
    {
      title: 'Remove a photo',
      description: 'Take one photo off a purse. undo_change puts it back.',
      inputSchema: { photo_id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    ({ photo_id }) =>
      run(async () => {
        const product_id = await photoPurse(photo_id);
        return tracked(
          'remove_photo',
          { purses: [product_id] },
          async () => {
            await removePhoto(ctx.db, photo_id);
            return card(ctx, await purse(ctx.db, product_id), true);
          },
          (c) => `Removed a photo from "${c.name}"`,
        );
      }),
  );

  server.registerTool(
    'remove_sample_purses',
    {
      title: 'Remove the sample purses',
      description: 'Delete the placeholder sample purses that came with the store. Her own purses are not touched. Ask the owner first.',
      inputSchema: { confirm: z.literal(true).describe('Set to true once the owner has said yes.') },
      annotations: { destructiveHint: true },
    },
    () =>
      run(async () => {
        const { results } = await ctx.db.prepare('SELECT id FROM products WHERE is_sample = 1').all<{ id: number }>();
        return tracked(
          'remove_sample_purses',
          { purses: results.map((r) => r.id) },
          async () => ({ removed: await clearSamples(ctx.db) }),
          (r) => `Removed ${r.removed} sample purse${r.removed === 1 ? '' : 's'}`,
        );
      }),
  );

  server.registerTool(
    'list_orders',
    {
      title: 'List orders',
      description: 'Orders, newest first. "open" (the default) means paid orders that still need ordering, are waiting to arrive, or are ready for pickup.',
      inputSchema: {
        filter: z.enum(['open', 'all', 'pending_payment', 'paid', 'ordered', 'ready', 'picked_up', 'cancelled']).default('open'),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    ({ filter, limit }) => run(async () => (await ownerOrders(ctx.db, filter, limit)).map(orderCard)),
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get an order',
      description: 'One order by its number, like SHOP-1004.',
      inputSchema: { number: z.string().min(3).max(30) },
      annotations: { readOnlyHint: true },
    },
    ({ number }) =>
      run(async () => {
        const order = await ownerOrder(ctx.db, number);
        if (!order) throw new OwnerProblem(`There is no order ${number}.`);
        return orderCard(order);
      }),
  );

  server.registerTool(
    'update_order',
    {
      title: 'Move an order along',
      description:
        'Change an order\'s status: "ordered" (ordered from the supplier), "ready" (in the store for pickup), or "picked_up" (the customer has it).',
      inputSchema: {
        number: z.string().min(3).max(30),
        status: z.enum(['ordered', 'ready', 'picked_up']),
      },
      annotations: { destructiveHint: false },
    },
    ({ number, status: to }) => run(async () => orderCard(await ownerMove(ctx.db, number, to))),
  );

  server.registerTool(
    'cancel_order',
    {
      title: 'Cancel an order',
      description: 'Cancel an order. This cannot be undone, and a paid order must also be refunded where it was paid. Only do this when the owner asks, and confirm the order number with her first.',
      inputSchema: { number: z.string().min(3).max(30), reason: z.string().min(2).max(300).describe('Shown to the customer, like "This purse is no longer made."') },
      annotations: { destructiveHint: true },
    },
    ({ number, reason }) => run(async () => orderCard(await ownerMove(ctx.db, number, 'cancelled', reason))),
  );

  server.registerTool(
    'get_store_settings',
    {
      title: 'Store settings',
      description: `Everything on the website she can change in words, with current values: ${EDITABLE_SECTIONS.join(', ')}. Store is name, address, phone and links; home is the words at the top of the home page; about is her Meet section; banner is the announcement bar; hours are her open hours; closures are days the shop is closed; fulfillment is pickup instructions; policies is the return policy; catalog is lead time and showing sold purses.`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(async () => describeEditable(await loadSettings(ctx.db))),
  );

  server.registerTool(
    'update_store_settings',
    {
      title: 'Change store settings',
      description:
        'Change one part of the website. For store, home, about, banner, fulfillment, policies and catalog, send only the fields that change, using the names from get_store_settings or what_can_i_change. For hours and closures, send the whole new list. Examples: {section:"banner", changes:{enabled:true, headline:"Black Friday", text:"20% off all totes", ends_on:"2026-11-30"}}; {section:"hours", changes:[{label:"Monday – Saturday", value:"10 AM – 6 PM"}, {label:"Sunday", value:"Closed"}]}; {section:"closures", changes:[{date:"2026-12-25", note:"Merry Christmas"}]}; {section:"store", changes:{phone:"(870) 555-0100"}}. It is live on the site as soon as this returns.',
      inputSchema: {
        section: z.enum(EDITABLE_SECTIONS),
        changes: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ section, changes }) =>
      run(() => tracked('update_store_settings', { settings: [section] }, () => changeSettings(ctx.db, section, changes), () => `Changed the store's ${section} settings`)),
  );

  server.registerTool(
    'set_store_photo',
    {
      title: 'Set the owner photo or the top photo',
      description:
        'Put a photo on the store outside the purses: spot "about" is the owner\'s own photo in the Meet section, spot "home" is the big photo at the top of the home page. Send remove: true instead of a photo to take it down.',
      inputSchema: {
        spot: z.enum(STORE_PHOTO_SPOTS),
        photo: photo.optional(),
        remove: z.boolean().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ spot, photo: input, remove }) =>
      run(async () => {
        const label = spot === 'about' ? 'owner photo' : 'top photo on the home page';
        if (remove) {
          return tracked('set_store_photo', { settings: [spot] }, async () => {
            await clearStorePhoto(ctx.db, spot);
            return { spot, photo: null };
          }, () => `Took down the ${label}`);
        }
        if (!input) throw new OwnerProblem('Send a photo, or remove: true.');
        const picture = await pictureFrom(input, ctx.fetcher);
        return tracked('set_store_photo', { settings: [spot] }, async () => {
          const key = await setStorePhoto(ctx.db, ctx.bucket, spot, picture);
          return { spot, photo: `${ctx.origin}/photos/${key}`, website: ctx.origin };
        }, () => `Changed the ${label}`);
      }),
  );

  server.registerTool(
    'setup_store',
    {
      title: 'Set up the whole store at once',
      description:
        'First-time setup: applies the whole store profile in one call (name, address, phone, hours, words, colors, logos, owner photo, top photo). Read the profile back to the owner and get her yes before calling. Each section takes the same fields as update_store_settings (see what_can_i_change). Nothing is saved unless every part is valid, so fix what the error names and send it again. store_setup holds fields only set here: order_prefix (like "TTL-"), header_name, email_from_name, notify_emails (where new-order emails go), logo_wide. Images take a url or base64 data, like photos.',
      inputSchema: z.strictObject({
        sections: z
          .strictObject(Object.fromEntries(EDITABLE_SECTIONS.map((s) => [s, z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]).optional()])))
          .optional()
          .describe('Settings sections to change, keyed by section name. hours and closures take the whole list.'),
        store_setup: z
          .strictObject({
            order_prefix: z.string().optional(),
            header_name: z.string().optional(),
            email_from_name: z.string().optional(),
            notify_emails: z.array(z.string()).optional(),
            logo_wide: z.boolean().optional(),
          })
          .optional(),
        brand_images: z
          .strictObject(Object.fromEntries(BRAND_IMAGES.map((f) => [f, setupPhoto.optional()])))
          .optional()
          .describe('logo (main logo), logo_mark (small mark beside the name), logo_tall, logo_footer, icon (browser tab icon, square).'),
        owner_photo: setupPhoto.optional().describe('The owner\'s own photo for the Meet section.'),
        top_photo: setupPhoto.optional().describe('The big photo at the top of the home page.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    (profile) =>
      run(async () => {
        const done = await tracked('setup_store', { settings: 'all' }, () => applySetup(ctx.db, ctx.bucket, profile, ctx.fetcher), (r) => `Set up the store (${r.changed.join(', ') || 'no changes'})`);
        return { ...done, website: ctx.origin, settings_now: describeEditable(await loadSettings(ctx.db)) };
      }),
  );

  server.registerTool(
    'recent_changes',
    {
      title: 'Recent changes',
      description:
        'The latest changes made to purses, photos and store settings through this connector, newest first: what changed (old → new), when, whether it was undone, and whether it can be undone now. Use it when she asks what was changed, or to find the change_id for an older undo.',
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: { readOnlyHint: true },
    },
    ({ limit }) => run(async () => ({ changes: await recentChanges(ctx.db, limit) })),
  );

  server.registerTool(
    'undo_change',
    {
      title: 'Undo a change',
      description:
        'Put back exactly what was there before a change to a purse, its photos or the store settings. With no change_id it undoes her most recent change still in effect; call it again to step further back. Pass a change_id from recent_changes to undo an older one; undoing an undo puts the change back. If the same thing was changed again since, it explains which change to undo first. Undoing an added purse hides it from the website. Orders and customer emails are not undone.',
      inputSchema: { change_id: z.number().int().optional() },
      annotations: { destructiveHint: false },
    },
    ({ change_id }) => run(async () => ({ ...(await undoChange(ctx.db, change_id)), website: ctx.origin })),
  );

  return server;
}

async function ownerMove(db: D1Database, number: string, to: OrderStatus, reason = ''): Promise<Order> {
  try {
    return await moveOrder(db, number, to, reason);
  } catch (e) {
    throw new OwnerProblem((e as Error).message);
  }
}

function card(ctx: ToolContext, p: Product, full: boolean) {
  return {
    id: p.id,
    name: p.name,
    price: moneyShort(p.price_cents),
    sale_price: p.sale_price_cents ? moneyShort(p.sale_price_cents) : null,
    status: p.status,
    sold: p.sold_out,
    sample: p.is_sample,
    style: p.category_name,
    link: `${ctx.origin}/p/${p.slug}`,
    ...(full
      ? { description: p.description, photos: p.photos.map((ph) => ({ id: ph.id, url: `${ctx.origin}/photos/${ph.key}` })) }
      : { photo_count: p.photos.length }),
  };
}

function orderCard(o: Order) {
  return {
    number: o.number,
    status: o.status,
    can_move_to: nextStatuses(o.status),
    test_order: o.is_test,
    customer: { name: o.customer_name, email: o.email, phone: o.phone, note: o.customer_note || null },
    items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, line_total: moneyShort(i.line_total_cents) })),
    total: moneyShort(o.total_cents),
    placed: o.created_at,
    paid: o.paid_at,
    cancel_reason: o.cancel_reason,
  };
}

async function answer(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
  } catch (e) {
    if (e instanceof OwnerProblem || e instanceof PhotoProblem) return { isError: true, content: [{ type: 'text', text: e.message }] };
    throw e;
  }
}
