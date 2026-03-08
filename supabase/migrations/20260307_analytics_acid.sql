-- ACID foundation for analytics and session control.
-- Run this migration in Supabase SQL editor or via migration tooling before deploying updated server code.

create extension if not exists pgcrypto;

create table if not exists public.analytics_overview (
  id smallint primary key default 1 check (id = 1),
  total_visits bigint not null default 0,
  total_session_duration_ms bigint not null default 0,
  session_count bigint not null default 0,
  total_app_load_time_ms bigint not null default 0,
  app_load_sample_count bigint not null default 0,
  active_sessions integer not null default 0,
  concurrent_sessions integer not null default 0,
  peak_concurrent_sessions integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.analytics_overview (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.analytics_active_sessions (
  session_id text primary key,
  user_type text not null default 'unknown',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists analytics_active_sessions_last_seen_idx
on public.analytics_active_sessions (last_seen_at desc);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('visit', 'load', 'session_end')),
  user_type text not null default 'unknown',
  path text,
  session_id text,
  duration_ms bigint,
  load_time_ms bigint,
  "timestamp" timestamptz not null default now()
);

create index if not exists analytics_events_timestamp_idx
on public.analytics_events ("timestamp" desc);

create index if not exists analytics_events_user_type_idx
on public.analytics_events (user_type);

create or replace function public.analytics_sync_overview(p_ttl_seconds integer default 1200)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_active integer := 0;
  v_concurrent integer := 0;
  v_row public.analytics_overview;
begin
  delete from public.analytics_active_sessions
  where last_seen_at < (v_now - make_interval(secs => p_ttl_seconds));

  select count(*)::integer into v_active
  from public.analytics_active_sessions;

  v_concurrent := case when v_active > 1 then v_active else 0 end;

  update public.analytics_overview
  set
    active_sessions = v_active,
    concurrent_sessions = v_concurrent,
    peak_concurrent_sessions = greatest(peak_concurrent_sessions, v_concurrent),
    updated_at = v_now
  where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.analytics_track_visit(
  p_path text,
  p_user_type text default 'unknown'
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_row public.analytics_overview;
begin
  insert into public.analytics_events(type, user_type, path)
  values ('visit', coalesce(nullif(trim(p_user_type), ''), 'unknown'), p_path);

  update public.analytics_overview
  set
    total_visits = total_visits + 1,
    updated_at = now()
  where id = 1;

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_track_load(
  p_load_time_ms bigint,
  p_user_type text default 'unknown'
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_safe_load bigint := greatest(coalesce(p_load_time_ms, 0), 0);
  v_row public.analytics_overview;
begin
  insert into public.analytics_events(type, user_type, load_time_ms)
  values ('load', coalesce(nullif(trim(p_user_type), ''), 'unknown'), v_safe_load);

  update public.analytics_overview
  set
    total_app_load_time_ms = total_app_load_time_ms + v_safe_load,
    app_load_sample_count = app_load_sample_count + 1,
    updated_at = now()
  where id = 1;

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_session_start_tx(
  p_session_id text,
  p_started_at timestamptz default now(),
  p_user_type text default 'unknown'
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_row public.analytics_overview;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required';
  end if;

  insert into public.analytics_active_sessions(session_id, user_type, started_at, last_seen_at)
  values (
    btrim(p_session_id),
    coalesce(nullif(trim(p_user_type), ''), 'unknown'),
    coalesce(p_started_at, now()),
    now()
  )
  on conflict (session_id) do update
  set
    last_seen_at = excluded.last_seen_at,
    user_type = excluded.user_type;

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_session_ping_tx(
  p_session_id text,
  p_user_type text default 'unknown'
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_row public.analytics_overview;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required';
  end if;

  insert into public.analytics_active_sessions(session_id, user_type, started_at, last_seen_at)
  values (
    btrim(p_session_id),
    coalesce(nullif(trim(p_user_type), ''), 'unknown'),
    now(),
    now()
  )
  on conflict (session_id) do update
  set
    last_seen_at = now(),
    user_type = excluded.user_type;

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_track_session_end(
  p_session_id text,
  p_duration_ms bigint,
  p_user_type text default 'unknown'
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_safe_duration bigint := greatest(coalesce(p_duration_ms, 0), 0);
  v_user_type text := coalesce(nullif(trim(p_user_type), ''), 'unknown');
  v_active_user_type text;
  v_row public.analytics_overview;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required';
  end if;

  select user_type into v_active_user_type
  from public.analytics_active_sessions
  where session_id = btrim(p_session_id);

  delete from public.analytics_active_sessions
  where session_id = btrim(p_session_id);

  insert into public.analytics_events(type, user_type, session_id, duration_ms)
  values ('session_end', coalesce(v_active_user_type, v_user_type), btrim(p_session_id), v_safe_duration);

  update public.analytics_overview
  set
    total_session_duration_ms = total_session_duration_ms + v_safe_duration,
    session_count = session_count + 1,
    updated_at = now()
  where id = 1;

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_close_session_tx(
  p_session_id text
)
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_row public.analytics_overview;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required';
  end if;

  delete from public.analytics_active_sessions
  where session_id = btrim(p_session_id);

  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

create or replace function public.analytics_close_all_sessions_tx()
returns public.analytics_overview
language plpgsql
security definer
as $$
declare
  v_row public.analytics_overview;
begin
  delete from public.analytics_active_sessions;
  select * into v_row from public.analytics_sync_overview();
  return v_row;
end;
$$;

revoke all on function public.analytics_sync_overview(integer) from public;
revoke all on function public.analytics_track_visit(text, text) from public;
revoke all on function public.analytics_track_load(bigint, text) from public;
revoke all on function public.analytics_session_start_tx(text, timestamptz, text) from public;
revoke all on function public.analytics_session_ping_tx(text, text) from public;
revoke all on function public.analytics_track_session_end(text, bigint, text) from public;
revoke all on function public.analytics_close_session_tx(text) from public;
revoke all on function public.analytics_close_all_sessions_tx() from public;

grant execute on function public.analytics_sync_overview(integer) to service_role;
grant execute on function public.analytics_track_visit(text, text) to service_role;
grant execute on function public.analytics_track_load(bigint, text) to service_role;
grant execute on function public.analytics_session_start_tx(text, timestamptz, text) to service_role;
grant execute on function public.analytics_session_ping_tx(text, text) to service_role;
grant execute on function public.analytics_track_session_end(text, bigint, text) to service_role;
grant execute on function public.analytics_close_session_tx(text) to service_role;
grant execute on function public.analytics_close_all_sessions_tx() to service_role;

-- ================================================================
-- FULL PROJECT ACID FOUNDATION (single-run with this same script)
-- ================================================================

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'EcolLantApp',
  support_email text not null default 'soporte@ecollant.com',
  maintenance_mode boolean not null default false,
  rewards_enabled boolean not null default true,
  include_admin_analytics boolean not null default false,
  updated_at timestamptz not null default now(),
  raw_data jsonb
);

insert into public.app_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.user_profiles (
  id uuid primary key,
  email text,
  name text,
  phone text,
  type text not null default 'generator' check (type in ('generator', 'collector', 'admin')),
  points integer not null default 0,
  level text,
  address text,
  created_at timestamptz,
  raw_data jsonb
);

create table if not exists public.user_stats (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  total_collections integer not null default 0,
  total_tires integer not null default 0,
  total_points integer not null default 0,
  co2_saved numeric(14,2) not null default 0,
  trees_equivalent integer not null default 0,
  recycled_weight numeric(14,2) not null default 0,
  raw_data jsonb
);

create table if not exists public.collection_points (
  id text primary key,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  capacity integer not null default 0,
  current_load integer not null default 0,
  accepted_types text[] not null default '{}',
  hours text,
  phone text,
  created_by uuid,
  created_at timestamptz,
  raw_data jsonb
);

create table if not exists public.collections (
  id uuid primary key,
  user_id uuid references public.user_profiles(id),
  tire_count integer not null default 0,
  tire_type text,
  points integer not null default 0,
  status text not null default 'pending',
  description text,
  photo_url text,
  collector_id uuid,
  collector_name text,
  destination_type text,
  destination_point_id text references public.collection_points(id),
  arrived_at_point timestamptz,
  created_at timestamptz,
  completed_date timestamptz,
  traceability jsonb,
  compliance_certificate jsonb,
  raw_data jsonb
);


create table if not exists public.collection_trace_events (
  id text primary key,
  collection_id uuid not null references public.collections(id) on delete cascade,
  stage text,
  actor_type text,
  note text,
  metadata jsonb,
  event_timestamp timestamptz,
  raw_data jsonb
);

create index if not exists collection_trace_events_collection_idx
on public.collection_trace_events(collection_id, event_timestamp desc);

create table if not exists public.compliance_certificates (
  collection_id uuid primary key references public.collections(id) on delete cascade,
  certificate_id text,
  qr_code text,
  destination_type text,
  issued_at timestamptz,
  raw_data jsonb
);

create table if not exists public.kiosk_receipts (
  id text primary key,
  created_at timestamptz,
  point_id text references public.collection_points(id),
  point_name text,
  user_id uuid,
  tire_count integer,
  tire_type text,
  generator_name text,
  generator_document text,
  collection_id uuid,
  digital_proof text,
  raw_data jsonb
);

create table if not exists public.rewards_catalog (
  id text primary key,
  title text not null,
  description text,
  points_cost integer not null default 0,
  category text,
  sponsor text,
  is_active boolean not null default true,
  raw_data jsonb
);

create table if not exists public.reward_redemptions (
  id text primary key,
  user_id uuid references public.user_profiles(id),
  reward_id text references public.rewards_catalog(id),
  points_cost integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'cancelled')),
  coupon_code text unique,
  coupon_pdf_url text,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz,
  raw_data jsonb
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reward_redemptions'
      and column_name = 'coupon_code'
  ) then
    execute 'create index if not exists reward_redemptions_coupon_code_idx on public.reward_redemptions(coupon_code)';
  end if;
end;
$$;
create index if not exists reward_redemptions_status_idx on public.reward_redemptions(status);

create table if not exists public.point_inventory (
  id uuid primary key default gen_random_uuid(),
  point_id text not null references public.collection_points(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  arrived_at timestamptz not null default now(),
  tire_count integer not null default 0,
  tire_type text,
  weight_kg numeric(10,2),
  notes text,
  recorded_by uuid references public.user_profiles(id),
  raw_data jsonb
);

create index if not exists point_inventory_point_idx on public.point_inventory(point_id, arrived_at desc);
create index if not exists point_inventory_collection_idx on public.point_inventory(collection_id);


create table if not exists public.analytics_campaigns (
  id uuid primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  period text not null default 'daily' check (period in ('daily', 'weekly', 'monthly')),
  user_type text not null default 'all',
  status text not null default 'active' check (status in ('scheduled', 'active')),
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  raw_data jsonb
);

-- ---------- Compatibility normalization for pre-existing tables ----------

do $$
begin
  -- collections
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'userId'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'user_id'
  ) then
    execute 'alter table public.collections rename column "userId" to user_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'tireCount'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'tire_count'
  ) then
    execute 'alter table public.collections rename column "tireCount" to tire_count';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'tireType'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'tire_type'
  ) then
    execute 'alter table public.collections rename column "tireType" to tire_type';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'photoUrl'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'photo_url'
  ) then
    execute 'alter table public.collections rename column "photoUrl" to photo_url';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'collectorId'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'collector_id'
  ) then
    execute 'alter table public.collections rename column "collectorId" to collector_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'collectorName'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'collector_name'
  ) then
    execute 'alter table public.collections rename column "collectorName" to collector_name';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'destinationType'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'destination_type'
  ) then
    execute 'alter table public.collections rename column "destinationType" to destination_type';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'createdAt'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'created_at'
  ) then
    execute 'alter table public.collections rename column "createdAt" to created_at';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'completedDate'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'completed_date'
  ) then
    execute 'alter table public.collections rename column "completedDate" to completed_date';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'complianceCertificate'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'compliance_certificate'
  ) then
    execute 'alter table public.collections rename column "complianceCertificate" to compliance_certificate';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'rawData'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'raw_data'
  ) then
    execute 'alter table public.collections rename column "rawData" to raw_data';
  end if;

  -- reward_redemptions
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'userId'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'user_id'
  ) then
    execute 'alter table public.reward_redemptions rename column "userId" to user_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'rewardId'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'reward_id'
  ) then
    execute 'alter table public.reward_redemptions rename column "rewardId" to reward_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'pointsCost'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'points_cost'
  ) then
    execute 'alter table public.reward_redemptions rename column "pointsCost" to points_cost';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'createdAt'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'created_at'
  ) then
    execute 'alter table public.reward_redemptions rename column "createdAt" to created_at';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'rawData'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'raw_data'
  ) then
    execute 'alter table public.reward_redemptions rename column "rawData" to raw_data';
  end if;
