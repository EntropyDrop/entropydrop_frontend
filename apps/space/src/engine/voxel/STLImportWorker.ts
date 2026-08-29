/// <reference lib="webworker" />
import { parse3DModelData, planModelSize, voxelizeModel } from './ModelVoxelizer.ts';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', async event => {
  const { buffer, filename, sizeBlocks, precision, color, hollow } = event.data || {};
  try {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Missing 3D model file data');
    const triangles = await parse3DModelData(buffer, filename);
    const plan = planModelSize(triangles, sizeBlocks, precision);
    const result = voxelizeModel(triangles, plan.cellSize, color, {
      micro: plan.micro,
      scale: plan.scale,
      hollow: hollow !== false
    });
    workerScope.postMessage({ ok: true, result, plan });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
