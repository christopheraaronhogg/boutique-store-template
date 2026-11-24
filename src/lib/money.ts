export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function moneyShort(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : money(cents);
}
