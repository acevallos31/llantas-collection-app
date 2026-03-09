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

## 7. Alcance actual del prototipo
La solucion actual ya permite operar un ciclo funcional de punta a punta con roles diferenciados, registro de entregas, comprobantes e indicadores base.

En una fase posterior puede evolucionar con:
- Tableros ejecutivos avanzados
- Automatizaciones de negocio
- Integraciones financieras y regulatorias

---
Ultima actualizacion: 2026-03-08
