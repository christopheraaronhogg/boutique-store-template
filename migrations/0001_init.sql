CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  noun_one TEXT,
  noun_many TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'hidden')),
  sold_out INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX products_shelf ON products (status, position);

CREATE TABLE photos (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX photos_product ON photos (product_id, sort);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  access_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'ordered', 'ready', 'picked_up', 'cancelled')),
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment IN ('pickup')),
  customer_note TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  payment_driver TEXT NOT NULL,
  payment_reference TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  ordered_at TEXT,
  ready_at TEXT,
  picked_up_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX orders_status ON orders (status, paid_at);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  photo_key TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX order_items_order ON order_items (order_id);
