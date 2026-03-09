-- Enable RLS and add baseline policies for public schema tables exposed by PostgREST.
-- This migration addresses Supabase linter errors:
-- - rls_disabled_in_public
-- - sensitive_columns_exposed

begin;

-- 1) Enable RLS on all reported tables
alter table if exists public.tires enable row level security;
alter table if exists public.point_inventory enable row level security;
alter table if exists public.collector_tire_rates enable row level security;
alter table if exists public.compliance_certificates enable row level security;
alter table if exists public.reward_redemptions enable row level security;
alter table if exists public.collection_points enable row level security;
alter table if exists public.kiosk_receipts enable row level security;
alter table if exists public.rewards_catalog enable row level security;
alter table if exists public.analytics_campaigns enable row level security;
alter table if exists public.analytics_overview enable row level security;
alter table if exists public.analytics_active_sessions enable row level security;
alter table if exists public.analytics_events enable row level security;
alter table if exists public.app_settings enable row level security;
alter table if exists public.user_profiles enable row level security;
alter table if exists public.user_stats enable row level security;
alter table if exists public.collection_trace_events enable row level security;
alter table if exists public.collector_payments enable row level security;
alter table if exists public.generator_payments enable row level security;
alter table if exists public.payment_settings enable row level security;
alter table if exists public.collections enable row level security;
alter table if exists public.generator_tire_rates enable row level security;

-- 2) Public catalog-like data (safe read for anon + authenticated)
drop policy if exists tires_public_read on public.tires;
create policy tires_public_read
on public.tires
for select
to anon, authenticated
using (true);

drop policy if exists collection_points_public_read on public.collection_points;
create policy collection_points_public_read
on public.collection_points
for select
to anon, authenticated
using (true);

drop policy if exists rewards_catalog_public_read on public.rewards_catalog;
create policy rewards_catalog_public_read
on public.rewards_catalog
for select
to anon, authenticated
using (true);

-- 3) Authenticated read for configuration/rates
drop policy if exists collector_tire_rates_auth_read on public.collector_tire_rates;
create policy collector_tire_rates_auth_read
on public.collector_tire_rates
for select
to authenticated
using (true);

drop policy if exists generator_tire_rates_auth_read on public.generator_tire_rates;
create policy generator_tire_rates_auth_read
on public.generator_tire_rates
for select
to authenticated
using (true);

drop policy if exists payment_settings_auth_read on public.payment_settings;
create policy payment_settings_auth_read
on public.payment_settings
for select
to authenticated
using (true);

drop policy if exists app_settings_auth_read on public.app_settings;
create policy app_settings_auth_read
on public.app_settings
for select
to authenticated
using (true);

-- 4) User-owned tables
drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own
on public.user_profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists user_stats_select_own on public.user_stats;
create policy user_stats_select_own
on public.user_stats
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_stats_insert_own on public.user_stats;
create policy user_stats_insert_own
on public.user_stats
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_stats_update_own on public.user_stats;
create policy user_stats_update_own
on public.user_stats
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists collections_select_owner_or_collector on public.collections;
create policy collections_select_owner_or_collector
on public.collections
for select
to authenticated
using (user_id = auth.uid() or collector_id = auth.uid());

drop policy if exists collections_insert_owner on public.collections;
create policy collections_insert_owner
on public.collections
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists collections_update_owner_or_collector on public.collections;
create policy collections_update_owner_or_collector
on public.collections
for update
to authenticated
using (user_id = auth.uid() or collector_id = auth.uid())
with check (user_id = auth.uid() or collector_id = auth.uid());

drop policy if exists reward_redemptions_select_own on public.reward_redemptions;
create policy reward_redemptions_select_own
on public.reward_redemptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists reward_redemptions_insert_own on public.reward_redemptions;
create policy reward_redemptions_insert_own
on public.reward_redemptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists reward_redemptions_update_own on public.reward_redemptions;
create policy reward_redemptions_update_own
on public.reward_redemptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists kiosk_receipts_select_own on public.kiosk_receipts;
create policy kiosk_receipts_select_own
on public.kiosk_receipts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists collector_payments_select_own on public.collector_payments;
create policy collector_payments_select_own
on public.collector_payments
for select
to authenticated
using (collector_id = auth.uid());

drop policy if exists generator_payments_select_own on public.generator_payments;
create policy generator_payments_select_own
on public.generator_payments
for select
to authenticated
using (generator_id = auth.uid());

-- 5) Derived rows tied to collections (owner or collector can read)
drop policy if exists collection_trace_events_select_related on public.collection_trace_events;
create policy collection_trace_events_select_related
on public.collection_trace_events
for select
to authenticated
using (
  exists (
    select 1
    from public.collections c
    where c.id = collection_trace_events.collection_id
      and (c.user_id = auth.uid() or c.collector_id = auth.uid())
  )
);

drop policy if exists compliance_certificates_select_related on public.compliance_certificates;
create policy compliance_certificates_select_related
on public.compliance_certificates
for select
to authenticated
using (
  exists (
    select 1
    from public.collections c
    where c.id = compliance_certificates.collection_id
      and (c.user_id = auth.uid() or c.collector_id = auth.uid())
  )
);

drop policy if exists point_inventory_select_related on public.point_inventory;
create policy point_inventory_select_related
on public.point_inventory
for select
to authenticated
using (
  exists (
    select 1
    from public.collections c
    where c.id = point_inventory.collection_id
      and (c.user_id = auth.uid() or c.collector_id = auth.uid())
  )
);

-- 6) Analytics tables remain RLS-protected with no user policies.
-- Only service_role should access these tables.

commit;
