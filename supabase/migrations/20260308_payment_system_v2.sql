-- ================================================================
-- SISTEMA DE PAGOS V2 - CON TARIFAS POR TIPO Y ESTADO DE LLANTA
-- ================================================================
-- Ejecuta este SQL en el SQL Editor de Supabase después del payment_system.sql
-- https://supabase.com/dashboard/project/tqsjlywjyxgeixawlrcq/sql/new

-- Tabla de tarifas por tipo de llanta para recolectores
create table if not exists public.collector_tire_rates (
  id uuid primary key default gen_random_uuid(),
  tire_type text not null check (tire_type in ('Automóvil', 'Motocicleta', 'Camión', 'Bicicleta', 'Autobús', 'Otro')),
  tire_condition text not null check (tire_condition in ('excelente', 'buena', 'regular', 'desgastada')),
  base_rate_per_km numeric(10,2) not null default 2.50,
  min_payment numeric(10,2) not null default 50.00,
  bonus_points integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tire_type, tire_condition)
);

-- Tabla de tarifas por tipo de llanta para generadores
create table if not exists public.generator_tire_rates (
  id uuid primary key default gen_random_uuid(),
  tire_type text not null check (tire_type in ('Automóvil', 'Motocicleta', 'Camión', 'Bicicleta', 'Autobús', 'Otro')),
  tire_condition text not null check (tire_condition in ('excelente', 'buena', 'regular', 'desgastada')),
  points_per_tire integer not null default 100,
  cash_per_tire numeric(10,2) not null default 5.00,
  min_points_on_cash integer not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tire_type, tire_condition)
);

-- Agregar campos de tipo y condición a las tablas de pagos
alter table if exists public.collector_payments add column if not exists tire_type text;
alter table if exists public.collector_payments add column if not exists tire_condition text;
alter table if exists public.generator_payments add column if not exists tire_condition text;

-- Agregar campos de condición a collections
alter table if exists public.collections add column if not exists tire_condition text default 'regular' check (tire_condition in ('excelente', 'buena', 'regular', 'desgastada'));

-- Insertar tarifas por defecto para recolectores (todas las combinaciones)
insert into public.collector_tire_rates (tire_type, tire_condition, base_rate_per_km, min_payment, bonus_points) values
  -- Automóvil
  ('Automóvil', 'excelente', 3.00, 60.00, 15),
  ('Automóvil', 'buena', 2.50, 50.00, 12),
  ('Automóvil', 'regular', 2.00, 40.00, 10),
  ('Automóvil', 'desgastada', 1.50, 30.00, 8),
  -- Motocicleta
  ('Motocicleta', 'excelente', 2.00, 40.00, 10),
  ('Motocicleta', 'buena', 1.75, 35.00, 8),
  ('Motocicleta', 'regular', 1.50, 30.00, 7),
  ('Motocicleta', 'desgastada', 1.25, 25.00, 5),
  -- Camión
  ('Camión', 'excelente', 5.00, 100.00, 25),
  ('Camión', 'buena', 4.50, 90.00, 22),
  ('Camión', 'regular', 4.00, 80.00, 20),
  ('Camión', 'desgastada', 3.50, 70.00, 18),
  -- Bicicleta
  ('Bicicleta', 'excelente', 1.00, 20.00, 5),
  ('Bicicleta', 'buena', 0.90, 18.00, 4),
  ('Bicicleta', 'regular', 0.80, 15.00, 3),
  ('Bicicleta', 'desgastada', 0.70, 12.00, 2),
  -- Autobús
  ('Autobús', 'excelente', 6.00, 120.00, 30),
  ('Autobús', 'buena', 5.50, 110.00, 28),
  ('Autobús', 'regular', 5.00, 100.00, 25),
  ('Autobús', 'desgastada', 4.50, 90.00, 22),
  -- Otro
  ('Otro', 'excelente', 2.50, 50.00, 10),
  ('Otro', 'buena', 2.25, 45.00, 9),
  ('Otro', 'regular', 2.00, 40.00, 8),
  ('Otro', 'desgastada', 1.75, 35.00, 7)
on conflict (tire_type, tire_condition) do nothing;

