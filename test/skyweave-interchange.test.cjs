const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash } = require('node:crypto');
const path = require('node:path');

const compiled = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/pages/terrainLab/skyweaveInterchange.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['three'],
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, name => (name === 'three' ? {} : require(name)));
const {
  generateSkyweaveInterchange: generate,
  planSkyweaveRoads,
  planSkyweaveSpans,
  skyweaveTerrainHeight,
  encodeSpaceMaterialId,
  WEAVE_DEFAULTS,
  WEAVE_MODE,
  WEAVE_CONSTANTS,
} = mod.exports;

const cfg = { ...WEAVE_DEFAULTS, sizeX: 192, sizeY: 192, sizeZ: 192, offsetX: 0, offsetZ: 0, yCutoff: 192, seed: 42 };
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const REGION = [-1300, 1300, -1300, 1300];
const roads = planSkyweaveRoads(cfg, ...REGION);

test('emits 1m and 0.125m cubes with exact Space normal / translucent 1-100 / emissive 1-100 encodings', () => {
  const world = generate({ ...cfg, offsetX: -40, offsetZ: 24 });
  const seen = new Set();
  const transparency = new Set();
  const emission = new Set();
  let micro = 0;
  let microTranslucent = 0;
  for (const v of world.voxels) {
    assert.ok(v.sizeX === 1 || v.sizeX === 0.125);
    assert.equal(v.sizeY, v.sizeX);
    assert.equal(v.sizeZ, v.sizeX);
    if (v.sizeX < 1) {
      micro++;
      if (v.material === 'translucent') microTranslucent++;
    }
    if (v.material === 'normal') {
      assert.equal(v.materialId, 0);
      assert.equal(v.transparency + v.emission + v.intensity, 0);
    } else if (v.material === 'translucent') {
      assert.ok(Number.isInteger(v.transparency) && v.transparency >= 1 && v.transparency <= 100);
      assert.equal(v.materialId, v.transparency + 1);
      assert.equal(v.materialId, encodeSpaceMaterialId('translucent', v.transparency));
      transparency.add(v.transparency);
    } else {
      assert.equal(v.material, 'emissive');
      assert.ok(Number.isInteger(v.emission) && v.emission >= 1 && v.emission <= 100);
      assert.equal(v.materialId, v.emission + 101);
      assert.equal(v.intensity, v.emission / 50);
      emission.add(v.emission);
    }
    const key = `${v.x}:${v.y}:${v.z}:${v.sizeX}`;
    assert.ok(!seen.has(key), `duplicate voxel ${key}`);
    seen.add(key);
  }
  assert.ok(micro > 20000, `fine 0.125 m detail (sloped ramps, barriers, rails, paint) is present (${micro})`);
  assert.ok(microTranslucent > 200, `fine 0.125 m translucent glass barriers/balustrades present (${microTranslucent})`);
  assert.ok(transparency.size >= 3, `several transparency levels (${[...transparency]})`);
  assert.ok(emission.size >= 4, `several glow levels (${[...emission]})`);
});

test('generation is deterministic and crop-independent: overlapping crops tile seamlessly', () => {
  const a = generate({ ...cfg, sizeX: 176, sizeZ: 176, offsetX: 0, offsetZ: 0 });
  const b = generate({ ...cfg, sizeX: 176, sizeZ: 176, offsetX: 96, offsetZ: 64 });
  const again = generate({ ...cfg, sizeX: 176, sizeZ: 176, offsetX: 0, offsetZ: 0 });
  assert.equal(digest(a.voxels.slice(0, 20000)), digest(again.voxels.slice(0, 20000)));
  // World-space keys for the overlap, ignoring a 2 m border where face culling sees the crop edge.
  const keys = (res, ox, oz) => {
    const out = new Set();
    for (const v of res.voxels) {
      const wx = v.x + ox, wz = v.z + oz;
      if (wx < 8 + 2 || wx > 88 - 2 || wz < -24 + 2 || wz > 88 - 2) continue;
      out.add(`${wx}|${v.y}|${wz}|${v.sizeX}|${v.color}|${v.materialId}`);
    }
    return out;
  };
  const ka = keys(a, 0, 0), kb = keys(b, 96, 64);
  assert.ok(ka.size > 20000, `overlap contains detail (${ka.size})`);
  let missing = 0;
  for (const k of ka) if (!kb.has(k)) missing++;
  for (const k of kb) if (!ka.has(k)) missing++;
  assert.equal(missing, 0, `${missing} voxels differ between overlapping crops`);
});

