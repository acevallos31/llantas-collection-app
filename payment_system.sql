-- ================================================================
-- SISTEMA DE PAGOS PARA RECOLECTORES Y GENERADORES
-- ================================================================
-- Ejecuta este SQL en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/tqsjlywjyxgeixawlrcq/sql/new

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

-- Verificación: Si todo se ejecutó correctamente, deberías ver estas tablas
-- Ejecuta esta query para verificar:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%payment%';
