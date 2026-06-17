CREATE TABLE woocommerce_product_cache (
  product_id bigint PRIMARY KEY,
  payload jsonb NOT NULL,
  status text,
  sku text,
  name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX woocommerce_product_cache_status_idx ON woocommerce_product_cache(status);
CREATE INDEX woocommerce_product_cache_synced_idx ON woocommerce_product_cache(synced_at DESC);
