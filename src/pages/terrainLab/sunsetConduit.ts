/** Sunset Conduit · 晚霞管城
 *
 * An infinite, coordinate-addressed sunset megacity built around a lattice of
 * elevated glass-and-chrome conduits. X-running and Z-running conduit lines sit
 * on separate height tiers, so they only meet at lattice nodes; selected nodes
 * become hub stations with sweeping Y-branch ramps. Twisted, lens, banded,
 * double-helix and crescent supertalls fill the clear lots, while terraced
 * podiums with roof gardens are height-limited to slip underneath the tubes.
 *
 * Geometry is exclusively 1m / 0.125m cubes with normal / emissive materials.
 * Planning depends only on world coordinates and the seed, never on the crop.
 * Output X/Z are cube centres relative to the crop centre; Y is the cube bottom. */

export interface ConduitConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  conduitSkyline: number;
  conduitDensity: number;
  conduitTwist: number;
  conduitTubes: number;
  conduitGardens: number;
  conduitBridges: number;
  conduitTraffic: number;
  conduitLights: number;
  conduitHolo: number;
  conduitGlow: number;
}

export const CONDUIT_DEFAULTS = {
  conduitSkyline: 176,
  conduitDensity: 0.82,
  conduitTwist: 0.7,
  conduitTubes: 0.9,
  conduitGardens: 0.85,
  conduitBridges: 0.7,
  conduitTraffic: 0.6,
  conduitLights: 0.62,
  conduitHolo: 0.65,
  conduitGlow: 0.34,
};

/** Direction *towards* the low sunset sun (shared by sky, key light and cameras). */
export const CONDUIT_SUN = { x: -0.79, y: 0.13, z: -0.6 };

export const CONDUIT_FAMILIES = ['twist', 'lens', 'banded', 'helix', 'crescent'] as const;

export interface ConduitPoint { x: number; y: number; z: number }
export interface ConduitVoxel extends ConduitPoint {
  sizeX: 1 | 0.125;
  sizeY: 1 | 0.125;
  sizeZ: 1 | 0.125;
  color: number;
  material: 'normal' | 'emissive';
  emissive: boolean;
  intensity: number;
}
export interface ConduitTower {
  id: string; a: number; b: number; x: number; z: number; base: number; height: number;
  family: number; radius: number; reach: number; spin: number; twist: number; palette: number; holo: boolean;
}
export interface ConduitPodium {
  id: string; a: number; b: number; x: number; z: number; w: number; d: number; height: number;
  tiers: number; kind: 'podium' | 'terrace'; underTube: boolean;
}
export interface ConduitHub { id: string; i: number; j: number; x: number; z: number; levels: number[]; rampA: boolean; rampB: boolean }
export interface ConduitRamp { id: string; points: ConduitPoint[]; radius: number }
export interface ConduitBridge { id: string; kind: 'truss' | 'garden'; a: ConduitPoint; b: ConduitPoint; width: number }
export interface ConduitVehicle { id: string; x: number; y: number; z: number; heading: number; tone: number }
export interface ConduitView { position: ConduitPoint; target: ConduitPoint }

const M = 0.125;
const PITCH = 176;
const LOT = 46;
const STREET = 5;
const X_LEVELS = [36, 66, 94];
const Z_LEVELS = [51, 80];

const C = {
  asphalt: 0x262a31, lane: 0x8e8a78, curb: 0x7c7f86, paving: 0x6c6f75, pavingAlt: 0x777a80,
  grass: 0x4f7d3a, grassAlt: 0x5f8d42, hedge: 0x37602e, leafA: 0x4a7a35, leafB: 0x5e9140, leafC: 0x3d6b30,
  blossom: 0xd08aa2, trunk: 0x5a4532,
  warmWhite: 0xe7e1d6, slab: 0xd9d3c8, parapet: 0xcfc9be,
  chrome: 0xd3dae2, pylon: 0xe3e0da, chromeBright: 0xeef2f6, steel: 0xa9b3be,
  tubeTop: 0xdbe5ee, tubeSide: 0xb6c6d6, tubeKeel: 0x9ba7b4, tubeCore: 0x1c232d,
  hubGlass: 0x4f6d8a, hubDark: 0x3a4e63,
  podiumGlass: 0x32465b, roofDark: 0x3b424c,
  bodyWhite: 0xd8dde3, canopy: 0x1d2531,
};
const WINDOW_LIGHTS = [0xffc271, 0xffd79c, 0xffb560, 0xcfe4ff];
const PALETTES = [
  { glass: 0x2c4560, alt: 0x324d6a, spandrel: 0x3a4250, frame: 0xc9d1da },
  { glass: 0x395776, alt: 0x40607f, spandrel: 0x8996a6, frame: 0xd3dae2 },
  { glass: 0x24394f, alt: 0x2a4159, spandrel: 0x56616f, frame: 0xc2cbd5 },
  { glass: 0x6a86a3, alt: 0x7590ab, spandrel: 0xdfe3e8, frame: 0xe7e1d6 },
  { glass: 0x2d5361, alt: 0x335b6a, spandrel: 0x46525b, frame: 0xd0d7dd },
];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mod = (v: number, m: number) => ((v % m) + m) % m;
const wrapAngle = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

function hash(x: number, z: number, salt: number, seed: number) {
  let h = Math.imul(x ^ seed ^ 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13) ^ salt, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number, seed: number, salt: number) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz, salt, seed), b = hash(ix + 1, iz, salt, seed);
  const c = hash(ix, iz + 1, salt, seed), d = hash(ix + 1, iz + 1, salt, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const fbm = (x: number, z: number, seed: number, salt: number) => noise(x, z, seed, salt) * 0.6
  + noise(x * 2.13 + 17, z * 2.13 - 29, seed, salt + 1) * 0.28 + noise(x * 4.41 - 7, z * 4.41 + 41, seed, salt + 2) * 0.12;

/** Business-district intensity: clusters of supertalls separated by lower quarters. */
export function conduitDistrict(x: number, z: number, config: ConduitConfig) {
  return smooth((fbm(x / 540, z / 540, Math.floor(config.seed), 7) - 0.28) / 0.44);
}

// ---------------------------------------------------------------------------
// Conduit lattice
// ---------------------------------------------------------------------------

export function conduitXLine(j: number, config: ConduitConfig) {
  const seed = Math.floor(config.seed);
  return {
    present: hash(j, 7, 101, seed) < config.conduitTubes,
    level: X_LEVELS[Math.floor(hash(j, 7, 102, seed) * X_LEVELS.length)],
    radius: hash(j, 7, 103, seed) < 0.62 ? 4 : 3,
  };
}
export function conduitZLine(i: number, config: ConduitConfig) {
  const seed = Math.floor(config.seed);
  return {
    present: hash(i, 9, 106, seed) < config.conduitTubes,
    level: Z_LEVELS[Math.floor(hash(i, 9, 107, seed) * Z_LEVELS.length)],
    radius: 3,
  };
}
/** X-running line j: nodes sit at x = (k + 0.5) * PITCH where lateral and vertical
 * offsets vanish with zero slope (sin²), so crossing lines meet exactly at nodes. */
export function conduitXPath(j: number, x: number, config: ConduitConfig): ConduitPoint {
  const seed = Math.floor(config.seed), line = conduitXLine(j, config);
  const k = Math.floor(x / PITCH - 0.5), t = x / PITCH - 0.5 - k, bump = Math.sin(Math.PI * t) ** 2;
  return {
    x,
    y: line.level + (hash(j, k, 104, seed) - 0.35) * 14 * bump,
    z: j * PITCH + (hash(j, k, 105, seed) - 0.5) * 64 * bump,
  };
}
export function conduitZPath(i: number, z: number, config: ConduitConfig): ConduitPoint {
  const seed = Math.floor(config.seed), line = conduitZLine(i, config);
  const k = Math.floor(z / PITCH), t = z / PITCH - k, bump = Math.sin(Math.PI * t) ** 2;
  return {
    x: (i + 0.5) * PITCH + (hash(i, k, 108, seed) - 0.5) * 64 * bump,
    y: line.level + (hash(i, k, 109, seed) - 0.35) * 14 * bump,
    z,
  };
}

function hubAt(i: number, j: number, config: ConduitConfig): ConduitHub | null {
  const seed = Math.floor(config.seed), xl = conduitXLine(j, config), zl = conduitZLine(i, config);
  if (!xl.present || !zl.present || hash(i, j, 110, seed) > 0.72) return null;
  return {
    id: `${i}:${j}`, i, j, x: (i + 0.5) * PITCH, z: j * PITCH, levels: [xl.level, zl.level].sort((a, b) => a - b),
    rampA: hash(i, j, 111, seed) < 0.8, rampB: hash(i, j, 112, seed) < 0.55,
  };
}

const bezier = (p0: ConduitPoint, p1: ConduitPoint, p2: ConduitPoint, p3: ConduitPoint, t: number): ConduitPoint => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y, z: a * p0.z + b * p1.z + c * p2.z + d * p3.z };
};
const unit = (a: ConduitPoint, b: ConduitPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
};

