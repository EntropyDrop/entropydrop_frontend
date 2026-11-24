/** Coordinate-addressed futuristic eco-megacity at sunset dusk:
 * sculptural twisting & curved-fin glass spires, double-helix garden landmarks,
 * multi-level sweeping glass-and-chrome transit tubes with Y-junction hubs and
 * luminous collars, parallel maglev sky-rails, lush verdant eco-skybridges,
 * upper truss bridges, holographic billboards, flying hovercraft and a lit lower city.
 *
 * Geometry is exclusively 1m / 0.125m cubes with normal / emissive materials.
 * Planning is world-coordinate addressed and independent of the visible crop.
 * X/Z are cube centres relative to the crop; Y is the bottom in metres. */

export interface HyperloopConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  loopHeight: number;
  loopDensity: number;
  loopTwist: number;
  loopTubes: number;
  loopGardens: number;
  loopBridges: number;
  loopTraffic: number;
  loopLights: number;
  loopGlow: number;
}

export const HYPERLOOP_DEFAULTS = {
  loopHeight: 184,
  loopDensity: 0.88,
  loopTwist: 0.72,
  loopTubes: 0.8,
  loopGardens: 0.88,
  loopBridges: 0.7,
  loopTraffic: 0.65,
  loopLights: 0.68,
  loopGlow: 0.22,
};

/** Low golden-hour sunset direction shared by the sky panorama, key light and hero camera. */
export const HYPERLOOP_SUN = { x: -0.42, y: 0.14, z: -0.896 };

export interface HyperloopPoint {
  x: number;
  y: number;
  z: number;
}

export interface HyperloopVoxel extends HyperloopPoint {
  sizeX: 1 | 0.125;
  sizeY: 1 | 0.125;
  sizeZ: 1 | 0.125;
  color: number;
  material: 'normal' | 'emissive';
  emissive: boolean;
  intensity: number;
}

export interface HyperloopTower {
  id: string;
  x: number;
  z: number;
  family: number;
  radius: number;
  aspect: number;
  height: number;
  ext: number;
  podium: number;
  angle: number;
  twist: number;
  phase: number;
  priority: number;
  glass: number;
  frame: number;
  crown: number;
  billboard: number;
  gardens: number[];
}

export interface HyperloopBlock {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  height: number;
  family: number;
  facade: number;
  priority: number;
}

export interface HyperloopTube {
  id: string;
  from: string;
  to: string;
  level: number;
  endLevel: number;
  start: HyperloopPoint;
  end: HyperloopPoint;
  length: number;
  collars: number[];
  isHubBranch: boolean;
}

export interface HyperloopHub {
  id: string;
  x: number;
  y: number;
  z: number;
  towers: string[];
}

export interface HyperloopBridge {
  id: string;
  from: string;
  to: string;
  level: number;
  kind: 'garden' | 'truss';
  start: HyperloopPoint;
  end: HyperloopPoint;
}

export interface HyperloopVehicle {
  x: number;
  y: number;
  z: number;
  kind: 'cruiser' | 'drone';
}

export interface HyperloopView {
  position: HyperloopPoint;
  target: HyperloopPoint;
  label?: string;
}

type Kind = (px: number, pz: number, wx: number, wz: number) => number;
interface Shape {
  kind: Kind;
  rot: number;
  nominal: number;
  reach: number;
}
interface TowerLevel extends Shape {
  f: number;
  garden: boolean;
  slab: boolean;
}
type Paint = (px: number, pz: number, wx: number, wz: number, kind: number, edge: boolean, top: boolean) => number;
interface Section {
  kind: Kind;
  reach: number;
  paint: Paint;
}
interface TubeCandidate {
  id: string;
  a: HyperloopTower;
  b: HyperloopTower;
  level: number;
  endLevel: number;
  priority: number;
  pts: HyperloopPoint[];
  along: number[];
  length: number;
  box: number[];
  hub?: HyperloopPoint;
}
interface HubCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  towers: [HyperloopTower, HyperloopTower, HyperloopTower];
  priority: number;
  branches: TubeCandidate[];
}

/** Tower families, indexed by HyperloopTower.family. */
export const TOWER_FAMILIES = ['twist', 'blade', 'vase', 'ribbed', 'stack', 'helix'] as const;

const M = 0.125;
const TAU = Math.PI * 2;
const TUBE_R = 2.65;
const TOWER_PITCH = 56;
const BLOCK_PITCH = 24;
const BLADE = 1;
const VASE = 2;
const RIBBED = 3;
const STACK = 4;
const HELIX = 5;
const PARK = 4;

const C = {
  asphalt: 0x242834,
  paving: 0x5d626c,
  core: 0x161d29,
  roof: 0x626973,
  white: 0xe6eaf0,
  cream: 0xd8d3c8,
  silver: 0xc2cddb,
  graphite: 0x353c48,
  chrome: 0xd4e1f0,
  steel: 0x607085,
  tubeGlassHi: 0x5688bf,
  tubeGlassMid: 0x366091,
  tubeGlassLow: 0x1e3959,
  tubeCore: 0x182130,
  tubeTrack: 0x9ad4ff,
  grass: 0x457c2d,
  soil: 0x3f362d,
  trunk: 0x4c3a2c,
  collar: 0xdcf4ff,
  cyan: 0x56dcff,
  magenta: 0xff5ec4,
  violet: 0xa474ff,
  gold: 0xffc96e,
  red: 0xff3b3b,
  lamp: 0xffd28c,
  shop: 0xffc272,
  canopy: 0x16243a,
};

const GLASS = [0x2b5080, 0x245978, 0x345892, 0x2e4a82, 0x285e8a];
const FRAMES = [C.white, C.silver, C.cream, C.graphite];
const WINDOWS = [0xffbc5e, 0xffa84e, 0xffd896, 0xffc67d, 0xc8e4ff];
const LEAVES = [0x2d6625, 0x3b7a2b, 0x235222, 0x528f36, 0x437f30, 0x619a3f];
const HULLS = [0xe2e8f0, 0xb8c4d4, 0x2e3645, 0xd4dce6];

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function hash(x: number, z: number, salt: number, seed: number) {
  let h = Math.imul(seed ^ 0x9e3779b9 ^ x, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16) ^ z, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13) ^ salt, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, z: number, seed: number, salt: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const dx = x - ix;
  const dz = z - iz;
  const u = dx * dx * (3 - 2 * dx);
  const v = dz * dz * (3 - 2 * dz);
  const a = hash(ix, iz, salt, seed);
  const b = hash(ix + 1, iz, salt, seed);
  const c = hash(ix, iz + 1, salt, seed);
  const d = hash(ix + 1, iz + 1, salt, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

const field = (x: number, z: number, seed: number, salt: number) =>
  noise(x, z, seed, salt) * 0.65 + noise(x * 2.17 + 37, z * 2.17 - 19, seed, salt + 1) * 0.35;

const tint = (color: number, f: number) => {
  const c = (shift: number) => Math.round(clamp(((color >> shift) & 255) * f, 0, 255));
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

/** Horizontal section of a tower. grow > 0 widens it (podium); grow < 0 recesses it (sky garden).
 * Kinds: 1 glass body, 2 helix ribbon slab, 3 ribbon parapet, 4 ribbon planting, 5 sculptural exterior fin. */
function towerShape(t: HyperloopTower, y: number, f: number, grow: number, seed: number): Shape {
  if (t.family === BLADE) {
    // Faceted lens plan with dramatic diagonal sliced crown.
    const s = 1 - 0.16 * f;
    const A = t.radius * 1.48 * s + grow;
    const B = Math.max(1.5, t.radius * 0.62 * s + grow);
    const rot = t.angle + t.twist * 0.45 * f;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const side = t.phase < 0.5 ? 1 : -1;
    const drop = (t.height - t.podium) * 0.24;
    return {
      rot,
      nominal: (A + B) / 2,
      reach: A + 1.5,
      kind: (px, pz) => {
        const u = (px * c + pz * sn) / A;
        const v = Math.abs(pz * c - px * sn);
        if (u * u >= 1 || v > B * (1 - u * u) + 0.45) return 0;
        if (y >= t.height - (1 + side * u) * 0.5 * drop) return 0;
        // Sleek bright spine fins along the pointed blade tips.
        if (grow === 0 && Math.abs(u) > 0.86) return 5;
        return 1;
      },
    };
  }
  if (t.family === VASE) {
    // Organic tapered oval megatower with sweeping curved structural vertical fins.
    const belly = 0.84 + 0.22 * Math.sin(Math.PI * (f * 1.15 + t.phase * 0.5)) - (f > 0.9 ? (f - 0.9) * 3.8 : 0);
    const a = Math.max(2, t.radius * t.aspect * belly + grow);
    const b = Math.max(2, t.radius * belly + grow);
    const rot = t.angle + t.twist * 0.42 * f;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const hasFins = grow === 0 && f > 0.04 && f < 0.94;
    return {
      rot,
      nominal: (a + b) / 2,
      reach: Math.max(a, b) + 2.4,
      kind: (px, pz) => {
        const qx = px * c + pz * sn;
        const qz = pz * c - px * sn;
        const u = qx / a;
        const v = qz / b;
        const r2 = u * u + v * v;
        if (r2 <= 1) return 1;
        if (hasFins && r2 <= 1.24) {
          // Two sweeping metallic structural ribs wrapping around the flanks.
          const ang = Math.atan2(v, u);
          const sweep = Math.sin(f * Math.PI * 1.3 + t.phase * TAU) * 0.45;
          const d0 = Math.abs(Math.sin(ang - sweep));
          if (d0 < 0.16) return 5;
        }
        return 0;
      },
    };
  }
  if (t.family === RIBBED) {
    // Cylindrical tower with bold horizontal gleaming ring balconies and tapered crown.
    const ring = grow === 0 && (y - t.podium) % 5 === 4 && f < 0.95 ? 1.3 : 0;
    const taper = (1 - 0.18 * f) * (f > 0.9 ? 1 - (f - 0.9) * 2.8 : 1);
    const r = Math.max(2, t.radius * taper + grow + ring);
    const r2 = r * r;
    return {
      rot: t.angle,
      nominal: r,
      reach: r + 1.5,
      kind: (px, pz) => (px * px + pz * pz <= r2 ? 1 : 0),
    };
  }
  if (t.family === STACK) {
    // Sculptural white-framed eco-tower with angled sloped green roof terraces!
    const section = Math.max(0, Math.floor((y - t.podium) / 30));
    const sr = (salt: number) => hash(section, t.x * 31 + t.z, salt, seed);
    const s = 1 - 0.065 * section;
    const rot = t.angle + section * t.twist * 0.48;
    const a = Math.max(2, t.radius * t.aspect * s + grow);
    const b = Math.max(2, t.radius * s + grow);
    const dx = grow > 0 ? 0 : (sr(1) - 0.5) * 3.5;
    const dz = grow > 0 ? 0 : (sr(2) - 0.5) * 3.5;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    // Upper 22% slopes diagonally to create dramatic planted green roof terraces.
    const slopeBase = t.height - Math.max(12, (t.height - t.podium) * 0.22);
    return {
      rot,
      nominal: (a + b) / 2,
      reach: Math.max(a, b) * 1.18 + 3,
      kind: (px, pz) => {
        const qx = px - dx;
        const qz = pz - dz;
        const lx = (qx * c + qz * sn) / a;
        const lz = (qz * c - qx * sn) / b;
        if (Math.abs(lx) ** 4 + Math.abs(lz) ** 4 > 1) return 0;
        if (y > slopeBase) {
          const roofLim = slopeBase + (1 - lx) * 0.5 * (t.height - slopeBase);
          if (y > roofLim) return 0;
        }
        return 1;
      },
    };
  }
  if (t.family === HELIX) {
    // Iconic double-helix eco-tower: dark glass cylindrical core wrapped by two sweeping
    // sculptural bright white helical ribbons cradling lush green terraced gardens!
    const rc = Math.max(4, t.radius * (1 - 0.13 * f) + grow);
    const ro = rc + 5.2;
    const rc2 = rc * rc;
    const ro2 = ro * ro;
    const pitch = 46;
    const half = pitch / 2;
    const ribbons = grow === 0 && y >= t.podium + 2 && y < t.height - 4;
    return {
      rot: 0,
      nominal: rc,
      reach: (ribbons ? ro : rc) + 1.5,
      kind: (px, pz, wx, wz) => {
        const rr = px * px + pz * pz;
        if (rr <= rc2) return 1;
        if (!ribbons || rr > ro2) return 0;
        const turn = (Math.atan2(pz, px) + Math.PI) / TAU;
        const phase = (((y - t.podium - turn * pitch) % half) + half) % half;
        // Bold bright white sculptural ribbon slab (2.8m thick for crisp 1m voxel reading).
        if (phase < 2.8) return 2;
        const r = Math.sqrt(rr);
        const g = hash(wx, wz, y + 900, seed);
        // Sculpted outer white parapet rim.
        if (phase < 3.9 && r > ro - 1.35) return 3;
        // Lush dense multi-height terraced greenery rising visibly above the spiraling ribbon!
        if (phase < 5.6 && r <= ro - 0.8 && g < 0.92) return 4;
        if (phase < 7.4 && r < ro - 1.4 && r > rc + 0.5 && g < 0.54) return 4;
        return 0;
      },
    };
  }
  // Twisting rounded-rectangle glass spire with subtle corner structural ribs & softened crown.
  const s = (1 - 0.17 * f) * (f > 0.88 ? 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - ((f - 0.88) / 0.12) ** 2)) : 1);
  const a = Math.max(2, t.radius * t.aspect * s + grow);
  const b = Math.max(2, t.radius * s + grow);
  const rot = t.angle + t.twist * 1.75 * f;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  return {
    rot,
    nominal: (a + b) / 2,
    reach: Math.max(a, b) * 1.15 + 1.5,
    kind: (px, pz) => {
      const u = Math.abs((px * c + pz * sn) / a);
      const v = Math.abs((pz * c - px * sn) / b);
      const val = u ** 3 + v ** 3;
      if (val > 1) return 0;
      if (grow === 0 && val > 0.82 && Math.abs(u - v) < 0.22) return 5;
      return 1;
    },
  };
}

