-- Track master packing lifecycle per PO and prevent re-running completed POs.

alter table if exists purchase_orders
  add column if not exists master_pack_status text not null default 'not_started'
    check (master_pack_status in ('not_started', 'in_progress', 'completed')),
  add column if not exists master_pack_session_id uuid references packing_sessions(id) on delete set null,
  add column if not exists master_pack_completed_at timestamptz,
  add column if not exists master_pack_completed_by text;

create index if not exists purchase_orders_master_pack_status_idx
  on purchase_orders (master_pack_status);

create index if not exists purchase_orders_master_pack_session_id_idx
  on purchase_orders (master_pack_session_id);