test('expressway lattice yields varied interchanges: cloverleafs, trumpets and diamond slip ramps', () => {
  const kinds = new Set(roads.interchanges.map(ic => ic.kind));
  assert.ok(kinds.has('cloverleaf') && kinds.has('trumpet'), [...kinds].join(','));
  const diamonds = roads.segments.filter(s => s.diamonds.length);
  assert.ok(diamonds.length >= 1, `diamond / half-diamond interchanges (${diamonds.length})`);
  for (const ic of roads.interchanges) {
    assert.equal(ic.levelHigh - ic.levelLow, WEAVE_CONSTANTS.LEVEL_GAP, 'crossing expressways are one full level apart');
    assert.equal(ic.ramps.length, ic.kind === 'cloverleaf' ? 8 : 4);
  }
  // Jittered lattice: node spacing is never a fixed period, so large worlds do not visibly repeat.
  const xs = roads.interchanges.map(ic => Math.round(ic.x)).sort((p, q) => p - q);
  const gaps = new Set();
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 200) gaps.add(xs[i] - xs[i - 1]);
  assert.ok(gaps.size >= 3, 'node spacing varies');
});

test('every ramp diverges from / merges into the right-hand outer lane at the carriageway height', () => {
  const mains = roads.decks.filter(d => d.kind === 'exp');
  const arts = roads.decks.filter(d => d.kind === 'art');
  const ramps = roads.decks.filter(d => d.kind === 'ramp');
  assert.ok(ramps.length > 20);
  const attach = (p, h, tx, tz, decks, kind) => {
    let best = null;
    for (const d of decks) {
      if (p.x < d.minX - 2 || p.x > d.maxX + 2 || p.z < d.minZ - 2 || p.z > d.maxZ + 2) continue;
      for (const q of d.pts) {
        const dx = p.x - q.x, dz = p.z - q.z;
        const along = dx * q.tx + dz * q.tz;
        if (Math.abs(along) > 0.75) continue;
        const off = dx * -q.tz + dz * q.tx;
        if (Math.abs(off) > d.hw) continue;
        const score = Math.abs(h - q.h);
        if (!best || score < best.score) best = { score, off, dot: tx * q.tx + tz * q.tz, d };
      }
    }
    if (kind === 'exp' && best) {
      assert.ok(best.score < 0.6, `ramp end height matches mainline (${best.score.toFixed(2)})`);
      assert.ok(Math.abs(Math.abs(best.dot) - 1) < 0.03, 'ramp joins tangentially');
      // Right-hand traffic: the ramp lies on the outer lane on the right of its travel direction.
      const side = Math.sign(best.dot) * best.off;
      assert.ok(side > 5 && side < 9.6, `ramp attaches to the right-hand outer lane (offset ${side.toFixed(2)})`);
    }
    return best;
  };
  let mainEnds = 0, artEnds = 0;
  for (const r of ramps) {
    for (const end of [0, 1]) {
      const p = r.pts[end ? r.pts.length - 1 : 0];
      const tx = end ? p.tx : p.tx, tz = end ? p.tz : p.tz;
      const onMain = attach(p, p.h, tx, tz, mains, 'exp');
      if (onMain) { mainEnds++; continue; }
      // Trumpet stems and diamond terminals: must land on an expressway stem or an avenue.
      const onArt = attach(p, p.h, tx, tz, arts, 'art');
      const onStem = attach(p, p.h, tx, tz, mains.concat(ramps.filter(o => o !== r)), 'stem');
      assert.ok((onArt && onArt.score < 1.2) || (onStem && onStem.score < 0.6), `ramp ${r.id} end ${end} is connected`);
      if (onArt) artEnds++;
    }
  }
  assert.ok(mainEnds > ramps.length, 'most ramp ends sit on expressway mainlines');
  assert.ok(artEnds >= 2, 'diamond ramps terminate on avenues');
});

