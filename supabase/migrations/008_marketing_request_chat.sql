-- Per-request chat with @mentions (marketing + admin roles)

alter table marketing_users
  add column if not exists role text not null default 'marketing'
    check (role in ('marketing', 'admin'));

comment on column marketing_users.role is 'marketing = requesters; admin = fulfillment / ops (can chat on all packages)';

update marketing_users set role = 'marketing' where role is null;

insert into marketing_users (email, display_name, pin, role) values
  ('fulfillment@aerisbeaute.com', 'Fulfillment Admin', '5910', 'admin')
on conflict (email) do update set role = 'admin', active = true;

create table if not exists marketing_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references marketing_requests(id) on delete cascade,
  author_email text not null,
  author_name text not null,
  author_role text not null check (author_role in ('marketing', 'admin')),
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists marketing_request_messages_request_id_idx
  on marketing_request_messages (request_id, created_at asc);

alter table marketing_request_messages disable row level security;