exception when undefined_table then
  null;
end;
$$;

alter table if exists public.reward_redemptions add column if not exists user_id uuid;
alter table if exists public.reward_redemptions add column if not exists reward_id text;
alter table if exists public.reward_redemptions add column if not exists points_cost integer not null default 0;
alter table if exists public.reward_redemptions add column if not exists status text not null default 'pending';
alter table if exists public.reward_redemptions add column if not exists coupon_code text;
alter table if exists public.reward_redemptions add column if not exists coupon_pdf_url text;
alter table if exists public.reward_redemptions add column if not exists expires_at timestamptz;
alter table if exists public.reward_redemptions add column if not exists used_at timestamptz;
alter table if exists public.reward_redemptions add column if not exists created_at timestamptz;
alter table if exists public.reward_redemptions add column if not exists raw_data jsonb;

alter table if exists public.kiosk_receipts add column if not exists user_id uuid;
alter table if exists public.kiosk_receipts add column if not exists collection_id uuid;
alter table if exists public.kiosk_receipts add column if not exists created_at timestamptz;
alter table if exists public.kiosk_receipts add column if not exists raw_data jsonb;

alter table if exists public.collections add column if not exists user_id uuid;
alter table if exists public.collections add column if not exists tire_count integer not null default 0;
alter table if exists public.collections add column if not exists tire_type text;
alter table if exists public.collections add column if not exists points integer not null default 0;
alter table if exists public.collections add column if not exists status text not null default 'pending';
alter table if exists public.collections add column if not exists description text;
alter table if exists public.collections add column if not exists photo_url text;
alter table if exists public.collections add column if not exists collector_id uuid;
alter table if exists public.collections add column if not exists collector_name text;
alter table if exists public.collections add column if not exists destination_type text;
alter table if exists public.collections add column if not exists destination_point_id text;
alter table if exists public.collections add column if not exists arrived_at_point timestamptz;
alter table if exists public.collections add column if not exists created_at timestamptz;
alter table if exists public.collections add column if not exists completed_date timestamptz;
alter table if exists public.collections add column if not exists traceability jsonb;
alter table if exists public.collections add column if not exists compliance_certificate jsonb;
alter table if exists public.collections add column if not exists raw_data jsonb;

