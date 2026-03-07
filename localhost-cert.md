# Certificados HTTPS para Vite local

1. Genera certificados autofirmados:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout localhost-key.pem -out localhost-cert.pem -days 365 -subj "/CN=localhost"
```

2. Coloca los archivos `localhost-key.pem` y `localhost-cert.pem` en la raíz del proyecto.

3. Modifica `vite.config.ts` para activar HTTPS:

```ts
import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync('localhost-key.pem'),
      cert: fs.readFileSync('localhost-cert.pem'),
    },
    host: 'localhost',
    port: 5173,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-tabs', '@radix-ui/react-select'],
          maps: ['leaflet'],
          charts: ['recharts'],
        },
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
});
```

4. Reinicia el servidor Vite. Accede a https://localhost:5173

Acepta el certificado en el navegador si es necesario.