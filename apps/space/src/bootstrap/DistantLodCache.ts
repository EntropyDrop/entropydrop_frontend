import cacheUrl from '../assets/distant-lod-v1-seed-20260827.bin?url';
import {
  parseDistantLodCache,
  type DistantLodCacheData,
} from '../engine/render/DistantLodCacheFormat.ts';

const BUNDLED_CACHE_SEED = 20260827;
const BUNDLED_TERRAIN_GENERATOR_VERSION = 1;
let bundledCachePromise: Promise<DistantLodCacheData | null> | null = null;

async function fetchBundledCache() {
  const response = await fetch(cacheUrl, {
    cache: 'force-cache',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(`distant LOD cache returned ${response.status}`);
  return parseDistantLodCache(await response.arrayBuffer());
}

/**
 * Load the immutable, content-hashed base-world LOD shared by every entrant.
 * A mismatched seed/generator or any validation failure safely falls back to
 * deterministic local generation; cache data is never treated as authority.
 */
export async function loadDistantLodCache(
  seed: number,
  terrainGeneratorVersion: number
): Promise<DistantLodCacheData | null> {
  if (seed !== BUNDLED_CACHE_SEED || terrainGeneratorVersion !== BUNDLED_TERRAIN_GENERATOR_VERSION) {
    return null;
  }

  if (!bundledCachePromise) {
    bundledCachePromise = fetchBundledCache().catch(error => {
      console.warn('Distant LOD cache unavailable; generating locally.', error);
      return null;
    });
  }

  const cache = await bundledCachePromise;
  if (
    cache?.seed !== seed
    || cache.terrainGeneratorVersion !== terrainGeneratorVersion
  ) {
    return null;
  }
  return cache;
}

