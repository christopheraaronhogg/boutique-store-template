import { error } from '@sveltejs/kit';
import { randomToken, sha256 } from './secrets';

export const SESSION_COOKIE = 'owner_session';
export const SESSION_DAYS = 30;

function passwordTag(password: string): Promise<string> {
  return sha256(`owner-session:${password}`);
}

export async function startSession(db: D1Database, password: string): Promise<string> {
  await db.prepare("DELETE FROM owner_sessions WHERE expires_at < datetime('now')").run();
  const token = randomToken(32);
  await db
    .prepare(`INSERT INTO owner_sessions (token_hash, password_tag, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
    .bind(await sha256(token), await passwordTag(password))
    .run();
  return token;
}

export async function sessionValid(db: D1Database, token: string | undefined, password: string | undefined): Promise<boolean> {
  if (!token || !password || !/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await db
    .prepare("SELECT 1 FROM owner_sessions WHERE token_hash = ? AND password_tag = ? AND expires_at > datetime('now')")
    .bind(await sha256(token), await passwordTag(password))
    .first();
  return row !== null;
}

export async function endSession(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

export function ownerOnly(locals: App.Locals): void {
  if (!locals.owner) error(403, 'Please sign in again.');
}