-- Legacy compatibility: some previous schemas had `collections.name` as NOT NULL.
-- The current ACID model does not require that column, so relax the constraint if present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'name'
  ) then
    execute 'alter table public.collections alter column name drop not null';
  end if;
exception when undefined_table then
  null;
end;
$$;

alter table if exists public.collection_points add column if not exists current_load integer not null default 0;
alter table if exists public.collection_points add column if not exists accepted_types text[] not null default '{}';
alter table if exists public.collection_points add column if not exists created_by uuid;
alter table if exists public.collection_points add column if not exists created_at timestamptz;
alter table if exists public.collection_points add column if not exists raw_data jsonb;

alter table if exists public.user_profiles add column if not exists created_at timestamptz;
alter table if exists public.user_profiles add column if not exists raw_data jsonb;

alter table if exists public.user_stats add column if not exists total_collections integer not null default 0;
alter table if exists public.user_stats add column if not exists total_tires integer not null default 0;
alter table if exists public.user_stats add column if not exists total_points integer not null default 0;
alter table if exists public.user_stats add column if not exists co2_saved numeric(14,2) not null default 0;
alter table if exists public.user_stats add column if not exists trees_equivalent integer not null default 0;
alter table if exists public.user_stats add column if not exists recycled_weight numeric(14,2) not null default 0;
alter table if exists public.user_stats add column if not exists raw_data jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'user_id'
  ) then
    execute 'create index if not exists collections_user_idx on public.collections(user_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'status'
  ) then
    execute 'create index if not exists collections_status_idx on public.collections(status)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reward_redemptions' and column_name = 'created_at'
  ) then
    execute 'create index if not exists reward_redemptions_user_idx on public.reward_redemptions(user_id, created_at desc)';
  end if;
