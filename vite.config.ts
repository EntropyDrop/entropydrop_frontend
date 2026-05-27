import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id === '\0vite/preload-helper.js') {
            return 'vite-preload-helper';
          }
          if (id.includes('node_modules')) {
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router/') ||
              id.includes('/node_modules/react-router-dom/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('@react-three')) {
              return 'vendor-react-three';
            }
            if (id.includes('three')) {
              return 'vendor-three';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer-motion';
            }
            if (id.includes('@iconify-json')) {
              return 'icons-pixelart';
            }
            if (id.includes('@iconify')) {
              return 'vendor-icons';
            }
            if (id.includes('@react-oauth/google')) {
              return 'vendor-google-auth';
            }
          }
        }
      }
    }
  }
})
