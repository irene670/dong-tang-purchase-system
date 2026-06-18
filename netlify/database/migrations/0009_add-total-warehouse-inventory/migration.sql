ALTER TABLE product_master
  ADD COLUMN IF NOT EXISTS storage_location text NOT NULL DEFAULT '';

ALTER TABLE warehouse_movements
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS product_master_id uuid REFERENCES product_master(id),
  ADD COLUMN IF NOT EXISTS movement_before integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS warehouse_movements_master_product_idx
  ON warehouse_movements(warehouse_name, product_master_id, created_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_no text UNIQUE NOT NULL,
  warehouse_name text NOT NULL DEFAULT '東瑭主倉',
  status text NOT NULL DEFAULT '已確認' CHECK (status IN ('草稿', '已確認', '已作廢')),
  note text NOT NULL DEFAULT '',
  operator_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id uuid NOT NULL REFERENCES warehouse_stock_counts(id) ON DELETE CASCADE,
  product_master_id uuid REFERENCES product_master(id),
  product_id bigint,
  item_no text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  book_quantity integer NOT NULL DEFAULT 0,
  actual_quantity integer NOT NULL DEFAULT 0,
  difference integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS warehouse_stock_count_items_count_idx
  ON warehouse_stock_count_items(stock_count_id);

CREATE INDEX IF NOT EXISTS warehouse_stock_count_items_product_idx
  ON warehouse_stock_count_items(product_master_id);
