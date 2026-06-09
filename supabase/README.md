# Master box packing — database setup

Run these in the **Supabase SQL editor** before using **Master Box Shipping** (`/master-ship`):

1. `migrations/001_master_packing.sql` — creates tables
2. `migrations/002_master_packing_policies.sql` — **required if session create fails** (RLS blocking inserts)
3. `migrations/003_master_pack_po_tracking.sql` — tracks master-pack status per PO and prevents double-processing
4. `migrations/004_sociolla_product_mapping.sql` — `products.sociolla_sku` and `po_items.retailer_sku` for Sociolla PO imports
5. `migrations/005_sociolla_carton_planning.sql` — inner box planning, mixed-SKU carton contents, and LPN generation after plan finalize
6. `migrations/006_marketing_requests.sql` — marketing team goods requests, allowlisted email logins, and offline fulfillment labels
7. `migrations/007_marketing_delivery_fields.sql` — recipient phone, due date, and preferred courier on marketing requests
8. `migrations/008_marketing_request_chat.sql` — per-package chat threads, admin role, mention email notifications

**Chat:** mention users with `@email-handle` (part before @), e.g. `@marketing`, `@fulfillment`. Admin login: `fulfillment@aerisbeaute.com` / PIN `5910` (change in Supabase).

If you already ran `001` before RLS disable was added, run `002` only.

**Marketing requests** (`/marketing` for the marketing team, `/marketing/fulfill` for offline packing): update seeded emails and PINs in `marketing_users` before go-live.

Existing `purchase_orders`, `po_items`, and `po_boxes` are unchanged.
