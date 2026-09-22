const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');
const compiled = buildSync({ entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/colossusHarbor.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { generateColossusHarbor: generate, planColossusHarbor: plan, sampleColossusHarbor: sample, harborChannel: channel, HARBOR_DEFAULTS, SCULPTURE_FAMILIES } = mod.exports;
const cfg = { ...HARBOR_DEFAULTS, sizeX: 160, sizeY: 192, sizeZ: 160, offsetX: -75, offsetZ: 0, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('harbour emits only 1m and 0.125m cubes with two material kinds, no duplicates or buried micro cubes', () => {
  const world = generate(cfg), seen = new Set(), solids = new Set(), kinds = new Set();
  for (const v of world.voxels) if (v.sizeX === 1) solids.add(`${v.x - 0.5}:${v.y}:${v.z - 0.5}`);
  for (const v of world.voxels) {
    const s = v.sizeX; assert.ok(s === 1 || s === 0.125); assert.equal(v.sizeY, s); assert.equal(v.sizeZ, s);
    assert.ok(['normal', 'emissive'].includes(v.material)); assert.equal(v.emissive, v.material === 'emissive'); assert.equal(v.emissive, v.intensity > 0);
    const key = `${v.x}:${v.y}:${v.z}:${s}`; assert.ok(!seen.has(key)); seen.add(key);
    for (const n of [v.x - s / 2, v.y, v.z - s / 2]) assert.equal(n * 8, Math.round(n * 8));
    if (s === 0.125) assert.ok(!solids.has(`${Math.floor(v.x)}:${Math.floor(v.y)}:${Math.floor(v.z)}`));
    kinds.add(`${s}:${v.material}`);
  }
  assert.equal(kinds.size, 4); assert.equal(world.emissiveCount, world.voxels.filter(v => v.emissive).length);
});

test('sculptures, feathers, smoke, boats and supports stay inside crop and Y slices', () => {
  for (const yCutoff of [28, 87, 192]) {
    const r = generate({ ...cfg, yCutoff }), heights = new Float32Array(cfg.sizeX * cfg.sizeZ);
    for (const v of r.voxels) {
      const s = v.sizeX;
      assert.ok(v.x - s / 2 >= -80 && v.x + s / 2 <= 80 && v.z - s / 2 >= -80 && v.z + s / 2 <= 80);
      assert.ok(v.y >= 0 && v.y + s <= yCutoff);
      const i = Math.floor(v.x + 80) + Math.floor(v.z + 80) * 160; heights[i] = Math.max(heights[i], v.y + s);
    }
    assert.deepEqual(r.heights, heights);
  }
});

test('overlapping crops agree on actual statue, feather, rail, building and water geometry', () => {
  const a = { ...cfg, sizeX: 288, sizeZ: 256, offsetX: -25, offsetZ: 8 };
  const shared = c => generate(c).voxels.map(v => ({ ...v, x: v.x + c.offsetX, z: v.z + c.offsetZ }))
    .filter(v => v.x > -135 && v.x < -3 && v.z > -64 && v.z < 66).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(cfg), shared(a));
});

test('4km world has seven semantic sculpture families, independently varied poses and no copied adjacent groups', () => {
  const r = plan({ ...cfg, sizeX: 4096, sizeZ: 4096, offsetX: 0, offsetZ: 0, harborStatues: 1 }, 0);
  assert.ok(r.statues.length > 200);
  assert.deepEqual([...new Set(r.statues.map(s => s.family))].sort(), [...SCULPTURE_FAMILIES].sort());
  const groups = new Map();
  for (const s of r.statues) { if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push(s); }
  for (const group of groups.values()) assert.equal(new Set(group.map(s => s.family)).size, group.length);
  for (const family of SCULPTURE_FAMILIES) {
    const sameFamily = r.statues.filter(s => s.family === family);
    assert.ok(new Set(sameFamily.map(s => `${s.height}:${s.pose}:${s.spread}:${s.lean}:${s.crown}`)).size > 20);
  }
  const regions = [-32768, -1240, 0, 1240, 32768].map(offsetX => digest(plan({ ...cfg, offsetX, sizeX: 620, sizeZ: 512 }, 0).statues.map(s => ({ ...s, x: s.x - offsetX, id: '', group: '' }))));
  assert.equal(new Set(regions).size, regions.length);
});

test('river is continuous across regional boundaries; buildings and landmarks are grounded and avoid each other', () => {
  let previous;
  for (let z = -2048; z <= 2048; z += 4) {
    const r = channel(z, 0, cfg); assert.ok(sample(r.center, z, cfg).water);
    if (previous) assert.ok(Math.abs(previous.center - r.center) < 6); previous = r;
  }
  const c = { ...cfg, sizeX: 384, sizeZ: 384, offsetX: 0, offsetZ: 0 }, world = generate(c);
  assert.ok(world.statues.length >= 4 && world.buildings.length >= 25 && world.factories.length && world.boats.length);
  for (const b of world.buildings) {
    assert.ok(b.base >= sample(b.x, b.z, c).height);
    assert.ok(world.statues.every(s => Math.hypot(s.x - b.x, s.z - b.z) >= Math.hypot(b.width, b.depth) / 2 + s.height * 0.33 + 4));
  }
  for (const v of world.statueViews) assert.ok(world.statues.some(s => s.id === v.id));
  assert.ok(world.voxels.length < 900000);
});

test('same world seed reproduces geometry, while seed, sculpture scale and geology controls change their subject', () => {
  const a = generate(cfg);
  assert.equal(digest(a.voxels), digest(generate(cfg).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...cfg, seed: 9384 }).voxels));
  assert.notEqual(digest(a.voxels), digest(generate({ ...cfg, harborScale: 0.8 }).voxels));
  assert.notEqual(digest(a.terrain), digest(generate({ ...cfg, harborRelief: 0.7 }).terrain));
  assert.deepEqual(a.terrain, generate({ ...cfg, harborStatues: 0 }).terrain);
});

