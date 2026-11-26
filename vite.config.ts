import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devTutorialLevel } from '../entropydrop_space/client/tools/dev-tutorial-level.mjs'

const spaceClientRoot = fileURLToPath(new URL('../entropydrop_space/client', import.meta.url))
const spaceIndexPath = fileURLToPath(new URL('../entropydrop_space/client/index.html', import.meta.url))

function validateAnalyticsBuild(): Plugin {
  return {
    name: 'entropydrop-validate-analytics-build',
    apply: 'build',
    configResolved({ env }) {
      const scriptValue = env.VITE_UMAMI_SCRIPT_URL ?? ''
      const scriptUrl = URL.canParse(scriptValue) ? new URL(scriptValue) : null

      if (env.VITE_UMAMI_WEBSITE_ID && scriptValue) {
        const hostname = scriptUrl?.hostname.replace(/\.$/, '') ?? ''
        const isLoopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
          hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)

        if (scriptUrl?.protocol !== 'https:' || isLoopback) {
          throw new Error('VITE_UMAMI_SCRIPT_URL must be a non-loopback HTTPS URL for a build. Use npm run dev for a local tracker.')
        }
      }

      const apiUrl = env.VITE_API_BASE_URL ?? ''
      const isMainSiteRelease = URL.canParse(apiUrl) && new URL(apiUrl).origin === 'https://api.entropydrop.com'
      if (isMainSiteRelease && (
        !process.env.VITE_UMAMI_WEBSITE_ID?.trim() ||
        !process.env.VITE_UMAMI_SCRIPT_URL?.trim() ||
        scriptUrl?.origin !== 'https://analytics.entropydrop.com'
      )) {
        throw new Error('Use tools/deploy_aws.py to build the main site with UMAMI_WEBSITE_ID and an https://analytics.entropydrop.com script URL from the backend .env.prod.')
      }
    },
  }
}

/**
 * Mount the framework-independent Space document inside the main Vite server.
 * Production remains a separate build copied to dist/space/app, while development
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

        if (url.pathname === '/space/app') {
          response.statusCode = 307
          response.setHeader('Location', `/space/app/${url.search}`)
          response.end()
          return
        }

        if (url.pathname !== '/space/app/' && url.pathname !== '/space/app/index.html') {
          next()
          return
        }

        try {
          const source = await readFile(spaceIndexPath, 'utf8')
          // Resolve Space's entry assets against its source tree, not the main site's.
          const mountedSource = source.replace(
            /(<(?:script|link)\b[^>]*?\s(?:src|href)=["'])\/src\//g,
            `$1/@fs/${spaceClientRoot}/src/`,
          )
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
    validateAnalyticsBuild(),
    spaceDevMount(),
    devTutorialLevel({ root: spaceClientRoot }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ['three'],
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL('../entropydrop_space', import.meta.url)),
      ],
    },
  },
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
