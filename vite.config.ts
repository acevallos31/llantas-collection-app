import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
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
  server: {
    // Solo usar HTTPS en desarrollo local si los certificados existen
    ...(fs.existsSync('localhost-key.pem') && fs.existsSync('localhost-cert.pem')
      ? {
          https: {
            key: fs.readFileSync('localhost-key.pem'),
            cert: fs.readFileSync('localhost-cert.pem'),
          },
        }
      : {}),
    host: 'localhost',
    port: 5173,
    strictPort: true,
    ...(fs.existsSync('localhost-key.pem') && fs.existsSync('localhost-cert.pem')
      ? {
          hmr: {
            protocol: 'wss',
            host: 'localhost',
            clientPort: 5173,
          },
        }
      : {}),
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
