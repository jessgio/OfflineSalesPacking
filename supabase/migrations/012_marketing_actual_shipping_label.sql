-- Courier tracking / actual shipping label entered after dispatch (Regular & Kargo)

alter table marketing_requests
  add column if not exists actual_shipping_label text,
  add column if not exists actual_shipping_label_at timestamptz,
  add column if not exists actual_shipping_label_by text;

comment on column marketing_requests.actual_shipping_label is
  'Tracking number or carrier label reference entered by fulfillment after shipping is booked (Regular/Kargo).';

comment on column marketing_requests.actual_shipping_label_at is 'When the actual shipping label was recorded';
comment on column marketing_requests.actual_shipping_label_by is 'Admin initials who recorded the shipping label';
