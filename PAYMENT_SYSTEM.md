# Sistema de Pagos para Recolectores y Generadores

## Descripción General

Este sistema permite gestionar pagos tanto para recolectores como para generadores de llantas usadas. Los pagos se calculan automáticamente según diferentes criterios:

- **Recolectores**: Se les paga según la distancia recorrida desde el punto de recolección hasta el punto de entrega
- **Generadores**: Pueden elegir recibir puntos en la plataforma o efectivo (con puntos mínimos)

## Tablas Creadas

### 1. `payment_settings`
Configuración centralizada del sistema de pagos:

| Campo | Tipo | Descripción | Valor por Defecto |
|-------|------|-------------|-------------------|
| `payment_per_km` | numeric | Pago por kilómetro para recolectores | 2.50 HNL |
| `min_payment_amount` | numeric | Pago mínimo garantizado para recolectores | 50.00 HNL |
| `min_collector_points` | integer | Puntos mínimos para cada recolección | 10 puntos |
| `points_per_tire` | integer | Puntos por llanta (cuando el generador elige puntos) | 100 puntos |
| `cash_payment_per_tire` | numeric | Pago en efectivo por llanta | 5.00 HNL |
| `min_generator_points_on_cash` | integer | Puntos mínimos cuando el generador elige efectivo | 5 puntos |
| `currency` | text | Moneda | HNL |

### 2. `collector_payments`
Registro de pagos a recolectores:

**Campos principales:**
- `collection_id`: Referencia a la recolección
- `collector_id`: ID del recolector
- `distance_km`: Distancia calculada automáticamente
- `payment_amount`: Monto a pagar calculado
- `points_awarded`: Puntos otorgados
- `status`: Estado del pago (pending, processing, completed, failed, cancelled)
- `payment_method`: Método de pago (bank_transfer, cash, digital_wallet)

### 3. `generator_payments`
Registro de pagos a generadores:

**Campos principales:**
- `collection_id`: Referencia a la recolección
- `generator_id`: ID del generador
- `payment_preference`: Preferencia del generador ('points' o 'cash')
- `tire_count`: Cantidad de llantas
- `cash_amount`: Monto en efectivo (si aplica)
- `points_awarded`: Puntos otorgados
- `status`: Estado del pago

### 4. Campos Agregados a `collections`

- `pickup_lat`, `pickup_lng`: Coordenadas del punto de recolección
- `delivery_lat`, `delivery_lng`: Coordenadas del punto de entrega
- `distance_km`: Distancia calculada
- `generator_payment_preference`: Preferencia de pago del generador
- `collector_payment_amount`: Monto a pagar al recolector
- `generator_payment_amount`: Monto a pagar al generador (si eligió efectivo)

## Funciones Disponibles

### Cálculo de Distancia

```sql
select public.calculate_distance_km(
  19.4326,  -- lat1
  -99.1332, -- lng1
  19.5000,  -- lat2
  -99.2000  -- lng2
);
-- Retorna: distancia en kilómetros
```

### Calcular Pago del Recolector

```sql
select * from public.calculate_collector_payment(15.5);
-- Retorna: payment_amount, points_awarded
```

### Calcular Pago del Generador

```sql
-- Pago en puntos
select * from public.calculate_generator_payment(10, 'points');
-- Retorna: cash_amount = 0, points_awarded = 1000

-- Pago en efectivo
select * from public.calculate_generator_payment(10, 'cash');
-- Retorna: cash_amount = 50.00, points_awarded = 50
```

### Crear Pago del Recolector

```sql
select public.create_collector_payment(
  'collection-uuid'::uuid,     -- ID de la recolección
  'collector-uuid'::uuid,      -- ID del recolector
  19.4326,                     -- latitud de recolección
  -99.1332,                    -- longitud de recolección
  19.5000,                     -- latitud de entrega
  -99.2000                     -- longitud de entrega
);
```

Esta función:
1. Calcula la distancia entre puntos
2. Calcula el pago según la configuración
3. Crea el registro en `collector_payments`
4. Actualiza los campos de la recolección

### Crear Pago del Generador

```sql
select public.create_generator_payment(
  'collection-uuid'::uuid,     -- ID de la recolección
  'generator-uuid'::uuid,      -- ID del generador
  10,                          -- cantidad de llantas
  'cash'                       -- preferencia: 'cash' o 'points'
);
```

