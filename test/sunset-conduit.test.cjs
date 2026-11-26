const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');

const compiled = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/sunsetConduit.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const {
  generateSunsetConduit: generate,
  planSunsetConduit: plan,
  conduitXPath,
  conduitZPath,
  conduitXLine,
  conduitZLine,
  CONDUIT_DEFAULTS,
  CONDUIT_FAMILIES,
} = mod.exports;

const cfg = { ...CONDUIT_DEFAULTS, sizeX: 160, sizeY: 192, sizeZ: 160, offsetX: 0, offsetZ: 0, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('conduit city emits only 1m and 0.125m cubes with two materials, no duplicates or buried micro cubes', () => {
  const world = generate({ ...cfg, offsetX: -150, offsetZ: -60 });
  const seen = new Set();
  const solids = new Set();
  const kinds = new Set();
  for (const v of world.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
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

test('voxels stay inside crop bounds and Y slices, and heights match the emitted top surface', () => {
  for (const yCutoff of [30, 77, 192]) {
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

test('overlapping crops agree voxel-for-voxel on the shared region', () => {
  const b = { ...cfg, sizeX: 256, sizeZ: 256, offsetX: 37, offsetZ: -21 };
  const shared = c => generate(c).voxels
    .map(v => ({ ...v, x: v.x + c.offsetX, z: v.z + c.offsetZ }))
    .filter(v => v.x > -70 && v.x < 70 && v.z > -70 && v.z < 70)
    .map(v => JSON.stringify(v))
    .sort();
  assert.deepEqual(shared(cfg), shared(b));
});

test('conduit lines only meet at lattice nodes and keep vertical clearance there', () => {
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const xl = conduitXLine(j, cfg), zl = conduitZLine(i, cfg);
    const node = { x: (i + 0.5) * 176, z: j * 176 };
    const a = conduitXPath(j, node.x, cfg), b = conduitZPath(i, node.z, cfg);
    assert.equal(a.z, node.z);
    assert.equal(b.x, node.x);
    assert.ok(Math.abs(a.y - b.y) - xl.radius - zl.radius >= 6, `tiers too close at node ${i}:${j}`);
  }
});

test('supertalls keep clear of every conduit, hub and ramp', () => {
  const p = plan({ ...cfg, sizeX: 1400, sizeZ: 1400 }, 0);
  assert.ok(p.towers.length > 60);
  for (const t of p.towers) {
    for (let j = Math.round(t.z / 176) - 1; j <= Math.round(t.z / 176) + 1; j++) {
      const line = conduitXLine(j, cfg);
      if (!line.present) continue;
      for (let x = t.x - t.reach; x <= t.x + t.reach; x += 1) {
        assert.ok(Math.abs(conduitXPath(j, x, cfg).z - t.z) > t.reach + line.radius, `tower ${t.id} hits X line ${j}`);
      }
    }
    for (let i = Math.round(t.x / 176 - 0.5) - 1; i <= Math.round(t.x / 176 - 0.5) + 1; i++) {
      const line = conduitZLine(i, cfg);
      if (!line.present) continue;
      for (let z = t.z - t.reach; z <= t.z + t.reach; z += 1) {
        assert.ok(Math.abs(conduitZPath(i, z, cfg).x - t.x) > t.reach + line.radius, `tower ${t.id} hits Z line ${i}`);
      }
    }
    for (const ramp of p.ramps) for (const q of ramp.points) {
      assert.ok(Math.hypot(q.x - t.x, q.z - t.z) > t.reach + ramp.radius, `tower ${t.id} hits ramp ${ramp.id}`);
    }
  }
});

test('large world uses every tower family and distant regions do not repeat', () => {
  const big = plan({ ...cfg, sizeX: 4096, sizeZ: 4096 }, 0);
  assert.deepEqual([...new Set(big.towers.map(t => t.family))].sort((a, b) => a - b), CONDUIT_FAMILIES.map((_, i) => i));
  assert.ok(big.hubs.length > 50);
  const regions = [-40000, -2048, 0, 2048, 40000].map(offsetX =>
    digest(plan({ ...cfg, offsetX, sizeX: 600, sizeZ: 600 }, 0).towers.map(t => ({ ...t, x: t.x - offsetX, id: '', a: 0 }))));
  assert.equal(new Set(regions).size, regions.length);
});

test('default 384m preset has hubs, Y ramps, skybridges, vehicles, landmarks and a grounded deck camera', () => {
  const t0 = performance.now();
  const world = generate({ ...cfg, sizeX: 384, sizeZ: 384 });
  const elapsed = performance.now() - t0;
  assert.ok(world.hubs.length >= 1, 'hub station');
  assert.ok(world.ramps.length >= 1, 'Y-branch ramp');
  assert.ok(world.towers.some(t => t.family === 3), 'double-helix tower');
  assert.ok(world.bridges.some(b => b.kind === 'truss'), 'truss skybridge');
  assert.ok(world.bridges.some(b => b.kind === 'garden'), 'garden skybridge');
  assert.ok(world.vehicles.length >= 5, 'flying vehicles');
  assert.ok(world.landmarkViews.length >= 3, 'landmark cameras');
  assert.ok(world.voxels.length < 900000, `voxel count ${world.voxels.length}`);
  assert.ok(elapsed < 5000, `generation took ${elapsed}ms`);
  assert.ok(world.deckView, 'deck view');
  const p = world.deckView.position;
  const deckY = Math.round(p.y - 2.7);
  assert.ok(world.voxels.some(v => v.sizeX === 1 && v.x === Math.floor(p.x) + 0.5 && v.z === Math.floor(p.z) + 0.5 && v.y === deckY), 'deck camera stands on an emitted roof cube');
  assert.ok(!world.voxels.some(v => v.x > Math.floor(p.x) && v.x < Math.floor(p.x) + 1 && v.z > Math.floor(p.z) && v.z < Math.floor(p.z) + 1 && v.y > deckY && v.y < p.y + 1), 'deck camera head is clear');
});

test('determinism, independent controls and distant world stability', () => {
  const a = generate(cfg);
  assert.equal(digest(a.voxels), digest(generate(cfg).voxels));
  assert.equal(digest(a.voxels), digest(generate({ ...cfg, conduitGlow: 0 }).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...cfg, seed: 9001 }).voxels));
  const wide = { ...cfg, sizeX: 384, sizeZ: 384 };
  const noTubes = generate({ ...wide, conduitTubes: 0 });
  assert.equal(noTubes.hubs.length + noTubes.ramps.length, 0);
  assert.equal(generate({ ...wide, conduitBridges: 0 }).bridges.length, 0);
  assert.equal(generate({ ...wide, conduitTraffic: 0 }).vehicles.length, 0);
  const dark = generate({ ...wide, conduitLights: 0, conduitHolo: 0 });
  assert.ok(dark.emissiveCount < generate(wide).emissiveCount);
  for (const [offsetX, offsetZ] of [[704, -352], [65536, -131072]]) {
    const r = generate({ ...cfg, offsetX, offsetZ });
    assert.ok(r.voxels.length > 2000 && r.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
    for (const q of [r.overviewView.position, r.overviewView.target]) assert.ok(Object.values(q).every(Number.isFinite));
  }
});
