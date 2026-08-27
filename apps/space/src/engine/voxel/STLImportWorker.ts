/// <reference lib="webworker" />
import { parseSTLData, planSTLSize, voxelizeSTL } from './STLVoxelizer.ts';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', event => {
  const { buffer, sizeBlocks, precision, color } = event.data || {};
  try {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Missing STL file data');
    const triangles = parseSTLData(buffer);
    const plan = planSTLSize(triangles, sizeBlocks, precision);
    const result = voxelizeSTL(triangles, plan.cellSize, color, {
      micro: plan.micro,
      scale: plan.scale
    });
    workerScope.postMessage({ ok: true, result, plan });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
