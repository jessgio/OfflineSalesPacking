-- Per-user read state for marketing request discussion threads

create table if not exists marketing_request_chat_reads (
  request_id uuid not null references marketing_requests(id) on delete cascade,
  reader_email text not null,
  last_read_at timestamptz not null default now(),
  primary key (request_id, reader_email)
);

create index if not exists marketing_request_chat_reads_reader_idx
  on marketing_request_chat_reads (reader_email);

comment on table marketing_request_chat_reads is
  'Tracks when each user last viewed a package discussion thread for unread badges.';

alter table marketing_request_chat_reads disable row level security;
