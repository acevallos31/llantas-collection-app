# Documento Ejecutivo Para Cliente - EcolLantApp

## 1. Resumen de la solucion
EcolLantApp es un prototipo que organiza todo el ciclo de recoleccion de llantas usadas, desde la solicitud hasta la entrega final en centro de acopio, con trazabilidad y control operativo.

El objetivo principal es:
- Facilitar la operacion diaria de recoleccion
- Dar visibilidad en tiempo real del estado de cada solicitud
- Medir desempeno operativo y ambiental
- Incentivar la participacion mediante puntos y recompensas

## 2. Logica general del proceso
La operacion se basa en un flujo simple y controlado:

1. Un generador registra una solicitud de recoleccion.
2. Un recolector toma esa solicitud y la incorpora a su ruta.
3. El recolector ejecuta la recoleccion y marca su avance.
4. Al confirmar la entrega, el sistema asigna el centro de acopio mas conveniente segun disponibilidad.
5. Se registra la entrada en el centro, se actualiza la carga del centro y se emite comprobante individual.
6. La solicitud queda cerrada y trazable en historial.

## 3. Roles de usuario y funciones

### 3.1 Generador
Responsabilidad: solicitar recolecciones y dar seguimiento.

Funciones principales:
- Crear solicitudes de recoleccion
- Consultar historial de solicitudes
- Ver estado y trazabilidad de cada caso
- Acumular puntos por participacion
- Canjear recompensas disponibles

### 3.2 Recolector
Responsabilidad: ejecutar la recoleccion y entrega en centro de acopio.

Funciones principales:
- Ver oportunidades de recoleccion
- Tomar recolecciones y organizar ruta
- Actualizar avance de trabajo
- Confirmar entrega mediante boton `Entrega completada`
- Obtener comprobante individual por cada recoleccion entregada
- Acumular puntos por cumplimiento operativo

### 3.3 Administrador
Responsabilidad: control y supervision integral de la operacion.

Funciones principales:
- Gestionar usuarios y permisos
- Administrar centros de acopio
- Monitorear inventario recibido por centro
- Supervisar indicadores operativos
- Dar seguimiento a trazabilidad y cumplimiento

## 4. Funcionalidades clave del prototipo

### 4.1 Asignacion inteligente de centro de acopio
Cuando el recolector confirma una entrega, el sistema prioriza centros aptos y selecciona el mas conveniente para la operacion, evitando saturaciones y mejorando tiempos.

### 4.2 Control de capacidad en centros
Cada entrega incrementa automaticamente la carga del centro correspondiente. Esto mantiene un control actualizado de disponibilidad y permite una gestion mas ordenada.

### 4.3 Comprobante individual por entrega
Cada recoleccion genera su propio comprobante. Esto garantiza respaldo documental por unidad operativa, incluso cuando un recolector realiza varias entregas en una misma visita.

### 4.4 Trazabilidad del ciclo completo
Cada solicitud conserva su historial de estados. Esto permite saber que paso, cuando paso y quien lo ejecuto.

### 4.5 Incentivos por puntos
El prototipo integra un esquema de puntos para promover continuidad de uso y cumplimiento de procesos.

## 5. Metricas que estamos analizando en el prototipo

## 5.1 Metricas operativas
- Total de solicitudes registradas
- Solicitudes completadas vs pendientes
- Tiempo de atencion por solicitud
- Productividad por recolector (solicitudes y llantas gestionadas)
- Distribucion de carga por centro de acopio

## 5.2 Metricas de servicio
- Nivel de cumplimiento de entregas
- Casos reprogramados o cancelados
- Eficiencia del flujo de entrega

## 5.3 Metricas ambientales
- Total de llantas recuperadas
- Estimacion de impacto ambiental positivo (segun reglas del prototipo)

## 5.4 Metricas de engagement
- Puntos acumulados por perfil
- Uso del modulo de recompensas
- Frecuencia de participacion por tipo de usuario

## 6. Valor para el cliente
Este prototipo permite validar rapidamente una operacion digital de recoleccion con trazabilidad y control, reduciendo gestion manual y mejorando visibilidad para toma de decisiones.

Beneficios directos:
- Mayor orden operativo
- Evidencia documental por entrega
- Mejor control de centros de acopio
- Base de indicadores para escalar el modelo

## 7. Marketplace integrado de llantas usadas
**Fase 2 completada:** Se agregó un marketplace digital completo de compra/venta de llantas usadas con:

### 7.1 Cliente (comprador)
- Catálogo visual con fotos, especificaciones técnicas y lotes
- Carrito de compra multi-item
- Elección de método de entrega: recolector a domicilio o recogida en centro
- Historial de compras y seguimiento de estado
- Acumulación de puntos por transacciones

### 7.2 Recolector (distribuidor)
- Panel exclusivo de entregas marketplace disponibles
- Estados de progreso: disponible → pendiente → en ruta → recogido → entregado
- Comprobantes automáticos en PDF (retiro en centro y entrega al cliente)
- Incremento de ingresos por gestión logística

### 7.3 Administrador (supervisor)
- CRUD completo de productos marketplace
- Gestión de inventario y precios
- Monitoreo de órdenes con control de estados
- Métricas de ventas por producto y por centro de acopio

### 7.4 Características técnicas
- **Catálogo realista:** llantas automovilísticas, camión, autobús, motocicleta, bicicleta
- **Separación de flujos:** reventa (buena/excelente) vs reciclaje (regular/desgastada)
- **Integración con inventario existente:** productos generados automáticamente desde centros de acopio
- **Lotes:** empaque de múltiples llantas (ej. 4 automóvil, 2 camión, 8 motocicleta)
- **Fotos y especificaciones:** numeraciones técnicas y URLs de imágenes para cada producto
- **Estados avanzados:** available, pending, in-progress, picked-up, confirmed, delivered

## 8. Alcance actual del prototipo
La solución actual opera integralmente:
1. Ciclo de recolección punta a punta con trazabilidad completa
2. Marketplace de productos con carrito y entregas logísticas
3. Roles diferenciados (generador, recolector, cliente, administrador)
4. Comprobantes digitales automáticos por entrega
5. Base de indicadores para análisis operativo y ambiental

En una fase posterior puede evolucionar con:
- Tableros ejecutivos avanzados con KPIs profundos
- Automatizaciones de negocio y flujos financieros
- Integraciones regulatorias y reportes ambientales
- Expansión a ciudades adicionales
- APIs públicas para integraciones de terceros

---
Última actualización: 2026-03-08
Fase 1 (recolección): Completada ✓
Fase 2 (marketplace avanzado): Completada ✓
