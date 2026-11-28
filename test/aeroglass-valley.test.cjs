const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');

const compiled = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/aeroglassValley.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['three'],
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, name => {
  if (name === 'three') return {};
  return require(name);
});
const {
  generateAeroglassValley: generate,
  planAeroglassValley: plan,
  aeroglassTerrainHeight,
  aeroglassTubePath,
  aeroglassTubeLine,
  encodeSpaceMaterialId,
  AEROGLASS_DEFAULTS,
  AEROGLASS_FAMILIES,
} = mod.exports;

const cfg = {
  ...AEROGLASS_DEFAULTS,
  sizeX: 160,
  sizeY: 192,
  sizeZ: 160,
  offsetX: 0,
  offsetZ: 0,
  yCutoff: 192,
  seed: 42,
};
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('aeroglass valley emits 1m and 0.125m cubes using Space normal, translucent (1-100) and emissive (1-100) materials', () => {
  const world = generate({ ...cfg, offsetX: -48, offsetZ: 16 });
  const seen = new Set();
  const solids = new Set();
  const kinds = new Set();
  const transparencyLevels = new Set();
  const emissionLevels = new Set();

  for (const v of world.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  for (const v of world.voxels) {
    const s = v.sizeX;
    assert.ok(s === 1 || s === 0.125);
    assert.equal(v.sizeY, s);
    assert.equal(v.sizeZ, s);
    assert.ok(['normal', 'translucent', 'emissive'].includes(v.material));
    if (v.material === 'normal') {
      assert.equal(v.materialId, 0);
      assert.equal(v.transparency, 0);
      assert.equal(v.emission, 0);
      assert.equal(v.emissive, false);
      assert.equal(v.intensity, 0);
    } else if (v.material === 'translucent') {
      assert.ok(Number.isInteger(v.transparency) && v.transparency >= 1 && v.transparency <= 100);
      assert.equal(v.materialId, v.transparency + 1);
      assert.equal(v.emission, 0);
      assert.equal(v.emissive, false);
      assert.equal(v.intensity, 0);
      transparencyLevels.add(v.transparency);
    } else {
      assert.ok(Number.isInteger(v.emission) && v.emission >= 1 && v.emission <= 100);
      assert.equal(v.materialId, v.emission + 101);
      assert.equal(v.transparency, 0);
      assert.equal(v.emissive, true);
      assert.equal(v.intensity, v.emission / 50);
      emissionLevels.add(v.emission);
    }
    const key = `${v.x}:${v.y}:${v.z}:${s}`;
    assert.ok(!seen.has(key), `duplicate voxel ${key}`);
    seen.add(key);
    for (const n of [v.x - s / 2, v.y, v.z - s / 2]) assert.equal(n * 8, Math.round(n * 8));
    if (s === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    kinds.add(`${s}:${v.material}`);
  }
  assert.deepEqual([...kinds].sort(), [
    '0.125:emissive',
    '0.125:normal',
    '0.125:translucent',
    '1:emissive',
    '1:normal',
    '1:translucent',
  ]);
  assert.ok(transparencyLevels.size >= 3, 'uses multiple Space transparency levels');
  assert.ok(emissionLevels.size >= 4, 'uses multiple Space emissive levels');
  assert.equal(world.translucentCount, world.voxels.filter(v => v.material === 'translucent').length);
  assert.equal(world.emissiveCount, world.voxels.filter(v => v.material === 'emissive').length);
  assert.equal(encodeSpaceMaterialId('normal', 0), 0);
  assert.equal(encodeSpaceMaterialId('translucent', 60), 61);
  assert.equal(encodeSpaceMaterialId('emissive', 50), 151);
});

test('voxels stay inside crop bounds and Y slices, and heights match the emitted top surface', () => {
  for (const yCutoff of [32, 85, 192]) {
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

test('overlapping crops agree voxel-for-voxel on the shared interior region', () => {
  const b = { ...cfg, sizeX: 240, sizeZ: 240, offsetX: 31, offsetZ: -19 };
  const shared = c => generate(c).voxels
    .map(v => ({ ...v, x: v.x + c.offsetX, z: v.z + c.offsetZ }))
    .filter(v => v.x > -68 && v.x < 68 && v.z > -68 && v.z < 68)
    .map(v => JSON.stringify(v))
    .sort();
  assert.deepEqual(shared(cfg), shared(b));
});

test('sky-tubes soar cleanly above terrain and tall buildings keep vertical or horizontal clearance', () => {
  const p = plan({ ...cfg, sizeX: 1200, sizeZ: 1200 }, 0);
  assert.ok(p.buildings.length > 80);
  for (let x = -400; x <= 400; x += 8) {
    const line = aeroglassTubeLine(0, cfg);
    assert.ok(line.present);
    const pt = aeroglassTubePath(0, x, cfg);
    const ground = aeroglassTerrainHeight(pt.x, pt.z, cfg);
    assert.ok(pt.y - line.radius > ground + 6, `tube clips terrain at x=${x}`);
  }
  for (const b of p.buildings) {
    const jc = Math.round(b.z / 224);
    for (let j = jc - 1; j <= jc + 1; j++) {
      const line = aeroglassTubeLine(j, cfg);
      if (!line.present) continue;
      const pt = aeroglassTubePath(j, b.x, cfg);
      if (Math.abs(b.z - pt.z) < b.radius + line.radius + 4) {
        assert.ok(b.base + b.height <= pt.y - line.radius - 2, `building ${b.id} hits tube ${j}`);
      }
    }
  }
});

test('large world uses every architecture family and distant regions do not repeat', () => {
  const big = plan({ ...cfg, sizeX: 3000, sizeZ: 3000 }, 0);
  assert.deepEqual(
    [...new Set(big.buildings.map(b => b.family))].sort((a, b) => a - b),
    AEROGLASS_FAMILIES.map((_, i) => i),
  );
  assert.ok(big.pylons.length > 20);
  const regions = [-40000, -2048, 0, 2048, 40000].map(offsetX =>
    digest(plan({ ...cfg, offsetX, sizeX: 600, sizeZ: 600 }, 0).buildings.map(b => ({
      ...b, x: b.x - offsetX, id: '', a: 0,
    }))));
  assert.equal(new Set(regions).size, regions.length);
});

test('default 384m preset has glass sky-tube pylons, biodomes, drones, shuttles, landmarks and grounded deck camera', () => {
  const t0 = performance.now();
  const world = generate({ ...cfg, sizeX: 384, sizeZ: 384 });
  const elapsed = performance.now() - t0;
  assert.ok(world.pylons.length >= 2, 'station pylons');
  assert.ok(world.buildings.some(b => b.family === 0), 'circular eco-tower');
  assert.ok(world.buildings.some(b => b.family === 1), 'arch-fin louver tower');
  assert.ok(world.buildings.some(b => b.family === 2), 'crystal spire supertall');
  assert.ok(world.buildings.some(b => b.family === 4), 'translucent glass biodome');
  assert.ok(world.craft.some(c => c.kind === 'drone'), 'quadcopter drones');
  assert.ok(world.craft.some(c => c.kind === 'shuttle'), 'VTOL shuttles');
  assert.ok(world.translucentCount > 15000, `translucent count ${world.translucentCount}`);
  assert.ok(world.emissiveCount > 2000, `emissive count ${world.emissiveCount}`);
  assert.ok(world.landmarkViews.length >= 3, 'landmark views');
  assert.ok(world.voxels.length < 1100000, `voxel count ${world.voxels.length}`);
  assert.ok(elapsed < 6000, `generation took ${elapsed}ms`);
  assert.ok(world.deckView, 'deck view');
  const p = world.deckView.position;
  const deckY = Math.round(p.y - 2.7);
  assert.ok(
    world.voxels.some(v => v.sizeX === 1 && v.material !== 'translucent' && v.x === Math.floor(p.x) + 0.5 && v.z === Math.floor(p.z) + 0.5 && v.y === deckY),
    'deck camera stands on an emitted opaque roof cube',
  );
});

test('determinism, independent controls and distant world stability', () => {
  const a = generate(cfg);
  assert.equal(digest(a.voxels), digest(generate(cfg).voxels));
  assert.equal(digest(a.voxels), digest(generate({ ...cfg, aeroGlow: 0 }).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...cfg, seed: 9001 }).voxels));
  const wide = { ...cfg, sizeX: 384, sizeZ: 384 };
  assert.equal(generate({ ...wide, aeroTubes: 0 }).pylons.length, 0);
  assert.equal(generate({ ...wide, aeroTraffic: 0 }).craft.length, 0);
  assert.equal(generate({ ...wide, aeroHolo: 0 }).billboards.length, 0);
  for (const [offsetX, offsetZ] of [[896, -448], [65536, -131072]]) {
    const r = generate({ ...cfg, offsetX, offsetZ });
    assert.ok(r.voxels.length > 5000 && r.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
    for (const q of [r.overviewView.position, r.overviewView.target]) {
      assert.ok(Object.values(q).every(Number.isFinite));
    }
  }
});
