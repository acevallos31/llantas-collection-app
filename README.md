
  # Llantas Collection App (EcolLantApp)

  Aplicación web para gestión de recolección de llantas, autenticación de usuarios, recompensas y estadísticas ambientales.

  ## Requisitos

  - Node.js 18+
  - npm
  - Proyecto de Supabase activo

  ## Instalación local

  1. Instala dependencias:

  ```bash
  npm install
  ```

  2. Inicia el proyecto:

  ```bash
  npm run dev
  ```

  ## Variables de entorno (frontend)

  Esta app usa variables `VITE_*` (variables personalizadas de Vite).

  ### Opcional (recomendada en Vercel)

  ```env
  VITE_API_BASE_URL=https://tqsjlywjyxgeixawlrcq.supabase.co/functions/v1/server
  ```

  Notas:
  - Debe ir sin comillas y sin slash final.
  - Si no existe, el frontend usa fallback automático al endpoint por defecto de Supabase Function.

  ## Backend (Supabase Edge Function)

  La API corre en la función `server`.

  URL base esperada por frontend:

  ```text
  https://<project-ref>.supabase.co/functions/v1/server
  ```

  ### Deploy de function

  ```bash
  npx supabase functions deploy server --use-api --no-verify-jwt
  ```

  > `--use-api` evita problemas de Docker local durante el bundling.

  ## Deploy en Vercel

  1. Conecta el repo a Vercel.
  2. Configura variable de entorno:
    - `VITE_API_BASE_URL`
  3. Haz redeploy del último commit en `main`.

  ## Troubleshooting rápido

  ### Error: "Failed to fetch"

  Verifica:
  - Que la función `server` esté desplegada.
  - Que `VITE_API_BASE_URL` apunte a `/functions/v1/server`.
  - Que no tenga comillas ni formato inválido.

  ### Error en Vercel: "The string did not match the expected pattern"

  Suele indicar URL inválida en runtime.
  Revisa `VITE_API_BASE_URL` en Vercel y redeploy.

  ## Documentación adicional

  - Configuración detallada de Supabase: `SUPABASE_SETUP.md`
  - Documentación funcional (roles, flujos y funcionalidades): `DOCUMENTACION_APLICACION.md`
  