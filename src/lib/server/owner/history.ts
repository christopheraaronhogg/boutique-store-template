import { OwnerProblem } from './purses';

export type Targets = { settings?: string[] | 'all'; purses?: number[] };

type Row = Record<string, unknown>;
type PurseState = { row: Row | null; photos: Row[] };
export type State = { settings: Record<string, string | null>; purses: Record<string, PurseState> };

type Entry = { id: number; tool: string; summary: string; targets: string; before_state: string; after_state: string; undoes: number | null; undone_by: number | null; created_at: string };

export type ChangeCard = { id: number; when: string; what: string; changed: string[]; undone: boolean; is_undo: boolean; can_undo?: boolean; why_not?: string };

export const CHECKED_IN_LIST = 10;
const SNAPSHOT_CHUNK = 90;

async function selectIn<T>(db: D1Database, sql: string, values: (string | number)[]): Promise<T[]> {
  const reads: D1PreparedStatement[] = [];
  for (let i = 0; i < values.length; i += SNAPSHOT_CHUNK) {
    const chunk = values.slice(i, i + SNAPSHOT_CHUNK);
    reads.push(db.prepare(`${sql} (${chunk.map(() => '?').join(', ')})`).bind(...chunk));
  }
  if (reads.length === 0) return [];
  return (await db.batch<T>(reads)).flatMap((r) => r.results);
}

