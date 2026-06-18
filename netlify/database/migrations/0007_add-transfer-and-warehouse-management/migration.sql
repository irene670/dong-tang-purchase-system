CREATE TABLE IF NOT EXISTS transfer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no text UNIQUE NOT NULL,
  order_id uuid REFERENCES orders(id),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  status text NOT NULL DEFAULT '草稿' CHECK (status IN ('草稿', '已確認', '已調撥', '已作廢')),
  source_warehouse text NOT NULL DEFAULT '東瑭主倉',
  destination_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text NOT NULL DEFAULT '',
  operator_email text NOT NULL DEFAULT '',
  confirmed_at timestamptz,
  transferred_at timestamptz,
  voided_at timestamptz,
  inventory_applied_at timestamptz,
  inventory_reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfer_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_document_id uuid NOT NULL REFERENCES transfer_documents(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id),
  product_id bigint NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  note text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_name text NOT NULL DEFAULT '東瑭主倉',
  dealer_id uuid REFERENCES dealers(id),
  product_id bigint NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  operator_email text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transfer_documents_order_idx ON transfer_documents(order_id);
CREATE INDEX IF NOT EXISTS transfer_documents_dealer_idx ON transfer_documents(dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_items_document_idx ON transfer_document_items(transfer_document_id);
CREATE INDEX IF NOT EXISTS warehouse_movements_product_idx ON warehouse_movements(warehouse_name, product_id);