-- Insertar tarifas por defecto para generadores (todas las combinaciones)
insert into public.generator_tire_rates (tire_type, tire_condition, points_per_tire, cash_per_tire, min_points_on_cash) values
  -- Automóvil
  ('Automóvil', 'excelente', 150, 7.50, 8),
  ('Automóvil', 'buena', 100, 5.00, 5),
  ('Automóvil', 'regular', 60, 3.00, 3),
  ('Automóvil', 'desgastada', 20, 1.00, 2),
  -- Motocicleta
  ('Motocicleta', 'excelente', 80, 4.00, 5),
  ('Motocicleta', 'buena', 60, 3.00, 4),
  ('Motocicleta', 'regular', 40, 2.00, 3),
  ('Motocicleta', 'desgastada', 15, 0.75, 2),
  -- Camión
  ('Camión', 'excelente', 250, 12.50, 15),
  ('Camión', 'buena', 180, 9.00, 12),
  ('Camión', 'regular', 120, 6.00, 8),
  ('Camión', 'desgastada', 50, 2.50, 5),
  -- Bicicleta
  ('Bicicleta', 'excelente', 40, 2.00, 3),
  ('Bicicleta', 'buena', 30, 1.50, 2),
  ('Bicicleta', 'regular', 20, 1.00, 2),
  ('Bicicleta', 'desgastada', 10, 0.50, 1),
  -- Autobús
  ('Autobús', 'excelente', 300, 15.00, 20),
  ('Autobús', 'buena', 220, 11.00, 15),
  ('Autobús', 'regular', 150, 7.50, 10),
  ('Autobús', 'desgastada', 60, 3.00, 5),
  -- Otro
  ('Otro', 'excelente', 100, 5.00, 5),
  ('Otro', 'buena', 70, 3.50, 4),
  ('Otro', 'regular', 50, 2.50, 3),
  ('Otro', 'desgastada', 20, 1.00, 2)
on conflict (tire_type, tire_condition) do nothing;

-- Función mejorada para calcular pago del recolector considerando tipo y condición
create or replace function public.calculate_collector_payment_v2(
  p_distance_km numeric,
  p_tire_type text,
  p_tire_condition text
)
returns table(payment_amount numeric, points_awarded integer)
language plpgsql
stable
as $$
declare
  v_rate record;
  v_calculated_payment numeric;
begin
  -- Buscar la tarifa específica para este tipo y condición
  select * into v_rate 
  from public.collector_tire_rates 
  where tire_type = p_tire_type 
    and tire_condition = p_tire_condition 
    and is_active = true;
  
  -- Si no se encuentra tarifa específica, usar valores por defecto de payment_settings
  if not found then
    declare
      v_settings public.payment_settings;
    begin
      select * into v_settings from public.payment_settings where id = 1;
      
      if p_distance_km is null or p_distance_km <= 0 then
        return query select 
          v_settings.min_payment_amount,
          v_settings.min_collector_points;
        return;
      end if;
      
      v_calculated_payment := p_distance_km * v_settings.payment_per_km;
      
      if v_calculated_payment < v_settings.min_payment_amount then
        v_calculated_payment := v_settings.min_payment_amount;
      end if;
      
      return query select 
        round(v_calculated_payment, 2),
        v_settings.min_collector_points;
      return;
    end;
  end if;
  
  -- Calcular con tarifa específica
  if p_distance_km is null or p_distance_km <= 0 then
    return query select 
      v_rate.min_payment,
      v_rate.bonus_points;
    return;
  end if;
  
  v_calculated_payment := p_distance_km * v_rate.base_rate_per_km;
  
  if v_calculated_payment < v_rate.min_payment then
    v_calculated_payment := v_rate.min_payment;
  end if;
  
  return query select 
    round(v_calculated_payment, 2),
    v_rate.bonus_points;
end;
$$;

-- Función mejorada para calcular pago del generador considerando tipo y condición  
create or replace function public.calculate_generator_payment_v2(
  p_tire_count integer,
  p_tire_type text,
  p_tire_condition text,
  p_payment_preference text
)
returns table(cash_amount numeric, points_awarded integer)
language plpgsql
stable
as $$
declare
  v_rate record;
  v_cash numeric := 0;
  v_points integer := 0;
