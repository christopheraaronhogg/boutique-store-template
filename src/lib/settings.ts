import fullBrand from './brand/three-times-a-lady.json';
import starter from './brand/starter.json';

type RawSettings = typeof fullBrand.settings;

export type Closure = { date: string; note: string };

export type Settings = Omit<RawSettings, 'store' | 'banner' | 'about' | 'home' | 'closures'> & {
  store: Omit<RawSettings['store'], 'notify_emails'> & { notify_emails: string[] };
  closures: Closure[];
  banner: Omit<RawSettings['banner'], 'starts_on' | 'ends_on'> & { starts_on: string | null; ends_on: string | null };
  about: Omit<RawSettings['about'], 'photo_key'> & { photo_key: string | null };
  home: Omit<RawSettings['home'], 'hero_photo_key'> & { hero_photo_key: string | null };
};
export type SettingsSection = keyof Settings;

export const DEFAULT_SETTINGS: Settings = starter.settings as Settings;

export const SCRIPT_FONTS = ['Dancing Script', 'Allura', 'Great Vibes', 'Parisienne'];

export function fullAddress(s: Settings): string {
  const st = s.store;
  return [`${st.address_line1} ${st.address_line2}`.trim(), st.city, `${st.state} ${st.zip}`.trim()].filter(Boolean).join(', ');
}

export function streetLine(s: Settings): string {
  return `${s.store.address_line1} ${s.store.address_line2}`.trim();
}

export function telHref(s: Settings): string {
  let digits = s.store.phone.replace(/\D+/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  return digits ? `tel:+${digits}` : '';
}

export function directionsUrl(s: Settings): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress(s))}`;
}

export function scriptFont(s: Settings): string {
  return SCRIPT_FONTS.includes(s.theme.font_script) ? s.theme.font_script : 'Dancing Script';
}

export function look(s: Settings): 'charm' | 'lady' {
  return s.theme.look === 'lady' ? 'lady' : 'charm';
}

export function motif(s: Settings): 'diamond' | 'bow' {
  return look(s) === 'lady' ? 'diamond' : 'bow';
}

export function themeCss(s: Settings): string {
  const vars = Object.entries(s.theme)
    .filter((e): e is [string, string] => /^[a-z0-9_]+$/.test(e[0]) && typeof e[1] === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(e[1]))
    .map(([k, v]) => `--${k}:${v}`);
  vars.push(`--font-script:'${scriptFont(s)}',cursive`);
  return `:root{${vars.join(';')}}`;
}

export type Lockup = { mark: string; words: { text: string; small: boolean }[]; sub: string };

export function headerLockup(s: Settings): Lockup | null {
  const mark = s.store.logo_mark ?? '';
  const name = (s.store.header_name ?? '').trim();
  if (!mark || !name) return null;
  return {
    mark,
    words: name.split(/\s+/).map((text) => ({ text, small: text.length <= 2 && text.toLowerCase() === text })),
    sub: (s.store.header_sub ?? '').trim(),
  };
}

export function fontsUrl(s: Settings): string {
  const font = scriptFont(s);
  const script = font.replace(/ /g, '+') + (font === 'Dancing Script' ? ':wght@700' : '');
  const lockup = headerLockup(s) ? '&family=Italiana&family=Cinzel:wght@500' : '';
  return `https://fonts.googleapis.com/css2?family=${script}&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500${lockup}&family=Jost:wght@400;500;600&display=swap`;
}

export function leadTime(s: Settings): string {
  return s.catalog.made_to_order ? s.catalog.lead_time.trim() : '';
}

export function activeBanner(s: Settings, today: string): Settings['banner'] | null {
  const b = s.banner;
  if (!b.enabled || (!b.headline && !b.text)) return null;
  if (b.starts_on && today < b.starts_on) return null;
  if (b.ends_on && today > b.ends_on) return null;
  return b;
}

export function upcomingClosures(s: Settings, today: string): (Closure & { label: string })[] {
  const start = Date.parse(`${today}T00:00:00Z`);
  return (Array.isArray(s.closures) ? s.closures : [])
    .filter((c) => typeof c?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
    .filter((c) => {
      const at = Date.parse(`${c.date}T00:00:00Z`);
      return at >= start && at <= start + 60 * 86_400_000;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({
      date: c.date,
      note: typeof c.note === 'string' ? c.note : '',
      label: new Date(`${c.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    }));
}
