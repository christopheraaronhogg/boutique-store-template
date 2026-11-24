import { sameSecret } from './secrets';

export const MIN_PASSWORD = 10;
export const MAX_PER_IP = 8;
export const MAX_FOR_STORE = 30;
export const WINDOW = '-15 minutes';

export type PasswordCheck = { ok: true } | { ok: false; problem: string; status: number };

export async function checkPassword(db: D1Database, expected: string | undefined, given: string, ip: string): Promise<PasswordCheck> {
  if ((expected ?? '').length < MIN_PASSWORD) return { ok: false, problem: 'Sign-in isn’t set up for this store yet.', status: 503 };
  await db.prepare("DELETE FROM owner_sign_in_attempts WHERE at < datetime('now', '-1 day')").run();
  const attempt = await db.prepare('INSERT INTO owner_sign_in_attempts (ip) VALUES (?) RETURNING id').bind(ip).first<{ id: number }>();
  const counts = await db
    .prepare(
      `SELECT SUM(ip = ?1) AS mine, COUNT(*) AS everyone FROM owner_sign_in_attempts WHERE at > datetime('now', '${WINDOW}') AND id <= ?2`,
    )
    .bind(ip, attempt!.id)
    .first<{ mine: number; everyone: number }>();
  if ((counts?.mine ?? 0) > MAX_PER_IP || (counts?.everyone ?? 0) > MAX_FOR_STORE) {
    return { ok: false, problem: 'Too many wrong passwords. Please wait 15 minutes and try again.', status: 429 };
  }
  if (!(await sameSecret(given, expected!))) return { ok: false, problem: 'That password isn’t right.', status: 401 };
  await db.prepare('DELETE FROM owner_sign_in_attempts WHERE id = ?').bind(attempt!.id).run();
  return { ok: true };
}
