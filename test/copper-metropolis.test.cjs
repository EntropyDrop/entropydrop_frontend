const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

const output = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/copperMetropolis.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', output)(moduleUnderTest, moduleUnderTest.exports, createRequire(__filename));
const { generateCopperMetropolis, METROPOLIS_DEFAULTS } = moduleUnderTest.exports;
const config = { ...METROPOLIS_DEFAULTS, sizeX: 96, sizeY: 128, sizeZ: 96,
  offsetX: 0, offsetZ: 0, yCutoff: 128, seed: 42 };
const digest = result => createHash('sha256').update(JSON.stringify(result.voxels)).digest('hex');

test('same seed reproduces every cube; another seed changes parcels and skyline', () => {
  const a = generateCopperMetropolis(config);
  const b = generateCopperMetropolis(config);
  const c = generateCopperMetropolis({ ...config, seed: 71293 });
  assert.equal(digest(a), digest(b));
  assert.notEqual(digest(a), digest(c));
  assert.notDeepEqual(a.buildings, c.buildings);
});

test('1m shells and 0.125m micro cubes fit the volume and heightmap, including Y slices', () => {
  for (const cutoff of [1, 17, 128]) {
    const result = generateCopperMetropolis({ ...config, yCutoff: cutoff });
    const scales = new Set();
    const heights = new Float32Array(result.width * result.depth);
    for (const v of result.voxels) {
      const size = v.sizeX;
      scales.add(size);
      assert.equal(size, v.sizeY);
      assert.equal(size, v.sizeZ);
      assert.ok([1, 0.125].includes(size));
      assert.ok(v.y >= 0 && v.y + size <= cutoff);
      assert.ok(v.x - size / 2 >= -config.sizeX / 2 && v.x + size / 2 <= config.sizeX / 2);
      assert.ok(v.z - size / 2 >= -config.sizeZ / 2 && v.z + size / 2 <= config.sizeZ / 2);
      for (const corner of [v.x - size / 2, v.y, v.z - size / 2]) assert.equal(corner * 8, Math.round(corner * 8));
      const column = Math.floor(v.x + result.width / 2) + Math.floor(v.z + result.depth / 2) * result.width;
      heights[column] = Math.max(heights[column], v.y + size);
    }
    assert.deepEqual(heights, result.heights);
    if (cutoff === 128) assert.deepEqual([...scales].sort(), [0.125, 1]);
  }
});

function worldCubes(result, cfg, rect) {
  const ox = Math.floor(cfg.offsetX - cfg.sizeX / 2) + cfg.sizeX / 2;
  const oz = Math.floor(cfg.offsetZ - cfg.sizeZ / 2) + cfg.sizeZ / 2;
  return result.voxels.map(v => ({ ...v, x: v.x + ox, z: v.z + oz }))
    .filter(v => v.x > rect[0] && v.x < rect[1] && v.z > rect[2] && v.z < rect[3])
    .map(v => JSON.stringify(v)).sort();
}

test('moving or resizing a preview preserves geometry in the shared interior', () => {
  const larger = { ...config, sizeX: 128, sizeZ: 128, offsetX: -16, offsetZ: 8 };
  const smaller = { ...config, sizeX: 64, sizeZ: 64, offsetX: -20, offsetZ: 6 };
  const a = generateCopperMetropolis(larger), b = generateCopperMetropolis(smaller);
  // Outer shells deliberately expose a cut surface; compare inside that surface.
  const shared = [-50, 10, -24, 36];
  assert.deepEqual(worldCubes(a, larger, shared), worldCubes(b, smaller, shared));
});

test('a full city has varied footprints, heights and roof families within a bounded instance budget', () => {
  const city = generateCopperMetropolis({ ...config, sizeX: 192, sizeZ: 192 });
  const buildings = city.buildings.filter(b => b.x >= -96 && b.x + b.w <= 96 && b.z >= -96 && b.z + b.d <= 96);
  assert.ok(buildings.length > 65);
  assert.ok(new Set(buildings.map(b => `${b.w}:${b.d}`)).size > 30);
  assert.ok(new Set(buildings.map(b => b.height)).size > 25);
  assert.equal(new Set(buildings.map(b => b.family)).size, 6);
  assert.equal(new Set(buildings.map(b => b.crown)).size, 8);
  // Retain the ornament volumes using finer 0.125m shells, without emitting interiors.
  assert.ok(city.voxels.length < 750000);
  const centre = buildings.filter(b => Math.hypot(b.x, b.z) < 40);
  const outskirts = buildings.filter(b => Math.hypot(b.x, b.z) > 85);
  const average = list => list.reduce((sum, b) => sum + b.height, 0) / list.length;
  assert.ok(average(centre) > average(outskirts) * 1.7);
});

test('micro detail can be disabled without changing the architecture', () => {
  const detailed = generateCopperMetropolis(config);
  const plain = generateCopperMetropolis({ ...config, metropolisDetail: 0 });
  assert.deepEqual(detailed.buildings, plain.buildings);
  assert.ok(plain.voxels.length < detailed.voxels.length);
});
