-- Retail selling price (RSP) for shipment insurance / declared value

alter table if exists products
  add column if not exists rsp integer check (rsp is null or rsp >= 0);

comment on column products.rsp is
  'Retail selling price in IDR — used to calculate declared shipment value for insurance.';

alter table if exists marketing_request_items
  add column if not exists rsp integer check (rsp is null or rsp >= 0);

comment on column marketing_request_items.rsp is
  'Per-unit RSP in IDR at time of request (from product catalog or import override).';
