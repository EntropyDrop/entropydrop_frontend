const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/neonRain.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateNeonRain, NEON_RAIN_DEFAULTS } = mod.exports;
const config = { ...NEON_RAIN_DEFAULTS, sizeX: 80, sizeY: 144, sizeZ: 80,
  offsetX: 0, offsetZ: 0, yCutoff: 144, seed: 42 };
const digest = result => createHash('sha256').update(JSON.stringify(result.voxels)).digest('hex');

test('neon rain uses exactly two cube sizes and two explicit materials on a 1/8m lattice', () => {
  const result = generateNeonRain(config);
  const combinations = new Set();
  const coordinates = new Set();
  let glowing = 0;
  for (const v of result.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeX, v.sizeY);
    assert.equal(v.sizeX, v.sizeZ);
    assert.ok(['normal', 'emissive'].includes(v.material));
    assert.equal(v.emissive, v.material === 'emissive');
    assert.equal(v.intensity > 0, v.emissive);
    if (v.emissive) glowing++;
    for (const value of [v.x - v.sizeX / 2, v.y, v.z - v.sizeZ / 2]) assert.equal(value * 8, Math.round(value * 8));
    const key = `${v.x},${v.y},${v.z},${v.sizeX}`;
    assert.ok(!coordinates.has(key), `Duplicate cube at ${key}`);
    coordinates.add(key);
    combinations.add(`${v.sizeX}:${v.material}`);
  }
  assert.deepEqual([...combinations].sort(), ['0.125:emissive', '0.125:normal', '1:emissive', '1:normal']);
  assert.equal(glowing, result.emissiveCount);
});

test('all geometry, including lights, cables, vehicles and rain, respects the volume and Y slice', () => {
  for (const yCutoff of [1, 23, 144]) {
    const result = generateNeonRain({ ...config, yCutoff });
    const heights = new Float32Array(result.width * result.depth);
    for (const v of result.voxels) {
      const s = v.sizeX;
      assert.ok(v.x - s / 2 >= -40 && v.x + s / 2 <= 40);
      assert.ok(v.z - s / 2 >= -40 && v.z + s / 2 <= 40);
      assert.ok(v.y >= 0 && v.y + s <= yCutoff);
      const index = Math.floor(v.x + 40) + Math.floor(v.z + 40) * 80;
      heights[index] = Math.max(heights[index], v.y + s);
    }
    assert.deepEqual(result.heights, heights);
  }
});

test('seed reproduces the city and a different seed replans its towers', () => {
  const a = generateNeonRain(config);
  assert.equal(digest(a), digest(generateNeonRain(config)));
  const b = generateNeonRain({ ...config, seed: 19293 });
  assert.notEqual(digest(a), digest(b));
  assert.notDeepEqual(a.towers, b.towers);
});

function sharedVoxels(result, cfg) {
  return result.voxels.map(v => ({ ...v, x: v.x + cfg.offsetX, z: v.z + cfg.offsetZ }))
    .filter(v => v.x > -27 && v.x < 25 && v.z > -25 && v.z < 25)
    .map(v => JSON.stringify(v)).sort();
}
test('moving and resizing the preview preserves shared interior geometry and lights', () => {
  const a = { ...config, sizeX: 96, sizeZ: 96, offsetX: -8, offsetZ: 4 };
  const b = { ...config, sizeX: 64, sizeZ: 64, offsetX: -2, offsetZ: 2 };
  assert.deepEqual(sharedVoxels(generateNeonRain(a), a), sharedVoxels(generateNeonRain(b), b));
});

test('the default district has varied footprints, silhouettes and supported bridges within its instance budget', () => {
  const city = generateNeonRain({ ...config, sizeX: 192, sizeZ: 176, offsetX: 20, offsetZ: 18 });
  assert.ok(city.voxels.length < 750000);
  assert.equal(new Set(city.towers.map(t => t.family)).size, 5);
  assert.ok(new Set(city.towers.map(t => `${t.w}:${t.d}`)).size > 25);
  assert.ok(new Set(city.towers.map(t => t.height)).size > 25);
  assert.ok(city.bridges.length > 20);
  for (const bridge of city.bridges) {
    for (const endpoint of [bridge.from, bridge.to]) {
      assert.ok(bridge.level >= endpoint.bottom && bridge.level + 2 < endpoint.top);
      const start = bridge.alongX ? endpoint.z : endpoint.x;
      const length = bridge.alongX ? endpoint.d : endpoint.w;
      assert.ok(bridge.cross >= start && bridge.cross + 3 <= start + length);
    }
  }
});

test('light controls affect emissive detail while bloom leaves exported geometry unchanged', () => {
  const a = generateNeonRain(config);
  const dark = generateNeonRain({ ...config, rainWindows: 0, rainSigns: 0 });
  assert.ok(dark.emissiveCount < a.emissiveCount);
  assert.deepEqual(dark.towers, a.towers);
  assert.equal(digest(a), digest(generateNeonRain({ ...config, rainGlow: 0 })));
  assert.equal(generateNeonRain({ ...config, rainBridges: 0 }).bridges.length, 0);
});
