import { loadSettings, saveSection } from '$lib/server/settings';
import { SCRIPT_FONTS, type Settings, type SettingsSection } from '$lib/settings';
import { OwnerProblem } from './purses';

export const EDITABLE_SECTIONS = ['store', 'home', 'about', 'banner', 'hours', 'closures', 'fulfillment', 'policies', 'catalog', 'theme'] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];

const LOCKED_KEYS = /(^|_)(logo|icon|mark)(_|$)|^order_prefix$|^header_name$|_photo_key$|^photo_key$|^is_sample$|^story_is_sample$|^notify_emails$|^email_from_name$|^order_email_from$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function realDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const when = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(when.getTime()) && when.toISOString().slice(0, 10) === value;
}
const NULLABLE_DATES = new Set(['starts_on', 'ends_on']);

export function describeEditable(s: Settings): Record<EditableSection, unknown> {
  const out = {} as Record<EditableSection, unknown>;
  for (const section of EDITABLE_SECTIONS) {
    const value = s[section];
    out[section] = isObject(value) ? Object.fromEntries(Object.entries(value).filter(([k]) => !LOCKED_KEYS.test(k))) : value;
  }
  return out;
}

export async function changeSettings(db: D1Database, section: EditableSection, changes: unknown): Promise<unknown> {
  if (!EDITABLE_SECTIONS.includes(section)) throw new OwnerProblem(`"${section}" can't be changed here.`);
  const next = nextSection(await loadSettings(db), section, changes);
  await saveSection(db, section as SettingsSection, next as Settings[SettingsSection]);
  return describeEditable(await loadSettings(db))[section];
}

export function nextSection(current: Settings, section: EditableSection, changes: unknown): unknown {
  if (section === 'hours') return cleanHours(changes);
  if (section === 'closures') return cleanClosures(changes);
  if (section === 'theme') return cleanTheme(current.theme, changes);
  return mergeObject(section, current[section] as Record<string, unknown>, changes);
}

export const SETUP_STORE_KEYS = ['order_prefix', 'header_name', 'email_from_name', 'notify_emails', 'order_email_from', 'logo_wide'] as const;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function setupStoreValue(key: (typeof SETUP_STORE_KEYS)[number], value: unknown): unknown {
  if (key === 'order_prefix') {
    if (typeof value !== 'string' || !/^[A-Z]{2,6}-$/.test(value)) throw new OwnerProblem('order_prefix should be 2 to 6 capital letters and a dash, like TTL-.');
    return value;
  }
  if (key === 'logo_wide') {
    if (typeof value !== 'boolean') throw new OwnerProblem('logo_wide should be true or false.');
    return value;
  }
  if (key === 'notify_emails') {
    if (!Array.isArray(value) || value.length > 5 || !value.every((v) => typeof v === 'string' && EMAIL.test(v.trim()))) throw new OwnerProblem('notify_emails should be a list of up to 5 email addresses.');
    return value.map((v: string) => v.trim().toLowerCase());
  }
  if (key === 'order_email_from') {
    if (typeof value !== 'string' || (value.trim() !== '' && !EMAIL.test(value.trim()))) throw new OwnerProblem('order_email_from should be one email address on the store\'s own domain, like orders@myshop.com, or "" to turn it off.');
    return value.trim().toLowerCase();
  }
  if (typeof value !== 'string') throw new OwnerProblem(`${key} should be text.`);
  return clip(value, key === 'header_name' ? 40 : 80);
}

const LOOKS = ['lady', 'charm'];

function cleanTheme(current: Settings['theme'], changes: unknown): Settings['theme'] {
  if (!isObject(changes)) throw new OwnerProblem('Send the theme changes as named fields.');
  const next: Record<string, unknown> = { ...current };
  const colors = Object.keys(current).filter((k) => k !== 'look' && k !== 'font_script');
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'look') {
      if (typeof value !== 'string' || !LOOKS.includes(value)) throw new OwnerProblem(`look should be one of: ${LOOKS.join(', ')}.`);
    } else if (key === 'font_script') {
      if (typeof value !== 'string' || !SCRIPT_FONTS.includes(value)) throw new OwnerProblem(`font_script should be one of: ${SCRIPT_FONTS.join(', ')}.`);
    } else if (colors.includes(key)) {
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new OwnerProblem(`${key} should be a color like #e0177c.`);
    } else {
      throw new OwnerProblem(`"${key}" is not a theme field. Fields: look, font_script, ${colors.join(', ')}.`);
    }
    next[key] = value;
  }
  return next as Settings['theme'];
}

