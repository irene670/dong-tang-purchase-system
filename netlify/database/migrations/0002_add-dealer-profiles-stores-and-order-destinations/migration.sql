-- Write your migration SQL here
--
-- Example:
--   CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     name TEXT NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW()
--   );
ALTER TABLE dealers
  ADD COLUMN tax_id text NOT NULL DEFAULT '',
  ADD COLUMN invoice_title text NOT NULL DEFAULT '',
  ADD COLUMN invoice_address text NOT NULL DEFAULT '',
  ADD COLUMN phone text NOT NULL DEFAULT '',
  ADD COLUMN billing_email text NOT NULL DEFAULT '';

CREATE TABLE dealer_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  company_name text NOT NULL,
  tax_id text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  address text NOT NULL,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  recipient_email text NOT NULL DEFAULT '',
  delivery_note text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dealer_stores_dealer_idx ON dealer_stores(dealer_id, active, store_name);

ALTER TABLE orders
  ADD COLUMN store_id uuid REFERENCES dealer_stores(id),
  ADD COLUMN shipping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