end;
$$;

-- ---------- Backfill from kv_store_b7bf90da (safe and idempotent) ----------

insert into public.app_settings (
  id,
  app_name,
  support_email,
  maintenance_mode,
  rewards_enabled,
  include_admin_analytics,
  updated_at,
  raw_data
)
select
  1,
  coalesce(value->>'appName', 'EcolLantApp'),
  coalesce(value->>'supportEmail', 'soporte@ecollant.com'),
  coalesce((value->>'maintenanceMode')::boolean, false),
  coalesce((value->>'rewardsEnabled')::boolean, true),
  coalesce((value->>'includeAdminAnalytics')::boolean, false),
  coalesce(nullif(value->>'updatedAt', '')::timestamptz, now()),
  value
from public.kv_store_b7bf90da
where key = 'app:settings'
on conflict (id) do update
set
  app_name = excluded.app_name,
  support_email = excluded.support_email,
  maintenance_mode = excluded.maintenance_mode,
  rewards_enabled = excluded.rewards_enabled,
  include_admin_analytics = excluded.include_admin_analytics,
  updated_at = excluded.updated_at,
  raw_data = excluded.raw_data;

insert into public.user_profiles (
  id,
  email,
  name,
  phone,
  type,
  points,
  level,
  address,
  created_at,
  raw_data
)
select
  split_part(key, ':', 2)::uuid,
  value->>'email',
  value->>'name',
  value->>'phone',
  coalesce(nullif(value->>'type', ''), 'generator'),
  coalesce((value->>'points')::int, 0),
  value->>'level',
  value->>'address',
  nullif(value->>'createdAt', '')::timestamptz,
  value
from public.kv_store_b7bf90da
where key like 'user:%'
  and split_part(key, ':', 2) ~* '^[0-9a-f-]{36}$'
on conflict (id) do update
set
  email = excluded.email,
  name = excluded.name,
  phone = excluded.phone,
  type = excluded.type,
  points = excluded.points,
  level = excluded.level,
  address = excluded.address,
  created_at = excluded.created_at,
  raw_data = excluded.raw_data;

insert into public.user_stats (
  user_id,
  total_collections,
  total_tires,
  total_points,
  co2_saved,
  trees_equivalent,
  recycled_weight,
  raw_data
)
select
  split_part(key, ':', 2)::uuid,
  coalesce(nullif(value->>'totalCollections', '')::int, 0),
  coalesce(nullif(value->>'totalTires', '')::int, 0),
  coalesce(nullif(value->>'totalPoints', '')::int, 0),
  coalesce(nullif(value->>'co2Saved', '')::numeric, 0),
  coalesce(nullif(value->>'treesEquivalent', '')::int, 0),
  coalesce(nullif(value->>'recycledWeight', '')::numeric, 0),
  value
from public.kv_store_b7bf90da
where key like 'stats:%'
  and split_part(key, ':', 2) ~* '^[0-9a-f-]{36}$'
on conflict (user_id) do update
set
  total_collections = excluded.total_collections,
  total_tires = excluded.total_tires,
  total_points = excluded.total_points,
  co2_saved = excluded.co2_saved,
  trees_equivalent = excluded.trees_equivalent,
  recycled_weight = excluded.recycled_weight,
  raw_data = excluded.raw_data;