/** Y-branch ramps sweep from an X line, around the hub, onto the Z line. */
function hubRamps(hub: ConduitHub, config: ConduitConfig): ConduitRamp[] {
  const ramps: ConduitRamp[] = [];
  const build = (id: string, sx: number, sz: number) => {
    const p0 = conduitXPath(hub.j, hub.x + sx * 48, config), p3 = conduitZPath(hub.i, hub.z + sz * 48, config);
    const d0 = unit(conduitXPath(hub.j, hub.x + sx * 48 + sx, config), conduitXPath(hub.j, hub.x + sx * 48 - sx, config));
    const d3 = unit(conduitZPath(hub.i, hub.z + sz * 48 - sz, config), conduitZPath(hub.i, hub.z + sz * 48 + sz, config));
    const p1 = { x: p0.x + d0.x * 26, y: p0.y, z: p0.z + d0.z * 26 };
    const p2 = { x: p3.x - d3.x * 26, y: p3.y, z: p3.z - d3.z * 26 };
    const points: ConduitPoint[] = [];
    for (let k = 0; k <= 96; k++) points.push(bezier(p0, p1, p2, p3, k / 96));
    ramps.push({ id, points, radius: 3 });
  };
  if (hub.rampA) build(`${hub.id}:a`, -1, 1);
  if (hub.rampB) build(`${hub.id}:b`, 1, -1);
  return ramps;
}

/** Horizontal clearance from conduits. Supertalls need full clearance, podiums
 * get a height limit that keeps their roofs below the nearest tube. */
