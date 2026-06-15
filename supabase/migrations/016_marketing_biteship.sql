-- Biteship shipment booking from marketing fulfillment portal

alter table marketing_requests
  add column if not exists biteship_order_id text,
  add column if not exists biteship_courier_company text,
  add column if not exists biteship_courier_type text,
  add column if not exists biteship_waybill_url text,
  add column if not exists biteship_status text;

comment on column marketing_requests.biteship_order_id is
  'Biteship order ID after booking shipment from the fulfillment portal';
comment on column marketing_requests.biteship_courier_company is
  'Biteship courier company code (e.g. anteraja, grab)';
comment on column marketing_requests.biteship_courier_type is
  'Biteship courier service type (e.g. reg, instant)';
comment on column marketing_requests.biteship_waybill_url is
  'Carrier waybill / label URL returned by Biteship';
comment on column marketing_requests.biteship_status is
  'Latest Biteship order status (confirmed, picking_up, delivered, etc.)';
