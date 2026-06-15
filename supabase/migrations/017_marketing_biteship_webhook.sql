-- Timestamp of last Biteship webhook status sync

alter table marketing_requests
  add column if not exists biteship_status_updated_at timestamptz;

comment on column marketing_requests.biteship_status_updated_at is
  'When biteship_status was last updated from a Biteship webhook event';
