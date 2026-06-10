-- Tracks which marketing requests fulfillment admins have opened (for new-order notifications)

create table if not exists marketing_request_admin_views (
  request_id uuid not null references marketing_requests(id) on delete cascade,
  admin_email text not null,
  seen_at timestamptz not null default now(),
  primary key (request_id, admin_email)
);

create index if not exists marketing_request_admin_views_admin_idx
  on marketing_request_admin_views (admin_email);

comment on table marketing_request_admin_views is
  'Fulfillment admin has opened/viewed this request — used for unseen new-order badges.';

alter table marketing_request_admin_views disable row level security;