begin
  if p_tire_count is null or p_tire_count <= 0 then
    return query select 0::numeric, 0::integer;
    return;
  end if;
  
  -- Buscar la tarifa específica para este tipo y condición
  select * into v_rate 
  from public.generator_tire_rates 
  where tire_type = p_tire_type 
    and tire_condition = p_tire_condition 
    and is_active = true;
  
  -- Si no se encuentra tarifa específica, usar valores por defecto de payment_settings
  if not found then
    declare
      v_settings public.payment_settings;
    begin
      select * into v_settings from public.payment_settings where id = 1;
      
      if p_payment_preference = 'cash' then
        v_cash := p_tire_count * v_settings.cash_payment_per_tire;
        v_points := v_settings.min_generator_points_on_cash * p_tire_count;
      else
        v_cash := 0;
        v_points := p_tire_count * v_settings.points_per_tire;
      end if;
      
      return query select 
        round(v_cash, 2),
        v_points;
      return;
    end;
  end if;
  
  -- Calcular con tarifa específica
  if p_payment_preference = 'cash' then
    v_cash := p_tire_count * v_rate.cash_per_tire;
    v_points := v_rate.min_points_on_cash * p_tire_count;
  else
    v_cash := 0;
    v_points := p_tire_count * v_rate.points_per_tire;
  end if;
  
  return query select 
    round(v_cash, 2),
    v_points;
end;
$$;

-- Actualizar función de creación de pago de recolector
create or replace function public.create_collector_payment_v2(
  p_collection_id uuid,
  p_collector_id uuid,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_delivery_lat double precision,
  p_delivery_lng double precision,
  p_tire_type text,
  p_tire_condition text
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
  
  -- Calcular pago y puntos según tipo y condición
  select * into v_payment_calc from public.calculate_collector_payment_v2(
    v_distance, 
    p_tire_type, 
    p_tire_condition
  );
  
  -- Crear registro de pago
  insert into public.collector_payments (
    collection_id,
    collector_id,
    pickup_lat,
    pickup_lng,
    delivery_lat,
    delivery_lng,
    distance_km,
    tire_type,
    tire_condition,
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
    p_tire_type,
    p_tire_condition,
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
    tire_condition = p_tire_condition,
    collector_payment_amount = v_payment_calc.payment_amount
  where id = p_collection_id;
  
  return v_payment;
end;
$$;

-- Actualizar función de creación de pago de generador
create or replace function public.create_generator_payment_v2(
  p_collection_id uuid,
  p_generator_id uuid,
  p_tire_count integer,
  p_tire_type text,
  p_tire_condition text,
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
  -- Calcular pago según tipo y condición
  select * into v_payment_calc from public.calculate_generator_payment_v2(
    p_tire_count,
    p_tire_type,
    p_tire_condition,
    coalesce(p_payment_preference, 'points')
  );
  
  -- Crear registro de pago
  insert into public.generator_payments (
    collection_id,
    generator_id,
    payment_preference,
    tire_count,
    tire_condition,
    cash_amount,
    points_awarded,
    status,
    payment_method
  ) values (
    p_collection_id,
    p_generator_id,
    coalesce(p_payment_preference, 'points'),
    p_tire_count,
    p_tire_condition,
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
    tire_condition = p_tire_condition,
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

-- Permisos para las nuevas funciones
grant execute on function public.calculate_collector_payment_v2(numeric, text, text) to service_role;
grant execute on function public.calculate_generator_payment_v2(integer, text, text, text) to service_role;
grant execute on function public.create_collector_payment_v2(uuid, uuid, double precision, double precision, double precision, double precision, text, text) to service_role;
grant execute on function public.create_generator_payment_v2(uuid, uuid, integer, text, text, text) to service_role;

-- Verificación: Deberías ver las nuevas tablas y tarifas
-- SELECT tire_type, tire_condition, base_rate_per_km, min_payment FROM collector_tire_rates ORDER BY tire_type, tire_condition;
-- SELECT tire_type, tire_condition, points_per_tire, cash_per_tire FROM generator_tire_rates ORDER BY tire_type, tire_condition;
