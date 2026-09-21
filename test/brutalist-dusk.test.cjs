const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/brutalistDusk.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateBrutalistDusk: generate, BRUTALIST_DUSK_DEFAULTS } = mod.exports;
const config = { ...BRUTALIST_DUSK_DEFAULTS, sizeX: 112, sizeY: 160, sizeZ: 112,
  offsetX: 0, offsetZ: 0, yCutoff: 160, seed: 42 };
const digest = result => createHash('sha256').update(JSON.stringify(result.voxels)).digest('hex');

test('concrete city has exactly two cubic sizes and two materials without overlaps', () => {
  const city = generate(config), combinations = new Set(), coordinates = new Set(), solids = new Set();
  for (const v of city.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5},${v.y},${v.z - 0.5}`);
  for (const v of city.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeX, v.sizeY); assert.equal(v.sizeX, v.sizeZ);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.emissive, v.material === 'emissive');
    assert.equal(v.intensity > 0, v.emissive);
    for (const n of [v.x - v.sizeX / 2, v.y, v.z - v.sizeZ / 2]) assert.equal(n * 8, Math.round(n * 8));
    const key = `${v.x}:${v.y}:${v.z}:${v.sizeX}`;
    assert.ok(!coordinates.has(key), key); coordinates.add(key);
    if (v.sizeX === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)},${Math.floor(v.y)},${Math.floor(v.z)}`), 'Micro ornament intersects a standard block');
    combinations.add(`${v.sizeX}:${v.material}`);
  }
  assert.deepEqual([...combinations].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(city.emissiveCount, city.voxels.filter(v => v.emissive).length);
});

test('slices cut all architectural and micro detail; elevation reflects the visible geometry', () => {
  for (const yCutoff of [1, 28, 100, 160]) {
    const city = generate({ ...config, yCutoff });
    const heights = new Float32Array(city.width * city.depth);
    for (const v of city.voxels) {
      const size = v.sizeX;
      assert.ok(v.x - size / 2 >= -56 && v.x + size / 2 <= 56);
      assert.ok(v.z - size / 2 >= -56 && v.z + size / 2 <= 56);
      assert.ok(v.y >= 0 && v.y + size <= yCutoff);
      const index = Math.floor(v.x + 56) + Math.floor(v.z + 56) * 112;
      heights[index] = Math.max(heights[index], v.y + size);
    }
    assert.deepEqual(city.heights, heights);
  }
});

test('central portal stays genuinely open and inhabited beams bear on tower cores', () => {
  const city = generate(config);
  const portal = city.portals.find(p => Math.abs(p.x) < 40);
  assert.ok(portal && portal.w >= 15 && portal.top - portal.bottom >= 25);
  for (const v of city.voxels) {
    assert.ok(!(v.x > portal.x && v.x < portal.x + portal.w && v.z > portal.z && v.z < portal.z + portal.d && v.y >= portal.bottom && v.y < portal.top), 'The main portal must not be filled');
  }
  const beam = city.structures.find(r => r.role === 'hall' && r.w > 55);
  assert.ok(beam);
  for (const x of [beam.x + 3, beam.x + beam.w - 3]) {
    assert.ok(city.structures.some(r => r.role === 'pier' && x >= r.x && x < r.x + r.w && beam.z + 5 >= r.z && beam.z + 5 < r.z + r.d && r.bottom < beam.bottom && r.top > beam.top));
  }
  assert.equal(city.viaducts.length, 2);
  for (const viaduct of city.viaducts) {
    assert.ok(viaduct.supports.length >= 8);
    assert.ok(viaduct.supports.every((position, i, a) => i === 0 || position - a[i - 1] <= 25));
  }
});

test('seeds reproduce all details and replan the skyline', () => {
  const a = generate(config), b = generate({ ...config, seed: 91245 });
  assert.equal(digest(a), digest(generate(config)));
  assert.notEqual(digest(a), digest(b));
  assert.notDeepEqual(a.structures, b.structures);
});

test('moving the preview preserves the shared world, including signs and weathering', () => {
  const a = { ...config, sizeX: 112, sizeZ: 112, offsetX: -6, offsetZ: 4 };
  const b = { ...config, sizeX: 80, sizeZ: 80, offsetX: 2, offsetZ: 0 };
  const shared = cfg => generate(cfg).voxels.map(v => ({ ...v, x: v.x + cfg.offsetX, z: v.z + cfg.offsetZ }))
    .filter(v => v.x > -30 && v.x < 30 && v.z > -30 && v.z < 30).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(a), shared(b));
});

test('weather and glow preserve massing; transit and lighting controls are independent', () => {
  const a = generate(config), clean = generate({ ...config, brutalWeathering: 0 });
  assert.notEqual(digest(a), digest(clean));
  assert.deepEqual(a.structures, clean.structures);
  assert.equal(a.voxels.length, clean.voxels.length);
  assert.equal(digest(a), digest(generate({ ...config, brutalGlow: 0 })));
  assert.equal(generate({ ...config, brutalLights: 0 }).emissiveCount, 0);
  assert.equal(generate({ ...config, brutalTransit: 0 }).viaducts.length, 0);
  assert.equal(generate({ ...config, brutalTransit: 0.5 }).viaducts.length, 1);
  const full = generate({ ...config, sizeX: 192, sizeZ: 176 });
  assert.ok(full.voxels.length < 700000, `Instance budget: ${full.voxels.length}`);
  assert.ok(new Set(full.structures.filter(s => s.role === 'neighbour').map(s => `${s.w}:${s.d}:${s.top}`)).size > 20);
});