Esta función:
1. Calcula el pago según la preferencia
2. Crea el registro en `generator_payments`
3. Si eligió puntos, los actualiza inmediatamente en `user_profiles`
4. Actualiza los campos de la recolección

### Procesar Pago del Recolector

```sql
select public.process_collector_payment(
  'payment-uuid'::uuid,        -- ID del pago
  'bank_transfer',             -- método de pago
  'REF-12345',                 -- referencia del pago
  'admin-uuid'::uuid           -- ID del admin que procesa
);
```

Esta función:
1. Marca el pago como 'completed'
2. Registra el método de pago y referencia
3. Actualiza los puntos del recolector

### Procesar Pago del Generador

```sql
select public.process_generator_payment(
  'payment-uuid'::uuid,        -- ID del pago
  'cash',                      -- método de pago
  'REF-12345',                 -- referencia del pago
  'admin-uuid'::uuid           -- ID del admin que procesa
);
```

## Flujo de Trabajo Típico

### Para una nueva recolección:

1. **El generador solicita la recolección** indicando su preferencia de pago:
   ```sql
   -- Al crear la collection, incluir:
   generator_payment_preference = 'cash'  -- o 'points'
   ```

2. **El recolector acepta y completa la recolección**

3. **Crear pagos automáticamente**:
   ```sql
   -- Pago al generador
   select public.create_generator_payment(
     collection_id,
     user_id,
     tire_count,
     generator_payment_preference
   );
   
   -- Pago al recolector
   select public.create_collector_payment(
     collection_id,
     collector_id,
     pickup_lat,
     pickup_lng,
     delivery_lat,
     delivery_lng
   );
   ```

4. **Procesar los pagos desde el panel de administración**:
   ```sql
   -- Procesar pago del recolector
   select public.process_collector_payment(
     payment_id,
     'bank_transfer',
     'REF-123',
     admin_id
   );
   
   -- Procesar pago del generador (si eligió efectivo)
   select public.process_generator_payment(
     payment_id,
     'cash',
     'REF-456',
     admin_id
   );
   ```

## Consultas Útiles

### Ver todos los pagos pendientes de recolectores

```sql
select 
  cp.*,
  up.name as collector_name,
  c.tire_count
from public.collector_payments cp
join public.user_profiles up on up.id = cp.collector_id
join public.collections c on c.id = cp.collection_id
where cp.status = 'pending'
order by cp.created_at desc;
```

### Ver todos los pagos pendientes de generadores (efectivo)

```sql
select 
  gp.*,
  up.name as generator_name,
  c.tire_count
from public.generator_payments gp
join public.user_profiles up on up.id = gp.generator_id
join public.collections c on c.id = gp.collection_id
where gp.status = 'pending'
  and gp.payment_preference = 'cash'
order by gp.created_at desc;
```

### Estadísticas de pagos por recolector

```sql
select 
  up.name,
  count(*) as total_payments,
  sum(cp.payment_amount) as total_amount,
  sum(cp.points_awarded) as total_points,
  avg(cp.distance_km) as avg_distance
from public.collector_payments cp
join public.user_profiles up on up.id = cp.collector_id
where cp.status = 'completed'
group by up.id, up.name
order by total_amount desc;
```

## Configuración Inicial Recomendada

Para ajustar los valores de pago, actualizar la tabla `payment_settings`:

```sql
update public.payment_settings
set
  payment_per_km = 3.00,              -- HNL por km
  min_payment_amount = 75.00,         -- Mínimo por recolección
  min_collector_points = 15,          -- Puntos mínimos por recolección
  points_per_tire = 150,              -- Puntos por llanta (modo puntos)
  cash_payment_per_tire = 7.50,      -- HNL por llanta (modo efectivo)
  min_generator_points_on_cash = 10,  -- Puntos mínimos en modo efectivo
  updated_at = now()
where id = 1;
```

## Notas Importantes

1. **La distancia se calcula automáticamente** usando la fórmula de Haversine (distancia ortodrómica sobre la superficie terrestre)

2. **Los recolectores siempre reciben puntos mínimos** independientemente de la distancia

3. **Los generadores que eligen efectivo también reciben puntos mínimos** como incentivo para seguir usando la plataforma

4. **Los puntos se actualizan automáticamente** cuando:
   - El generador elige pago en puntos (inmediatamente)
   - Se procesa el pago del recolector (cuando el admin lo completa)
   - Se procesa el pago en efectivo del generador (puntos mínimos)

5. **Todos los pagos quedan registrados** con su estado, método de pago y referencia para auditoría
