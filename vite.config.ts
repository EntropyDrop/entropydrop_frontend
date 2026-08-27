import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const spaceIndexPath = fileURLToPath(new URL('./apps/space/index.html', import.meta.url))

/**
 * Mount the framework-independent Space document inside the main Vite server.
 * Production remains a separate build copied to dist/space, while development
 * uses one process and one browser origin for both applications.
 */
function spaceDevMount(): Plugin {
  return {
    name: 'entropydrop-space-dev-mount',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = request.url || '/'
        const url = new URL(requestUrl, 'http://vite.local')

        if (url.pathname === '/space') {
          response.statusCode = 307
          response.setHeader('Location', `/space/${url.search}`)
          response.end()
          return
        }

        if (url.pathname !== '/space/' && url.pathname !== '/space/index.html') {
          next()
          return
        }

        try {
          const source = await readFile(spaceIndexPath, 'utf8')
          const mountedSource = source
            .replace('href="/src/style.css"', 'href="/apps/space/src/style.css"')
            .replace('src="/src/main.ts"', 'src="/apps/space/src/main.ts"')
          const html = await server.transformIndexHtml(requestUrl, mountedSource)
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(html)
        } catch (error) {
          next(error as Error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    spaceDevMount(),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Space loads this WASM variant from a worker. Pre-bundling can strand the
    // module-relative WASM URL inside Vite's dependency cache.
    exclude: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  },
  worker: {
    format: 'es',
  },
  build: {
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
