const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/aetherArchipelago.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateAetherArchipelago: generate, planAetherWorld: plan, sampleAetherIsland: sample, AETHER_DEFAULTS } = mod.exports;
const config = { ...AETHER_DEFAULTS, sizeX: 144, sizeY: 192, sizeZ: 144,
  offsetX: -134, offsetZ: -11, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('floating world uses only 1m / 0.125m cubic blocks and normal / emissive materials', () => {
  const world = generate(config), combinations = new Set(), coordinates = new Set(), standard = new Set();
  for (const v of world.voxels) if (v.sizeX === 1) standard.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  for (const v of world.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeX, v.sizeY); assert.equal(v.sizeX, v.sizeZ);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.material === 'emissive', v.emissive);
    assert.equal(v.intensity > 0, v.emissive);
    for (const n of [v.x - v.sizeX / 2, v.y, v.z - v.sizeZ / 2]) assert.equal(n * 8, Math.round(n * 8));
    const key = `${v.x}:${v.y}:${v.z}:${v.sizeX}`;
    assert.ok(!coordinates.has(key), key); coordinates.add(key);
    if (v.sizeX === 0.125) assert.ok(!standard.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    combinations.add(`${v.sizeX}:${v.material}`);
  }
  assert.deepEqual([...combinations].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(world.emissiveCount, world.voxels.filter(v => v.emissive).length);
});

test('islands and waterfalls float above empty space; all detail respects crop and cut planes', () => {
  for (const yCutoff of [32, 80, 192]) {
    const world = generate({ ...config, yCutoff }), heights = new Float32Array(world.width * world.depth);
    for (const v of world.voxels) {
      const s = v.sizeX;
      assert.ok(v.x - s / 2 >= -72 && v.x + s / 2 <= 72);
      assert.ok(v.z - s / 2 >= -72 && v.z + s / 2 <= 72);
      assert.ok(v.y >= 2 && v.y + s <= yCutoff);
      const i = Math.floor(v.x + 72) + Math.floor(v.z + 72) * 144;
      heights[i] = Math.max(heights[i], v.y + s);
    }
    assert.deepEqual(world.heights, heights);
    assert.ok(heights.filter(v => v === 0).length > heights.length * 0.2, 'Floating islands must preserve open air between them');
  }
});

test('shared interiors are identical across moved, resized and separately generated chunks', () => {
  const a = { ...config, sizeX: 192, sizeZ: 192, offsetX: -122, offsetZ: 12 };
  const b = { ...config, sizeX: 128, sizeZ: 128, offsetX: -116, offsetZ: 4 };
  const shared = cfg => generate(cfg).voxels.map(v => ({ ...v, x: v.x + cfg.offsetX, z: v.z + cfg.offsetZ }))
    .filter(v => v.x > -160 && v.x < -65 && v.z > -45 && v.z < 55).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(a), shared(b));
});

test('seed reproduces terrain, flora, castle grammar and bridge graph', () => {
  const a = generate(config), b = generate({ ...config, seed: 73451 });
  assert.equal(digest(a.voxels), digest(generate(config).voxels));
  assert.notEqual(digest(a.voxels), digest(b.voxels));
  assert.notDeepEqual(a.islands, b.islands);
});

test('kilometre-scale layout has unique island shapes, multiple ecologies and no mirrored templates', () => {
  const sites = plan({ ...config, sizeX: 4096, sizeZ: 4096, offsetX: 0, offsetZ: 0 }, 0)
    .filter(i => Math.abs(i.x) < 2048 && Math.abs(i.z) < 2048);
  assert.ok(sites.length > 1000);
  const signatures = sites.map(i => `${i.radius}:${i.stretch}:${i.angle}:${i.drop}:${i.altitude}`);
  assert.equal(new Set(signatures).size, sites.length, 'Including positive/negative coordinates must not repeat shape parameters');
  assert.equal(new Set(sites.map(i => i.role)).size, 5);
  assert.equal(new Set(sites.map(i => i.landform)).size, 4);
  assert.equal(new Set(sites.filter(i => i.role === 'citadel').map(i => i.style)).size, 4);
  assert.ok(Math.max(...sites.map(i => i.biome)) - Math.min(...sites.map(i => i.biome)) > 0.4);
  const signaturesByRegion = [];
  for (const offsetX of [-2048, -1024, 0, 1024, 2048, 32768]) {
    const cfg = { ...config, offsetX, offsetZ: 4096, sizeX: 320, sizeZ: 320 };
    const local = plan(cfg, 0).filter(i => Math.abs(i.x - offsetX) < 160 && Math.abs(i.z - 4096) < 160);
    assert.ok(local.length > 0);
    signaturesByRegion.push(digest(local.map(i => [i.x - offsetX, i.z - 4096, i.radius, i.altitude, i.role])));
  }
  assert.equal(new Set(signaturesByRegion).size, signaturesByRegion.length);
});

test('bridge endpoints attach to actual island shores and waterfall sources belong to their island', () => {
  const world = generate({ ...config, sizeX: 320, sizeZ: 288, offsetX: -122, offsetZ: 12 });
  const sites = new Map(plan({ ...config, sizeX: 320, sizeZ: 288, offsetX: -122, offsetZ: 12 }, 170).map(i => [i.id, i]));
  assert.ok(world.bridges.length > 3 && world.waterfalls.length > 2 && world.castles.length > 0);
  for (const bridge of world.bridges) {
    for (const [id, point] of [[bridge.from, bridge.start], [bridge.to, bridge.end]]) {
      const s = sample(sites.get(id), point.x, point.z, config.seed);
      assert.ok(s, 'A bridge ends over rock, not empty sky');
      assert.equal(s.surface, point.y);
    }
  }
  assert.ok(world.voxels.length < 700000);
});

test('large-world chunk addressing works far from the origin and feature controls stay independent', () => {
  const a = generate(config);
  assert.equal(digest(a.voxels), digest(generate({ ...config, aetherGlow: 0 }).voxels));
  assert.equal(generate({ ...config, aetherBridges: 0 }).bridges.length, 0);
  assert.equal(generate({ ...config, aetherWaterfalls: 0 }).waterfalls.length, 0);
  assert.equal(generate({ ...config, aetherCastles: 0 }).castles.length, 0);
  assert.equal(generate({ ...config, aetherDensity: 0 }).voxels.length, 0);
  const far = generate({ ...config, offsetX: 32768, offsetZ: -65536 });
  assert.ok(far.voxels.length > 500);
  assert.ok(far.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
  assert.ok(generate({ ...config, sizeX: 384, sizeZ: 384 }).voxels.length < 900000);
});
