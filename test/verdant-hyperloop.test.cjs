const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');

const compiled = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/verdantHyperloop.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const {
  generateVerdantHyperloop: generate,
  planVerdantHyperloop: plan,
  HYPERLOOP_DEFAULTS,
  TOWER_FAMILIES,
} = mod.exports;

const cfg = {
  ...HYPERLOOP_DEFAULTS,
  sizeX: 160,
  sizeY: 192,
  sizeZ: 160,
  offsetX: 0,
  offsetZ: 0,
  yCutoff: 192,
  seed: 42,
};
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('hyperloop emits only 1m and 0.125m cubes with two materials, no duplicates or buried micro cubes', () => {
  const world = generate(cfg);
  const seen = new Set();
  const solids = new Set();
  const kinds = new Set();
  for (const v of world.voxels) {
    if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  }
  for (const v of world.voxels) {
    const s = v.sizeX;
    assert.ok(s === 1 || s === 0.125);
    assert.equal(v.sizeY, s);
    assert.equal(v.sizeZ, s);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.emissive, v.material === 'emissive');
    assert.equal(v.emissive, v.intensity > 0);
    const key = `${v.x}:${v.y}:${v.z}:${s}`;
    assert.ok(!seen.has(key), `duplicate voxel ${key}`);
    seen.add(key);
    for (const n of [v.x - s / 2, v.y, v.z - s / 2]) assert.equal(n * 8, Math.round(n * 8));
    if (s === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    kinds.add(`${s}:${v.material}`);
  }
  assert.deepEqual([...kinds].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(world.emissiveCount, world.voxels.filter(v => v.emissive).length);
});

test('towers, tubes, skybridges and vehicles stay inside crop bounds and Y slices', () => {
  for (const yCutoff of [28, 87, 192]) {
    const r = generate({ ...cfg, yCutoff });
    const heights = new Float32Array(cfg.sizeX * cfg.sizeZ);
    for (const v of r.voxels) {
      const s = v.sizeX;
      assert.ok(v.x - s / 2 >= -80 && v.x + s / 2 <= 80 && v.z - s / 2 >= -80 && v.z + s / 2 <= 80);
      assert.ok(v.y >= 0 && v.y + s <= yCutoff);
      const i = Math.floor(v.x + 80) + Math.floor(v.z + 80) * 160;
      heights[i] = Math.max(heights[i], v.y + s);
    }
    assert.deepEqual(r.heights, heights);
  }
});

test('overlapping crops agree on towers, tubes, hubs, skybridges, foliage and vehicles', () => {
  const a = { ...cfg, sizeX: 256, sizeZ: 256, offsetX: 24, offsetZ: 16 };
  const shared = c =>
    generate(c)
      .voxels.map(v => ({ ...v, x: v.x + c.offsetX, z: v.z + c.offsetZ }))
      .filter(v => v.x > -72 && v.x < 72 && v.z > -72 && v.z < 72)
      .map(v => JSON.stringify(v))
      .sort();
  assert.deepEqual(shared(cfg), shared(a));
});

test('4km world uses all six tower families with continuous variation and non-repeating regions', () => {
  const r = plan({ ...cfg, sizeX: 4096, sizeZ: 4096, offsetX: 0, offsetZ: 0 }, 0);
  assert.ok(r.towers.length > 500);
  assert.deepEqual(
    [...new Set(r.towers.map(t => t.family))].sort((a, b) => a - b),
    TOWER_FAMILIES.map((_, i) => i),
  );
  const regions = [-32768, -1024, 0, 1024, 32768].map(offsetX =>
    digest(
      plan({ ...cfg, offsetX, sizeX: 512, sizeZ: 512 }, 0).towers.map(t => ({
        ...t,
        x: t.x - offsetX,
        id: '',
      })),
    ),
  );
  assert.equal(new Set(regions).size, regions.length);
});

test('default 384m preset has helix landmarks, Y-junction hubs, climbing tubes, eco & truss bridges and grounded deck view', () => {
  const t0 = performance.now();
  const world = generate({ ...cfg, sizeX: 384, sizeZ: 384 });
  const elapsedMs = performance.now() - t0;
  assert.ok(world.towers.some(t => t.family === 5), 'includes Double-Helix tower');
  assert.ok(world.hubs.length >= 1, 'includes at least one Y-junction hub');
  assert.ok(world.tubes.length >= 8, 'includes multi-tier transit tubes');
  assert.ok(world.bridges.some(b => b.kind === 'garden'), 'includes verdant garden eco-skybridges');
  assert.ok(world.bridges.some(b => b.kind === 'truss'), 'includes high truss skybridges');
  assert.ok(world.vehicles.length >= 4, 'includes airspace flying vehicles');
  assert.ok(world.landmarkViews.length >= 2, 'includes cycling landmark cameras');
  assert.ok(world.voxels.length < 850000, `voxel count too high: ${world.voxels.length}`);
  assert.ok(elapsedMs < 5000, `generation took ${elapsedMs}ms`);
  if (world.deckView) {
    const p = world.deckView.position;
    assert.ok(
      world.voxels.some(
        v =>
          v.sizeX === 1 &&
          v.x === Math.floor(p.x) + 0.5 &&
          v.z === Math.floor(p.z) + 0.5 &&
          v.y === p.y - 3.25,
      ),
      'Deck camera stands over an emitted 1m solid deck',
    );
  }
});

test('determinism, independent feature controls and distant world stability', () => {
  const a = generate(cfg);
  assert.equal(digest(a.voxels), digest(generate(cfg).voxels));
  assert.equal(digest(a.voxels), digest(generate({ ...cfg, loopGlow: 0 }).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...cfg, seed: 73451 }).voxels));
  assert.equal(generate({ ...cfg, loopTubes: 0 }).tubes.length, 0);
  assert.equal(generate({ ...cfg, loopTubes: 0 }).hubs.length, 0);
  assert.equal(generate({ ...cfg, loopBridges: 0 }).bridges.length, 0);
  assert.equal(generate({ ...cfg, loopTraffic: 0 }).vehicles.length, 0);
  for (const [offsetX, offsetZ] of [
    [512, -512],
    [32768, -65536],
  ]) {
    const r = generate({ ...cfg, offsetX, offsetZ });
    assert.ok(r.voxels.length > 2000 && r.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
    for (const p of [r.overviewView.position, r.overviewView.target]) {
      assert.ok(Object.values(p).every(Number.isFinite));
    }
  }
});
