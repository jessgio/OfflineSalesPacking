-- Allow Partial Fulfillment when inner packing finishes with declared shortages.

alter table purchase_orders drop constraint if exists purchase_orders_status_check;

alter table purchase_orders
  add constraint purchase_orders_status_check
  check (status in ('Not Started', 'Packing', 'Completed', 'Partial Fulfillment'));
