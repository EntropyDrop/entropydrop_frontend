const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/astralFoundry.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateAstralFoundry: generate, planAstralFoundry: plan, FOUNDRY_DEFAULTS } = mod.exports;
const config = { ...FOUNDRY_DEFAULTS, sizeX: 144, sizeY: 192, sizeZ: 144,
  offsetX: 0, offsetZ: 0, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('industrial geometry uses two exact cube sizes, two materials and no overlapping detail', () => {
  const world = generate(config), combinations = new Set(), positions = new Set(), solids = new Set();
  for (const v of world.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  for (const v of world.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeX, v.sizeY); assert.equal(v.sizeX, v.sizeZ);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.material === 'emissive', v.emissive);
    assert.equal(v.intensity > 0, v.emissive);
    for (const n of [v.x - v.sizeX / 2, v.y, v.z - v.sizeZ / 2]) assert.equal(n * 8, Math.round(n * 8));
    const key = `${v.x}:${v.y}:${v.z}:${v.sizeX}`;
    assert.ok(!positions.has(key), key); positions.add(key);
    if (v.sizeX === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    combinations.add(`${v.sizeX}:${v.material}`);
  }
  assert.deepEqual([...combinations].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(world.standardCount, world.voxels.filter(v => v.sizeX === 1).length);
  assert.equal(world.emissiveCount, world.voxels.filter(v => v.emissive).length);
});

test('all geometry respects the volume and horizontal cut; heightmap includes micro details', () => {
  for (const yCutoff of [24, 78, 192]) {
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

test('independent overlapping crops reproduce buildings, details, weathering and bridge graph', () => {
  const a = { ...config, sizeX: 224, sizeZ: 224, offsetX: 0, offsetZ: 0 };
  const b = { ...config, sizeX: 144, sizeZ: 144, offsetX: 14, offsetZ: -12 };
  const shared = cfg => generate(cfg).voxels.map(v => ({ ...v, x: v.x + cfg.offsetX, z: v.z + cfg.offsetZ }))
    .filter(v => v.x > -45 && v.x < 70 && v.z > -68 && v.z < 45).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(a), shared(b));
});

test('seed reproduces the city and bloom does not alter exported terrain', () => {
  const a = generate(config);
  assert.equal(digest(a.voxels), digest(generate(config).voxels));
  assert.equal(digest(a.voxels), digest(generate({ ...config, forgeGlow: 0 }).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...config, seed: 73451 }).voxels));
});

test('4km world varies footprint, height, architecture, orientation and district without mirrored tiles', () => {
  const sites = plan({ ...config, sizeX: 4096, sizeZ: 4096 }, 0).filter(i => Math.abs(i.x) < 2048 && Math.abs(i.z) < 2048);
  assert.ok(sites.length > 1500);
  assert.equal(new Set(sites.map(i => `${i.x}:${i.z}`)).size, sites.length);
  assert.equal(new Set(sites.map(i => i.family)).size, 5);
  assert.equal(new Set(sites.map(i => i.rotation)).size, 4);
  assert.equal(new Set(sites.map(i => i.alloy)).size, 4);
  assert.ok(Math.max(...sites.map(i => i.district)) - Math.min(...sites.map(i => i.district)) > 0.35);
  const layouts = [];
  for (const offsetX of [-2048, -1024, 0, 1024, 2048, 32768]) {
    const local = plan({ ...config, offsetX, offsetZ: 4096, sizeX: 320, sizeZ: 320 }, 0)
      .filter(i => Math.abs(i.x - offsetX) < 160 && Math.abs(i.z - 4096) < 160);
    assert.ok(local.length > 5);
    layouts.push(digest(local.map(i => [i.x - offsetX, i.z - 4096, i.w, i.d, i.height, i.family, i.decks])));
  }
  assert.equal(new Set(layouts).size, layouts.length);
});

test('bridges attach to real tower floors; machinery, platforms and spacecraft have spatial anchors', () => {
  const world = generate({ ...config, sizeX: 320, sizeZ: 320 });
  const sites = new Map(plan({ ...config, sizeX: 320, sizeZ: 320 }, 240).map(i => [i.id, i]));
  assert.ok(world.links.length > 8 && world.machinery.length > 2 && world.ships.length > 0);
  for (const bridge of world.links) for (const [id, p] of [[bridge.from, bridge.start], [bridge.to, bridge.end]]) {
    const site = sites.get(id);
    const w = site.rotation % 2 ? site.d : site.w, d = site.rotation % 2 ? site.w : site.d;
    assert.ok(Math.abs(p.x - site.x) <= w / 2 + 1 && Math.abs(p.z - site.z) <= d / 2 + 1);
    assert.ok(site.decks.includes(p.y));
  }
  assert.ok(world.deckView && world.deckView.position.y > 10);
  const camera = world.deckView.position;
  assert.ok(world.voxels.some(v => v.sizeX === 1 && v.x === Math.floor(camera.x) + 0.5 && v.z === Math.floor(camera.z) + 0.5 && v.y === camera.y - 3.25), 'Platform viewpoint has an actual floor');
  assert.ok(new Set(world.links.map(l => Math.floor((l.start.y + l.end.y) / 12))).size > 3, 'Connections span several elevations');
  assert.ok(world.voxels.length < 700000, 'Default preview should stay within the instance budget');
});

test('feature toggles and distant coordinates are independent of crop generation', () => {
  assert.equal(generate({ ...config, forgeLinks: 0 }).links.length, 0);
  assert.equal(generate({ ...config, forgeMachinery: 0 }).machinery.length, 0);
  assert.equal(generate({ ...config, forgeTraffic: 0 }).ships.length, 0);
  assert.equal(generate({ ...config, forgeDensity: 0, forgeTraffic: 0 }).nodes.length, 0);
  const far = generate({ ...config, offsetX: 32768, offsetZ: -65536 });
  assert.ok(far.voxels.length > 25000);
  assert.ok(far.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
});