test('decks sharing a voxel column are either one connected surface or fully grade separated', () => {
  const decks = planSkyweaveRoads(cfg, -700, 700, -700, 700).decks;
  const related = (a, b) => {
    const pair = [a.kind, b.kind].sort().join('-');
    if (pair === 'art-art' || pair === 'art-lane' || pair === 'lane-lane') return true;
    if (pair === 'exp-ramp' || pair === 'exp-exp') return true;
    if (pair === 'ramp-ramp') return a.id.split(':').slice(0, 3).join(':') === b.id.split(':').slice(0, 3).join(':');
    if (pair === 'art-ramp') return (a.kind === 'ramp' ? a : b).to === (a.kind === 'art' ? a : b).id;
    return false;
  };
  // Rasterise every deck surface exactly like the voxel builder (0.5 m lattice, rounded heights).
  const cells = new Map();
  decks.forEach((d, di) => {
    for (let k = 0; k < d.pts.length; k++) {
      const p = d.pts[k];
      if (d.mode[k] === WEAVE_MODE.TUNNEL && d.kind !== 'exp') continue;
      for (let w = -d.hw + 0.5; w <= d.hw - 0.5; w += 0.5) {
        const key = `${Math.floor(p.x - p.tz * w)}|${Math.floor(p.z + p.tx * w)}`;
        let list = cells.get(key);
        if (!list) cells.set(key, (list = new Map()));
        const y = Math.round(p.h);
        const old = list.get(di);
        if (old === undefined || Math.abs(y - old) > 0) list.set(di, old === undefined ? y : Math.min(old, y));
      }
    }
  });
  const problems = new Set();
  for (const [key, list] of cells) {
    if (list.size < 2) continue;
    const e = [...list.entries()];
    for (let i = 0; i < e.length; i++) {
      for (let j = i + 1; j < e.length; j++) {
        const a = decks[e[i][0]], b = decks[e[j][0]];
        const dy = Math.abs(e[i][1] - e[j][1]);
        if (dy >= 7 || (dy <= 1 && related(a, b))) continue;
        problems.add(`${a.id}~${b.id} dy=${dy} @${key}`);
      }
    }
  }
  assert.deepEqual([...problems].slice(0, 30), []);
});

test('expressways clear avenues, ramps keep sane grades, and tunnels are really underground', () => {
  for (const seg of roads.segments) {
    for (const c of seg.crossings) {
      const h = seg.deck.pts[Math.round(c.s)].h;
      assert.ok(h - c.ga >= WEAVE_CONSTANTS.LEVEL_GAP - 0.5 || c.ga - h >= 9.5, `${seg.id} clears avenue ${c.id} (${(h - c.ga).toFixed(1)})`);
    }
  }
  let tunnels = 0, cuts = 0, bridges = 0;
  for (const d of roads.decks) {
    const maxGrade = d.kind === 'exp' ? 0.075 : d.kind === 'ramp' ? 0.145 : 0.13;
    for (let k = 6; k < d.pts.length; k++) {
      const g = Math.abs(d.pts[k].h - d.pts[k - 6].h) / Math.max(0.5, d.pts[k].s - d.pts[k - 6].s);
      if (d.kind !== 'exp' || (d.pts[k].s > 160 && d.pts[k].s < d.pts[d.pts.length - 1].s - 160)) {
        assert.ok(g <= maxGrade, `${d.id} grade ${g.toFixed(3)} at s=${Math.round(d.pts[k].s)}`);
      }
      const m = d.mode[k];
      if (m === WEAVE_MODE.TUNNEL) {
        tunnels++;
        assert.ok(d.terr[k] - Math.round(d.pts[k].h) >= 7, `${d.id} tunnel has cover`);
      } else if (m === WEAVE_MODE.CUT) cuts++;
      else if (m === WEAVE_MODE.ELEVATED) bridges++;
    }
  }
  assert.ok(tunnels > 0 && cuts > 0 && bridges > 0, `tunnels ${tunnels}, cuts ${cuts}, elevated ${bridges}`);
});

