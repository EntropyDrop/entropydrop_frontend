import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  DISTANT_LOD_HEADER_BYTES,
  DISTANT_LOD_SEGMENTS_X,
  DISTANT_LOD_SEGMENTS_Z,
  DISTANT_LOD_TEXTURE_BYTES,
  DISTANT_LOD_TEXTURE_HEIGHT,
  DISTANT_LOD_TEXTURE_WIDTH,
  parseDistantLodCache,
} from '../src/engine/render/DistantLodCacheFormat.ts';
import { bakeDistantTerrainTexture } from '../src/engine/render/DistantTerrainMaterial.ts';
import { TerrainGenerator } from '../src/engine/worldgen/TerrainGenerator.ts';
import { World } from '../src/engine/voxel/World.ts';
import { TORUS_SIZE_X, TORUS_SIZE_Z } from '../src/engine/torus/TorusWorld.ts';

const cacheFile = readFileSync(new URL('../src/assets/distant-lod-v1-seed-20260827.bin', import.meta.url));
const cacheBuffer = cacheFile.buffer.slice(
  cacheFile.byteOffset,
  cacheFile.byteOffset + cacheFile.byteLength
) as ArrayBuffer;

function cachedHeightAt(heights: Uint8Array, wx: number, wz: number) {
  const fx = (wx / TORUS_SIZE_X) * DISTANT_LOD_SEGMENTS_X;
  const fz = (wz / TORUS_SIZE_Z) * DISTANT_LOD_SEGMENTS_Z;
  const floorX = Math.floor(fx);
  const floorZ = Math.floor(fz);
  const x0 = floorX % DISTANT_LOD_SEGMENTS_X;
  const z0 = floorZ % DISTANT_LOD_SEGMENTS_Z;
  const x1 = (x0 + 1) % DISTANT_LOD_SEGMENTS_X;
  const z1 = (z0 + 1) % DISTANT_LOD_SEGMENTS_Z;
  const tx = fx - floorX;
  const tz = fz - floorZ;
  const h00 = heights[x0 * DISTANT_LOD_SEGMENTS_Z + z0];
  const h10 = heights[x1 * DISTANT_LOD_SEGMENTS_Z + z0];
  const h01 = heights[x0 * DISTANT_LOD_SEGMENTS_Z + z1];
  const h11 = heights[x1 * DISTANT_LOD_SEGMENTS_Z + z1];
  return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
}

test('shared distant LOD cache is bounded, versioned and exactly 1 MiB of RGBA texture', () => {
  const cache = parseDistantLodCache(cacheBuffer);
  assert.equal(cache.schemaVersion, 1);
  assert.equal(cache.seed, 20260827);
  assert.equal(cache.terrainGeneratorVersion, 1);
  assert.equal(cache.textureWidth, 1024);
  assert.equal(cache.textureHeight, 256);
  assert.equal(cache.textureRgba.byteLength, 1024 * 256 * 4);
  assert.equal(cache.textureRgba.byteLength, DISTANT_LOD_TEXTURE_BYTES);
  assert.equal(
    cacheFile.byteLength,
    DISTANT_LOD_HEADER_BYTES + DISTANT_LOD_SEGMENTS_X * DISTANT_LOD_SEGMENTS_Z + DISTANT_LOD_TEXTURE_BYTES
  );
});

test('shared distant LOD cache matches the runtime terrain generator and albedo bake', () => {
  const cache = parseDistantLodCache(cacheBuffer);
  const terrain = new TerrainGenerator(cache.seed);
  for (let ix = 0; ix < DISTANT_LOD_SEGMENTS_X; ix++) {
    const x = (ix / DISTANT_LOD_SEGMENTS_X) * TORUS_SIZE_X;
    for (let iz = 0; iz < DISTANT_LOD_SEGMENTS_Z; iz++) {
      const z = (iz / DISTANT_LOD_SEGMENTS_Z) * TORUS_SIZE_Z;
      assert.equal(cache.heights[ix * DISTANT_LOD_SEGMENTS_Z + iz], terrain.sampleHeight(x, z));
    }
  }

  const baked = bakeDistantTerrainTexture(
    (x, z) => cachedHeightAt(cache.heights, x, z),
    TORUS_SIZE_X,
    TORUS_SIZE_Z,
    DISTANT_LOD_TEXTURE_WIDTH,
    DISTANT_LOD_TEXTURE_HEIGHT
  );
  assert.equal(
    Buffer.compare(Buffer.from(cache.textureRgba), Buffer.from(baked.image.data)),
    0,
    'build-time cache bytes must exactly match the runtime fallback bake'
  );
  baked.dispose();
});

test('World installs a matching shared cache without rebaking the distant texture', () => {
  const cache = parseDistantLodCache(cacheBuffer);
  const world = new World(new THREE.Scene(), cache.seed, cache);
  assert.equal(world.distantLodSource, 'shared-cache');
  assert.equal(world.distantSurface.userData.lodSource, 'shared-cache');
  assert.equal(world.distantTexture.image.width, DISTANT_LOD_TEXTURE_WIDTH);
  assert.equal(world.distantTexture.image.height, DISTANT_LOD_TEXTURE_HEIGHT);
  assert.equal(world.distantTexture.image.data, cache.textureRgba);
});

test('distant LOD parser rejects corruption and truncation', () => {
  const corrupted = cacheBuffer.slice(0);
  new Uint8Array(corrupted)[0] ^= 0xff;
  assert.throws(() => parseDistantLodCache(corrupted), /magic/);
  assert.throws(() => parseDistantLodCache(cacheBuffer.slice(0, -1)), /truncated|trailing/);
});

