-- Audit trail when marketing requests leave the warehouse as shipped

alter table marketing_requests
  add column if not exists shipped_at timestamptz,
  add column if not exists shipped_by text;

comment on column marketing_requests.shipped_at is 'When offline team marked the package as shipped';
comment on column marketing_requests.shipped_by is 'Initials of who marked shipped';

create index if not exists marketing_requests_shipped_at_idx
  on marketing_requests (shipped_at desc nulls last)
  where status = 'shipped';
