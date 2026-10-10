import Module from 'manifold-3d';

let runtime: Promise<Awaited<ReturnType<typeof Module>>> | null = null;

/** Share a single WASM runtime, including concurrent model requests. */
export function getManifold(): Promise<Awaited<ReturnType<typeof Module>>> {
  if (!runtime) {
    runtime = (async () => {
      let options: Parameters<typeof Module>[0];
      if (typeof window !== 'undefined') {
        const wasm = await import('manifold-3d/manifold.wasm?url');
        options = { locateFile: () => wasm.default };
      }
      const module = await Module(options);
      module.setup();
      return module;
    })().catch(error => {
      runtime = null;
      throw error;
    });
  }
  return runtime;
}
