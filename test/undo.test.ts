import { describe, expect, it } from 'vitest';
import { ownerToolCall } from '$lib/server/mcp/webmcp';
import { loadSettings } from '$lib/server/settings';
import { purse } from '$lib/server/owner/purses';
import { base64, db, jpeg, makePurse, store } from './helpers';

const base = 'https://shop.example';

async function tool(name: string, args: Record<string, unknown> = {}) {
  const res = await ownerToolCall(
    new Request(`${base}/admin/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: base },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }),
    store,
    true,
  );
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  const text = body.result.content[0].text;
  return body.result.isError ? { error: text } : JSON.parse(text);
}

describe('undo for Muse', () => {
  it('undoes the last price change, and undoing the undo puts it back', async () => {
    const id = await makePurse({ name: 'Undo Tote', price_cents: 5800 });
    const changed = await tool('update_purse', { purse_id: id, price: 48, sale_price: 40 });
    expect(changed.change_id).toBeGreaterThan(0);
    expect((await purse(db, id)).price_cents).toBe(4800);

    const recent = (await tool('recent_changes')).changes;
    expect(recent[0]).toMatchObject({ id: changed.change_id, what: 'Changed purse "Undo Tote" (price, sale_price)', can_undo: true, undone: false });
    expect(recent[0].changed).toEqual(expect.arrayContaining(['Undo Tote price_cents: 5800 → 4800', 'Undo Tote sale_price_cents: none → 4000']));

    const undone = await tool('undo_change');
    expect(undone.undid).toMatchObject({ id: changed.change_id, undone: true });
    expect(await purse(db, id)).toMatchObject({ price_cents: 5800, sale_price_cents: null });

    await tool('undo_change', { change_id: undone.undo_id });
    expect(await purse(db, id)).toMatchObject({ price_cents: 4800, sale_price_cents: 4000 });
    await tool('undo_change');
    expect((await purse(db, id)).price_cents).toBe(5800);
  });

  it('steps back through several changes in order', async () => {
    await tool('update_store_settings', { section: 'store', changes: { phone: '(870) 555-0001' } });
    await tool('update_store_settings', { section: 'hours', changes: [{ label: 'Saturday', value: '10 AM – 2 PM' }] });
    const phone = (await loadSettings(db)).store.phone;
    await tool('update_store_settings', { section: 'store', changes: { phone: '(870) 555-0002' } });
    await tool('update_store_settings', { section: 'hours', changes: [{ label: 'Sunday', value: 'Closed' }] });
    await tool('undo_change');
    expect((await loadSettings(db)).hours).toEqual([{ label: 'Saturday', value: '10 AM – 2 PM' }]);
    await tool('undo_change');
    expect((await loadSettings(db)).store.phone).toBe(phone);
  });

  it('refuses to undo an older change that was changed again, and says which one to undo first', async () => {
    const id = await makePurse({ name: 'Layered Clutch', price_cents: 3000 });
    const first = await tool('update_purse', { purse_id: id, name: 'Layered Clutch Bag' });
    const second = await tool('update_purse', { purse_id: id, price: 35 });
    const refused = await tool('undo_change', { change_id: first.change_id });
    expect(refused.error).toContain(`change ${second.change_id}`);
    expect((await purse(db, id)).name).toBe('Layered Clutch Bag');

    await db.prepare("UPDATE products SET description = 'Edited by hand.' WHERE id = ?").bind(id).run();
    const blocked = await tool('undo_change', { change_id: second.change_id });
    expect(blocked.error).toContain('admin page');
    expect((await tool('recent_changes')).changes.find((c: { id: number }) => c.id === second.change_id)).toMatchObject({ can_undo: false });
  });

  it('puts back a removed photo and the old cover', async () => {
    const id = await makePurse({ name: 'Photo Hobo' });
    const added = await tool('add_photos', { purse_id: id, photos: [{ data: base64(jpeg(800, 1000)) }], as_cover: true });
    expect(added.change_id).toBeGreaterThan(0);
    const [cover, old] = added.purse.photos;
    const removed = await tool('remove_photo', { photo_id: old.id });
    expect(removed.photos).toHaveLength(1);
    await tool('undo_change');
    expect((await purse(db, id)).photos.map((p) => p.id)).toEqual([cover.id, old.id]);
    await tool('set_cover_photo', { photo_id: old.id });
    expect((await purse(db, id)).photos[0].id).toBe(old.id);
    await tool('undo_change');
    expect((await purse(db, id)).photos[0].id).toBe(cover.id);
    await tool('undo_change');
    expect((await purse(db, id)).photos.map((p) => p.id)).toEqual([old.id]);
    expect(await store.PHOTOS.head(cover.url.split('/photos/')[1])).not.toBeNull();
  });

  it('hides an added purse instead of deleting it, and brings back removed samples', async () => {
    const added = await tool('add_purse', { name: 'Brand New Tote', price: 52, photos: [{ data: base64(jpeg(800, 1000)) }] });
    expect(added.purse.status).toBe('live');
    await tool('undo_change');
    expect((await purse(db, added.purse.id)).status).toBe('hidden');

    const sample = await makePurse({ name: 'Sample Satchel' });
    await db.prepare('UPDATE products SET is_sample = 1 WHERE id = ?').bind(sample).run();
    const before = await purse(db, sample);
    expect((await tool('remove_sample_purses', { confirm: true })).removed).toBeGreaterThan(0);
    await expect(purse(db, sample)).rejects.toThrow();
    await tool('undo_change');
    expect(await purse(db, sample)).toMatchObject({ name: 'Sample Satchel', slug: before.slug, photos: before.photos });
  });

  it('says so plainly when there is nothing to undo or the id is wrong', async () => {
    expect((await tool('undo_change', { change_id: 999999 })).error).toContain('no change number 999999');
    const noop = await tool('update_store_settings', { section: 'store', changes: {} });
    expect(noop.change_id).toBeUndefined();
  });

  it('refuses to bring back a photo whose id now belongs to another purse', async () => {
    const one = await makePurse({ name: 'First Bag' });
    const two = await makePurse({ name: 'Second Bag' });
    const added = await tool('add_photos', { purse_id: one, photos: [{ data: base64(jpeg(800, 1000)) }] });
    const photoId = added.purse.photos.at(-1).id;
    const removed = await tool('remove_photo', { photo_id: photoId });
    const other = await tool('add_photos', { purse_id: two, photos: [{ data: base64(jpeg(800, 1000)) }] });
    expect(other.purse.photos.at(-1).id).toBe(photoId);
    const refused = await tool('undo_change', { change_id: removed.change_id });
    expect(refused.error).toContain('belongs to another purse');
    expect((await purse(db, two)).photos.map((p) => p.id)).toContain(other.purse.photos.at(-1).id);
  });

  it('steps past a change whose undo changes nothing', async () => {
    const before = (await tool('recent_changes', { limit: 1 })).changes[0]?.id ?? 0;
    await tool('update_store_settings', { section: 'store', changes: { phone: '(870) 555-0303' } });
    const hidden = await tool('add_purse', { name: 'Quiet Tote', price: 10, status: 'hidden' });
    const first = await tool('undo_change');
    expect(first.undid).toMatchObject({ id: hidden.change_id, undone: true, can_undo: false });
    expect(first.undo_id).toBeGreaterThan(before);
    const second = await tool('undo_change');
    expect(second.undid.what).toBe("Changed the store's store settings");
  });

  it('keeps the history straight when an undo, its redo and the redo are undone in turn', async () => {
    const id = await makePurse({ name: 'Round Trip', price_cents: 2000 });
    const edit = await tool('update_purse', { purse_id: id, price: 30 });
    const undo = await tool('undo_change');
    const redo = await tool('undo_change', { change_id: undo.undo_id });
    expect((await purse(db, id)).price_cents).toBe(3000);
    const again = await tool('undo_change', { change_id: redo.undo_id });
    expect(again.undid.what).toMatch(/^Put back: /);
    expect((await purse(db, id)).price_cents).toBe(2000);
    const list = (await tool('recent_changes', { limit: 10 })).changes;
    expect(list.find((c: { id: number }) => c.id === edit.change_id)).toMatchObject({ undone: true });
    expect(list.map((c: { what: string }) => c.what).some((w: string) => w.includes('Put back: Put back'))).toBe(false);
  });

  it('stays right through a long chain of undo and redo', async () => {
    const id = await makePurse({ name: 'Long Chain', price_cents: 1000 });
    const edit = await tool('update_purse', { purse_id: id, price: 20 });
    let last = (await tool('undo_change')).undo_id;
    for (let step = 1; step <= 4; step++) last = (await tool('undo_change', { change_id: last })).undo_id;
    expect((await purse(db, id)).price_cents).toBe(1000);
    last = (await tool('undo_change', { change_id: last })).undo_id;
    expect((await purse(db, id)).price_cents).toBe(2000);
    const latest = await tool('undo_change');
    expect(latest.undid.id).toBe(edit.change_id);
    expect((await purse(db, id)).price_cents).toBe(1000);
  });

  it('brings back a removed sample under a new address when its old one was taken', async () => {
    const sample = await makePurse({ name: 'Taken Name' });
    await db.prepare('UPDATE products SET is_sample = 1 WHERE id = ?').bind(sample).run();
    const slug = (await purse(db, sample)).slug;
    const newer = await makePurse({ name: 'Newcomer' });
    const removed = await tool('remove_sample_purses', { confirm: true });
    expect(removed.removed).toBeGreaterThan(0);
    await db.prepare('UPDATE products SET slug = ? WHERE id = ?').bind(slug, newer).run();
    const undone = await tool('undo_change', { change_id: removed.change_id });
    expect(undone.error).toBeUndefined();
    expect((await purse(db, sample)).slug).toBe(`${slug}-${sample}`);
    expect((await purse(db, newer)).slug).toBe(slug);
  });

  it('explains when a removed sample’s number was reused by a new purse', async () => {
    const sample = await makePurse({ name: 'Reused Number' });
    await db.prepare('UPDATE products SET is_sample = 1 WHERE id = ?').bind(sample).run();
    const removed = await tool('remove_sample_purses', { confirm: true });
    const newer = await makePurse({ name: 'Took Its Number' });
    expect(newer).toBe(sample);
    expect((await tool('undo_change', { change_id: removed.change_id })).error).toContain('same number');
    expect((await purse(db, newer)).name).toBe('Took Its Number');
  });
});