export async function snapshot(db: D1Database, targets: Targets): Promise<State> {
  const state: State = { settings: {}, purses: {} };
  const keys = targets.settings === 'all' ? null : [...new Set(targets.settings ?? [])].sort();
  const ids = [...new Set(targets.purses ?? [])].sort((a, b) => a - b);
  const reads: D1PreparedStatement[] = [];
  if (keys === null) reads.push(db.prepare('SELECT key, value FROM settings ORDER BY key'));
  else if (keys.length > 0) reads.push(db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(', ')}) ORDER BY key`).bind(...keys));
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += SNAPSHOT_CHUNK) chunks.push(ids.slice(i, i + SNAPSHOT_CHUNK));
  for (const chunk of chunks) {
    const marks = chunk.map(() => '?').join(', ');
    reads.push(db.prepare(`SELECT * FROM products WHERE id IN (${marks})`).bind(...chunk));
    reads.push(db.prepare(`SELECT * FROM photos WHERE product_id IN (${marks}) ORDER BY product_id, id`).bind(...chunk));
  }
  if (reads.length === 0) return state;
  const results = await db.batch<Row>(reads);
  let at = 0;
  if (keys === null || keys.length > 0) {
    const stored = new Map((results[at++].results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    for (const key of keys ?? [...stored.keys()]) state.settings[key] = stored.get(key) ?? null;
  }
  const rows = new Map<number, Row>();
  const photos = new Map<number, Row[]>();
  for (let c = 0; c < chunks.length; c++) {
    for (const row of results[at++].results) rows.set(Number(row.id), row);
    for (const photo of results[at++].results) {
      const owner = Number(photo.product_id);
      const list = photos.get(owner) ?? [];
      list.push(photo);
      photos.set(owner, list);
    }
  }
  for (const id of ids) state.purses[String(id)] = { row: rows.get(id) ?? null, photos: photos.get(id) ?? [] };
  return state;
}

function targetsOf(state: State): Targets {
  return { settings: Object.keys(state.settings), purses: Object.keys(state.purses).map(Number) };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function trim(before: State, after: State): [State, State] {
  const keys = [...new Set([...Object.keys(before.settings), ...Object.keys(after.settings)])].sort();
  const b: State = { settings: {}, purses: before.purses };
  const a: State = { settings: {}, purses: after.purses };
  for (const key of keys) {
    const was = before.settings[key] ?? null;
    const now = after.settings[key] ?? null;
    if (was === now) continue;
    b.settings[key] = was;
    a.settings[key] = now;
  }
  return [b, a];
}

export type Pending = { targets: Targets; state: State };

export async function beforeChange(db: D1Database, targets: Targets): Promise<Pending> {
  return { targets, state: await snapshot(db, targets) };
}

export function addedPurse(pending: Pending, id: number): Pending {
  pending.targets = { ...pending.targets, purses: [...(pending.targets.purses ?? []), id] };
  pending.state.purses[String(id)] = { row: null, photos: [] };
  return pending;
}

export async function recordChange(db: D1Database, tool: string, summary: string, pending: Pending, undoes: number | null = null): Promise<number | null> {
  const after = await snapshot(db, pending.targets);
  let [b, a] = trim(pending.state, after);
  if (same(b, a)) {
    if (undoes === null) return null;
    [b, a] = [pending.state, after];
  }
  const row = await db
    .prepare('INSERT INTO change_history (tool, summary, targets, before_state, after_state, undoes) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(tool, summary.slice(0, 300), JSON.stringify(targetsOf(a)), JSON.stringify(b), JSON.stringify(a), undoes)
    .first<{ id: number }>();
  return row!.id;
}

async function entry(db: D1Database, id: number): Promise<Entry> {
  const e = await db.prepare('SELECT * FROM change_history WHERE id = ?').bind(id).first<Entry>();
  if (!e) throw new OwnerProblem(`There is no change number ${id}. Call recent_changes to see the list.`);
  return e;
}

async function whyNot(db: D1Database, e: Entry): Promise<string | null> {
  if (e.undone_by !== null) return `It was already undone (change ${e.undone_by}).`;
  const targets = JSON.parse(e.targets) as Targets;
  const now = await snapshot(db, targets);
  if (same(now, JSON.parse(e.after_state))) return photoMoved(db, JSON.parse(e.before_state) as State);
  const after = JSON.parse(e.after_state) as State;
  if (Object.entries(after.purses).some(([id, p]) => p.row === null && (JSON.parse(e.before_state) as State).purses[id]?.row && now.purses[id]?.row)) {
    return 'A newer purse now has the same number as a purse it would bring back, so that purse can\u2019t come back. Add it again instead.';
  }
  const { results } = await db
    .prepare('SELECT id, summary, targets FROM change_history WHERE id > ? AND undone_by IS NULL ORDER BY id DESC LIMIT 50')
    .bind(e.id)
    .all<{ id: number; summary: string; targets: string }>();
  const later = results.filter((r) => overlaps(targets, JSON.parse(r.targets) as Targets));
  if (later.length > 0) return `It was changed again after that: ${later.map((r) => `change ${r.id} (${r.summary})`).join('; ')}. Undo ${later.length === 1 ? 'that one' : 'those'} first.`;
  return 'It was changed again after that, on the admin page or by the website. Make the change she wants directly instead.';
}

async function photoMoved(db: D1Database, before: State): Promise<string | null> {
  const wanted = Object.entries(before.purses).flatMap(([purseId, p]) => p.photos.map((photo) => ({ id: Number(photo.id), purseId: Number(purseId) })));
  if (wanted.length === 0) return null;
  const results = await selectIn<{ id: number; product_id: number }>(db, 'SELECT id, product_id FROM photos WHERE id IN', wanted.map((w) => w.id));
  const owner = new Map(results.map((r) => [r.id, r.product_id]));
  const taken = wanted.find((w) => owner.has(w.id) && owner.get(w.id) !== w.purseId);
  return taken ? `A photo it would bring back now belongs to another purse (purse ${owner.get(taken.id)}). Add that photo again instead.` : null;
}

function overlaps(a: Targets, b: Targets): boolean {
  const keys = new Set(a.settings === 'all' ? [] : (a.settings ?? []));
  const ids = new Set(a.purses ?? []);
  return (b.settings !== 'all' && (b.settings ?? []).some((k) => keys.has(k))) || (b.purses ?? []).some((id) => ids.has(id));
}

function restore(db: D1Database, state: State): D1PreparedStatement[] {
  const writes: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(state.settings)) {
    writes.push(
      value === null
        ? db.prepare('DELETE FROM settings WHERE key = ?').bind(key)
        : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value),
    );
  }
  const photoWrites: D1PreparedStatement[] = [];
  for (const [id, purse] of Object.entries(state.purses)) {
    if (purse.row === null) {
      writes.push(db.prepare("UPDATE products SET status = 'hidden', updated_at = datetime('now') WHERE id = ?").bind(Number(id)));
      continue;
    }
    writes.push(upsert(db, 'products', purse.row));
    const keep = purse.photos.map((p) => Number(p.id));
    photoWrites.push(
      keep.length > 0
        ? db.prepare(`DELETE FROM photos WHERE product_id = ? AND id NOT IN (${keep.map(() => '?').join(', ')})`).bind(Number(id), ...keep)
        : db.prepare('DELETE FROM photos WHERE product_id = ?').bind(Number(id)),
    );
    for (const photo of purse.photos) photoWrites.push(upsert(db, 'photos', photo));
  }
  return [...writes, ...photoWrites];
}

async function freeSlugs(db: D1Database, state: State): Promise<State> {
  const rows = Object.values(state.purses).flatMap((p) => (p.row ? [p.row] : []));
  if (rows.length === 0) return state;
  const results = await selectIn<{ id: number; slug: string }>(db, 'SELECT id, slug FROM products WHERE slug IN', rows.map((r) => String(r.slug)));
  const taken = new Map(results.map((r) => [r.slug, r.id]));
  for (const row of rows) {
    const holder = taken.get(String(row.slug));
    if (holder !== undefined && holder !== Number(row.id)) row.slug = `${String(row.slug)}-${String(row.id)}`;
  }
  return state;
}

function upsert(db: D1Database, table: 'products' | 'photos', row: Row): D1PreparedStatement {
  const cols = Object.keys(row);
  if (!cols.every((c) => /^[a-z_]+$/.test(c))) throw new OwnerProblem('That change has an unexpected shape and cannot be undone.');
  const sets = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${sets.join(', ')}`)
    .bind(...cols.map((c) => row[c] as string | number | null));
}