function mergeObject(section: string, current: Record<string, unknown>, changes: unknown): Record<string, unknown> {
  if (!isObject(changes)) throw new OwnerProblem(`Send the ${section} changes as named fields.`);
  const next = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (!(key in current) || LOCKED_KEYS.test(key)) throw new OwnerProblem(`"${key}" is not a field in ${section} that can be changed. Fields: ${Object.keys(current).filter((k) => !LOCKED_KEYS.test(k)).join(', ')}.`);
    next[key] = cleanValue(key, current[key], value);
  }
  if (section === 'banner' && 'headline' in changes) next.is_sample = false;
  if (section === 'banner' && 'text' in changes) next.is_sample = false;
  if (section === 'about' && 'story' in changes) next.story_is_sample = false;
  return next;
}

function cleanValue(key: string, was: unknown, value: unknown): unknown {
  if (NULLABLE_DATES.has(key)) {
    if (value === null || value === '') return null;
    if (typeof value === 'string' && realDate(value)) return value;
    throw new OwnerProblem(`${key} should be a date like 2026-12-24, or null for no date.`);
  }
  if (typeof was === 'boolean') {
    if (typeof value !== 'boolean') throw new OwnerProblem(`${key} should be true or false.`);
    return value;
  }
  if (typeof was === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new OwnerProblem(`${key} should be a number.`);
    return value;
  }
  if (Array.isArray(was) && was.some((item) => typeof item !== 'string')) return cleanRows(key, was, value);
  if (Array.isArray(was)) {
    if (!Array.isArray(value) || value.length > 20 || !value.every((v) => typeof v === 'string')) throw new OwnerProblem(`${key} should be a list of up to 20 short texts.`);
    return value.map((v: string) => clip(v, 200));
  }
  if (was !== null && typeof was === 'object') throw new OwnerProblem(`${key} can't be changed here.`);
  if (typeof value !== 'string') throw new OwnerProblem(`${key} should be text.`);
  if (key.endsWith('_url') && value && !/^https:\/\/[^\s<>"]+$/.test(value)) throw new OwnerProblem(`${key} should be a link starting with https://.`);
  return clip(value, 4000);
}

function cleanRows(key: string, was: unknown[], value: unknown): Record<string, string>[] {
  const fields = [...new Set(was.flatMap((item) => (isObject(item) ? Object.keys(item) : [])))];
  if (fields.length === 0 || was.some((item) => !isObject(item) || Object.values(item).some((v) => typeof v !== 'string'))) {
    throw new OwnerProblem(`${key} can't be changed here.`);
  }
  const shape = `{${fields.map((k) => `"${k}": "…"`).join(', ')}}`;
  if (!Array.isArray(value) || value.length > 12) throw new OwnerProblem(`${key} should be a list of up to 12 rows like ${shape}.`);
  return value.map((row) => {
    if (!isObject(row) || Object.keys(row).some((k) => !fields.includes(k)) || fields.some((k) => typeof row[k] !== 'string')) {
      throw new OwnerProblem(`Each ${key} row should look like ${shape}.`);
    }
    return Object.fromEntries(fields.map((k) => [k, clip(row[k] as string, 200)]));
  });
}

function cleanHours(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) throw new OwnerProblem('Hours should be a list of 1 to 10 rows like {"label": "Saturday", "value": "10 AM – 4 PM"}.');
  return value.map((row) => {
    if (!isObject(row) || typeof row.label !== 'string' || typeof row.value !== 'string') throw new OwnerProblem('Each hours row needs a label and a value.');
    return { label: clip(row.label, 60), value: clip(row.value, 60) };
  });
}

function cleanClosures(value: unknown): { date: string; note: string }[] {
  if (!Array.isArray(value) || value.length > 30) throw new OwnerProblem('Closures should be a list of up to 30 days like {"date": "2026-12-25", "note": "Christmas"}.');
  return value
    .map((row) => {
      if (!isObject(row) || typeof row.date !== 'string' || !realDate(row.date)) throw new OwnerProblem('Each closed day needs a date like 2026-12-25.');
      return { date: row.date, note: typeof row.note === 'string' ? clip(row.note, 60) : '' };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function clip(text: string, max: number): string {
  return text.trim().slice(0, max);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