test('glass sky-tubes and maglev guideways fly clear of every road and carry no vehicles', () => {
  const spans = planSkyweaveSpans(cfg, -700, 700, -700, 700);
  assert.ok(spans.some(s => s.kind === 'tube') && spans.some(s => s.kind === 'track'));
  const decks = planSkyweaveRoads(cfg, -700, 700, -700, 700).decks;
  for (const sp of spans) {
    const under = sp.kind === 'tube' ? WEAVE_CONSTANTS.TUBE_R + 2 : 3;
    for (let k = 0; k < sp.pts.length; k += 3) {
      const p = sp.pts[k];
      assert.ok(p.h - under - skyweaveTerrainHeight(p.x, p.z, cfg) > 12, `${sp.id} flies above terrain`);
      for (const d of decks) {
        if (p.x < d.minX - 8 || p.x > d.maxX + 8 || p.z < d.minZ - 8 || p.z > d.maxZ + 8) continue;
        for (let q = 0; q < d.pts.length; q += 3) {
          const e = d.pts[q];
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > (d.hw + 8) ** 2) continue;
          assert.ok(p.h - under - e.h >= 5, `${sp.id} clears ${d.id} (${(p.h - under - e.h).toFixed(1)})`);
        }
      }
    }
  }
  // Tube interiors are hollow: no pod / train voxels on the centreline.
  const anchor = spans.filter(s => s.kind === 'tube').flatMap(s => s.pts)
    .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
  const cx = Math.round(anchor.x), cz = Math.round(anchor.z);
  const world = generate({ ...cfg, sizeX: 160, sizeZ: 160, offsetX: cx, offsetZ: cz });
  const solid = new Set(world.voxels.filter(v => v.sizeX === 1).map(v => `${v.x - 0.5 + cx}|${v.y}|${v.z - 0.5 + cz}`));
  const tube = world.spans.find(s => s.kind === 'tube');
  assert.ok(tube, 'a glass tube crosses the crop');
  let checked = 0;
  for (const sp of world.spans.filter(s => s.kind === 'tube')) {
    for (const p of sp.pts) {
      if (Math.abs(p.x - cx) > 70 || Math.abs(p.z - cz) > 70 || p.h + 3 > 190) continue;
      for (let dy = -1; dy <= 2; dy++) assert.ok(!solid.has(`${Math.floor(p.x)}|${Math.round(p.h) + dy}|${Math.floor(p.z)}`), 'tube interior is empty');
      checked++;
    }
  }
  assert.ok(checked > 20);
});

test('a 448 m crop generates a dense, detailed city in reasonable time', () => {
  const t0 = Date.now();
  const world = generate({ ...cfg, sizeX: 448, sizeZ: 448 });
  const ms = Date.now() - t0;
  assert.ok(ms < 15000, `generation took ${ms} ms`);
  assert.ok(world.buildings.length >= 15, `buildings ${world.buildings.length}`);
  assert.ok(world.decks.filter(d => d.kind === 'art').length >= 10);
  assert.ok(world.interchanges.length >= 1);
  assert.ok(world.overviewView && world.landmarkViews.length >= 3);
  const families = new Set(world.buildings.map(b => b.family));
  assert.ok(families.size >= 4, `architecture variety (${[...families]})`);
});
