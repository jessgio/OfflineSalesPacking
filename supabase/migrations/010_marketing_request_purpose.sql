-- Internal event/purpose for marketing requests (not printed on shipping labels)

alter table marketing_requests
  add column if not exists request_purpose text;

comment on column marketing_requests.request_purpose is
  'Internal only — campaign, event, or reason for the shipment. Not shown on printed labels.';

create table if not exists marketing_request_purposes (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists marketing_request_purposes_last_used_idx
  on marketing_request_purposes (last_used_at desc);

comment on table marketing_request_purposes is
  'Saved event/purpose labels for marketing request dropdown reuse.';

alter table marketing_request_purposes disable row level security;
