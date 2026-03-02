# 🚀 EcolLantApp - Configuración de Supabase

## ✅ Estado Actual

El backend de EcolLantApp ha sido implementado exitosamente con:

- ✅ **Autenticación** - Registro, login, sesiones con Supabase Auth
- ✅ **KV Store** - Almacenamiento de datos en tabla clave-valor
- ✅ **API REST** - Edge Functions con Hono
- ✅ **Storage** - Almacenamiento de fotos de llantas
- ✅ **CORS habilitado** - Frontend puede comunicarse con el backend
- ✅ **Capa gratuita** - Todo optimizado para el tier gratuito de Supabase

## 🗂️ Estructura de Datos en KV Store

```
user:{userId}                 → Perfil del usuario
stats:{userId}                → Estadísticas del usuario
collection:{userId}:{collectionId} → Recolecciones
point:{pointId}               → Puntos de recolección
reward:{rewardId}             → Recompensas disponibles
redemption:{userId}:{redemptionId} → Canjes de recompensas
```

## 📋 Endpoints Disponibles

### Autenticación
- `POST /auth/signup` - Registrar nuevo usuario
- `POST /auth/signin` - Iniciar sesión
- `GET /auth/session` - Obtener sesión actual
- `POST /auth/signout` - Cerrar sesión

### Usuarios
- `GET /users/:userId` - Obtener perfil
- `PUT /users/:userId` - Actualizar perfil

### Recolecciones
- `GET /collections` - Listar recolecciones del usuario
- `GET /collections/:id` - Obtener una recolección
- `POST /collections` - Crear recolección (30 puntos por llanta)
- `PUT /collections/:id` - Actualizar recolección

### Puntos de Recolección
- `GET /points` - Listar todos los puntos
- `POST /points/seed` - Inicializar datos de puntos

### Recompensas
- `GET /rewards` - Listar recompensas
- `POST /rewards/seed` - Inicializar recompensas
- `POST /rewards/:id/redeem` - Canjear recompensa

### Estadísticas
- `GET /stats/:userId` - Obtener estadísticas del usuario

### Storage
- `POST /upload` - Subir foto (límite 5MB)

## 🎮 Cómo Usar

### 1. Registro de Usuario
```javascript
// El sistema crea automáticamente:
// - Usuario en Supabase Auth
// - Perfil en KV Store
// - Estadísticas iniciales
// - Email confirmado automáticamente
```

### 2. Crear Recolección
```javascript
// El usuario crea una recolección pendiente
// Al completarla:
// - Se suman 30 puntos por llanta
// - Se actualizan estadísticas
// - Se calcula CO₂ ahorrado
// - Se actualiza el nivel del usuario
```

### 3. Sistema de Niveles
```
0-49 puntos: Eco Novato
50-199 puntos: Eco Guardian
200-499 puntos: Eco Warrior
500-999 puntos: Eco Champion
1000+ puntos: Eco Master
```

### 4. Cálculos Ambientales
- **CO₂ ahorrado**: 3.25 kg por llanta
- **Peso reciclado**: 5 kg por llanta
- **Árboles equivalentes**: CO₂ / 20

## 🔒 Seguridad

- ✅ Rutas protegidas requieren autenticación
- ✅ Usuarios solo pueden ver/editar sus propios datos
- ✅ SUPABASE_SERVICE_ROLE_KEY nunca se expone al frontend
- ✅ Tokens de acceso en localStorage
- ✅ Validación de permisos en cada endpoint

## 💾 Capa Gratuita de Supabase

**Límites respetados:**
- Storage: Límite de 5MB por archivo
- Auth: Sin límite de usuarios
- Database: KV Store flexible y eficiente
- Edge Functions: Sin límites estrictos en tier gratuito

## 🎯 Próximos Pasos

### Opcionales para producción:
1. **Configurar servidor de email** en Supabase Dashboard
2. **Agregar validación de email** (actualmente auto-confirmado)
3. **Implementar recuperación de contraseña**
4. **Agregar OAuth** (Google, Facebook, etc.)
5. **Optimizar queries** con índices
6. **Implementar paginación** para grandes listas
7. **Agregar caché** en el frontend

### Para desarrollo:
1. ✅ Backend completamente funcional
2. ✅ Frontend conectado con API
3. ✅ Autenticación implementada
4. ✅ Datos se inicializan automáticamente (puntos y recompensas)
5. 🚧 Completar integración en otras páginas (Profile, History, Rewards, NewCollection)

## 📱 Páginas del Frontend

### Completadas:
- ✅ LoginPage - Conectado con Supabase Auth
- ✅ HomePage - Carga datos reales (puntos, colecciones, estadísticas)

### Pendientes:
- 🚧 ProfilePage - Actualizar para usar datos reales y permitir edición
- 🚧 HistoryPage - Cargar historial desde API
- 🚧 RewardsPage - Cargar recompensas y permitir canje
- 🚧 NewCollectionPage - Crear recolecciones con fotos
- 🚧 SettingsPage - Editar perfil y cerrar sesión

## 🐛 Debugging

Los logs del servidor se pueden ver en:
- Supabase Dashboard → Edge Functions → Logs
- Console del navegador para errores del frontend

Todos los errores incluyen mensajes descriptivos para facilitar el debugging.

## 📞 Soporte

El backend está optimizado para la capa gratuita y puede manejar:
- Miles de usuarios
- Cientos de recolecciones por usuario
- Almacenamiento de fotos optimizado
- Sin cargos adicionales
