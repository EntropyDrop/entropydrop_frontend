import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/space/app/',
  envDir: '../..',
  resolve: {
    // The linked engine has its own test dependencies; the browser uses one Three instance.
    dedupe: ['three'],
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL('../../../entropydrop_space_engine', import.meta.url)),
      ],
    },
  },
  build: {
    // Three's minified ESM core is about 600 kB by itself. Application chunks
    // remain below this vendor-aware ceiling and are split by change cadence.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Three.js changes independently from most application code. Keeping it
        // in a stable vendor chunk improves repeat-visit and deployment caching
        // while keeping the main application chunk within a reviewable budget.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/react-icons/')) return 'ui-icons';
          if (id.includes('/node_modules/react/')
            || id.includes('/node_modules/react-dom/')
            || id.includes('/node_modules/scheduler/')) return 'react';
          if (id.includes('/node_modules/@bufbuild/protobuf/')) return 'protobuf';
          if (id.includes('/node_modules/@msgpack/msgpack/')) return 'realtime-codec';
          if (id.includes('/node_modules/acorn/')) return 'script-runtime';
          if (id.endsWith('/bootstrap/NetworkSafety.ts')) return 'network-core';
          if (id.endsWith('/engine/contraption/AgentConfig.ts')) return 'agent-config';
          if (id.endsWith('/engine/contraption/AgentChat.ts')
            || id.endsWith('/engine/contraption/BehaviorAgent.ts')) return 'agent';
          if (id.endsWith('/engine/contraption/Blueprints.ts')) return 'blueprints';
          if (id.includes('/entropydrop_space_engine/src/scripting/')) return 'script-runtime';
          if (/\/entropydrop_space_engine\/src\/(physics|contraption|simulation|actions)\//.test(id)) return 'simulation';
          if (/\/entropydrop_space_engine\/src\/(voxel|torus|worldgen|mesher|render)\//.test(id)) return 'world-rendering';
          if (id.includes('/apps/space/src/engine/physics/')
            || id.includes('/apps/space/src/engine/contraption/')
            || id.includes('/apps/space/src/engine/simulation/')
            || id.includes('/apps/space/src/engine/actions/')) return 'simulation';
          if (id.includes('/apps/space/src/engine/voxel/')
            || id.includes('/apps/space/src/engine/torus/')
            || id.includes('/apps/space/src/engine/worldgen/')
            || id.includes('/apps/space/src/engine/mesher/')) return 'world-rendering';
          if (id.includes('/apps/space/src/engine/render/')
            || id.includes('/apps/space/src/engine/audio/')) return 'world-rendering';
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