test('controls independently disable features, and distant or empty crops have finite cameras', () => {
  assert.equal(generate({ ...cfg, harborStatues: 0 }).statues.length, 0);
  assert.equal(generate({ ...cfg, harborIndustry: 0 }).factories.length, 0);
  assert.equal(generate({ ...cfg, harborCity: 0 }).buildings.length, 0);
  assert.equal(generate({ ...cfg, harborTransit: 0 }).transit.length, 0);
  for (const [offsetX, offsetZ] of [[620, -512], [32768, -65536]]) {
    const r = generate({ ...cfg, offsetX, offsetZ });
    assert.ok(r.voxels.length > 1000 && r.voxels.every(v => Number.isFinite(v.x + v.y + v.z)));
    for (const p of [r.overviewView.position, r.overviewView.target]) assert.ok(Object.values(p).every(Number.isFinite));
  }
  const empty = generate({ ...cfg, harborStatues: 0, harborIndustry: 0, harborCity: 0 });
  assert.equal(empty.statueViews.length, 0); assert.equal(empty.deckView, null);
});

test('industrial smoke is crop-stable, independently disabled, and exploration cameras target in-crop sculptures', () => {
  const small = { ...cfg, sizeX: 128, sizeZ: 128, offsetX: 135, offsetZ: 0 };
  const large = { ...small, sizeX: 240, sizeZ: 192, offsetX: 120, offsetZ: 12 };
  const shared = c => generate(c).voxels.map(v => ({ ...v, x: v.x + c.offsetX, z: v.z + c.offsetZ }))
    .filter(v => v.x > 89 && v.x < 180 && v.z > -48 && v.z < 48).map(v => JSON.stringify(v)).sort();
  assert.deepEqual(shared(small), shared(large));
  const mist = generate(small), clear = generate({ ...small, harborSteam: 0 });
  assert.ok(mist.voxels.length > clear.voxels.length + 1000);
  assert.deepEqual(mist.terrain, clear.terrain);
  for (const offsetZ of [0, -512, -1024]) {
    const r = generate({ ...cfg, sizeX: 384, sizeZ: 384, offsetX: 0, offsetZ });
    for (const v of r.statueViews) {
      assert.ok(Math.abs(v.target.x) < 192 && Math.abs(v.target.z) < 192 && v.target.y < 192);
      assert.ok(r.statues.some(s => s.id === v.id && s.family === v.family));
    }
    if (r.deckView) {
      const p = r.deckView.position;
      assert.ok(r.voxels.some(v => v.sizeX === 1 && v.x === Math.floor(p.x) + 0.5 && v.z === Math.floor(p.z) + 0.5 && v.y === p.y - 3.25), 'Deck camera stands over an emitted plinth');
    }
  }
});
