/** AeroGlass Valley · 晴空玻轨
 *
 * An infinite, coordinate-addressed sunlit solarpunk valley metropolis showcasing
 * Space's full 3-material voxel system:
 *   - normal       (materialId = 0)
 *   - translucent  (materialId = 2..101,   transparency = 1..100%, opacity = (100 - t) / 100)
 *   - emissive     (materialId = 102..201, emission     = 1..100%, strength = e / 50)
 *
 * Monumental elevated transparent glass sky-tubes with perpendicular titanium collars,
 * interior dual maglev rails and warm-lit passenger pods sweep diagonally over lush
 * forested limestone hills, smooth curved valley monorails, terraced circular rooftop-
 * garden towers, sculpted arched-fin louver towers with tunnel portals, translucent
 * glass biodomes, crystal-curtain supertalls, luminous billboards, drones & VTOL craft.
 *
 * Geometry is exclusively 1m / 0.125m cubes; planning depends only on world
 * coordinates and the seed, never on the visible crop.
 * Output X/Z are cube centres relative to the crop centre; Y is the cube bottom. */

import { AEROGLASS_SUN } from './aeroglassLook';

export { AEROGLASS_SUN };

export const SPACE_MATERIAL_IDS = {
  DEFAULT: 0,
  TRANSLUCENT_MIN: 2,
  TRANSLUCENT_MAX: 101,
  EMISSIVE_MIN: 102,
  EMISSIVE_MAX: 201,
} as const;

export type AeroglassMaterialKind = 'normal' | 'translucent' | 'emissive';

export interface AeroglassConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  aeroRelief: number;
  aeroSkyline: number;
  aeroDensity: number;
  aeroTubes: number;
  aeroMonorails: number;
  aeroForest: number;
  aeroGlass: number;
  aeroHolo: number;
  aeroTraffic: number;
  aeroGlow: number;
}

export const AEROGLASS_DEFAULTS = {
  aeroRelief: 1.0,
  aeroSkyline: 172,
  aeroDensity: 0.86,
  aeroTubes: 0.92,
  aeroMonorails: 0.85,
  aeroForest: 0.92,
  aeroGlass: 0.72,
  aeroHolo: 0.8,
  aeroTraffic: 0.8,
  aeroGlow: 0.18,
};

export const AEROGLASS_FAMILIES = [
  'circular_eco',
  'arch_fin',
  'crystal_spire',
  'sail_blade',
  'biodome',
  'hillside_terrace',
] as const;

export interface AeroglassPoint { x: number; y: number; z: number }

export interface AeroglassVoxel extends AeroglassPoint {
  sizeX: 1 | 0.125;
  sizeY: 1 | 0.125;
  sizeZ: 1 | 0.125;
  color: number;
  material: AeroglassMaterialKind;
  materialId: number;
  transparency: number;
  emission: number;
  emissive: boolean;
  intensity: number;
}

export interface AeroglassBuilding {
  id: string;
  a: number;
  b: number;
  x: number;
  z: number;
  base: number;
  height: number;
  family: number;
  radius: number;
  angle: number;
  palette: number;
  holo: boolean;
  underTube: boolean;
}

export interface AeroglassPylon {
  id: string;
  j: number;
  k: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  tx: number;
  ty: number;
  tz: number;
}

export interface AeroglassBillboard {
  id: string;
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  scheme: number;
}

export interface AeroglassCraft {
  id: string;
  kind: 'drone' | 'shuttle';
  x: number;
  y: number;
  z: number;
  heading: number;
  tone: number;
}

export interface AeroglassView {
  position: AeroglassPoint;
  target: AeroglassPoint;
}

const M = 0.125;
const TUBE_PITCH = 224;
const TUBE_SPAN = 320;
const MONORAIL_PITCH = 144;
const LOT = 44;

const C = {
  // Rich sunlit solarpunk greenery & pale limestone rocky cliffs
  grassA: 0x356925,
  grassB: 0x457c2d,
  grassDeep: 0x244e1c,
  soil: 0x524b3c,
  cliffLight: 0xc2c8c6,
  cliffMid: 0xa2acab,
  cliffDark: 0x768280,
  trunk: 0x503e2d,
  leafDeep: 0x1d4018,
  leafMid: 0x2b5a22,
  leafBright: 0x43782a,
  leafSun: 0x5d9035,
  // Crisp sunlit architectural concrete & brushed titanium (balanced to stay sharp without over-bloom)
  white: 0xdce2e7,
  warmWhite: 0xd5dbd8,
  concrete: 0xc0c9d0,
  concreteShade: 0x9aa6b1,
  titanium: 0xb4c0cc,
  titaniumMid: 0x8695a4,
  steelDark: 0x465462,
  trackBed: 0x2b3743,
  railSilver: 0xcbd6e0,
  // Translucent glass palettes
  tubeGlassTop: 0xd2ecff,
  tubeGlassSide: 0xaed7f5,
  domeGlass: 0xbae2fa,
  darkGlass: 0x203e57,
  railingGlass: 0xb6dff8,
  waterGlass: 0x3bb8d6,
  // Vehicle & drone colors
  podWhite: 0xdde4eb,
  podSkirt: 0x8495a6,
  droneBody: 0x2e3945,
  droneArm: 0x596876,
  rotorDisc: 0xcde8fc,
};

// High-contrast steel-blue crystal glass against crisp white-silver architectural frames.
const TOWER_PALETTES = [
  { glass: 0x2a547a, alt: 0x36668f, frame: 0xdce3e9, slab: 0xbec8d1 },
  { glass: 0x21486b, alt: 0x2e5b82, frame: 0xd4dce3, slab: 0xb4bfc8 },
  { glass: 0x34638a, alt: 0x44769e, frame: 0xe0e6eb, slab: 0xc5cfd7 },
  { glass: 0x234c5f, alt: 0x305e73, frame: 0xd8dfdc, slab: 0xb8c3bf },
];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mod = (v: number, m: number) => ((v % m) + m) % m;