function towerLevel(t: HyperloopTower, y: number, seed: number): TowerLevel | null {
  if (y < 1 || y >= t.height) return null;
  if (y < t.podium) return { ...towerShape(t, y, 0, 2.5, seed), f: 0, garden: false, slab: false };
  const f = (y - t.podium) / Math.max(1, t.height - t.podium);
  const garden = t.gardens.some(g => y >= g && y < g + 5);
  return { ...towerShape(t, y, f, garden ? -3.2 : 0, seed), f, garden, slab: t.gardens.includes(y + 1) };
}

/** Two-scale hard-core sampling in world space: iconic skyscrapers on a 56m lattice
 * and low-rise eco-blocks/parks on a 24m lattice. Every coordinate is self-contained. */
export function planVerdantHyperloop(config: HyperloopConfig, margin = 160, blockMargin = margin) {
  const seed = Math.floor(config.seed);
  const density = clamp(config.loopDensity);
  const greens = clamp(config.loopGardens);
  const maxHeight = clamp(config.loopHeight, 100, 190);
  const twist = clamp(config.loopTwist);
  const towerCache = new Map<string, HyperloopTower>();
  const present = new Map<string, boolean>();

  const makeTower = (ix: number, iz: number) => {
    const id = `T:${ix}:${iz}`;
    const found = towerCache.get(id);
    if (found) return found;
    const r = (salt: number) => hash(ix, iz, salt, seed);
    const hero = ix === 0 && iz === 0;
    // Slight seed-sensitive placement even near origin so every seed builds a fresh skyline.
    const x = hero ? Math.round((r(1) - 0.5) * 8) : Math.round((ix + (r(1) - 0.5) * 0.52) * TOWER_PITCH);
    const z = hero ? Math.round((r(2) - 0.5) * 8) : Math.round((iz + (r(2) - 0.5) * 0.52) * TOWER_PITCH);

    // Ensure the signature architectural ensemble (helix, curved-fin vase, blade+billboard, twist, stack)
    // is richly represented around the origin while staying 100% deterministic & varied by seed everywhere.
    let family = r(3) < 0.085 ? HELIX : Math.floor(r(4) * 5);
    if (hero) family = HELIX;
    else if (ix === 1 && iz === 0) family = VASE;
    else if (ix === -1 && iz === -1) family = BLADE;
    else if (ix === -1 && iz === 0) family = 0; // twist
    else if (ix === -1 && iz === 1) family = STACK;
    else if (ix === 2 && iz === 0) family = RIBBED;

    const coreRing = Math.max(Math.abs(ix), Math.abs(iz)) <= 1;
    const tall = hero || (coreRing && r(5) > 0.14) || r(5) > 0.28;
    const downtown = field(x / 460, z / 460, seed, 20);
    const height = Math.round(
      maxHeight *
        (hero
          ? 0.88 + r(6) * 0.07
          : ix === 1 && iz === 0
            ? 0.92 + r(6) * 0.06
            : ix === -1 && iz === 1
              ? 0.44 + r(6) * 0.14
              : tall
                ? 0.68 + r(6) * 0.24 + downtown * 0.08
                : 0.4 + r(6) * 0.22),
    );
    const radius =
      family === HELIX
        ? 9 + Math.floor(r(7) * 2)
        : ix === 1 && iz === 0
          ? 10 + Math.floor(r(7) * 2)
          : 7.5 + Math.floor(r(7) * 4.5) + (tall ? 1 : 0);
    const aspect = family === BLADE || family === RIBBED || family === HELIX ? 1 : 1.12 + r(8) * 0.34;
    const body =
      family === HELIX
        ? radius + 5.8
        : family === BLADE
          ? radius * 1.48
          : family === RIBBED
            ? radius + 1.5
            : family === STACK
              ? radius * aspect * 1.18 + 2.8
              : family === VASE
                ? radius * aspect * 1.14
                : radius * aspect * 1.15;
    const podium = 6 + Math.floor(r(9) * 3);
    const gardens: number[] = [];
    const count = family === HELIX ? 0 : Math.floor(greens * (1.2 + r(10) * 2.5));
    for (let i = 0; i < count; i++) {
      const gy = Math.round(podium + 14 + ((height - podium - 30) * (i + 0.5 + (r(40 + i) - 0.5) * 0.35)) / Math.max(1, count));
      if (gy > podium + 8 && gy < height - 14) gardens.push(gy);
    }

    const forceBillboard = ix === -1 && iz === -1;
    const tower: HyperloopTower = {
      id,
      x,
      z,
      family,
      radius,
      aspect,
      height: Math.min(190, Math.max(44, height)),
      podium,
      ext: Math.ceil(body + 2.5),
      angle: r(12) * Math.PI,
      twist: (r(13) < 0.5 ? -1 : 1) * twist * (0.8 + r(14) * 0.75),
      phase: r(15),
      priority: hero ? -1 : coreRing ? r(16) * 0.35 : r(16),
      glass: GLASS[Math.floor(r(17) * GLASS.length)],
      frame: FRAMES[Math.floor(r(18) * FRAMES.length)],
      crown: family === HELIX ? 0 : family === BLADE ? 1 : family === STACK ? 0 : Math.floor(r(19) * 3),
      billboard:
        forceBillboard
          ? 0
          : family !== HELIX && family !== STACK && tall && r(20) < 0.3
            ? r(21) < 0.55
              ? 0
              : 1 + Math.floor(r(22) * 3)
            : -1,
      gardens,
    };
    towerCache.set(id, tower);
    return tower;
  };

  const threshold = (t: HyperloopTower) =>
    t.priority < 0 ? 1 : density * (0.76 + field(t.x / 900, t.z / 900, seed, 25) * 0.3);

  const towerPresent = (ix: number, iz: number) => {
    const key = `${ix}:${iz}`;
    const known = present.get(key);
    if (known !== undefined) return known;
    const a = makeTower(ix, iz);
    let ok = a.priority <= threshold(a);
    for (let j = iz - 1; ok && j <= iz + 1; j++) {
      for (let i = ix - 1; ok && i <= ix + 1; i++) {
        if (i === ix && j === iz) continue;
        const b = makeTower(i, j);
        if (b.priority < a.priority && b.priority <= threshold(b) && Math.hypot(a.x - b.x, a.z - b.z) < a.ext + b.ext + 10) {
          ok = false;
        }
      }
    }
    present.set(key, ok);
    return ok;
  };

  const makeBlock = (ix: number, iz: number): HyperloopBlock => {
    const r = (salt: number) => hash(ix, iz, salt + 500, seed);
    const w = 9 + Math.floor(r(1) * 9);
    const d = 9 + Math.floor(r(2) * 9);
    const x = Math.round(ix * BLOCK_PITCH + (r(3) - 0.5) * 4 - w / 2);
    const z = Math.round(iz * BLOCK_PITCH + (r(4) - 0.5) * 4 - d / 2);
    const lift = field(x / 260, z / 260, seed, 30);
    return {
      id: `B:${ix}:${iz}`,
      x,
      z,
      w,
      d,
      height: Math.min(40, 6 + Math.floor(r(5) ** 1.55 * 24 + lift * 12)),
      family: r(6) < 0.14 ? PARK : Math.floor(r(7) * 4),
      facade: Math.floor(r(8) * 4),
      priority: r(9),
    };
  };

  const blockPresent = (ix: number, iz: number) => {
    const b = makeBlock(ix, iz);
    if (b.priority > 0.94) return false;
    const tx = Math.round((b.x + b.w / 2) / TOWER_PITCH);
    const tz = Math.round((b.z + b.d / 2) / TOWER_PITCH);
    for (let j = tz - 1; j <= tz + 1; j++) {
      for (let i = tx - 1; i <= tx + 1; i++) {
        if (!towerPresent(i, j)) continue;
        const t = makeTower(i, j);
        if (Math.hypot(Math.max(b.x - t.x, 0, t.x - b.x - b.w), Math.max(b.z - t.z, 0, t.z - b.z - b.d)) < t.ext + 5) {
          return false;
        }
      }
    }
    for (let j = iz - 1; j <= iz + 1; j++) {
      for (let i = ix - 1; i <= ix + 1; i++) {
        if (i === ix && j === iz) continue;
        const o = makeBlock(i, j);
        if (o.priority < b.priority && o.priority <= 0.94 && Math.max(o.x - b.x - b.w, b.x - o.x - o.w, o.z - b.z - b.d, b.z - o.z - o.d) < 4) {
          return false;
        }
      }
    }
    return true;
  };

  const span = (lo: number, hi: number, pitch: number) => [Math.floor(lo / pitch) - 1, Math.ceil(hi / pitch) + 1];
  const towers: HyperloopTower[] = [];
  const blocks: HyperloopBlock[] = [];
  const [tx0, tx1] = span(config.offsetX - config.sizeX / 2 - margin, config.offsetX + config.sizeX / 2 + margin, TOWER_PITCH);
  const [tz0, tz1] = span(config.offsetZ - config.sizeZ / 2 - margin, config.offsetZ + config.sizeZ / 2 + margin, TOWER_PITCH);
  for (let z = tz0; z <= tz1; z++) {
    for (let x = tx0; x <= tx1; x++) {
      if (towerPresent(x, z)) towers.push(makeTower(x, z));
    }
  }
  const [bx0, bx1] = span(config.offsetX - config.sizeX / 2 - blockMargin, config.offsetX + config.sizeX / 2 + blockMargin, BLOCK_PITCH);
  const [bz0, bz1] = span(config.offsetZ - config.sizeZ / 2 - blockMargin, config.offsetZ + config.sizeZ / 2 + blockMargin, BLOCK_PITCH);
  for (let z = bz0; z <= bz1; z++) {
    for (let x = bx0; x <= bx1; x++) {
      if (blockPresent(x, z)) blocks.push(makeBlock(x, z));
    }
  }
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  return { towers: towers.sort(byId), blocks: blocks.sort(byId) };
}

