-- Marketing goods requests → offline fulfillment labels

create table if not exists marketing_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  pin text not null check (char_length(pin) >= 4),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table marketing_users is
  'Pre-set marketing team logins (email + PIN). Update emails/PINs before production use.';

create table if not exists marketing_requests (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'packed', 'shipped', 'cancelled')),
  requested_by_email text not null,
  requested_by_name text not null,
  recipient_name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'Singapore',
  notes text,
  packed_by text,
  packed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_requests_status_idx on marketing_requests (status);
create index if not exists marketing_requests_created_at_idx on marketing_requests (created_at desc);
create index if not exists marketing_requests_barcode_idx on marketing_requests (barcode);

create table if not exists marketing_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references marketing_requests(id) on delete cascade,
  product_barcode text,
  product_name text not null,
  qty integer not null check (qty > 0)
);

create index if not exists marketing_request_items_request_id_idx
  on marketing_request_items (request_id);

-- Seed marketing users (change emails and PINs in Supabase before go-live)
insert into marketing_users (email, display_name, pin) values
  ('marketing@aerisbeaute.com', 'Marketing Team', '4821'),
  ('pr@aerisbeaute.com', 'PR Team', '7392')
on conflict (email) do nothing;

alter table marketing_users disable row level security;
alter table marketing_requests disable row level security;
alter table marketing_request_items disable row level security;
