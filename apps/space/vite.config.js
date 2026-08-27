import { defineConfig } from 'vite';

export default defineConfig({
  base: '/space/',
  envDir: '../..',
  build: {
    rollupOptions: {
      output: {
        // Three.js changes independently from most application code. Keeping it
        // in a stable vendor chunk improves repeat-visit and deployment caching
        // while keeping the main application chunk within a reviewable budget.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.endsWith('/engine/contraption/AgentChat.ts')
            || id.endsWith('/engine/contraption/BehaviorAgent.ts')) return 'agent';
          if (id.endsWith('/engine/contraption/Blueprints.ts')) return 'blueprints';
        }
      }
    }
  },
  optimizeDeps: {
    // The QuickJS variant resolves its WASM relative to its own module. Vite's
    // dependency pre-bundler can strand that URL inside .vite/deps in workers.
    exclude: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync']
  },
  worker: {
    format: 'es'
  }
});