export function generateVerdantHyperloop(config: HyperloopConfig) {
  const width = Math.max(1, Math.floor(config.sizeX));
  const depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff)));
  const ox = Math.floor(config.offsetX - width / 2);
  const oz = Math.floor(config.offsetZ - depth / 2);
  const seed = Math.floor(config.seed);
  const layer = width * depth;
  const cells = new Uint16Array(layer * ceiling);
  const heights = new Float32Array(layer);
  const voxels: HyperloopVoxel[] = [];
  const micros = new Map<number, HyperloopVoxel>();
  const palette = [{ color: 0, emission: 0, vary: 0 }];
  const ids = new Map<string, number>();

  const lights = clamp(config.loopLights);
  const greens = clamp(config.loopGardens);
  const tubeDensity = clamp(config.loopTubes);
  const bridgeDensity = clamp(config.loopBridges);
  const trafficDensity = clamp(config.loopTraffic);

  // Generous world-space planning margin ensures tube Y-junctions, routes & conflicts are crop independent.
  const { towers, blocks } = planVerdantHyperloop(config, 360, 44);

  const pid = (color: number, emission = 0, vary = 0) => {
    const key = `${color}:${emission}:${vary}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = palette.length;
      ids.set(key, id);
      palette.push({ color, emission, vary });
    }
    return id;
  };

  const near = (x0: number, z0: number, x1: number, z1: number) =>
    x0 < ox + width && x1 > ox && z0 < oz + depth && z1 > oz;

  const set = (wx: number, y: number, wz: number, id: number) => {
    const x = wx - ox;
    const z = wz - oz;
    if (x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < ceiling) {
      cells[x + z * width + y * layer] = id;
    }
  };

  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) => {
    const ax = Math.max(0, x0 - ox);
    const bx = Math.min(width, x1 - ox);
    const az = Math.max(0, z0 - oz);
    const bz = Math.min(depth, z1 - oz);
    if (ax >= bx || az >= bz) return;
    const ya = Math.max(0, y0);
    const yb = Math.min(ceiling, y1);
    for (let y = ya; y < yb; y++) {
      for (let z = az; z < bz; z++) {
        cells.fill(id, ax + z * width + y * layer, bx + z * width + y * layer);
      }
    }
  };

  const micro = (x: number, y: number, z: number, color: number, intensity = 0) => {
    const gx = Math.round(x * 8);
    const gy = Math.round(y * 8);
    const gz = Math.round(z * 8);
    const lx = gx - ox * 8;
    const lz = gz - oz * 8;
    if (lx < 0 || lz < 0 || lx >= width * 8 || lz >= depth * 8 || gy < 0 || gy >= ceiling * 8) return;
    const key = lx + lz * (width * 8) + gy * (layer * 64);
    micros.set(key, {
      x: (lx + 0.5) * M - width / 2,
      y: gy * M,
      z: (lz + 0.5) * M - depth / 2,
      sizeX: M,
      sizeY: M,
      sizeZ: M,
      color,
      emissive: intensity > 0,
      material: intensity > 0 ? 'emissive' : 'normal',
      intensity,
    });
  };

  const ID = {
    asphalt: pid(C.asphalt, 0, 3),
    paving: pid(C.paving, 0, 3),
    core: pid(C.core),
    roof: pid(C.roof, 0, 3),
    white: pid(C.white, 0, 2),
    silver: pid(C.silver, 0, 2),
    graphite: pid(C.graphite, 0, 2),
    grass: pid(C.grass, 0, 2),
    soil: pid(C.soil, 0, 1),
    trunk: pid(C.trunk),
    chrome: pid(C.chrome),
    steel: pid(C.steel),
    tubeGlassHi: pid(C.tubeGlassHi),
    tubeGlassMid: pid(C.tubeGlassMid),
    tubeGlassLow: pid(C.tubeGlassLow),
    tubeCore: pid(C.tubeCore),
    tubeTrack: pid(C.tubeTrack, 0.95),
    collar: pid(C.collar, 1.16),
    dock: pid(C.cyan, 1.15),
    shop: pid(C.shop, 0.92),
    canopy: pid(C.canopy),
  };

  const leafIds = LEAVES.map(color => pid(color, 0, 2));
  const windowIds = WINDOWS.flatMap((color, idx) =>
    (idx === 4 ? [0.82, 1.02] : [0.78, 0.96, 1.14]).map(glow => pid(color, glow)),
  );
  const leaf = (wx: number, y: number, wz: number) => leafIds[Math.floor(hash(wx, wz, y + 31, seed) * leafIds.length)];
  const windowId = (col: number, storey: number, salt: number) =>
    windowIds[Math.floor(hash(col, storey, salt + 1, seed) * windowIds.length)];
  const towerTop = (t: HyperloopTower) => t.height + (t.crown === 1 ? 22 : t.crown === 2 ? 6 : 4);

  /** Rasterises a stack of horizontal sections with surface classification from neighbouring cells. */
  const extrude = (cx: number, cz: number, R: number, y0: number, y1: number, section: (y: number) => Section | null) => {
    const bx = Math.floor(cx) - R;
    const bz = Math.floor(cz) - R;
    const size = R * 2 + 1;
    const i0 = Math.max(0, ox - bx - 1);
    const i1 = Math.min(size, ox + width - bx + 1);
    const j0 = Math.max(0, oz - bz - 1);
    const j1 = Math.min(size, oz + depth - bz + 1);
    if (i0 >= i1 || j0 >= j1 || y0 >= ceiling) return;
    let cur = new Uint8Array(size * size);
    let next = new Uint8Array(size * size);
    const sample = (mask: Uint8Array, s: Section | null) => {
      mask.fill(0);
      if (!s) return;
      const lo = R - Math.ceil(s.reach) - 1;
      const hi = R + Math.ceil(s.reach) + 2;
      const ja = Math.max(j0, lo);
      const jb = Math.min(j1, hi);
      const ia = Math.max(i0, lo);
      const ib = Math.min(i1, hi);
      for (let j = ja; j < jb; j++) {
        const wz = bz + j;
        const pz = wz + 0.5 - cz;
        const row = j * size;
        for (let i = ia; i < ib; i++) {
          const wx = bx + i;
          mask[i + row] = s.kind(wx + 0.5 - cx, pz, wx, wz);
        }
      }
    };
    const ia = Math.max(i0, ox - bx);
    const ib = Math.min(i1, ox + width - bx);
    const ja = Math.max(j0, oz - bz);
    const jb = Math.min(j1, oz + depth - bz);
    let lv = section(y0);
    sample(cur, lv);
    const yEnd = Math.min(y1, ceiling);
    for (let y = y0; y < yEnd; y++) {
      const upper = section(y + 1);
      sample(next, upper);
      if (lv) {
        const yOff = y * layer;
        for (let j = ja; j < jb; j++) {
          const wz = bz + j;
          const pz = wz + 0.5 - cz;
          const row = j * size;
          const zOff = (wz - oz) * width + yOff;
          for (let i = ia; i < ib; i++) {
            const n = i + row;
            const k = cur[n];
            if (!k) continue;
            const edge =
              i === 0 ||
              j === 0 ||
              i === size - 1 ||
              j === size - 1 ||
              cur[n - 1] !== k ||
              cur[n + 1] !== k ||
              cur[n - size] !== k ||
              cur[n + size] !== k;
            const wx = bx + i;
            const id = lv.paint(wx + 0.5 - cx, pz, wx, wz, k, edge, !next[n]);
            if (id) cells[wx - ox + zOff] = id;
          }
        }
      }
      const tmp = cur;
      cur = next;
      next = tmp;
      lv = upper;
    }
  };

  const tree = (x: number, y: number, z: number, size: number, salt: number) => {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const rs = Math.ceil(size);
    if (y >= ceiling || !near(bx - rs - 1, bz - rs - 1, bx + rs + 2, bz + rs + 2)) return;
    const trunk = size > 1.55 ? 2 : 1;
    const cy = y + trunk + size * 0.48;
    for (let k = 0; k < trunk; k++) set(bx, y + k, bz, ID.trunk);
    for (let dy = -rs; dy <= rs; dy++) {
      const yy = Math.round(cy + dy);
      if (yy < y + trunk - 1 || yy >= ceiling) continue;
      for (let dz = -rs; dz <= rs; dz++) {
        for (let dx = -rs; dx <= rs; dx++) {
          const q = (dx * dx + dz * dz) / (size * size) + (dy * dy) / (size * size * 0.62);
          if (q > 1 || (q > 0.48 && hash(bx + dx, bz + dz, yy + salt, seed) < 0.3)) continue;
          set(bx + dx, yy, bz + dz, leaf(bx + dx, yy, bz + dz));
        }
      }
    }
  };

  const plant = (
    cx: number,
    cz: number,
    R: number,
    y: number,
    below: Kind | undefined,
    above: Kind | undefined,
    shrubs: number,
    trees: number,
    salt: number,
  ) => {
    const bx = Math.floor(cx) - R;
    const bz = Math.floor(cz) - R;
    if (!below || y >= ceiling || !near(bx - 3, bz - 3, bx + 2 * R + 4, bz + 2 * R + 4)) return;
    const solid = (wx: number, wz: number) => below(wx + 0.5 - cx, wz + 0.5 - cz, wx, wz) === 1;
    for (let wz = bz + 1; wz < bz + 2 * R; wz++) {
      for (let wx = bx + 1; wx < bx + 2 * R; wx++) {
        if (!solid(wx, wz) || (above && above(wx + 0.5 - cx, wz + 0.5 - cz, wx, wz))) continue;
        if (!solid(wx - 1, wz) || !solid(wx + 1, wz) || !solid(wx, wz - 1) || !solid(wx, wz + 1)) continue;
        const h = hash(wx, wz, y + salt, seed);
        if (h < trees) {
          tree(wx + 0.5, y, wz + 0.5, 1.3 + hash(wx, wz, y + salt + 1, seed) * 0.85, salt);
        } else if (h < trees + shrubs) {
          set(wx, y, wz, leaf(wx, y, wz));
          if (h < trees + shrubs * 0.35) set(wx, y + 1, wz, leaf(wx, y + 1, wz));
        }
      }
    }
  };

  const lamp = (x: number, z: number, y: number, height = 3.25) => {
    if (!near(x - 1, z - 1, x + 1, z + 1) || y + height + M > ceiling) return;
    const bx = Math.floor(x * 8) / 8;
    const bz = Math.floor(z * 8) / 8;
    for (let k = 0; k < height; k += M) micro(bx, y + k, bz, C.graphite);
    for (const [dx, dz] of [
      [-M, -M],
      [0, -M],
      [-M, 0],
      [0, 0],
    ]) {
      micro(bx + dx, y + height, bz + dz, C.lamp, 2.2);
    }
  };

  /** Radial boundary search for attaching tubes, bridges and billboards cleanly onto curved towers. */
  const radial = (t: HyperloopTower, y: number, ux: number, uz: number, lateral = 0) => {
    const lv = towerLevel(t, y, seed);
    let found = 0;
    if (lv) {
      for (let s = 0; s <= t.ext + 3; s += 0.5) {
        const k = lv.kind(ux * s - uz * lateral, uz * s + ux * lateral, 0, 0);
        if (k === 1 || k === 5) found = s;
      }
    }
    return found;
  };

  // ============================================================================
  // 1. GROUND LAYER & FUTURISTIC SKYSCRAPERS
  // ============================================================================
  fill(ox, 0, oz, ox + width, 1, oz + depth, ID.asphalt);

  const visibleTowers = towers.filter(t => near(t.x - t.ext - 24, t.z - t.ext - 24, t.x + t.ext + 25, t.z + t.ext + 25));
  for (const t of visibleTowers) {
    const R = t.ext + 2;
    const frame = pid(t.frame, 0, 2);
    const glass = pid(t.glass, 0, 1);
    const salt = Math.abs(t.x * 7919 + t.z * 104729) % 65536;
    const bias = 0.78 + hash(t.x, t.z, 140, seed) * 0.45;

    // Plaza apron around tower podium.
    const plazaR = R + 4;
    for (let j = -plazaR; j <= plazaR; j++) {
      for (let i = -plazaR; i <= plazaR; i++) {
        if (i * i + j * j <= plazaR * plazaR) set(t.x + i, 0, t.z + j, ID.paving);
      }
    }

    extrude(t.x, t.z, R, 1, t.height, y => {
      const lv = towerLevel(t, y, seed);
      if (!lv) return null;
      return {
        kind: lv.kind,
        reach: lv.reach,
        paint: (px, pz, wx, wz, kind, edge, top) => {
          if (kind === 2) return top ? (greens > 0.1 ? ID.grass : ID.white) : ID.white;
          if (kind === 3) return ID.white;
          if (kind === 4) return greens > 0.05 ? leaf(wx, y, wz) : 0;
          if (kind === 5) return ID.chrome;
          if (y < t.podium) {
            if (top) return edge ? frame : greens > 0.1 ? ID.grass : ID.roof;
            if (!edge) return ID.core;
            if (y <= 2) {
              return Math.floor((Math.atan2(pz, px) + Math.PI) * lv.nominal / 3) % 4 === 0
                ? frame
                : lights > 0
                  ? ID.shop
                  : glass;
            }
            return y === 3 ? frame : glass;
          }
          if (!edge) {
            if (!top) return ID.core;
            if (lv.slab || (t.family === STACK && y > t.podium + 20 && greens > 0.1) || (y === t.height - 1 && t.crown === 0 && greens > 0.1)) {
              return ID.grass;
            }
            return ID.roof;
          }
          if (lv.slab || (top && y === t.height - 1)) return frame;
          if (top && t.family === STACK && y > t.podium + 20 && greens > 0.15) return ID.white;
          const rel = y - t.podium;
          const floorH = t.family === VASE ? 3 : 4;
          const k = rel % floorH;
          const storey = Math.floor(rel / floorH);
          const col = Math.floor(((((Math.atan2(pz, px) - lv.rot) % TAU) + TAU) % TAU) * lv.nominal / 2.2);
          if ((t.family === RIBBED && rel % 5 === 4) || (t.family === STACK && rel % 30 < 2)) return frame;
          if (t.family === BLADE ? col % 3 === 0 : k === 0) return frame;
          if (k === (t.family === BLADE ? 0 : floorH - 1)) return glass;
          const chance = lights * bias * (lv.garden ? 0.96 : 0.68 - 0.28 * lv.f);
          return hash(col, storey, salt, seed) < chance ? windowId(col, storey, salt) : glass;
        },
      };
    });

    // Recessed sky-gardens: lush trees, shrubs, hanging vines, and warm micro-voxel terrace uplights.
    if (greens > 0.05) {
      for (const g of t.gardens) {
        const inner = towerLevel(t, g, seed);
        const outer = towerLevel(t, g - 1, seed);
        if (!inner || !outer || g >= ceiling) continue;
        const n = Math.max(7, Math.round((TAU * t.radius) / 5));
        for (let k = 0; k < n; k++) {
          const a = ((k + hash(k, g, salt, seed) * 0.45) / n) * TAU;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          let rin = 0;
          let rout = 0;
          for (let r = 0; r <= R; r += 0.5) {
            if (inner.kind(ca * r, sa * r, 0, 0) === 1) rin = r;
            if (outer.kind(ca * r, sa * r, 0, 0) === 1) rout = r;
          }
          if (rout - rin < 1.8) continue;
          const rr = (rin + rout) / 2;
          if (hash(k, g, salt + 5, seed) < 0.35 + 0.6 * greens) {
            tree(t.x + ca * rr, g, t.z + sa * rr, Math.min(1.65, (rout - rin) / 2 + 0.3), salt + k);
          }
          // Warm architectural uplights tucked along the terrace soffit.
          if (lights > 0.1 && k % 2 === 0) {
            micro(t.x + ca * (rin + 0.6), g + 4.75, t.z + sa * (rin + 0.6), C.lamp, 1.9);
          }
          // Lush vines cascading over the sky-garden parapet.
          for (let m = 0; m < 4; m++) {
            const am = a + ((m - 1.5) * 0.72) / Math.max(4, rout);
            const wx = Math.floor(t.x + Math.cos(am) * (rout + 0.85));
            const wz = Math.floor(t.z + Math.sin(am) * (rout + 0.85));
            if (hash(wx, wz, g + 60, seed) >= greens * 0.82) continue;
            const drop = 2 + Math.floor(hash(wx, wz, g + 61, seed) * 3.5);
            for (let dy = 1; dy <= drop; dy++) set(wx, g - dy, wz, leaf(wx, g - dy, wz));
          }
        }
      }
    }

    // Sloped eco-garden terraces on STACK towers (like foreground-left sloped roof gardens in reference!).
    if (t.family === STACK && greens > 0.1) {
      const slopeBase = Math.floor(t.height - Math.max(12, (t.height - t.podium) * 0.22));
      for (let y = slopeBase + 1; y < Math.min(t.height, ceiling); y += 2) {
        plant(t.x, t.z, R, y, towerLevel(t, y - 1, seed)?.kind, towerLevel(t, y, seed)?.kind, 0.55 * greens, 0.12 * greens, salt + y);
      }
    }

    // Helical garden accent uplights along the underside of HELIX ribbons.
    if (t.family === HELIX && lights > 0.15) {
      const pitch = 46;
      const half = pitch / 2;
      for (let y = t.podium + 6; y < Math.min(t.height - 6, ceiling - 1); y += 5) {
        const f = (y - t.podium) / Math.max(1, t.height - t.podium);
        const r = t.radius * (1 - 0.13 * f) + 4.5;
        for (const strand of [0, 0.5]) {
          const ang = ((((y - t.podium) / pitch + strand) % 1) + 1) % 1 * TAU - Math.PI;
          const lx = t.x + Math.cos(ang) * r;
          const lz = t.z + Math.sin(ang) * r;
          if (near(lx - 1, lz - 1, lx + 1, lz + 1) && (((y - t.podium) % half) + half) % half > 2) {
            micro(lx, y + 0.25, lz, C.lamp, 1.7);
          }
        }
      }
    }

    // Podium & rooftop gardens or architectural crowns.
    if (greens > 0.05) {
      plant(t.x, t.z, R, t.podium, towerLevel(t, t.podium - 1, seed)?.kind, towerLevel(t, t.podium, seed)?.kind, 0.32 * greens, 0.06 * greens, salt + 1);
    }

    const roofY = t.height;
    const roof = towerLevel(t, t.height - 1, seed);
    if (t.crown === 0 && greens > 0.05) {
      plant(t.x, t.z, R, roofY, roof?.kind, undefined, 0.26 + 0.34 * greens, 0.06 + 0.14 * greens, salt + 2);
    } else if (t.crown === 1) {
      // Sleek tapered spire mast with glowing aviation beacon.
      const h = 7 + Math.floor(hash(t.x, t.z, 150, seed) * 8);
      const quad = [
        [-M, -M],
        [0, -M],
        [-M, 0],
        [0, 0],
      ];
      fill(t.x - 1, roofY, t.z - 1, t.x + 1, roofY + h, t.z + 1, ID.chrome);
      for (let y = roofY + h; y < Math.min(ceiling - M, roofY + h + 9); y += M) {
        for (const [dx, dz] of quad) micro(t.x + dx, y, t.z + dz, C.silver);
      }
      if (roofY + h + 9 < ceiling - M) {
        for (const [dx, dz] of quad) micro(t.x + dx, roofY + h + 9, t.z + dz, C.red, 2.8);
      }
    } else if (t.crown === 2 && roof) {
      // Floating architectural halo crown with cyan underside ring light.
      let rr = 0;
      for (let k = 0; k < 16; k++) {
        for (let r = 0; r <= R; r += 0.5) {
          if (roof.kind(Math.cos((k / 16) * TAU) * r, Math.sin((k / 16) * TAU) * r, 0, 0) === 1) rr = Math.max(rr, r);
        }
      }
      const ring = rr + 3.2;
      const y = roofY + 3;
      const reach = Math.ceil(ring + 2);
      for (let j = -reach; j <= reach; j++) {
        for (let i = -reach; i <= reach; i++) {
          const d = Math.hypot(i + 0.5, j + 0.5);
          if (d > ring - 1.1 && d <= ring + 0.6) set(t.x + i, y, t.z + j, ID.white);
          if (d > ring - 1.1 && d <= ring - 0.3 && lights > 0.1) set(t.x + i, y - 1, t.z + j, ID.dock);
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = ((k + 0.5) / 4) * TAU + t.angle;
        for (let r = rr - 1; r <= ring - 0.5; r += 0.5) {
          set(Math.floor(t.x + Math.cos(a) * r), roofY + Math.min(2, Math.floor((r - rr + 1) / 1.5)), Math.floor(t.z + Math.sin(a) * r), ID.white);
        }
      }
      if (greens > 0.05) plant(t.x, t.z, R, roofY, roof.kind, undefined, 0.22 * greens, 0.06 * greens, salt + 3);
    }

    // Luminous vertical holographic plasma billboard (like the left blade spire in the reference image!).
    if (t.billboard >= 0 && lights > 0.08 && t.height >= 72) {
      const ang = t.billboard === 0 ? Math.PI * 0.44 : t.angle + t.billboard * 1.15;
      const ux = Math.cos(ang);
      const uz = Math.sin(ang);
      const tx = -uz;
      const tz = ux;
      const by0 = Math.round(t.height * 0.44);
      const bh = Math.min(24, Math.max(14, Math.round(t.height * 0.18)));
      const bw = 5;
      const midR = radial(t, by0 + Math.floor(bh / 2), ux, uz);
      if (midR >= 3) {
        const palettes = [
          [C.magenta, C.cyan, C.collar, C.violet],
          [C.cyan, C.gold, C.collar, C.magenta],
          [C.violet, C.magenta, C.gold, C.collar],
          [C.gold, C.cyan, C.magenta, C.collar],
        ];
        const pal = palettes[t.billboard % palettes.length];
        for (let dy = 0; dy < bh; dy++) {
          const y = by0 + dy;
          if (y >= ceiling) break;
          const sr = radial(t, y, ux, uz);
          if (sr < 2.5) continue;
          const pxBase = t.x + ux * (sr + 0.65);
          const pzBase = t.z + uz * (sr + 0.65);
          if (!near(pxBase - bw, pzBase - bw, pxBase + bw, pzBase + bw)) continue;
          const v = dy / Math.max(1, bh - 1);
          for (let s = -bw; s <= bw; s += 0.25) {
            const u = (s + bw) / (bw * 2);
            const wx = pxBase + tx * s;
            const wz = pzBase + tz * s;
            const border = Math.abs(s) >= bw - 0.3 || dy === 0 || dy === bh - 1;
            if (border) {
              micro(wx, y + 0.25, wz, C.chrome);
              micro(wx, y + 0.625, wz, C.chrome);
              continue;
            }
            for (const subY of [0.125, 0.375, 0.625, 0.875]) {
              const vy = v + subY / bh;
              const wave = Math.sin((u * 3.8 + vy * 5.2 + t.phase * 4) * Math.PI) * 0.5 + 0.5;
              const ribbon = Math.abs(u - 0.5 - 0.24 * Math.sin(vy * TAU * 1.4 + t.phase * 5));
              const col = ribbon < 0.11 ? pal[2] : wave > 0.62 ? pal[0] : wave > 0.3 ? pal[1] : pal[3];
              const glow = (ribbon < 0.11 ? 1.45 : 1.08) * (0.7 + 0.3 * lights);
              micro(wx, y + subY, wz, col, glow);
            }
          }
        }
      }
    }

    // Plaza street lamps.
    if (lights > 0.05) {
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) / 8) * TAU + t.phase;
        lamp(t.x + Math.cos(a) * (R + 2.5), t.z + Math.sin(a) * (R + 2.5), 1);
      }
    }
  }

  // ============================================================================
  // 2. LOWER CITY: LIT ECO-BLOCKS, TERRACED MID-RISES & POCKET PARKS
  // ============================================================================
  const visibleBlocks = blocks.filter(b => near(b.x - 4, b.z - 4, b.x + b.w + 4, b.z + b.d + 4));
  for (const b of visibleBlocks) {
    const salt = Math.abs(b.x * 31 + b.z * 17) % 65536;
    if (b.family === PARK) {
      const mx = b.x + (b.w >> 1);
      const mz = b.z + (b.d >> 1);
      fill(b.x, 1, b.z, b.x + b.w, 2, b.z + b.d, greens > 0.05 ? ID.grass : ID.paving);
      fill(mx, 1, b.z, mx + 1, 2, b.z + b.d, ID.paving);
      fill(b.x, 1, mz, b.x + b.w, 2, mz + 1, ID.paving);
      if (greens > 0.05) {
        for (let wz = b.z + 1; wz < b.z + b.d - 1; wz += 3) {
          for (let wx = b.x + 1; wx < b.x + b.w - 1; wx += 3) {
            if (Math.abs(wx - mx) < 2 || Math.abs(wz - mz) < 2) continue;
            if (hash(wx, wz, 160, seed) < 0.35 + 0.55 * greens) {
              tree(wx + 0.5, 2, wz + 0.5, 1.4 + hash(wx, wz, 162, seed) * 1.1, salt);
            }
          }
        }
      }
      if (lights > 0.05) lamp(mx + 1.5, mz + 1.5, 2);
      continue;
    }

    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    const R = (Math.max(b.w, b.d) >> 1) + 2;
    const frame = pid(b.facade === 2 ? GLASS[(salt >> 3) % GLASS.length] : [C.white, C.cream, C.white, C.graphite][b.facade], 0, 2);
    const glass = pid(GLASS[salt % GLASS.length], 0, 1);
    const floorH = b.facade === 1 ? 3 : 4;
    const bias = 0.72 + hash(b.x, b.z, 170, seed) * 0.55;
    const green = greens > 0.1 && hash(b.x, b.z, 171, seed) < 0.38 + 0.58 * greens;

    const shape = (y: number): Kind | undefined => {
      if (y < 1 || y >= b.height) return undefined;
      let hw = b.w / 2;
      let hd = b.d / 2;
      let sx = 0;
      let sz = 0;
      if (b.family === 1) {
        const cut = Math.min(2 * Math.floor((y - 1) / 6), Math.min(b.w, b.d) - 6);
        hw -= cut / 2;
        hd -= cut / 2;
        sx = -cut / 2;
        sz = -cut / 2;
      }
      if (b.family === 2) return (px, pz) => (px / hw) ** 2 + (pz / hd) ** 2 <= 1 ? 1 : 0;
      return (px, pz) => (Math.abs(px - sx) < hw && Math.abs(pz - sz) < hd ? 1 : 0);
    };

    extrude(cx, cz, R, 1, b.height, y => {
      const kind = shape(y);
      if (!kind) return null;
      return {
        kind,
        reach: R,
        paint: (_px, _pz, wx, wz, _kind, edge, top) => {
          if (top) return edge ? (b.facade === 2 ? ID.white : frame) : green ? ID.grass : ID.roof;
          if (!edge) return ID.core;
          const k = (y - 1) % floorH;
          const storey = Math.floor((y - 1) / floorH);
          const col = (wx + wz) >> 1;
          if (y <= 2) return lights > 0 && hash(col, 0, salt, seed) < 0.76 ? ID.shop : glass;
          if (k === 0) return frame;
          if (b.facade === 2 && col % 3 === 0) return ID.white;
          return hash(col, storey, salt, seed) < lights * bias * 0.65 ? windowId(col, storey, salt) : glass;
        },
      };
    });

    if (b.family === 1 && greens > 0.05) {
      for (let y = 7; y < b.height; y += 6) {
        plant(cx, cz, R, y, shape(y - 1), shape(y), 0.35 * greens, 0.06 * greens, salt + y);
      }
    }
    if (green) {
      plant(cx, cz, R, b.height, shape(b.height - 1), undefined, 0.28 * greens, 0.07 * greens, salt);
    } else {
      fill(Math.floor(cx) - 1, b.height, Math.floor(cz) - 1, Math.floor(cx) + 2, b.height + 2, Math.floor(cz) + 1, ID.roof);
    }
  }

  // ============================================================================
  // 3. MULTI-TIER TRANSIT TUBES, Y-JUNCTION HUBS & PARALLEL SKY-RAILS
  // ============================================================================
  const nearestCache = new Map<string, HyperloopTower[]>();
  const nearest = (a: HyperloopTower) => {
    let list = nearestCache.get(a.id);
    if (!list) {
      list = towers
        .filter(b => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 145)
        .sort((p, q) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(a.x - q.x, a.z - q.z) || p.id.localeCompare(q.id))
        .slice(0, 4);
      nearestCache.set(a.id, list);
    }
    return list;
  };

  /** Builds a smooth cubic Bézier curve between two 3D points with clearance against intermediate towers. */
  const buildCurve = (
    start: HyperloopPoint,
    end: HyperloopPoint,
    c1: HyperloopPoint,
    c2: HyperloopPoint,
    ignore: HyperloopTower[],
  ) => {
    const L0 = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    if (L0 < 12) return null;
    const n = Math.ceil(L0 * 1.65);
    const pts: HyperloopPoint[] = [];
    const along = [0];
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      const pt = {
        x: start.x * w0 + c1.x * w1 + c2.x * w2 + end.x * w3,
        y: start.y * w0 + c1.y * w1 + c2.y * w2 + end.y * w3,
        z: start.z * w0 + c1.z * w1 + c2.z * w2 + end.z * w3,
      };
      if (i) along.push(along[i - 1] + Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y, pt.z - pts[i - 1].z));
      pts.push(pt);
      box[0] = Math.min(box[0], pt.x);
      box[1] = Math.min(box[1], pt.y);
      box[2] = Math.min(box[2], pt.z);
      box[3] = Math.max(box[3], pt.x);
      box[4] = Math.max(box[4], pt.y);
      box[5] = Math.max(box[5], pt.z);
    }
    const blocked = towers.some(
      o =>
        !ignore.includes(o) &&
        o.x + o.ext + 6 > box[0] &&
        o.x - o.ext - 6 < box[3] &&
        o.z + o.ext + 6 > box[2] &&
        o.z - o.ext - 6 < box[5] &&
        pts.some(pt => pt.y - TUBE_R - 2 < towerTop(o) && Math.hypot(pt.x - o.x, pt.z - o.z) < o.ext + TUBE_R + 1.2),
    );
    return blocked ? null : { pts, along, length: along[n], box };
  };

  /** Direct sweeping inter-tower tube (supports gentle curves AND dramatic elevation climbs!). */
  const tubeRoute = (
    p: HyperloopTower,
    q: HyperloopTower,
    levelA: number,
    levelB: number,
    r: (salt: number) => number,
  ) => {
    const L0 = Math.hypot(q.x - p.x, q.z - p.z);
    const ux = (q.x - p.x) / L0;
    const uz = (q.z - p.z) / L0;
    const sp = radial(p, levelA, ux, uz) - 1;
    const sq = radial(q, levelB, -ux, -uz) - 1;
    if (sp < 2 || sq < 2) return null;
    const start = { x: p.x + ux * sp, y: levelA, z: p.z + uz * sp };
    const end = { x: q.x - ux * sq, y: levelB, z: q.z - uz * sq };
    const ex = end.x - start.x;
    const ez = end.z - start.z;
    const L = Math.hypot(ex, ez);
    if (L < 14) return null;
    const nx = -ez / L;
    const nz = ex / L;
    const bend = L * (0.09 + r(603) * 0.16);
    const sShape = r(604) < 0.42;
    const lift = levelA === levelB ? (r(605) - 0.5) * 10 : 0;
    for (const sign of r(606) < 0.5 ? [1, -1, 0] : [-1, 1, 0]) {
      const b1 = bend * sign;
      const b2 = sShape ? -b1 : b1;
      const c1 = { x: start.x + ex / 3 + nx * b1, y: levelA + lift, z: start.z + ez / 3 + nz * b1 };
      const c2 = {
        x: start.x + (ex * 2) / 3 + nx * b2,
        y: levelB + (sShape ? -lift : lift),
        z: start.z + (ez * 2) / 3 + nz * b2,
      };
      const built = buildCurve(start, end, c1, c2, [p, q]);
      if (built) return built;
    }
    return null;
  };

  /** World-addressed 3-way Y-junction hub nodes positioned in open airspace between 3 towers! */
  const hubCandidates: HubCandidate[] = [];
  const hubKeys = new Set<string>();
  const hubTowerPairs = new Set<string>();

  if (tubeDensity > 0.1) {
    const hubPitch = TOWER_PITCH * 2;
    const [hx0, hx1] = [
      Math.floor((ox - 220) / hubPitch) - 1,
      Math.ceil((ox + width + 220) / hubPitch) + 1,
    ];
    const [hz0, hz1] = [
      Math.floor((oz - 220) / hubPitch) - 1,
      Math.ceil((oz + depth + 220) / hubPitch) + 1,
    ];
    for (let hz = hz0; hz <= hz1; hz++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const r = (salt: number) => hash(hx, hz, 820 + salt, seed);
        const heroHub = hx === 0 && hz === 0;
        if (!heroHub && r(0) >= tubeDensity * 0.85) continue;
        // Target open airspace pocket near the center of each 2×2 tower quad (for origin, right in front of the Helix & Vase towers!).
        const cx = heroHub ? 24 + (r(1) - 0.5) * 12 : (hx + 0.5 + (r(1) - 0.5) * 0.3) * hubPitch;
        const cz = heroHub ? 32 + (r(2) - 0.5) * 10 : (hz + 0.5 + (r(2) - 0.5) * 0.3) * hubPitch;
        // Find 3 closest tall towers forming a clean Y spread around (cx, cz).
        const around = towers
          .filter(t => t.height >= 72 && Math.hypot(t.x - cx, t.z - cz) < 115 && Math.hypot(t.x - cx, t.z - cz) > t.ext + 14)
          .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || a.id.localeCompare(b.id));
        if (around.length < 3) continue;
        // Pick 3 towers with strong angular separation (> 65° apart) to form a true Y-junction!
        const chosen: HyperloopTower[] = [around[0]];
        for (let i = 1; i < around.length && chosen.length < 3; i++) {
          const cand = around[i];
          const a1 = Math.atan2(cand.z - cz, cand.x - cx);
          const okAng = chosen.every(prev => {
            const a0 = Math.atan2(prev.z - cz, prev.x - cx);
            const diff = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)));
            return diff > 1.12;
          });
          if (okAng) chosen.push(cand);
        }
        if (chosen.length < 3) continue;
        const sortedIds = chosen.map(t => t.id).sort();
        const key = sortedIds.join('|');
        if (hubKeys.has(key)) continue;
        hubKeys.add(key);

        const minH = Math.min(...chosen.map(t => t.height));
        const hubY = Math.round(clamp(heroHub ? 52 + Math.floor(r(3) * 10) : 46 + r(3) * 44, 42, minH - 18));
        // Ensure hub point itself is clear of every tower.
        if (towers.some(t => Math.hypot(t.x - cx, t.z - cz) < t.ext + TUBE_R + 6 && hubY - TUBE_R < towerTop(t))) {
          continue;
        }

        const hubPt: HyperloopPoint = { x: cx, y: hubY, z: cz };
        // Compute a smooth Y-tangent axis aligned with the first branch, splitting cleanly to branches 2 and 3.
        const branches: TubeCandidate[] = [];
        let allValid = true;
        for (let bi = 0; bi < 3; bi++) {
          const target = chosen[bi];
          const dx = target.x - cx;
          const dz = target.z - cz;
          const dist = Math.hypot(dx, dz);
          const ux = dx / dist;
          const uz = dz / dist;
          // One branch can climb smoothly up to an upper tower level (just like the soaring upper-right tube in the image!).
          const climb = bi === 2 && target.height >= hubY + 38 ? 22 + Math.floor(r(10 + bi) * 12) : bi === 1 ? Math.round((r(10 + bi) - 0.5) * 14) : 0;
          const destY = Math.round(clamp(hubY + climb, 36, target.height - 14));
          const sr = radial(target, destY, -ux, -uz) - 1;
          if (sr < 2) {
            allValid = false;
            break;
          }
          const end: HyperloopPoint = { x: target.x - ux * sr, y: destY, z: target.z - uz * sr };
          const ex = end.x - cx;
          const ez = end.z - cz;
          const L = Math.hypot(ex, ez);
          const nx = -ez / L;
          const nz = ex / L;
          const curve = L * 0.08 * (bi === 0 ? 0 : bi === 1 ? 1 : -1);
          const c1: HyperloopPoint = {
            x: cx + ex * 0.34 + nx * curve,
            y: hubY + (bi === 2 ? 2 : 0),
            z: cz + ez * 0.34 + nz * curve,
          };
          const c2: HyperloopPoint = {
            x: cx + ex * 0.68 + nx * curve * 0.5,
            y: destY - (bi === 2 ? 2 : 0),
            z: cz + ez * 0.68 + nz * curve * 0.5,
          };
          const built = buildCurve(hubPt, end, c1, c2, [target]);
          if (!built) {
            allValid = false;
            break;
          }
          branches.push({
            id: `H:${hx}:${hz}:${bi}`,
            a: target,
            b: target,
            level: hubY,
            endLevel: destY,
            priority: heroHub ? -0.5 + bi * 0.01 : r(20) * 0.35 + bi * 0.001,
            hub: hubPt,
            ...built,
          });
        }
        if (allValid && branches.length === 3) {
          hubCandidates.push({
            id: `HUB:${hx}:${hz}`,
            x: cx,
            y: hubY,
            z: cz,
            towers: [chosen[0], chosen[1], chosen[2]],
            priority: heroHub ? -0.5 : r(20) * 0.35,
            branches,
          });
        }
      }
    }
  }

  // Record accepted hub branches first (non-cascading priority rejection keeps crops identical).
  const candidates: TubeCandidate[] = [];
  const acceptedHubs = hubCandidates.filter(
    h =>
      !hubCandidates.some(
        o =>
          o !== h &&
          (o.priority < h.priority || (o.priority === h.priority && o.id < h.id)) &&
          Math.hypot(o.x - h.x, o.z - h.z) < 62,
      ),
  );
  for (const h of acceptedHubs) {
    for (const br of h.branches) candidates.push(br);
    const ids3 = h.towers.map(t => t.id).sort();
    hubTowerPairs.add(`${ids3[0]}/${ids3[1]}`);
    hubTowerPairs.add(`${ids3[1]}/${ids3[2]}`);
    hubTowerPairs.add(`${ids3[0]}/${ids3[2]}`);
  }

  // Direct inter-tower transit tubes across multiple staggered altitude tiers (including soaring climbs!).
  const pairs = new Set<string>();
  if (tubeDensity > 0) {
    for (const a of towers) {
      if (!near(a.x - 320, a.z - 320, a.x + 320, a.z + 320)) continue;
      for (const b of towers) {
        if (b === a || Math.hypot(a.x - b.x, a.z - b.z) >= 145 || (!nearest(a).includes(b) && !nearest(b).includes(a))) {
          continue;
        }
        const [p, q] = a.id < b.id ? [a, b] : [b, a];
        const key = `${p.id}/${q.id}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        const r = (salt: number) => hash(p.x * 7 + q.x, p.z * 7 + q.z, salt, seed);
        if (r(600) >= tubeDensity * 0.94) continue;
        const cls = ((Math.round(Math.atan2(q.z - p.z, q.x - p.x) / (Math.PI / 4)) % 4) + 4) % 4;
        // Allow up to 2 vertical tiers between tall close towers for rich multi-layered sky-tube webs!
        const tierCount = Math.min(p.height, q.height) > 120 && r(607) < tubeDensity * 0.52 ? 2 : 1;
        const baseLevels = [0, 1, 2, 3].map(k => 42 + cls * 8 + k * 30);
        for (let ti = 0; ti < tierCount; ti++) {
          const validA = baseLevels.filter(lv => lv <= p.height - 14 && lv <= q.height - 14);
          if (!validA.length) continue;
          const idx = (Math.floor(r(601) * validA.length) + ti * 2) % validA.length;
          const levelA = validA[idx];
          // Occasional dramatic vertical ramp (climbing/descending 18–26m between towers).
          let levelB = levelA;
          if (r(608 + ti) < 0.34) {
            const delta = (r(609 + ti) < 0.5 ? 1 : -1) * (18 + Math.floor(r(610 + ti) * 10));
            if (levelA + delta >= 38 && levelA + delta <= q.height - 14) levelB = levelA + delta;
          }
          const route = tubeRoute(p, q, levelA, levelB, s => r(s + ti * 31));
          if (route) {
            candidates.push({
              id: `${key}#${ti}`,
              a: p,
              b: q,
              level: levelA,
              endLevel: levelB,
              priority: (hubTowerPairs.has(key) ? 0.55 : 0.4) + r(602 + ti * 13) * 0.6,
              ...route,
            });
          }
        }
      }
    }
  }

  const conflict = (c: TubeCandidate, o: TubeCandidate) => {
    // Three branches meeting at the SAME hub intentionally join there.
    if (c.hub && o.hub && c.hub === o.hub) return false;
    const pad = TUBE_R * 2 + 2.2;
    const clear = TUBE_R * 2 + 1.6;
    if (
      o.box[0] > c.box[3] + pad ||
      o.box[3] < c.box[0] - pad ||
      o.box[1] > c.box[4] + pad ||
      o.box[4] < c.box[1] - pad ||
      o.box[2] > c.box[5] + pad ||
      o.box[5] < c.box[2] - pad
    ) {
      return false;
    }
    const shared = [c.a, c.b].filter(t => t === o.a || t === o.b);
    for (let i = 0; i < c.pts.length; i += 2) {
      const p = c.pts[i];
      if (shared.some(t => Math.hypot(p.x - t.x, p.z - t.z) < t.ext + 4.5)) continue;
      for (let j = 0; j < o.pts.length; j += 2) {
        const q = o.pts[j];
        if (Math.abs(p.x - q.x) < clear && Math.abs(p.z - q.z) < clear && Math.abs(p.y - q.y) < clear) {
          if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < clear) return true;
        }
      }
    }
    return false;
  };

  const acceptedCandidates = candidates.filter(
    c =>
      near(c.box[0] - 8, c.box[2] - 8, c.box[3] + 8, c.box[5] + 8) &&
      !candidates.some(o => o !== c && o.priority < c.priority && conflict(c, o)),
  );

  const tubeClear = (p: HyperloopPoint, clearance: number) =>
    candidates.every(
      c =>
        p.x < c.box[0] - clearance ||
        p.x > c.box[3] + clearance ||
        p.y < c.box[1] - clearance ||
        p.y > c.box[4] + clearance ||
        p.z < c.box[2] - clearance ||
        p.z > c.box[5] + clearance ||
        c.pts.every(
          q =>
            Math.abs(q.x - p.x) >= clearance ||
            Math.abs(q.z - p.z) >= clearance ||
            Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) >= clearance,
        ),
    );

  const pointAt = (c: TubeCandidate, s: number) => {
    let i = 1;
    while (i < c.along.length - 1 && c.along[i] < s) i++;
    const a = c.pts[i - 1];
    const b = c.pts[i];
    const f = clamp((s - c.along[i - 1]) / Math.max(1e-6, c.along[i] - c.along[i - 1]));
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  };

  /** Rasterizes a gleaming glass-and-chrome transit tube: reflective glass flanks,
   * gleaming chrome crown spine, luminous white collar rings every 8m, docking sleeves,
   * and sculpted pod shuttles gliding along the tube! */
  const rasterTube = (c: TubeCandidate, collars: number[]) => {
    const first = collars[0];
    const last = collars[collars.length - 1];
    const hubStart = Boolean(c.hub);
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i];
      const b = c.pts[i + 1];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const ez = b.z - a.z;
      const l2 = ex * ex + ey * ey + ez * ez;
      const sApprox = c.along[i];
      // Flared fairing right where a branch joins a Y-junction hub!
      const flare = hubStart && sApprox < 9 ? (1 - sApprox / 9) ** 2 * 1.1 : 0;
      const localR = TUBE_R + flare;
      const reach = localR + 1.25;
      const x0 = Math.floor(Math.min(a.x, b.x) - reach);
      const x1 = Math.floor(Math.max(a.x, b.x) + reach);
      const z0 = Math.floor(Math.min(a.z, b.z) - reach);
      const z1 = Math.floor(Math.max(a.z, b.z) + reach);
      if (l2 < 1e-9 || !near(x0, z0, x1 + 1, z1 + 1)) continue;
      const l = Math.sqrt(l2);
      const tx = ex / l;
      const ty = ey / l;
      const tz = ez / l;
      const hl = Math.hypot(tx, tz) || 1;
      const nx = -tz / hl;
      const nz = tx / hl;
      const upx = -nz * ty;
      const upy = nz * tx - nx * tz;
      const upz = nx * ty;
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach));
      const y1 = Math.min(ceiling - 1, Math.floor(Math.max(a.y, b.y) + reach));
      const za = Math.max(oz, z0);
      const zb = Math.min(oz + depth - 1, z1);
      const xa = Math.max(ox, x0);
      const xb = Math.min(ox + width - 1, x1);
      for (let y = y0; y <= y1; y++) {
        const yOff = y * layer;
        for (let z = za; z <= zb; z++) {
          const zOff = (z - oz) * width + yOff;
          for (let x = xa; x <= xb; x++) {
            const px = x + 0.5 - a.x;
            const py = y + 0.5 - a.y;
            const pz = z + 0.5 - a.z;
            const f = clamp((px * ex + py * ey + pz * ez) / l2);
            const vx = px - ex * f;
            const vy = py - ey * f;
            const vz = pz - ez * f;
            const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (dist > reach) continue;
            const s = c.along[i] + l * f;
            const endDock = c.length - s;
            const startDock = hubStart ? 99 : s;
            const dock = Math.min(startDock, endDock);
            const ring =
              s > first - 1.2 && s < last + 1.2 ? Math.abs(((((s - first + 5) % 10) + 10) % 10) - 5) : 9;
            let id = 0;
            if (dock < 3.4) {
              id =
                dist > localR + 0.85
                  ? 0
                  : dist < localR - 1.2
                    ? ID.tubeCore
                    : Math.abs(dock - 2.0) < 0.5 && lights > 0.05
                      ? ID.dock
                      : ID.chrome;
            } else if (hubStart && s < 3.0) {
              // Smoothly welded polished chrome hub fairing with thin luminous entry ring.
              if (dist <= localR + 0.3 && dist > localR - 1.55) {
                id = s > 2.25 && s < 2.85 && lights > 0.05 ? ID.collar : ID.chrome;
              } else if (dist <= localR - 1.55) {
                id = ID.tubeCore;
              }
            } else if (ring < 0.42 && dist <= localR + 0.55 && dist > localR - 1.3) {
              id = lights > 0.05 ? ID.collar : ID.chrome;
            } else if (ring < 1.15 && dist <= localR + 0.42 && dist > localR - 1.3) {
              id = ID.chrome;
            } else if (dist <= localR) {
              const up = (vx * upx + vy * upy + vz * upz) / Math.max(dist, 1e-6);
              if (dist < localR - 1.45) {
                id = ID.tubeCore;
              } else if (up > 0.68) {
                // Sleek chrome upper structural spine.
                id = ID.chrome;
              } else if (up < -0.62) {
                // Dark steel underside structural keel.
                id = ID.steel;
              } else if (Math.abs(up + 0.1) < 0.14 && Math.abs(s % 26 - 13) < 2.6 && lights > 0.15) {
                // Illuminated sleek transit pod glimpsed through the glass flank.
                id = ID.tubeTrack;
              } else {
                // Rich sapphire-steel reflective curved glass flanks.
                id = up > 0.22 ? ID.tubeGlassHi : up > -0.22 ? ID.tubeGlassMid : ID.tubeGlassLow;
              }
            }
            if (id) cells[x - ox + zOff] = id;
          }
        }
      }
    }
  };

  const tubes: HyperloopTube[] = [];
  for (const c of acceptedCandidates) {
    // Slender white/chrome support pylons carrying lower tubes where clear of towers.
    for (let s = 20; s < c.length - 20; s += 36) {
      const p = pointAt(c, s);
      if (p.y > 108 || towers.some(t => Math.hypot(t.x - p.x, t.z - p.z) < t.ext + 3.5)) continue;
      const bx = Math.floor(p.x);
      const bz = Math.floor(p.z);
      const topY = Math.floor(p.y - TUBE_R);
      fill(bx - 1, 1, bz - 1, bx + 1, topY + 1, bz + 1, ID.white);
      fill(bx - 2, topY - 1, bz - 2, bx + 2, topY, bz + 2, ID.chrome);
    }
    const usable = Math.max(5, c.length - 10);
    const count = Math.max(1, Math.floor(usable / 10) + 1);
    const first = 5 + (usable - (count - 1) * 10) / 2;
    const collars = Array.from({ length: count }, (_, k) => first + k * 10);
    rasterTube(c, collars);
    tubes.push({
      id: c.id,
      from: c.hub ? c.id : c.a.id,
      to: c.b.id,
      level: c.level,
      endLevel: c.endLevel,
      start: c.pts[0],
      end: c.pts[c.pts.length - 1],
      length: c.length,
      collars,
      isHubBranch: Boolean(c.hub),
    });
  }

  // Sculpted spherical-flared chrome & glowing-ring central hubs where 3 Y-branches converge!
  const visibleHubs: HyperloopHub[] = [];
  for (const h of acceptedHubs) {
    if (!near(h.x - 8, h.z - 8, h.x + 8, h.z + 8)) continue;
    // Check at least 2 branches of this hub survived conflict resolution.
    const live = acceptedCandidates.filter(c => c.hub && c.hub.x === h.x && c.hub.z === h.z);
    if (live.length < 2) continue;
    visibleHubs.push({ id: h.id, x: h.x, y: h.y, z: h.z, towers: h.towers.map(t => t.id) });
    const R = TUBE_R + 1.35;
    const rCeil = Math.ceil(R + 1);
    const y0 = Math.max(0, Math.floor(h.y - rCeil));
    const y1 = Math.min(ceiling - 1, Math.ceil(h.y + rCeil));
    for (let y = y0; y <= y1; y++) {
      for (let dz = -rCeil; dz <= rCeil; dz++) {
        for (let dx = -rCeil; dx <= rCeil; dx++) {
          const wx = Math.floor(h.x) + dx;
          const wz = Math.floor(h.z) + dz;
          const d = Math.hypot(wx + 0.5 - h.x, y + 0.5 - h.y, wz + 0.5 - h.z);
          if (d > R) continue;
          const ny = (y + 0.5 - h.y) / Math.max(0.01, d);
          let id = ID.chrome;
          if (d < R - 1.5) id = ID.tubeCore;
          else if (Math.abs(ny) < 0.13 && lights > 0.05) id = ID.collar;
          else if (ny > 0.25) id = ID.tubeGlassHi;
          else if (ny < -0.5) id = ID.steel;
          set(wx, y, wz, id);
        }
      }
    }
    // Sleek central pylon supporting the hub down to street level if hub is at low/mid height.
    if (h.y <= 92) {
      const bx = Math.floor(h.x);
      const bz = Math.floor(h.z);
      const topY = Math.floor(h.y - R);
      fill(bx - 1, 1, bz - 1, bx + 2, topY + 1, bz + 2, ID.silver);
      fill(bx - 2, topY - 2, bz - 2, bx + 3, topY, bz + 3, ID.chrome);
    }
  }

  // Parallel slim curved maglev sky-rails (like the slender curving monorail on the mid-left of the image!).
  if (tubeDensity > 0.25) {
    const railPairs = new Set<string>();
    for (const a of towers) {
      if (!near(a.x - 160, a.z - 160, a.x + 160, a.z + 160)) continue;
      for (const b of nearest(a).slice(0, 2)) {
        const [p, q] = a.id < b.id ? [a, b] : [b, a];
        const key = `${p.id}/${q.id}`;
        if (railPairs.has(key)) continue;
        railPairs.add(key);
        const r = (salt: number) => hash(p.x * 13 + q.x, p.z * 13 + q.z, 760 + salt, seed);
        if (r(0) >= tubeDensity * 0.48) continue;
        const level = 24 + Math.floor(r(1) * 18);
        if (level > Math.min(p.height, q.height) - 12) continue;
        const L0 = Math.hypot(q.x - p.x, q.z - p.z);
        const ux = (q.x - p.x) / L0;
        const uz = (q.z - p.z) / L0;
        const sp = radial(p, level, ux, uz) - 0.5;
        const sq = radial(q, level, -ux, -uz) - 0.5;
        if (sp < 2 || sq < 2) continue;
        const start = { x: p.x + ux * sp, y: level, z: p.z + uz * sp };
        const end = { x: q.x - ux * sq, y: level, z: q.z - uz * sq };
        const ex = end.x - start.x;
        const ez = end.z - start.z;
        const L = Math.hypot(ex, ez);
        if (L < 16) continue;
        const nx = -ez / L;
        const nz = ex / L;
        const bend = L * 0.16 * (r(2) < 0.5 ? 1 : -1);
        const c1 = { x: start.x + ex / 3 + nx * bend, y: level, z: start.z + ez / 3 + nz * bend };
        const c2 = { x: start.x + (ex * 2) / 3 + nx * bend, y: level, z: start.z + (ez * 2) / 3 + nz * bend };
        const built = buildCurve(start, end, c1, c2, [p, q]);
        if (!built || !near(built.box[0] - 4, built.box[2] - 4, built.box[3] + 4, built.box[5] + 4)) continue;
        if (!built.pts.every((pt, idx) => idx % 4 !== 0 || tubeClear(pt, TUBE_R + 3))) continue;
        // Emit sleek 2m-wide silver/chrome sky-rail deck with glowing cyan guide strip & a tiny maglev pod!
        for (let i = 0; i < built.pts.length; i++) {
          const pt = built.pts[i];
          const wx = Math.floor(pt.x);
          const wz = Math.floor(pt.z);
          set(wx, level, wz, ID.chrome);
          if (lights > 0.1 && i % 2 === 0) micro(pt.x, level + 1 + M, pt.z, C.cyan, 1.8);
        }
        // Place a micro-voxel futuristic shuttle pod gliding smoothly along the rail!
        if (trafficDensity > 0.1 && built.pts.length > 20) {
          const idx = Math.floor((0.25 + r(4) * 0.5) * (built.pts.length - 4));
          const pt = built.pts[idx];
          const nxt = built.pts[Math.min(built.pts.length - 1, idx + 3)];
          const dirX = nxt.x - pt.x;
          const dirZ = nxt.z - pt.z;
          const dLen = Math.hypot(dirX, dirZ) || 1;
          const fx = dirX / dLen;
          const fz = dirZ / dLen;
          const rx = -fz;
          const rz = fx;
          for (let ds = -2.25; ds <= 2.25; ds += 0.25) {
            for (let dw = -0.5; dw <= 0.5; dw += 0.25) {
              const px = pt.x + fx * ds + rx * dw;
              const pz = pt.z + fz * ds + rz * dw;
              micro(px, level + 1.125, pz, Math.abs(ds) > 1.8 ? C.cyan : C.white, Math.abs(ds) > 1.8 ? 2.1 : 0);
              if (Math.abs(ds) < 1.5) micro(px, level + 1.375, pz, Math.abs(ds) < 0.8 ? C.canopy : C.silver);
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // 4. LUSH VERDANT ECO-SKYBRIDGES (LOWER/MID) & TRUSS SKYBRIDGES (UPPER)
  // ============================================================================
  const bridges: HyperloopBridge[] = [];
  const bridgePairs = new Set<string>();
  if (bridgeDensity > 0) {
    for (const a of towers) {
      if (!near(a.x - 135, a.z - 135, a.x + 135, a.z + 135)) continue;
      for (const b of towers) {
        if (b === a || Math.hypot(a.x - b.x, a.z - b.z) >= 102 || (!nearest(a).slice(0, 3).includes(b) && !nearest(b).slice(0, 3).includes(a))) {
          continue;
        }
        const [p, q] = a.id < b.id ? [a, b] : [b, a];
        const key = `${p.id}/${q.id}`;
        if (bridgePairs.has(key)) continue;
        bridgePairs.add(key);
        const r = (salt: number) => hash(p.x * 5 + q.x, p.z * 5 + q.z, salt, seed);
        if (r(700) >= bridgeDensity * 0.88) continue;
        const L0 = Math.hypot(q.x - p.x, q.z - p.z);
        const ux = (q.x - p.x) / L0;
        const uz = (q.z - p.z) / L0;
        // Prefer lush verdant garden skybridges at lower/mid tiers (28-68m) AND sleek truss skybridges high up (88-146m)!
        const allSpecs: Array<{ level: number; kind: 'garden' | 'truss' }> = [
          { level: 30, kind: 'garden' },
          { level: 44, kind: 'garden' },
          { level: 60, kind: 'garden' },
          { level: 92, kind: 'truss' },
          { level: 122, kind: 'truss' },
          { level: 148, kind: 'truss' },
        ];
        const specs = allSpecs.filter(s => s.level <= Math.min(p.height, q.height) - 10);

        const k0 = Math.floor(r(701) * Math.max(1, specs.length));
        let placedCount = 0;
        const maxBridgesForPair = r(705) < bridgeDensity * 0.45 ? 2 : 1;
        for (let k = 0; k < specs.length && placedCount < maxBridgesForPair; k++) {
          const spec = specs[(k0 + k) % specs.length];
          const level = spec.level;
          const sp = radial(p, level, ux, uz) - 0.5;
          const sq = radial(q, level, -ux, -uz) - 0.5;
          if (sp < 2 || sq < 2) continue;
          const start = { x: p.x + ux * sp, y: level, z: p.z + uz * sp };
          const end = { x: q.x - ux * sq, y: level, z: q.z - uz * sq };
          const L = Math.hypot(end.x - start.x, end.z - start.z);
          let ok = L >= 7;
          for (let s = 0; ok && s <= L; s += 2) {
            const pt = { x: start.x + ux * s, y: level, z: start.z + uz * s };
            ok =
              tubeClear(pt, TUBE_R + 4.2) &&
              !towers.some(t => t !== p && t !== q && Math.hypot(t.x - pt.x, t.z - pt.z) < t.ext + 3 && level < towerTop(t) + 4);
          }
          if (ok) {
            bridges.push({ id: `${key}@${level}`, from: p.id, to: q.id, level, kind: spec.kind, start, end });
            placedCount++;
          }
        }
      }
    }
  }

  const visibleBridges = bridges.filter(b =>
    near(
      Math.min(b.start.x, b.end.x) - 5,
      Math.min(b.start.z, b.end.z) - 5,
      Math.max(b.start.x, b.end.x) + 5,
      Math.max(b.start.z, b.end.z) + 5,
    ),
  );

  for (const b of visibleBridges) {
    const { start, end, level: y, kind } = b;
    const L = Math.hypot(end.x - start.x, end.z - start.z);
    const ux = (end.x - start.x) / L;
    const uz = (end.z - start.z) / L;
    const at = (s: number, w: number): [number, number] => [
      Math.floor(start.x + ux * s - uz * w),
      Math.floor(start.z + uz * s + ux * w),
    ];

    if (kind === 'garden') {
      // Lush landscaped eco-skybridge draped in green hedges, trees & hanging vines!
      for (let s = 0; s <= L; s += 0.5) {
        // Structural underside slab & architectural bright white fascia edges.
        for (const w of [-2.4, -1.5, -0.5, 0.5, 1.5, 2.4]) {
          const [x, z] = at(s, w);
          set(x, y - 2, z, Math.abs(w) > 2 ? ID.chrome : ID.graphite);
          set(x, y - 1, z, Math.abs(w) > 2 ? ID.white : Math.abs(w) < 0.8 ? ID.paving : greens > 0.05 ? ID.grass : ID.paving);
        }
        if (greens > 0.05) {
          // Dense flanking foliage hedges & cascading greenery spilling over the bridge sides!
          for (const w of [-2.2, -1.6, 1.6, 2.2]) {
            const [x, z] = at(s, w);
            const h = hash(x, z, y + 710, seed);
            if (h < 0.35 + 0.6 * greens) {
              set(x, y, z, leaf(x, y, z));
              if (h < 0.16 + 0.35 * greens) set(x, y + 1, z, leaf(x, y + 1, z));
            }
            // Cascading vines hanging beneath the garden deck parapet.
            if (Math.abs(w) > 2 && h < greens * 0.42) {
              const drop = 1 + Math.floor(hash(x, z, y + 711, seed) * 2.6);
              for (let dy = 1; dy <= drop; dy++) set(x, y - 1 - dy, z, leaf(x, y - 1 - dy, z));
            }
          }
        }
      }
      // Small ornamental eco-bridge trees & warm walkway lamps along the promenade.
      for (let s = 5; s < L - 5; s += 9) {
        const side = Math.floor(s / 9) % 2 === 0 ? 1.8 : -1.8;
        const tx = start.x + ux * s - uz * side;
        const tz = start.z + uz * s + ux * side;
        if (greens > 0.25 && hash(Math.floor(tx), Math.floor(tz), y + 712, seed) < greens * 0.72) {
          tree(tx, y, tz, 1.25 + hash(Math.floor(tx), Math.floor(tz), y + 713, seed) * 0.55, y + 714);
        }
        if (lights > 0.08) {
          lamp(start.x + ux * s + uz * 0.85, start.z + uz * s - ux * 0.85, y, 2.0);
        }
      }
      // Warm continuous accent lights beneath the eco-skybridge deck.
      if (lights > 0.08) {
        for (let s = 2; s < L - 2; s += 4) {
          micro(start.x + ux * s, y - 2 - M, start.z + uz * s, C.lamp, 1.9);
        }
      }
    } else {
      // High-altitude sleek chrome Warren-truss skybridge (like the upper-right span in the reference image!).
      for (let s = 0; s <= L; s += 0.5) {
        for (const w of [-1.5, -0.5, 0.5, 1.5]) {
          const [x, z] = at(s, w);
          set(x, y - 1, z, ID.white);
        }
        for (const w of [-2.4, 2.4]) {
          const [x, z] = at(s, w);
          set(x, y - 1, z, ID.chrome);
          set(x, y + 2, z, ID.chrome);
        }
      }
      for (let s = 0; s + 3 <= L; s += 3) {
        for (const w of [-2.4, 2.4]) {
          for (let k = 0; k <= 6; k++) {
            const f = k / 6;
            const [x, z] = at(s + (Math.round(s / 3) % 2 ? f : 1 - f) * 3, w);
            set(x, y - 1 + Math.round(f * 3), z, ID.chrome);
          }
        }
      }
      if (lights > 0.08) {
        for (let s = 2; s < L - 2; s += 4) {
          micro(start.x + ux * s, y - 1 - M, start.z + uz * s, C.lamp, 1.8);
        }
      }
    }
  }

  // ============================================================================
  // 5. FLYING TRAFFIC (FUTURISTIC HOVERCRAFT & DRONE FORMATIONS IN AIRSPACE)
  // ============================================================================
  const vehicles: HyperloopVehicle[] = [];
  if (trafficDensity > 0) {
    const pitch = 44;
    const [vx0, vx1] = [Math.floor((ox - 12) / pitch), Math.ceil((ox + width + 12) / pitch)];
    const [vz0, vz1] = [Math.floor((oz - 12) / pitch), Math.ceil((oz + depth + 12) / pitch)];
    for (let j = vz0; j <= vz1; j++) {
      for (let i = vx0; i <= vx1; i++) {
        const r = (salt: number) => hash(i, j, 910 + salt, seed);
        if (r(0) >= trafficDensity * 0.72) continue;
        const cx = Math.round((i + 0.15 + r(1) * 0.7) * pitch);
        const cz = Math.round((j + 0.15 + r(2) * 0.7) * pitch);
        const cy = Math.round(48 + r(3) * Math.max(24, Math.min(ceiling - 16, config.loopHeight - 24) - 48));
        if (cy < 28 || cy >= ceiling - 4) continue;
        if (!near(cx - 8, cz - 8, cx + 8, cz + 8)) continue;
        const pt = { x: cx, y: cy, z: cz };
        if (towers.some(t => Math.hypot(t.x - cx, t.z - cz) < t.ext + 9 && cy < towerTop(t) + 6)) continue;
        if (!tubeClear(pt, TUBE_R + 6.5)) continue;

        const dir = Math.floor(r(4) * 4);
        const fx = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        const fz = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        const rx = -fz;
        const rz = fx;
        const hull = HULLS[Math.floor(r(5) * HULLS.length)];
        const isCruiser = r(6) < 0.52;
        const glowColor = r(7) < 0.65 ? C.cyan : C.gold;

        if (isCruiser) {
          // Sleek futuristic flying hover-cruiser (micro-voxel sculpted fuselage, tinted canopy & thrusters).
          const putV = (s: number, u: number, h: number, col: number, em = 0) => {
            micro(cx + fx * s + rx * u, cy + h, cz + fz * s + rz * u, col, em);
          };
          for (let s = -2.25; s <= 2.5; s += 0.25) {
            const wMax = Math.abs(s) > 1.75 ? 0.25 : Math.abs(s) > 1.0 ? 0.5 : 0.75;
            for (let u = -wMax; u <= wMax; u += 0.25) {
              putV(s, u, 0, hull);
              if (Math.abs(s) < 1.5 && Math.abs(u) <= 0.5) {
                putV(s, u, 0.25, s > -0.25 && s < 1.1 ? C.canopy : hull);
              }
            }
          }
          // Twin side nacelles & glowing rear thrusters + headlights.
          for (const side of [-1.0, 1.0]) {
            for (let s = -1.75; s <= 0.5; s += 0.25) putV(s, side, 0, C.graphite);
            if (lights > 0.05) {
              putV(-2.0, side, 0, glowColor, 2.6);
              putV(-2.25, side, 0, glowColor, 1.8);
              putV(-2.75, side, 0, glowColor, 1.1);
            }
          }
          if (lights > 0.05) {
            putV(2.5, -0.25, 0, C.collar, 2.2);
            putV(2.5, 0.25, 0, C.collar, 2.2);
          }
          vehicles.push({ x: cx, y: cy, z: cz, kind: 'cruiser' });
        } else {
          // Compact hover-drone flight formation (1–3 nimble craft like the distant silhouettes in the image).
          const count = 1 + Math.floor(r(8) * 3);
          for (let d = 0; d < count; d++) {
            const dx = cx + (d === 0 ? 0 : (d === 1 ? 5 : -4) * rx - d * 3 * fx);
            const dz = cz + (d === 0 ? 0 : (d === 1 ? 5 : -4) * rz - d * 3 * fz);
            const dy = cy + (d === 1 ? 2 : d === 2 ? -2 : 0);
            if (dy < 28 || dy >= ceiling - 2) continue;
            for (let s = -0.75; s <= 0.875; s += 0.25) {
              for (let u = -0.5; u <= 0.5; u += 0.25) {
                micro(dx + fx * s + rx * u, dy, dz + fz * s + rz * u, Math.abs(u) > 0.3 ? C.graphite : hull);
              }
            }
            if (lights > 0.05) {
              micro(dx - fx * 1.0, dy, dz - fz * 1.0, glowColor, 2.3);
              micro(dx + fx * 1.0, dy, dz + fz * 1.0, C.collar, 1.9);
            }
            vehicles.push({ x: dx, y: dy, z: dz, kind: 'drone' });
          }
        }
      }
    }
  }

  // ============================================================================
  // 6. SURFACE CULLING & VOXEL EMISSION (1m + 0.125m, NORMAL + EMISSIVE ONLY)
  // ============================================================================
  const emit = (v: HyperloopVoxel) => {
    voxels.push(v);
    const ix = Math.floor(v.x + width / 2);
    const iz = Math.floor(v.z + depth / 2);
    if (ix >= 0 && ix < width && iz >= 0 && iz < depth) {
      const idx = ix + iz * width;
      const top = v.y + v.sizeY;
      if (top > heights[idx]) heights[idx] = top;
    }
  };

  let standardCount = 0;
  let emissiveCount = 0;
  const maxX = width - 1;
  const maxZ = depth - 1;
  const maxY = ceiling - 1;

  for (let y = 0; y < ceiling; y++) {
    const yOff = y * layer;
    const hasLoY = y > 0;
    const hasHiY = y < maxY;
    for (let z = 0; z < depth; z++) {
      const zOff = z * width + yOff;
      const hasLoZ = z > 0;
      const hasHiZ = z < maxZ;
      for (let x = 0; x < width; x++) {
        const idx = x + zOff;
        const id = cells[idx];
        if (!id) continue;
        if (
          x > 0 &&
          x < maxX &&
          hasLoZ &&
          hasHiZ &&
          hasLoY &&
          hasHiY &&
          cells[idx - 1] &&
          cells[idx + 1] &&
          cells[idx - width] &&
          cells[idx + width] &&
          cells[idx - layer] &&
          cells[idx + layer]
        ) {
          continue;
        }
        const p = palette[id];
        const emissive = p.emission > 0;
        let color = p.color;
        if (p.vary && !emissive) {
          const jitter = hash(x + ox, z + oz, y + 300, seed) - 0.5;
          color = tint(color, 1 + jitter * 0.045 * p.vary);
        }
        emit({
          x: x + 0.5 - width / 2,
          y,
          z: z + 0.5 - depth / 2,
          sizeX: 1,
          sizeY: 1,
          sizeZ: 1,
          color,
          material: emissive ? 'emissive' : 'normal',
          emissive,
          intensity: p.emission,
        });
        standardCount++;
        if (emissive) emissiveCount++;
      }
    }
  }

  // Emit non-buried 0.125m micro-voxels.
  for (const v of micros.values()) {
    const cx = Math.floor(v.x + width / 2);
    const cy = Math.floor(v.y);
    const cz = Math.floor(v.z + depth / 2);
    if (cx < 0 || cx >= width || cz < 0 || cz >= depth || cy < 0 || cy >= ceiling) continue;
    if (cells[cx + cz * width + cy * layer]) continue;
    emit(v);
    if (v.emissive) emissiveCount++;
  }

  // ============================================================================
  // 7. CINEMATIC HERO, DECK & LANDMARK CAMERA PRESETS (RAY-MARCHED CLEARANCE)
  // ============================================================================
  const local = (p: HyperloopPoint): HyperloopPoint => ({
    x: p.x - ox - width / 2,
    y: p.y,
    z: p.z - oz - depth / 2,
  });
  const inCrop = (x: number, z: number, pad = 16) =>
    x >= ox + pad && x <= ox + width - pad && z >= oz + pad && z <= oz + depth - pad;
  const solidAt = (wx: number, wy: number, wz: number) => {
    const lx = Math.floor(wx) - ox;
    const ly = Math.floor(wy);
    const lz = Math.floor(wz) - oz;
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || ly < 0 || ly >= ceiling) return false;
    return cells[lx + lz * width + ly * layer] !== 0;
  };
  const clearLineOfSight = (pos: HyperloopPoint, target: HyperloopPoint, bubbleR = 4, coneNear = 38) => {
    // 1. Keep a clean air bubble around the camera lens so no wall/bridge/tree clips the near plane.
    for (let dy = -1; dy <= bubbleR; dy++) {
      for (let dz = -bubbleR; dz <= bubbleR; dz++) {
        for (let dx = -bubbleR; dx <= bubbleR; dx++) {
          if (dx * dx + dy * dy + dz * dz <= bubbleR * bubbleR + 1 && solidAt(pos.x + dx, pos.y + dy, pos.z + dz)) {
            return false;
          }
        }
      }
    }
    // 2. Ray-march toward target with a near-field guard cone so no skybridge slices across the foreground.
    const vx = target.x - pos.x;
    const vy = target.y - pos.y;
    const vz = target.z - pos.z;
    const dist = Math.hypot(vx, vy, vz);
    if (dist < 10) return false;
    const fx = vx / dist;
    const fy = vy / dist;
    const fz = vz / dist;
    const hLen = Math.hypot(fx, fz) || 1;
    const rx = -fz / hLen;
    const rz = fx / hLen;
    const maxMarch = Math.max(8, Math.min(dist * 0.82, dist - 14));
    for (let d = 2.5; d <= maxMarch; d += 1.75) {
      const px = pos.x + fx * d;
      const py = pos.y + fy * d;
      const pz = pos.z + fz * d;
      if (solidAt(px, py, pz)) return false;
      if (d < coneNear) {
        const spread = 2.8 + (d / coneNear) * 3.8;
        if (
          solidAt(px + rx * spread, py, pz + rz * spread) ||
          solidAt(px - rx * spread, py, pz - rz * spread) ||
          solidAt(px + rx * spread * 1.4, py + 1.5, pz + rz * spread * 1.4) ||
          solidAt(px - rx * spread * 1.4, py + 1.5, pz - rz * spread * 1.4) ||
          solidAt(px, py + spread, pz) ||
          solidAt(px, py - 2.0, pz)
        ) {
          return false;
        }
      }
    }
    return true;
  };

  const cropTowers = visibleTowers.filter(t => inCrop(t.x, t.z, 12));
  const heroHelix =
    cropTowers
      .filter(t => t.family === HELIX)
      .sort((a, b) => Math.hypot(a.x - config.offsetX, a.z - config.offsetZ) - Math.hypot(b.x - config.offsetX, b.z - config.offsetZ))[0] ??
    cropTowers.sort((a, b) => b.height - a.height)[0];

  const heroHub = visibleHubs
    .filter(h => inCrop(h.x, h.z, 20) && h.y < ceiling - 12)
    .sort((a, b) => Math.hypot(a.x - config.offsetX, a.z - config.offsetZ) - Math.hypot(b.x - config.offsetX, b.z - config.offsetZ))[0];

  const sunAz = Math.atan2(-HYPERLOOP_SUN.z, -HYPERLOOP_SUN.x); // Camera azimuth placing sunset behind skyline.
  const pickClearOrbit = (
    targetWorld: HyperloopPoint,
    radii: number[],
    heights: number[],
    preferredAz: number,
    azSteps = 16,
    maxSpread = Math.PI,
    bubbleR = 4,
    coneNear = 38,
  ): HyperloopView | null => {
    let best: { score: number; view: HyperloopView } | null = null;
    for (const r of radii) {
      for (const y of heights) {
        if (y < 24 || y >= ceiling - 4) continue;
        for (let k = 0; k < azSteps; k++) {
          const frac = azSteps === 1 ? 0 : (k / (azSteps - 1) - 0.5) * 2;
          const a = preferredAz + frac * maxSpread;
          const pos: HyperloopPoint = {
            x: targetWorld.x + Math.cos(a) * r,
            y,
            z: targetWorld.z + Math.sin(a) * r,
          };
          if (!clearLineOfSight(pos, targetWorld, bubbleR, coneNear)) continue;
          // Prefer views whose upper sky sightline is also unobstructed (clean skyline silhouette!).
          const skyPt = { x: targetWorld.x, y: Math.min(ceiling - 2, targetWorld.y + 42), z: targetWorld.z };
          const openSky = clearLineOfSight(pos, skyPt, 2, 26) ? 1 : 0;
          const dx = targetWorld.x - pos.x;
          const dz = targetWorld.z - pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          const sunAlign = (dx / dl) * HYPERLOOP_SUN.x + (dz / dl) * HYPERLOOP_SUN.z;
          const distPenalty = Math.abs(r - radii[Math.floor(radii.length / 2)]) * 0.004;
          const score = sunAlign * 1.4 + openSky * 0.9 - distPenalty;
          if (!best || score > best.score) {
            best = { score, view: { position: local(pos), target: local(targetWorld) } };
          }
        }
      }
    }
    return best?.view ?? null;
  };

  // Primary overview camera: panoramic sunset-facing canyon vista showcasing foreground
  // sweeping transit tubes + Y-junction hub, lush eco-skybridges, and the Double-Helix skyline.
  const anchorWorld: HyperloopPoint =
    heroHub && heroHelix
      ? {
          x: heroHub.x * 0.45 + heroHelix.x * 0.55,
          y: Math.min(ceiling * 0.68, Math.max(54, (heroHub.y + heroHelix.height * 0.52) * 0.5)),
          z: heroHub.z * 0.45 + heroHelix.z * 0.55,
        }
      : heroHelix
        ? { x: heroHelix.x, y: Math.min(ceiling * 0.62, heroHelix.height * 0.48), z: heroHelix.z }
        : { x: config.offsetX, y: Math.min(ceiling * 0.4, 62), z: config.offsetZ };

  const pickedOverview = pickClearOrbit(
    anchorWorld,
    [136, 158, 182, 206],
    [
      Math.min(ceiling - 6, anchorWorld.y + 24),
      Math.min(ceiling - 6, anchorWorld.y + 42),
      Math.min(ceiling - 6, anchorWorld.y + 62),
      Math.min(ceiling - 6, anchorWorld.y + 82),
    ],
    sunAz,
    25,
    1.25,
    5,
    52,
  );
  const overviewView: HyperloopView = pickedOverview ?? {
    position: { x: width * 0.42, y: Math.min(ceiling - 6, Math.max(95, ceiling * 0.68)), z: depth * 0.54 },
    target: local(anchorWorld),
  };

  // Deck / skybridge viewpoint: stands on an actual emitted 1m eco-skybridge deck with open sky above
  // and a clear sightline out across the transit tubes & sunset skyline!
  let deckView: HyperloopView | null = null;
  const candidateBridges = visibleBridges
    .filter(b => b.kind === 'garden' && b.level < ceiling - 12)
    .sort((a, b) => {
      const ma = Math.hypot((a.start.x + a.end.x) / 2 - config.offsetX, (a.start.z + a.end.z) / 2 - config.offsetZ);
      const mb = Math.hypot((b.start.x + b.end.x) / 2 - config.offsetX, (b.start.z + b.end.z) / 2 - config.offsetZ);
      return ma - mb;
    });
  for (const br of candidateBridges) {
    const deckY = br.level - 1;
    let foundOnBridge = false;
    for (const frac of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const mx = Math.floor(br.start.x + (br.end.x - br.start.x) * frac);
      const mz = Math.floor(br.start.z + (br.end.z - br.start.z) * frac);
      const lx = mx - ox;
      const lz = mz - oz;
      if (lx < 3 || lx >= width - 3 || lz < 3 || lz >= depth - 3 || deckY < 1 || deckY + 14 >= ceiling) continue;
      if (!cells[lx + lz * width + deckY * layer]) continue;
      // Verify open sky from eye level upward (dy >= 3 avoids waist-high bridge hedges while rejecting trees/overhangs).
      let openHeadroom = !solidAt(mx, deckY + 1, mz) && !solidAt(mx, deckY + 2, mz);
      for (let dy = 3; dy <= 16 && openHeadroom; dy++) {
        for (let dz = -2; dz <= 2 && openHeadroom; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (solidAt(mx + dx, deckY + dy, mz + dz)) {
              openHeadroom = false;
              break;
            }
          }
        }
      }
      if (!openHeadroom) continue;
      const posWorld: HyperloopPoint = { x: mx + 0.5, y: deckY + 3.25, z: mz + 0.5 };
      const targets: HyperloopPoint[] = [];
      if (heroHub) targets.push({ x: heroHub.x, y: heroHub.y + 8, z: heroHub.z });
      if (heroHelix) targets.push({ x: heroHelix.x, y: Math.min(ceiling - 8, heroHelix.height * 0.55), z: heroHelix.z });
      // Also try looking perpendicular to the bridge toward the open sunset canyon!
      const bdx = br.end.x - br.start.x;
      const bdz = br.end.z - br.start.z;
      const bl = Math.hypot(bdx, bdz) || 1;
      targets.push({ x: posWorld.x - (bdz / bl) * 65, y: deckY + 24, z: posWorld.z + (bdx / bl) * 65 });
      targets.push({ x: posWorld.x + (bdz / bl) * 65, y: deckY + 24, z: posWorld.z - (bdx / bl) * 65 });
      for (const tgt of targets) {
        if (clearLineOfSight(posWorld, tgt, 2, 24)) {
          deckView = { position: local(posWorld), target: local(tgt) };
          foundOnBridge = true;
          break;
        }
      }
      if (foundOnBridge) break;
    }
    if (foundOnBridge) break;
  }
  if (!deckView && heroHelix && heroHelix.podium + 4 < ceiling) {
    const px = Math.floor(heroHelix.x + heroHelix.ext + 3);
    const pz = Math.floor(heroHelix.z + heroHelix.ext + 3);
    const lx = px - ox;
    const lz = pz - oz;
    if (lx >= 1 && lx < width - 1 && lz >= 1 && lz < depth - 1 && cells[lx + lz * width]) {
      deckView = {
        position: local({ x: px + 0.5, y: 3.25, z: pz + 0.5 }),
        target: local({ x: heroHelix.x, y: Math.min(ceiling * 0.65, 64), z: heroHelix.z }),
      };
    }
  }

  // Cycling unobstructed landmark close-ups (Double-Helix Spire, Y-Junction Hub, Hologram Spire).
  const landmarkViews: HyperloopView[] = [];
  if (heroHelix) {
    const tgt = { x: heroHelix.x, y: Math.min(ceiling * 0.72, heroHelix.height * 0.52), z: heroHelix.z };
    const v = pickClearOrbit(tgt, [58, 72, 88], [tgt.y - 6, tgt.y + 8, tgt.y + 22], sunAz, 17, Math.PI, 3, 28);
    if (v) landmarkViews.push({ label: 'Double-Helix Spire', ...v });
  }
  if (heroHub) {
    const tgt = { x: heroHub.x, y: heroHub.y + 2, z: heroHub.z };
    const v = pickClearOrbit(tgt, [36, 48, 62], [tgt.y + 12, tgt.y + 24, tgt.y + 36], sunAz, 17, Math.PI, 3, 22);
    if (v) landmarkViews.push({ label: 'Y-Junction Hub', ...v });
  }
  const billboardTower = cropTowers.find(t => t.billboard >= 0);
  if (billboardTower) {
    const ang = billboardTower.billboard === 0 ? Math.PI * 0.44 : billboardTower.angle + billboardTower.billboard * 1.15;
    const tgt = { x: billboardTower.x, y: Math.min(ceiling * 0.72, billboardTower.height * 0.52), z: billboardTower.z };
    const v = pickClearOrbit(tgt, [52, 66, 82], [tgt.y, tgt.y + 14], ang, 9, 0.75, 3, 26);
    if (v) landmarkViews.push({ label: 'Hologram Spire', ...v });
  }

  return {
    voxels,
    heights,
    width,
    depth,
    towers: visibleTowers,
    blocks: visibleBlocks,
    tubes,
    hubs: visibleHubs,
    bridges: visibleBridges,
    vehicles,
    standardCount,
    emissiveCount,
    overviewView,
    deckView,
    landmarkViews,
  };
}
