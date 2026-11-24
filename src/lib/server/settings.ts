import { DEFAULT_SETTINGS, type Settings, type SettingsSection } from '$lib/settings';

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const stored = new Map(results.map((r) => [r.key, parseOrNull(r.value)]));
  const merged: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = stored.get(key);
    merged[key] = isPlainObject(fallback) && isPlainObject(value) ? { ...fallback, ...value } : (value ?? fallback);
  }
  return merged as Settings;
}

export async function saveSection<K extends SettingsSection>(db: D1Database, key: K, value: Settings[K]): Promise<void> {
  await sectionWrite(db, key, value).run();
}

export function sectionWrite(db: D1Database, key: SettingsSection, value: unknown): D1PreparedStatement {
  return db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value));
}

function parseOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
