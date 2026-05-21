-- Run this if "Failed to create session" persists after 001_master_packing.sql
-- New Supabase tables often have RLS enabled with no policies (blocks inserts from the app).

alter table if exists packing_sessions disable row level security;
alter table if exists packing_session_pos disable row level security;
alter table if exists po_master_boxes disable row level security;
alter table if exists po_master_box_contents disable row level security;

-- If you prefer RLS enabled, comment the lines above and use these instead:
-- alter table packing_sessions enable row level security;
-- create policy "packing_sessions_anon_all" on packing_sessions for all to anon using (true) with check (true);
-- create policy "packing_sessions_auth_all" on packing_sessions for all to authenticated using (true) with check (true);
-- (repeat for packing_session_pos, po_master_boxes, po_master_box_contents)