const UNDID = 'Undid: ';
const PUT_BACK = 'Put back: ';

function undoSummary(summary: string): string {
  if (summary.startsWith(UNDID)) return `${PUT_BACK}${summary.slice(UNDID.length)}`;
  if (summary.startsWith(PUT_BACK)) return `${UNDID}${summary.slice(PUT_BACK.length)}`;
  return `${UNDID}${summary}`;
}

export async function undoChange(db: D1Database, id?: number): Promise<{ undid: ChangeCard; undo_id: number | null }> {
  let e: Entry;
  if (id === undefined) {
    const last = await db.prepare('SELECT id FROM change_history WHERE undone_by IS NULL AND undoes IS NULL ORDER BY id DESC LIMIT 1').first<{ id: number }>();
    if (!last) throw new OwnerProblem('There are no changes left to undo.');
    e = await entry(db, last.id);
  } else {
    e = await entry(db, id);
  }
  const blocked = await whyNot(db, e);
  if (blocked) throw new OwnerProblem(`Change ${e.id} (${e.summary}) can't be undone. ${blocked}`);

  const targets = JSON.parse(e.targets) as Targets;
  const current = await beforeChange(db, targets);
  try {
    await db.batch(restore(db, await freeSlugs(db, JSON.parse(e.before_state) as State)));
  } catch (err) {
    throw new OwnerProblem(`Change ${e.id} could not be undone: ${(err as Error).message}`);
  }
  const undoId = (await recordChange(db, 'undo_change', undoSummary(e.summary), current, e.id))!;
  const marks = [db.prepare('UPDATE change_history SET undone_by = ? WHERE id = ?').bind(undoId, e.id)];
  let above = e.id;
  let below = e.undoes;
  let inEffect = true;
  while (below !== null) {
    marks.push(
      inEffect
        ? db.prepare('UPDATE change_history SET undone_by = NULL WHERE id = ?').bind(below)
        : db.prepare('UPDATE change_history SET undone_by = ? WHERE id = ?').bind(above, below),
    );
    above = below;
    below = (await entry(db, below)).undoes;
    inEffect = !inEffect;
  }
  await db.batch(marks);
  const done = await entry(db, e.id);
  return { undid: card(done, await whyNot(db, done)), undo_id: undoId };
}

export async function recentChanges(db: D1Database, limit = 10): Promise<ChangeCard[]> {
  const { results } = await db.prepare('SELECT * FROM change_history ORDER BY id DESC LIMIT ?').bind(Math.min(Math.max(limit, 1), 50)).all<Entry>();
  const cards: ChangeCard[] = [];
  for (const [i, e] of results.entries()) cards.push(i < CHECKED_IN_LIST ? card(e, await whyNot(db, e)) : card(e, undefined));
  return cards;
}

function card(e: Entry, blocked: string | null | undefined): ChangeCard {
  return {
    id: e.id,
    when: `${e.created_at.replace(' ', 'T')}Z`,
    what: e.summary,
    changed: describe(JSON.parse(e.before_state) as State, JSON.parse(e.after_state) as State),
    undone: e.undone_by !== null,
    is_undo: e.undoes !== null,
    ...(blocked === undefined ? {} : { can_undo: blocked === null }),
    ...(blocked ? { why_not: blocked } : {}),
  };
}

export function describe(before: State, after: State): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(after.settings)) {
    const was = parse(before.settings[key]);
    const now = parse(after.settings[key]);
    if (isObj(was) && isObj(now)) {
      for (const field of [...new Set([...Object.keys(was), ...Object.keys(now)])]) {
        if (!same(was[field], now[field])) lines.push(`${key}.${field}: ${show(was[field])} → ${show(now[field])}`);
      }
    } else {
      lines.push(`${key}: ${show(was)} → ${show(now)}`);
    }
  }
  for (const [id, now] of Object.entries(after.purses)) {
    const was = before.purses[id] ?? { row: null, photos: [] };
    const name = String(now.row?.name ?? was.row?.name ?? `purse ${id}`);
    if (was.row === null) lines.push(`${name}: added`);
    else if (now.row === null) lines.push(`${name}: removed`);
    else {
      for (const field of Object.keys(now.row)) {
        if (field === 'updated_at' || field === 'is_sample' || same(was.row[field], now.row[field])) continue;
        lines.push(`${name} ${field}: ${show(was.row[field])} → ${show(now.row[field])}`);
      }
    }
    const order = (s: PurseState) => [...s.photos].sort((a, b) => Number(a.sort) - Number(b.sort) || Number(a.id) - Number(b.id)).map((p) => p.id);
    if (was.photos.length !== now.photos.length) lines.push(`${name} photos: ${was.photos.length} → ${now.photos.length}`);
    else if (!same(order(was), order(now))) lines.push(`${name}: cover photo changed`);
  }
  return lines;
}

function parse(v: string | null | undefined): unknown {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return v;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function show(v: unknown): string {
  if (v === undefined || v === null) return 'none';
  const text = typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
