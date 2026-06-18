CREATE TABLE IF NOT EXISTS warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_code text UNIQUE NOT NULL,
  warehouse_name text NOT NULL DEFAULT '東瑭主倉',
  area text NOT NULL DEFAULT '',
  rack text NOT NULL DEFAULT '',
  level_name text NOT NULL DEFAULT '',
  slot_name text NOT NULL DEFAULT '',
  qr_code_value text UNIQUE NOT NULL,
  product_master_id uuid REFERENCES product_master(id),
  light_controller text NOT NULL DEFAULT '',
  light_channel text NOT NULL DEFAULT '',
  led_start integer NOT NULL DEFAULT 0,
  led_end integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no text UNIQUE NOT NULL,
  source_sales_document_id uuid REFERENCES sales_documents(id),
  dealer_id uuid REFERENCES dealers(id),
  customer_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '待產生揀貨單' CHECK (status IN ('待產生揀貨單', '待揀貨', '揀貨中', '缺貨異常', '待包裝', '包裝中', '待出貨', '已出貨', '取消')),
  source_warehouse text NOT NULL DEFAULT '東瑭主倉',
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  picker_email text NOT NULL DEFAULT '',
  packer_email text NOT NULL DEFAULT '',
  shipping_method text NOT NULL DEFAULT '',
  tracking_no text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  picked_at timestamptz,
  packed_at timestamptz,
  shipped_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipment_orders(id) ON DELETE CASCADE,
  sales_document_item_id uuid REFERENCES sales_document_items(id),
  product_master_id uuid REFERENCES product_master(id),
  product_id bigint,
  item_code text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  required_qty integer NOT NULL CHECK (required_qty > 0),
  picked_qty integer NOT NULL DEFAULT 0,
  packed_qty integer NOT NULL DEFAULT 0,
  shortage_qty integer NOT NULL DEFAULT 0,
  location_id uuid REFERENCES warehouse_locations(id),
  location_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '待揀貨' CHECK (status IN ('待揀貨', '已揀貨', '缺貨', '已包裝', '已出貨', '取消')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS picking_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_no text UNIQUE NOT NULL,
  shipment_id uuid NOT NULL REFERENCES shipment_orders(id) ON DELETE CASCADE,
  source_sales_document_id uuid REFERENCES sales_documents(id),
  status text NOT NULL DEFAULT '待揀貨' CHECK (status IN ('待揀貨', '揀貨中', '部分完成', '缺貨異常', '已完成', '取消')),
  qr_code_value text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  picker_email text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  printed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS picking_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_order_id uuid NOT NULL REFERENCES picking_orders(id) ON DELETE CASCADE,
  shipment_item_id uuid NOT NULL REFERENCES shipment_items(id) ON DELETE CASCADE,
  product_master_id uuid REFERENCES product_master(id),
  product_id bigint,
  item_code text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  required_qty integer NOT NULL DEFAULT 0,
  picked_qty integer NOT NULL DEFAULT 0,
  location_id uuid REFERENCES warehouse_locations(id),
  location_code text NOT NULL DEFAULT '',
  scanned_location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '待揀貨' CHECK (status IN ('待揀貨', '已揀貨', '缺貨', '已包裝', '已出貨', '取消')),
  picked_by text NOT NULL DEFAULT '',
  picked_at timestamptz,
  inventory_applied_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipment_orders(id) ON DELETE CASCADE,
  picking_order_id uuid REFERENCES picking_orders(id) ON DELETE CASCADE,
  shipment_item_id uuid REFERENCES shipment_items(id) ON DELETE CASCADE,
  product_master_id uuid REFERENCES product_master(id),
  product_id bigint,
  item_code text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  exception_type text NOT NULL DEFAULT '缺貨',
  required_qty integer NOT NULL DEFAULT 0,
  available_qty integer NOT NULL DEFAULT 0,
  shortage_qty integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT '未處理' CHECK (status IN ('未處理', '已處理', '已取消')),
  note text NOT NULL DEFAULT '',
  operator_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS warehouse_locations_product_idx ON warehouse_locations(product_master_id);
CREATE INDEX IF NOT EXISTS shipment_orders_sales_idx ON shipment_orders(source_sales_document_id);
CREATE INDEX IF NOT EXISTS shipment_orders_status_idx ON shipment_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_items_shipment_idx ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS picking_orders_shipment_idx ON picking_orders(shipment_id);
CREATE INDEX IF NOT EXISTS picking_items_picking_idx ON picking_order_items(picking_order_id);
CREATE INDEX IF NOT EXISTS shipment_exceptions_status_idx ON shipment_exceptions(status, created_at DESC);
