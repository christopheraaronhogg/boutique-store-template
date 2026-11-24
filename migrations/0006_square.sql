ALTER TABLE orders ADD COLUMN provider_order_id TEXT;
ALTER TABLE orders ADD COLUMN provider_pay_url TEXT;
ALTER TABLE orders ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX orders_provider_order ON orders (provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE TABLE payment_refunds (
  refund_id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id),
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
