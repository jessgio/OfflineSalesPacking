-- Sociolla inner-box planning before LPN generation

alter table if exists purchase_orders
  add column if not exists carton_plan_status text;

comment on column purchase_orders.carton_plan_status is
  'null = Guardian/default; draft = needs inner box plan; finalized = LPNs generated';

create table if not exists po_carton_plans (
  po_id uuid primary key references purchase_orders(id) on delete cascade,
  plan jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists po_box_contents (
  id uuid primary key default gen_random_uuid(),
  po_box_id uuid not null references po_boxes(id) on delete cascade,
  product_barcode text not null,
  qty integer not null check (qty > 0),
  scanned_qty integer not null default 0 check (scanned_qty >= 0),
  unique (po_box_id, product_barcode)
);

create index if not exists po_box_contents_po_box_id_idx on po_box_contents (po_box_id);

alter table if exists po_carton_plans disable row level security;
alter table if exists po_box_contents disable row level security;
