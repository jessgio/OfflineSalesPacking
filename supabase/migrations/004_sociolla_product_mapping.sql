-- Sociolla retailer SKU → internal product barcode mapping
alter table if exists products
  add column if not exists sociolla_sku text;

create unique index if not exists products_sociolla_sku_unique
  on products (sociolla_sku)
  where sociolla_sku is not null;

comment on column products.sociolla_sku is
  'Sociolla proprietary SKU from PO Description brackets, e.g. AEB.BT-ABTSBBSP1';

-- Keep Sociolla SKU on the PO line for audit even when mapped to internal barcode
alter table if exists po_items
  add column if not exists retailer_sku text;

comment on column po_items.retailer_sku is
  'Original retailer SKU from the uploaded PO (Sociolla bracket code)';