insert into public.collection_points (
  id,
  name,
  address,
  lat,
  lng,
  capacity,
  current_load,
  accepted_types,
  hours,
  phone,
  created_by,
  created_at,
  raw_data
)
select
  split_part(key, ':', 2),
  coalesce(value->>'name', 'Centro de Acopio'),
  value->>'address',
  nullif(value->'coordinates'->>'lat', '')::double precision,
  nullif(value->'coordinates'->>'lng', '')::double precision,
  coalesce(nullif(value->>'capacity', '')::int, 0),
  coalesce(nullif(value->>'currentLoad', '')::int, 0),
  coalesce(array(select jsonb_array_elements_text(coalesce(value->'acceptedTypes', '[]'::jsonb))), '{}'::text[]),
  value->>'hours',
  value->>'phone',
  nullif(value->>'createdBy', '')::uuid,
  nullif(value->>'createdAt', '')::timestamptz,
  value
from public.kv_store_b7bf90da
where key like 'point:%'
on conflict (id) do update
set
  name = excluded.name,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  capacity = excluded.capacity,
  current_load = excluded.current_load,
  accepted_types = excluded.accepted_types,
  hours = excluded.hours,
  phone = excluded.phone,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  raw_data = excluded.raw_data;

insert into public.collections (
  id,
  user_id,
  tire_count,
  tire_type,
  points,
  status,
  description,
  photo_url,
  collector_id,
  collector_name,
  destination_type,
  destination_point_id,
  arrived_at_point,
  created_at,
  completed_date,
  traceability,
  compliance_certificate,
  raw_data
)
select
  split_part(key, ':', 3)::uuid,
  split_part(key, ':', 2)::uuid,
  coalesce(nullif(value->>'tireCount', '')::int, 0),
  value->>'tireType',
  coalesce(nullif(value->>'points', '')::int, 0),
  coalesce(value->>'status', 'pending'),
  value->>'description',
  value->>'photoUrl',
  nullif(value->>'collectorId', '')::uuid,
  value->>'collectorName',
  value->>'destinationType',
  nullif(value->>'destinationPointId', ''),
  nullif(value->>'arrivedAtPoint', '')::timestamptz,
  nullif(value->>'createdAt', '')::timestamptz,
  nullif(value->>'completedDate', '')::timestamptz,
  value->'traceability',
  value->'complianceCertificate',
  value
