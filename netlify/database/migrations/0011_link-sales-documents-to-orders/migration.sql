ALTER TABLE sales_documents
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS sales_documents_source_order_idx
  ON sales_documents(source_order_id);
