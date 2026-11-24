import type { Settings } from '$lib/settings';

export const THEME_COLORS: { key: Exclude<keyof Settings['theme'], 'look' | 'font_script'>; label: string }[] = [
  { key: 'hot', label: 'Main color (buttons, prices)' },
  { key: 'pink', label: 'Light accent' },
  { key: 'deep', label: 'Dark accent' },
  { key: 'blush', label: 'Soft background' },
  { key: 'cream', label: 'Page background' },
  { key: 'ink', label: 'Text' },
  { key: 'gold', label: 'Gold' },
  { key: 'gold2', label: 'Light gold' },
];

export function themeChanges(form: FormData): Record<string, string> {
  const changes: Record<string, string> = {};
  for (const { key } of THEME_COLORS) {
    const value = String(form.get(key) ?? '').trim();
    if (value) changes[key] = value;
  }
  const font = String(form.get('font_script') ?? '').trim();
  if (font) changes.font_script = font;
  return changes;
}
