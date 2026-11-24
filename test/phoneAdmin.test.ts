import { describe, expect, it } from 'vitest';
import { recentChanges } from '$lib/server/owner/history';
import { quickChanges } from '$lib/server/admin/purseForm';
import { tracked, undoFromForm } from '$lib/server/admin/tracked';
import { changePurse, listPurses, movePhoto, movePurse, OwnerProblem, photoOrder, planMove, purse, purseOrder } from '$lib/server/owner/purses';
import { shrunkSize } from '$lib/shrinkPhoto';
import { db, makePurse } from './helpers';

const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

function apply(rows: { id: number; pos: number }[], plan: Map<number, number>) {
  return rows.map((r) => ({ id: r.id, pos: plan.get(r.id) ?? r.pos })).sort((a, b) => a.pos - b.pos || b.id - a.id);
}

describe('planning a move', () => {
  const rows = [
    { id: 30, pos: 1 },
    { id: 20, pos: 2 },
    { id: 10, pos: 3 },
  ];

  it('swaps two neighbors and touches only those two', () => {
    const plan = planMove(rows, 10, 20);
    expect([...plan.keys()].sort()).toEqual([10, 20]);
    expect(ids(apply(rows, plan))).toEqual([30, 10, 20]);
  });

  it('puts one at the front by itself', () => {
    const plan = planMove(rows, 10, 'top');
    expect([...plan.keys()]).toEqual([10]);
    expect(ids(apply(rows, plan))).toEqual([10, 30, 20]);
    expect(planMove(rows, 30, 'top').size).toBe(0);
  });

  it('numbers everything in order when places are tied, so the swap is exact', () => {
    const tied = [
      { id: 9, pos: 0 },
      { id: 8, pos: 0 },
      { id: 7, pos: 0 },
    ];
    expect(ids(apply(tied, planMove(tied, 7, 8)))).toEqual([9, 7, 8]);
  });

  it('leaves ties elsewhere in the list alone', () => {
    const list = [
      { id: 2, pos: 0 },
      { id: 1, pos: 0 },
      { id: 3, pos: 5 },
      { id: 4, pos: 6 },
      { id: 5, pos: 9 },
    ];
    const plan = planMove(list, 4, 3);
    expect([...plan.keys()].sort()).toEqual([3, 4]);
    expect(ids(apply(list, plan))).toEqual([2, 1, 4, 3, 5]);
  });

  it('renumbers only the tied block when it fits between its neighbors', () => {
    const list = [
      { id: 1, pos: 1 },
      { id: 4, pos: 10 },
      { id: 3, pos: 10 },
      { id: 2, pos: 10 },
      { id: 5, pos: 20 },
    ];
    const plan = planMove(list, 2, 3);
    expect(plan.has(1) || plan.has(5)).toBe(false);
    expect(ids(apply(list, plan))).toEqual([1, 4, 2, 3, 5]);
  });

  it('renumbers everything only when the tied block has no room', () => {
    const list = [
      { id: 1, pos: 1 },
      { id: 3, pos: 2 },
      { id: 2, pos: 2 },
      { id: 4, pos: 3 },
    ];
    expect(ids(apply(list, planMove(list, 2, 3)))).toEqual([1, 2, 3, 4]);
  });

  it('refuses ids that are not in the list', () => {
    expect(() => planMove(rows, 99, 10)).toThrow(OwnerProblem);
    expect(() => planMove(rows, 10, 99)).toThrow(OwnerProblem);
  });
});

