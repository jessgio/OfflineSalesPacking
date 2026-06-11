-- Add Rayspeed, UPS, DHL, and FedEx as preferred courier options

alter table marketing_requests
  drop constraint if exists marketing_requests_preferred_courier_check;

alter table marketing_requests
  add constraint marketing_requests_preferred_courier_check
    check (preferred_courier is null or preferred_courier in (
      'Instant', 'Same Day', 'Regular', 'Kargo',
      'Rayspeed', 'UPS', 'DHL', 'FedEx'
    ));

comment on column marketing_requests.preferred_courier is
  'Instant | Same Day | Regular | Kargo | Rayspeed | UPS | DHL | FedEx';
