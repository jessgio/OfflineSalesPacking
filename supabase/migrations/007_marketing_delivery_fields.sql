-- Phone, due date, and preferred courier for marketing shipment requests

alter table marketing_requests
  add column if not exists recipient_phone text,
  add column if not exists due_date date,
  add column if not exists preferred_courier text
    check (preferred_courier is null or preferred_courier in ('Instant', 'Same Day', 'Regular', 'Kargo'));

comment on column marketing_requests.recipient_phone is 'Recipient contact number for courier';
comment on column marketing_requests.due_date is 'Date the package must arrive by';
comment on column marketing_requests.preferred_courier is 'Instant | Same Day | Regular | Kargo';