describe('arranging purses from the phone', () => {
  it('moves a purse up the shop and undo puts it back', async () => {
    await db.prepare('UPDATE products SET position = position + 1000').run();
    const a = await makePurse({ name: 'Arrange A', position: 1 });
    const b = await makePurse({ name: 'Arrange B', position: 2 });
    const c = await makePurse({ name: 'Arrange C', position: 3 });
    const firstThree = async () => ids(await listPurses(db, 'all', 'Arrange', 10));
    expect(await firstThree()).toEqual([a, b, c]);

    const plan = planMove(await purseOrder(db), c, b);
    const { change_id } = await tracked(db, { purses: [...plan.keys()] }, () => movePurse(db, plan), () => 'Moved "Arrange C"');
    expect(await firstThree()).toEqual([a, c, b]);

    const form = new FormData();
    form.set('change_id', String(change_id));
    expect(await undoFromForm(db, form)).toMatchObject({ done: 'Undid: Moved "Arrange C".', undo_label: 'Redo' });
    expect(await firstThree()).toEqual([a, b, c]);

    await movePurse(db, planMove(await purseOrder(db), c, 'top'));
    expect(await firstThree()).toEqual([c, a, b]);
  });

  it('keeps undo working when one move touches more than 90 purses with several photos each', async () => {
    await db.prepare('UPDATE products SET position = 0').run();
    for (let i = 0; i < 95; i++) {
      const bulk = await makePurse({ name: `Bulk ${i}`, position: 0 });
      await db.prepare('INSERT INTO photos (product_id, key, width, height, sort) VALUES (?, ?, 800, 1000, 1), (?, ?, 800, 1000, 2)').bind(bulk, `purses/${bulk}/b.jpg`, bulk, `purses/${bulk}/c.jpg`).run();
    }
    const order = await purseOrder(db);
    const plan = planMove(order, order[1].id, order[0].id);
    expect(plan.size).toBeGreaterThan(90);
    const { change_id } = await tracked(db, { purses: [...plan.keys()] }, () => movePurse(db, plan), () => 'Moved many');
    expect(ids(await purseOrder(db)).slice(0, 2)).toEqual([order[1].id, order[0].id]);
    expect((await recentChanges(db, 1))[0]).toMatchObject({ id: change_id, can_undo: true });
    const form = new FormData();
    form.set('change_id', String(change_id));
    expect(await undoFromForm(db, form)).toMatchObject({ done: 'Undid: Moved many.' });
    expect(ids(await purseOrder(db)).slice(0, 2)).toEqual([order[0].id, order[1].id]);
  });

  it('reorders photos within one purse', async () => {
    const id = await makePurse({ name: 'Photo Order' });
    await db.prepare('INSERT INTO photos (product_id, key, width, height, sort) VALUES (?, ?, 800, 1000, 5), (?, ?, 800, 1000, 6)').bind(id, `purses/${id}/b.jpg`, id, `purses/${id}/c.jpg`).run();
    const before = await photoOrder(db, id);
    expect(before).toHaveLength(3);
    await movePhoto(db, planMove(before, before[2].id, before[1].id));
    expect(ids(await photoOrder(db, id))).toEqual([before[0].id, before[2].id, before[1].id]);
    expect((await purse(db, id)).photos.map((p) => p.id)).toEqual([before[0].id, before[2].id, before[1].id]);
  });
});

describe('quick changes on the purse list', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it('reads each button', () => {
    expect(quickChanges(form({ what: 'sold' })).changes).toEqual({ sold: true });
    expect(quickChanges(form({ what: 'unsold' })).changes).toEqual({ sold: false });
    expect(quickChanges(form({ what: 'hide' })).changes).toEqual({ status: 'hidden' });
    expect(quickChanges(form({ what: 'show' })).changes).toEqual({ status: 'live' });
    expect(quickChanges(form({ what: 'price', price: '$62', sale_price: '' })).changes).toEqual({ price: 62, sale_price: null });
    expect(quickChanges(form({ what: 'price', price: '62', sale_price: '49.50' })).changes).toEqual({ price: 62, sale_price: 49.5 });
    expect(() => quickChanges(form({ what: 'price', price: '' }))).toThrow(OwnerProblem);
    expect(() => quickChanges(form({ what: 'delete' }))).toThrow(OwnerProblem);
  });

  it('marks a purse sold, and the Undo button puts it back', async () => {
    const id = await makePurse({ name: 'Quick Sold' });
    const { changes } = quickChanges(form({ what: 'sold' }));
    const { change_id } = await tracked(db, { purses: [id] }, () => changePurse(db, id, changes), (p) => `Changed purse "${p.name}" (sold)`);
    expect((await purse(db, id)).sold_out).toBe(true);
    const undone = await undoFromForm(db, form({ change_id: String(change_id) }));
    expect(undone).toMatchObject({ done: 'Undid: Changed purse "Quick Sold" (sold).' });
    expect((await purse(db, id)).sold_out).toBe(false);
    const redo = await undoFromForm(db, form({ change_id: String((undone as { change_id: number }).change_id) }));
    expect(redo).toMatchObject({ done: 'Put back: Changed purse "Quick Sold" (sold).' });
    expect((await purse(db, id)).sold_out).toBe(true);
  });

  it('explains when an undo is not possible', async () => {
    const r = await undoFromForm(db, form({ change_id: '999999' }));
    expect(r).toMatchObject({ status: 409 });
  });
});

describe('phone photos', () => {
  it('shrinks big camera photos to 2000 pixels on the long side and leaves small ones', () => {
    expect(shrunkSize(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(shrunkSize(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(shrunkSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });
});
