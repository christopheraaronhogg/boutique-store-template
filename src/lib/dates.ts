export const STORE_TIME_ZONE = 'America/Chicago';

export function storeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
