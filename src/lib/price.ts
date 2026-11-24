type Priced = { price_cents: number; sale_price_cents: number | null };

export function effectivePriceOf(p: Priced): number {
  return p.sale_price_cents !== null && p.sale_price_cents < p.price_cents ? p.sale_price_cents : p.price_cents;
}

export function isOnSale(p: Priced): boolean {
  return effectivePriceOf(p) < p.price_cents;
}
