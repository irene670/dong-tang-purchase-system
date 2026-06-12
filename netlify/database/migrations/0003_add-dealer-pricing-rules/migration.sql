ALTER TABLE dealers
  ADD COLUMN tax_mode text NOT NULL DEFAULT 'included' CHECK (tax_mode IN ('included', 'excluded')),
  ADD COLUMN tax_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (tax_rate BETWEEN 0 AND 100),
  ADD COLUMN calculation_scope text NOT NULL DEFAULT 'line' CHECK (calculation_scope IN ('line', 'document')),
  ADD COLUMN rounding_mode text NOT NULL DEFAULT 'round' CHECK (rounding_mode IN ('round', 'floor', 'ceil')),
  ADD COLUMN rounding_digits integer NOT NULL DEFAULT 0 CHECK (rounding_digits BETWEEN 0 AND 2);

ALTER TABLE orders
  ALTER COLUMN total_amount TYPE numeric(14,2),
  ADD COLUMN pre_tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN retail_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_items
  ALTER COLUMN dealer_price TYPE numeric(14,2),
  ADD COLUMN pre_tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_total numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE sales_documents
  ADD COLUMN pre_tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN total_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
