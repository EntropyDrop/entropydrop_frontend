import Module from 'manifold-3d';

let runtime: Promise<any> | null = null;

/** Share a single WASM runtime, including concurrent model requests. */
export function getManifold(): Promise<any> {
  if (!runtime) {
    runtime = (async () => {
      const options: any = {};
      if (typeof window !== 'undefined') {
        const wasm = await import('manifold-3d/manifold.wasm?url');
        options.locateFile = (path: string) => path.endsWith('.wasm') ? wasm.default : path;
      }
      const module = await (Module as any)(options);
      module.setup();
      return module;
    })().catch(error => {
      runtime = null;
      throw error;
    });
  }
  return runtime;
}
