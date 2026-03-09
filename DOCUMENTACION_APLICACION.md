# Documentacion Funcional - Llantas Collection App (EcolLantApp)

## 1. Objetivo de la aplicacion
EcolLantApp es una plataforma para gestionar la recoleccion y trazabilidad de llantas usadas.
Conecta a tres tipos de usuarios:
- Generadores (quienes solicitan la recoleccion)
- Recolectores (quienes toman rutas y entregan en centros de acopio)
- Administradores (quienes supervisan usuarios, centros, pagos, puntos e inventario)

La plataforma prioriza:
- Gestion operativa de recolecciones
- Trazabilidad por eventos y QR
- Incentivos por puntos y recompensas
- Control de centros de acopio e inventario

## 2. Arquitectura general
- Frontend: React + TypeScript + Vite
- Backend: Supabase Edge Function (`supabase/functions/server/index.ts`)
- Persistencia principal: Deno KV (usuarios, recolecciones, eventos, centros, inventario)
- Integraciones SQL (opcionales/en evolucion): tablas y funciones de pagos en `payment_system.sql`

## 3. Roles de usuario

### 3.1 Generador
Puede:
- Registrarse e iniciar sesion
- Crear solicitudes de recoleccion de llantas
- Ver historial y trazabilidad de sus solicitudes
- Acumular puntos segun reglas del sistema
- Canjear recompensas

No puede:
- Asignarse recolecciones como recolector
- Administrar centros o usuarios

### 3.2 Recolector
Puede:
- Ver recolecciones disponibles
- Tomar rutas sugeridas o tomar recolecciones individuales
- Cambiar estado de sus recolecciones (pendiente, en proceso)
- Completar entrega con boton `Entrega completada`
- Registrar entrega en centro de acopio de forma automatica (centro mas cercano con capacidad)
- Generar comprobante individual por cada entrega
- Ganar puntos por recolecciones completadas

No puede:
- Modificar recolecciones de otros recolectores
- Administrar usuarios o centros globalmente

### 3.3 Administrador
Puede:
- Gestionar usuarios (roles y datos)
- Crear/editar/eliminar centros de acopio
- Ver y registrar inventario por centro
- Supervisar analitica, pagos, recompensas y estados
- Consultar trazabilidad y certificaciones

## 4. Flujo principal de recoleccion

### 4.1 Solicitud de recoleccion (Generador)
1. El generador crea una solicitud con tipo/cantidad de llantas y direccion.
2. La solicitud entra en estado disponible para que un recolector la tome.

### 4.2 Toma de ruta (Recolector)
1. El recolector ve sugerencias de ruta y/o lista de disponibles.
2. Toma una o varias recolecciones.
3. La solicitud pasa a estado `pending` (asignada) y luego `in-progress` al iniciar ruta.

### 4.3 Entrega en centro de acopio (Recolector)
Con el boton `Entrega completada`, el sistema:
1. Busca centros disponibles.
2. Filtra solo centros que:
   - tengan capacidad disponible suficiente
   - acepten el tipo de llanta
3. Selecciona el centro mas cercano a la recoleccion.
4. Registra la llegada en inventario del centro (`/points/:pointId/arrivals`).
5. Aumenta `currentLoad` del centro automaticamente.
6. Marca la recoleccion como completada.
7. Genera PDF de comprobante individual para esa recoleccion.

## 5. Reglas de centros de acopio e inventario
- Cada centro tiene `capacity` y `currentLoad`.
- Se calcula `availableCapacity = capacity - currentLoad`.
- Una llegada solo se registra si `availableCapacity >= tireCount`.
- Si el centro no acepta el tipo de llanta, la llegada se bloquea.
- Cada registro de llegada crea un item de inventario independiente.

## 6. Comprobante individual de entrega
Cada entrega genera un comprobante PDF independiente por recoleccion.
El comprobante incluye, entre otros datos:
- Folio
- Fecha/hora de entrega
- Identificador de recoleccion
- Recolector
- Centro de acopio
- Cantidad y tipo de llantas
- Referencia de inventario

Esto permite que en una sola visita al centro, un recolector entregue varias recolecciones y cada una conserve su comprobante individual.

## 7. Puntos, recompensas y pagos

### 7.1 Puntos
- El generador acumula puntos por recolecciones segun reglas del sistema.
- El recolector acumula puntos bonus al completar recolecciones.
- Los puntos se reflejan en perfil y estadisticas.

### 7.2 Recompensas
- Los usuarios pueden canjear recompensas segun puntos disponibles.
- El sistema valida disponibilidad y saldo de puntos.

### 7.3 Pagos (modelo SQL)
El archivo `payment_system.sql` define:
- `payment_settings`
- `collector_payments`
- `generator_payments`
- Funciones de calculo por distancia y llantas

Estas funciones permiten evolucionar a un modelo de pagos mas formal y auditable en Postgres/Supabase SQL.

## 8. Estados operativos de recoleccion
Estados observados en el flujo actual:
- `available`: disponible para tomar
- `pending`: asignada al recolector
- `in-progress`: ruta iniciada por recolector
- `arrived`: llegada registrada en centro (estado intermedio operativo)
- `completed`: ciclo completado
- `cancelled`: cancelada

## 9. Seguridad y autorizacion
- Todas las acciones sensibles validan token de usuario.
- Las rutas del backend verifican rol antes de ejecutar acciones criticas.
- El recolector solo puede operar recolecciones asignadas a su usuario.
- El admin concentra operaciones de gestion global.

## 10. Componentes clave del proyecto
- Panel recolector: `src/app/pages/CollectorDashboardPage.tsx`
- Historial y comprobantes: `src/app/pages/HistoryPage.tsx`
- Gestion de centros/inventario: `src/app/pages/AdminPointsPage.tsx`
- API frontend: `src/app/services/api.ts`
- Backend Edge Function: `supabase/functions/server/index.ts`

## 11. Operacion y despliegue
- Frontend local (Windows PowerShell):
  - `npm.cmd install`
  - `npm.cmd run dev`
- Deploy backend:
  - `npx.cmd supabase functions deploy server --project-ref tqsjlywjyxgeixawlrcq --no-verify-jwt`

## 12. Checklist rapido de validacion funcional

### Recolector
1. Tomar una recoleccion disponible.
2. Iniciar ruta (estado `in-progress`).
3. Presionar `Entrega completada`.
4. Verificar que:
   - se descargue comprobante PDF individual
   - la recoleccion salga de activas
   - aparezca en historial como completada

### Admin / Centro
1. Abrir centro de acopio usado por la entrega.
2. Validar aumento de `currentLoad`.
3. Confirmar nuevo registro de inventario asociado a la recoleccion.

### Puntos
1. Confirmar incremento de puntos en el perfil del recolector.
2. Confirmar estadisticas actualizadas del usuario.

---
Ultima actualizacion: 2026-03-08