from public.kv_store_b7bf90da
where key like 'collection:%:%'
  and split_part(key, ':', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(key, ':', 3) ~* '^[0-9a-f-]{36}$'
on conflict (id) do update
set
  user_id = excluded.user_id,
  tire_count = excluded.tire_count,
  tire_type = excluded.tire_type,
  points = excluded.points,
  status = excluded.status,
  description = excluded.description,
  photo_url = excluded.photo_url,
  collector_id = excluded.collector_id,
  collector_name = excluded.collector_name,
  destination_type = excluded.destination_type,
  destination_point_id = excluded.destination_point_id,
  arrived_at_point = excluded.arrived_at_point,
  created_at = excluded.created_at,
  completed_date = excluded.completed_date,
  traceability = excluded.traceability,
  compliance_certificate = excluded.compliance_certificate,
  raw_data = excluded.raw_data;

insert into public.collection_trace_events (
  id,
  collection_id,
  stage,
  actor_type,
  note,
  metadata,
  event_timestamp,
  raw_data
)
select
  coalesce(evt->>'id', md5(col.id::text || ':' || ord::text)),
  col.id,
  evt->>'stage',
  evt->>'actorType',
  evt->>'note',
  evt->'metadata',
  nullif(evt->>'timestamp', '')::timestamptz,
  evt
from public.collections col,
lateral jsonb_array_elements(coalesce(col.traceability->'events', '[]'::jsonb)) with ordinality as e(evt, ord)
on conflict (id) do update
set
  collection_id = excluded.collection_id,
  stage = excluded.stage,
  actor_type = excluded.actor_type,
  note = excluded.note,
  metadata = excluded.metadata,
  event_timestamp = excluded.event_timestamp,
  raw_data = excluded.raw_data;

insert into public.compliance_certificates (
  collection_id,
  certificate_id,
  qr_code,
  destination_type,
  issued_at,
  raw_data
)
select
  split_part(key, ':', 2)::uuid,
  value->>'certificateId',
  value->>'qrCode',
  value->>'destinationType',
  nullif(value->>'issuedAt', '')::timestamptz,
  value
from public.kv_store_b7bf90da
where key like 'certificate:%'
  and split_part(key, ':', 2) ~* '^[0-9a-f-]{36}$'
on conflict (collection_id) do update
set
  certificate_id = excluded.certificate_id,
  qr_code = excluded.qr_code,
  destination_type = excluded.destination_type,
  issued_at = excluded.issued_at,
  raw_data = excluded.raw_data;

insert into public.kiosk_receipts (
  id,
  created_at,
  point_id,
  point_name,
  user_id,
  tire_count,
  tire_type,
  generator_name,
  generator_document,
  collection_id,
  digital_proof,
  raw_data
)
select
  split_part(key, ':', 2),
  nullif(value->>'createdAt', '')::timestamptz,
  value->>'pointId',
  value->>'pointName',
  nullif(value->>'userId', '')::uuid,
  nullif(value->>'tireCount', '')::int,
  value->>'tireType',
  value->>'generatorName',
  value->>'generatorDocument',
  nullif(value->>'collectionId', '')::uuid,
  value->>'digitalProof',
  value
from public.kv_store_b7bf90da
where key like 'receipt:%'
on conflict (id) do update
set
  created_at = excluded.created_at,
  point_id = excluded.point_id,
  point_name = excluded.point_name,
  user_id = excluded.user_id,
  tire_count = excluded.tire_count,
  tire_type = excluded.tire_type,
  generator_name = excluded.generator_name,
  generator_document = excluded.generator_document,
  collection_id = excluded.collection_id,
  digital_proof = excluded.digital_proof,
  raw_data = excluded.raw_data;

insert into public.rewards_catalog (
  id,
  title,
  description,
  points_cost,
  category,
  sponsor,
  is_active,
  raw_data
)
select
  split_part(key, ':', 2),
  coalesce(value->>'title', 'Recompensa'),
  value->>'description',
  coalesce(nullif(value->>'pointsCost', '')::int, 0),
  value->>'category',
  value->>'sponsor',
  coalesce((value->>'isActive')::boolean, true),
  value
from public.kv_store_b7bf90da
where key like 'reward:%'
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  points_cost = excluded.points_cost,
  category = excluded.category,
  sponsor = excluded.sponsor,
  is_active = excluded.is_active,
  raw_data = excluded.raw_data;

insert into public.reward_redemptions (
  id,
  user_id,
  reward_id,
  points_cost,
  status,
  coupon_code,
  coupon_pdf_url,
  expires_at,
  used_at,
  created_at,
  raw_data
)
select
  split_part(key, ':', 3),
  split_part(key, ':', 2)::uuid,
  value->>'rewardId',
  coalesce(nullif(value->>'pointsCost', '')::int, 0),
  coalesce(value->>'status', 'pending'),
  value->>'couponCode',
  value->>'couponPdfUrl',
  nullif(value->>'expiresAt', '')::timestamptz,
  nullif(value->>'usedAt', '')::timestamptz,
  nullif(value->>'createdAt', '')::timestamptz,
  value
from public.kv_store_b7bf90da
where key like 'redemption:%:%'
  and split_part(key, ':', 2) ~* '^[0-9a-f-]{36}$'
on conflict (id) do update
set
  user_id = excluded.user_id,
  reward_id = excluded.reward_id,
  points_cost = excluded.points_cost,
  status = excluded.status,
  coupon_code = excluded.coupon_code,
  coupon_pdf_url = excluded.coupon_pdf_url,
  expires_at = excluded.expires_at,
  used_at = excluded.used_at,
  created_at = excluded.created_at,
  raw_data = excluded.raw_data;

insert into public.analytics_campaigns (
  id,
  name,
  starts_at,
  ends_at,
  period,
  user_type,
  status,
  created_at,
  created_by,
  updated_at,
  updated_by,
  raw_data
)
select
  split_part(key, ':', 3)::uuid,
  coalesce(value->>'name', 'Campana'),
  coalesce(nullif(value->>'startsAt', '')::timestamptz, now()),
  nullif(value->>'endsAt', '')::timestamptz,
  coalesce(value->>'period', 'daily'),
  coalesce(value->>'userType', 'all'),
  coalesce(value->>'status', 'active'),
  nullif(value->>'createdAt', '')::timestamptz,
  nullif(value->>'createdBy', '')::uuid,
  nullif(value->>'updatedAt', '')::timestamptz,
  nullif(value->>'updatedBy', '')::uuid,
  value
from public.kv_store_b7bf90da
where key like 'analytics:campaign:%'
  and split_part(key, ':', 3) ~* '^[0-9a-f-]{36}$'
on conflict (id) do update
set
  name = excluded.name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  period = excluded.period,
  user_type = excluded.user_type,
  status = excluded.status,
  created_at = excluded.created_at,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by,
  raw_data = excluded.raw_data;

-- ================================================================
-- SISTEMA DE PAGOS PARA RECOLECTORES Y GENERADORES
-- ================================================================

-- Tabla de configuración de pagos
create table if not exists public.payment_settings (
  id smallint primary key default 1 check (id = 1),
  -- Configuración para recolectores
  payment_per_km numeric(10,2) not null default 2.50,
  min_payment_amount numeric(10,2) not null default 50.00,
  min_collector_points integer not null default 10,
  -- Configuración para generadores
  points_per_tire integer not null default 100,
  cash_payment_per_tire numeric(10,2) not null default 5.00,
  min_generator_points_on_cash integer not null default 5,
  -- Metadatos
  currency text not null default 'HNL',
  updated_at timestamptz not null default now(),
  raw_data jsonb
);

insert into public.payment_settings (id)
values (1)
on conflict (id) do nothing;

-- Tabla de pagos a recolectores
create table if not exists public.collector_payments (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  collector_id uuid not null references public.user_profiles(id),
  -- Cálculo de distancia
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_lat double precision,
  delivery_lng double precision,
  distance_km numeric(10,2),
  -- Pago calculado
  payment_amount numeric(10,2) not null default 0,
  points_awarded integer not null default 0,
  -- Estado del pago
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_method text check (payment_method in ('bank_transfer', 'cash', 'digital_wallet')),
  payment_reference text,
  -- Auditoría
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.user_profiles(id),
  notes text,
  raw_data jsonb
);

create index if not exists collector_payments_collector_idx on public.collector_payments(collector_id, created_at desc);
create index if not exists collector_payments_collection_idx on public.collector_payments(collection_id);
create index if not exists collector_payments_status_idx on public.collector_payments(status);

-- Tabla de pagos a generadores
create table if not exists public.generator_payments (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  generator_id uuid not null references public.user_profiles(id),
  -- Preferencia de pago
  payment_preference text not null default 'points' check (payment_preference in ('points', 'cash')),
  tire_count integer not null default 0,
  -- Pago calculado
  cash_amount numeric(10,2) not null default 0,
  points_awarded integer not null default 0,
  -- Estado del pago
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_method text check (payment_method in ('bank_transfer', 'cash', 'digital_wallet', 'points')),
  payment_reference text,
  -- Auditoría
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.user_profiles(id),
  notes text,
  raw_data jsonb
);

create index if not exists generator_payments_generator_idx on public.generator_payments(generator_id, created_at desc);
create index if not exists generator_payments_collection_idx on public.generator_payments(collection_id);
create index if not exists generator_payments_status_idx on public.generator_payments(status);

-- Agregar campos relacionados con pagos a la tabla collections
alter table if exists public.collections add column if not exists pickup_lat double precision;
alter table if exists public.collections add column if not exists pickup_lng double precision;
alter table if exists public.collections add column if not exists delivery_lat double precision;
alter table if exists public.collections add column if not exists delivery_lng double precision;
alter table if exists public.collections add column if not exists distance_km numeric(10,2);
alter table if exists public.collections add column if not exists generator_payment_preference text default 'points' check (generator_payment_preference in ('points', 'cash'));
alter table if exists public.collections add column if not exists collector_payment_amount numeric(10,2);
alter table if exists public.collections add column if not exists generator_payment_amount numeric(10,2);

-- Función para calcular distancia entre dos coordenadas usando fórmula de Haversine
create or replace function public.calculate_distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_earth_radius_km numeric := 6371.0;
  v_dlat numeric;
  v_dlng numeric;
  v_a numeric;
  v_c numeric;
begin
  if p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then
    return null;
  end if;

  -- Convertir a radianes
  v_dlat := radians(p_lat2 - p_lat1);
  v_dlng := radians(p_lng2 - p_lng1);
  
  -- Fórmula de Haversine
  v_a := sin(v_dlat / 2) ^ 2 + 
         cos(radians(p_lat1)) * cos(radians(p_lat2)) * 
         sin(v_dlng / 2) ^ 2;
  v_c := 2 * atan2(sqrt(v_a), sqrt(1 - v_a));
  
  return round((v_earth_radius_km * v_c)::numeric, 2);
end;
$$;

-- Función para calcular el pago del recolector basado en distancia
create or replace function public.calculate_collector_payment(
  p_distance_km numeric
)
returns table(payment_amount numeric, points_awarded integer)
language plpgsql
stable
as $$
declare
  v_settings public.payment_settings;
  v_calculated_payment numeric;
begin
  select * into v_settings from public.payment_settings where id = 1;
  
  if p_distance_km is null or p_distance_km <= 0 then
    return query select 
      v_settings.min_payment_amount,
      v_settings.min_collector_points;
    return;
  end if;
  
  -- Calcular pago basado en distancia
  v_calculated_payment := p_distance_km * v_settings.payment_per_km;
  
  -- Asegurar pago mínimo
  if v_calculated_payment < v_settings.min_payment_amount then
    v_calculated_payment := v_settings.min_payment_amount;
  end if;
  
  return query select 
    round(v_calculated_payment, 2),
    v_settings.min_collector_points;
end;
$$;

-- Función para calcular el pago del generador
create or replace function public.calculate_generator_payment(
  p_tire_count integer,
  p_payment_preference text
)
returns table(cash_amount numeric, points_awarded integer)
language plpgsql
stable
as $$
declare
  v_settings public.payment_settings;
  v_cash numeric := 0;
  v_points integer := 0;
begin
  select * into v_settings from public.payment_settings where id = 1;
  
  if p_tire_count is null or p_tire_count <= 0 then
    return query select 0::numeric, 0::integer;
    return;
  end if;
  
  if p_payment_preference = 'cash' then
    -- Pago en efectivo + puntos mínimos
    v_cash := p_tire_count * v_settings.cash_payment_per_tire;
    v_points := v_settings.min_generator_points_on_cash * p_tire_count;
  else
    -- Pago en puntos completo (sin efectivo)
    v_cash := 0;
    v_points := p_tire_count * v_settings.points_per_tire;
  end if;
  
  return query select 
    round(v_cash, 2),
    v_points;
end;
$$;

-- Función para crear pago del recolector cuando se completa una recolección
create or replace function public.create_collector_payment(
  p_collection_id uuid,
  p_collector_id uuid,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_delivery_lat double precision,
  p_delivery_lng double precision
)
returns public.collector_payments
language plpgsql
security definer
as $$
declare
  v_distance numeric;
  v_payment_calc record;
  v_payment public.collector_payments;
begin
  -- Calcular distancia
  v_distance := public.calculate_distance_km(
    p_pickup_lat, p_pickup_lng,
    p_delivery_lat, p_delivery_lng
  );
  
  -- Calcular pago y puntos
  select * into v_payment_calc from public.calculate_collector_payment(v_distance);
  
  -- Crear registro de pago
  insert into public.collector_payments (
    collection_id,
    collector_id,
    pickup_lat,
    pickup_lng,
    delivery_lat,
    delivery_lng,
    distance_km,
    payment_amount,
    points_awarded,
    status
  ) values (
    p_collection_id,
    p_collector_id,
    p_pickup_lat,
    p_pickup_lng,
    p_delivery_lat,
    p_delivery_lng,
    v_distance,
    v_payment_calc.payment_amount,
    v_payment_calc.points_awarded,
    'pending'
  )
  returning * into v_payment;
  
  -- Actualizar la tabla collections
  update public.collections
  set
    pickup_lat = p_pickup_lat,
    pickup_lng = p_pickup_lng,
    delivery_lat = p_delivery_lat,
    delivery_lng = p_delivery_lng,
    distance_km = v_distance,
    collector_payment_amount = v_payment_calc.payment_amount
  where id = p_collection_id;
  
  return v_payment;
end;
$$;

-- Función para crear pago del generador
create or replace function public.create_generator_payment(
  p_collection_id uuid,
  p_generator_id uuid,
  p_tire_count integer,
  p_payment_preference text
)
returns public.generator_payments
language plpgsql
security definer
as $$
declare
  v_payment_calc record;
  v_payment public.generator_payments;
begin
  -- Calcular pago
  select * into v_payment_calc from public.calculate_generator_payment(
    p_tire_count,
    coalesce(p_payment_preference, 'points')
  );
  
  -- Crear registro de pago
  insert into public.generator_payments (
    collection_id,
    generator_id,
    payment_preference,
    tire_count,
    cash_amount,
    points_awarded,
    status,
    payment_method
  ) values (
    p_collection_id,
    p_generator_id,
    coalesce(p_payment_preference, 'points'),
    p_tire_count,
    v_payment_calc.cash_amount,
    v_payment_calc.points_awarded,
    'pending',
    case when coalesce(p_payment_preference, 'points') = 'cash' then 'cash' else 'points' end
  )
  returning * into v_payment;
  
  -- Actualizar la tabla collections
  update public.collections
  set
    generator_payment_preference = coalesce(p_payment_preference, 'points'),
    generator_payment_amount = v_payment_calc.cash_amount
  where id = p_collection_id;
  
  -- Si el pago es en puntos, actualizar puntos del usuario inmediatamente
  if coalesce(p_payment_preference, 'points') = 'points' then
    update public.user_profiles
    set points = points + v_payment_calc.points_awarded
    where id = p_generator_id;
  end if;
  
  return v_payment;
end;
$$;

-- Función para procesar pago del recolector (marcar como completado y actualizar puntos)
create or replace function public.process_collector_payment(
  p_payment_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_processed_by uuid
)
returns public.collector_payments
language plpgsql
security definer
as $$
declare
  v_payment public.collector_payments;
begin
  -- Actualizar estado del pago
  update public.collector_payments
  set
    status = 'completed',
    payment_method = p_payment_method,
    payment_reference = p_payment_reference,
    processed_at = now(),
    processed_by = p_processed_by
  where id = p_payment_id
  returning * into v_payment;
  
  if not found then
    raise exception 'Payment not found: %', p_payment_id;
  end if;
  
  -- Actualizar puntos del recolector
  update public.user_profiles
  set points = points + v_payment.points_awarded
  where id = v_payment.collector_id;
  
  return v_payment;
end;
$$;

-- Función para procesar pago del generador (marcar como completado)
create or replace function public.process_generator_payment(
  p_payment_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_processed_by uuid
)
returns public.generator_payments
language plpgsql
security definer
as $$
declare
  v_payment public.generator_payments;
begin
  -- Actualizar estado del pago
  update public.generator_payments
  set
    status = 'completed',
    payment_method = p_payment_method,
    payment_reference = p_payment_reference,
    processed_at = now(),
    processed_by = p_processed_by
  where id = p_payment_id
  returning * into v_payment;
  
  if not found then
    raise exception 'Payment not found: %', p_payment_id;
  end if;
  
  -- Si el pago es en efectivo, actualizar puntos mínimos (si no se hizo antes)
  if v_payment.payment_preference = 'cash' and v_payment.points_awarded > 0 then
    update public.user_profiles
    set points = points + v_payment.points_awarded
    where id = v_payment.generator_id;
  end if;
  
  return v_payment;
end;
$$;

-- Permisos para las funciones de pagos
grant execute on function public.calculate_distance_km(double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.calculate_collector_payment(numeric) to service_role;
grant execute on function public.calculate_generator_payment(integer, text) to service_role;
grant execute on function public.create_collector_payment(uuid, uuid, double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.create_generator_payment(uuid, uuid, integer, text) to service_role;
grant execute on function public.process_collector_payment(uuid, text, text, uuid) to service_role;
grant execute on function public.process_generator_payment(uuid, text, text, uuid) to service_role;
