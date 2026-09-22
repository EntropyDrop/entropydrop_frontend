const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/titanCanyon.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateTitanCanyon: generate, planTitanCanyon: plan, sampleTitanCanyon: sample, canyonRiver: river, CANYON_DEFAULTS } = mod.exports;
const config = { ...CANYON_DEFAULTS, sizeX: 144, sizeY: 192, sizeZ: 144,
  offsetX: -20, offsetZ: -8, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('canyon geometry uses two cube sizes and two materials without duplicates or embedded micro cubes', () => {
  const world = generate(config), combinations = new Set(), coordinates = new Set(), solids = new Set();
  for (const v of world.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  for (const v of world.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeX, v.sizeY); assert.equal(v.sizeX, v.sizeZ);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.material === 'emissive', v.emissive);
    assert.equal(v.intensity > 0, v.emissive);
    for (const n of [v.x - v.sizeX / 2, v.y, v.z - v.sizeZ / 2]) assert.equal(n * 8, Math.round(n * 8));
    const key = `${v.x}:${v.y}:${v.z}:${v.sizeX}`;
    assert.ok(!coordinates.has(key), key); coordinates.add(key);
    if (v.sizeX === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    combinations.add(`${v.sizeX}:${v.material}`);
  }
  assert.deepEqual([...combinations].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(world.emissiveCount, world.voxels.filter(v => v.emissive).length);
});

test('rock, water, steam and machinery respect crop bounds and Y slices; elevation includes all detail', () => {
  for (const yCutoff of [24, 91, 192]) {
    const world = generate({ ...config, yCutoff }), heights = new Float32Array(144 * 144);
    for (const v of world.voxels) {
      const s = v.sizeX;
      assert.ok(v.x - s / 2 >= -72 && v.x + s / 2 <= 72);
      assert.ok(v.z - s / 2 >= -72 && v.z + s / 2 <= 72);
      assert.ok(v.y >= 0 && v.y + s <= yCutoff);
      const i = Math.floor(v.x + 72) + Math.floor(v.z + 72) * 144;
      heights[i] = Math.max(heights[i], v.y + s);
    }
    assert.deepEqual(world.heights, heights);
  }
});

test('overlapping crops preserve the same cliffs, equipment, rotors, steam and pipeline connections', () => {
  const a = { ...config, sizeX: 240, sizeZ: 240, offsetX: 8, offsetZ: 12 };
  const b = { ...config, sizeX: 144, sizeZ: 144, offsetX: -20, offsetZ: -8 };
  const shared = cfg => generate(cfg).voxels.map(v => ({ ...v, x: v.x + cfg.offsetX, z: v.z + cfg.offsetZ }))
    .filter(v => v.x > -76 && v.x < 42 && v.z > -60 && v.z < 53).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(a), shared(b));
});

test('river remains connected through 4km, while each catchment and factory configuration varies', () => {
  const shapes = new Set(); let previous;
  for (let z = -2048; z <= 2048; z += 4) {
    const r = river(z, 0, config), s = sample(r.center, z, config);
    assert.ok(s.water && s.height < 15);
    if (previous) assert.ok(Math.abs(r.center - previous.center) < 6, 'No jumps at sector boundaries');
    shapes.add(`${r.center}:${r.halfWidth}`); previous = r;
  }
  assert.ok(shapes.size > 1000);
  const sites = plan({ ...config, offsetX: 0, offsetZ: 0, sizeX: 4096, sizeZ: 4096 }, 0);
  assert.ok(sites.length > 100);
  assert.equal(new Set(sites.map(s => s.family)).size, 5);
  const regions = [-32768, -1024, 0, 1024, 32768].map(x => digest(plan({ ...config, sizeX: 512, sizeZ: 512, offsetX: x }, 0).map(s => [s.x - x, s.z, s.base, s.radius, s.family, s.towerHeight])));
  assert.equal(new Set(regions).size, regions.length);
});

test('same seed reproduces terrain; other seeds and erosion parameters change the actual landscape', () => {
  const a = generate(config);
  assert.equal(digest(a.voxels), digest(generate(config).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...config, seed: 73451 }).voxels));
  assert.notEqual(digest(a.terrain), digest(generate({ ...config, canyonDepth: 48 }).terrain));
  assert.notEqual(digest(a.terrain), digest(generate({ ...config, canyonWidth: 1.35 }).terrain));
});

test('facilities and turbine foundations follow geology, and bridge endpoints attach to actual decks', () => {
  const cfg = { ...config, sizeX: 384, sizeZ: 320, offsetX: 32, offsetZ: 24 }, world = generate(cfg);
  assert.ok(world.gears.length >= 4 && world.cooling.length >= 4 && world.turbines.length >= 8 && world.bridges.length >= 2);
  const sites = new Map(plan(cfg, 440).map(s => [s.id, s]));
  for (const s of world.sites) assert.equal(s.base, sample(s.x, s.z, cfg).height - 5);
  for (const t of world.turbines) {
    const s = sample(t.x, t.z, cfg);
    assert.ok(s.height >= s.rim - 6);
    assert.ok(t.y >= s.height && t.y - s.height <= 4);
  }
  for (const bridge of world.bridges) for (const [id, p] of [[bridge.from, bridge.start], [bridge.to, bridge.end]]) {
    const s = sites.get(id);
    assert.equal(p.y, s.base + 4);
    assert.equal(p.x, s.x - s.bank * 36);
    assert.equal(p.z, s.z);
  }
  const camera = world.deckView.position;
  assert.ok(world.voxels.some(v => v.sizeX === 1 && v.x === Math.floor(camera.x) + 0.5 && v.z === Math.floor(camera.z) + 0.5 && v.y === camera.y - 3.25));
  assert.ok(world.voxels.length < 850000);
});

test('feature controls leave geology stable, and distant crops produce finite geometry', () => {
  const a = generate(config);
  assert.equal(digest(a.voxels), digest(generate({ ...config, canyonGlow: 0 }).voxels));
  assert.equal(generate({ ...config, canyonGears: 0 }).gears.length, 0);
  assert.equal(generate({ ...config, canyonWind: 0 }).turbines.length, 0);
  assert.equal(generate({ ...config, canyonPipes: 0 }).bridges.length, 0);
  assert.equal(generate({ ...config, canyonIndustry: 0 }).sites.length, 0);
  const clear = generate({ ...config, canyonSteam: 0 });
  assert.deepEqual(a.terrain, clear.terrain);
  assert.ok(clear.voxels.length < a.voxels.length);
  const far = generate({ ...config, offsetX: 32768, offsetZ: -65536 });
  assert.ok(far.voxels.length > 1000);
  assert.ok(far.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
});

test('exploration frames an existing landmark when all gears lie outside the crop', () => {
  const world = generate({ ...config, sizeX: 384, sizeZ: 320, offsetX: 32, offsetZ: -488 });
  const t = world.overviewView.target;
  assert.ok(Math.abs(t.x) < 192 && Math.abs(t.z) < 160 && t.y < 192);
  const landscape = generate({ ...config, canyonIndustry: 0 });
  assert.ok(Object.values(landscape.overviewView.position).every(Number.isFinite));
  assert.ok(landscape.overviewView.target.y < config.yCutoff);
});
