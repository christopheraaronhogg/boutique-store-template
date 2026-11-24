import { describe, expect, it } from 'vitest';
import { asChanges, asNew, readFields } from '$lib/server/admin/purseForm';
import { endSession, sessionValid, startSession } from '$lib/server/owner/sessions';
import { inAdmin, needsOwner } from '$lib/adminArea';
import { realDate } from '$lib/server/owner/settings';
import { themeChanges, THEME_COLORS } from '$lib/server/admin/themeForm';
import { changeSettings } from '$lib/server/owner/settings';
import { loadSettings } from '$lib/server/settings';
import { db } from './helpers';

const pw = 'test-owner-password';

describe('the owner’s sign-in session', () => {
  it('lasts until it expires or she signs out', async () => {
    const token = await startSession(db, pw);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await sessionValid(db, token, pw)).toBe(true);
    expect(await sessionValid(db, `${token.slice(0, 63)}0`, pw)).toBe(token.endsWith('0'));
    expect(await sessionValid(db, undefined, pw)).toBe(false);
    expect(await sessionValid(db, "' OR 1=1 --", pw)).toBe(false);
    await endSession(db, token);
    expect(await sessionValid(db, token, pw)).toBe(false);
    const old = await startSession(db, pw);
    await db.prepare("UPDATE owner_sessions SET expires_at = datetime('now', '-1 minute')").run();
    expect(await sessionValid(db, old, pw)).toBe(false);
  });
});

describe('the purse form', () => {
  it('reads dollars the way people type them', () => {
    const form = new FormData();
    form.set('name', ' Camel Tote ');
    form.set('price', '$1,058.50');
    form.set('sale_price', '');
    form.set('style', 'totes');
    form.set('status', 'nonsense');
    form.set('sold', 'on');
    const fields = readFields(form);
    expect(fields).toMatchObject({ name: 'Camel Tote', status: 'live', sold: true });
    expect(asNew(fields)).toMatchObject({ price: 1058.5, sale_price: null, style: 'totes' });
    expect(asChanges(fields).sold).toBe(true);
  });
});

describe('who needs to be signed in', () => {
  it('guards every spelling of the admin pages', () => {
    for (const path of ['/admin', '/admin/purses', '/%61dmin', '/adm%69n/store', '/%61dmin/purses/__data.json', '/ADMIN/store']) expect(needsOwner(null, path)).toBe(true);
    expect(needsOwner('/admin/store', '/x')).toBe(true);
    expect(needsOwner('/admin/sign-in', '/admin/sign-in')).toBe(false);
    expect(inAdmin('/admin/sign-in', '/admin/sign-in')).toBe(true);
    expect(needsOwner('/p/[slug]', '/p/administrator-bag')).toBe(false);
    expect(needsOwner(null, '/%E0%A4%A')).toBe(false);
  });

  it('signs everyone out when the password changes', async () => {
    const token = await startSession(db, pw);
    expect(await sessionValid(db, token, 'a-new-password-123')).toBe(false);
    expect(await sessionValid(db, token, undefined)).toBe(false);
    expect(await sessionValid(db, token, pw)).toBe(true);
  });

  it('only takes real calendar dates', () => {
    expect(realDate('2026-12-25')).toBe(true);
    expect(realDate('2026-13-45')).toBe(false);
    expect(realDate('2026-02-30')).toBe(false);
  });
});

describe('the colors form', () => {
  it('saves the picked colors and font, and covers every theme color', async () => {
    const theme = (await loadSettings(db)).theme;
    expect(THEME_COLORS.map((c) => c.key).sort()).toEqual(Object.keys(theme).filter((k) => k !== 'look' && k !== 'font_script').sort());
    const form = new FormData();
    form.set('hot', '#123456');
    form.set('gold', '');
    form.set('font_script', 'Great Vibes');
    expect(themeChanges(form)).toEqual({ hot: '#123456', font_script: 'Great Vibes' });
    await changeSettings(db, 'theme', themeChanges(form));
    const after = (await loadSettings(db)).theme;
    expect(after).toMatchObject({ hot: '#123456', font_script: 'Great Vibes', gold: theme.gold });
  });
});
