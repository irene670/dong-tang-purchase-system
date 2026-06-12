-- Write your migration SQL here
--
-- Example:
--   CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     name TEXT NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW()
--   );
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_user_id text UNIQUE,
  email text UNIQUE NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'buyout' CHECK (mode IN ('buyout', 'consignment')),
  discount_percent integer NOT NULL DEFAULT 100 CHECK (discount_percent BETWEEN 1 AND 100),
  hide_dealer_price boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_overrides (
  product_id bigint PRIMARY KEY,
  sku text,
  name text,
  category text,
  price integer,
  image_url text,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text UNIQUE NOT NULL,
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  contact_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '訂單成立',
  total_amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  shipped_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id bigint NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  image_url text,
  retail_price integer NOT NULL,
  dealer_price integer NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0)
);

CREATE TABLE sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_no text UNIQUE NOT NULL,
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  sales_month text NOT NULL,
  sales_date date NOT NULL,
  status text NOT NULL DEFAULT '草稿' CHECK (status IN ('草稿', '已確認', '已請款', '已作廢')),
  original_attachment_url text,
  formal_attachment_url text,
  note text NOT NULL DEFAULT '',
  inventory_applied_at timestamptz,
  inventory_reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_document_id uuid NOT NULL REFERENCES sales_documents(id) ON DELETE CASCADE,
  product_id bigint NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  product_id bigint NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  operator_email text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_movements_dealer_product_idx
  ON inventory_movements(dealer_id, product_id);
CREATE INDEX orders_dealer_created_idx ON orders(dealer_id, created_at DESC);
CREATE INDEX sales_documents_dealer_date_idx ON sales_documents(dealer_id, sales_date DESC);

CREATE VIEW inventory_balances AS
SELECT dealer_id, product_id, COALESCE(SUM(quantity), 0)::integer AS quantity,
       MAX(created_at) AS last_movement_at
FROM inventory_movements
GROUP BY dealer_id, product_id;

INSERT INTO app_settings (key, value) VALUES
('content', '{
  "heroTitle":"通路夥伴情報站",
  "heroText":"新品、陳列資源與檔期活動一次掌握，快速完成每一次採購。",
  "heroImage":"https://eavo.com.tw/wp-content/uploads/2026/05/GC.jpg",
  "newTitle":"Linknity NFC 智能鑰匙圈系列",
  "newText":"全新角色款式上市，結合日常配件與 NFC 智能應用，歡迎通路夥伴洽詢首批優惠。",
  "newImage":"https://eavo.com.tw/wp-content/uploads/2026/05/JV.jpg",
  "eventTitle":"夏季新品陳列活動",
  "eventText":"指定新品系列達採購門檻，即享通路陳列素材與活動支援。",
  "eventDate":"2026.06.15 - 2026.08.31",
  "displayTitle":"申請專屬展示架",
  "displayText":"需要桌上型展示架、商品立牌或陳列建議？送出需求後將由業務專人聯繫。"
}'::jsonb);