function hash(x: number, z: number, salt: number, seed: number): number {
  let h = Math.imul(x ^ seed ^ 0x517cc1b7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13) ^ salt, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x: number, z: number, seed: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz, salt, seed), b = hash(ix + 1, iz, salt, seed);
  const c = hash(ix, iz + 1, salt, seed), d = hash(ix + 1, iz + 1, salt, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(x: number, z: number, seed: number, salt: number): number {
  return noise2(x, z, seed, salt) * 0.58
    + noise2(x * 2.09 + 19.3, z * 2.09 - 27.1, seed, salt + 1) * 0.28
    + noise2(x * 4.31 - 11.7, z * 4.31 + 33.9, seed, salt + 2) * 0.14;
}

/** Exact Space material ID encoding:
 * 0 = normal, 2..101 = transparency 1..100%, 102..201 = emission 1..100%. */
export function encodeSpaceMaterialId(kind: AeroglassMaterialKind, level: number): number {
  if (kind === 'normal') return SPACE_MATERIAL_IDS.DEFAULT;
  const clamped = Math.max(1, Math.min(100, Math.round(level)));
  return kind === 'translucent' ? clamped + 1 : clamped + 101;
}

// ---------------------------------------------------------------------------
// Rolling forested hills, deep green valley basins & pale limestone crags
// ---------------------------------------------------------------------------

export function aeroglassTerrainHeight(wx: number, wz: number, config: AeroglassConfig): number {
  const seed = Math.floor(config.seed);
  const relief = clamp(config.aeroRelief, 0.4, 1.4);
  const macroWave = Math.sin(wx * 0.011 - wz * 0.009 - 0.58) * 0.5 + 0.5;
  const broad = fbm(wx / 220, wz / 220, seed, 11);
  const ridgeRaw = clamp(macroWave * 0.65 + broad * 0.48 - 0.13, 0, 1);
  const ridge = smooth(ridgeRaw) ** 1.3;
  const crag = Math.max(0, fbm(wx / 54 + 4.1, wz / 54 - 2.7, seed, 17) - 0.34) * 1.55;
  const mound = fbm(wx / 110 - 9.2, wz / 110 + 5.8, seed, 23);
  const valleyBase = 6 + mound * 5;
  const hill = (ridge * 42 + ridge * crag * 18) * relief;
  return Math.max(4, Math.min(76, Math.round(valleyBase + hill)));
}

export function aeroglassSkylineFactor(wx: number, wz: number, config: AeroglassConfig): number {
  const h = aeroglassTerrainHeight(wx, wz, config);
  const distNoise = fbm(wx / 320 + 7.5, wz / 320 - 3.3, Math.floor(config.seed), 31);
  return smooth((h - 14) / 30) * 0.72 + smooth((distNoise - 0.32) / 0.42) * 0.28;
}

// ---------------------------------------------------------------------------
// Sweeping elevated transparent glass sky-tube corridors (320m long climbs!)
// ---------------------------------------------------------------------------

export function aeroglassTubeLine(j: number, config: AeroglassConfig) {
  const seed = Math.floor(config.seed);
  const present = config.aeroTubes > 0.02 && (j === 0 || hash(j, 11, 201, seed) < config.aeroTubes);
  const radius = j === 0 || hash(j, 11, 202, seed) < 0.62 ? 7 : 6;
  return { present, radius };
}

function tubeNode(j: number, k: number, config: AeroglassConfig): AeroglassPoint {
  const seed = Math.floor(config.seed);
  const x = k * TUBE_SPAN - 132;
  const high = (k & 1) !== 0;
  const zJitter = (hash(j, k, 206, seed) - 0.5) * 20;
  const z = j * TUBE_PITCH + (high ? -48 : 56) + zJitter;
  const ground = aeroglassTerrainHeight(x, z, config);
  const baseY = high
    ? 112 + hash(j, k, 205, seed) * 14
    : 46 + hash(j, k, 205, seed) * 10;
  const y = Math.min(144, Math.max(baseY, ground + 32));
  return { x, y, z };
}

/** Long sweeping elevated glass sky-tube centerline: climbs smoothly and diagonally
 * across 320m spans between monumental station pylons. */
export function aeroglassTubePath(j: number, x: number, config: AeroglassConfig): AeroglassPoint {
  const u = (x + 132) / TUBE_SPAN;
  const k = Math.floor(u);
  const t = u - k;
  // Blend linear grade with subtle S-easing so the span rises like a bold architectural sky-tube.
  const s = t * 0.58 + smooth(t) * 0.42;
  const a = tubeNode(j, k, config);
  const b = tubeNode(j, k + 1, config);
  const bow = Math.sin(Math.PI * t) * (hash(j, k, 208, Math.floor(config.seed)) - 0.5) * 10;
  return {
    x,
    y: a.y + (b.y - a.y) * s,
    z: a.z + (b.z - a.z) * s + bow,
  };
}

function tubeFrame(j: number, x: number, config: AeroglassConfig) {
  const p0 = aeroglassTubePath(j, x - 0.5, config);
  const p1 = aeroglassTubePath(j, x + 0.5, config);
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const tx = dx / len, ty = dy / len, tz = dz / len;
  const bxRaw = tz, bzRaw = -tx;
  const bLen = Math.hypot(bxRaw, bzRaw) || 1;
  const bx = bxRaw / bLen, by = 0, bz = bzRaw / bLen;
  const ux = ty * bz - tz * by;
  const uy = tz * bx - tx * bz;
  const uz = tx * by - ty * bx;
  return { tx, ty, tz, bx, by, bz, ux, uy, uz };
}

// ---------------------------------------------------------------------------
// Curved valley monorail viaducts
// ---------------------------------------------------------------------------

export function aeroglassMonorailLine(m: number, config: AeroglassConfig) {
  const seed = Math.floor(config.seed);
  const present = config.aeroMonorails > 0.02 && (m === 0 || hash(m, 31, 301, seed) < config.aeroMonorails);
  return { present };
}

export function aeroglassMonorailPath(m: number, x: number, config: AeroglassConfig): AeroglassPoint {
  const seed = Math.floor(config.seed);
  const phase = hash(m, 31, 302, seed) * Math.PI * 2;
  const z = m * MONORAIL_PITCH + 24 + Math.sin(x * 0.016 + phase) * 32 + Math.cos(x * 0.008 - phase * 0.7) * 14;
  let hSum = 0;
  for (let s = -24; s <= 24; s += 12) hSum += aeroglassTerrainHeight(x + s, z, config);
  const avgGround = hSum / 5;
  const localGround = aeroglassTerrainHeight(x, z, config);
  const y = Math.min(78, Math.max(avgGround + 13, localGround + 8));
  return { x, y, z };
}

function tubeClearance(cx: number, cz: number, rad: number, config: AeroglassConfig) {
  let clear = true;
  let nearStation = false;
  let limit = 999;
  const jc = Math.round(cz / TUBE_PITCH);
  for (let j = jc - 1; j <= jc + 1; j++) {
    const line = aeroglassTubeLine(j, config);
    if (!line.present) continue;
    for (const sx of [cx - rad, cx, cx + rad]) {
      const p = aeroglassTubePath(j, sx, config);
      const distZ = Math.abs(cz - p.z);
      if (distZ < rad + line.radius + 8) {
        clear = false;
        limit = Math.min(limit, p.y - line.radius - 6);
      }
      // Keep the immediate foreground plaza flanking each sky-tube span low-rise
      // circular eco-towers so every tube sweeps across an open scenic valley vista.
      if (distZ < rad + line.radius + 26 && cz > p.z) {
        nearStation = true;
      }
    }
    const kc = Math.round((cx + 132) / TUBE_SPAN);
    for (let k = kc - 1; k <= kc + 1; k++) {
      const node = tubeNode(j, k, config);
      const dNode = Math.hypot(cx - node.x, cz - node.z);
      if (dNode < rad + 17) {
        clear = false;
        limit = Math.min(limit, 0);
      } else if (dNode < rad + 62) {
        nearStation = true;
      }
    }
  }
  return { clear, nearStation, limit };
}

function monorailNear(cx: number, cz: number, rad: number, config: AeroglassConfig): boolean {
  const mc = Math.round((cz - 24) / MONORAIL_PITCH);
  for (let m = mc - 1; m <= mc + 1; m++) {
    if (!aeroglassMonorailLine(m, config).present) continue;
    for (const sx of [cx - rad, cx, cx + rad]) {
      const p = aeroglassMonorailPath(m, sx, config);
      if (Math.abs(cz - p.z) < rad + 6) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Infinite world planner
// ---------------------------------------------------------------------------

export function planAeroglassValley(config: AeroglassConfig, margin = 150) {
  const seed = Math.floor(config.seed);
  const x0 = config.offsetX - config.sizeX / 2 - margin;
  const x1 = config.offsetX + config.sizeX / 2 + margin;
  const z0 = config.offsetZ - config.sizeZ / 2 - margin;
  const z1 = config.offsetZ + config.sizeZ / 2 + margin;

  const pylons: AeroglassPylon[] = [];
  const buildings: AeroglassBuilding[] = [];
  const billboards: AeroglassBillboard[] = [];
  const craft: AeroglassCraft[] = [];

  // Monumental station pylons along sweeping glass sky-tubes.
  for (let j = Math.floor(z0 / TUBE_PITCH) - 1; j <= Math.ceil(z1 / TUBE_PITCH) + 1; j++) {
    const ln = aeroglassTubeLine(j, config);
    if (!ln.present) continue;
    for (let k = Math.floor((x0 + 132) / TUBE_SPAN) - 1; k <= Math.ceil((x1 + 132) / TUBE_SPAN) + 1; k++) {
      const node = tubeNode(j, k, config);
      if (node.x < x0 - 30 || node.x > x1 + 30 || node.z < z0 - 30 || node.z > z1 + 30) continue;
      const f = tubeFrame(j, node.x, config);
      pylons.push({
        id: `${j}:${k}`, j, k, x: node.x, y: node.y, z: node.z, radius: ln.radius,
        tx: f.tx, ty: f.ty, tz: f.tz,
      });
    }
  }

  const skylineCap = clamp(config.aeroSkyline, 96, 184);

  // World-addressed lots: eco-towers & biodomes in lush valleys and station plazas,
  // sculpted arch-fin towers on mid-slopes, crystal supertalls & sail blades on high ridges.
  for (let a = Math.floor(x0 / LOT); a <= Math.ceil(x1 / LOT); a++) {
    for (let b = Math.floor(z0 / LOT); b <= Math.ceil(z1 / LOT); b++) {
      const r = (s: number) => hash(a, b, s, seed);
      const cx = Math.round((a + 0.5) * LOT + (r(1) - 0.5) * 14);
      const cz = Math.round((b + 0.5) * LOT + (r(2) - 0.5) * 14);
      if (r(3) > 0.24 + 0.72 * config.aeroDensity) continue;

      const base = aeroglassTerrainHeight(cx, cz, config);
      const skyline = aeroglassSkylineFactor(cx, cz, config);
      const slopeX = Math.abs(aeroglassTerrainHeight(cx + 6, cz, config) - aeroglassTerrainHeight(cx - 6, cz, config)) / 12;
      const slopeZ = Math.abs(aeroglassTerrainHeight(cx, cz + 6, config) - aeroglassTerrainHeight(cx, cz - 6, config)) / 12;
      const steep = Math.hypot(slopeX, slopeZ);
      if (steep > 0.68) continue; // Keep rugged pale limestone cliffs exposed!

      const clear = tubeClearance(cx, cz, 13, config);
      if (clear.limit <= base + 8) continue;
      const onMono = monorailNear(cx, cz, 9, config);

      let family: number;
      if (!clear.clear || clear.nearStation) {
        family = r(4) < 0.58 ? 0 : r(4) < 0.78 ? 5 : 4;
      } else if (base <= 19) {
        const pick = r(5);
        family = pick < 0.42 ? 0 : pick < 0.64 ? 4 : pick < 0.80 ? 5 : pick < 0.92 ? 1 : 3;
      } else if (base <= 33) {
        const pick = r(5);
        family = pick < 0.36 ? 1 : pick < 0.58 ? 3 : pick < 0.76 ? 2 : pick < 0.90 ? 0 : 4;
      } else {
        const pick = r(5);
        family = pick < 0.46 ? 2 : pick < 0.74 ? 3 : pick < 0.92 ? 1 : 0;
      }
      if (onMono && family === 4) family = 0;

      const radius = [
        9.5 + r(6) * 3.5,  // 0 circular_eco
        9.5 + r(6) * 2.8,  // 1 arch_fin
        9.5 + r(6) * 3.4,  // 2 crystal_spire
        9.0 + r(6) * 2.8,  // 3 sail_blade
        12.5 + r(6) * 2.5, // 4 biodome
        10.5 + r(6) * 3.5, // 5 hillside_terrace
      ][family];

      const strict = tubeClearance(cx, cz, radius + 1.5, config);
      if (strict.limit <= base + 8) continue;

      let height: number;
      if (family === 4) {
        height = Math.round(10 + r(7) * 3);
      } else if (family === 5) {
        height = Math.round(14 + r(7) * 12);
      } else if (family === 0) {
        height = Math.round(18 + r(7) * 18);
      } else if (family === 1) {
        height = Math.round(54 + skyline * 28 + r(7) * 24);
      } else if (family === 3) {
        height = Math.round(58 + skyline * 34 + r(7) * 24);
      } else {
        const hero = r(8) < 0.22 + skyline * 0.18;
        height = Math.round(hero
          ? clamp(skylineCap - base - 4, 68, 136)
          : clamp(68 + skyline * 42 + r(7) * 26, 62, skylineCap - base - 6));
      }

      if (!strict.clear) {
        height = Math.min(height, Math.floor(strict.limit - base));
        if (height < 10) continue;
        if (family === 1 || family === 2 || family === 3) family = 0;
      } else if (strict.nearStation && height > 30) {
        height = Math.min(height, 28);
        if (family === 1 || family === 2 || family === 3) family = 0;
      }

      height = Math.min(height, Math.max(10, Math.floor(skylineCap - base)));
      const holo = (family === 1 || family === 2 || family === 3) && r(9) < config.aeroHolo * 0.65;
      buildings.push({
        id: `${a}:${b}`, a, b, x: cx, z: cz, base, height, family, radius,
        angle: r(10) * Math.PI * 2,
        palette: Math.floor(r(11) * TOWER_PALETTES.length),
        holo,
        underTube: !strict.clear,
      });

      if (!holo && family !== 4 && r(12) < config.aeroHolo * 0.28 && strict.clear && !strict.nearStation) {
        const bx = cx + Math.round((r(13) < 0.5 ? -1 : 1) * (radius + 5));
        const bz = cz + Math.round((r(14) - 0.5) * 10);
        const by = aeroglassTerrainHeight(bx, bz, config);
        billboards.push({
          id: `b:${a}:${b}`, x: bx, y: by + 6, z: bz,
          angle: Math.atan2(-AEROGLASS_SUN.z, -AEROGLASS_SUN.x) + (r(15) - 0.5) * 0.7,
          width: 7 + Math.floor(r(16) * 3),
          height: 16 + Math.floor(r(17) * 8),
          scheme: Math.floor(r(18) * 3),
        });
      }
    }
  }

  // Autonomous quadcopter drones patrolling right around the sweeping glass sky-tubes,
  // plus sleek white VTOL air-shuttles cruising between the hillside towers.
  for (let u = Math.floor(x0 / 44); u <= Math.ceil(x1 / 44); u++) {
    for (let v = Math.floor(z0 / 44); v <= Math.ceil(z1 / 44); v++) {
      const r = (s: number) => hash(u, v, s, seed);
      if (r(160) > config.aeroTraffic * 0.72) continue;
      const x = Math.round(((u + 0.5) * 44 + (r(161) - 0.5) * 28) * 8) / 8;
      const z = Math.round(((v + 0.5) * 44 + (r(162) - 0.5) * 28) * 8) / 8;
      const ground = aeroglassTerrainHeight(x, z, config);
      const isDrone = r(163) < 0.62;
      let y = Math.round(ground + (isDrone ? 28 + r(164) * 48 : 54 + r(164) * 58));
      const jc = Math.round(z / TUBE_PITCH);
      const ln = aeroglassTubeLine(jc, config);
      if (ln.present) {
        const tp = aeroglassTubePath(jc, x, config);
        if (Math.abs(z - tp.z) < 34 && isDrone) {
          y = Math.round(tp.y + (r(165) < 0.5 ? 11 + r(166) * 7 : -12 - r(166) * 6));
        }
        if (Math.hypot(z - tp.z, y - tp.y) < ln.radius + 4) continue;
      }
      if (y > skylineCap - 8 || y < ground + 12) continue;
      if (buildings.some(b => Math.hypot(b.x - x, b.z - z) < b.radius + 5 && y < b.base + b.height + 10)) continue;
      craft.push({
        id: `${u}:${v}`,
        kind: isDrone ? 'drone' : 'shuttle',
        x, y, z,
        heading: Math.floor(r(167) * 8) * Math.PI / 4 + (r(168) - 0.5) * 0.35,
        tone: Math.floor(r(169) * 3),
      });
    }
  }

  buildings.sort((p, q) => p.id.localeCompare(q.id));
  billboards.sort((p, q) => p.id.localeCompare(q.id));
  pylons.sort((p, q) => p.id.localeCompare(q.id));
  craft.sort((p, q) => p.id.localeCompare(q.id));

  return { pylons, buildings, billboards, craft };
}

// ---------------------------------------------------------------------------
// Voxel generation (normal + translucent 1..100 + emissive 1..100)
// ---------------------------------------------------------------------------

interface PaletteEntry {
  color: number;
  material: AeroglassMaterialKind;
  materialId: number;
  transparency: number;
  emission: number;
  emissive: boolean;
  intensity: number;
}

export function generateAeroglassValley(config: AeroglassConfig) {
  const width = Math.max(1, Math.floor(config.sizeX));
  const depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff)));
  const seed = Math.floor(config.seed);
  const ox = Math.floor(config.offsetX - width / 2);
  const oz = Math.floor(config.offsetZ - depth / 2);
  const layer = width * depth;

  const cells = new Uint16Array(layer * ceiling);
  const heights = new Float32Array(layer);
  const palette: PaletteEntry[] = [{
    color: 0, material: 'normal', materialId: 0, transparency: 0, emission: 0, emissive: false, intensity: 0,
  }];
  const ids = new Map<number, number>();
  const micros = new Map<number, AeroglassVoxel>();
  const voxels: AeroglassVoxel[] = [];

  const plan = planAeroglassValley(config, 150);
  const forest = clamp(config.aeroForest);
  const glassFactor = clamp(config.aeroGlass, 0.25, 0.92);

  const near = (x: number, z: number, rx: number, rz = rx) =>
    x + rx >= ox && x - rx < ox + width && z + rz >= oz && z - rz < oz + depth;

  const normalMat = (color: number) => {
    const key = color * 256;
    const old = ids.get(key);
    if (old) return old;
    const id = palette.length;
    ids.set(key, id);
    palette.push({ color, material: 'normal', materialId: 0, transparency: 0, emission: 0, emissive: false, intensity: 0 });
    return id;
  };

  /** Translucent voxel material using exact Space 1..100 transparency (materialId = 2..101). */
  const glassMat = (color: number, transparency: number) => {
    const t = Math.max(1, Math.min(100, Math.round(transparency)));
    const mid = t + 1;
    const key = color * 256 + mid;
    const old = ids.get(key);
    if (old) return old;
    const id = palette.length;
    ids.set(key, id);
    palette.push({ color, material: 'translucent', materialId: mid, transparency: t, emission: 0, emissive: false, intensity: 0 });
    return id;
  };

  /** Emissive voxel material using exact Space 1..100 glow (materialId = 102..201). */
  const glowMat = (color: number, emission: number) => {
    const e = Math.max(1, Math.min(100, Math.round(emission)));
    const mid = e + 101;
    const key = color * 256 + mid;
    const old = ids.get(key);
    if (old) return old;
    const id = palette.length;
    ids.set(key, id);
    palette.push({ color, material: 'emissive', materialId: mid, transparency: 0, emission: e, emissive: true, intensity: e / 50 });
    return id;
  };

  const get = (x: number, y: number, z: number) =>
    x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < ceiling ? cells[x + z * width + y * layer] : 0;

  const put = (x: number, y: number, z: number, id: number) => {
    const lx = x - ox, lz = z - oz;
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || y < 0 || y >= ceiling) return;
    cells[lx + lz * width + y * layer] = id;
  };

  const putAir = (x: number, y: number, z: number) => put(x, y, z, 0);

  const boxId = (x: number, y: number, z: number, w: number, h: number, d: number, id: number) => {
    const x0 = Math.max(0, Math.floor(x) - ox), x1 = Math.min(width, Math.floor(x + w) - ox);
    const z0 = Math.max(0, Math.floor(z) - oz), z1 = Math.min(depth, Math.floor(z + d) - oz);
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(ceiling, Math.floor(y + h));
    if (x0 >= x1 || z0 >= z1 || y0 >= y1) return;
    for (let iy = y0; iy < y1; iy++) {
      for (let iz = z0; iz < z1; iz++) {
        cells.fill(id, x0 + iz * width + iy * layer, x1 + iz * width + iy * layer);
      }
    }
  };

  const micro = (
    x: number, y: number, z: number, color: number,
    kind: AeroglassMaterialKind = 'normal', level = 0,
  ) => {
    x = Math.round(x * 8) / 8;
    y = Math.round(y * 8) / 8;
    z = Math.round(z * 8) / 8;
    if (x < ox || z < oz || x + M > ox + width || z + M > oz + depth || y < 0 || y + M > ceiling) return;
    const clamped = kind === 'normal' ? 0 : Math.max(1, Math.min(100, Math.round(level)));
    const transparency = kind === 'translucent' ? clamped : 0;
    const emission = kind === 'emissive' ? clamped : 0;
    const materialId = encodeSpaceMaterialId(kind, clamped);
    const key = (x - ox) * 8 + (z - oz) * width * 64 + y * layer * 512;
    micros.set(key, {
      x: x + M / 2 - ox - width / 2,
      y,
      z: z + M / 2 - oz - depth / 2,
      sizeX: M,
      sizeY: M,
      sizeZ: M,
      color,
      material: kind,
      materialId,
      transparency,
      emission,
      emissive: kind === 'emissive',
      intensity: emission / 50,
    });
  };

  const microLine = (
    a: AeroglassPoint, b: AeroglassPoint, color: number,
    kind: AeroglassMaterialKind = 'normal', level = 0, thick = 1,
  ) => {
    if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(a.x - b.x) / 2 + 1, Math.abs(a.z - b.z) / 2 + 1)) return;
    const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)) * 8);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      for (let dx = 0; dx < thick; dx++) {
        for (let dy = 0; dy < thick; dy++) {
          micro(x + dx * M, y + dy * M, z, color, kind, level);
        }
      }
    }
  };

  const blobId = (cx: number, cy: number, cz: number, rx: number, ry: number, id: number) => {
    if (!near(cx, cz, rx + 1)) return;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let z = Math.floor(cz - rx); z <= cz + rx; z++) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rx) ** 2 <= 1) {
            put(x, y, z, id);
          }
        }
      }
    }
  };

  const leafIds = [normalMat(C.leafDeep), normalMat(C.leafMid), normalMat(C.leafBright), normalMat(C.leafSun)];
  const trunkId = normalMat(C.trunk);

  const tree = (x: number, y: number, z: number, size: number, salt: number) => {
    const tone = hash(x, z, salt, seed);
    const leaf = leafIds[Math.floor(tone * leafIds.length)];
    const crown = leafIds[Math.min(leafIds.length - 1, Math.floor(tone * leafIds.length) + 1)];
    const trunkH = Math.max(1, Math.round(size * 0.85));
    boxId(x, y, z, 1, trunkH, 1, trunkId);
    blobId(x + 0.5, y + trunkH + size * 0.55, z + 0.5, size, size * 0.82, leaf);
    if (size >= 1.8) {
      blobId(x + 0.5 + (tone - 0.5) * 1.4, y + trunkH + size * 1.12, z + 0.5 + (hash(z, x, salt + 1, seed) - 0.5) * 1.4, size * 0.64, size * 0.58, crown);
    }
  };

  // --- 1. Terrain: undulating green forested valleys + dramatic exposed pale limestone cliffs. ---
  const terrainMap = new Int16Array(layer);
  {
    const grassA = normalMat(C.grassA), grassB = normalMat(C.grassB), grassDeep = normalMat(C.grassDeep);
    const soil = normalMat(C.soil);
    const cliffL = normalMat(C.cliffLight), cliffM = normalMat(C.cliffMid), cliffD = normalMat(C.cliffDark);
    for (let lz = 0; lz < depth; lz++) {
      const wz = lz + oz;
      for (let lx = 0; lx < width; lx++) {
        terrainMap[lx + lz * width] = aeroglassTerrainHeight(lx + ox, wz, config);
      }
    }
    for (let lz = 0; lz < depth; lz++) {
      const wz = lz + oz;
      for (let lx = 0; lx < width; lx++) {
        const wx = lx + ox;
        const h = terrainMap[lx + lz * width];
        const hx = aeroglassTerrainHeight(wx + 1, wz, config) - aeroglassTerrainHeight(wx - 1, wz, config);
        const hz = aeroglassTerrainHeight(wx, wz + 1, config) - aeroglassTerrainHeight(wx, wz - 1, config);
        const slope = Math.hypot(hx, hz) * 0.5;
        const isCliff = slope > 0.56 || (h > 26 && slope > 0.38 && noise2(wx * 0.05, wz * 0.05, seed, 41) > 0.45);
        const topY = Math.min(ceiling - 1, h);
        const colIdx = lx + lz * width;
        for (let y = 0; y <= topY; y++) {
          let id: number;
          if (isCliff && y >= h - 8) {
            const band = (y + Math.floor(noise2(wx * 0.08, wz * 0.08, seed, 43) * 4)) % 5;
            id = band === 0 ? cliffD : band <= 2 ? cliffM : cliffL;
          } else if (y === h) {
            const gHash = hash(wx, wz, 44, seed);
            id = gHash < 0.34 ? grassDeep : gHash < 0.72 ? grassA : grassB;
          } else if (y >= h - 2) {
            id = soil;
          } else {
            id = (y % 4 === 0) ? cliffD : cliffM;
          }
          cells[colIdx + y * layer] = id;
        }
      }
    }
  }

  // --- 2. Dense lush hillside woodlands (leaving steep pale limestone cliffs exposed). ---
  if (forest > 0.05) {
    const CELL = 6;
    for (let gx = Math.floor((ox - 6) / CELL); gx <= Math.ceil((ox + width + 6) / CELL); gx++) {
      for (let gz = Math.floor((oz - 6) / CELL); gz <= Math.ceil((oz + depth + 6) / CELL); gz++) {
        const r = (s: number) => hash(gx, gz, s, seed);
        if (r(50) > forest * 0.86) continue;
        const tx = Math.floor((gx + 0.15 + r(51) * 0.7) * CELL);
        const tz = Math.floor((gz + 0.15 + r(52) * 0.7) * CELL);
        if (!near(tx, tz, 4)) continue;
        const h = aeroglassTerrainHeight(tx, tz, config);
        const hx = aeroglassTerrainHeight(tx + 2, tz, config) - aeroglassTerrainHeight(tx - 2, tz, config);
        const hz = aeroglassTerrainHeight(tx, tz + 2, config) - aeroglassTerrainHeight(tx, tz - 2, config);
        if (Math.hypot(hx, hz) * 0.25 > 0.58) continue;
        if (plan.buildings.some(b => Math.hypot(b.x - tx, b.z - tz) < b.radius + 2.5)) continue;
        if (plan.pylons.some(p => Math.hypot(p.x - tx, p.z - tz) < 12)) continue;
        if (monorailNear(tx, tz, 1.8, config)) continue;
        const size = 1.7 + r(53) * 2.0;
        tree(tx, h + 1, tz, size, 54);
      }
    }
  }

  // --- 3. Holographic billboard helper (vivid Space emissive 1-100 + translucent glass veil). ---
  const holoFrameId = normalMat(C.steelDark);
  const holoRimId = normalMat(C.titanium);
  const holoGlassId = glassMat(0xaeeeff, 78);

  const drawBillboard = (
    cx: number, y0: number, cz: number, angle: number,
    bw: number, bh: number, scheme: number, mountBase?: AeroglassPoint,
  ) => {
    if (!near(cx, cz, bw + 4)) return;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const px = -dz, pz = dx;
    if (mountBase) {
      const ground = aeroglassTerrainHeight(Math.floor(mountBase.x), Math.floor(mountBase.z), config);
      boxId(Math.floor(mountBase.x), ground - 2, Math.floor(mountBase.z), 2, Math.max(1, y0 - ground + 2), 2, holoRimId);
    }
    for (let yy = 0; yy < bh; yy++) {
      for (let s = -bw / 2; s <= bw / 2; s += 0.5) {
        const wx = Math.floor(cx + px * s);
        const wz = Math.floor(cz + pz * s);
        const isRim = yy === 0 || yy === bh - 1 || Math.abs(s) >= bw / 2 - 0.35;
        if (isRim) {
          put(wx, y0 + yy, wz, yy === 0 || yy === bh - 1 ? holoRimId : holoFrameId);
          continue;
        }
        const v = yy / bh;
        const wave = Math.sin(s * 0.85 + yy * 0.35);
        const distC = Math.hypot(s * 1.15, yy - bh * 0.54);
        const isRing = distC < Math.min(bw, bh) * 0.34 && distC > Math.min(bw, bh) * 0.22;
        const isCore = distC <= Math.min(bw, bh) * 0.14;
        let col: number;
        let em: number;
        if (isCore) {
          col = 0xffffff; em = 96;
        } else if (isRing) {
          col = scheme === 0 ? 0xe4faff : scheme === 1 ? 0xffe4fa : 0xe4f2ff; em = 88;
        } else if (scheme === 0) {
          col = v + wave * 0.12 < 0.45 ? 0x16aeff : v < 0.78 ? 0x3ce0ff : 0x8ef2ff;
          em = 68 + Math.round(v * 20);
        } else if (scheme === 1) {
          col = v + wave * 0.1 < 0.36 ? 0x2ad2ff : v < 0.68 ? 0xa644ff : 0xff4ebf;
          em = 72 + Math.round((1 - Math.abs(v - 0.5) * 2) * 20);
        } else {
          col = v < 0.4 ? 0x2f74ff : v < 0.72 ? 0x7050ff : 0xff62d0;
          em = 66 + Math.round(v * 20);
        }
        put(wx, y0 + yy, wz, glowMat(col, em));
        const fx = Math.floor(cx + px * s + dx * 1.05);
        const fz = Math.floor(cz + pz * s + dz * 1.05);
        if ((fx !== wx || fz !== wz) && yy > 1 && yy < bh - 2 && Math.abs(s) < bw / 2 - 0.8) {
          put(fx, y0 + yy, fz, holoGlassId);
        }
      }
    }
  };

  // --- 4. Architecture: 6 iconic solarpunk families. ---
  const whiteId = normalMat(C.white);
  const warmWhiteId = normalMat(C.warmWhite);
  const concreteId = normalMat(C.concrete);
  const shadeId = normalMat(C.concreteShade);
  const titaniumId = normalMat(C.titanium);
  const steelDarkId = normalMat(C.steelDark);
  const grassTopId = normalMat(C.grassB);
  const darkGlassId = glassMat(C.darkGlass, Math.round(30 + glassFactor * 16));
  const railingGlassId = glassMat(C.railingGlass, Math.round(54 + glassFactor * 20));
  const domeGlassId = glassMat(C.domeGlass, Math.round(54 + glassFactor * 22));
  const waterGlassId = glassMat(C.waterGlass, 48);
  const warmGlowSoft = glowMat(0xffdca3, 38);
  const warmGlowMid = glowMat(0xffcf85, 62);
  const coolLobbyGlow = glowMat(0xaee8ff, 54);

  for (const b of plan.buildings) {
    if (!near(b.x, b.z, b.radius + 8)) continue;
    const r = (s: number) => hash(b.a, b.b, s, seed);
    const pal = TOWER_PALETTES[b.palette];
    const frameId = normalMat(pal.frame);
    const slabId = normalMat(pal.slab);
    const spireGlassA = glassMat(pal.glass, Math.round(22 + glassFactor * 22));
    const spireGlassB = glassMat(pal.alt, Math.round(26 + glassFactor * 22));
    const yFloor = Math.max(0, b.base - 14);
    const yTop = Math.min(ceiling, b.base + b.height);

    // Family 0: Circular Terraced Eco-Tower (white cantilevered rings + dark glass + rooftop forest with open center terrace!)
    if (b.family === 0) {
      const tiers = b.height >= 30 ? 2 : 1;
      for (let tier = 0; tier < tiers; tier++) {
        const y0 = tier === 0 ? yFloor : b.base + Math.floor(b.height * 0.56);
        const y1 = tier === 0 ? Math.min(ceiling, b.base + (tiers === 2 ? Math.floor(b.height * 0.56) : b.height)) : yTop;
        const rad = b.radius - tier * 2.5;
        const radCeil = Math.ceil(rad + 1.5);
        for (let y = y0; y < y1; y++) {
          const k = y - b.base;
          const isSlab = k < 0 || k % 4 === 0 || y === y1 - 1;
          const curR = isSlab ? rad + 0.8 : rad;
          for (let dz = -radCeil; dz <= radCeil; dz++) {
            for (let dx = -radCeil; dx <= radCeil; dx++) {
              const d = Math.hypot(dx, dz);
              if (d > curR) continue;
              const wx = b.x + dx, wz = b.z + dz;
              if (y === y1 - 1) {
                put(wx, y, wz, d > curR - 1.2 ? whiteId : d < 2.6 ? concreteId : grassTopId);
              } else if (isSlab) {
                put(wx, y, wz, d > rad - 0.5 ? whiteId : concreteId);
              } else if (d > rad - 1.15) {
                put(wx, y, wz, darkGlassId);
              } else if (d > rad - 2.3) {
                const lit = hash(Math.floor(dx / 2) + b.a * 7, Math.floor(dz / 2) + y * 13, 61, seed) < 0.24;
                put(wx, y, wz, lit ? warmGlowSoft : shadeId);
              } else {
                put(wx, y, wz, concreteId);
              }
            }
          }
          if (k > 2 && k % 4 === 1 && forest > 0.1) {
            for (let a = 0; a < 28; a++) {
              const ang = (a / 28) * Math.PI * 2 + tier * 0.4;
              if (hash(a + b.a * 17, k + b.b * 13, 62, seed) > forest * 0.62) continue;
              put(Math.round(b.x + Math.cos(ang) * (rad + 0.4)), y, Math.round(b.z + Math.sin(ang) * (rad + 0.4)), leafIds[(a + k) % leafIds.length]);
            }
          }
        }
        // Lush perimeter rooftop forest (keeps a central 3m observation plaza clear for deck camera!).
        if (forest > 0.1 && y1 < ceiling - 3 && rad > 5.5) {
          const treeCount = Math.max(3, Math.floor((rad * rad) / 22 * forest));
          for (let t = 0; t < treeCount; t++) {
            const ang = (t / treeCount) * Math.PI * 2 + r(64 + t) * 0.4;
            const rr = Math.max(4.4, (0.52 + r(74 + t) * 0.34) * (rad - 1.5));
            const tx = Math.round(b.x + Math.cos(ang) * rr);
            const tz = Math.round(b.z + Math.sin(ang) * rr);
            tree(tx, y1, tz, 1.4 + r(84 + t) * 1.2, 90 + t);
          }
        }
      }
      continue;
    }

    // Family 4: Translucent Glass Biodome Conservatory (crisp titanium ribs + crystal glass + lush botanical interior!)
    if (b.family === 4) {
      const rx = b.radius;
      const rz = b.radius * 0.82;
      const ry = Math.max(9, b.height);
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const ext = Math.ceil(rx + 2);
      for (let dz = -ext; dz <= ext; dz++) {
        for (let dx = -ext; dx <= ext; dx++) {
          const u = (dx * cA + dz * sA) / (rx + 1.2);
          const v = (dz * cA - dx * sA) / (rz + 1.2);
          const e = u * u + v * v;
          if (e > 1) continue;
          const wx = b.x + dx, wz = b.z + dz;
          for (let y = yFloor; y <= b.base + 1 && y < ceiling; y++) {
            if (y === b.base + 1) {
              if (e > 0.82) put(wx, y, wz, titaniumId);
              else if (e < 0.25) put(wx, y, wz, waterGlassId);
              else put(wx, y, wz, e < 0.35 ? concreteId : grassTopId);
            } else {
              put(wx, y, wz, concreteId);
            }
          }
        }
      }
      for (let dy = 1; dy <= ry + 1 && b.base + 1 + dy < ceiling; dy++) {
        const y = b.base + 1 + dy;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const lx = dx * cA + dz * sA;
            const lz = dz * cA - dx * sA;
            const q = (lx / rx) ** 2 + (lz / rz) ** 2 + (dy / ry) ** 2;
            const qIn = (lx / Math.max(1, rx - 1.25)) ** 2 + (lz / Math.max(1, rz - 1.25)) ** 2 + (dy / Math.max(1, ry - 1.25)) ** 2;
            if (q > 1 || qIn < 1) continue;
            const phi = Math.atan2(lz / rz, lx / rx);
            const isArchRib = Math.abs(Math.sin(phi * 4)) < 0.11 || Math.abs(dy - Math.round(ry * 0.48)) <= 0.32;
            put(b.x + dx, y, b.z + dz, isArchRib ? titaniumId : domeGlassId);
          }
        }
      }
      const indoorY = b.base + 2;
      tree(b.x, indoorY, b.z, Math.min(2.6, ry * 0.26), 95);
      for (let t = 0; t < 4; t++) {
        const ang = b.angle + (t * Math.PI) / 2 + 0.4;
        const tx = Math.round(b.x + Math.cos(ang) * rx * 0.5);
        const tz = Math.round(b.z + Math.sin(ang) * rz * 0.5);
        tree(tx, indoorY, tz, 1.5, 96 + t);
        put(Math.round(b.x + Math.cos(ang) * rx * 0.32), indoorY + 1, Math.round(b.z + Math.sin(ang) * rz * 0.32), warmGlowMid);
      }
      continue;
    }

    // Family 5: Terraced Hillside Eco-Podium with Glass Balustrades
    if (b.family === 5) {
      const tiers = b.height >= 20 ? 3 : 2;
      let curY = b.base;
      for (let k = 0; k < tiers; k++) {
        const hw = Math.max(4, Math.round(b.radius - k * 2.5));
        const hd = Math.max(4, Math.round(b.radius * 0.85 - k * 2));
        const th = k === tiers - 1 ? Math.max(4, b.base + b.height - curY) : Math.max(5, Math.floor(b.height / tiers));
        const yStart = k === 0 ? yFloor : curY;
        const yEnd = Math.min(ceiling, curY + th);
        for (let y = yStart; y < yEnd; y++) {
          const isSlab = y === yEnd - 1 || (y - b.base) % 4 === 0 || y < b.base;
          for (let dz = -hd; dz <= hd; dz++) {
            for (let dx = -hw; dx <= hw; dx++) {
              if (Math.abs(dx) === hw && Math.abs(dz) === hd) continue;
              const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
              const wx = b.x + dx, wz = b.z + dz;
              if (y === yEnd - 1) {
                put(wx, y, wz, edge ? whiteId : Math.hypot(dx, dz) < 2.6 ? concreteId : grassTopId);
              } else if (isSlab) {
                put(wx, y, wz, edge ? whiteId : concreteId);
              } else if (edge) {
                put(wx, y, wz, darkGlassId);
              } else if (Math.abs(dx) >= hw - 1 || Math.abs(dz) >= hd - 1) {
                const lit = hash(wx >> 1, (wz >> 1) + y * 31, 66, seed) < 0.22;
                put(wx, y, wz, lit ? warmGlowSoft : shadeId);
              } else {
                put(wx, y, wz, concreteId);
              }
            }
          }
        }
        if (yEnd < ceiling - 1) {
          for (let dx = -hw + 1; dx <= hw - 1; dx++) {
            put(b.x + dx, yEnd, b.z - hd, railingGlassId);
            put(b.x + dx, yEnd, b.z + hd, railingGlassId);
          }
          for (let dz = -hd + 1; dz <= hd - 1; dz++) {
            put(b.x - hw, yEnd, b.z + dz, railingGlassId);
            put(b.x + hw, yEnd, b.z + dz, railingGlassId);
          }
        }
        if (k === tiers - 1 && forest > 0.1 && yEnd < ceiling - 3 && hw >= 5) {
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            tree(b.x + sx * Math.max(3, hw - 2), yEnd, b.z + sz * Math.max(3, hd - 2), 1.4, 110 + sx + sz * 3);
          }
        }
        curY = yEnd;
      }
      continue;
    }

    // Family 1: Sculpted Arch-Fin Louver Tower (parabolic white arch + horizontal ribs + glowing tunnel portal!)
    if (b.family === 1) {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const ext = Math.ceil(b.radius + 4);
      for (let y = yFloor; y < yTop; y++) {
        const k = y - b.base;
        const f = clamp(k / b.height, 0, 1);
        const flare = k < 12 ? 1 + (1 - clamp(k / 12)) * 0.42 : 1;
        const crownCurve = Math.sqrt(Math.max(0.04, 1 - Math.max(0, (f - 0.62) / 0.38) ** 2.2));
        const aRad = b.radius * (0.94 - 0.24 * f) * crownCurve * flare;
        const bRad = b.radius * 0.58 * (1 - 0.16 * f) * Math.max(0.45, crownCurve) * flare;
        const isLouver = k >= 0 && k % 3 === 0;
        const isCrown = f > 0.92;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const u = dx * cA + dz * sA;
            const v = dz * cA - dx * sA;
            const q = (u / Math.max(1.2, aRad)) ** 2 + (v / Math.max(1.2, bRad)) ** 2;
            if (q > 1) continue;
            if (k >= 1 && k <= 10 && Math.abs(u) <= 3.6) {
              const archH = 10 * Math.sqrt(Math.max(0, 1 - (u / 3.9) ** 2));
              if (k < archH - 0.8) {
                putAir(b.x + dx, y, b.z + dz);
                continue;
              }
              if (k <= archH + 0.5 && Math.abs(v) > bRad - 2.2) {
                put(b.x + dx, y, b.z + dz, k > archH - 0.2 ? warmGlowMid : whiteId);
                continue;
              }
            }
            const wx = b.x + dx, wz = b.z + dz;
            const isArchEdge = Math.abs(u) > aRad * 0.72 || isCrown;
            const isOuter = q > 0.78;
            if (y < b.base) {
              put(wx, y, wz, concreteId);
            } else if (isArchEdge) {
              put(wx, y, wz, whiteId);
            } else if (isLouver && isOuter) {
              put(wx, y, wz, warmWhiteId);
            } else if (isOuter) {
              put(wx, y, wz, spireGlassA);
            } else if (k % 5 === 0) {
              put(wx, y, wz, slabId);
            } else if (q > 0.56) {
              const lit = hash(wx >> 1, (wz >> 1) + (k >> 2) * 71, 68, seed) < 0.26;
              put(wx, y, wz, lit ? warmGlowSoft : steelDarkId);
            } else {
              put(wx, y, wz, steelDarkId);
            }
          }
        }
      }
      if (b.holo) {
        const sunAng = Math.atan2(-AEROGLASS_SUN.z, -AEROGLASS_SUN.x);
        const sideDir = Math.abs(Math.cos(b.angle - sunAng)) > 0.5 ? b.angle : b.angle + Math.PI;
        const off = b.radius * 0.92 + 1.5;
        drawBillboard(
          b.x + Math.cos(sideDir) * off,
          b.base + Math.round(b.height * 0.34),
          b.z + Math.sin(sideDir) * off,
          sideDir, 7, 20, b.palette % 3,
        );
      }
      continue;
    }

    // Family 2 (Crystal Glass Supertall Spire) & Family 3 (Tapered Sail / Split-Blade Highrise)
    {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const isCrystal = b.family === 2;
      const ext = Math.ceil(b.radius + 3);
      for (let y = yFloor; y < yTop; y++) {
        const k = y - b.base;
        const f = clamp(k / b.height, 0, 1);
        const taper = isCrystal ? (1 - 0.34 * f ** 1.35) : (1 - 0.22 * f);
        const aRad = Math.max(2.6, b.radius * taper);
        const bRad = Math.max(2.0, b.radius * (isCrystal ? 0.74 : 0.56) * taper);
        const isSkyLobby = k > 12 && k % 22 === 0 && f < 0.86;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const u = dx * cA + dz * sA;
            const v = dz * cA - dx * sA;
            const nu = Math.abs(u) / aRad;
            const nv = Math.abs(v) / bRad;
            const shapeVal = isCrystal ? (nu ** 3 + nv ** 3) : (nu ** 2.2 + nv ** 2.2);
            if (shapeVal > 1) continue;
            if (f > 0.84) {
              const cut = 0.84 + 0.16 * clamp((u / aRad + 1) * 0.5);
              if (f > cut) continue;
            }
            const wx = b.x + dx, wz = b.z + dz;
            const isOuter = shapeVal > 0.74;
            const isCornerRib = (nu > 0.76 && nv > 0.45) || (isCrystal && Math.abs(u) < 0.85 && isOuter);
            if (y < b.base) {
              put(wx, y, wz, concreteId);
            } else if (isCornerRib) {
              put(wx, y, wz, frameId);
            } else if (!isCrystal && k % 4 === 0 && isOuter && nv < 0.55) {
              put(wx, y, wz, whiteId);
            } else if (isOuter) {
              put(wx, y, wz, ((wx + wz + (k >> 2)) & 1) ? spireGlassA : spireGlassB);
            } else if (isSkyLobby) {
              put(wx, y, wz, shapeVal > 0.45 ? coolLobbyGlow : whiteId);
            } else if (k % 5 === 0) {
              put(wx, y, wz, slabId);
            } else if (shapeVal > 0.46) {
              const lit = hash(wx >> 1, (wz >> 1) + (k >> 2) * 89, 72, seed) < 0.24;
              put(wx, y, wz, lit ? warmGlowSoft : steelDarkId);
            } else {
              put(wx, y, wz, steelDarkId);
            }
          }
        }
      }
      if (isCrystal && yTop + 10 < ceiling) {
        microLine({ x: b.x + 0.4375, y: yTop, z: b.z + 0.4375 }, { x: b.x + 0.4375, y: yTop + 9, z: b.z + 0.4375 }, C.titanium, 'normal', 0, 2);
        micro(b.x + 0.4375, yTop + 9.25, b.z + 0.4375, 0xff5a4a, 'emissive', 88);
        micro(b.x + 0.5625, yTop + 9.25, b.z + 0.4375, 0xff5a4a, 'emissive', 88);
      }
      if (b.holo) {
        const sunAng = Math.atan2(-AEROGLASS_SUN.z, -AEROGLASS_SUN.x);
        const dirAng = sunAng + (r(118) - 0.5) * 1.1;
        const off = b.radius * 0.94 + 1.5;
        drawBillboard(
          b.x + Math.cos(dirAng) * off,
          b.base + Math.round(b.height * 0.36),
          b.z + Math.sin(dirAng) * off,
          dirAng, 7, 19, (b.palette + 1) % 3,
        );
      }
    }
  }

  for (const bb of plan.billboards) {
    drawBillboard(bb.x, bb.y, bb.z, bb.angle, bb.width, bb.height, bb.scheme, { x: bb.x, y: bb.y, z: bb.z });
  }

  // --- 5. Smooth curved elevated valley monorails & sleek white commuter trains. ---
  {
    const monoBeam = normalMat(C.white);
    const monoUnder = normalMat(C.concreteShade);
    const monoRail = normalMat(C.trackBed);
    const monoPier = normalMat(C.concrete);
    const trainWhite = normalMat(C.podWhite);
    const trainGlass = glassMat(C.darkGlass, 38);
    const trainHead = glowMat(0xfff5dc, 92);
    const trainWarm = glowMat(0xffdfad, 58);

    for (let m = Math.floor((oz - 50) / MONORAIL_PITCH) - 1; m <= Math.ceil((oz + depth + 50) / MONORAIL_PITCH) + 1; m++) {
      if (!aeroglassMonorailLine(m, config).present) continue;
      // 0.5m sub-steps keep curved box-girder decks smooth with zero diagonal checker gaps!
      let prev = aeroglassMonorailPath(m, ox - 10, config);
      for (let xi2 = (ox - 10) * 2 + 1; xi2 <= (ox + width + 10) * 2; xi2++) {
        const xf = xi2 * 0.5;
        const cur = aeroglassMonorailPath(m, xf, config);
        const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z) || 1;
        const ux = (cur.x - prev.x) / segLen, uz = (cur.z - prev.z) / segLen;
        const px = -uz, pz = ux;
        const baseY = Math.round(cur.y);
        if (near(cur.x, cur.z, 5)) {
          for (let w = -2; w <= 2; w += 0.5) {
            const wx = Math.round(cur.x + px * w);
            const wz = Math.round(cur.z + pz * w);
            const aw = Math.abs(w);
            put(wx, baseY, wz, aw > 1.3 ? monoBeam : aw > 0.6 ? monoRail : monoBeam);
            if (aw <= 1.2) put(wx, baseY - 1, wz, monoUnder);
            if (aw >= 1.9 && mod(Math.floor(xf), 3) !== 0) put(wx, baseY + 1, wz, railingGlassId);
          }
          if (xi2 % 44 === 0) {
            const ground = aeroglassTerrainHeight(Math.round(cur.x), Math.round(cur.z), config);
            boxId(Math.round(cur.x) - 1, Math.max(0, ground - 4), Math.round(cur.z) - 1, 2, Math.max(0, baseY - ground + 3), 2, monoPier);
          }
          const trainPhase = mod(Math.floor(xf) + m * 29, 76);
          if (trainPhase < 18) {
            const isEnd = trainPhase === 0 || trainPhase === 17;
            for (let w = -1; w <= 1; w += 0.5) {
              const wx = Math.round(cur.x + px * w);
              const wz = Math.round(cur.z + pz * w);
              const aw = Math.abs(w);
              put(wx, baseY + 1, wz, isEnd ? trainHead : trainWhite);
              put(wx, baseY + 2, wz, isEnd ? trainGlass : aw >= 0.75 ? (trainPhase % 3 === 0 ? trainWhite : trainGlass) : trainWarm);
              if (!isEnd) put(wx, baseY + 3, wz, trainWhite);
            }
          }
        }
        prev = cur;
      }
    }
  }

  // --- 6. HERO: Monumental sculpted station pylons & sweeping transparent glass sky-tubes + glowing pods! ---
  const tubeTopGlass = glassMat(C.tubeGlassTop, Math.round(64 + glassFactor * 16));
  const tubeSideGlass = glassMat(C.tubeGlassSide, Math.round(58 + glassFactor * 16));
  const keelHull = normalMat(C.titaniumMid);
  const keelLight = normalMat(C.titanium);
  const keelUnder = normalMat(C.steelDark);
  const trackBedId = normalMat(C.trackBed);
  const railSilverId = normalMat(C.railSilver);
  const railGlowId = glowMat(0x5ae2ff, 54);
  const collarSilverId = normalMat(C.titanium);
  const collarDarkId = normalMat(C.steelDark);
  const collarLightId = glowMat(0xcaf2ff, 68);
  const podWhiteId = normalMat(C.podWhite);
  const podSkirtId = normalMat(C.podSkirt);
  const podCabinGlow = glowMat(0xffdca2, 78);
  const podCabinAmber = glowMat(0xffc672, 70);
  const podHeadlight = glowMat(0xfff9e8, 96);
  const podTaillight = glowMat(0xff4a3d, 84);
  const podVisorGlass = glassMat(C.darkGlass, 34);

  // 6a. Monumental sculpted station pylons & curved cradle collars
  for (const py of plan.pylons) {
    if (!near(py.x, py.z, 20)) continue;
    const f = tubeFrame(py.j, py.x, config);
    const ground = aeroglassTerrainHeight(Math.round(py.x), Math.round(py.z), config);
    const px0 = Math.round(py.x), pz0 = Math.round(py.z);
    const cradleBottom = Math.floor(py.y - py.radius - 3);
    for (let y = Math.max(0, ground - 10); y <= cradleBottom && y < ceiling; y++) {
      const t = clamp((cradleBottom - y) / Math.max(12, cradleBottom - ground));
      const hw = Math.round(5 + t * 3);
      const hd = Math.round(4.5 + t * 2.5);
      const isBand = y % 5 === 0;
      for (let dz = -hd; dz <= hd; dz++) {
        for (let dx = -hw; dx <= hw; dx++) {
          if (Math.abs(dx) === hw && Math.abs(dz) === hd) continue;
          const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
          const id = isBand ? whiteId : edge && (Math.abs(dx) <= hw - 2 || Math.abs(dz) <= hd - 2) ? darkGlassId : concreteId;
          put(px0 + dx, y, pz0 + dz, id);
        }
      }
    }
    const R = py.radius;
    const pad = R + 3.5;
    for (let y = Math.max(0, Math.floor(py.y - pad - 4)); y <= Math.min(ceiling - 1, Math.ceil(py.y + pad)); y++) {
      for (let z = Math.floor(py.z - pad - 4); z <= Math.ceil(py.z + pad + 4); z++) {
        for (let x = Math.floor(py.x - pad - 4); x <= Math.ceil(py.x + pad + 4); x++) {
          const rx = x + 0.5 - py.x, ry = y + 0.5 - py.y, rz = z + 0.5 - py.z;
          const along = rx * f.tx + ry * f.ty + rz * f.tz;
          if (Math.abs(along) > 4.8) continue;
          const b = rx * f.bx + ry * f.by + rz * f.bz;
          const u = rx * f.ux + ry * f.uy + rz * f.uz;
          const d = Math.hypot(b, u);
          const inRing = d >= R - 0.1 && d <= R + 2.0 && (Math.abs(along) < 4.0 || u < 1.4);
          const inHaunch = u < -R * 0.42 && u > -R - 4.6 && Math.abs(b) < R + 1.6 - (-u - R * 0.42) * 0.42 && Math.abs(along) < 3.6;
          if (!inRing && !inHaunch) continue;
          const isGroove = Math.abs(along) > 1.5 && Math.abs(along) < 2.6 && d > R + 0.7;
          const isTrimGlow = Math.abs(along) < 0.7 && Math.abs(u) < 1.2 && d > R + 1.1;
          put(x, y, z, isTrimGlow ? collarLightId : isGroove ? steelDarkId : d > R + 1.0 ? whiteId : titaniumId);
        }
      }
    }
  }

  // 6b. Sweeping hollow transparent glass sky-tubes with clean perpendicular collars & glowing interior maglev pods!
  for (let j = Math.floor((oz - 80) / TUBE_PITCH) - 1; j <= Math.ceil((oz + depth + 80) / TUBE_PITCH) + 1; j++) {
    const ln = aeroglassTubeLine(j, config);
    if (!ln.present) continue;
    const R = ln.radius;
    const pad = R + 1.4;
    let prev = aeroglassTubePath(j, ox - 14, config);
    // Approximate true arc length from world x=0 using local tangent projection for crisp perpendicular rings!
    for (let xi = ox - 13; xi <= ox + width + 14; xi++) {
      const cur = aeroglassTubePath(j, xi, config);
      const dx = cur.x - prev.x, dy = cur.y - prev.y, dz = cur.z - prev.z;
      const l2 = dx * dx + dy * dy + dz * dz || 1;
      const segLen = Math.sqrt(l2);
      const tx = dx / segLen, ty = dy / segLen, tz = dz / segLen;
      const bxR = tz, bzR = -tx, bLen = Math.hypot(bxR, bzR) || 1;
      const bx = bxR / bLen, bz = bzR / bLen;
      const ux = ty * bz, uy = tz * bx - tx * bz, uz = -ty * bx;

      if (near((prev.x + cur.x) / 2, (prev.z + cur.z) / 2, Math.abs(dx) / 2 + pad + 2, Math.abs(dz) / 2 + pad + 2)) {
        // Sleek intermediate concrete pier every 106m (away from main station pylons)
        if (mod(xi, 106) === 0 && Math.abs(mod(xi + 132, TUBE_SPAN) - TUBE_SPAN / 2) < TUBE_SPAN * 0.34) {
          const ground = aeroglassTerrainHeight(Math.round(cur.x), Math.round(cur.z), config);
          const topP = Math.floor(cur.y - R);
          boxId(Math.round(cur.x) - 1, Math.max(0, ground - 6), Math.round(cur.z) - 1, 3, Math.max(0, topP - ground + 6), 3, concreteId);
        }

        const y0 = Math.max(0, Math.floor(Math.min(prev.y, cur.y) - pad));
        const y1 = Math.min(ceiling, Math.ceil(Math.max(prev.y, cur.y) + pad));
        const z0 = Math.floor(Math.min(prev.z, cur.z) - pad);
        const z1 = Math.ceil(Math.max(prev.z, cur.z) + pad);
        const x0 = Math.floor(Math.min(prev.x, cur.x) - pad);
        const x1 = Math.ceil(Math.max(prev.x, cur.x) + pad);

        for (let y = y0; y < y1; y++) {
          for (let z = z0; z < z1; z++) {
            for (let x = x0; x < x1; x++) {
              const rx = x + 0.5 - prev.x, ry = y + 0.5 - prev.y, rz = z + 0.5 - prev.z;
              const raw = (rx * dx + ry * dy + rz * dz) / l2;
              if (raw < -0.05 || raw > 1.05) continue;
              const t = clamp(raw);
              const wx = rx - dx * t, wy = ry - dy * t, wz = rz - dz * t;
              const b = wx * bx + wz * bz;
              const u = wx * ux + wy * uy + wz * uz;
              const d = Math.hypot(b, u);
              if (d > pad) continue;

              // Projection along the true 3D centerline coordinate (perpendicular slices, zero aliasing!)
              const sCoord = (prev.x + dx * t) * 1.08;
              const ringPhase = mod(sCoord + j * 7, 18);
              const isCollar = ringPhase < 2.2;
              const outerR = isCollar ? R + 0.85 : R;
              if (d > outerR) continue;

              // 1. Hollow clear interior of the transparent glass sky-tube:
              if (d < R - 1.05) {
                // Interior dual maglev track deck
                if (u <= -R * 0.48 && u >= -R * 0.78 && Math.abs(b) <= R * 0.64) {
                  if (u > -R * 0.55 && Math.abs(Math.abs(b) - 1.75) < 0.58) {
                    put(x, y, z, railSilverId);
                  } else if (u > -R * 0.58 && Math.abs(Math.abs(b) - 2.8) < 0.45) {
                    put(x, y, z, railGlowId);
                  } else {
                    put(x, y, z, trackBedId);
                  }
                  continue;
                }

                // Sleek warm-glowing Maglev Pods / Express Trains gliding INSIDE the transparent glass tube!
                const podCycle = mod(sCoord + j * 23 + 22, 46);
                let podLocal = -999;
                let podHalf = 8.4;
                if (podCycle >= 4 && podCycle <= 21) {
                  podLocal = podCycle - 12.5;
                  podHalf = 8.4;
                } else if (podCycle >= 25 && podCycle <= 37) {
                  podLocal = podCycle - 31;
                  podHalf = 6.0;
                }
                if (podLocal > -900) {
                  const uPod = u + 1.15;
                  const podProfile = (podLocal / podHalf) ** 2 + (b / 2.65) ** 2 + (uPod / 2.35) ** 2;
                  if (podProfile <= 1 && uPod >= -1.85) {
                    const isNose = podLocal > podHalf * 0.78;
                    const isTail = podLocal < -podHalf * 0.78;
                    const isSideWin = Math.abs(b) > 1.45 && uPod > -0.55 && uPod < 1.0 && Math.abs(podLocal) < podHalf * 0.74;
                    const isFrontGlass = (isNose || isTail) && uPod > -0.25 && uPod < 1.25;
                    if (isNose && uPod <= -0.25 && Math.abs(b) > 0.5) {
                      put(x, y, z, podHeadlight);
                    } else if (isTail && uPod <= -0.25 && Math.abs(b) > 0.5) {
                      put(x, y, z, podTaillight);
                    } else if (isFrontGlass) {
                      put(x, y, z, podVisorGlass);
                    } else if (isSideWin) {
                      const mullion = Math.abs(mod(podLocal + 24, 3.2) - 1.6) > 1.28;
                      put(x, y, z, mullion ? trackBedId : Math.abs(podLocal) < podHalf * 0.36 ? podCabinGlow : podCabinAmber);
                    } else if (uPod < -0.75) {
                      put(x, y, z, podSkirtId);
                    } else {
                      put(x, y, z, podWhiteId);
                    }
                    continue;
                  }
                }

                putAir(x, y, z);
                continue;
              }

              // 2. Outer wall of the glass sky-tube: crisp perpendicular titanium ring collars + crystal glass shell!
              if (isCollar) {
                const isDarkBand = ringPhase >= 0.75 && ringPhase <= 1.45;
                const isLight = !isDarkBand && Math.abs(u) < 0.8 && d > R + 0.2;
                put(x, y, z, isLight ? collarLightId : isDarkBand ? collarDarkId : collarSilverId);
              } else if (u <= -R * 0.50) {
                put(x, y, z, u < -R * 0.78 ? keelUnder : Math.abs(b) > R * 0.5 ? keelLight : keelHull);
              } else {
                // Smooth translucent crystal glass wall (Space transparency ~72-78%!)
                put(x, y, z, u > R * 0.32 ? tubeTopGlass : tubeSideGlass);
              }
            }
          }
        }

        // Crisp 0.125m external longitudinal metal framing rails positioned cleanly outside the glass shell!
        for (const ang of [0.42, Math.PI - 0.42, 1.15, Math.PI - 1.15]) {
          const ca = Math.cos(ang) * (R + 0.35), sa = Math.sin(ang) * (R + 0.35);
          microLine(
            { x: prev.x + bx * ca + ux * sa, y: prev.y + uy * sa, z: prev.z + bz * ca + uz * sa },
            { x: cur.x + bx * ca + ux * sa, y: cur.y + uy * sa, z: cur.z + bz * ca + uz * sa },
            C.titanium, 'normal', 0, 2,
          );
        }
      }
      prev = cur;
    }
  }

  // --- 7. Autonomous quadcopter drones & sleek white VTOL air-shuttles (0.125m micro-voxels, all 3 materials!). ---
  for (const cr of plan.craft) {
    if (!near(cr.x, cr.z, 5)) continue;
    const fx = Math.cos(cr.heading), fz = Math.sin(cr.heading), sx = -fz, sz = fx;
    if (cr.kind === 'drone') {
      // Crisp quadcopter drone (~2.2m span so it reads cleanly in the sunlit sky near the glass tube!)
      for (let a = -0.5; a <= 0.5; a += M) {
        for (let b = -0.375; b <= 0.375; b += M) {
          for (let c = 0; c <= 0.375; c += M) {
            const x = cr.x + fx * a + sx * b, z = cr.z + fz * a + sz * b, y = cr.y + c;
            const isFront = a >= 0.375 && c <= 0.25;
            micro(x, y, z, isFront ? 0x5ce8ff : cr.tone === 0 ? C.podWhite : C.droneBody, isFront ? 'emissive' : 'normal', isFront ? 86 : 0);
          }
        }
      }
      for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const tipX = cr.x + fx * sa * 1.125 + sx * sb * 1.125;
        const tipZ = cr.z + fz * sa * 1.125 + sz * sb * 1.125;
        microLine({ x: cr.x, y: cr.y + 0.125, z: cr.z }, { x: tipX, y: cr.y + 0.25, z: tipZ }, C.droneArm, 'normal', 0, 2);
        micro(tipX, cr.y + 0.125, tipZ, sa > 0 ? 0x5ae8ff : 0xff5544, 'emissive', 84);
        for (let ra = -0.5; ra <= 0.5; ra += M) {
          for (let rb = -0.5; rb <= 0.5; rb += M) {
            if (ra * ra + rb * rb > 0.26) continue;
            micro(tipX + ra, cr.y + 0.375, tipZ + rb, C.rotorDisc, 'translucent', 74);
          }
        }
      }
    } else {
      // Sleek white aerodynamic VTOL air-shuttle with translucent cockpit canopy & glowing thrusters!
      const bodyCol = [C.podWhite, 0xd4dce3, 0xc2cdd8][cr.tone];
      for (let a = -2.0; a <= 2.0; a += M) {
        for (let b = -0.875; b <= 0.875; b += M) {
          for (let c = 0; c <= 0.875; c += M) {
            const e = (a / 2.05) ** 2 + (b / 0.9) ** 2 + ((c - 0.34) / 0.58) ** 2;
            if (e > 1 || e < 0.5) continue;
            const x = cr.x + fx * a + sx * b, z = cr.z + fz * a + sz * b, y = cr.y + c;
            if (a > 1.6 && Math.abs(b) > 0.2) {
              micro(x, y, z, 0xfff5dc, 'emissive', 92);
            } else if (a < -1.6 && Math.abs(b) > 0.25) {
              micro(x, y, z, 0xff5544, 'emissive', 82);
            } else if (c > 0.42 && a > -0.4 && a < 1.1) {
              micro(x, y, z, C.darkGlass, 'translucent', 44);
            } else if (c < 0.13 && Math.abs(b) < 0.45) {
              micro(x, y, z, 0x4de6ff, 'emissive', 78);
            } else {
              micro(x, y, z, bodyCol, 'normal', 0);
            }
          }
        }
      }
      for (const side of [-1, 1]) {
        microLine(
          { x: cr.x + sx * side * 0.75, y: cr.y + 0.25, z: cr.z + sz * side * 0.75 },
          { x: cr.x - fx * 0.5 + sx * side * 1.75, y: cr.y + 0.25, z: cr.z - fz * 0.5 + sz * side * 1.75 },
          C.titanium, 'normal', 0, 2,
        );
      }
    }
  }

  // --- 8. Emit visible 1m voxels (never culling opaque voxels behind translucent glass!) + micro cubes. ---
  const isOpaque = (id: number) => id !== 0 && palette[id].material !== 'translucent';
  const emit = (v: AeroglassVoxel) => {
    voxels.push(v);
    const i = Math.floor(v.x + width / 2) + Math.floor(v.z + depth / 2) * width;
    heights[i] = Math.max(heights[i], v.y + v.sizeY);
  };

  let standardCount = 0;
  let translucentCount = 0;
  let emissiveCount = 0;

  for (let y = 0; y < ceiling; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const id = cells[x + z * width + y * layer];
        if (!id) continue;
        if (
          isOpaque(get(x - 1, y, z)) && isOpaque(get(x + 1, y, z))
          && isOpaque(get(x, y - 1, z)) && isOpaque(get(x, y + 1, z))
          && isOpaque(get(x, y, z - 1)) && isOpaque(get(x, y, z + 1))
        ) continue;
        const p = palette[id];
        emit({
          x: x + 0.5 - width / 2,
          y,
          z: z + 0.5 - depth / 2,
          sizeX: 1,
          sizeY: 1,
          sizeZ: 1,
          color: p.color,
          material: p.material,
          materialId: p.materialId,
          transparency: p.transparency,
          emission: p.emission,
          emissive: p.emissive,
          intensity: p.intensity,
        });
        standardCount++;
        if (p.material === 'translucent') translucentCount++;
        else if (p.material === 'emissive') emissiveCount++;
      }
    }
  }

  for (const v of micros.values()) {
    if (get(Math.floor(v.x + width / 2), Math.floor(v.y), Math.floor(v.z + depth / 2))) continue;
    emit(v);
    if (v.material === 'translucent') translucentCount++;
    else if (v.material === 'emissive') emissiveCount++;
  }

  // --- 9. Hero overview camera (clean foreground glass tube sweep from left station pylon up-right
  //        toward forested valley, monorail, biodome & tall ridge skyline), cycling landmarks & clear deck view. ---
  const local = (p: AeroglassPoint): AeroglassPoint => ({
    x: p.x - ox - width / 2,
    y: p.y,
    z: p.z - oz - depth / 2,
  });
  const inside = (x: number, z: number, m: number) =>
    x > ox + m && x < ox + width - m && z > oz + m && z < oz + depth - m;

  const blockedCone = (a: AeroglassPoint, b: AeroglassPoint, skip?: AeroglassBuilding) => {
    let hits = 0;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const qx = a.x + (b.x - a.x) * t, qy = a.y + (b.y - a.y) * t, qz = a.z + (b.z - a.z) * t;
      if (qy < aeroglassTerrainHeight(qx, qz, config) + 3) hits += k < 6 ? 60 : 3;
      for (const bld of plan.buildings) {
        if (bld === skip) continue;
        // Penalize any tall building photobombing near the foreground lens!
        const clearance = k < 10 ? bld.radius + 14 : bld.radius + 3;
        if (Math.hypot(bld.x - qx, bld.z - qz) < clearance && qy < bld.base + bld.height + 6) {
          hits += k < 8 ? 55 : 2;
        }
      }
    }
    return hits;
  };

  const ascendingPylons = plan.pylons
    .filter(p => (p.k & 1) === 0 && p.x > ox + 12 && p.x < ox + width - 80 && p.z > oz + 24 && p.z < oz + depth - 24)
    .sort((a, b) => Math.hypot(a.x - (config.offsetX - 110), a.z - (config.offsetZ + 52))
      - Math.hypot(b.x - (config.offsetX - 110), b.z - (config.offsetZ + 52)));
  const heroPylon = ascendingPylons[0] ?? plan.pylons[0] ?? null;

  let overviewView: AeroglassView;
  if (heroPylon) {
    const midSpan = aeroglassTubePath(heroPylon.j, heroPylon.x + 150, config);
    const lookTarget: AeroglassPoint = {
      x: heroPylon.x + 156,
      y: Math.max(46, heroPylon.y + 8),
      z: midSpan.z - 16,
    };
    let bestView: AeroglassView | null = null;
    let bestScore = Infinity;
    for (const [dx, dy, dz] of [
      [-16, 8, 42],
      [-22, 10, 50],
      [-10, 12, 38],
      [-26, 16, 58],
      [-20, 14, -48],
    ]) {
      const pos = { x: heroPylon.x + dx, y: heroPylon.y + dy, z: heroPylon.z + dz };
      const sc = blockedCone(pos, lookTarget);
      if (sc < bestScore) {
        bestScore = sc;
        bestView = { position: local(pos), target: local(lookTarget) };
      }
    }
    overviewView = bestView!;
  } else {
    const groundC = aeroglassTerrainHeight(config.offsetX, config.offsetZ, config);
    overviewView = {
      position: local({ x: config.offsetX - 110, y: groundC + 74, z: config.offsetZ + 110 }),
      target: local({ x: config.offsetX + 40, y: groundC + 44, z: config.offsetZ - 32 }),
    };
  }

  const landmarkViews: (AeroglassView & { label: string })[] = [];
  if (heroPylon) {
    const podPt = aeroglassTubePath(heroPylon.j, heroPylon.x + 56, config);
    landmarkViews.push({
      label: `glass tube ${heroPylon.id}`,
      position: local({ x: podPt.x - 22, y: podPt.y + 3, z: podPt.z + 24 }),
      target: local({ x: podPt.x + 22, y: podPt.y + 4, z: podPt.z - 8 }),
    });
  }
  const dome = plan.buildings
    .filter(b => b.family === 4 && inside(b.x, b.z, 24))
    .sort((a, b) => Math.hypot(a.x - config.offsetX, a.z - config.offsetZ) - Math.hypot(b.x - config.offsetX, b.z - config.offsetZ))[0];
  if (dome) {
    landmarkViews.push({
      label: `biodome ${dome.id}`,
      position: local({ x: dome.x - 26, y: dome.base + 18, z: dome.z + 30 }),
      target: local({ x: dome.x, y: dome.base + 6, z: dome.z }),
    });
  }
  const notable = plan.buildings
    .filter(b => (b.family === 1 || b.family === 2) && inside(b.x, b.z, 24))
    .sort((a, b) => (b.family === 1 ? 40 : 0) + b.height - ((a.family === 1 ? 40 : 0) + a.height));
  for (const t of notable.slice(0, 3)) {
    const target = { x: t.x, y: t.base + t.height * 0.52, z: t.z };
    const pos = { x: t.x - 42, y: t.base + t.height * 0.56, z: t.z + 52 };
    landmarkViews.push({
      label: `${AEROGLASS_FAMILIES[t.family]} ${t.id}`,
      position: local(pos),
      target: local(target),
    });
  }

  // Grounded rooftop-plaza deck camera: stands on the open center observation deck of a mid-valley
  // eco-tower (offset 40-110m from the tube so you see rooftop greenery, sweeping glass tube AND skyline!).
  const deckHost = plan.buildings
    .filter(b => (b.family === 0 || b.family === 5) && !b.underTube && inside(b.x, b.z, b.radius + 8) && b.base + b.height + 5 < ceiling)
    .sort((a, b) => {
      const score = (bld: AeroglassBuilding) => {
        const dCenter = Math.hypot(bld.x - config.offsetX, bld.z - config.offsetZ);
        const tubeDist = heroPylon ? Math.abs(bld.z - aeroglassTubePath(heroPylon.j, bld.x, config).z) : 60;
        const tubePenalty = Math.abs(tubeDist - 62);
        return dCenter * 0.5 + tubePenalty;
      };
      return score(a) - score(b);
    })[0];
  let deckView: AeroglassView | null = null;
  if (deckHost) {
    const px = Math.floor(deckHost.x);
    const pz = Math.floor(deckHost.z);
    let top = -1;
    for (let y = ceiling - 1; y >= 0; y--) {
      if (isOpaque(get(px - ox, y, pz - oz))) { top = y; break; }
    }
    if (top > 0) {
      const look = heroPylon
        ? (() => {
            const tp = aeroglassTubePath(heroPylon.j, px + 56, config);
            return { x: tp.x, y: Math.min(top + 34, Math.max(top + 14, tp.y - 6)), z: tp.z };
          })()
        : { x: px + 80, y: top + 20, z: pz - 60 };
      deckView = {
        position: local({ x: px + 0.5, y: top + 2.7, z: pz + 0.5 }),
        target: local(look),
      };
    }
  }

  return {
    voxels,
    heights,
    width,
    depth,
    standardCount,
    translucentCount,
    emissiveCount,
    pylons: plan.pylons.filter(p => near(p.x, p.z, 14)),
    buildings: plan.buildings.filter(b => near(b.x, b.z, b.radius)),
    billboards: plan.billboards.filter(bb => near(bb.x, bb.z, bb.width)),
    craft: plan.craft.filter(c => near(c.x, c.z, 3)),
    overviewView,
    landmarkViews,
    deckView,
  };
}
