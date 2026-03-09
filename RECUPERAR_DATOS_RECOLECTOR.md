# Script de Diagnóstico - Panel Recolector

Este script te ayudará a recuperar tus datos del recolector.

## Paso 1: Verificar ID del Usuario Actual

1. Abre la consola del navegador (F12 → Console)
2. Ejecuta este comando:

```javascript
console.log('User ID actual:', JSON.parse(localStorage.getItem('ecolant_user') || '{}').id);
console.log('User email:', JSON.parse(localStorage.getItem('ecolant_user') || '{}').email);
console.log('User name:', JSON.parse(localStorage.getItem('ecolant_user') || '{}').name);
```

Anota el **ID** que te muestre.

## Paso 2: Ver Todas tus Recolecciones

```javascript
fetch('https://tqsjlywjyxgeixawlrcq.supabase.co/functions/v1/server/collections', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('ecolant_access_token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  const myUserId = JSON.parse(localStorage.getItem('ecolant_user')).id;
  console.log('=== MIS RECOLECCIONES ===');
  console.log('Total en sistema:', data.length);
  
  const mine = data.filter(c => c.collectorId === myUserId);
  console.log('Asignadas a mí:', mine.length);
  console.log('Completadas por mí:', mine.filter(c => c.status === 'completed').length);
  
  console.log('\nDetalle de mis recolecciones:', mine);
  
  // Buscar recolecciones huérfanas (sin collectorId pero que deberían ser tuyas)
  const orphans = data.filter(c => !c.collectorId && c.status !== 'available');
  if (orphans.length > 0) {
    console.log('\n⚠️ RECOLECCIONES HUÉRFANAS (sin collectorId):', orphans.length);
    console.log(orphans);
  }
});
```

## Paso 3: Ver tus Estadísticas

```javascript
const myUserId = JSON.parse(localStorage.getItem('ecolant_user')).id;
fetch(`https://tqsjlywjyxgeixawlrcq.supabase.co/functions/v1/server/stats/${myUserId}`, {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('ecolant_access_token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(stats => {
  console.log('=== MIS ESTADÍSTICAS ===');
  console.log(stats);
});
```

## ¿Qué Significan los Resultados?

### Si ves "Asignadas a mí: 0"
- Tus recolecciones anteriores están guardadas con un ID diferente
- Perdiste el historial al limpiar la sesión

### Si ves "RECOLECCIONES HUÉRFANAS"
- Hay recolecciones sin dueño que deberían ser tuyas
- Necesitas reasignarlas manualmente

### Si tus stats muestran todo en 0
- Es normal si no tienes recolecciones completadas con tu ID actual
- Los stats del recolector se calculan desde las recolecciones en tiempo real

## Solución

Copia los resultados de los comandos anteriores y compártelos conmigo para ayudarte a recuperar tus datos.
