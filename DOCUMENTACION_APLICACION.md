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
- **Interfaz tipo Amazon/eBay**
  - Grid de productos con imagen, nombre, precio y stock a simple vista
  - Búsqueda en tiempo real por nombre o numeración (ej: "205/55R16")
  - Filtros por tipo de llanta: Automóvil, Camión, Autobús, Motocicleta, Bicicleta
- **Modal/Vista detallada al hacer clic en producto**
  - Galería de imágenes
  - Especificaciones completas: marca, modelo, numeración, condición
  - Lote y stock disponible
  - Selector de cantidad (incrementar/decrementar)
  - Botón "Agregar al carrito" desde detalles
- **Carrito lateral deslizable** (estilo Amazon)
  - Thumbnails de productos con nombre y numeración
  - Controles de cantidad por item
  - Botón eliminar
  - Total dinámico
  - Panel de checkout integrado:
    - Selector método de entrega (recolector/centro acopio)
    - Selección de recolector o centro específico
    - Notas opcionales
    - Botón confirmar compra
- **Historial de compras** con estados y comprobantes
- **Acumulación de puntos** por transacciones

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
- **Catálogo masivo:** 58 productos iniciales con:
  - **Automóviles (20):** Rin 13-14 (155/70R13, 175/65R14, 185/60R14), Rin 15 (185/65R15, 195/55R15, 195/65R15, 205/65R15), Rin 16 (205/55R16, 215/60R16, 225/50R16, 195/55R16, 215/55R16), Rin 17-18 (225/45R17, 225/40R18, 235/55R17, 245/45R18, 225/45R18)
  - **Camiones (10):** 275/80R22.5, 295/80R22.5, 315/80R22.5, 385/65R22.5, 11R22.5, 12R22.5
  - **Autobuses (8):** 275/70R22.5, 295/75R22.5, 315/70R22.5, 385/65R22.5, 10.00R20, 11.00R20
  - **Motocicletas (12):** 90/90-17, 100/90-17, 110/90-17, 120/90-17, 130/90-15, 140/70-17, 150/70-18, 160/60-17, 170/60-18, 180/55-17
  - **Bicicletas (8):** 26x1.95, 26x2.1, 27.5x2.2, 27.5x2.4, 29x2.0, 29x2.1, 29x2.4, 20x1.75, 20x2.0, 24x1.95
  - **Reciclaje (1):** Caucho triturado para transformación

- **Imágenes realistas:** Cada tipo de llanta tiene fotos específicas desde Unsplash
  - Automóvil: Fotos de llantas para compactos y sedanes
  - Camión: Fotos de llantas industriales pesadas
  - Autobús: Fotos de llantas para transporte público
  - Motocicleta: Fotos de llantas deportivas/street
  - Bicicleta: Fotos de llantas mountain/road
  - Reciclaje: Fotos de material procesado

- **Variación realista:**
  - Condiciones: Excelente (30% precio base), Buena (precio base)
  - Marcas por tipo: Michelin, Continental, Bridgestone, Goodyear, Pirelli, Dunlop, Yokohama, Firestone
  - Modelos específicos: Primacy, Eco Contact, Turanza, Assurance, Dragon Sport, M840, UrbanMax, etc.
  - Precios dinámicos según condición y lote
  - Stock variado (1-20 unidades por producto)

- **Lotes inteligentes:**
  - Automóviles: Algunos lotes de 4 unidades
  - Camiones: Algunos lotes de 2 unidades
  - Resto: Venta unitaria o según marca

- **Separación de flujos:** reventa (buena/excelente) vs reciclaje (regular/desgastada)
- **Integración con inventario existente:** productos generados automáticamente desde centros de acopio
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
