CREATE TABLE IF NOT EXISTS product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_no text UNIQUE NOT NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  retail_price numeric(14,2) NOT NULL DEFAULT 0,
  sale_price numeric(14,2) NOT NULL DEFAULT 0,
  standard_cost numeric(14,2) NOT NULL DEFAULT 0,
  safety_stock integer NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  barcode text NOT NULL DEFAULT '',
  unit_weight numeric(14,3) NOT NULL DEFAULT 0,
  supplier text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  woo_product_id bigint,
  woo_sku text NOT NULL DEFAULT '',
  woo_permalink text NOT NULL DEFAULT '',
  dealer_visible boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_master_item_no_idx ON product_master(item_no);
CREATE INDEX IF NOT EXISTS product_master_barcode_idx ON product_master(barcode);
CREATE INDEX IF NOT EXISTS product_master_woo_product_idx ON product_master(woo_product_id);
CREATE INDEX IF NOT EXISTS product_master_dealer_visible_idx ON product_master(dealer_visible);

CREATE TABLE IF NOT EXISTS product_master_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL DEFAULT '',
  row_count integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
