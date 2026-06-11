-- Requester divisions + expanded fulfillment roles

alter table marketing_users
  add column if not exists division text not null default 'Marketing';

comment on column marketing_users.division is
  'Organizational division of the user (Marketing, R&D, Leadership, etc.).';

alter table marketing_requests
  add column if not exists requested_by_division text;

comment on column marketing_requests.requested_by_division is
  'Division of the requester at time of submission — included in exports.';

-- Expand roles: requester (submit requests), fulfillment (pack/ship), admin (full ops)
alter table marketing_users drop constraint if exists marketing_users_role_check;

update marketing_users set role = 'requester' where role = 'marketing';

alter table marketing_users
  add constraint marketing_users_role_check
  check (role in ('requester', 'fulfillment', 'admin'));

comment on column marketing_users.role is
  'requester = submit shipment requests; fulfillment = pack/ship; admin = full ops access';

update marketing_users set division = 'Marketing' where email in (
  'marketing@aerisbeaute.com',
  'pr@aerisbeaute.com'
);

update marketing_users set division = 'Operations' where email = 'fulfillment@aerisbeaute.com';

update marketing_requests mr
set requested_by_division = mu.division
from marketing_users mu
where mr.requested_by_email = mu.email
  and mr.requested_by_division is null;

-- Chat messages may store any current role value
alter table marketing_request_messages drop constraint if exists marketing_request_messages_author_role_check;

update marketing_request_messages set author_role = 'requester' where author_role = 'marketing';

alter table marketing_request_messages
  add constraint marketing_request_messages_author_role_check
  check (author_role in ('requester', 'fulfillment', 'admin', 'marketing'));
