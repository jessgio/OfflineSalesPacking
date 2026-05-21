-- Master box packing module (run in Supabase SQL editor)
-- Groups inner LPN cartons (po_boxes) into master cartons for multi-PO shipments.

create table if not exists packing_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'packing', 'completed')),
  session_code text not null,
  packed_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists packing_session_pos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references packing_sessions(id) on delete cascade,
  po_id uuid not null references purchase_orders(id) on delete cascade,
  unique (session_id, po_id)
);

create table if not exists po_master_boxes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references packing_sessions(id) on delete cascade,
  master_barcode text not null unique,
  box_number int not null,
  status text not null default 'open' check (status in ('open', 'sealed')),
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  unique (session_id, box_number)
);

create table if not exists po_master_box_contents (
  id uuid primary key default gen_random_uuid(),
  master_box_id uuid not null references po_master_boxes(id) on delete cascade,
  po_box_id uuid not null references po_boxes(id) on delete cascade,
  inner_barcode text not null,
  po_id uuid not null references purchase_orders(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (master_box_id, po_box_id)
);

-- Each inner LPN can only be assigned to one master box
create unique index if not exists po_master_box_contents_po_box_id_key on po_master_box_contents (po_box_id);

create index if not exists packing_session_pos_session_id_idx on packing_session_pos (session_id);
create index if not exists po_master_boxes_session_id_idx on po_master_boxes (session_id);
create index if not exists po_master_box_contents_master_box_id_idx on po_master_box_contents (master_box_id);

-- Match other fulfillment tables: allow client writes via anon key (internal dashboard)
alter table packing_sessions disable row level security;
alter table packing_session_pos disable row level security;
alter table po_master_boxes disable row level security;
alter table po_master_box_contents disable row level security;
