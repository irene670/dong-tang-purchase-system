CREATE TABLE IF NOT EXISTS consignment_sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no text UNIQUE NOT NULL,
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT '草稿' CHECK (status IN ('草稿', '待審核', '已退回', '已審核', '已轉銷貨單', '已作廢')),
  note text NOT NULL DEFAULT '',
  return_reason text NOT NULL DEFAULT '',
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pre_tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  sales_document_id uuid REFERENCES sales_documents(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  converted_at timestamptz,
  voided_at timestamptz,
  created_by text NOT NULL DEFAULT '',
  reviewed_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consignment_sales_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES consignment_sales_reports(id) ON DELETE CASCADE,
  product_id bigint NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  current_stock integer NOT NULL DEFAULT 0,
  sold_quantity integer NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
  retail_price numeric(14,2) NOT NULL DEFAULT 0,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  pre_tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS consignment_sales_report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES consignment_sales_reports(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consignment_sales_report_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES consignment_sales_reports(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL DEFAULT '',
  operator_email text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS consignment_sales_reports_unique_active_period_idx
  ON consignment_sales_reports(dealer_id, period_start, period_end)
  WHERE status IN ('待審核', '已審核', '已轉銷貨單');

CREATE INDEX IF NOT EXISTS consignment_sales_reports_dealer_idx
  ON consignment_sales_reports(dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consignment_sales_report_items_report_idx
  ON consignment_sales_report_items(report_id);