function conduitClearance(cx: number, cz: number, rad: number, config: ConduitConfig) {
  let tall = true, limit = 999;
  const jc = Math.round(cz / PITCH), ic = Math.round(cx / PITCH - 0.5);
  for (let j = jc - 1; j <= jc + 1; j++) {
    const line = conduitXLine(j, config); if (!line.present) continue;
    for (const sx of [cx - rad, cx, cx + rad]) {
      const p = conduitXPath(j, sx, config);
      if (Math.abs(cz - p.z) < rad + line.radius + 6) { tall = false; limit = Math.min(limit, p.y - line.radius - 4); }
    }
  }
  for (let i = ic - 1; i <= ic + 1; i++) {
    const line = conduitZLine(i, config); if (!line.present) continue;
    for (const sz of [cz - rad, cz, cz + rad]) {
      const p = conduitZPath(i, sz, config);
      if (Math.abs(cx - p.x) < rad + line.radius + 6) { tall = false; limit = Math.min(limit, p.y - line.radius - 4); }
    }
  }
  for (let i = ic - 1; i <= ic + 1; i++) for (let j = jc - 1; j <= jc + 1; j++) {
    const hub = hubAt(i, j, config); if (!hub) continue;
    if (Math.hypot(cx - hub.x, cz - hub.z) < rad + 18) { tall = false; limit = Math.min(limit, hub.levels[0] - 10); }
    for (const ramp of hubRamps(hub, config)) {
      for (let k = 0; k < ramp.points.length; k += 6) {
        const p = ramp.points[k];
        if (Math.hypot(cx - p.x, cz - p.z) < rad + ramp.radius + 6) { tall = false; limit = Math.min(limit, p.y - ramp.radius - 4); }
      }
    }
  }
  return { tall, limit };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const towerReach = (family: number, radius: number) => family === 0 ? radius * 1.2 : family === 2 ? radius * 1.12 + 4.4 : radius;

export function planSunsetConduit(config: ConduitConfig, margin = 150) {
  const seed = Math.floor(config.seed);
  const x0 = config.offsetX - config.sizeX / 2 - margin, x1 = config.offsetX + config.sizeX / 2 + margin;
  const z0 = config.offsetZ - config.sizeZ / 2 - margin, z1 = config.offsetZ + config.sizeZ / 2 + margin;
  const towers: ConduitTower[] = [], podiums: ConduitPodium[] = [], hubs: ConduitHub[] = [];
  const ramps: ConduitRamp[] = [], bridges: ConduitBridge[] = [], vehicles: ConduitVehicle[] = [];
  const skyline = clamp(config.conduitSkyline, 90, 190);

  for (let i = Math.floor(x0 / PITCH - 0.5) - 1; i <= Math.ceil(x1 / PITCH) + 1; i++) {
    for (let j = Math.floor(z0 / PITCH) - 1; j <= Math.ceil(z1 / PITCH) + 1; j++) {
      const hub = hubAt(i, j, config);
      if (hub && hub.x > x0 - 60 && hub.x < x1 + 60 && hub.z > z0 - 60 && hub.z < z1 + 60) { hubs.push(hub); ramps.push(...hubRamps(hub, config)); }
    }
  }

  const lots = new Map<string, ConduitTower | ConduitPodium>();
  for (let a = Math.floor(x0 / LOT); a <= Math.ceil(x1 / LOT); a++) {
    for (let b = Math.floor(z0 / LOT); b <= Math.ceil(z1 / LOT); b++) {
      const r = (s: number) => hash(a, b, s, seed), id = `${a}:${b}`;
      const cx = Math.round((a + 0.5) * LOT + STREET / 2 + (r(1) - 0.5) * 6);
      const cz = Math.round((b + 0.5) * LOT + STREET / 2 + (r(2) - 0.5) * 6);
      const district = conduitDistrict(cx, cz, config);
      if (r(3) > 0.2 + 0.8 * config.conduitDensity) {
        const clear = conduitClearance(cx, cz, 20, config);
        const park: ConduitPodium = { id, a, b, x: cx, z: cz, w: 34, d: 34, height: 4 * (2 + Math.floor(r(4) * 2)), tiers: 0, kind: 'terrace', underTube: !clear.tall };
        podiums.push(park); lots.set(id, park); continue;
      }
      const pick = r(5), family = pick < 0.26 ? 0 : pick < 0.45 ? 1 : pick < 0.65 ? 2 : pick < 0.78 ? 3 : 4;
      const radius = [9 + r(6) * 3.4, 11.5 + r(6) * 2.5, 8.6 + r(6) * 2.4, 11 + r(6) * 1.4, 11 + r(6) * 2.6][family];
      const reach = towerReach(family, radius), clear = conduitClearance(cx, cz, reach, config);
      if (r(7) < 0.3 + 0.62 * district + 0.08 * config.conduitDensity && clear.tall) {
        const hero = r(8) < 0.1 + district * 0.08;
        const height = Math.round(hero ? skyline * (0.92 + r(9) * 0.08) : clamp(skyline * (0.46 + 0.36 * district + 0.24 * r(9)), 64, skyline));
        const tower: ConduitTower = {
          id, a, b, x: cx, z: cz, base: 2, height, family, radius, reach,
          spin: r(10) * Math.PI * 2, twist: (r(11) < 0.5 ? -1 : 1) * (0.55 + r(12) * 0.6) * config.conduitTwist,
          palette: family === 2 && r(13) < 0.65 ? 3 : Math.floor(r(14) * PALETTES.length),
          holo: (family === 1 || family === 4 || family === 0) && r(15) < config.conduitHolo * 0.55,
        };
        towers.push(tower); lots.set(id, tower);
      } else {
        const underTube = !clear.tall;
        const height = Math.floor(Math.min(clear.limit - (underTube ? 8 : 2), 12 + r(16) * 24));
        const p: ConduitPodium = height >= 8
          ? { id, a, b, x: cx, z: cz, w: 22 + Math.floor(r(17) * 12), d: 22 + Math.floor(r(18) * 12), height, tiers: 1 + Math.floor(r(19) * 3), kind: 'podium', underTube }
          : { id, a, b, x: cx, z: cz, w: 34, d: 34, height: 4, tiers: 0, kind: 'terrace', underTube };
        podiums.push(p); lots.set(id, p);
      }
    }
  }

  // High truss skybridges between neighbouring supertalls, above every conduit tier.
  const links = new Map<string, number>();
  const sorted = [...towers].sort((p, q) => p.id.localeCompare(q.id));
  for (let m = 0; m < sorted.length; m++) for (let n = m + 1; n < sorted.length; n++) {
    const p = sorted[m], q = sorted[n], dist = Math.hypot(p.x - q.x, p.z - q.z);
    if (dist < 30 || dist > 84 || Math.min(p.height, q.height) < 124) continue;
    if (hash(p.a * 31 + q.a, p.b * 17 + q.b, 140, seed) > config.conduitBridges * 0.62) continue;
    if ((links.get(p.id) ?? 0) >= 2 || (links.get(q.id) ?? 0) >= 2) continue;
    const y = Math.round(clamp(Math.min(p.height, q.height) * (0.6 + hash(p.a, q.b, 141, seed) * 0.16), 114, Math.min(p.height, q.height) - 10));
    const blocked = towers.some(o => {
      if (o === p || o === q) return false;
      const t = clamp(((o.x - p.x) * (q.x - p.x) + (o.z - p.z) * (q.z - p.z)) / (dist * dist));
      return Math.hypot(o.x - p.x - (q.x - p.x) * t, o.z - p.z - (q.z - p.z) * t) < o.reach + 5 && o.height + 20 > y;
    });
    if (blocked) continue;
    links.set(p.id, (links.get(p.id) ?? 0) + 1); links.set(q.id, (links.get(q.id) ?? 0) + 1);
    bridges.push({ id: `${p.id}>${q.id}`, kind: 'truss', a: { x: p.x, y, z: p.z }, b: { x: q.x, y, z: q.z }, width: 3 });
  }
  // Garden skybridges join neighbouring podium roofs below the conduits.
  for (const p of podiums) {
    if (p.kind !== 'podium') continue;
    for (const [da, db] of [[1, 0], [0, 1]]) {
      const q = lots.get(`${p.a + da}:${p.b + db}`);
      if (!q || !('kind' in q) || q.kind !== 'podium' || Math.min(p.height, q.height) < 12) continue;
      if (hash(p.a * 7 + da, p.b * 5 + db, 150, seed) > config.conduitBridges * 0.55) continue;
      const y = Math.min(p.height, q.height) - 3;
      if (da) {
        const lo = Math.max(p.z - p.d / 2, q.z - q.d / 2) + 7, hi = Math.min(p.z + p.d / 2, q.z + q.d / 2) - 7;
        if (hi - lo < 1) continue;
        const z = Math.round((lo + hi) / 2);
        bridges.push({ id: `${p.id}+x`, kind: 'garden', a: { x: p.x, y, z }, b: { x: q.x, y, z }, width: 5 });
      } else {
        const lo = Math.max(p.x - p.w / 2, q.x - q.w / 2) + 7, hi = Math.min(p.x + p.w / 2, q.x + q.w / 2) - 7;
        if (hi - lo < 1) continue;
        const x = Math.round((lo + hi) / 2);
        bridges.push({ id: `${p.id}+z`, kind: 'garden', a: { x, y, z: p.z }, b: { x, y, z: q.z }, width: 5 });
      }
    }
  }

  // Flying vehicles cruise in the open air above the conduit tiers.
  for (let u = Math.floor(x0 / 52); u <= Math.ceil(x1 / 52); u++) for (let v = Math.floor(z0 / 52); v <= Math.ceil(z1 / 52); v++) {
    const r = (s: number) => hash(u, v, s, seed);
    if (r(160) > config.conduitTraffic * 0.6) continue;
    const x = Math.round(((u + 0.5) * 52 + (r(161) - 0.5) * 34) * 8) / 8;
    const z = Math.round(((v + 0.5) * 52 + (r(162) - 0.5) * 34) * 8) / 8;
    const y = Math.round(112 + r(163) * Math.max(10, skyline - 112) * 0.75);
    if (towers.some(t => Math.hypot(t.x - x, t.z - z) < t.reach + 6 && y < t.base + t.height + 26)) continue;
    if (bridges.some(br => br.kind === 'truss' && Math.abs(br.a.y - y) < 6 && Math.min(Math.hypot(br.a.x - x, br.a.z - z), Math.hypot(br.b.x - x, br.b.z - z)) < 50)) continue;
    vehicles.push({ id: `${u}:${v}`, x, y, z, heading: Math.floor(r(164) * 8) * Math.PI / 4 + (r(165) - 0.5) * 0.4, tone: Math.floor(r(166) * 3) });
  }
  return { towers, podiums, hubs, ramps, bridges, vehicles };
}

// ---------------------------------------------------------------------------
// Voxel generation
// ---------------------------------------------------------------------------

export function generateSunsetConduit(config: ConduitConfig) {
  const width = Math.max(1, Math.floor(config.sizeX)), depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff))), seed = Math.floor(config.seed);
  const ox = Math.floor(config.offsetX - width / 2), oz = Math.floor(config.offsetZ - depth / 2), layer = width * depth;
  const cells = new Uint16Array(layer * ceiling), heights = new Float32Array(layer);
  const palette = [{ color: 0, emission: 0 }], ids = new Map<number, number>(), micros = new Map<number, ConduitVoxel>();
  const voxels: ConduitVoxel[] = [];
  const plan = planSunsetConduit(config, 150);
  const gardens = clamp(config.conduitGardens), lights = clamp(config.conduitLights);

  const near = (x: number, z: number, rx: number, rz = rx) => x + rx >= ox && x - rx < ox + width && z + rz >= oz && z - rz < oz + depth;
  const material = (color: number, emission = 0) => {
    // Quantised emission keeps the palette (and output) independent of draw order.
    emission = Math.round(Math.min(2.5, emission) * 50) / 50;
    const key = color * 128 + Math.round(emission * 50), old = ids.get(key); if (old) return old;
    const id = palette.length; ids.set(key, id); palette.push({ color, emission }); return id;
  };
  const get = (x: number, y: number, z: number) => x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < ceiling ? cells[x + z * width + y * layer] : 0;
  /** Writes one global 1m cell. */
  const put = (x: number, y: number, z: number, id: number) => {
    const lx = x - ox, lz = z - oz;
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || y < 0 || y >= ceiling) return;
    cells[lx + lz * width + y * layer] = id;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, emission = 0) => {
    const x0 = Math.max(0, Math.floor(x) - ox), x1 = Math.min(width, Math.floor(x + w) - ox);
    const z0 = Math.max(0, Math.floor(z) - oz), z1 = Math.min(depth, Math.floor(z + d) - oz);
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(ceiling, Math.floor(y + h));
    if (x0 >= x1 || z0 >= z1 || y0 >= y1) return;
    const id = material(color, emission);
    for (let iy = y0; iy < y1; iy++) for (let iz = z0; iz < z1; iz++) cells.fill(id, x0 + iz * width + iy * layer, x1 + iz * width + iy * layer);
  };
  const micro = (x: number, y: number, z: number, color: number, emission = 0) => {
    x = Math.round(x * 8) / 8; y = Math.round(y * 8) / 8; z = Math.round(z * 8) / 8;
    if (x < ox || z < oz || x + M > ox + width || z + M > oz + depth || y < 0 || y + M > ceiling) return;
    const key = (x - ox) * 8 + (z - oz) * width * 64 + y * layer * 512;
    micros.set(key, { x: x + M / 2 - ox - width / 2, y, z: z + M / 2 - oz - depth / 2,
      sizeX: M, sizeY: M, sizeZ: M, color, material: emission > 0 ? 'emissive' : 'normal', emissive: emission > 0, intensity: emission });
  };
  const line = (a: ConduitPoint, b: ConduitPoint, color: number, emission = 0, thick = 1) => {
    if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(a.x - b.x) / 2 + 1, Math.abs(a.z - b.z) / 2 + 1)) return;
    const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)) * 8);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      for (let dx = 0; dx < thick; dx++) for (let dy = 0; dy < thick; dy++) micro(x + dx * M, y + dy * M, z, color, emission);
    }
  };
  /** Solid 1m-cell capsule. */
  const capsule = (a: ConduitPoint, b: ConduitPoint, r: number, color: number, emission = 0) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz || 1;
    if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(dx) / 2 + r + 1, Math.abs(dz) / 2 + r + 1)) return;
    const id = material(color, emission);
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - r)); y < Math.min(ceiling, Math.max(a.y, b.y) + r); y++) {
      for (let z = Math.floor(Math.min(a.z, b.z) - r); z < Math.max(a.z, b.z) + r; z++) {
        for (let x = Math.floor(Math.min(a.x, b.x) - r); x < Math.max(a.x, b.x) + r; x++) {
          const t = clamp(((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy + (z + 0.5 - a.z) * dz) / l2);
          if ((x + 0.5 - a.x - dx * t) ** 2 + (y + 0.5 - a.y - dy * t) ** 2 + (z + 0.5 - a.z - dz * t) ** 2 <= r * r) put(x, y, z, id);
        }
      }
    }
  };
  const blob = (cx: number, cy: number, cz: number, rx: number, ry: number, color: number) => {
    if (!near(cx, cz, rx + 1)) return;
    const id = material(color);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rx); z <= cz + rx; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rx) ** 2 <= 1) put(x, y, z, id);
    }
  };
  const tree = (x: number, y: number, z: number, size: number, salt: number) => {
    const tone = hash(x, z, salt, seed), leaf = tone < 0.12 ? C.blossom : tone < 0.45 ? C.leafA : tone < 0.78 ? C.leafB : C.leafC;
    const trunk = Math.max(1, Math.round(size * 0.8));
    box(x, y, z, 1, trunk, 1, C.trunk);
    blob(x + 0.5, y + trunk + size * 0.55, z + 0.5, size, size * 0.8, leaf);
    if (size > 1.8) blob(x + 0.5 + (tone - 0.5) * 2, y + trunk + size * 1.15, z + 0.5, size * 0.62, size * 0.55, leaf === C.blossom ? C.leafB : leaf);
  };

  // --- Ground: dark streets on the lot lattice, paved plinths, street lamps. ---
  {
    const asphalt = material(C.asphalt), lane = material(C.lane), curb = material(C.curb);
    const paving = material(C.paving), pavingAlt = material(C.pavingAlt);
    for (let lz = 0; lz < depth; lz++) for (let lx = 0; lx < width; lx++) {
      const wx = lx + ox, wz = lz + oz, mx = mod(wx, LOT), mz = mod(wz, LOT);
      const street = mx < STREET || mz < STREET;
      const i = lx + lz * width;
      if (street) {
        const marking = (mx === 2 && mz >= STREET && mod(wz, 6) < 3) || (mz === 2 && mx >= STREET && mod(wx, 6) < 3);
        cells[i] = marking ? lane : asphalt;
      } else {
        cells[i] = asphalt;
        if (ceiling > 1) cells[i + layer] = mx === STREET || mz === STREET || mx === LOT - 1 || mz === LOT - 1 ? curb : hash(wx >> 1, wz >> 1, 20, seed) < 0.5 ? paving : pavingAlt;
      }
    }
    for (let a = Math.floor(ox / LOT); a <= Math.ceil((ox + width) / LOT); a++) for (let b = Math.floor(oz / LOT); b <= Math.ceil((oz + depth) / LOT); b++) {
      for (const [px, pz] of [[a * LOT + STREET + 0.5, b * LOT + 14.5], [a * LOT + STREET + 0.5, b * LOT + 32.5], [a * LOT + 14.5, b * LOT + STREET + 0.5], [a * LOT + 32.5, b * LOT + STREET + 0.5]]) {
        if (!near(px, pz, 2)) continue;
        line({ x: px, y: 2, z: pz }, { x: px, y: 5.5, z: pz }, C.steel, 0, 2);
        for (const [dx, dz] of [[0, 0], [M, 0], [0, M], [M, M]]) micro(px + dx, 5.625, pz + dz, 0xffcf8a, 1.1);
      }
    }
  }

  // --- Conduit pylons (drawn first so podiums can enclose them). ---
  const pylon = (p: ConduitPoint, r: number, across: { x: number; z: number }) => {
    if (!near(p.x, p.z, 8)) return;
    const top = p.y - r, x = Math.floor(p.x), z = Math.floor(p.z);
    box(x - 2, 1, z - 2, 5, 2, 5, C.parapet);
    box(x - 1, 1, z - 1, 3, Math.max(0, top - 10), 3, C.pylon);
    for (const s of [-1, 1]) capsule({ x: x + 0.5, y: top - 9, z: z + 0.5 }, { x: x + 0.5 + across.x * s * (r - 0.6), y: top - 0.5, z: z + 0.5 + across.z * s * (r - 0.6) }, 0.95, C.pylon);
    box(x - 1, top - 10, z - 1, 3, 1, 3, C.chromeBright, 0);
  };
  const nodeNear = (v: number, offset: number) => Math.abs(mod(v / PITCH - offset + 0.5, 1) - 0.5) * PITCH < 22;
  for (let j = Math.floor(oz / PITCH) - 1; j <= Math.ceil((oz + depth) / PITCH) + 1; j++) {
    const ln = conduitXLine(j, config); if (!ln.present) continue;
    for (let x = Math.floor((ox - 10) / 44) * 44; x <= ox + width + 10; x += 44) if (!nodeNear(x, 0.5)) pylon(conduitXPath(j, x, config), ln.radius, { x: 0, z: 1 });
  }
  for (let i = Math.floor(ox / PITCH) - 1; i <= Math.ceil((ox + width) / PITCH) + 1; i++) {
    const ln = conduitZLine(i, config); if (!ln.present) continue;
    for (let z = Math.floor((oz - 10) / 44) * 44; z <= oz + depth + 10; z += 44) if (!nodeNear(z, 0)) pylon(conduitZPath(i, z, config), ln.radius, { x: 1, z: 0 });
  }
  for (const ramp of plan.ramps) for (let k = 24; k <= 72; k += 24) pylon(ramp.points[k], ramp.radius, { x: 1, z: 0 });

  // --- Podiums with stepped roof gardens, and terraced green parks. ---
  const slab = material(C.slab), parapet = material(C.parapet), glassP = material(C.podiumGlass), grass = material(C.grass), grassAlt = material(C.grassAlt);
  const hedge = material(C.hedge), roofPath = material(C.paving);
  for (const p of plan.podiums) {
    if (!near(p.x, p.z, p.w / 2 + 6, p.d / 2 + 6)) continue;
    const r = (s: number) => hash(p.a, p.b, s, seed);
    if (p.kind === 'terrace') {
      const levels = Math.max(1, Math.round(p.height / 4));
      for (let k = 0; k < levels; k++) {
        const hw = 16 - k * 5, hd = 16 - k * 4 - Math.round(r(30) * 2), top = 2 + (k + 1) * 4;
        if (hw < 4 || hd < 4) break;
        const x0 = p.x - hw, z0 = p.z - hd;
        box(x0, 2, z0, hw * 2, top - 2, hd * 2, C.warmWhite);
        box(x0 + 1, top - 1, z0 + 1, hw * 2 - 2, 1, hd * 2 - 2, (k & 1) ? C.grassAlt : C.grass);
        for (let s = 0; s < hw * 2; s += 2) { box(x0 + s, top - 1, z0, 1, 2, 1, C.hedge); box(x0 + s, top - 1, z0 + hd * 2 - 1, 1, 2, 1, C.hedge); }
        line({ x: x0, y: top - 1.5, z: z0 - M }, { x: x0 + hw * 2, y: top - 1.5, z: z0 - M }, 0xffd8a0, 0.7);
        line({ x: x0, y: top - 1.5, z: z0 + hd * 2 }, { x: x0 + hw * 2, y: top - 1.5, z: z0 + hd * 2 }, 0xffd8a0, 0.7);
        const trees = Math.floor((hw * hd) / 34 * gardens);
        for (let t = 0; t < trees; t++) {
          const tx = Math.floor(x0 + 2 + r(40 + t * 3) * (hw * 2 - 4)), tz = Math.floor(z0 + 2 + r(41 + t * 3) * (hd * 2 - 4));
          tree(tx, top, tz, 1.4 + r(42 + t * 3) * 1.3, 43 + t);
        }
      }
      continue;
    }
    // Podium tiers: white floor plates alternate with lit glass bands.
    const tiers = Math.min(p.tiers, Math.max(1, Math.floor(p.height / 8)));
    let y = 2;
    for (let k = 0; k < tiers; k++) {
      const inset = k * 3, w = p.w - inset * 2, d = p.d - inset * 2;
      if (w < 8 || d < 8) break;
      const h = k === tiers - 1 ? 2 + p.height - y : Math.max(4, Math.round((p.height - 2) / tiers));
      const x0 = Math.round(p.x - w / 2), z0 = Math.round(p.z - d / 2), top = y + h - 1;
      for (let yy = y; yy <= top && yy < ceiling; yy++) {
        const plate = (yy - 2) % 4 === 0;
        for (let lz = z0; lz < z0 + d; lz++) for (let lx = x0; lx < x0 + w; lx++) {
          const edge = lx === x0 || lx === x0 + w - 1 || lz === z0 || lz === z0 + d - 1;
          let id = slab;
          if (yy === top) {
            const path = lx === Math.floor(p.x) || lz === Math.floor(p.z);
            id = edge ? parapet : path ? roofPath : (gardens > 0.05 ? (hash(lx, lz, 31, seed) < 0.5 ? grass : grassAlt) : roofPath);
          } else if (edge && !plate) {
            const lit = hash(lx >> 1, (lz >> 1) + yy * 97, 32, seed) < lights * 0.55;
            id = lit ? material(WINDOW_LIGHTS[Math.floor(hash(lx >> 1, (lz >> 1) + yy * 97, 33, seed) * 3)], 0.45 + hash(lx >> 1, yy, 34, seed) * 0.25) : glassP;
          }
          put(lx, yy, lz, id);
        }
      }
      // Hedges along the parapet and gardens on this roof tier.
      for (let s = x0 + 1; s < x0 + w - 1; s += 1) if (hash(s, z0, 35, seed) < gardens * 0.8) { put(s, top + 1, z0 + 1, hedge); put(s, top + 1, z0 + d - 2, hedge); }
      for (let s = z0 + 1; s < z0 + d - 1; s += 1) if (hash(x0, s, 36, seed) < gardens * 0.8) { put(x0 + 1, top + 1, s, hedge); put(x0 + w - 2, top + 1, s, hedge); }
      const trees = k === tiers - 1 ? Math.floor((w * d) / 60 * gardens) : 0;
      for (let t = 0; t < trees; t++) {
        const tx = Math.floor(x0 + 3 + r(50 + t * 3) * (w - 6)), tz = Math.floor(z0 + 3 + r(51 + t * 3) * (d - 6));
        if (Math.abs(tx - Math.floor(p.x)) < 3 || Math.abs(tz - Math.floor(p.z)) < 3) continue;
        tree(tx, top + 1, tz, 1.3 + r(52 + t * 3) * 1.4, 53 + t);
      }
      y = top + 1;
    }
  }

  // --- Supertalls. ---
  const shape = (t: ConduitTower, lx: number, lz: number, y: number) => {
    const h = t.height, k = y - t.base, f = k / h;
    if (t.family === 0) {
      if (k >= h) { const rr = t.radius * 0.5 * (1 - (k - h) / 15); return rr > 0.5 && lx * lx + lz * lz <= rr * rr ? 2 : 0; }
      const a = t.radius * (1 - 0.3 * f), rot = t.spin + t.twist * 1.8 * f, c = Math.cos(rot), s = Math.sin(rot);
      const u = (lx * c + lz * s) / a, v = (lz * c - lx * s) / a;
      if (u ** 4 + v ** 4 > 1) return 0;
      return Math.abs(u) > 0.76 && Math.abs(v) > 0.76 ? 2 : 1;
    }
    if (t.family === 1) {
      if (k >= h) return k - h < 24 && lx * lx + lz * lz < 1.2 ? 2 : 0;
      const taper = 1 - 0.66 * f ** 1.6, a = Math.max(1.2, t.radius * taper), b = Math.max(1, t.radius * 0.6 * taper);
      const rot = t.spin + t.twist * 0.5 * f, c = Math.cos(rot), s = Math.sin(rot);
      const u = (lx * c + lz * s) / a, v = (lz * c - lx * s) / b;
      if (u * u + v * v > 1) return 0;
      return Math.abs(u) > 0.87 ? 2 : 1;
    }
    if (t.family === 2) {
      const sway = Math.sin(f * Math.PI * 1.3 + t.spin) * t.twist * 2.4, x = lx - sway;
      const rr = t.radius * (0.84 + 0.26 * Math.sin(Math.PI * Math.min(1, f * 1.08))) * (1 - 0.22 * Math.min(1, f));
      if (k >= h) { const cap = rr * Math.sqrt(Math.max(0, 1 - ((k - h + 1) / 7) ** 2)); return x * x + lz * lz <= cap * cap ? 2 : 0; }
      const band = k % 5 === 0, d2 = x * x + lz * lz;
      if (band) return d2 <= (rr + 1.4) ** 2 ? 2 : 0;
      return d2 <= rr * rr ? 1 : 0;
    }
    if (t.family === 3) {
      const rc = t.radius - 4.4, d = Math.hypot(lx, lz);
      if (k >= h) { const cap = (rc + 2) * Math.sqrt(Math.max(0, 1 - ((k - h + 1) / 6) ** 2)); return d <= cap ? 2 : 0; }
      if (d <= rc) return 1;
      if (d > rc + 4.6) return 0;
      const phi = Math.atan2(lz, lx), turn = (Math.PI * 2 * k) / 70 * (t.twist < 0 ? -1 : 1);
      for (let q = 0; q < 2; q++) {
        if (Math.abs(wrapAngle(phi - t.spin - q * Math.PI - turn)) < 0.36) {
          if (d > rc + 3.2) return 2;
          if (k % 4 === 0) return 3;
          if (k % 4 === 1 && hash(Math.floor(lx * 3), Math.floor(lz * 3) + k * 7, 70, seed) < gardens * 0.85) return 4;
          return 0;
        }
      }
      return k % 12 === 0 && d <= rc + 1.6 ? 3 : 0;
    }
    // Crescent sail with a sloping crown.
    const rr = t.radius * (1 - 0.28 * f), rot = t.spin + t.twist * 0.8 * f, c = Math.cos(rot), s = Math.sin(rot);
    const u = lx * c + lz * s, v = lz * c - lx * s;
    if (u * u + v * v > rr * rr) return 0;
    const cu = rr * 0.56, r2 = rr * 0.8, inner = (u - cu) ** 2 + v * v;
    if (inner <= r2 * r2) return 0;
    if (k > h - 24 * (1 - (v + rr) / (2 * rr))) return 0;
    return inner <= (r2 + 1.3) ** 2 ? 2 : 1;
  };
  const crownExtra = [16, 25, 7, 6, 0];
  for (const t of plan.towers) {
    if (!near(t.x, t.z, t.reach + 3)) continue;
    const pal = PALETTES[t.palette], ext = Math.ceil(t.reach + 2.5), span = ext * 2 + 1;
    let cur = new Uint8Array(span * span), next = new Uint8Array(span * span);
    const fillMask = (mask: Uint8Array, y: number) => {
      for (let dz = -ext; dz <= ext; dz++) for (let dx = -ext; dx <= ext; dx++) mask[(dx + ext) + (dz + ext) * span] = shape(t, dx, dz, y);
    };
    const yTop = Math.min(ceiling, t.base + t.height + crownExtra[t.family]);
    fillMask(cur, t.base);
    const frame = material(pal.frame), glass = material(pal.glass), alt = material(pal.alt), spandrel = material(pal.spandrel);
    const terrace = material(C.slab), roof = material(C.roofDark);
    const crownGlow = material(0xd8ecff, 0.65);
    for (let y = t.base; y < yTop; y++) {
      fillMask(next, y + 1);
      const k = y - t.base;
      for (let dz = -ext; dz <= ext; dz++) for (let dx = -ext; dx <= ext; dx++) {
        const i = (dx + ext) + (dz + ext) * span, code = cur[i];
        if (!code) continue;
        const wx = Math.floor(t.x) + dx, wz = Math.floor(t.z) + dz;
        const edge = dx === -ext || dx === ext || dz === -ext || dz === ext || !cur[i - 1] || !cur[i + 1] || !cur[i - span] || !cur[i + span];
        let id: number;
        if (code === 2) id = frame;
        else if (code === 3) id = terrace;
        else if (code === 4) id = material(hash(wx, wz + k, 71, seed) < 0.12 ? C.blossom : hash(wx, wz, 72 + k, seed) < 0.5 ? C.leafA : C.leafB);
        else if (!next[i] && k >= t.height - 1) id = (t.family === 0 || t.family === 1) && edge ? crownGlow : roof;
        else if (!edge) id = glass;
        else if (k % 4 === 0) id = spandrel;
        else {
          const gx = wx >> 1, gz = (wz >> 1) + (k >> 2) * 173;
          const lit = k % 4 !== 3 && hash(gx, gz, 73 + t.family, seed) < lights * 0.4;
          id = lit ? material(WINDOW_LIGHTS[Math.floor(hash(gx, gz, 74, seed) * 4)], 0.4 + hash(gz, gx, 75, seed) * 0.3)
            : hash(wx, wz + (k >> 2), 76, seed) < 0.55 ? glass : alt;
        }
        put(wx, y, wz, id);
      }
      const swap = cur; cur = next; next = swap;
    }
    // Spire tips carry aviation beacons.
    if (t.family === 0 || t.family === 1) {
      const top = t.base + t.height + crownExtra[t.family];
      line({ x: Math.floor(t.x) + 0.4375, y: top, z: Math.floor(t.z) + 0.4375 }, { x: Math.floor(t.x) + 0.4375, y: top + 5, z: Math.floor(t.z) + 0.4375 }, C.steel, 0, 2);
      micro(Math.floor(t.x) + 0.4375, top + 5.25, Math.floor(t.z) + 0.4375, 0xff4a3a, 1.4);
      micro(Math.floor(t.x) + 0.5625, top + 5.25, Math.floor(t.z) + 0.4375, 0xff4a3a, 1.4);
    }
    // Holographic billboard panels hover off the façade on chrome struts.
    if (t.holo) {
      const sunA = Math.atan2(-CONDUIT_SUN.z, -CONDUIT_SUN.x), psi = sunA + (hash(t.a, t.b, 80, seed) - 0.5) * 1.3;
      const dir = { x: Math.cos(psi), z: Math.sin(psi) }, perp = { x: -dir.z, z: dir.x };
      const y0 = Math.round(t.base + t.height * (0.32 + hash(t.a, t.b, 81, seed) * 0.2)), ph = 15, pw = 10;
      const off = t.reach * (t.family === 1 ? 0.92 : 0.95) + 1.5;
      const cx = t.x + 0.5 + dir.x * off, cz = t.z + 0.5 + dir.z * off;
      const hue = hash(t.a, t.b, 82, seed);
      for (let yy = 0; yy < ph; yy++) for (let s = -pw / 2; s <= pw / 2; s += 0.5) {
        const px = Math.floor(cx + perp.x * s), pz = Math.floor(cz + perp.z * s);
        const rim = yy === 0 || yy === ph - 1 || Math.abs(s) >= pw / 2 - 0.25;
        if (rim) { put(px, y0 + yy, pz, frame); continue; }
        const g = clamp(yy / ph + Math.sin(s * 0.9 + yy * 0.45) * 0.12);
        const col = hue < 0.5
          ? (g < 0.33 ? 0xff4fc8 : g < 0.66 ? 0xa45cff : 0x4fd9ff)
          : (g < 0.33 ? 0x4fe6ff : g < 0.66 ? 0x6b8cff : 0xff6ad5);
        const ring = Math.hypot(s * 1.1, yy - ph * 0.55) < 3.2 && Math.hypot(s * 1.1, yy - ph * 0.55) > 2.2;
        put(px, y0 + yy, pz, material(ring ? 0xfff2fb : col, ring ? 1.1 : 0.8));
      }
      for (const s of [-pw / 2 + 1, pw / 2 - 1]) for (const yy of [2, ph - 3]) {
        line({ x: cx + perp.x * s, y: y0 + yy + 0.5, z: cz + perp.z * s }, { x: t.x + 0.5 + dir.x * (off - 3) + perp.x * s, y: y0 + yy + 0.5, z: t.z + 0.5 + dir.z * (off - 3) + perp.z * s }, C.chrome, 0, 2);
      }
    }
  }

  // --- Hub stations. ---
  for (const hub of plan.hubs) {
    if (!near(hub.x, hub.z, 16)) continue;
    const hx = Math.floor(hub.x), hz = Math.floor(hub.z), top = hub.levels[1] + 18;
    const hubGlass = material(C.hubGlass), rib = material(C.chrome), ring = material(0xbfe9ff, 0.75);
    const disc = material(C.chromeBright), under = material(C.hubDark), band = material(0xc6f1ff, 0.9);
    box(hx - 13, 1, hz - 13, 27, 2, 27, C.warmWhite);
    for (let y = 2; y < Math.min(ceiling, top); y++) for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dz); if (d > 5.6) continue;
      const outer = d > 4.6, phi = Math.atan2(dz, dx);
      const isRib = Math.abs(wrapAngle(phi * 4)) < 0.5;
      put(hx + dx, y, hz + dz, outer && y % 10 === 0 ? ring : outer && isRib ? rib : hubGlass);
    }
    blob(hx + 0.5, top, hz + 0.5, 6.4, 3.6, C.chromeBright);
    blob(hx + 0.5, top + 3, hz + 0.5, 3.2, 3, C.chrome);
    line({ x: hx + 0.4375, y: top + 3, z: hz + 0.4375 }, { x: hx + 0.4375, y: top + 12, z: hz + 0.4375 }, C.steel, 0, 2);
    micro(hx + 0.4375, top + 12.25, hz + 0.4375, 0xff4a3a, 1.4);
    for (const level of hub.levels) {
      for (let dy = -6; dy <= 6; dy++) for (let dz = -13; dz <= 13; dz++) for (let dx = -13; dx <= 13; dx++) {
        const d = Math.hypot(dx, dz); if (d > 12.8) continue;
        const half = 5.4 * Math.sqrt(Math.max(0, 1 - (d / 12.8) ** 2)), cy = dy + 0.5;
        if (Math.abs(cy) > half) continue;
        const shell = Math.abs(cy) > half - 1.2 || d > 11.6;
        put(hx + dx, level + dy, hz + dz, !shell ? under : Math.abs(cy) < 0.9 && d > 9 ? band : cy > 0 ? disc : under);
      }
    }
  }

  // --- Conduits: chrome-collared glass tubes. ---
  const tubeTop = material(C.tubeTop), tubeSide = material(C.tubeSide), keel = material(C.tubeKeel), core = material(C.tubeCore);
  const flange = material(C.chromeBright), collarGlow = material(0xe2f4ff, 0.75);
  const tubeSeg = (a: ConduitPoint, b: ConduitPoint, sa: number, sb: number, R: number) => {
    const pad = R + 1.1, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz || 1;
    if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(dx) / 2 + pad + 1, Math.abs(dz) / 2 + pad + 1)) return;
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad)); y < Math.min(ceiling, Math.max(a.y, b.y) + pad); y++) {
      for (let z = Math.floor(Math.min(a.z, b.z) - pad); z < Math.max(a.z, b.z) + pad; z++) {
        for (let x = Math.floor(Math.min(a.x, b.x) - pad); x < Math.max(a.x, b.x) + pad; x++) {
          // Only the segment's own slab (plus a hairline overlap) is painted, so the
          // next segment never repaints collar bands with a clamped parameter.
          const raw = ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy + (z + 0.5 - a.z) * dz) / l2;
          if (raw < -0.04 || raw > 1.04) continue;
          const t = clamp(raw);
          const wx = x + 0.5 - a.x - dx * t, wy = y + 0.5 - a.y - dy * t, wz = z + 0.5 - a.z - dz * t;
          const d = Math.sqrt(wx * wx + wy * wy + wz * wz); if (d > pad) continue;
          const m = mod(sa + (sb - sa) * t, 8);
          if (d > (m < 1 ? R + 1 : R)) continue;
          let id: number;
          if (d < R - 1.25) id = core;
          else if (m < 1) id = flange;
          else if (m < 2) id = collarGlow;
          else { const up = wy / (d || 1); id = up > 0.6 ? tubeTop : up < -0.62 ? keel : tubeSide; }
          put(x, y, z, id);
        }
      }
    }
  };
  for (let j = Math.floor(oz / PITCH) - 1; j <= Math.ceil((oz + depth) / PITCH) + 1; j++) {
    const ln = conduitXLine(j, config); if (!ln.present) continue;
    let prev = conduitXPath(j, ox - 8, config);
    for (let x = ox - 7; x <= ox + width + 8; x++) { const p = conduitXPath(j, x, config); tubeSeg(prev, p, x - 1, x, ln.radius); prev = p; }
  }
  for (let i = Math.floor(ox / PITCH) - 1; i <= Math.ceil((ox + width) / PITCH) + 1; i++) {
    const ln = conduitZLine(i, config); if (!ln.present) continue;
    let prev = conduitZPath(i, oz - 8, config);
    for (let z = oz - 7; z <= oz + depth + 8; z++) { const p = conduitZPath(i, z, config); tubeSeg(prev, p, z - 1, z, ln.radius); prev = p; }
  }
  for (const ramp of plan.ramps) {
    let s = 0;
    for (let k = 1; k < ramp.points.length; k++) {
      const a = ramp.points[k - 1], b = ramp.points[k], l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      tubeSeg(a, b, s, s + l, ramp.radius); s += l;
    }
  }

  // --- Skybridges. ---
  for (const br of plan.bridges) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, len = Math.hypot(dx, dz);
    if (!near((br.a.x + br.b.x) / 2, (br.a.z + br.b.z) / 2, Math.abs(dx) / 2 + 6, Math.abs(dz) / 2 + 6)) continue;
    const ux = dx / len, uz = dz / len, px = -uz, pz = ux, half = Math.floor(br.width / 2);
    if (br.kind === 'truss') {
      const deck = material(0xbfc6cf), chord = material(C.chrome), glow = material(0xffd9a6, 0.6);
      for (let s = 0; s <= len; s += 0.5) for (let w = -half - 1; w <= half + 1; w++) {
        const x = Math.floor(br.a.x + 0.5 + ux * s + px * w), z = Math.floor(br.a.z + 0.5 + uz * s + pz * w);
        const side = Math.abs(w) === half + 1;
        put(x, br.a.y, z, side ? chord : deck);
        if (side) put(x, br.a.y + 5, z, chord);
        if (!side && w === 0 && Math.round(s * 2) % 12 === 0) put(x, br.a.y - 1, z, glow);
      }
      for (const w of [-(half + 1), half + 1]) {
        for (let s = 0; s + 4 <= len; s += 4) {
          const ax = br.a.x + 0.5 + ux * s + px * w, az = br.a.z + 0.5 + uz * s + pz * w;
          const bx = br.a.x + 0.5 + ux * (s + 4) + px * w, bz = br.a.z + 0.5 + uz * (s + 4) + pz * w;
          const up = Math.floor(s / 4) % 2 === 0;
          line({ x: ax, y: br.a.y + (up ? 1 : 5), z: az }, { x: bx, y: br.a.y + (up ? 5 : 1), z: bz }, C.steel, 0, 3);
          line({ x: ax, y: br.a.y + 1, z: az }, { x: ax, y: br.a.y + 5, z: az }, C.steel, 0, 2);
        }
      }
    } else {
      const deck = material(C.warmWhite), soil = material(C.grass), shrub = material(C.hedge);
      for (let s = 0; s <= len; s += 0.5) for (let w = -half; w <= half; w++) {
        const x = Math.floor(br.a.x + 0.5 + ux * s + px * w), z = Math.floor(br.a.z + 0.5 + uz * s + pz * w);
        put(x, br.a.y, z, deck);
        if (Math.abs(w) === half) { put(x, br.a.y + 1, z, soil); if (hash(x, z, 90, seed) < gardens) put(x, br.a.y + 2, z, shrub); }
      }
      for (const w of [-(half - 1), half - 1]) {
        const a = { x: br.a.x + 0.5 + px * (w + Math.sign(w) * 0.375), y: br.a.y + 2.1, z: br.a.z + 0.5 + pz * (w + Math.sign(w) * 0.375) };
        line(a, { x: a.x + ux * len, y: a.y, z: a.z + uz * len }, C.chrome);
      }
      for (let s = 2; s < len - 1; s += 7) {
        const x = br.a.x + 0.5 + ux * s, z = br.a.z + 0.5 + uz * s;
        line({ x, y: br.a.y - 0.125, z }, { x: x + px * half, y: br.a.y - 0.125, z: z + pz * half }, 0xffd29a, 0.75);
      }
    }
  }

  // --- Flying vehicles. ---
  for (const v of plan.vehicles) {
    if (!near(v.x, v.z, 3)) continue;
    const fx = Math.cos(v.heading), fz = Math.sin(v.heading), sx = -fz, sz = fx;
    const body = [C.bodyWhite, 0xc7ccd3, 0x9aa6b4][v.tone];
    for (let a = -1.75; a <= 1.75; a += M) for (let b = -0.875; b <= 0.875; b += M) for (let c = 0; c <= 0.875; c += M) {
      const e = (a / 1.8) ** 2 + (b / 0.9) ** 2 + ((c - 0.3) / 0.55) ** 2;
      if (e > 1 || e < 0.55) continue;
      const x = v.x + fx * a + sx * b, z = v.z + fz * a + sz * b, y = v.y + c;
      let color = body, emission = 0;
      if (a < -1.45 && Math.abs(b) > 0.3) { color = 0xff5a3c; emission = 1.3; }
      else if (a > 1.45 && Math.abs(b) > 0.25) { color = 0xfff1d8; emission = 1.2; }
      else if (c > 0.45 && a > -0.6 && a < 0.9) color = C.canopy;
      else if (c < 0.13 && Math.abs(b) < 0.4) { color = 0x62e4ff; emission = 0.7; }
      micro(x, y, z, color, emission);
    }
  }

  // --- Emit exposed 1m cells, then visible micro cubes. ---
  const emit = (v: ConduitVoxel) => {
    voxels.push(v);
    const i = Math.floor(v.x + width / 2) + Math.floor(v.z + depth / 2) * width;
    heights[i] = Math.max(heights[i], v.y + v.sizeY);
  };
  let standardCount = 0, emissiveCount = 0;
  for (let y = 0; y < ceiling; y++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const id = cells[x + z * width + y * layer]; if (!id) continue;
    if (get(x - 1, y, z) && get(x + 1, y, z) && get(x, y - 1, z) && get(x, y + 1, z) && get(x, y, z - 1) && get(x, y, z + 1)) continue;
    const p = palette[id], emissive = p.emission > 0;
    emit({ x: x + 0.5 - width / 2, y, z: z + 0.5 - depth / 2, sizeX: 1, sizeY: 1, sizeZ: 1, color: p.color,
      material: emissive ? 'emissive' : 'normal', emissive, intensity: p.emission });
    standardCount++; if (emissive) emissiveCount++;
  }
  for (const v of micros.values()) {
    if (get(Math.floor(v.x + width / 2), Math.floor(v.y), Math.floor(v.z + depth / 2))) continue;
    emit(v); if (v.emissive) emissiveCount++;
  }

  // --- Cameras. ---
  const local = (p: ConduitPoint): ConduitPoint => ({ x: p.x - ox - width / 2, y: p.y, z: p.z - oz - depth / 2 });
  const sunLen = Math.hypot(CONDUIT_SUN.x, CONDUIT_SUN.z), sx = CONDUIT_SUN.x / sunLen, sz = CONDUIT_SUN.z / sunLen;
  const inside = (x: number, z: number, m: number) => x > ox + m && x < ox + width - m && z > oz + m && z < oz + depth - m;
  const hubs = plan.hubs.filter(h => inside(h.x, h.z, 20));
  const centre = { x: config.offsetX, z: config.offsetZ };
  const hero = [...hubs].sort((p, q) => Math.hypot(p.x - centre.x, p.z - centre.z) - Math.hypot(q.x - centre.x, q.z - centre.z))[0];
  const focus = hero ? { x: hero.x, z: hero.z } : centre;
  // Pick the least obstructed vantage on the anti-sun side, looking into the sunset.
  const blockedSamples = (a: ConduitPoint, b: ConduitPoint, skip?: ConduitTower) => {
    let hits = 0;
    for (let k = 0; k <= 32; k++) {
      const q = { x: a.x + (b.x - a.x) * k / 32, y: a.y + (b.y - a.y) * k / 32, z: a.z + (b.z - a.z) * k / 32 };
      if (plan.towers.some(t => t !== skip && Math.hypot(t.x - q.x, t.z - q.z) < t.reach + 3 && q.y < t.base + t.height + 8)) hits += k === 0 ? 40 : 1;
    }
    return hits;
  };
  const clearView = (focusX: number, focusZ: number, dist: number, y: number, target: ConduitPoint, skip?: ConduitTower): ConduitView => {
    let view: ConduitView | null = null, score = Infinity;
    for (const turn of [0.35, -0.35, 0.7, -0.7, 0, 1.05, -1.05, 1.4, -1.4]) {
      const c = Math.cos(turn), s = Math.sin(turn), dx = -(sx * c - sz * s), dz = -(sz * c + sx * s);
      const position = { x: focusX + dx * dist, y, z: focusZ + dz * dist };
      const v = blockedSamples(position, target, skip) + Math.abs(turn) * 0.8;
      if (v < score) { score = v; view = { position: local(position), target: local(target) }; }
    }
    return view!;
  };
  let overviewView: ConduitView | null = null, best = Infinity;
  const target = { x: focus.x + sx * 40, y: 58, z: focus.z + sz * 40 };
  for (const dist of [150, 125, 175]) for (const turn of [0.25, -0.25, 0.55, -0.55, 0.85, -0.85, 0]) {
    const c = Math.cos(turn), s = Math.sin(turn), dx = -(sx * c - sz * s), dz = -(sz * c + sx * s);
    const position = { x: focus.x + dx * dist, y: 104, z: focus.z + dz * dist };
    const score = blockedSamples(position, target) + Math.abs(turn) * 2 + Math.abs(dist - 150) / 50;
    if (score < best) { best = score; overviewView = { position: local(position), target: local(target) }; }
  }
  const landmarkViews: (ConduitView & { label: string })[] = [];
  for (const h of hubs) {
    landmarkViews.push({ label: `hub ${h.id}`, ...clearView(h.x, h.z, 64, h.levels[1] + 14, { x: h.x, y: (h.levels[0] + h.levels[1]) / 2, z: h.z }) });
  }
  const towersIn = plan.towers.filter(t => inside(t.x, t.z, t.reach + 4)).sort((p, q) => (q.family === 3 ? 1000 : 0) + q.height - (p.family === 3 ? 1000 : 0) - p.height);
  for (const t of towersIn.slice(0, 4)) {
    landmarkViews.push({ label: `${CONDUIT_FAMILIES[t.family]} ${t.id}`, ...clearView(t.x, t.z, t.reach * 3.4 + 50, t.base + t.height * 0.55, { x: t.x, y: t.base + t.height * 0.55, z: t.z }, t) });
  }
  const host = plan.podiums.filter(p => p.kind === 'podium' && !p.underTube && p.height >= 10 && inside(p.x, p.z, p.w / 2 + 2) && p.height + 4 < ceiling)
    .sort((p, q) => Math.hypot(p.x - focus.x, p.z - focus.z) - Math.hypot(q.x - focus.x, q.z - focus.z))[0];
  let deckView: ConduitView | null = null;
  if (host) {
    const px = Math.floor(host.x), pz = Math.floor(host.z);
    let top = -1;
    for (let y = ceiling - 1; y >= 0; y--) if (get(px - ox, y, pz - oz)) { top = y; break; }
    if (top > 0) {
      deckView = { position: local({ x: px + 0.5, y: top + 2.7, z: pz + 0.5 }), target: local({ x: px + 0.5 + sx * 120, y: top + 30, z: pz + 0.5 + sz * 120 }) };
    }
  }
  return {
    voxels, heights, width, depth, standardCount, emissiveCount,
    towers: plan.towers.filter(t => near(t.x, t.z, t.reach)), podiums: plan.podiums.filter(p => near(p.x, p.z, p.w / 2, p.d / 2)),
    hubs: plan.hubs.filter(h => near(h.x, h.z, 14)), ramps: plan.ramps, bridges: plan.bridges.filter(b => near((b.a.x + b.b.x) / 2, (b.a.z + b.b.z) / 2, Math.abs(b.a.x - b.b.x) / 2 + 3, Math.abs(b.a.z - b.b.z) / 2 + 3)),
    vehicles: plan.vehicles.filter(v => near(v.x, v.z, 2)), overviewView: overviewView!, landmarkViews, deckView,
  };
}
