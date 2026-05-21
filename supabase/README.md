# Master box packing — database setup

Run these in the **Supabase SQL editor** before using **Master Box Shipping** (`/master-ship`):

1. `migrations/001_master_packing.sql` — creates tables
2. `migrations/002_master_packing_policies.sql` — **required if session create fails** (RLS blocking inserts)

If you already ran `001` before RLS disable was added, run `002` only.

Existing `purchase_orders`, `po_items`, and `po_boxes` are unchanged.
