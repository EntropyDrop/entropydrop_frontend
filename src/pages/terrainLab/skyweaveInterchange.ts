/** Skyweave Interchange · 云织立交
 *
 * An infinite, coordinate-addressed sunlit eco-metropolis built around a logically
 * consistent multi-level road network, using Space's three voxel materials:
 *   - normal       (materialId = 0)
 *   - translucent  (materialId = 2..101,   transparency = 1..100%)
 *   - emissive     (materialId = 102..201, emission     = 1..100%)
 *
 * Road network (pure functions of world coordinates + seed, so any crop tiles seamlessly):
 *   - Expressways run on a jittered macro lattice. East-west trunks are continuous; north-south
 *     expressways exist per segment, so every lattice node is a full crossing (cloverleaf),
 *     a T junction (trumpet) or a plain pass-through. Two expressways only ever cross at a
 *     node, always with a 9 m level separation.
 *   - Every ramp diverges from the right-hand outer lane on a taper and merges back into the
 *     right-hand outer lane of its target carriageway at exactly that carriageway's height.
 *   - Avenues form a jittered street grid with at-grade signalised intersections. Expressway
 *     profiles are pinned to clear every avenue by ≥ 9 m (or pass deep beneath it in a tunnel);
 *     diamond interchanges link avenues and expressways with descending slip ramps.
 *   - Vertical profiles follow smoothed terrain under grade limits. Where ground rises above a
 *     road it runs in an open cut with retaining walls, or in a lined tunnel with portals once
 *     the cover exceeds 8 m. Valleys and rivers are crossed on piers.
 *   - Glass sky-tubes (with interior maglev rails) and open twin maglev guideways fly above it
 *     all. No vehicles, drones or trains are generated.
 *
 * Geometry is exclusively 1 m / 0.125 m cubes. Output X/Z are cube centres relative to the crop
 * centre; Y is the cube bottom. */

export const SKYWEAVE_SUN = { x: -0.58, y: 0.46, z: -0.67 };

export const SPACE_MATERIAL_IDS = {
  DEFAULT: 0,
  TRANSLUCENT_MIN: 2,
  TRANSLUCENT_MAX: 101,
  EMISSIVE_MIN: 102,
  EMISSIVE_MAX: 201,
} as const;

export type WeaveMaterialKind = 'normal' | 'translucent' | 'emissive';

export interface WeaveConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  weaveRelief: number;
  weaveSkyline: number;
  weaveDensity: number;
  weaveExpressways: number;
  weaveDiamonds: number;
  weaveTubes: number;
  weaveTracks: number;
  weaveForest: number;
  weaveWater: number;
  weaveGlass: number;
  weaveLights: number;
  weaveGlow: number;
}

export const WEAVE_DEFAULTS = {
  weaveRelief: 1.0,
  weaveSkyline: 176,
  weaveDensity: 0.82,
  weaveExpressways: 0.72,
  weaveDiamonds: 0.8,
  weaveTubes: 0.85,
  weaveTracks: 0.8,
  weaveForest: 0.9,
  weaveWater: 0.6,
  weaveGlass: 0.7,
  weaveLights: 0.75,
  weaveGlow: 0.2,
};

export const WEAVE_FAMILIES = [
  'circular_eco',
  'arch_fin',
  'crystal_spire',
  'sail_blade',
  'biodome',
  'terrace_podium',
  'twin_skybridge',
  'garden_pavilion',
] as const;

export interface WeavePoint { x: number; y: number; z: number }

export interface WeaveVoxel extends WeavePoint {
  sizeX: 1 | 0.125;
  sizeY: 1 | 0.125;
  sizeZ: 1 | 0.125;
  color: number;
  material: WeaveMaterialKind;
  materialId: number;
  transparency: number;
  emission: number;
  emissive: boolean;
  intensity: number;
}

export interface WeaveView { position: WeavePoint; target: WeavePoint }

export interface WeaveRoadPoint { x: number; z: number; tx: number; tz: number; s: number; h: number }

export type WeaveDeckKind = 'exp' | 'ramp' | 'art' | 'lane';

export interface WeaveDeck {
  id: string;
  kind: WeaveDeckKind;
  hw: number;
  pts: WeaveRoadPoint[];
  terr: Float32Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Lane markings are suppressed for s < trim0 and s > trim1 (intersection boxes). */
  trim0: number;
  trim1: number;
  tunnelOk: boolean;
  /** Per-sample flag: translucent noise-barrier panels on the parapets. */
  barrier?: Uint8Array;
  /** Lazily computed per-sample construction mode (grade / elevated / cut / tunnel). */
  mode?: Uint8Array;
  /** Ramp end-points: which carriageway it leaves and joins (for validation). */
  from?: string;
  to?: string;
}

export interface WeaveGantry { x: number; z: number; tx: number; tz: number; h: number }

export interface WeaveCrossing { s: number; ga: number; cos: number; id: string }

export interface WeaveExpSegment {
  id: string;
  axis: 0 | 1;
  deck: WeaveDeck;
  fixed0: number;
  fixed1: number;
  level0: number;
  level1: number;
  crossings: WeaveCrossing[];
  diamonds: WeaveDeck[];
  diamondAt: WeaveCrossing | null;
  gantries: WeaveGantry[];
}

export interface WeaveInterchange {
  id: string;
  kind: 'cloverleaf' | 'trumpet';
  i: number;
  j: number;
  x: number;
  z: number;
  tax: number;
  taz: number;
  levelLow: number;
  levelHigh: number;
  plateau: number;
  ramps: WeaveDeck[];
  gantries: WeaveGantry[];
}

export interface WeaveSpan {
  id: string;
  kind: 'tube' | 'track';
  pts: WeaveRoadPoint[];
  base: number;
}

export interface WeaveBuilding {
  id: string;
  x: number;
  z: number;
  base: number;
  height: number;
  family: number;
  radius: number;
  angle: number;
  palette: number;
  holo: boolean;
  district: number;
}

export interface WeavePark { id: string; x: number; z: number; r: number; base: number; pond: boolean }

export interface WeavePylon { id: string; kind: 'tube' | 'track'; x: number; z: number; y: number; tx: number; tz: number }

const M = 0.125;
const WATER = 8;
const EXP_SX = 600;
const EXP_SZ = 560;
const EXP_JIT = 0.09;
const ART = 128;
const ART_JIT = 12;
const LS = 150;
const EXP_HW = 10;
const RAMP_HW = 3.5;
const ART_HW = 10;
const ART_ROAD = 7;
const LANE_HW = 4.5;
const LEVEL_GAP = 9;
const FLAT_R1 = 172;
const FLAT_R2 = 255;
const TUBE_ANG = 0.43;
const TUBE_P = 300;
const TUBE_Q = 780;
const TUBE_R = 6;
const TRACK_ANG = -0.37;
const TRACK_P = 260;
const TRACK_Q = 610;
const SPAN_GRADE = 0.05;

export const WEAVE_MODE = { GRADE: 0, ELEVATED: 1, CUT: 2, TUNNEL: 3 } as const;
const MODE_GRADE = 0;
const MODE_ELEV = 1;
const MODE_CUT = 2;
const MODE_TUNNEL = 3;

export const WEAVE_CONSTANTS = { WATER, EXP_HW, RAMP_HW, ART_HW, LANE_HW, LEVEL_GAP, LS, EXP_SX, EXP_SZ, ART, TUBE_R };

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
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
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, salt, seed), b = hash(ix + 1, iz, salt, seed);
  const c = hash(ix, iz + 1, salt, seed), d = hash(ix + 1, iz + 1, salt, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(x: number, z: number, seed: number, salt: number, oct = 4): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise2(x * freq + o * 17.31, z * freq - o * 11.87, seed, salt + o * 7) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Exact Space material ID encoding: 0 = normal, 2..101 = transparency 1..100%, 102..201 = emission 1..100%. */
export function encodeSpaceMaterialId(kind: WeaveMaterialKind, level: number): number {
  if (kind === 'normal') return SPACE_MATERIAL_IDS.DEFAULT;
  const clamped = Math.max(1, Math.min(100, Math.round(level)));
  return kind === 'translucent' ? clamped + 1 : clamped + 101;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

interface P2 { x: number; z: number }

function lineTo(a: P2, b: P2, out: P2[]) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(len / 0.5);
  for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
}

function hermite(p0: P2, p1: P2, t0: P2, t1: P2, out: P2[]) {
  const L = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const n = Math.max(2, Math.ceil(L / 0.5));
  for (let k = 1; k <= n; k++) {
    const t = k / n, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.push({
      x: h00 * p0.x + h10 * L * t0.x + h01 * p1.x + h11 * L * t1.x,
      z: h00 * p0.z + h10 * L * t0.z + h01 * p1.z + h11 * L * t1.z,
    });
  }
}

function resample(raw: P2[], ds = 1): WeaveRoadPoint[] {
  const out: WeaveRoadPoint[] = [];
  if (raw.length < 2) return out;
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / ds));
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const s = total * k / n;
    while (seg < raw.length - 2 && cum[seg + 1] < s) seg++;
    const l = cum[seg + 1] - cum[seg] || 1;
    const t = clamp((s - cum[seg]) / l);
    const a = raw[seg], b = raw[seg + 1];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: 1, tz: 0, s, h: 0 });
  }
  for (let k = 0; k < out.length; k++) {
    const p = out[Math.max(0, k - 1)], q = out[Math.min(out.length - 1, k + 1)];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    out[k].tx = dx / l;
    out[k].tz = dz / l;
  }
  return out;
}

/** Turtle in an interchange's local frame: u along the low mainline, v to its right. */
class Turtle {
  pts: { u: number; v: number }[] = [];
  u: number;
  v: number;
  a: number;
  constructor(u: number, v: number, a: number) {
    this.u = u;
    this.v = v;
    this.a = a;
    this.pts.push({ u, v });
  }
  line(len: number) {
    const n = Math.max(1, Math.ceil(len / 0.5));
    const cu = Math.cos(this.a), cv = Math.sin(this.a);
    const u0 = this.u, v0 = this.v;
    for (let k = 1; k <= n; k++) {
      this.u = u0 + cu * len * k / n;
      this.v = v0 + cv * len * k / n;
      this.pts.push({ u: this.u, v: this.v });
    }
    return this;
  }
  /** Move `len` forward while drifting `dv` to the right on a smooth taper. */
  shift(len: number, dv: number) {
    const n = Math.max(1, Math.ceil(len / 0.5));
    const cu = Math.cos(this.a), cv = Math.sin(this.a);
    const ru = -cv, rv = cu;
    const u0 = this.u, v0 = this.v;
    for (let k = 1; k <= n; k++) {
      const t = k / n, sh = smooth(t) * dv;
      this.u = u0 + cu * len * t + ru * sh;
      this.v = v0 + cv * len * t + rv * sh;
      this.pts.push({ u: this.u, v: this.v });
    }
    return this;
  }
  /** Circular arc; positive angle turns right (towards +v when heading +u). */
  arc(r: number, ang: number) {
    const sg = Math.sign(ang);
    const ru = -Math.sin(this.a), rv = Math.cos(this.a);
    const cu = this.u + ru * r * sg, cv = this.v + rv * r * sg;
    const start = Math.atan2(this.v - cv, this.u - cu);
    const n = Math.max(2, Math.ceil(Math.abs(ang) * r / 0.5));
    for (let k = 1; k <= n; k++) {
      const phi = start + ang * k / n;
      this.u = cu + Math.cos(phi) * r;
      this.v = cv + Math.sin(phi) * r;
      this.pts.push({ u: this.u, v: this.v });
    }
    this.a += ang;
    return this;
  }
  bezier(u1: number, v1: number, a1: number, k0: number, k1: number) {
    const p0u = this.u, p0v = this.v;
    const p1u = p0u + Math.cos(this.a) * k0, p1v = p0v + Math.sin(this.a) * k0;
    const p2u = u1 - Math.cos(a1) * k1, p2v = v1 - Math.sin(a1) * k1;
    const n = 240;
    for (let k = 1; k <= n; k++) {
      const t = k / n, m = 1 - t;
      this.u = m * m * m * p0u + 3 * m * m * t * p1u + 3 * m * t * t * p2u + t * t * t * u1;
      this.v = m * m * m * p0v + 3 * m * m * t * p1v + 3 * m * t * t * p2v + t * t * t * v1;
      this.pts.push({ u: this.u, v: this.v });
    }
    this.a = a1;
    return this;
  }
}

function makeDeck(
  id: string, kind: WeaveDeckKind, hw: number, pts: WeaveRoadPoint[], terr: Float32Array,
  opts: { trim0: number; trim1: number; tunnelOk: boolean; from?: string; to?: string },
): WeaveDeck {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return {
    id, kind, hw, pts, terr,
    minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw,
    trim0: opts.trim0, trim1: opts.trim1, tunnelOk: opts.tunnelOk, from: opts.from, to: opts.to,
  };
}

interface ProfileOpts {
  fixed0: number;
  fixed1: number;
  level0: number;
  level1: number;
  lift: number;
  window: number;
  grade: number;
  band?: number;
  pins?: { s: number; min: number; r: number }[];
  /** Optional upper bound (used to dip an expressway down to a diamond interchange). */
  cap?: (s: number) => number;
  waterMin: number;
}

/** Grade-limited vertical profile: smoothed terrain + lift, pinned to fixed end levels,
 * raised (never lowered) to satisfy clearance pins and water crossings. */
function solveProfile(pts: WeaveRoadPoint[], terr: Float32Array, o: ProfileOpts): Float32Array {
  const n = pts.length;
  const d = new Float32Array(n);
  if (!n) return d;
  const ds = n > 1 ? pts[n - 1].s / (n - 1) : 1;
  const pre = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) pre[k + 1] = pre[k] + terr[k];
  const wn = Math.max(1, Math.round(o.window / ds));
  const mins = new Float32Array(n).fill(-1e9);
  for (let k = 0; k < n; k++) if (terr[k] < WATER + 1) mins[k] = o.waterMin;
  for (const pin of o.pins ?? []) {
    // Clearance pins taper off at just under the grade limit, so they never leave a kink.
    for (let k = 0; k < n; k++) {
      const m = pin.min - Math.max(0, Math.abs(pts[k].s - pin.s) - pin.r) * o.grade * 0.85;
      if (m > mins[k]) mins[k] = m;
    }
  }
  const span = Math.max(1, o.fixed1 - o.fixed0);
  const free = (k: number) => pts[k].s > o.fixed0 && pts[k].s < o.fixed1;
  // Never higher than what the fixed ends can reach at the grade limit (pins still win).
  const hiEnv = (s: number) => Math.min(o.level0 + o.grade * (s - o.fixed0), o.level1 + o.grade * (o.fixed1 - s));
  for (let k = 0; k < n; k++) {
    const s = pts[k].s;
    if (s <= o.fixed0) { d[k] = o.level0; continue; }
    if (s >= o.fixed1) { d[k] = o.level1; continue; }
    const lo = Math.max(0, k - wn), hi = Math.min(n - 1, k + wn);
    let target = (pre[hi + 1] - pre[lo]) / (hi - lo + 1) + o.lift;
    const lin = lerp(o.level0, o.level1, (s - o.fixed0) / span);
    if (o.band !== undefined) target = clamp(target, lin - o.band, lin + o.band);
    const w = smooth(Math.min(s - o.fixed0, o.fixed1 - s) / 60);
    d[k] = lerp(lin, target, w);
    if (o.cap) d[k] = Math.min(d[k], o.cap(s));
    d[k] = Math.max(Math.min(d[k], hiEnv(s)), mins[k]);
  }
  const g = o.grade * ds;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k < n; k++) if (free(k)) d[k] = Math.max(d[k], d[k - 1] - g);
    for (let k = n - 2; k >= 0; k--) if (free(k)) d[k] = Math.max(d[k], d[k + 1] - g);
    // Light smoothing keeps 1 m voxel steps evenly spaced along the grade.
    const sm = Float32Array.from(d);
    const r = Math.max(1, Math.round(6 / ds));
    for (let k = 0; k < n; k++) {
      if (!free(k)) continue;
      let sum = 0, cnt = 0;
      for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) { sum += d[q]; cnt++; }
      sm[k] = Math.min(sum / cnt, hiEnv(pts[k].s));
      if (o.cap) sm[k] = Math.min(sm[k], o.cap(pts[k].s));
      sm[k] = Math.max(sm[k], mins[k]);
    }
    d.set(sm);
  }
  return d;
}

/** Segment / segment intersection between two sampled polylines (coarse step, exact refine). */
function intersectPolylines(
  A: WeaveRoadPoint[], B: WeaveRoadPoint[], step: number,
  cb: (sa: number, sb: number, ka: number, kb: number) => void,
) {
  for (let i = 0; i + 1 < A.length; i += step) {
    const a0 = A[i], a1 = A[Math.min(A.length - 1, i + step)];
    const aMinX = Math.min(a0.x, a1.x), aMaxX = Math.max(a0.x, a1.x);
    const aMinZ = Math.min(a0.z, a1.z), aMaxZ = Math.max(a0.z, a1.z);
    for (let j = 0; j + 1 < B.length; j += step) {
      const b0 = B[j], b1 = B[Math.min(B.length - 1, j + step)];
      if (Math.max(b0.x, b1.x) < aMinX || Math.min(b0.x, b1.x) > aMaxX) continue;
      if (Math.max(b0.z, b1.z) < aMinZ || Math.min(b0.z, b1.z) > aMaxZ) continue;
      const rx = a1.x - a0.x, rz = a1.z - a0.z, sx = b1.x - b0.x, sz = b1.z - b0.z;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const qx = b0.x - a0.x, qz = b0.z - a0.z;
      const t = (qx * sz - qz * sx) / den;
      const u = (qx * rz - qz * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      const sa = a0.s + (a1.s - a0.s) * t, sb = b0.s + (b1.s - b0.s) * u;
      cb(sa, sb, Math.round(i + (Math.min(A.length - 1, i + step) - i) * t), Math.round(j + (Math.min(B.length - 1, j + step) - j) * u));
    }
  }
}

function rampHeights(pts: WeaveRoadPoint[], h0: number, h1: number, hold0: number, hold1: number) {
  const L = pts[pts.length - 1].s;
  const span = Math.max(1, L - hold0 - hold1);
  for (const p of pts) {
    if (p.s <= hold0) p.h = h0;
    else if (p.s >= L - hold1) p.h = h1;
    else {
      const t = (p.s - hold0) / span;
      p.h = h0 + (h1 - h0) * (t * 0.45 + smooth(t) * 0.55);
    }
  }
}

const key2 = (i: number, j: number) => (i + 30000) * 60000 + (j + 30000);

interface ExpNode {
  i: number;
  j: number;
  x: number;
  z: number;
  kind: 'X' | 'TS' | 'TN' | 'S';
  tax: number;
  taz: number;
  plateau: number;
}

interface ArtNode { a: number; b: number; x: number; z: number; h: number }

interface ExpGeom {
  n0: ExpNode;
  n1: ExpNode;
  pts: WeaveRoadPoint[];
  fixed0: number;
  fixed1: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ---------------------------------------------------------------------------
// The world: every query is a pure (memoised) function of world coordinates.
// ---------------------------------------------------------------------------

class WeaveWorld {
  readonly seed: number;
  readonly relief: number;
  readonly water: number;
  readonly expP: number;
  readonly diamondP: number;
  readonly tubeP: number;
  readonly trackP: number;
  readonly density: number;
  private nodes = new Map<number, ExpNode>();
  private levelMemo = new Map<number, { LA: number; LB: number }>();
  private artNodes = new Map<number, ArtNode>();
  private artSegs = new Map<number, WeaveDeck | null>();
  private laneMemo = new Map<number, WeaveDeck | null>();
  private expSegs = new Map<number, WeaveExpSegment | null>();
  private ics = new Map<number, WeaveInterchange | null>();
  private spanMemo = new Map<number, WeaveSpan | null>();
  private decksById = new Map<string, WeaveDeck>();
  private artPosMemo = new Map<number, P2>();
  private geomMemo = new Map<number, ExpGeom | null>();
  private geomSpanMemo = new Map<number, { pts: WeaveRoadPoint[]; req: Float32Array; p1: P2; p2: P2 }>();
  private spanNodeMemo = new Map<number, number>();

  constructor(cfg: WeaveConfig) {
    this.seed = Math.floor(cfg.seed);
    this.relief = clamp(cfg.weaveRelief, 0.3, 1.6);
    this.water = clamp(cfg.weaveWater);
    this.expP = clamp(cfg.weaveExpressways);
    this.diamondP = clamp(cfg.weaveDiamonds);
    this.tubeP = clamp(cfg.weaveTubes);
    this.trackP = clamp(cfg.weaveTracks);
    this.density = clamp(cfg.weaveDensity, 0.2, 1);
  }

  // ---- terrain ----------------------------------------------------------

  raw(x: number, z: number): number {
    const s = this.seed;
    const wx = x + (fbm(x / 430, z / 430, s, 3, 3) - 0.5) * 180;
    const wz = z + (fbm(x / 430 + 7.7, z / 430 - 3.1, s, 5, 3) - 0.5) * 180;
    const macro = fbm(wx / 1100, wz / 1100, s, 7, 3);
    const hill = smooth((macro - 0.42) / 0.2);
    const rn = fbm(wx / 290, wz / 290, s, 11, 4);
    const ridge = clamp(1 - Math.abs(rn * 2 - 1) * 2.6);
    const mound = fbm(wx / 115, wz / 115, s, 13, 3);
    const detail = fbm(x / 41, z / 41, s, 17, 2);
    let h = 11 + (fbm(x / 230, z / 230, s, 19, 3) - 0.5) * 8;
    h += hill * this.relief * (ridge ** 1.5 * 46 + smooth((mound - 0.42) / 0.32) * 18 + (detail - 0.5) * 7);
    h += (1 - hill) * this.relief * smooth((mound - 0.56) / 0.2) * 6;
    if (h > 21) {
      // Stepped limestone escarpments on the high ground.
      const step = 6.5;
      const base = Math.floor(h / step) * step;
      const f = (h - base) / step;
      const terraced = base + smooth((f - 0.5) / 0.32) * step;
      const amt = smooth((h - 21) / 14) * clamp(fbm(x / 95, z / 95, s, 23, 2) * 2.2 - 0.7);
      h = lerp(h, terraced, amt);
    }
    return h;
  }

  private flatCacheKey = NaN;
  private flatCache: ExpNode[] = [];

  terrain(x: number, z: number): number {
    let h = this.raw(x, z);
    const i0 = Math.round(x / EXP_SX), j0 = Math.round(z / EXP_SZ);
    const ck = key2(i0, j0);
    if (ck !== this.flatCacheKey) {
      this.flatCacheKey = ck;
      this.flatCache = [];
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        for (let j = j0 - 1; j <= j0 + 1; j++) {
          const n = this.node(i, j);
          if (n.kind !== 'S') this.flatCache.push(n);
        }
      }
    }
    for (const n of this.flatCache) {
      {
        const dx = x - n.x, dz = z - n.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > (FLAT_R2 + 30) ** 2) continue;
        const d = Math.sqrt(d2) + (noise2(x / 60, z / 60, this.seed, 29) - 0.5) * 50;
        if (d < FLAT_R2) h = lerp(h, n.plateau, smooth((FLAT_R2 - d) / (FLAT_R2 - FLAT_R1)));
      }
    }
    if (this.water > 0.02) {
      const s = this.seed;
      const lk = fbm(x / 540 + 3.3, z / 540 - 8.1, s, 47, 3);
      h -= smooth((0.22 + 0.06 * this.water - lk) / 0.06) * smooth((24 - h) / 10) * 14;
      const rx = x + (fbm(x / 300, z / 300, s, 43, 2) - 0.5) * 240;
      const rz = z + (fbm(x / 300 - 5.1, z / 300 + 2.2, s, 44, 2) - 0.5) * 240;
      const rv = fbm(rx / 900, rz / 900, s, 41, 3);
      const d = Math.abs(rv - 0.5) * 1800;
      const rw = 7 + 12 * this.water;
      const bank = 22 + Math.max(0, h - 18) * 1.3;
      if (d < rw + bank) {
        if (d < rw) h = Math.min(h, WATER - 1.2 - 3.2 * (1 - (d / rw) ** 2));
        else h = Math.min(h, lerp(WATER + 0.7, h, smooth((d - rw) / bank)));
      }
    }
    return h;
  }

  sampleTerrain(pts: WeaveRoadPoint[]): Float32Array {
    const out = new Float32Array(pts.length);
    for (let k = 0; k < pts.length; k++) out[k] = this.terrain(pts[k].x, pts[k].z);
    return out;
  }

  /** 0 = forest park, 1 = garden quarter, 2 = eco-residential, 3 = downtown core. */
  district(x: number, z: number): number {
    const d = fbm(x / 700 + 11.3, z / 700 - 4.7, this.seed, 61, 3);
    const hm = this.raw(x, z);
    const v = d + (this.density - 0.8) * 0.3 - smooth((hm - 30) / 25) * 0.22;
    return v > 0.54 ? 3 : v > 0.45 ? 2 : v > 0.37 ? 1 : 0;
  }

  // ---- expressway lattice -------------------------------------------------

  nodePos(i: number, j: number): P2 {
    return {
      x: (i + (hash(i, j, 101, this.seed) - 0.5) * 2 * EXP_JIT) * EXP_SX,
      z: (j + (hash(i, j, 102, this.seed) - 0.5) * 2 * EXP_JIT) * EXP_SZ,
    };
  }

  bSeg(i: number, j: number): boolean {
    if (this.expP <= 0.02) return false;
    if (i === 0 && (j === 0 || j === -1)) return true;
    return hash(i, j, 103, this.seed) < this.expP;
  }

  node(i: number, j: number): ExpNode {
    const k = key2(i, j);
    const old = this.nodes.get(k);
    if (old) return old;
    const p = this.nodePos(i, j);
    const bN = this.bSeg(i, j - 1), bS = this.bSeg(i, j);
    const kind = bN && bS ? 'X' : bS ? 'TS' : bN ? 'TN' : 'S';
    const a = this.nodePos(i - 1, j), b = this.nodePos(i + 1, j);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    let sum = 0;
    for (let q = 0; q < 9; q++) {
      const r = q === 0 ? 0 : 75, ang = q * Math.PI / 4;
      sum += this.raw(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r);
    }
    const n: ExpNode = {
      i, j, x: p.x, z: p.z, kind,
      tax: (b.x - a.x) / l, taz: (b.z - a.z) / l,
      plateau: Math.round(clamp(sum / 9, WATER + 3, 56)),
    };
    this.nodes.set(k, n);
    return n;
  }

  /** Final mainline levels: each node is raised until both neighbouring nodes along A and B
   * are reachable within the expressway grade limit (a few relaxation rounds, raise only). */
  levels(n: ExpNode) {
    const k = key2(n.i, n.j);
    const old = this.levelMemo.get(k);
    if (old) return old;
    const LA = this.relaxedLA(n.i, n.j, 3);
    const L = { LA, LB: LA + LEVEL_GAP };
    this.levelMemo.set(k, L);
    return L;
  }

  private relaxLAMemo = new Map<number, number>();
  private relaxedLA(i: number, j: number, round: number): number {
    if (round === 0) return this.baseLevels(this.node(i, j)).LA;
    const key = key2(i, j) * 8 + round;
    const old = this.relaxLAMemo.get(key);
    if (old !== undefined) return old;
    const n = this.node(i, j);
    let LA = this.relaxedLA(i, j, round - 1);
    const G = 0.058;
    const reach = (m: ExpNode, axis: 0 | 1) => {
      const flatN = axis === 1 || n.kind !== 'S' ? LS : 0;
      const flatM = axis === 1 || m.kind !== 'S' ? LS : 0;
      return Math.max(0, Math.hypot(m.x - n.x, m.z - n.z) - flatN - flatM - 20) * G;
    };
    for (const di of [-1, 1]) {
      const m = this.node(i + di, j);
      LA = Math.max(LA, this.relaxedLA(i + di, j, round - 1) - reach(m, 0));
    }
    for (const dj of [-1, 1]) {
      if (!this.bSeg(i, dj < 0 ? j - 1 : j)) continue;
      const m = this.node(i, j + dj);
      LA = Math.max(LA, this.relaxedLA(i, j + dj, round - 1) - reach(m, 1));
    }
    LA = Math.ceil(LA);
    this.relaxLAMemo.set(key, LA);
    return LA;
  }

  private baseLevelMemo = new Map<number, { LA: number; LB: number }>();
  private baseLevels(n: ExpNode) {
    const k = key2(n.i, n.j);
    const old = this.baseLevelMemo.get(k);
    if (old) return old;
    let LA: number;
    if (n.kind === 'S') {
      let sum = 0;
      for (let q = 0; q < 9; q++) {
        const r = q === 0 ? 0 : 50, ang = q * Math.PI / 4;
        sum += this.terrain(n.x + Math.cos(ang) * r, n.z + Math.sin(ang) * r);
      }
      LA = Math.max(Math.round(sum / 9 + 9), this.artReqNear(n.x, n.z, 0), WATER + 6);
    } else {
      LA = Math.max(n.plateau + LEVEL_GAP, this.artReqNear(n.x, n.z, LS + 25));
    }
    const L = { LA, LB: LA + LEVEL_GAP };
    this.baseLevelMemo.set(k, L);
    return L;
  }

  // ---- avenues ------------------------------------------------------------

  artPos(a: number, b: number): P2 {
    const key = key2(a, b);
    const old = this.artPosMemo.get(key);
    if (old) return old;
    const p = {
      x: a * ART + (hash(a, b, 201, this.seed) - 0.5) * 2 * ART_JIT,
      z: b * ART + (hash(a, b, 202, this.seed) - 0.5) * 2 * ART_JIT,
    };
    // Avenues never run inside an expressway corridor: nodes are pushed out to a frontage
    // line 50 m from the mainline centre, so viaduct piers always stand clear of streets.
    for (let pass = 0; pass < 2; pass++) {
      const i0 = Math.round(p.x / EXP_SX), j0 = Math.round(p.z / EXP_SZ);
      for (let i = i0 - 1; i <= i0; i++) {
        for (let j = j0 - 1; j <= j0; j++) {
          for (const axis of [0, 1] as const) {
            const g = this.expGeom(axis, i, j);
            if (!g || p.x < g.minX - 60 || p.x > g.maxX + 60 || p.z < g.minZ - 60 || p.z > g.maxZ + 60) continue;
            let best = Infinity, bk = 0;
            for (let k = 0; k < g.pts.length; k += 3) {
              const d = (g.pts[k].x - p.x) ** 2 + (g.pts[k].z - p.z) ** 2;
              if (d < best) { best = d; bk = k; }
            }
            for (let k = Math.max(0, bk - 3); k <= Math.min(g.pts.length - 1, bk + 3); k++) {
              const d = (g.pts[k].x - p.x) ** 2 + (g.pts[k].z - p.z) ** 2;
              if (d < best) { best = d; bk = k; }
            }
            const d = Math.sqrt(best);
            if (d >= 50) continue;
            const q = g.pts[bk];
            let nx = -q.tz, nz = q.tx;
            const side = (p.x - q.x) * nx + (p.z - q.z) * nz;
            if (Math.abs(side) < 1e-3 ? hash(a, b, 204, this.seed) < 0.5 : side < 0) { nx = -nx; nz = -nz; }
            p.x = q.x + nx * 50;
            p.z = q.z + nz * 50;
          }
        }
      }
    }
    this.artPosMemo.set(key, p);
    return p;
  }

  artNode(a: number, b: number): ArtNode {
    const k = key2(a, b);
    const old = this.artNodes.get(k);
    if (old) return old;
    const p = this.artPos(a, b);
    // Intersection level: smoothed ground, relaxed (several Jacobi rounds) towards the four
    // neighbouring intersections so no avenue between them has to exceed its grade limit.
    const h = this.artRelaxed(a, b, 4);
    const n = { a, b, x: p.x, z: p.z, h: Math.max(WATER + 2.5, Math.round(h)) };
    this.artNodes.set(k, n);
    return n;
  }

  private relaxMemo = new Map<number, number>();
  private artRelaxed(a: number, b: number, round: number): number {
    if (round === 0) return this.artBaseH(a, b);
    const k = key2(a, b) * 8 + round;
    const old = this.relaxMemo.get(k);
    if (old !== undefined) return old;
    const p = this.artPos(a, b);
    const own = this.artRelaxed(a, b, round - 1);
    let lo = -Infinity, hi = Infinity;
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = this.artPos(a + da, b + db);
      const reach = Math.max(3, (Math.hypot(q.x - p.x, q.z - p.z) - 30) * 0.08);
      const hn = this.artRelaxed(a + da, b + db, round - 1);
      lo = Math.max(lo, hn - reach);
      hi = Math.min(hi, hn + reach);
    }
    const h = lo <= hi ? clamp(own, lo, hi) : (lo + hi) / 2;
    this.relaxMemo.set(k, h);
    return h;
  }

  private artBaseMemo = new Map<number, number>();
  private artBaseH(a: number, b: number): number {
    const k = key2(a, b);
    const old = this.artBaseMemo.get(k);
    if (old !== undefined) return old;
    const p = this.artPos(a, b);
    let sum = this.terrain(p.x, p.z) * 2;
    for (let q = 0; q < 6; q++) {
      const ang = q * Math.PI / 3;
      sum += Math.max(WATER + 2.5, this.terrain(p.x + Math.cos(ang) * 28, p.z + Math.sin(ang) * 28));
    }
    const h = Math.max(WATER + 2.5, sum / 8);
    this.artBaseMemo.set(k, h);
    return h;
  }

  artXPresent(a: number, b: number): boolean {
    const p = this.artPos(a, b), q = this.artPos(a + 1, b);
    const hm = this.raw((p.x + q.x) / 2, (p.z + q.z) / 2);
    return hash(a, b, 203, this.seed) >= 0.06 + 0.42 * smooth((hm - 28) / 22);
  }

  artSeg(dir: 0 | 1, a: number, b: number): WeaveDeck | null {
    const k = key2(a, b) * 2 + dir;
    if (this.artSegs.has(k)) return this.artSegs.get(k)!;
    let deck: WeaveDeck | null = null;
    if (dir === 1 || this.artXPresent(a, b)) {
      const n0 = this.artNode(a, b);
      const n1 = dir === 0 ? this.artNode(a + 1, b) : this.artNode(a, b + 1);
      const pm = dir === 0 ? this.artPos(a - 1, b) : this.artPos(a, b - 1);
      const pn = dir === 0 ? this.artPos(a + 2, b) : this.artPos(a, b + 2);
      const nrm = (x: number, z: number) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
      const t0 = nrm(n1.x - pm.x, n1.z - pm.z), t1 = nrm(pn.x - n0.x, pn.z - n0.z);
      const raw: P2[] = [{ x: n0.x, z: n0.z }];
      hermite(n0, n1, t0, t1, raw);
      const pts = resample(raw, 1);
      const terr = this.sampleTerrain(pts);
      const L = pts[pts.length - 1].s;
      const h = solveProfile(pts, terr, {
        fixed0: 12, fixed1: L - 12, level0: n0.h, level1: n1.h,
        lift: 0, window: 16, band: 7, grade: clamp(Math.abs(n1.h - n0.h) / Math.max(10, L - 24) + 0.012, 0.1, 0.125), waterMin: WATER + 2.5,
      });
      for (let q = 0; q < pts.length; q++) pts[q].h = h[q];
      deck = makeDeck(`a${dir}:${a}:${b}`, 'art', ART_HW, pts, terr, { trim0: 17, trim1: L - 17, tunnelOk: true });
      this.decksById.set(deck.id, deck);
    }
    this.artSegs.set(k, deck);
    return deck;
  }

  /** Lowest node level from which every nearby avenue can still be cleared at the mainline
   * grade limit (the flat interchange zone extends `flat` metres from the node). */
  artReqNear(x: number, z: number, flat: number): number {
    const r = flat + 260;
    let best = -999;
    for (let a = Math.floor((x - r) / ART) - 1; a <= Math.ceil((x + r) / ART) + 1; a++) {
      for (let b = Math.floor((z - r) / ART) - 1; b <= Math.ceil((z + r) / ART) + 1; b++) {
        for (const dir of [0, 1] as const) {
          const d = this.artSeg(dir, a, b);
          if (!d || d.maxX < x - r || d.minX > x + r || d.maxZ < z - r || d.minZ > z + r) continue;
          for (let q = 0; q < d.pts.length; q += 2) {
            const p = d.pts[q];
            const dist = Math.hypot(p.x - x, p.z - z);
            if (dist > r) continue;
            const need = p.h + LEVEL_GAP + 0.5 - 0.058 * Math.max(0, dist - flat);
            if (need > best) best = need;
          }
        }
      }
    }
    return Math.ceil(best);
  }

  artMaxNear(x: number, z: number, r: number): number {
    let best = -999;
    for (let a = Math.floor((x - r) / ART) - 1; a <= Math.ceil((x + r) / ART) + 1; a++) {
      for (let b = Math.floor((z - r) / ART) - 1; b <= Math.ceil((z + r) / ART) + 1; b++) {
        for (const dir of [0, 1] as const) {
          const d = this.artSeg(dir, a, b);
          if (!d || d.maxX < x - r || d.minX > x + r || d.maxZ < z - r || d.minZ > z + r) continue;
          for (const p of d.pts) if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r * r && p.h > best) best = p.h;
        }
      }
    }
    return Math.round(best);
  }

  findArtCrossings(pts: WeaveRoadPoint[], skip?: string): (WeaveCrossing & { deck: WeaveDeck; kb: number })[] {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const out: (WeaveCrossing & { deck: WeaveDeck; kb: number })[] = [];
    for (let a = Math.floor(minX / ART) - 2; a <= Math.ceil(maxX / ART) + 1; a++) {
      for (let b = Math.floor(minZ / ART) - 2; b <= Math.ceil(maxZ / ART) + 1; b++) {
        for (const dir of [0, 1] as const) {
          const d = this.artSeg(dir, a, b);
          if (!d || d.id === skip || d.maxX < minX || d.minX > maxX || d.maxZ < minZ || d.minZ > maxZ) continue;
          intersectPolylines(pts, d.pts, 3, (sa, _sb, ka, kb) => {
            const pa = pts[Math.min(pts.length - 1, ka)], pb = d.pts[Math.min(d.pts.length - 1, kb)];
            out.push({ s: sa, ga: pb.h, cos: Math.abs(pa.tx * pb.tx + pa.tz * pb.tz), id: d.id, deck: d, kb });
          });
        }
      }
    }
    out.sort((p, q) => p.s - q.s);
    return out;
  }

  // ---- expressway segments ---------------------------------------------------

  /** Plan geometry of an expressway segment (no heights), shared by avenue planning. */
  expGeom(axis: 0 | 1, i: number, j: number) {
    const key = key2(i, j) * 2 + axis;
    if (this.geomMemo.has(key)) return this.geomMemo.get(key)!;
    let g: ExpGeom | null = null;
    if (axis === 0 || this.bSeg(i, j)) {
      const n0 = this.node(i, j);
      const n1 = axis === 0 ? this.node(i + 1, j) : this.node(i, j + 1);
      const t0 = axis === 0 ? { x: n0.tax, z: n0.taz } : { x: -n0.taz, z: n0.tax };
      const t1 = axis === 0 ? { x: n1.tax, z: n1.taz } : { x: -n1.taz, z: n1.tax };
      const L0 = axis === 0 && n0.kind === 'S' ? 0 : LS;
      const L1 = axis === 0 && n1.kind === 'S' ? 0 : LS;
      const ext0 = axis === 1 && n0.kind === 'TS' ? 12 : 0;
      const ext1 = axis === 1 && n1.kind === 'TN' ? 12 : 0;
      const a0 = { x: n0.x - t0.x * ext0, z: n0.z - t0.z * ext0 };
      const a1 = { x: n0.x + t0.x * L0, z: n0.z + t0.z * L0 };
      const b0 = { x: n1.x - t1.x * L1, z: n1.z - t1.z * L1 };
      const b1 = { x: n1.x + t1.x * ext1, z: n1.z + t1.z * ext1 };
      const raw: P2[] = [a0];
      lineTo(a0, a1, raw);
      hermite(a1, b0, t0, t1, raw);
      lineTo(b0, b1, raw);
      const pts = resample(raw, 1);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
      const total = pts[pts.length - 1].s;
      g = { n0, n1, pts, fixed0: ext0 + L0, fixed1: total - L1 - ext1, minX, maxX, minZ, maxZ };
    }
    this.geomMemo.set(key, g);
    return g;
  }

  expSeg(axis: 0 | 1, i: number, j: number): WeaveExpSegment | null {
    const key = key2(i, j) * 2 + axis;
    if (this.expSegs.has(key)) return this.expSegs.get(key)!;
    this.expSegs.set(key, null);
    const g = this.expGeom(axis, i, j);
    if (!g) return null;
    const { n0, n1, fixed0, fixed1 } = g;
    const lv0 = axis === 0 ? this.levels(n0).LA : this.levels(n0).LB;
    const lv1 = axis === 0 ? this.levels(n1).LA : this.levels(n1).LB;
    const pts = g.pts.map(p => ({ ...p }));
    const terr = this.sampleTerrain(pts);
    const crossings = this.findArtCrossings(pts);
    const base: ProfileOpts = {
      fixed0, fixed1, level0: lv0, level1: lv1, lift: 8, window: 45, grade: 0.065, waterMin: WATER + 6,
    };
    const h0 = solveProfile(pts, terr, base);
    const pins = crossings
      .filter(c => !(h0[Math.round(c.s)] <= c.ga - 10))
      .map(c => ({ s: c.s, min: c.ga + LEVEL_GAP, r: 16 }));
    const solved = pins.length ? solveProfile(pts, terr, { ...base, pins }) : h0;
    // A diamond interchange needs the mainline to sit just one level above its avenue:
    // pick a flat crossing and dip the profile there (never below any other clearance pin).
    let diamond: (WeaveCrossing & { deck: WeaveDeck; kb: number }) | null = null;
    let dipped: Float32Array | null = null;
    let halves: [boolean, boolean] = [false, false];
    if (hash(i, j, 330 + axis, this.seed) < this.diamondP) {
      const cands = crossings
        .filter(c => c.cos < 0.42 && c.s - fixed0 >= 24 && fixed1 - c.s >= 24)
        .sort((p, q) => hash(Math.round(p.s), i * 13 + j, 311 + axis, this.seed) - hash(Math.round(q.s), i * 13 + j, 311 + axis, this.seed));
      search: for (const c of cands) {
        const west = c.s - fixed0 >= 168, east = fixed1 - c.s >= 168;
        const options: [boolean, boolean][] = [];
        if (west && east) options.push([true, true]);
        if (west) options.push([true, false]);
        if (east) options.push([false, true]);
        for (const [w, e] of options) {
          // Flat mainline over the ramp side(s); free to climb at 6% on a side without ramps.
          const cap = (s: number) => {
            const ds = s - c.s;
            const ramps = ds < 0 ? w : e;
            const v = c.ga + 9.6 + Math.max(0, Math.abs(ds) - (ramps ? 45 : 0)) * (ramps ? 0.052 : 0.06);
            // Never below what the fixed interchange levels can descend to at the grade limit.
            const reach = Math.max(lv0 - 0.06 * (s - fixed0), lv1 - 0.06 * (fixed1 - s));
            return Math.max(v, reach);
          };
          if (crossings.some(o => o !== c && pins.some(p => p.s === o.s) && o.ga + LEVEL_GAP > cap(o.s))) continue;
          let ok = true;
          for (let q = 0; q < pts.length && ok; q++) {
            const ds = pts[q].s - c.s;
            const reach = (ds < 0 ? w : e) ? 185 : 30;
            if (Math.abs(ds) <= reach && terr[q] > cap(pts[q].s) - 6.5) ok = false;
          }
          if (!ok) continue;
          const capped = solveProfile(pts, terr, { ...base, pins, cap });
          if (capped[Math.round(c.s)] - c.ga > 11.5) continue;
          let smoothOk = true;
          for (let q = 1; q < capped.length && smoothOk; q++) if (Math.abs(capped[q] - capped[q - 1]) > 0.2) smoothOk = false;
          if (!smoothOk) continue;
          diamond = c;
          dipped = capped;
          halves = [w, e];
          break search;
        }
        // No dip possible (hills or higher avenues nearby): longer slip ramps from the
        // undisturbed mainline, if it already sits within reach of the avenue.
        const drop = solved[Math.round(c.s)] - c.ga;
        const far = Math.round(clamp(60 + drop * 9.5, 150, 205));
        if (drop <= 14.5) {
          const w2 = c.s - fixed0 >= far + 18, e2 = fixed1 - c.s >= far + 18;
          if (w2 || e2) {
            diamond = c;
            halves = w2 && e2 ? [true, true] : [w2, e2];
            break search;
          }
        }
      }
    }
    const h = dipped ?? solved;
    for (let q = 0; q < pts.length; q++) pts[q].h = h[q];
    const id = `e${axis}:${i}:${j}`;
    const deck = makeDeck(id, 'exp', EXP_HW, pts, terr, { trim0: 0, trim1: 1e9, tunnelOk: true });
    // Translucent noise-barrier panels where elevated carriageways pass dense quarters.
    const barrier = new Uint8Array(pts.length);
    for (let q = 0; q < pts.length; q++) {
      const p = pts[q];
      if (p.h - terr[q] < 6) continue;
      if (hash(Math.floor(p.s / 90), i * 31 + j, 320 + axis, this.seed) > 0.55) continue;
      if (this.district(p.x, p.z) >= 2) barrier[q] = 1;
    }
    deck.barrier = barrier;
    this.decksById.set(id, deck);
    const seg: WeaveExpSegment = {
      id, axis, deck, fixed0, fixed1, level0: lv0, level1: lv1,
      crossings: crossings.map(c => ({ s: c.s, ga: c.ga, cos: c.cos, id: c.id })),
      diamonds: [], diamondAt: null, gantries: [],
    };
    if (diamond) {
      this.buildDiamond(seg, diamond, halves);
      if (!seg.diamonds.length) {
        // Ramps did not fit after all: restore the undipped profile.
        for (let q = 0; q < pts.length; q++) pts[q].h = solved[q];
      }
    }
    this.expSegs.set(key, seg);
    return seg;
  }

  /** Diamond interchange where an avenue passes one level beneath a free expressway span. */
  private buildDiamond(seg: WeaveExpSegment, c: WeaveCrossing & { deck: WeaveDeck; kb: number }, halves: [boolean, boolean]) {
    const pts = seg.deck.pts;
    const n = pts.length;
    const drop = pts[Math.round(c.s)].h - c.ga;
    const far = Math.round(clamp(60 + drop * 9.5, 150, 205));
    const ramps: WeaveDeck[] = [];
    for (const [dir, side] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      if (!(dir < 0 ? halves[0] : halves[1])) continue;
      const r = this.diamondRamp(seg, c, c.s + dir * far, side);
      if (!r) return;
      ramps.push(r);
    }
    seg.diamonds = ramps;
    seg.diamondAt = { s: c.s, ga: c.ga, cos: c.cos, id: c.id };
    for (const [s, side] of [[c.s - far - 40, 1], [c.s + far + 40, -1]] as const) {
      if (!(side > 0 ? halves[0] : halves[1])) continue;
      const k = Math.round(clamp(s, 0, n - 1));
      const p = pts[k];
      seg.gantries.push({ x: p.x, z: p.z, tx: p.tx * side, tz: p.tz * side, h: p.h });
    }
  }

  private diamondRamp(seg: WeaveExpSegment, c: WeaveCrossing & { deck: WeaveDeck; kb: number }, sFar: number, side: 1 | -1): WeaveDeck | null {
    const pts = seg.deck.pts;
    const n = pts.length;
    const art = c.deck;
    const dirS = Math.sign(c.s - sFar);
    const L = Math.abs(c.s - sFar);
    const at = (s: number) => {
      const f = clamp(s, 0, n - 1);
      const k = Math.min(n - 2, Math.floor(f)), t = f - k;
      const p = pts[k], q = pts[k + 1];
      return { x: lerp(p.x, q.x, t), z: lerp(p.z, q.z, t), tx: lerp(p.tx, q.tx, t), tz: lerp(p.tz, q.tz, t), h: lerp(p.h, q.h, t) };
    };
    const artNear = (x: number, z: number) => {
      let best = Infinity, bh = 0;
      const k0 = Math.max(0, c.kb - 60), k1 = Math.min(art.pts.length - 1, c.kb + 60);
      for (let k = k0; k <= k1; k++) {
        const d = (art.pts[k].x - x) ** 2 + (art.pts[k].z - z) ** 2;
        if (d < best) { best = d; bh = art.pts[k].h; }
      }
      return { d: Math.sqrt(best), h: bh };
    };
    const raw: { x: number; z: number; d: number; main: number }[] = [];
    let dEnd = -1;
    let gTerm = 0;
    for (let d = 0; d <= L; d += 1) {
      const s = sFar + dirS * d;
      const p = at(s);
      const off = d < 30 ? lerp(7.5, 14.5, smooth(d / 30)) : lerp(14.5, 19, (d - 30) / Math.max(1, L - 30));
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      raw.push({ x, z, d, main: p.h });
      if (d > 60) {
        const an = artNear(x, z);
        if (an.d <= ART_HW - 1.2) { dEnd = d; gTerm = an.h; break; }
      }
    }
    if (dEnd < 0) return null;
    const hTaper = raw[Math.min(raw.length - 1, 30)].main;
    const span = Math.max(1, dEnd - 30);
    const P: P2[] = raw.map(r => ({ x: r.x, z: r.z }));
    let rp = resample(P, 1);
    for (const p of rp) {
      if (p.s <= 30) {
        p.h = raw[Math.min(raw.length - 1, Math.round(p.s))].main;
      } else {
        const t = clamp((p.s - 30) / span);
        p.h = lerp(hTaper, gTerm, t * 0.3 + smooth(t) * 0.7);
      }
    }
    // On-ramps run from the avenue up to the merge: store them in travel order.
    const onRamp = Math.sign(sFar - c.s) * side > 0;
    if (onRamp) {
      const L2 = rp[rp.length - 1].s;
      rp = rp.reverse().map(p => ({ ...p, tx: -p.tx, tz: -p.tz, s: L2 - p.s }));
    }
    for (let k = 1; k < rp.length; k++) if (Math.abs(rp[k].h - rp[k - 1].h) > 0.14) return null;
    // Any other avenue below the ramp needs full clearance.
    for (const o of this.findArtCrossings(rp, art.id)) {
      if (rp[Math.round(o.s)].h < o.ga + 8) return null;
    }
    const terr = this.sampleTerrain(rp);
    const deck = makeDeck(`${seg.id}:d${sFar < c.s ? 'w' : 'e'}${side > 0 ? 'r' : 'l'}`, 'ramp', RAMP_HW, rp, terr, {
      trim0: 0, trim1: 1e9, tunnelOk: false, from: seg.id, to: art.id,
    });
    this.decksById.set(deck.id, deck);
    return deck;
  }

  // ---- interchanges ------------------------------------------------------------

  interchange(i: number, j: number): WeaveInterchange | null {
    const key = key2(i, j);
    if (this.ics.has(key)) return this.ics.get(key)!;
    const n = this.node(i, j);
    if (n.kind === 'S') { this.ics.set(key, null); return null; }
    const { LA, LB } = this.levels(n);
    const tAx = n.tax, tAz = n.taz, tBx = -n.taz, tBz = n.tax;
    const id = `ic:${i}:${j}`;
    const ramps: WeaveDeck[] = [];
    const gantries: WeaveGantry[] = [];
    const add = (
      name: string, t: Turtle, rot: number, h0: number, h1: number, hold0: number, hold1: number,
      from: string, to: string, gantry: boolean,
    ) => {
      const raw = t.pts.map(p => {
        let u = p.u, v = p.v;
        for (let r = 0; r < rot; r++) { const nu = -v; v = u; u = nu; }
        return { x: n.x + u * tAx + v * tBx, z: n.z + u * tAz + v * tBz };
      });
      const pts = resample(raw, 1);
      rampHeights(pts, h0, h1, hold0, hold1);
      const deck = makeDeck(`${id}:${name}`, 'ramp', RAMP_HW, pts, this.sampleTerrain(pts), {
        trim0: 0, trim1: 1e9, tunnelOk: false, from, to,
      });
      ramps.push(deck);
      this.decksById.set(deck.id, deck);
      if (gantry) {
        const p0 = pts[0];
        gantries.push({ x: p0.x - p0.tx * 42, z: p0.z - p0.tz * 42, tx: p0.tx, tz: p0.tz, h: h0 });
      }
    };
    const dirs = ['EB', 'SB', 'WB', 'NB'];
    if (n.kind === 'X') {
      for (let k = 0; k < 4; k++) {
        const even = k % 2 === 0;
        const loop = new Turtle(0, 7.5, 0).shift(31.5, 7).arc(17, 1.5 * Math.PI).shift(31.5, -7);
        add(`L${k}`, loop, k, even ? LA : LB, even ? LB : LA, 23, 23, dirs[k], dirs[(k + 3) % 4], true);
        const outer = new Turtle(7.5, 140, -Math.PI / 2).shift(35, 7).bezier(105, 14.5, 0, 25, 25).shift(35, -7);
        add(`O${k}`, outer, k, even ? LB : LA, even ? LA : LB, 26, 26, dirs[(k + 3) % 4], dirs[k], true);
      }
    } else {
      // Trumpet: stem from +v (south). A northern stem uses the same layout rotated by 180°.
      const rot = n.kind === 'TS' ? 0 : 2;
      const d = (q: number) => dirs[(q + rot) % 4];
      add('TL', new Turtle(5.5, -12, -Math.PI / 2).line(19.5).arc(17, 1.5 * Math.PI).shift(30, -7), rot, LB, LA, 4, 23, d(3), d(2), false);
      add('TS', new Turtle(100, -7.5, Math.PI).shift(32, 7).arc(17.5, Math.PI / 2).arc(28, -Math.PI).line(20), rot, LA, LB, 24, 3, d(2), d(1), true);
      add('TR1', new Turtle(-89.5, 7.5, 0).shift(35, 7).arc(40, Math.PI / 2).shift(35, -7), rot, LA, LB, 26, 26, d(0), d(1), true);
      add('TR2', new Turtle(7.5, 89.5, -Math.PI / 2).shift(35, 7).arc(40, Math.PI / 2).shift(35, -7), rot, LB, LA, 26, 26, d(3), d(0), true);
    }
    const ic: WeaveInterchange = {
      id, kind: n.kind === 'X' ? 'cloverleaf' : 'trumpet', i, j, x: n.x, z: n.z, tax: n.tax, taz: n.taz,
      levelLow: LA, levelHigh: LB, plateau: n.plateau, ramps, gantries,
    };
    this.ics.set(key, ic);
    return ic;
  }

  /** Expressway mainlines, interchange ramps and diamond ramps overlapping a box. */
  expDecksNear(x0: number, x1: number, z0: number, z1: number): WeaveDeck[] {
    const out: WeaveDeck[] = [];
    const ov = (d: WeaveDeck) => d.maxX >= x0 && d.minX <= x1 && d.maxZ >= z0 && d.minZ <= z1;
    for (let i = Math.floor(x0 / EXP_SX) - 1; i <= Math.ceil(x1 / EXP_SX) + 1; i++) {
      for (let j = Math.floor(z0 / EXP_SZ) - 1; j <= Math.ceil(z1 / EXP_SZ) + 1; j++) {
        for (const axis of [0, 1] as const) {
          const seg = this.expSeg(axis, i, j);
          if (!seg) continue;
          if (ov(seg.deck)) out.push(seg.deck);
          for (const d of seg.diamonds) if (ov(d)) out.push(d);
        }
        const ic = this.interchange(i, j);
        if (ic) for (const r of ic.ramps) if (ov(r)) out.push(r);
      }
    }
    return out;
  }

  // ---- local streets ---------------------------------------------------------------

  lane(a: number, b: number): WeaveDeck | null {
    const key = key2(a, b);
    if (this.laneMemo.has(key)) return this.laneMemo.get(key)!;
    this.laneMemo.set(key, null);
    const c0 = this.artPos(a, b), c1 = this.artPos(a + 1, b + 1);
    const cx = (c0.x + c1.x) / 2, cz = (c0.z + c1.z) / 2;
    if (this.district(cx, cz) === 0 || hash(a, b, 211, this.seed) > 0.25 + 0.5 * this.density) return null;
    const top = this.artSeg(0, a, b), bot = this.artSeg(0, a, b + 1);
    const left = this.artSeg(1, a, b), right = this.artSeg(1, a + 1, b);
    let A: WeaveDeck | null = null, B: WeaveDeck | null = null, ori = 0;
    if (top && bot && (hash(a, b, 212, this.seed) < 0.5 || !left || !right)) { A = top; B = bot; ori = 0; }
    else if (left && right) { A = left; B = right; ori = 1; }
    if (!A || !B) return null;
    const ma = A.pts.length >> 1, mb = B.pts.length >> 1;
    const pa = A.pts[ma], pb = B.pts[mb];
    if (Math.abs(A.terr[ma] - pa.h) > 3 || Math.abs(B.terr[mb] - pb.h) > 3) return null;
    // Only tee into level stretches of the avenues so the junction stays flush.
    if (Math.abs(A.pts[ma + 8].h - A.pts[ma - 8].h) > 0.9 || Math.abs(B.pts[mb + 8].h - B.pts[mb - 8].h) > 0.9) return null;
    // The street starts just inside each avenue's kerb, so it meets the avenue surface flush.
    const dl = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
    const ux = (pb.x - pa.x) / dl, uz = (pb.z - pa.z) / dl;
    const cutA = (ART_HW - 1.5) / Math.max(0.35, Math.abs(ux * -pa.tz + uz * pa.tx));
    const cutB = (ART_HW - 1.5) / Math.max(0.35, Math.abs(ux * -pb.tz + uz * pb.tx));
    const sa = { x: pa.x + ux * cutA, z: pa.z + uz * cutA }, sb = { x: pb.x - ux * cutB, z: pb.z - uz * cutB };
    const raw: P2[] = [sa];
    lineTo(sa, sb, raw);
    const pts = resample(raw, 1);
    const L = pts[pts.length - 1].s;
    if (L < 60) return null;
    const terr = this.sampleTerrain(pts);
    const h = solveProfile(pts, terr, {
      fixed0: 3, fixed1: L - 3, level0: pa.h, level1: pb.h, lift: 0, window: 10, band: 4, grade: 0.12, waterMin: -1e9,
    });
    for (let k = 0; k < pts.length; k++) {
      pts[k].h = h[k];
      if (terr[k] < WATER + 0.6 || terr[k] - h[k] > 5 || h[k] - terr[k] > 4) return null;
    }
    const near = this.expDecksNear(Math.min(pa.x, pb.x) - 30, Math.max(pa.x, pb.x) + 30, Math.min(pa.z, pb.z) - 30, Math.max(pa.z, pb.z) + 30);
    for (const d of near) {
      const lim = d.hw + LANE_HW + 1.5;
      for (let q = 0; q < d.pts.length; q += 2) {
        const e = d.pts[q];
        for (let k = 0; k < pts.length; k += 2) {
          const p = pts[k];
          if (Math.abs(p.x - e.x) > lim || Math.abs(p.z - e.z) > lim) continue;
          if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 > lim * lim) continue;
          if (e.h < p.h + 8 && e.h > p.h - 8) return null;
        }
      }
    }
    const deck = makeDeck(`ln${ori}:${a}:${b}`, 'lane', LANE_HW, pts, terr, { trim0: 4, trim1: L - 4, tunnelOk: false });
    this.decksById.set(deck.id, deck);
    this.laneMemo.set(key, deck);
    return deck;
  }

  /** Per-sample construction mode, smoothed so tunnels and cuts have sensible lengths. */
  deckMode(d: WeaveDeck): Uint8Array {
    if (d.mode) return d.mode;
    const n = d.pts.length;
    const m = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const p = d.pts[k];
      const y = Math.round(p.h);
      const rx = -p.tz, rz = p.tx;
      const tc = d.terr[k];
      const tl = this.terrain(p.x - rx * d.hw, p.z - rz * d.hw);
      const tr = this.terrain(p.x + rx * d.hw, p.z + rz * d.hw);
      const lo = Math.min(tc, tl, tr), hi = Math.max(tc, tl, tr);
      if (d.tunnelOk && lo - y >= 8) m[k] = MODE_TUNNEL;
      else if (y - hi >= 3.5) m[k] = MODE_ELEV;
      else if (hi - y > 0.5) m[k] = MODE_CUT;
      else m[k] = y - lo > 3.5 ? MODE_ELEV : MODE_GRADE;
    }
    // Remove stub tunnels, then bridge short daylight gaps between tunnel bores.
    const runs = (pred: (v: number) => boolean, fn: (a: number, b: number) => void) => {
      let k = 0;
      while (k < n) {
        if (!pred(m[k])) { k++; continue; }
        let e = k;
        while (e + 1 < n && pred(m[e + 1])) e++;
        fn(k, e);
        k = e + 1;
      }
    };
    runs(v => v === MODE_TUNNEL, (a, b) => { if (b - a < 14) for (let k = a; k <= b; k++) m[k] = MODE_CUT; });
    runs(v => v !== MODE_TUNNEL, (a, b) => {
      if (a > 0 && b < n - 1 && b - a < 10) for (let k = a; k <= b; k++) m[k] = MODE_TUNNEL;
    });
    d.mode = m;
    return m;
  }

  // ---- sky-tubes & guideways ---------------------------------------------------------

  private chainNode(kind: 0 | 1, j: number, k: number): P2 {
    const ang = kind === 0 ? TUBE_ANG : TRACK_ANG;
    const P = kind === 0 ? TUBE_P : TRACK_P, Q = kind === 0 ? TUBE_Q : TRACK_Q;
    const q0 = kind === 0 ? 0 : 0.22;
    const p = (k + (hash(j, k, 501 + kind, this.seed) - 0.5) * 0.5) * P;
    const q = (j + q0 + (hash(j, k, 503 + kind, this.seed) - 0.5) * 0.16) * Q;
    const c = Math.cos(ang), s = Math.sin(ang);
    return { x: p * c - q * s, z: p * s + q * c };
  }

  chainPresent(kind: 0 | 1, j: number): boolean {
    const p = kind === 0 ? this.tubeP : this.trackP;
    if (p <= 0.02) return false;
    return j === 0 || hash(j, 0, 505 + kind, this.seed) < p;
  }

  /** Clearance the elevated line must keep at a point (terrain, interchanges). */
  private lineReq(kind: 0 | 1, x: number, z: number): number {
    let mx = -Infinity, sum = 0;
    for (let q = 0; q < 9; q++) {
      const r = q === 0 ? 0 : 22, ang = q * Math.PI / 4;
      const t = this.terrain(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
      sum += t;
      if (t > mx) mx = t;
    }
    let req = kind === 0 ? Math.max(sum / 9 + 47, mx + 33) : Math.max(sum / 9 + 27, mx + 21);
    const i0 = Math.round(x / EXP_SX), j0 = Math.round(z / EXP_SZ);
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const n = this.node(i, j);
        if (n.kind === 'S') continue;
        if (Math.hypot(x - n.x, z - n.z) < (kind === 0 ? 235 : 205)) {
          req = Math.max(req, this.levels(n).LB + (kind === 0 ? 27 : 13));
        }
      }
    }
    return Math.min(req, kind === 0 ? 172 : 128);
  }

  /** Plan geometry and per-sample clearance requirement of one sky-line span. */
  private spanGeom(kind: 0 | 1, j: number, k: number) {
    const key = key2(j, k) * 2 + kind;
    const old = this.geomSpanMemo.get(key);
    if (old) return old;
    const p0 = this.chainNode(kind, j, k - 1), p1 = this.chainNode(kind, j, k);
    const p2 = this.chainNode(kind, j, k + 1), p3 = this.chainNode(kind, j, k + 2);
    const raw: P2[] = [];
    for (let q = 0; q <= 480; q++) {
      const t = q / 480, t2 = t * t, t3 = t2 * t;
      raw.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
    const pts = resample(raw, 1);
    const n = pts.length;
    const req = new Float32Array(n);
    const knots: number[] = [];
    for (let q = 0; q < n; q += 4) knots.push(q);
    if (knots[knots.length - 1] !== n - 1) knots.push(n - 1);
    for (const q of knots) req[q] = this.lineReq(kind, pts[q].x, pts[q].z);
    for (let t = 0; t + 1 < knots.length; t++) {
      const a = knots[t], b = knots[t + 1];
      for (let q = a + 1; q < b; q++) req[q] = lerp(req[a], req[b], (q - a) / (b - a));
    }
    if (kind === 0) {
      // Fly over any maglev guideway with generous clearance.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
      for (const sp of this.spansIn(1, minX - 20, maxX + 20, minZ - 20, maxZ + 20)) {
        intersectPolylines(pts, sp.pts, 3, (sa, _sb, _ka, kb) => {
          const need = sp.pts[Math.min(sp.pts.length - 1, kb)].h + 17;
          for (let q = 0; q < n; q++) if (Math.abs(pts[q].s - sa) < 24) req[q] = Math.max(req[q], need);
        });
      }
    }
    const g = { pts, req, p1, p2 };
    this.geomSpanMemo.set(key, g);
    return g;
  }

  /** Height at a chain node: high enough that neither adjacent span must jump to clear a hill. */
  private spanNodeH(kind: 0 | 1, j: number, k: number): number {
    const key = key2(j, k) * 2 + kind;
    const old = this.spanNodeMemo.get(key);
    if (old !== undefined) return old;
    const before = this.spanGeom(kind, j, k - 1), after = this.spanGeom(kind, j, k);
    let h = -Infinity;
    for (let q = 0; q < 9; q++) {
      const rr = q === 0 ? 0 : 60, ang = q * Math.PI / 4;
      h = Math.max(h, this.lineReq(kind, after.p1.x + Math.cos(ang) * rr, after.p1.z + Math.sin(ang) * rr));
    }
    const L = before.pts[before.pts.length - 1].s;
    for (let q = 0; q < before.pts.length; q += 2) h = Math.max(h, before.req[q] - SPAN_GRADE * (L - before.pts[q].s));
    for (let q = 0; q < after.pts.length; q += 2) h = Math.max(h, after.req[q] - SPAN_GRADE * after.pts[q].s);
    this.spanNodeMemo.set(key, h);
    return h;
  }

  span(kind: 0 | 1, j: number, k: number): WeaveSpan | null {
    const key = key2(j, k) * 2 + kind;
    if (this.spanMemo.has(key)) return this.spanMemo.get(key)!;
    this.spanMemo.set(key, null);
    if (!this.chainPresent(kind, j)) return null;
    const geo = this.spanGeom(kind, j, k);
    const pts = geo.pts.map(p => ({ ...p }));
    const req = geo.req;
    const n = pts.length;
    const H0 = this.spanNodeH(kind, j, k), H1 = this.spanNodeH(kind, j, k + 1);
    const L = pts[n - 1].s;
    const hiEnv = (s: number) => Math.min(H0 + SPAN_GRADE * s, H1 + SPAN_GRADE * (L - s));
    const h = new Float32Array(n);
    for (let q = 0; q < n; q++) {
      const s = pts[q].s;
      let mx = req[q];
      for (let r = Math.max(0, q - 30); r <= Math.min(n - 1, q + 30); r += 3) mx = Math.max(mx, req[r]);
      const lin = lerp(H0, H1, s / L);
      const w = smooth(Math.min(s, L - s) / 80);
      h[q] = Math.max(Math.min(lerp(lin, Math.max(mx, lin * 0.3 + mx * 0.7), w), hiEnv(s)), req[q]);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let q = 1; q < n - 1; q++) h[q] = Math.max(h[q], h[q - 1] - SPAN_GRADE);
      for (let q = n - 2; q > 0; q--) h[q] = Math.max(h[q], h[q + 1] - SPAN_GRADE);
      const sm = Float32Array.from(h);
      for (let q = 1; q < n - 1; q++) {
        let sum = 0, cnt = 0;
        for (let r = Math.max(0, q - 12); r <= Math.min(n - 1, q + 12); r++) { sum += h[r]; cnt++; }
        sm[q] = Math.max(Math.min(sum / cnt, hiEnv(pts[q].s)), req[q]);
      }
      h.set(sm);
    }
    h[0] = H0;
    h[n - 1] = H1;
    for (let q = 0; q < n; q++) pts[q].h = h[q];
    const sp: WeaveSpan = { id: `${kind === 0 ? 'tube' : 'track'}:${j}:${k}`, kind: kind === 0 ? 'tube' : 'track', pts, base: k * 100000 };
    this.spanMemo.set(key, sp);
    return sp;
  }

  spansIn(kind: 0 | 1, x0: number, x1: number, z0: number, z1: number): WeaveSpan[] {
    const ang = kind === 0 ? TUBE_ANG : TRACK_ANG;
    const P = kind === 0 ? TUBE_P : TRACK_P, Q = kind === 0 ? TUBE_Q : TRACK_Q;
    const c = Math.cos(ang), s = Math.sin(ang);
    let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const p = x * c + z * s, q = -x * s + z * c;
      pMin = Math.min(pMin, p); pMax = Math.max(pMax, p); qMin = Math.min(qMin, q); qMax = Math.max(qMax, q);
    }
    const out: WeaveSpan[] = [];
    for (let j = Math.floor(qMin / Q) - 1; j <= Math.ceil(qMax / Q) + 1; j++) {
      for (let k = Math.floor(pMin / P) - 2; k <= Math.ceil(pMax / P) + 1; k++) {
        const sp = this.span(kind, j, k);
        if (!sp) continue;
        let hit = false;
        for (let q = 0; q < sp.pts.length && !hit; q += 8) {
          const p = sp.pts[q];
          if (p.x >= x0 - 12 && p.x <= x1 + 12 && p.z >= z0 - 12 && p.z <= z1 + 12) hit = true;
        }
        if (hit) out.push(sp);
      }
    }
    return out;
  }

  // ---- region collection -------------------------------------------------------------

  collect(x0: number, x1: number, z0: number, z1: number) {
    const decks: WeaveDeck[] = [];
    const gantries: WeaveGantry[] = [];
    const interchanges: WeaveInterchange[] = [];
    const segments: WeaveExpSegment[] = [];
    const ov = (d: WeaveDeck) => d.maxX >= x0 && d.minX <= x1 && d.maxZ >= z0 && d.minZ <= z1;
    for (let i = Math.floor(x0 / EXP_SX) - 1; i <= Math.ceil(x1 / EXP_SX) + 1; i++) {
      for (let j = Math.floor(z0 / EXP_SZ) - 1; j <= Math.ceil(z1 / EXP_SZ) + 1; j++) {
        for (const axis of [0, 1] as const) {
          const seg = this.expSeg(axis, i, j);
          if (!seg) continue;
          if (ov(seg.deck)) { decks.push(seg.deck); segments.push(seg); }
          for (const d of seg.diamonds) if (ov(d)) decks.push(d);
          gantries.push(...seg.gantries);
        }
        const ic = this.interchange(i, j);
        if (ic) {
          for (const r of ic.ramps) if (ov(r)) decks.push(r);
          gantries.push(...ic.gantries);
          if (ic.x > x0 - 200 && ic.x < x1 + 200 && ic.z > z0 - 200 && ic.z < z1 + 200) interchanges.push(ic);
        }
      }
    }
    for (let a = Math.floor(x0 / ART) - 1; a <= Math.ceil(x1 / ART) + 1; a++) {
      for (let b = Math.floor(z0 / ART) - 1; b <= Math.ceil(z1 / ART) + 1; b++) {
        for (const dir of [0, 1] as const) {
          const d = this.artSeg(dir, a, b);
          if (d && ov(d)) decks.push(d);
        }
      }
    }
    for (let a = Math.floor(x0 / ART) - 1; a <= Math.ceil(x1 / ART) + 1; a++) {
      for (let b = Math.floor(z0 / ART) - 1; b <= Math.ceil(z1 / ART) + 1; b++) {
        const d = this.lane(a, b);
        if (d && ov(d)) decks.push(d);
      }
    }
    return { decks, gantries, interchanges, segments };
  }

  deckById(id: string) { return this.decksById.get(id); }
}

let worldCache: { key: string; world: WeaveWorld } | null = null;

function getWorld(cfg: WeaveConfig): WeaveWorld {
  const key = [cfg.seed, cfg.weaveRelief, cfg.weaveWater, cfg.weaveExpressways, cfg.weaveDiamonds, cfg.weaveTubes, cfg.weaveTracks, cfg.weaveDensity].join('|');
  if (!worldCache || worldCache.key !== key) worldCache = { key, world: new WeaveWorld(cfg) };
  return worldCache.world;
}

// ---------------------------------------------------------------------------
// Public pure queries (used by tests and tooling)
// ---------------------------------------------------------------------------

export function skyweaveTerrainHeight(x: number, z: number, config: WeaveConfig): number {
  return getWorld(config).terrain(x, z);
}

/** All road decks (expressways, ramps, avenues, streets) touching a world-space box. */
export function planSkyweaveRoads(config: WeaveConfig, x0: number, x1: number, z0: number, z1: number) {
  const world = getWorld(config);
  const res = world.collect(x0, x1, z0, z1);
  for (const d of res.decks) world.deckMode(d);
  return res;
}

export function planSkyweaveSpans(config: WeaveConfig, x0: number, x1: number, z0: number, z1: number) {
  const world = getWorld(config);
  return [...world.spansIn(1, x0, x1, z0, z1), ...world.spansIn(0, x0, x1, z0, z1)];
}


// ---------------------------------------------------------------------------
// Voxel generation
// ---------------------------------------------------------------------------

interface PaletteEntry {
  color: number;
  material: WeaveMaterialKind;
  materialId: number;
  transparency: number;
  emission: number;
  emissive: boolean;
  intensity: number;
}

const C = {
  grassA: 0x3b7029,
  grassB: 0x4a8233,
  grassDeep: 0x2a5720,
  meadow: 0x5a8c38,
  soil: 0x5a4f3e,
  sand: 0xc4b48a,
  riverbed: 0x6a6450,
  cliffLight: 0xc9cdc8,
  cliffMid: 0xa9b0ad,
  cliffDark: 0x7c8784,
  embank: 0x8a8676,
  trunk: 0x5a4330,
  leafDeep: 0x1f4519,
  leafMid: 0x2d5d23,
  leafBright: 0x447a2c,
  leafSun: 0x5f9338,
  conifer: 0x1f4423,
  coniferLight: 0x2b5a2e,
  blossom: 0xd9a2b6,
  autumn: 0xb98a3c,
  asphalt: 0x3a3f46,
  asphaltArt: 0x43474d,
  asphaltLane: 0x4c4f54,
  sidewalk: 0xbab4a8,
  paving: 0xccc6b8,
  paint: 0xeef0ea,
  paintYellow: 0xe8c547,
  concrete: 0xc6cacb,
  concreteShade: 0x9ea6ab,
  girder: 0xb3b9bc,
  girderShade: 0x8f979c,
  parapet: 0xdde2e4,
  pier: 0xc3c8ca,
  tunnelTile: 0xd8d9d2,
  portal: 0xb9bfc2,
  retaining: 0xaeb4b5,
  white: 0xdfe5ea,
  warmWhite: 0xd8ddd9,
  titanium: 0xb6c2ce,
  titaniumMid: 0x8797a6,
  steelDark: 0x47535f,
  trackBed: 0x2d3843,
  railSilver: 0xcdd8e2,
  signGreen: 0x1d6a48,
  tubeGlassTop: 0xd4edff,
  tubeGlassSide: 0xb0d8f5,
  domeGlass: 0xbce3fa,
  darkGlass: 0x214059,
  railingGlass: 0xb8e0f8,
  barrierGlass: 0xc6e7f6,
  waterGlass: 0x2f8fb0,
  waterShallow: 0x4bb0c4,
  solar: 0x1e3552,
  hvac: 0x9aa3ab,
  pole: 0x6f7b86,
};

// High-contrast steel-blue crystal glass against crisp white-silver architectural frames.
const TOWER_PALETTES = [
  { glass: 0x2a547a, alt: 0x36668f, frame: 0xdce3e9, slab: 0xbec8d1 },
  { glass: 0x21486b, alt: 0x2e5b82, frame: 0xd4dce3, slab: 0xb4bfc8 },
  { glass: 0x34638a, alt: 0x44769e, frame: 0xe0e6eb, slab: 0xc5cfd7 },
  { glass: 0x234c5f, alt: 0x305e73, frame: 0xd8dfdc, slab: 0xb8c3bf },
  { glass: 0x3a5f7d, alt: 0x4a7392, frame: 0xe4e2dc, slab: 0xc9c5bc },
];

/** Iterates a deck surface on a 0.5 m lattice (half-step samples along the road). */
function walkDeck(
  d: WeaveDeck, halfW: number, step: number,
  x0: number, x1: number, z0: number, z1: number,
  cb: (x: number, z: number, k: number, w: number) => void,
) {
  const pts = d.pts;
  const n = pts.length;
  const pad = halfW + 2;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    if (p.x < x0 - pad || p.x > x1 + pad || p.z < z0 - pad || p.z > z1 + pad) continue;
    for (let sub = 0; sub < 2; sub++) {
      let x = p.x, z = p.z, tx = p.tx, tz = p.tz;
      if (sub === 1) {
        if (k === n - 1) break;
        const q = pts[k + 1];
        x = (p.x + q.x) / 2;
        z = (p.z + q.z) / 2;
        tx = p.tx + q.tx;
        tz = p.tz + q.tz;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
      }
      const rx = -tz, rz = tx;
      for (let w = -halfW; w <= halfW + 1e-6; w += step) cb(x + rx * w, z + rz * w, k, w);
    }
  }
}

export function generateSkyweaveInterchange(config: WeaveConfig) {
  const world = getWorld(config);
  const seed = world.seed;
  const width = Math.max(1, Math.floor(config.sizeX));
  const depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff)));
  const ox = Math.floor(config.offsetX - width / 2);
  const oz = Math.floor(config.offsetZ - depth / 2);
  const layer = width * depth;
  const X1 = ox + width, Z1 = oz + depth;

  const cells = new Uint16Array(layer * ceiling);
  const heights = new Float32Array(layer);
  const palette: PaletteEntry[] = [{
    color: 0, material: 'normal', materialId: 0, transparency: 0, emission: 0, emissive: false, intensity: 0,
  }];
  const ids = new Map<number, number>();
  const terrainId = new Uint8Array(65536);
  // 8x8x8 macro-brick Uint32 pool for 0.125 m micro-voxels: packs (color<<8)|(mid+1)
  // directly per brick cell with zero per-voxel Map entries or JS object allocations.
  const mBricks = new Map<number, Uint32Array>();
  const mBrickKeys: number[] = [];
  const voxels: WeaveVoxel[] = [];

  const glassBase = clamp(config.weaveGlass, 0.25, 0.92);
  const forest = clamp(config.weaveForest);
  const lights = clamp(config.weaveLights);
  const skyCap = clamp(config.weaveSkyline, 96, 186);

  const inCrop = (x: number, z: number) => x >= ox && x < X1 && z >= oz && z < Z1;
  const near = (x: number, z: number, rx: number, rz = rx) => x + rx >= ox && x - rx < X1 && z + rz >= oz && z - rz < Z1;

  const normalMat = (color: number, terrain = false) => {
    const key = color * 256;
    const old = ids.get(key);
    if (old) return old;
    const id = palette.length;
    ids.set(key, id);
    palette.push({ color, material: 'normal', materialId: 0, transparency: 0, emission: 0, emissive: false, intensity: 0 });
    if (terrain) terrainId[id] = 1;
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

  const get = (lx: number, y: number, lz: number) =>
    lx >= 0 && lx < width && lz >= 0 && lz < depth && y >= 0 && y < ceiling ? cells[lx + lz * width + y * layer] : 0;
  const put = (x: number, y: number, z: number, id: number) => {
    const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
    y = Math.floor(y);
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || y < 0 || y >= ceiling) return;
    cells[lx + lz * width + y * layer] = id;
  };
  const putIfAir = (x: number, y: number, z: number, id: number) => {
    const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
    y = Math.floor(y);
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || y < 0 || y >= ceiling) return;
    const i = lx + lz * width + y * layer;
    if (!cells[i]) cells[i] = id;
  };
  /** Writes over air or natural ground only (never over another structure). */
  const putSoft = (x: number, y: number, z: number, id: number) => {
    const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
    y = Math.floor(y);
    if (lx < 0 || lx >= width || lz < 0 || lz >= depth || y < 0 || y >= ceiling) return;
    const i = lx + lz * width + y * layer;
    if (!cells[i] || terrainId[cells[i]]) cells[i] = id;
  };
  const putAir = (x: number, y: number, z: number) => put(x, y, z, 0);
  const carve = (lx: number, y: number, lz: number) => {
    if (y < 0 || y >= ceiling) return;
    const i = lx + lz * width + y * layer;
    if (terrainId[cells[i]]) cells[i] = 0;
  };

  const boxId = (x: number, y: number, z: number, w: number, h: number, d: number, id: number) => {
    const x0 = Math.max(0, Math.floor(x) - ox), x1 = Math.min(width, Math.floor(x + w) - ox);
    const z0 = Math.max(0, Math.floor(z) - oz), z1 = Math.min(depth, Math.floor(z + d) - oz);
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(ceiling, Math.floor(y + h));
    if (x0 >= x1 || z0 >= z1 || y0 >= y1) return;
    for (let iy = y0; iy < y1; iy++) {
      for (let iz = z0; iz < z1; iz++) cells.fill(id, x0 + iz * width + iy * layer, x1 + iz * width + iy * layer);
    }
  };

  const mw = width * 8;
  const md = depth * 8;
  const mh = ceiling * 8;
  const packMicroVal = (color: number, mid: number) => (((color & 0xffffff) << 8) | ((mid + 1) & 0xff)) >>> 0;
  const microRaw = (ix: number, iy: number, iz: number, val: number) => {
    if (ix < 0 || iz < 0 || ix >= mw || iz >= md || iy < 0 || iy >= mh) return;
    const bKey = (ix >> 3) + (iz >> 3) * width + (iy >> 3) * layer;
    let brick = mBricks.get(bKey);
    if (!brick) {
      brick = new Uint32Array(512);
      mBricks.set(bKey, brick);
      mBrickKeys.push(bKey);
    }
    brick[((iy & 7) << 6) | ((iz & 7) << 3) | (ix & 7)] = val;
  };
  const microRawIfEmpty = (ix: number, iy: number, iz: number, val: number) => {
    if (ix < 0 || iz < 0 || ix >= mw || iz >= md || iy < 0 || iy >= mh) return;
    const bKey = (ix >> 3) + (iz >> 3) * width + (iy >> 3) * layer;
    let brick = mBricks.get(bKey);
    if (!brick) {
      brick = new Uint32Array(512);
      mBricks.set(bKey, brick);
      mBrickKeys.push(bKey);
    }
    const slot = ((iy & 7) << 6) | ((iz & 7) << 3) | (ix & 7);
    if (!brick[slot]) brick[slot] = val;
  };
  const micro = (x: number, y: number, z: number, color: number, kind: WeaveMaterialKind = 'normal', level = 0) => {
    const ix = Math.round((x - ox) * 8), iy = Math.round(y * 8), iz = Math.round((z - oz) * 8);
    microRaw(ix, iy, iz, packMicroVal(color, kind === 'normal' ? 0 : encodeSpaceMaterialId(kind, level)));
  };

  const microLine = (
    a: WeavePoint, b: WeavePoint, color: number, kind: WeaveMaterialKind = 'normal', level = 0, thick = 1,
  ) => {
    if (!near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(a.x - b.x) / 2 + 1, Math.abs(a.z - b.z) / 2 + 1)) return;
    const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)) * 8);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      for (let dx = 0; dx < thick; dx++) for (let dy = 0; dy < thick; dy++) micro(x + dx * M, y + dy * M, z, color, kind, level);
    }
  };

  const blobId = (cx: number, cy: number, cz: number, rx: number, ry: number, id: number) => {
    if (!near(cx, cz, rx + 1)) return;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let z = Math.floor(cz - rx); z <= cz + rx; z++) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rx) ** 2 <= 1) putIfAir(x, y, z, id);
        }
      }
    }
  };

  // -------------------------------------------------------------------------
  // 1. World planning over a margin around the crop (all decisions world-addressed).
  // -------------------------------------------------------------------------
  const MG = 160;
  const PX0 = ox - MG, PZ0 = oz - MG, PW = width + 2 * MG, PD = depth + 2 * MG;
  const rmask = new Uint8Array(PW * PD);
  const deckMin = new Int16Array(PW * PD).fill(32767);
  const ceilMap = new Int16Array(PW * PD).fill(32767);
  const rIdx = (x: number, z: number) => {
    const lx = Math.floor(x) - PX0, lz = Math.floor(z) - PZ0;
    return lx < 0 || lz < 0 || lx >= PW || lz >= PD ? -1 : lx + lz * PW;
  };
  const BIT_EXP = 1, BIT_ART = 2, BIT_PYLON = 8, BIT_BUILD = 16, BIT_BUFFER = 32, BIT_UNDER = 64;

  const plan = world.collect(PX0, PX0 + PW, PZ0, PZ0 + PD);
  const decks = plan.decks;
  const modes = decks.map(d => world.deckMode(d));

  decks.forEach((d, di) => {
    const mode = modes[di];
    const bit = d.kind === 'exp' || d.kind === 'ramp' ? BIT_EXP : BIT_ART;
    walkDeck(d, d.hw + 3, 0.6, PX0, PX0 + PW, PZ0, PZ0 + PD, (x, z, k, w) => {
      const i = rIdx(x, z);
      if (i < 0) return;
      const aw = Math.abs(w);
      if (mode[k] === MODE_TUNNEL) {
        if (aw <= d.hw + 2) rmask[i] |= BIT_UNDER;
        return;
      }
      rmask[i] |= BIT_BUFFER;
      if (aw <= d.hw) {
        rmask[i] |= bit;
        const y = Math.round(d.pts[k].h);
        if (y < deckMin[i]) deckMin[i] = y;
      }
    });
  });

  // Sky-tubes & guideways: pylons stand only on free ground; lines cap building heights.
  const spans = [...world.spansIn(1, PX0, PX0 + PW, PZ0, PZ0 + PD), ...world.spansIn(0, PX0, PX0 + PW, PZ0, PZ0 + PD)];
  const pylons: WeavePylon[] = [];
  for (const sp of spans) {
    const isTube = sp.kind === 'tube';
    const stepS = isTube ? 62 : 38;
    const r = isTube ? 7 : 3;
    const L = sp.pts[sp.pts.length - 1].s;
    for (let s = stepS / 2; s < L; s += stepS) {
      const k = Math.round(s);
      const p = sp.pts[k];
      let free = true;
      for (let dz = -r; dz <= r && free; dz++) {
        for (let dx = -r; dx <= r && free; dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const i = rIdx(p.x + dx, p.z + dz);
          if (i >= 0 && rmask[i] & (BIT_EXP | BIT_ART | BIT_BUFFER | BIT_UNDER | BIT_PYLON)) free = false;
        }
      }
      if (!free) continue;
      if (world.terrain(p.x, p.z) < WATER + 0.5 && !isTube) continue;
      pylons.push({ id: `${sp.id}:${k}`, kind: sp.kind, x: p.x, z: p.z, y: p.h, tx: p.tx, tz: p.tz });
      for (let dz = -r - 2; dz <= r + 2; dz++) {
        for (let dx = -r - 2; dx <= r + 2; dx++) {
          const i = rIdx(p.x + dx, p.z + dz);
          if (i >= 0) rmask[i] |= BIT_PYLON;
        }
      }
    }
    const bottom = isTube ? TUBE_R + 3 : 4;
    const half = isTube ? TUBE_R + 3 : 7;
    for (const p of sp.pts) {
      for (let w = -half; w <= half; w += 0.7) {
        const i = rIdx(p.x - p.tz * w, p.z + p.tx * w);
        if (i >= 0) ceilMap[i] = Math.min(ceilMap[i], Math.floor(p.h - bottom));
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Blocks, lots, buildings & parks.
  // -------------------------------------------------------------------------
  const buildings: WeaveBuilding[] = [];
  const parks: WeavePark[] = [];
  {
    const bx0 = ox - 90, bx1 = X1 + 90, bz0 = oz - 90, bz1 = Z1 + 90;
    const diskClear = (cx: number, cz: number, r: number) => {
      const rr = Math.ceil(r);
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const i = rIdx(cx + dx, cz + dz);
          if (i < 0) return false;
          if (rmask[i] & (BIT_EXP | BIT_ART | BIT_BUFFER | BIT_UNDER | BIT_PYLON)) return false;
        }
      }
      return true;
    };
    const diskCeil = (cx: number, cz: number, r: number) => {
      let lim = 32767;
      const rr = Math.ceil(r);
      for (let dz = -rr; dz <= rr; dz += 2) {
        for (let dx = -rr; dx <= rr; dx += 2) {
          const i = rIdx(cx + dx, cz + dz);
          if (i >= 0) lim = Math.min(lim, ceilMap[i]);
        }
      }
      return lim;
    };
    for (let a = Math.floor(bx0 / ART) - 1; a <= Math.ceil(bx1 / ART); a++) {
      for (let b = Math.floor(bz0 / ART) - 1; b <= Math.ceil(bz1 / ART); b++) {
        const c00 = world.artPos(a, b), c10 = world.artPos(a + 1, b);
        const c01 = world.artPos(a, b + 1), c11 = world.artPos(a + 1, b + 1);
        const bil = (p: number, q: number) => ({
          x: lerp(lerp(c00.x, c10.x, p), lerp(c01.x, c11.x, p), q),
          z: lerp(lerp(c00.z, c10.z, p), lerp(c01.z, c11.z, p), q),
        });
        const lane = world.lane(a, b);
        const laneNS = !!lane && lane.id.startsWith('ln0');
        const rb = (s: number) => hash(a, b, s, seed);
        const blockAng = Math.atan2(c10.z - c00.z, c10.x - c00.x);
        let lots: { p: number; q: number; R: number; big?: boolean }[];
        const blockDistrict = world.district(bil(0.5, 0.5).x, bil(0.5, 0.5).z);
        const grid = (ps: number[], qs: number[], R: number) => ps.flatMap(p => qs.map(q => ({ p, q, R })));
        if (!lane && rb(231) < 0.24) lots = [{ p: 0.5, q: 0.5, R: 44, big: true }];
        else if (blockDistrict === 3 && !lane) lots = grid([0.2, 0.5, 0.8], [0.2, 0.5, 0.8], 13);
        else if (blockDistrict === 3 && laneNS) lots = grid([0.24, 0.76], [0.2, 0.5, 0.8], 14);
        else if (blockDistrict === 3) lots = grid([0.2, 0.5, 0.8], [0.24, 0.76], 14);
        else if (lane && laneNS) lots = rb(232) < 0.5
          ? grid([0.25, 0.75], [0.27, 0.73], 19)
          : grid([0.26, 0.74], [0.5], 22);
        else if (lane) lots = rb(232) < 0.5
          ? grid([0.27, 0.73], [0.25, 0.75], 19)
          : grid([0.5], [0.26, 0.74], 22);
        else if (blockDistrict === 2 && rb(233) < 0.5) lots = grid([0.22, 0.5, 0.78], [0.27, 0.73], 15);
        else lots = grid([0.27, 0.73], [0.27, 0.73], 21);
        lots.forEach((lot, li) => {
          const c = bil(lot.p, lot.q);
          const cx = Math.round(c.x), cz = Math.round(c.z);
          if (cx < bx0 || cx > bx1 || cz < bz0 || cz > bz1) return;
          const r = (s: number) => hash(a * 7 + li, b * 5 - li, s, seed);
          const district = world.district(cx, cz);
          const base = Math.round(world.terrain(cx, cz));
          if (base < WATER + 1) return;
          let R = lot.R;
          while (R >= 6 && !diskClear(cx, cz, R + 1.5)) R -= 1.5;
          if (R < 6) return;
          const slope = Math.max(
            Math.abs(world.terrain(cx + R * 0.7, cz) - world.terrain(cx - R * 0.7, cz)),
            Math.abs(world.terrain(cx, cz + R * 0.7) - world.terrain(cx, cz - R * 0.7)),
          ) / (R * 1.4);
          const id = `${a}:${b}:${li}`;
          const parkChance = [0.72, 0.24, 0.08, 0.03][district] + (1 - world.density) * 0.3;
          if (r(240) < parkChance || slope > 0.85) {
            parks.push({ id, x: cx, z: cz, r: R, base, pond: district > 0 && r(241) < 0.45 && slope < 0.25 && R > 12 });
            return;
          }
          const limit = Math.min(diskCeil(cx, cz, R + 2) - 4, skyCap) - base;
          const pick = r(242);
          let family: number;
          if (lot.big) family = district >= 3 ? (pick < 0.55 ? 2 : 6) : district === 2 ? (pick < 0.5 ? 0 : 4) : 4;
          else if (district === 3) family = pick < 0.3 ? 1 : pick < 0.58 ? 2 : pick < 0.78 ? 3 : pick < 0.9 ? 6 : 0;
          else if (district === 2) family = pick < 0.46 ? 0 : pick < 0.68 ? 5 : pick < 0.82 ? 1 : pick < 0.92 ? 3 : 7;
          else if (district === 1) family = pick < 0.32 ? 7 : pick < 0.58 ? 0 : pick < 0.8 ? 5 : 4;
          else family = 7;
          if (slope > 0.45 && family !== 7) family = 5;
          const skyline = smooth((base - 14) / 30) * 0.5 + smooth((world.district(cx, cz) - 1.5) / 1.5) * 0.5;
          let height: number;
          switch (family) {
            case 0: height = 18 + r(243) * 22; break;
            case 1: height = 52 + skyline * 34 + r(243) * 26; break;
            case 2: height = r(244) < 0.25 + skyline * 0.2 ? skyCap - base - 4 : 70 + skyline * 44 + r(243) * 28; break;
            case 3: height = 56 + skyline * 34 + r(243) * 24; break;
            case 4: height = 10 + r(243) * 4; break;
            case 5: height = 13 + r(243) * 14; break;
            case 6: height = 60 + skyline * 40 + r(243) * 30; break;
            default: height = 7 + r(243) * 5; break;
          }
          if (lot.big && family === 2) R = Math.min(R, 18 + Math.floor(r(245) * 3));
          if (lot.big && family === 0) R = Math.min(R, 15);
          if (lot.big && family === 4) R = Math.min(R, 26);
          if (family === 6) R = Math.min(R, 26);
          height = Math.round(Math.min(height, limit));
          if (height < 9) {
            if (limit >= 7) { family = 7; height = Math.min(9, limit); }
            else { parks.push({ id, x: cx, z: cz, r: R, base, pond: false }); return; }
          }
          if ((family === 1 || family === 2 || family === 3 || family === 6) && height < 34) family = height >= 16 ? 0 : 7;
          const radius = family === 4 ? Math.min(R, 15 + r(246) * 9)
            : family === 7 ? Math.min(R, 11 + r(246) * 8)
            : family === 5 ? Math.min(R, 11 + r(246) * 7)
            : family === 6 ? R
            : Math.min(R, 9.5 + r(246) * 4.5);
          buildings.push({
            id, x: cx, z: cz, base, height, family, radius,
            angle: family === 0 || family === 4 ? r(247) * Math.PI * 2 : blockAng + (r(247) < 0.5 ? 0 : Math.PI / 2) + (r(248) - 0.5) * 0.25,
            palette: Math.floor(r(249) * TOWER_PALETTES.length),
            holo: (family === 1 || family === 2 || family === 3) && r(250) < 0.55,
            district,
          });
          if (lot.big && family !== 4 && R > 30) {
            parks.push({ id: `${id}:plaza`, x: cx, z: cz, r: R, base, pond: false });
          }
        });
      }
    }
    for (const bd of buildings) {
      const rr = Math.ceil(bd.radius + (bd.family === 6 ? 4 : 2));
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dz * dz > rr * rr) continue;
          const i = rIdx(bd.x + dx, bd.z + dz);
          if (i >= 0) rmask[i] |= BIT_BUILD;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Terrain columns, rivers & lakes (translucent water).
  // -------------------------------------------------------------------------
  const TW = width + 2, TD = depth + 2;
  const tf = new Float32Array(TW * TD);
  for (let lz = -1; lz <= depth; lz++) {
    for (let lx = -1; lx <= width; lx++) tf[(lx + 1) + (lz + 1) * TW] = world.terrain(ox + lx + 0.5, oz + lz + 0.5);
  }
  const tmap = new Int16Array(layer);
  const terrainAt = (x: number, z: number) => {
    const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
    if (lx >= 0 && lz >= 0 && lx < width && lz < depth) return tmap[lx + lz * width];
    return Math.round(world.terrain(x, z));
  };
  {
    const grassA = normalMat(C.grassA, true), grassB = normalMat(C.grassB, true), grassDeep = normalMat(C.grassDeep, true);
    const meadow = normalMat(C.meadow, true), soil = normalMat(C.soil, true), sand = normalMat(C.sand, true);
    const bed = normalMat(C.riverbed, true);
    const cliffL = normalMat(C.cliffLight, true), cliffM = normalMat(C.cliffMid, true), cliffD = normalMat(C.cliffDark, true);
    const water = glassMat(C.waterGlass, 46);
    const waterShallow = glassMat(C.waterShallow, 58);
    for (let lz = 0; lz < depth; lz++) {
      for (let lx = 0; lx < width; lx++) {
        const ti = (lx + 1) + (lz + 1) * TW;
        const hf = tf[ti];
        const h = Math.max(1, Math.round(hf));
        tmap[lx + lz * width] = h;
        const wx = lx + ox, wz = lz + oz;
        const gx = tf[ti + 1] - tf[ti - 1], gz = tf[ti + TW] - tf[ti - TW];
        const slope = Math.hypot(gx, gz) * 0.5;
        const isCliff = slope > 0.95 || (h > 24 && slope > 0.55 && noise2(wx * 0.05, wz * 0.05, seed, 41) > 0.42);
        const top = Math.min(ceiling - 1, h);
        const col = lx + lz * width;
        const gh = hash(wx, wz, 44, seed);
        const lush = noise2(wx / 24, wz / 24, seed, 45);
        for (let y = 0; y <= top; y++) {
          let id: number;
          if (h < WATER) id = y >= h - 1 ? bed : y % 3 === 0 ? cliffD : cliffM;
          else if (h <= WATER + 1 && y >= h - 1) id = sand;
          else if (isCliff && y >= h - 9) {
            const band = (y + Math.floor(noise2(wx * 0.08, wz * 0.08, seed, 43) * 4)) % 5;
            id = band === 0 ? cliffD : band <= 2 ? cliffM : cliffL;
          } else if (y === h) id = lush > 0.62 ? meadow : gh < 0.34 ? grassDeep : gh < 0.72 ? grassA : grassB;
          else if (y >= h - 2) id = soil;
          else id = y % 4 === 0 ? cliffD : cliffM;
          cells[col + y * layer] = id;
        }
        if (h < WATER) {
          for (let y = h + 1; y <= WATER && y < ceiling; y++) cells[col + y * layer] = WATER - h <= 1 ? waterShallow : water;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Roads: earthworks, 1 m base decks + smooth 0.125 m sloped ramps,
  //    curved/sloped micro-voxel Jersey barriers, thin glass noise barriers,
  //    beveled kerbs, micro crosswalks, tunnels, portals and piers.
  // -------------------------------------------------------------------------
  const asphaltExp = normalMat(C.asphalt), asphaltArt = normalMat(C.asphaltArt), asphaltLane = normalMat(C.asphaltLane);
  const sidewalkId = normalMat(C.sidewalk);
  const girderId = normalMat(C.girder), girderShadeId = normalMat(C.girderShade);
  const embankId = normalMat(C.embank, true);
  const pierId = normalMat(C.pier), pierCapId = normalMat(C.concreteShade);
  const liningId = normalMat(C.tunnelTile), portalId = normalMat(C.portal), retainId = normalMat(C.retaining);
  const barrierGlassTrans = Math.round(62 + glassBase * 18);
  const railingGlassTrans = Math.round(54 + glassBase * 18);
  const tunnelLightId = glowMat(0xffe6bf, 46);
  const portalSignId = glowMat(0xdff1ff, 30);
  const portalGrassId = normalMat(C.grassB, true);
  const isAsphalt = (id: number) => id === asphaltExp || id === asphaltArt || id === asphaltLane;
  const deckGrid = new Uint8Array(layer * ceiling);
  const KIND_CODE: Record<WeaveDeckKind, number> = { exp: 0, ramp: 1, art: 2, lane: 3 };
  const clearH = (d: WeaveDeck) => (d.kind === 'exp' || d.kind === 'ramp' ? 7 : 6);

  /** Continuous 1/8 m road surface height:
   * - Expressways, interchange ramps & lanes follow exact Math.round(h * 8) everywhere.
   * - Wide avenues stay pure 1 m slabs on level stretches and transition smoothly at 0.125 m
   *   steps across every grade change (pure monotonic function of h -> 100% crop-independent). */
  const slopeH8 = (h: number, kind: WeaveDeckKind): number => {
    if (kind !== 'art') return Math.round(h * 8);
    const fl = Math.floor(h);
    const f = h - fl;
    if (f <= 0.58) return fl * 8;
    return fl * 8 + Math.round(((f - 0.58) / 0.42) * 8);
  };
  const deckY = (h: number, kind: WeaveDeckKind) => Math.floor(slopeH8(h, kind) / 8);

  // Precompute spatially overlapping neighbor decks (for crop-independent merge/junction detection).
  const deckNeighbors: WeaveDeck[][] = decks.map(d =>
    decks.filter(o => o !== d && d.maxX >= o.minX - 4 && d.minX <= o.maxX + 4 && d.maxZ >= o.minZ - 4 && d.minZ <= o.maxZ + 4),
  );
  const isMergedWithNeighbor = (di: number, x: number, z: number, h: number): boolean => {
    for (const o of deckNeighbors[di]) {
      if (x < o.minX - 1.5 || x > o.maxX + 1.5 || z < o.minZ - 1.5 || z > o.maxZ + 1.5) continue;
      const pts = o.pts;
      const lim = o.hw + 0.65;
      const lim2 = lim * lim;
      for (let q = 0; q < pts.length; q += 3) {
        const op = pts[q];
        const dx = x - op.x, dz = z - op.z;
        if (dx * dx + dz * dz > (lim + 2.5) * (lim + 2.5)) continue;
        for (let r = Math.max(0, q - 2); r <= Math.min(pts.length - 1, q + 2); r++) {
          const rp = pts[r];
          const rx2 = x - rp.x, rz2 = z - rp.z;
          if (rx2 * rx2 + rz2 * rz2 <= lim2 && Math.abs(rp.h - h) <= 2.2) return true;
        }
      }
    }
    return false;
  };

  // 4a. Earthworks: open cuts, tunnel bores and embankment fills.
  decks.forEach((d, di) => {
    const mode = modes[di];
    const ch = clearH(d);
    walkDeck(d, d.hw, 0.5, ox, X1, oz, Z1, (x, z, k, w) => {
      if (!inCrop(x, z)) return;
      const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
      const t = tmap[lx + lz * width];
      const y = deckY(d.pts[k].h, d.kind);
      const m = mode[k];
      if (m === MODE_TUNNEL) {
        for (let yy = y + 1; yy <= y + ch + 1; yy++) carve(lx, yy, lz);
        return;
      }
      if (t > y) for (let yy = y + 1; yy <= Math.min(t, ceiling - 1); yy++) carve(lx, yy, lz);
      if (m !== MODE_ELEV && Math.abs(w) <= d.hw && t < y - 1) {
        for (let yy = Math.max(0, t + 1); yy < y; yy++) {
          const i = lx + lz * width + yy * layer;
          if (!cells[i] || palette[cells[i]].material === 'translucent') cells[i] = embankId;
        }
      }
    });
  });

  // 4b. 1 m base deck surfaces & recessed cantilevered box girders (at floor of exact 1/8 m height).
  decks.forEach((d, di) => {
    const mode = modes[di];
    const code = KIND_CODE[d.kind];
    const isHighway = d.kind === 'exp' || d.kind === 'ramp';
    walkDeck(d, d.hw, 0.5, ox, X1, oz, Z1, (x, z, k, w) => {
      if (!inCrop(x, z)) return;
      const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
      const m = mode[k];
      const aw = Math.abs(w);
      // On elevated highways & ramps, recess the 1 m base deck inside the cantilevered
      // 0.125 m wing slab (which spans aw > d.hw - 1.35) so no dark 1 m asphalt corners
      // or underside pockets ever peek out past the pale-concrete viaduct wing.
      if (isHighway && m === MODE_ELEV && aw > d.hw - 1.05) return;
      const h8 = slopeH8(d.pts[k].h, d.kind);
      const y = h8 >> 3;
      if (y < 0 || y >= ceiling) return;
      const side = d.kind === 'art' && aw > ART_ROAD;
      const idx = lx + lz * width + y * layer;
      if (side && isAsphalt(cells[idx]) && deckGrid[idx]) return;
      const isCoveredWingRim = isHighway && m === MODE_ELEV && (h8 & 7) !== 0 && aw > d.hw - 1.5;
      cells[idx] = d.kind === 'art' ? (side ? sidewalkId : asphaltArt) : d.kind === 'lane' ? asphaltLane : isCoveredWingRim ? girderId : asphaltExp;
      let bits = code | (m << 2);
      if (d.kind === 'exp' && aw < 0.75) bits |= 16;
      if (d.barrier && d.barrier[k]) bits |= 32;
      deckGrid[idx] = bits | 128;
      if (m === MODE_ELEV || (m !== MODE_TUNNEL && tmap[lx + lz * width] < y - 1 && aw > d.hw - 1)) {
        if (y >= 1 && aw <= d.hw - (isHighway && m === MODE_ELEV ? 1.15 : 0.4)) {
          const gi = idx - layer;
          if (!cells[gi] || terrainId[cells[gi]]) cells[gi] = girderId;
        }
        if (y >= 2 && aw <= d.hw - 2.4) {
          const gi = idx - 2 * layer;
          if (!cells[gi] || terrainId[cells[gi]]) cells[gi] = girderShadeId;
        }
      }
    });
  });

  // 4b-micro. Exact integer micro-grid rasterization for pinhole-free 0.125 m sloped road decks,
  //           sleek cantilevered concrete fascia wings on elevated viaducts & beveled avenue kerbs.
  const valConcrete = packMicroVal(C.concrete, 0);
  const valConcreteShade = packMicroVal(C.concreteShade, 0);
  const valGirder = packMicroVal(C.girder, 0);
  const valGirderShade = packMicroVal(C.girderShade, 0);
  const valSidewalk = packMicroVal(C.sidewalk, 0);
  decks.forEach((d, di) => {
    const mode = modes[di];
    const pts = d.pts;
    const n = pts.length;
    const roadVal = packMicroVal(d.kind === 'art' ? C.asphaltArt : d.kind === 'lane' ? C.asphaltLane : C.asphalt, 0);
    const isArt = d.kind === 'art';
    const isHighway = d.kind === 'exp' || d.kind === 'ramp';
    for (let k = 0; k + 1 < n; k++) {
      const p = pts[k], q = pts[k + 1];
      if (!near((p.x + q.x) * 0.5, (p.z + q.z) * 0.5, d.hw + 2.5)) continue;
      const h8a = slopeH8(p.h, d.kind), h8b = slopeH8(q.h, d.kind);
      const hasSlope = (h8a & 7) !== 0 || (h8b & 7) !== 0 || h8a !== h8b;
      const inIntersect = isArt && (p.s < d.trim0 || p.s > d.trim1);
      const isElev = mode[k] === MODE_ELEV || mode[k + 1] === MODE_ELEV;
      const needWing = isHighway && isElev;

      if (hasSlope || needWing) {
        const dx = q.x - p.x, dz = q.z - p.z;
        const len2 = dx * dx + dz * dz || 1;
        const len = Math.sqrt(len2);
        const rx = -dz / len, rz = dx / len;
        const midX = (p.x + q.x) * 0.5, midZ = (p.z + q.z) * 0.5, midH = (p.h + q.h) * 0.5;
        const openL = isMergedWithNeighbor(di, midX - rx * (d.hw + 0.35), midZ - rz * (d.hw + 0.35), midH);
        const openR = isMergedWithNeighbor(di, midX + rx * (d.hw + 0.35), midZ + rz * (d.hw + 0.35), midH);
        const dh = q.h - p.h;
        const isSloping = Math.abs(dh) > 1e-4;

        const ix0 = Math.max(0, Math.floor((Math.min(p.x, q.x) - d.hw - 0.5 - ox) * 8));
        const ix1 = Math.min(mw - 1, Math.ceil((Math.max(p.x, q.x) + d.hw + 0.5 - ox) * 8));
        const iz0 = Math.max(0, Math.floor((Math.min(p.z, q.z) - d.hw - 0.5 - oz) * 8));
        const iz1 = Math.min(md - 1, Math.ceil((Math.max(p.z, q.z) + d.hw + 0.5 - oz) * 8));

        for (let iz = iz0; iz <= iz1; iz++) {
          const wz = oz + (iz + 0.5) * M;
          const rz0 = wz - p.z;
          for (let ix = ix0; ix <= ix1; ix++) {
            const wx = ox + (ix + 0.5) * M;
            const rx0 = wx - p.x;
            const t = (rx0 * dx + rz0 * dz) / len2;
            if (t < -0.04 || t > 1.04) continue;
            const w = rx0 * rx + rz0 * rz;
            const aw = Math.abs(w);
            if (aw > d.hw + 0.02) continue;

            const tc = t < 0 ? 0 : t > 1 ? 1 : t;
            const h = p.h + dh * tc;
            const h8 = slopeH8(h, d.kind);
            const yB = h8 >> 3;
            const sub = h8 & 7;
            const onWing = needWing && aw > d.hw - 1.35;
            if (sub === 0 && !onWing) continue;

            const onSidewalk = isArt && aw > ART_ROAD;
            if (onSidewalk && inIntersect) continue;
            const mergedEdge = w < 0 ? openL : openR;
            const isFasciaRim = !mergedEdge && aw > d.hw - 0.30;
            const topVal = onSidewalk ? valSidewalk : isFasciaRim ? valConcrete : roadVal;
            const iyTop = h8 + 7;

            if (onWing) {
              // Cantilevered curved precast concrete wing + fascia soffit (hollow core saves hidden micros).
              microRaw(ix, iyTop, iz, topVal);
              const depthMicros = aw > d.hw - 0.35 ? 4 : aw > d.hw - 0.8 ? 5 : 6;
              if (aw > d.hw - 0.28) {
                for (let d2 = 1; d2 < depthMicros; d2++) {
                  microRaw(ix, iyTop - d2, iz, d2 === depthMicros - 1 ? valGirderShade : valGirder);
                }
              } else {
                microRaw(ix, iyTop - (depthMicros - 1), iz, valGirderShade);
                if (isSloping) microRawIfEmpty(ix, iyTop - (depthMicros - 2), iz, valGirder);
                if (sub >= 2 && isSloping) {
                  const hPrev = slopeH8(p.h + dh * (tc - 0.18), d.kind);
                  const hNext = slopeH8(p.h + dh * (tc + 0.18), d.kind);
                  if (hPrev < h8 || hNext < h8) microRawIfEmpty(ix, iyTop - 1, iz, topVal);
                }
              }
            } else {
              microRaw(ix, iyTop, iz, topVal);
              if (isFasciaRim) {
                const iyFloor = (yB << 3) + 8;
                for (let yy = iyFloor; yy < iyTop; yy++) microRaw(ix, yy, iz, isElev ? valGirder : valConcreteShade);
              } else if (sub >= 2 && isSloping) {
                const hPrev = slopeH8(p.h + dh * (tc - 0.18), d.kind);
                const hNext = slopeH8(p.h + dh * (tc + 0.18), d.kind);
                if (hPrev < h8 || hNext < h8) microRawIfEmpty(ix, iyTop - 1, iz, topVal);
              }
            }
          }
        }
      }

      // Crisp 0.25 m raised beveled concrete kerb separating dark asphalt from sidewalks on avenues.
      if (isArt && !inIntersect && mode[k] !== MODE_TUNNEL) {
        for (let st = 0; st < 8; st++) {
          const t = (st + 0.5) / 8;
          const h = lerp(p.h, q.h, t);
          const h8 = slopeH8(h, d.kind);
          const ySurf = Math.floor(h8 / 8) + 1 + (h8 & 7) * M;
          const cx = lerp(p.x, q.x, t), cz = lerp(p.z, q.z, t);
          const rx = -lerp(p.tz, q.tz, t), rz = lerp(p.tx, q.tx, t);
          for (const sg of [-1, 1]) {
            const kx = cx + rx * sg * (ART_ROAD + 0.125), kz = cz + rz * sg * (ART_ROAD + 0.125);
            if (!inCrop(kx, kz)) continue;
            micro(kx, ySurf, kz, C.concrete);
            micro(kx, ySurf + M, kz, C.paving);
          }
        }
      }
    }
  });

  // 4c. Crisp 0.125 m micro-voxel zebra crosswalks at every avenue intersection approach.
  decks.forEach(d => {
    if (d.kind !== 'art') return;
    const pts = d.pts;
    const n = pts.length;
    const L = pts[n - 1].s;
    for (let k = 0; k + 1 < n; k++) {
      const p = pts[k], q = pts[k + 1];
      if (!((p.s >= 10.5 && p.s <= 14.2) || (p.s >= L - 14.2 && p.s <= L - 10.5))) continue;
      if (!near(p.x, p.z, ART_ROAD + 2)) continue;
      for (let st = 0; st < 8; st++) {
        const t = (st + 0.5) / 8;
        const h = lerp(p.h, q.h, t);
        const h8 = slopeH8(h, d.kind);
        const yB = Math.floor(h8 / 8), sub = h8 - yB * 8;
        const paintY = sub === 0 ? yB + 1 : yB + 1 + (sub - 1) * M;
        const cx = lerp(p.x, q.x, t), cz = lerp(p.z, q.z, t);
        const rx = -lerp(p.tz, q.tz, t), rz = lerp(p.tx, q.tx, t);
        for (let w = -(ART_ROAD - 0.5); w <= ART_ROAD - 0.5; w += M) {
          // Crisp 0.5 m wide zebra bars separated by 0.5 m asphalt gaps.
          if (mod(w + 0.25, 1.0) >= 0.5) continue;
          const wx = cx + rx * w, wz = cz + rz * w;
          if (inCrop(wx, wz)) micro(wx, paintY, wz, C.paint);
        }
      }
    }
  });

  // 4d. Silky-smooth 0.125 m curved & sloped Jersey barriers, center medians, brushed titanium
  //     handrails, thin translucent glass acoustic noise walls & bridge balustrades.
  decks.forEach((d, di) => {
    const mode = modes[di];
    const pts = d.pts;
    const n = pts.length;
    const isHighway = d.kind === 'exp' || d.kind === 'ramp';
    const reflectorGlow = 28;

    for (let k = 0; k + 1 < n; k++) {
      const p = pts[k], q = pts[k + 1];
      if (!near((p.x + q.x) * 0.5, (p.z + q.z) * 0.5, d.hw + 2.5)) continue;
      const m = mode[k];
      const hasNoiseWall = !!(d.barrier && d.barrier[k]);
      const midX = (p.x + q.x) * 0.5, midZ = (p.z + q.z) * 0.5, midH = (p.h + q.h) * 0.5;
      const mrx = -(p.tz + q.tz) * 0.5, mrz = (p.tx + q.tx) * 0.5;
      const ml = Math.hypot(mrx, mrz) || 1;
      const erx = mrx / ml, erz = mrz / ml;

      // Test once per 1 m segment whether each outer edge merges into another carriageway.
      const openSide: [boolean, boolean] = [
        isMergedWithNeighbor(di, midX - erx * (d.hw + 0.35), midZ - erz * (d.hw + 0.35), midH),
        isMergedWithNeighbor(di, midX + erx * (d.hw + 0.35), midZ + erz * (d.hw + 0.35), midH),
      ];

      const needOuter = isHighway || m === MODE_ELEV;
      const needMedian = d.kind === 'exp';
      if (!needOuter && !needMedian) continue;

      for (let st = 0; st < 8; st++) {
        const t = (st + 0.5) / 8;
        const h = lerp(p.h, q.h, t);
        const h8 = slopeH8(h, d.kind);
        const ySurf = Math.floor(h8 / 8) + 1 + (h8 & 7) * M;
        const sPos = lerp(p.s, q.s, t);
        const cx = lerp(p.x, q.x, t), cz = lerp(p.z, q.z, t);
        let tx = lerp(p.tx, q.tx, t), tz = lerp(p.tz, q.tz, t);
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const rx = -tz, rz = tx;

        // Expressway center median: tapered concrete Jersey divider + titanium top rail + amber reflectors.
        if (needMedian && inCrop(cx, cz)) {
          const isRefl = mod(sPos, 8) < 0.22;
          for (let ly = 0; ly < 6; ly++) {
            const yy = ySurf + ly * M;
            if (ly < 2) {
              micro(cx - rx * M, yy, cz - rz * M, C.concreteShade);
              micro(cx, yy, cz, C.concrete);
              micro(cx + rx * M, yy, cz + rz * M, C.concreteShade);
            } else {
              const col = ly === 4 && isRefl ? 0xffd57a : C.parapet;
              const knd: WeaveMaterialKind = ly === 4 && isRefl ? 'emissive' : 'normal';
              micro(cx, yy, cz, col, knd, reflectorGlow);
            }
          }
          micro(cx, ySurf + 6 * M, cz, C.titanium);
        }

        if (!needOuter) continue;
        for (let si = 0; si < 2; si++) {
          if (openSide[si]) continue;
          const sg = si === 0 ? -1 : 1;
          const bw = sg * (d.hw - 0.14);
          const bx = cx + rx * bw, bz = cz + rz * bw;
          if (!inCrop(bx, bz)) continue;
          const inX = bx - rx * sg * M, inZ = bz - rz * sg * M;

          if (isHighway) {
            // Sleek tapered 0.125 m concrete Jersey barrier + brushed titanium top handrail.
            const isRefl = mod(sPos, 8) < 0.22;
            const isPost = mod(sPos, 4) < 0.18;
            for (let ly = 0; ly < 6; ly++) {
              const yy = ySurf + ly * M;
              micro(bx, yy, bz, ly === 0 ? C.concreteShade : C.parapet);
              if (ly < 2) micro(inX, yy, inZ, C.concrete);
              else if (ly === 4 && isRefl) micro(inX, yy, inZ, sg > 0 ? 0xfff3d1 : 0xffe099, 'emissive', reflectorGlow);
            }
            micro(bx, ySurf + 6 * M, bz, C.titanium);
            // Razor-thin 0.125 m translucent glass acoustic noise barrier framed by titanium mullions!
            if (hasNoiseWall) {
              for (let ly = 7; ly < 18; ly++) {
                const yy = ySurf + ly * M;
                if (isPost) micro(bx, yy, bz, C.titanium);
                else micro(bx, yy, bz, C.barrierGlass, 'translucent', barrierGlassTrans);
              }
              micro(bx, ySurf + 18 * M, bz, C.titanium);
            }
          } else {
            // Elevated avenue / street bridge: crisp concrete kerb + thin 0.125 m crystal glass balustrade.
            const isPost = mod(sPos, 3) < 0.18;
            micro(bx, ySurf, bz, C.concrete);
            micro(bx, ySurf + M, bz, C.parapet);
            for (let ly = 2; ly < 8; ly++) {
              const yy = ySurf + ly * M;
              if (isPost) micro(bx, yy, bz, C.titanium);
              else micro(bx, yy, bz, C.railingGlass, 'translucent', railingGlassTrans);
            }
            micro(bx, ySurf + 8 * M, bz, C.titanium);
          }
        }
      }
    }
  });

  // 4e. Tunnel linings, portals and retaining walls.
  decks.forEach((d, di) => {
    const mode = modes[di];
    const ch = clearH(d);
    const n = d.pts.length;
    const lining = (k: number, overwrite: boolean) => {
      const p = d.pts[k];
      const y = deckY(p.h, d.kind);
      const rx = -p.tz, rz = p.tx;
      const w0 = (wd: number, yy: number, id: number) => {
        const x = p.x + rx * wd, z = p.z + rz * wd;
        if (overwrite) put(x, yy, z, id); else putSoft(x, yy, z, id);
      };
      for (const sg of [-1, 1]) {
        for (let wl = d.hw + 0.25; wl <= d.hw + 1.75; wl += 0.5) {
          for (let yy = y - 1; yy <= y + ch + 1; yy++) w0(sg * wl, yy, liningId);
        }
      }
      for (let wd = -d.hw - 1.75; wd <= d.hw + 1.75; wd += 0.5) {
        w0(wd, y + ch + 1, liningId);
        w0(wd, y + ch + 2, portalId);
      }
    };
    for (let k = 0; k < n; k++) {
      const p = d.pts[k];
      if (!near(p.x, p.z, d.hw + 8)) continue;
      const m = mode[k];
      const y = deckY(p.h, d.kind);
      const rx = -p.tz, rz = p.tx;
      if (m === MODE_TUNNEL) {
        lining(k, true);
        if (k % 4 === 0) {
          for (const sg of [-1, 1]) putIfAir(p.x + rx * sg * (d.hw - 2.5), y + ch, p.z + rz * sg * (d.hw - 2.5), tunnelLightId);
        }
        const prevT = k > 0 && mode[k - 1] === MODE_TUNNEL;
        const nextT = k < n - 1 && mode[k + 1] === MODE_TUNNEL;
        if (!prevT || !nextT) {
          const dir = prevT ? 1 : -1;
          for (let j = 1; j <= 3; j++) {
            const kk = k + dir * j;
            if (kk >= 0 && kk < n) lining(kk, true);
          }
          const kf = Math.max(0, Math.min(n - 1, k + dir * 3));
          const q = d.pts[kf];
          const qy = deckY(q.h, d.kind);
          const qrx = -q.tz, qrz = q.tx;
          for (let t = 0; t <= 1; t++) {
            const fx = q.x + q.tx * dir * t * 0.5, fz = q.z + q.tz * dir * t * 0.5;
            for (let wd = -d.hw - 4.5; wd <= d.hw + 4.5; wd += 0.5) {
              for (let yy = qy - 1; yy <= qy + ch + 5; yy++) {
                if (Math.abs(wd) <= d.hw + 0.25 && yy <= qy + ch) continue;
                const id = yy === qy + ch + 3 && Math.abs(wd) <= d.hw - 1 ? portalSignId : portalId;
                put(fx + qrx * wd, yy, fz + qrz * wd, id);
              }
              putIfAir(fx + qrx * wd, qy + ch + 6, fz + qrz * wd, portalGrassId);
            }
          }
          // 0.125 m portal finish: yellow/charcoal safety jamb chevrons, titanium lintel & green lane arrows!
          const faceX = q.x + q.tx * dir * 0.85, faceZ = q.z + q.tz * dir * 0.85;
          for (const sg of [-1, 1]) {
            const jx = faceX + qrx * sg * (d.hw + 0.35), jz = faceZ + qrz * sg * (d.hw + 0.35);
            for (let yy = 0; yy < (ch - 1) * 8; yy++) {
              const col = ((yy >> 2) & 1) === 0 ? C.paintYellow : C.steelDark;
              micro(jx, qy + 1 + yy * M, jz, col);
              micro(jx + qrx * sg * M, qy + 1 + yy * M, jz + qrz * sg * M, col);
            }
          }
          for (let wd = -d.hw - 0.5; wd <= d.hw + 0.5; wd += M) {
            micro(faceX + qrx * wd, qy + ch + 1.125, faceZ + qrz * wd, C.titanium);
          }
          const laneOffsets = d.kind === 'exp' ? [-6.5, -3.5, 3.5, 6.5] : [-3.5, 3.5];
          for (const lw of laneOffsets) {
            const ax = faceX + qrx * lw, az = faceZ + qrz * lw;
            for (let a = 0; a <= 5; a++) {
              micro(ax, qy + ch + 1.5 + a * M, az, 0x32ff78, 'emissive', 74);
            }
            for (let a = 1; a <= 3; a++) {
              micro(ax - qrx * a * M, qy + ch + 1.5 + a * M, az - qrz * a * M, 0x32ff78, 'emissive', 74);
              micro(ax + qrx * a * M, qy + ch + 1.5 + a * M, az + qrz * a * M, 0x32ff78, 'emissive', 74);
            }
          }
        }
      } else {
        for (const sg of [-1, 1]) {
          const x = p.x + rx * sg * (d.hw + 0.7), z = p.z + rz * sg * (d.hw + 0.7);
          if (!inCrop(x, z)) continue;
          // Never wall off another road's carriageway or tunnel mouth (junctions, portals).
          // (Probe 1.6 m outside the kerb so this deck's own footprint never matches.)
          const ri = rIdx(p.x + rx * sg * (d.hw + 1.6), p.z + rz * sg * (d.hw + 1.6));
          if (ri >= 0 && rmask[ri] & (BIT_EXP | BIT_ART | BIT_UNDER)) continue;
          const t = terrainAt(x, z);
          if (t > y + 1) {
            for (let yy = y + 1; yy <= Math.min(t, ceiling - 1); yy++) {
              const lx = Math.floor(x) - ox, lz = Math.floor(z) - oz;
              const i = lx + lz * width + yy * layer;
              if (!cells[i] || terrainId[cells[i]]) cells[i] = yy === t ? normalMat(C.concreteShade) : retainId;
            }
          }
        }
      }
    }
  });

  // 4f. Piers: twin columns under expressways, single columns under ramps & bridges.
  decks.forEach((d, di) => {
    const mode = modes[di];
    const spacing = d.kind === 'exp' ? 30 : d.kind === 'ramp' ? 24 : 22;
    const L = d.pts[d.pts.length - 1].s;
    for (let s = spacing / 2; s < L; s += spacing) {
      const k = Math.round(s);
      const p = d.pts[k];
      if (!near(p.x, p.z, d.hw + 4) || mode[k] !== MODE_ELEV) continue;
      const y = deckY(p.h, d.kind);
      if (y - d.terr[k] < 4.5) continue;
      const rx = -p.tz, rz = p.tx;
      const cols = d.kind === 'exp' ? [-(d.hw - 3.5), d.hw - 3.5] : d.kind === 'art' ? [-5, 5] : [0];
      const size = d.kind === 'exp' ? 3 : 2;
      let ok = true;
      for (const c of cols) {
        const cx = p.x + rx * c, cz = p.z + rz * c;
        for (let dz = -1; dz <= size && ok; dz++) {
          for (let dx = -1; dx <= size && ok; dx++) {
            const i = rIdx(cx + dx - size / 2, cz + dz - size / 2);
            if (i >= 0 && deckMin[i] < y - 3) ok = false;
          }
        }
      }
      if (!ok) continue;
      const top = y - (d.kind === 'exp' || d.hw > 3 ? 3 : 2);
      for (const c of cols) {
        const cx = Math.floor(p.x + rx * c - size / 2 + 0.5), cz = Math.floor(p.z + rz * c - size / 2 + 0.5);
        const ground = terrainAt(cx, cz);
        boxId(cx, ground - 3, cz, size, Math.max(0, top - ground + 3), size, pierId);
      }
      const span = Math.max(...cols.map(Math.abs)) + size / 2 + 1;
      for (let w = -span; w <= span; w += 0.5) {
        put(p.x + rx * w, top, p.z + rz * w, pierCapId);
        if (d.kind === 'exp') put(p.x + rx * w, top - 1, p.z + rz * w, pierCapId);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. Trees (broadleaf, conifer, blossom) used by forests, streets and roof gardens.
  // -------------------------------------------------------------------------
  const leafIds = [normalMat(C.leafDeep), normalMat(C.leafMid), normalMat(C.leafBright), normalMat(C.leafSun)];
  const coniferIds = [normalMat(C.conifer), normalMat(C.coniferLight)];
  const accentIds = [normalMat(C.blossom), normalMat(C.autumn)];
  const trunkId = normalMat(C.trunk);

  const tree = (x: number, y: number, z: number, size: number, salt: number) => {
    const tone = hash(x, z, salt, seed);
    if (tone < 0.035) {
      const acc = accentIds[tone < 0.02 ? 0 : 1];
      boxId(x, y, z, 1, Math.max(1, Math.round(size * 0.8)), 1, trunkId);
      blobId(x + 0.5, y + size * 0.8 + size * 0.5, z + 0.5, size, size * 0.8, acc);
      return;
    }
    const leaf = leafIds[Math.floor(tone * leafIds.length)];
    const crown = leafIds[Math.min(leafIds.length - 1, Math.floor(tone * leafIds.length) + 1)];
    const trunkH = Math.max(1, Math.round(size * 0.85));
    boxId(x, y, z, 1, trunkH, 1, trunkId);
    blobId(x + 0.5, y + trunkH + size * 0.55, z + 0.5, size, size * 0.82, leaf);
    if (size >= 1.8) {
      blobId(x + 0.5 + (tone - 0.5) * 1.4, y + trunkH + size * 1.12, z + 0.5 + (hash(z, x, salt + 1, seed) - 0.5) * 1.4, size * 0.64, size * 0.58, crown);
    }
  };
  const conifer = (x: number, y: number, z: number, size: number, salt: number) => {
    const id = coniferIds[hash(x, z, salt, seed) < 0.5 ? 0 : 1];
    const h = Math.round(size * 3.2);
    boxId(x, y, z, 1, 2, 1, trunkId);
    for (let k = 0; k < h; k++) {
      const r = (1 - k / h) * size * 1.15 + 0.3;
      const rr = Math.ceil(r);
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if ((dx * dx + dz * dz) <= r * r) putIfAir(x + dx, y + 2 + k, z + dz, id);
        }
      }
    }
  };

  // -------------------------------------------------------------------------
  // 6. Architecture.
  // -------------------------------------------------------------------------
  const whiteId = normalMat(C.white);
  const warmWhiteId = normalMat(C.warmWhite);
  const concreteId = normalMat(C.concrete);
  const shadeId = normalMat(C.concreteShade);
  const titaniumId = normalMat(C.titanium);
  const steelDarkId = normalMat(C.steelDark);
  const grassTopId = normalMat(C.grassB);
  const pavingId = normalMat(C.paving);
  const solarId = normalMat(C.solar);
  const hvacId = normalMat(C.hvac);
  const darkGlassId = glassMat(C.darkGlass, Math.round(30 + glassBase * 16));
  const railGlassBld = glassMat(C.railingGlass, Math.round(54 + glassBase * 20));
  const domeGlassId = glassMat(C.domeGlass, Math.round(54 + glassBase * 22));
  const poolId = glassMat(C.waterGlass, 48);
  const bridgeGlassId = glassMat(0xc8e8fa, Math.round(58 + glassBase * 18));
  const warmGlowSoft = glowMat(0xffdca3, 36);
  const warmGlowMid = glowMat(0xffcf85, 60);
  const coolLobbyGlow = glowMat(0xaee8ff, 52);
  const holoFrameId = normalMat(C.steelDark);
  const holoRimId = normalMat(C.titanium);
  const holoGlassId = glassMat(0xaeeeff, 78);

  const drawBillboard = (
    cx: number, y0: number, cz: number, angle: number, bw: number, bh: number, scheme: number, mast?: boolean,
  ) => {
    if (!near(cx, cz, bw + 4)) return;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const px = -dz, pz = dx;
    if (mast) {
      const ground = terrainAt(cx, cz);
      boxId(Math.floor(cx), ground - 2, Math.floor(cz), 2, Math.max(1, y0 - ground + 2), 2, holoRimId);
    }
    for (let yy = 0; yy < bh; yy++) {
      for (let s = -bw / 2; s <= bw / 2; s += 0.5) {
        const wx = Math.floor(cx + px * s), wz = Math.floor(cz + pz * s);
        const isRim = yy === 0 || yy === bh - 1 || Math.abs(s) >= bw / 2 - 0.35;
        if (isRim) { put(wx, y0 + yy, wz, yy === 0 || yy === bh - 1 ? holoRimId : holoFrameId); continue; }
        const v = yy / bh;
        const wave = Math.sin(s * 0.85 + yy * 0.35);
        const distC = Math.hypot(s * 1.15, yy - bh * 0.54);
        const m = Math.min(bw, bh);
        let col: number, em: number;
        if (distC <= m * 0.14) { col = 0xffffff; em = 92; }
        else if (distC < m * 0.34 && distC > m * 0.22) { col = scheme === 0 ? 0xe4faff : scheme === 1 ? 0xffe4fa : 0xe4f2ff; em = 84; }
        else if (scheme === 0) { col = v + wave * 0.12 < 0.45 ? 0x16aeff : v < 0.78 ? 0x3ce0ff : 0x8ef2ff; em = 64 + Math.round(v * 20); }
        else if (scheme === 1) { col = v + wave * 0.1 < 0.36 ? 0x2ad2ff : v < 0.68 ? 0xa644ff : 0xff4ebf; em = 68 + Math.round((1 - Math.abs(v - 0.5) * 2) * 20); }
        else { col = v < 0.4 ? 0x2f74ff : v < 0.72 ? 0x7050ff : 0xff62d0; em = 62 + Math.round(v * 20); }
        put(wx, y0 + yy, wz, glowMat(col, em));
        const fx = Math.floor(cx + px * s + dx * 1.05), fz = Math.floor(cz + pz * s + dz * 1.05);
        if ((fx !== wx || fz !== wz) && yy > 1 && yy < bh - 2 && Math.abs(s) < bw / 2 - 0.8) put(fx, y0 + yy, fz, holoGlassId);
      }
    }
  };

  const plaza = (b: { x: number; z: number; radius: number }, extra: number, planters: boolean) => {
    const R = b.radius + extra;
    const rr = Math.ceil(R);
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const x = b.x + dx, z = b.z + dz;
        if (!inCrop(x, z)) continue;
        const i = rIdx(x, z);
        if (i >= 0 && rmask[i] & (BIT_EXP | BIT_ART | BIT_BUFFER)) continue;
        const lx = x - ox, lz = z - oz;
        const t = tmap[lx + lz * width];
        const ci = lx + lz * width + t * layer;
        if (t < ceiling && terrainId[cells[ci]]) {
          cells[ci] = planters && d > R - 1.6 && mod(Math.round(Math.atan2(dz, dx) * 6), 3) === 0 ? grassTopId : pavingId;
        }
      }
    }
  };

  for (const b of buildings) {
    if (!near(b.x, b.z, b.radius + 10)) continue;
    const r = (s: number) => hash(Math.round(b.x), Math.round(b.z), s, seed);
    const pal = TOWER_PALETTES[b.palette];
    const frameId = normalMat(pal.frame);
    const slabId = normalMat(pal.slab);
    const spireGlassA = glassMat(pal.glass, Math.round(22 + glassBase * 22));
    const spireGlassB = glassMat(pal.alt, Math.round(26 + glassBase * 22));
    const yFloor = Math.max(0, b.base - 14);
    const yTop = Math.min(ceiling, b.base + b.height);
    if (b.district >= 2 && b.family !== 7) plaza(b, b.family === 6 ? 7 : 5, true);

    // Family 0: circular terraced eco-tower (white cantilevered rings, dark glass, rooftop forest).
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
              if (y === y1 - 1) put(wx, y, wz, d > curR - 1.2 ? whiteId : d < 2.6 ? concreteId : grassTopId);
              else if (isSlab) put(wx, y, wz, d > rad - 0.5 ? whiteId : concreteId);
              else if (d > rad - 1.15) put(wx, y, wz, darkGlassId);
              else if (d > rad - 2.3) {
                const lit = hash(Math.floor(dx / 2) + b.x * 7, Math.floor(dz / 2) + y * 13, 61, seed) < 0.22;
                put(wx, y, wz, lit ? warmGlowSoft : shadeId);
              } else put(wx, y, wz, concreteId);
            }
          }
          if (k > 2 && k % 4 === 1 && forest > 0.1) {
            for (let a = 0; a < 28; a++) {
              const ang = (a / 28) * Math.PI * 2 + tier * 0.4;
              if (hash(a + b.x * 17, k + b.z * 13, 62, seed) > forest * 0.62) continue;
              put(Math.round(b.x + Math.cos(ang) * (rad + 0.4)), y, Math.round(b.z + Math.sin(ang) * (rad + 0.4)), leafIds[(a + k) % leafIds.length]);
            }
          }
          // Delicate 0.125 m translucent glass balcony balustrades + titanium handrail on cantilevered rings.
          if ((k > 0 && k % 4 === 0) || y === y1 - 1) {
            const railR = rad + 0.72;
            const segs = Math.ceil(railR * Math.PI * 2 / 0.16);
            for (let a = 0; a < segs; a++) {
              const ang = (a / segs) * Math.PI * 2;
              const rxp = b.x + 0.5 + Math.cos(ang) * railR, rzp = b.z + 0.5 + Math.sin(ang) * railR;
              if (!inCrop(rxp, rzp)) continue;
              const isPost = a % 16 === 0;
              for (let ly = 0; ly < 4; ly++) {
                if (isPost) micro(rxp, y + 1 + ly * M, rzp, C.titanium);
                else micro(rxp, y + 1 + ly * M, rzp, C.railingGlass, 'translucent', railingGlassTrans);
              }
              micro(rxp, y + 1 + 4 * M, rzp, C.white);
            }
          }
        }
        if (forest > 0.1 && y1 < ceiling - 3 && rad > 5.5) {
          const treeCount = Math.max(3, Math.floor((rad * rad) / 22 * forest));
          for (let t = 0; t < treeCount; t++) {
            const ang = (t / treeCount) * Math.PI * 2 + r(64 + t) * 0.4;
            const rr = Math.max(4.4, (0.52 + r(74 + t) * 0.34) * (rad - 1.5));
            tree(Math.round(b.x + Math.cos(ang) * rr), y1, Math.round(b.z + Math.sin(ang) * rr), 1.4 + r(84 + t) * 1.2, 90 + t);
          }
        }
      }
      continue;
    }

    // Family 4: translucent glass biodome conservatory with titanium ribs and a botanical interior.
    if (b.family === 4) {
      const rx = b.radius, rz = b.radius * 0.82, ry = Math.max(9, b.height);
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const ext = Math.ceil(rx + 2);
      for (let dz = -ext; dz <= ext; dz++) {
        for (let dx = -ext; dx <= ext; dx++) {
          const u = (dx * cA + dz * sA) / (rx + 1.2), v = (dz * cA - dx * sA) / (rz + 1.2);
          const e = u * u + v * v;
          if (e > 1) continue;
          for (let y = yFloor; y <= b.base + 1 && y < ceiling; y++) {
            if (y === b.base + 1) put(b.x + dx, y, b.z + dz, e > 0.82 ? titaniumId : e < 0.25 ? poolId : e < 0.35 ? pavingId : grassTopId);
            else put(b.x + dx, y, b.z + dz, concreteId);
          }
        }
      }
      for (let dy = 1; dy <= ry + 1 && b.base + 1 + dy < ceiling; dy++) {
        const y = b.base + 1 + dy;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const lx = dx * cA + dz * sA, lz = dz * cA - dx * sA;
            const q = (lx / rx) ** 2 + (lz / rz) ** 2 + (dy / ry) ** 2;
            const qIn = (lx / Math.max(1, rx - 1.25)) ** 2 + (lz / Math.max(1, rz - 1.25)) ** 2 + (dy / Math.max(1, ry - 1.25)) ** 2;
            if (q > 1 || qIn < 1) continue;
            const phi = Math.atan2(lz / rz, lx / rx);
            const rib = Math.abs(Math.sin(phi * 4)) < 0.11 || Math.abs(dy - Math.round(ry * 0.48)) <= 0.32;
            put(b.x + dx, y, b.z + dz, rib ? titaniumId : domeGlassId);
          }
        }
      }
      const indoorY = b.base + 2;
      // Fine 0.125 m titanium geodesic purlin rings & crown skylight collar on the biodome exterior.
      for (const fH of [0.28, 0.72]) {
        const yy = b.base + 1 + ry * fH;
        const rScale = Math.sqrt(Math.max(0.05, 1 - fH * fH));
        const segs = Math.ceil(rx * rScale * Math.PI * 2 / 0.16);
        for (let a = 0; a < segs; a++) {
          const ang = (a / segs) * Math.PI * 2;
          const lx = Math.cos(ang) * (rx * rScale + 0.2), lz = Math.sin(ang) * (rz * rScale + 0.2);
          micro(b.x + 0.5 + lx * cA - lz * sA, yy, b.z + 0.5 + lx * sA + lz * cA, C.titanium);
          micro(b.x + 0.5 + lx * cA - lz * sA, yy + M, b.z + 0.5 + lx * sA + lz * cA, C.white);
        }
      }
      tree(b.x, indoorY, b.z, Math.min(2.6, ry * 0.26), 95);
      for (let t = 0; t < 5; t++) {
        const ang = b.angle + (t * Math.PI * 2) / 5 + 0.4;
        tree(Math.round(b.x + Math.cos(ang) * rx * 0.52), indoorY, Math.round(b.z + Math.sin(ang) * rz * 0.52), 1.4 + r(96 + t) * 0.5, 96 + t);
        put(Math.round(b.x + Math.cos(ang) * rx * 0.3), indoorY, Math.round(b.z + Math.sin(ang) * rz * 0.3), warmGlowMid);
      }
      continue;
    }

    // Family 5: terraced hillside eco-podium with glass balustrades and roof gardens.
    if (b.family === 5) {
      const tiers = b.height >= 20 ? 3 : 2;
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      let curY = b.base;
      for (let k = 0; k < tiers; k++) {
        const hw = Math.max(4, Math.round(b.radius - k * 2.5));
        const hd = Math.max(4, Math.round(b.radius * 0.8 - k * 2));
        const th = k === tiers - 1 ? Math.max(4, b.base + b.height - curY) : Math.max(5, Math.floor(b.height / tiers));
        const yStart = k === 0 ? yFloor : curY;
        const yEnd = Math.min(ceiling, curY + th);
        const ext = Math.ceil(Math.hypot(hw, hd)) + 1;
        for (let y = yStart; y < yEnd + 1 && y < ceiling; y++) {
          const isTop = y === yEnd - 1;
          const isRail = y === yEnd;
          const isSlab = isTop || (y - b.base) % 4 === 0 || y < b.base;
          for (let dz = -ext; dz <= ext; dz++) {
            for (let dx = -ext; dx <= ext; dx++) {
              const u = dx * cA + dz * sA, v = dz * cA - dx * sA;
              const au = Math.abs(u), av = Math.abs(v);
              if (au > hw + 0.5 || av > hd + 0.5) continue;
              const edge = au > hw - 0.5 || av > hd - 0.5;
              const wx = b.x + dx, wz = b.z + dz;
              if (isRail) { if (edge) putIfAir(wx, y, wz, railGlassBld); continue; }
              if (isTop) put(wx, y, wz, edge ? whiteId : Math.hypot(u, v) < 2.6 ? pavingId : grassTopId);
              else if (isSlab) put(wx, y, wz, edge ? whiteId : concreteId);
              else if (edge) put(wx, y, wz, darkGlassId);
              else if (au > hw - 1.6 || av > hd - 1.6) {
                const lit = hash(wx >> 1, (wz >> 1) + y * 31, 66, seed) < 0.22;
                put(wx, y, wz, lit ? warmGlowSoft : shadeId);
              } else put(wx, y, wz, concreteId);
            }
          }
        }
        if (k === tiers - 1 && forest > 0.1 && yEnd < ceiling - 3 && hw >= 5) {
          for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const u = su * Math.max(3, hw - 2), v = sv * Math.max(3, hd - 2);
            tree(Math.round(b.x + u * cA - v * sA), yEnd, Math.round(b.z + u * sA + v * cA), 1.4, 110 + su + sv * 3);
          }
        }
        curY = yEnd;
      }
      continue;
    }

    // Family 7: low garden pavilion — glass walls, timber fins, green roof with solar strips.
    if (b.family === 7) {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const hw = Math.max(5, b.radius), hd = Math.max(4, b.radius * 0.62);
      const top = Math.min(ceiling - 1, b.base + Math.round(b.height));
      const ext = Math.ceil(Math.hypot(hw, hd)) + 1;
      for (let dz = -ext; dz <= ext; dz++) {
        for (let dx = -ext; dx <= ext; dx++) {
          const u = dx * cA + dz * sA, v = dz * cA - dx * sA;
          const e = (u / hw) ** 4 + (v / hd) ** 4;
          if (e > 1) continue;
          const wx = b.x + dx, wz = b.z + dz;
          const edge = e > 0.78;
          for (let y = yFloor; y <= top; y++) {
            if (y <= b.base) put(wx, y, wz, concreteId);
            else if (y === top) {
              const solar = Math.abs(v) < hd * 0.42 && mod(Math.round(u), 4) !== 0 && u > 0;
              put(wx, y, wz, edge ? whiteId : solar ? solarId : grassTopId);
            } else if (y === top - 1) put(wx, y, wz, edge ? whiteId : concreteId);
            else if (edge) put(wx, y, wz, mod(Math.round(u * 1.3 + v * 1.3), 5) === 0 ? normalMat(0x9b7653) : darkGlassId);
            else if (y === b.base + 1) put(wx, y, wz, pavingId);
            else putAir(wx, y, wz);
          }
        }
      }
      for (let t = 0; t < 3; t++) {
        const u = (t - 1) * hw * 0.5;
        put(Math.round(b.x + u * cA), b.base + 2, Math.round(b.z + u * sA), warmGlowMid);
        if (forest > 0.1 && top + 3 < ceiling) tree(Math.round(b.x + u * cA - hd * 0.55 * sA), top + 1, Math.round(b.z + u * sA + hd * 0.55 * cA), 1.2, 130 + t);
      }
      continue;
    }

    // Family 6: twin towers joined by translucent glass sky-bridges and a garden crown bridge.
    if (b.family === 6) {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const tr = Math.min(9, b.radius * 0.36);
      const gap = Math.max(5, b.radius - tr * 2 + 3);
      const offs = [-(gap / 2 + tr), gap / 2 + tr];
      const hs = [b.height, Math.round(b.height * (0.82 + r(140) * 0.1))];
      offs.forEach((off, ti) => {
        const tx = b.x + off * cA, tz = b.z + off * sA;
        const top = Math.min(ceiling, b.base + hs[ti]);
        const ext = Math.ceil(tr + 2);
        for (let y = yFloor; y < top; y++) {
          const k = y - b.base;
          const f = clamp(k / hs[ti]);
          const rr = tr * (1 - 0.18 * f);
          for (let dz = -ext; dz <= ext; dz++) {
            for (let dx = -ext; dx <= ext; dx++) {
              const u = dx * cA + dz * sA + (tx - b.x - off * cA), v = dz * cA - dx * sA;
              const e = (Math.abs(u) / rr) ** 2.6 + (Math.abs(v) / (rr * 0.82)) ** 2.6;
              if (e > 1) continue;
              const wx = Math.round(tx) + dx, wz = Math.round(tz) + dz;
              const outer = e > 0.7;
              if (y < b.base) put(wx, y, wz, concreteId);
              else if (outer && (Math.abs(u) > rr * 0.86)) put(wx, y, wz, frameId);
              else if (outer && k % 4 === 0) put(wx, y, wz, whiteId);
              else if (outer) put(wx, y, wz, ((wx + wz + (k >> 2)) & 1) ? spireGlassA : spireGlassB);
              else if (k % 4 === 0) put(wx, y, wz, slabId);
              else {
                const lit = hash(wx >> 1, (wz >> 1) + (k >> 2) * 53, 141, seed) < 0.22;
                put(wx, y, wz, lit ? warmGlowSoft : steelDarkId);
              }
            }
          }
        }
        if (top + 3 < ceiling) {
          for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= 9) putIfAir(Math.round(tx) + dx, top, Math.round(tz) + dz, hvacId);
        }
      });
      const bridges = [Math.round(Math.min(...hs) * 0.42), Math.round(Math.min(...hs) * 0.7)];
      bridges.forEach((by, bi) => {
        const y0 = b.base + by;
        for (let s = -(gap / 2 + tr * 0.5); s <= gap / 2 + tr * 0.5; s += 0.5) {
          for (let w = -2.5; w <= 2.5; w += 0.5) {
            const wx = b.x + s * cA - w * sA, wz = b.z + s * sA + w * cA;
            const edge = Math.abs(w) > 1.9;
            put(wx, y0, wz, edge ? titaniumId : whiteId);
            for (let yy = 1; yy <= 3; yy++) put(wx, y0 + yy, wz, edge || yy === 3 ? bridgeGlassId : 0);
            if (bi === 1 && !edge) put(wx, y0 + 4, wz, grassTopId);
          }
        }
      });
      if (b.holo) {
        const off = offs[1] + tr + 1.5;
        drawBillboard(b.x + off * cA, b.base + Math.round(b.height * 0.3), b.z + off * sA, b.angle, 7, 18, b.palette % 3);
      }
      continue;
    }

    // Family 1: sculpted arch-fin louver tower with a glowing arch portal at its foot.
    if (b.family === 1) {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const ext = Math.ceil(b.radius + 4);
      for (let y = yFloor; y < yTop; y++) {
        const k = y - b.base;
        const f = clamp(k / b.height);
        const flare = k < 12 ? 1 + (1 - clamp(k / 12)) * 0.42 : 1;
        const crown = Math.sqrt(Math.max(0.04, 1 - Math.max(0, (f - 0.62) / 0.38) ** 2.2));
        const aRad = b.radius * (0.94 - 0.24 * f) * crown * flare;
        const bRad = b.radius * 0.58 * (1 - 0.16 * f) * Math.max(0.45, crown) * flare;
        const isLouver = k >= 0 && k % 3 === 0;
        const isCrown = f > 0.92;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const u = dx * cA + dz * sA, v = dz * cA - dx * sA;
            const q = (u / Math.max(1.2, aRad)) ** 2 + (v / Math.max(1.2, bRad)) ** 2;
            if (q > 1) continue;
            if (k >= 1 && k <= 10 && Math.abs(u) <= 3.6) {
              const archH = 10 * Math.sqrt(Math.max(0, 1 - (u / 3.9) ** 2));
              if (k < archH - 0.8) { putAir(b.x + dx, y, b.z + dz); continue; }
              if (k <= archH + 0.5 && Math.abs(v) > bRad - 2.2) { put(b.x + dx, y, b.z + dz, k > archH - 0.2 ? warmGlowMid : whiteId); continue; }
            }
            const wx = b.x + dx, wz = b.z + dz;
            const isArchEdge = Math.abs(u) > aRad * 0.72 || isCrown;
            const isOuter = q > 0.78;
            if (y < b.base) put(wx, y, wz, concreteId);
            else if (isArchEdge) put(wx, y, wz, whiteId);
            else if (isLouver && isOuter) put(wx, y, wz, warmWhiteId);
            else if (isOuter) put(wx, y, wz, spireGlassA);
            else if (k % 5 === 0) put(wx, y, wz, slabId);
            else if (q > 0.56) {
              const lit = hash(wx >> 1, (wz >> 1) + (k >> 2) * 71, 68, seed) < 0.26;
              put(wx, y, wz, lit ? warmGlowSoft : steelDarkId);
            } else put(wx, y, wz, steelDarkId);
          }
        }
      }
      if (b.holo) {
        const sunAng = Math.atan2(-SKYWEAVE_SUN.z, -SKYWEAVE_SUN.x);
        const sideDir = Math.abs(Math.cos(b.angle - sunAng)) > 0.5 ? b.angle : b.angle + Math.PI;
        const off = b.radius * 0.92 + 1.5;
        drawBillboard(b.x + Math.cos(sideDir) * off, b.base + Math.round(b.height * 0.34), b.z + Math.sin(sideDir) * off, sideDir, 7, 20, b.palette % 3);
      }
      continue;
    }

    // Family 2 (crystal glass supertall) & Family 3 (tapered sail / split blade).
    {
      const cA = Math.cos(b.angle), sA = Math.sin(b.angle);
      const isCrystal = b.family === 2;
      const ext = Math.ceil(b.radius + 3);
      for (let y = yFloor; y < yTop; y++) {
        const k = y - b.base;
        const f = clamp(k / b.height);
        const taper = isCrystal ? 1 - 0.34 * f ** 1.35 : 1 - 0.22 * f;
        const aRad = Math.max(2.6, b.radius * taper);
        const bRad = Math.max(2.0, b.radius * (isCrystal ? 0.74 : 0.56) * taper);
        const isSkyLobby = k > 12 && k % 22 === 0 && f < 0.86;
        const isSkyGarden = !isCrystal && k > 16 && k % 26 === 13 && f < 0.8;
        for (let dz = -ext; dz <= ext; dz++) {
          for (let dx = -ext; dx <= ext; dx++) {
            const u = dx * cA + dz * sA, v = dz * cA - dx * sA;
            const nu = Math.abs(u) / aRad, nv = Math.abs(v) / bRad;
            const shapeVal = isCrystal ? nu ** 3 + nv ** 3 : nu ** 2.2 + nv ** 2.2;
            if (shapeVal > 1) continue;
            if (f > 0.84) {
              const cut = 0.84 + 0.16 * clamp((u / aRad + 1) * 0.5);
              if (f > cut) continue;
            }
            const wx = b.x + dx, wz = b.z + dz;
            const isOuter = shapeVal > 0.74;
            const isCornerRib = (nu > 0.76 && nv > 0.45) || (isCrystal && Math.abs(u) < 0.85 && isOuter);
            if (y < b.base) put(wx, y, wz, concreteId);
            else if (isSkyGarden && isOuter && !isCornerRib) put(wx, y, wz, leafIds[(wx + wz) & 3]);
            else if (isCornerRib) put(wx, y, wz, frameId);
            else if (!isCrystal && k % 4 === 0 && isOuter && nv < 0.55) put(wx, y, wz, whiteId);
            else if (isOuter) put(wx, y, wz, ((wx + wz + (k >> 2)) & 1) ? spireGlassA : spireGlassB);
            else if (isSkyLobby) put(wx, y, wz, shapeVal > 0.45 ? coolLobbyGlow : whiteId);
            else if (k % 5 === 0) put(wx, y, wz, slabId);
            else if (shapeVal > 0.46) {
              const lit = hash(wx >> 1, (wz >> 1) + (k >> 2) * 89, 72, seed) < 0.24;
              put(wx, y, wz, lit ? warmGlowSoft : steelDarkId);
            } else put(wx, y, wz, steelDarkId);
          }
        }
      }
      if (isCrystal && yTop + 10 < ceiling) {
        microLine({ x: b.x + 0.4375, y: yTop, z: b.z + 0.4375 }, { x: b.x + 0.4375, y: yTop + 9, z: b.z + 0.4375 }, C.titanium, 'normal', 0, 2);
        micro(b.x + 0.4375, yTop + 9.25, b.z + 0.4375, 0xff5a4a, 'emissive', 88);
        micro(b.x + 0.5625, yTop + 9.25, b.z + 0.4375, 0xff5a4a, 'emissive', 88);
      } else if (!isCrystal && yTop + 2 < ceiling) {
        for (let t = 0; t < 4; t++) {
          const u = (t - 1.5) * 2.2;
          for (let s = -1.5; s <= 1.5; s += 0.5) putIfAir(b.x + u * cA - s * sA, yTop, b.z + u * sA + s * cA, t % 2 ? solarId : hvacId);
        }
      }
      // Flush 0.125 m brushed-titanium architectural cornice ledges every 12 floors on tall glass towers.
      for (let k = 12; k < b.height - 8; k += 12) {
        const yy = b.base + k;
        if (yy >= ceiling) break;
        const f = clamp(k / b.height);
        const taper = isCrystal ? 1 - 0.34 * f ** 1.35 : 1 - 0.22 * f;
        const aBase = Math.max(2.6, b.radius * taper);
        const bBase = Math.max(2.0, b.radius * (isCrystal ? 0.74 : 0.56) * taper);
        const segs = Math.ceil((aBase + bBase) * Math.PI / 0.16);
        const pwr = isCrystal ? 2 / 3 : 2 / 2.2;
        for (let a = 0; a < segs; a++) {
          const ang = (a / segs) * Math.PI * 2;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const su = Math.sign(ca) * (Math.abs(ca) ** pwr);
          const sv = Math.sign(sa) * (Math.abs(sa) ** pwr);
          for (const dr of [-0.12, 0.04, 0.16]) {
            const u = su * (aBase + dr), v = sv * (bBase + dr);
            const wx = b.x + 0.5 + u * cA - v * sA, wz = b.z + 0.5 + u * sA + v * cA;
            if (!inCrop(wx, wz)) continue;
            micro(wx, yy + 0.75, wz, C.titanium);
            micro(wx, yy + 0.875, wz, C.white);
          }
        }
      }
      if (b.holo) {
        const sunAng = Math.atan2(-SKYWEAVE_SUN.z, -SKYWEAVE_SUN.x);
        const dirAng = sunAng + (r(118) - 0.5) * 1.1;
        const off = b.radius * 0.94 + 1.5;
        drawBillboard(b.x + Math.cos(dirAng) * off, b.base + Math.round(b.height * 0.36), b.z + Math.sin(dirAng) * off, dirAng, 7, 19, (b.palette + 1) % 3);
      }
    }
  }

  // Parks & plazas: paths, ponds, benches and freestanding LED pylons in the core.
  for (const pk of parks) {
    if (!near(pk.x, pk.z, pk.r + 2)) continue;
    const rp = pk.pond ? Math.min(9, pk.r * 0.45) : 0;
    const rr = Math.ceil(pk.r);
    const ang = hash(pk.x, pk.z, 150, seed) * Math.PI;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > pk.r) continue;
        const x = pk.x + dx, z = pk.z + dz;
        if (!inCrop(x, z)) continue;
        const i = rIdx(x, z);
        if (i >= 0 && rmask[i] & (BIT_EXP | BIT_ART | BIT_BUFFER | BIT_BUILD)) continue;
        const lx = x - ox, lz = z - oz;
        const t = tmap[lx + lz * width];
        if (t >= ceiling || !terrainId[cells[lx + lz * width + t * layer]]) continue;
        const u = dx * ca + dz * sa, v = dz * ca - dx * sa;
        if (rp && d < rp) {
          put(x, t, z, poolId);
          put(x, t - 1, z, normalMat(C.riverbed, true));
        } else if (rp && d < rp + 1.2) put(x, t, z, pavingId);
        else if (Math.abs(u) < 1 || Math.abs(v) < 1 || Math.abs(d - pk.r * 0.72) < 0.7) put(x, t, z, pavingId);
      }
    }
    if (pk.id.endsWith(':plaza') || (world.district(pk.x, pk.z) === 3 && hash(pk.x, pk.z, 151, seed) < 0.4 * lights + 0.1)) {
      const bx = pk.x + Math.round(ca * pk.r * 0.5), bz = pk.z + Math.round(sa * pk.r * 0.5);
      const by = terrainAt(bx, bz);
      drawBillboard(bx, by + 7, bz, Math.atan2(-SKYWEAVE_SUN.z, -SKYWEAVE_SUN.x) + (hash(pk.x, pk.z, 152, seed) - 0.5), 6 + Math.floor(hash(pk.x, pk.z, 153, seed) * 3), 15 + Math.floor(hash(pk.x, pk.z, 154, seed) * 8), Math.floor(hash(pk.x, pk.z, 155, seed) * 3), true);
    }
    for (let q = 0; q < 4; q++) {
      const a2 = ang + q * Math.PI / 2 + 0.6;
      const bx = pk.x + Math.cos(a2) * pk.r * 0.6, bz = pk.z + Math.sin(a2) * pk.r * 0.6;
      if (!inCrop(bx, bz)) continue;
      const by = terrainAt(bx, bz) + 1;
      for (let s = -0.75; s <= 0.75; s += M) {
        micro(bx + Math.cos(a2 + Math.PI / 2) * s, by + 0.375, bz + Math.sin(a2 + Math.PI / 2) * s, 0x8a6a4a);
        micro(bx + Math.cos(a2 + Math.PI / 2) * s + Math.cos(a2) * 0.125, by + 0.375, bz + Math.sin(a2 + Math.PI / 2) * s + Math.sin(a2) * 0.125, 0x8a6a4a);
      }
      for (const s of [-0.625, 0.625]) microLine({ x: bx + Math.cos(a2 + Math.PI / 2) * s, y: by, z: bz + Math.sin(a2 + Math.PI / 2) * s }, { x: bx + Math.cos(a2 + Math.PI / 2) * s, y: by + 0.25, z: bz + Math.sin(a2 + Math.PI / 2) * s }, C.steelDark);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Forests, meadows and street trees.
  // -------------------------------------------------------------------------
  if (forest > 0.04) {
    const CELL = 5;
    const sandId = normalMat(C.sand, true), bedId = normalMat(C.riverbed, true);
    for (let gx = Math.floor((ox - 6) / CELL); gx <= Math.ceil((X1 + 6) / CELL); gx++) {
      for (let gz = Math.floor((oz - 6) / CELL); gz <= Math.ceil((Z1 + 6) / CELL); gz++) {
        const r = (s: number) => hash(gx, gz, s, seed);
        const tx = Math.floor((gx + 0.15 + r(50) * 0.7) * CELL);
        const tz = Math.floor((gz + 0.15 + r(52) * 0.7) * CELL);
        if (!near(tx, tz, 4)) continue;
        const district = world.district(tx, tz);
        const dens = [0.92, 0.6, 0.44, 0.24][district] * forest;
        if (r(51) > dens) continue;
        const i = rIdx(tx, tz);
        if (i >= 0 && rmask[i] & (BIT_EXP | BIT_ART | BIT_BUFFER | BIT_BUILD | BIT_PYLON)) continue;
        const h = terrainAt(tx, tz);
        if (h < WATER + 1 || h + 12 >= ceiling) continue;
        if (inCrop(tx, tz)) {
          const top = cells[(tx - ox) + (tz - oz) * width + h * layer];
          if (!terrainId[top] || top === sandId || top === bedId) continue;
          const ti = (tx - ox + 1) + (tz - oz + 1) * TW;
          if (Math.hypot(tf[ti + 1] - tf[ti - 1], tf[ti + TW] - tf[ti - TW]) * 0.5 > 1.1) continue;
        }
        const coni = h > 30 || noise2(tx / 70, tz / 70, seed, 53) > 0.66;
        const size = 1.6 + r(53) * 1.9;
        if (coni) conifer(tx, h + 1, tz, size * 0.9, 54);
        else tree(tx, h + 1, tz, size, 54);
      }
    }
  }
  for (const d of decks) {
    if (d.kind !== 'art') continue;
    const mode = world.deckMode(d);
    const L = d.pts[d.pts.length - 1].s;
    for (let s = 22; s < L - 22; s += 10) {
      const k = Math.round(s);
      if (mode[k] !== MODE_GRADE && mode[k] !== MODE_CUT) continue;
      const p = d.pts[k];
      if (!near(p.x, p.z, 14)) continue;
      if (mod(s - 15, 30) < 3) continue;
      for (const sg of [-1, 1]) {
        const x = Math.floor(p.x - p.tz * sg * 9), z = Math.floor(p.z + p.tx * sg * 9);
        const i = rIdx(x, z);
        if (i >= 0 && rmask[i] & (BIT_EXP | BIT_BUILD)) continue;
        if (!inCrop(x, z)) continue;
        const y = deckY(p.h, 'art');
        if (cells[(x - ox) + (z - oz) * width + y * layer] !== sidewalkId) continue;
        put(x, y, z, grassTopId);
        tree(x, y + 1, z, 1.3 + hash(x, z, 160, seed) * 0.5, 161);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. Aerospace-grade 0.125 m crystal glass sky-tubes (hollow interior, dual maglev tracks,
  //    machined multi-profile collar rings, secondary hoop ribs & sculpted pylon cradles)
  //    and smooth sloped 0.125 m open twin maglev guideways.
  // -------------------------------------------------------------------------
  const tubeTopGlassVal = packMicroVal(C.tubeGlassTop, encodeSpaceMaterialId('translucent', Math.round(68 + glassBase * 14)));
  const tubeSideGlassVal = packMicroVal(C.tubeGlassSide, encodeSpaceMaterialId('translucent', Math.round(62 + glassBase * 14)));
  const valTubeWhite = packMicroVal(C.white, 0);
  const valTubeTitanium = packMicroVal(C.titanium, 0);
  const valTubeTitMid = packMicroVal(C.titaniumMid, 0);
  const valTubeSteel = packMicroVal(C.steelDark, 0);
  const valTrackBed = packMicroVal(C.trackBed, 0);
  const valRailSilver = packMicroVal(C.railSilver, 0);
  const valRailGlow = packMicroVal(0x5ee6ff, encodeSpaceMaterialId('emissive', 50));
  const valSillGlow = packMicroVal(0xc6f4ff, encodeSpaceMaterialId('emissive', 38));
  const valCollarGlow = packMicroVal(0xcaf4ff, encodeSpaceMaterialId('emissive', 54));
  const valWindGlass = packMicroVal(C.railingGlass, encodeSpaceMaterialId('translucent', railingGlassTrans));
  const guideSideId = normalMat(C.girder);
  const guideUnderId = normalMat(C.girderShade);

  // Precomputed 336-step unit circle (~0.112 m arc step at R = 6 m -> zero circumferential pinholes).
  const TUBE_ANG_N = 336;
  const tubeCos = new Float32Array(TUBE_ANG_N);
  const tubeSin = new Float32Array(TUBE_ANG_N);
  for (let a = 0; a < TUBE_ANG_N; a++) {
    const ang = (a / TUBE_ANG_N) * Math.PI * 2;
    tubeCos[a] = Math.cos(ang);
    tubeSin[a] = Math.sin(ang);
  }
  const microWorld = (wx: number, wy: number, wz: number, val: number) =>
    microRaw(Math.round((wx - ox) * 8), Math.round(wy * 8), Math.round((wz - oz) * 8), val);
  const microWorldIfEmpty = (wx: number, wy: number, wz: number, val: number) =>
    microRawIfEmpty(Math.round((wx - ox) * 8), Math.round(wy * 8), Math.round((wz - oz) * 8), val);

  for (const sp of spans) {
    const pts = sp.pts;
    const n = pts.length;
    if (sp.kind === 'tube') {
      const R = TUBE_R;
      const uDeck = -R * 0.45;
      for (let k = 1; k < n; k++) {
        const prev = pts[k - 1], cur = pts[k];
        if (!near((prev.x + cur.x) * 0.5, (prev.z + cur.z) * 0.5, R + 3)) continue;
        const dx = cur.x - prev.x, dy = cur.h - prev.h, dz = cur.z - prev.z;
        const segLen = Math.hypot(dx, dy, dz) || 1;
        const tx = dx / segLen, ty = dy / segLen, tz = dz / segLen;
        const bLen = Math.hypot(tz, tx) || 1;
        const bx = tz / bLen, bz = -tx / bLen;
        const ux = ty * bz, uy = tz * bx - tx * bz, uz = -ty * bx;
        const axialSteps = Math.max(8, Math.ceil(segLen * 8.6));
        const isSloping = Math.abs(dy) > 0.004;

        for (let st = 0; st < axialSteps; st++) {
          const t = (st + 0.5) / axialSteps;
          const cx = prev.x + dx * t, cy = prev.h + dy * t, cz = prev.z + dz * t;
          const sCoord = sp.base + prev.s + segLen * t;
          const ringPhase = mod(sCoord, 16);
          const isMajor = ringPhase < 1.5;
          const isSecHoop = !isMajor && (Math.abs(ringPhase - 5.33) < 0.13 || Math.abs(ringPhase - 10.67) < 0.13);
          const isBevel = ringPhase < 0.25 || ringPhase > 1.25;
          const isGroove = ringPhase >= 0.55 && ringPhase <= 0.95;
          const isSillDash = mod(sCoord, 4) < 0.45;
          const isCoilLit = mod(sCoord, 1.0) < 0.5;
          const isWalkDash = mod(sCoord, 2.5) < 0.55;
          const isCenterDash = mod(sCoord, 3.0) < 0.55;

          // 1. Razor-thin 0.125 m crystal glass canopy, aerodynamic curved keel belly,
          //    6 longitudinal titanium stringers, machined major collar rings & secondary divider hoops.
          for (let a = 0; a < TUBE_ANG_N; a++) {
            const ca = tubeCos[a], sa = tubeSin[a];
            const nx = bx * ca + ux * sa, ny = uy * sa, nz = bz * ca + uz * sa;

            if (isMajor) {
              // Precision multi-profile machined aerospace collar bulkhead ring (hollow core skips buried micros).
              const maxDr = isBevel ? 3 : isGroove ? 4 : 5;
              const isSideLight = !isBevel && !isGroove && Math.abs(sa) < 0.15;
              const isStepWall = isBevel || Math.abs(ringPhase - 0.55) < 0.14 || Math.abs(ringPhase - 0.95) < 0.14 || ringPhase < 0.38 || ringPhase > 1.12;
              if (!isBevel) microWorld(cx + nx * (R - 0.125), cy + ny * (R - 0.125), cz + nz * (R - 0.125), valTubeSteel);
              for (let dr = 0; dr <= maxDr; dr++) {
                if (dr > 0 && dr < maxDr && !isStepWall) continue;
                const rr = R + dr * M;
                const val = dr === maxDr
                  ? (isSideLight ? valCollarGlow : isGroove ? valTubeSteel : isBevel ? valTubeTitanium : valTubeWhite)
                  : isGroove && dr >= 2 ? valTubeSteel
                  : dr === 0 ? valTubeTitMid : valTubeTitanium;
                microWorld(cx + nx * rr, cy + ny * rr, cz + nz * rr, val);
              }
            } else if (isSecHoop) {
              // Slim 0.25 m brushed-titanium secondary divider hoop ring (3 panoramic window bays per collar).
              microWorld(cx + nx * R, cy + ny * R, cz + nz * R, valTubeTitanium);
              microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), valTubeWhite);
            } else if (sa > -0.44) {
              // Upper crystal-glass curved canopy + 6 precision longitudinal titanium stringers.
              const isCrown = sa > 0.996;
              const isShoulder = sa > 0 && Math.abs(Math.abs(ca) - 0.55) < 0.017;
              const isMidMullion = Math.abs(sa - 0.20) < 0.017;
              const isSill = sa <= -0.39;
              if (isCrown) {
                const isGrooveCenter = Math.abs(ca) < 0.022;
                microWorld(cx + nx * R, cy + ny * R, cz + nz * R, valTubeTitanium);
                microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), isGrooveCenter ? valTubeSteel : valTubeWhite);
              } else if (isShoulder || isMidMullion) {
                microWorld(cx + nx * R, cy + ny * R, cz + nz * R, valTubeTitanium);
                microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), valTubeWhite);
              } else if (isSill) {
                microWorld(cx + nx * R, cy + ny * R, cz + nz * R, valTubeWhite);
                microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), isSillDash && sa < -0.41 ? valSillGlow : valTubeTitanium);
              } else {
                microWorld(cx + nx * R, cy + ny * R, cz + nz * R, sa > 0.34 ? tubeTopGlassVal : tubeSideGlassVal);
              }
            } else {
              // Aerodynamic curved white/titanium fuselage keel belly + twin ventral strakes & center spine.
              const isCheekSeam = Math.abs(sa + 0.57) < 0.02;
              const isStrake = sa < -0.72 && Math.abs(Math.abs(ca) - 0.24) < 0.026;
              const isCenterKeel = sa < -0.94 && Math.abs(ca) < 0.09;
              const hullVal = isCheekSeam ? valTubeSteel : sa > -0.70 ? valTubeWhite : sa > -0.86 ? valTubeTitanium : valTubeTitMid;
              microWorld(cx + nx * R, cy + ny * R, cz + nz * R, hullVal);
              if (isStrake) {
                microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), valTubeSteel);
              } else if (isCenterKeel) {
                microWorld(cx + nx * (R + 0.125), cy + ny * (R + 0.125), cz + nz * (R + 0.125), valTubeSteel);
                microWorld(cx + nx * (R + 0.25), cy + ny * (R + 0.25), cz + nz * (R + 0.25), valTubeTitMid);
              }
            }
          }

          // 2. Precision 0.125 m sloped interior dual-lane maglev track deck (hollow canopy above!).
          const dxBase = cx + ux * uDeck, dyBase = cy + uy * uDeck, dzBase = cz + uz * uDeck;
          for (let bb = -5.12; bb <= 5.13; bb += 0.116) {
            const ab = Math.abs(bb);
            const px = dxBase + bx * bb, py2 = dyBase, pz = dzBase + bz * bb;
            if (ab >= 3.85) {
              // Raised side maintenance walkways with white kerb trim & recessed edge guide lights.
              const isCurb = ab < 4.02;
              microWorld(px, py2 + 0.125, pz, isCurb ? valTubeWhite : valTubeTitMid);
              microWorld(px, py2 + 0.25, pz, isCurb && isWalkDash ? valSillGlow : valTubeTitanium);
            } else {
              microWorld(px, py2, pz, valTrackBed);
              if (isSloping) microWorldIfEmpty(px, py2 - 0.125, pz, valTrackBed);
              if (ab <= 0.22) {
                // Sleek central divider spine separating twin maglev guideway lanes.
                microWorld(px, py2 + 0.125, pz, valTubeTitanium);
                microWorld(px, py2 + 0.25, pz, ab < 0.08 && isCenterDash ? valRailGlow : valTubeWhite);
              } else if (Math.abs(ab - 1.46) < 0.08 || Math.abs(ab - 2.74) < 0.08) {
                // Twin raised brushed-silver maglev rails for each lane.
                microWorld(px, py2 + 0.125, pz, valTubeTitMid);
                microWorld(px, py2 + 0.25, pz, valRailSilver);
              } else if (Math.abs(ab - 2.10) < 0.18) {
                // Linear-induction stator coil dashes centered between each pair of rails.
                microWorld(px, py2 + 0.125, pz, isCoilLit ? valRailGlow : valTubeSteel);
              }
            }
          }
        }
      }
    } else {
      // Open twin maglev guideway: recessed 1 m structural spine + smooth 0.125 m sloped white
      // cantilevered beams, silver rails, cyan coil dashes & thin translucent glass wind-screens.
      for (let k = 0; k < n; k++) {
        const p = pts[k];
        if (!near(p.x, p.z, 7)) continue;
        const y = Math.floor(Math.round(p.h * 8) / 8);
        const rx = -p.tz, rz = p.tx;
        for (let w = -1.45; w <= 1.45; w += 0.5) {
          const x = p.x + rx * w, z = p.z + rz * w;
          put(x, y - 1, z, guideSideId);
          put(x, y - 2, z, guideUnderId);
        }
        if (k + 1 >= n) continue;
        const q = pts[k + 1];
        const dx = q.x - p.x, dz = q.z - p.z;
        const len2 = dx * dx + dz * dz || 1;
        const len = Math.sqrt(len2);
        const rrx = -dz / len, rrz = dx / len;
        const dh = q.h - p.h;
        const isSloping = Math.abs(dh) > 1e-4;
        const ix0 = Math.max(0, Math.floor((Math.min(p.x, q.x) - 4.5 - ox) * 8));
        const ix1 = Math.min(mw - 1, Math.ceil((Math.max(p.x, q.x) + 4.5 - ox) * 8));
        const iz0 = Math.max(0, Math.floor((Math.min(p.z, q.z) - 4.5 - oz) * 8));
        const iz1 = Math.min(md - 1, Math.ceil((Math.max(p.z, q.z) + 4.5 - oz) * 8));
        const isCrossTie = k % 6 === 0;
        const isPost = k % 5 === 0;
        const isCoilLit = k % 2 === 0;

        for (let iz = iz0; iz <= iz1; iz++) {
          const wz = oz + (iz + 0.5) * M;
          const rz0 = wz - p.z;
          for (let ix = ix0; ix <= ix1; ix++) {
            const wx = ox + (ix + 0.5) * M;
            const rx0 = wx - p.x;
            const t = (rx0 * dx + rz0 * dz) / len2;
            if (t < -0.04 || t > 1.04) continue;
            const w = rx0 * rrx + rz0 * rrz;
            const aw = Math.abs(w);
            if (aw > 4.2) continue;
            const tc = t < 0 ? 0 : t > 1 ? 1 : t;
            const h8 = Math.round((p.h + dh * tc) * 8);
            const iyTop = h8 + 7;

            if (aw >= 1.05 && aw <= 4.05) {
              const isEdge = aw > 3.72 || aw < 1.32;
              const isRail = Math.abs(aw - 1.75) < 0.09 || Math.abs(aw - 3.25) < 0.09;
              const isCoil = Math.abs(aw - 2.5) < 0.14;
              microRaw(ix, iyTop, iz, isEdge ? valTubeTitanium : valTubeWhite);
              if (isEdge) {
                for (let d2 = 1; d2 <= 3; d2++) microRaw(ix, iyTop - d2, iz, d2 === 3 ? valGirderShade : valGirder);
              } else {
                microRaw(ix, iyTop - 3, iz, valGirderShade);
                if (isSloping) microRawIfEmpty(ix, iyTop - 1, iz, valTubeWhite);
              }
              if (isRail) microRaw(ix, iyTop + 1, iz, valRailSilver);
              else if (isCoil && isCoilLit) microRaw(ix, iyTop + 1, iz, valRailGlow);
            } else if (isCrossTie && aw < 1.05) {
              microRaw(ix, iyTop - 1, iz, valGirder);
              microRaw(ix, iyTop - 2, iz, valGirderShade);
            }
            // Razor-thin 0.125 m translucent wind-screen along both outer guideway flanks.
            if (aw >= 4.02 && aw <= 4.18) {
              for (let ly = 1; ly <= 5; ly++) {
                microRaw(ix, iyTop + ly, iz, isPost ? valTubeTitanium : valWindGlass);
              }
              microRaw(ix, iyTop + 6, iz, valTubeWhite);
            }
          }
        }
      }
    }
  }

  for (const py of pylons) {
    if (!near(py.x, py.z, 16)) continue;
    const ground = terrainAt(py.x, py.z);
    const px0 = Math.round(py.x), pz0 = Math.round(py.z);
    if (py.kind === 'track') {
      const top = Math.floor(py.y) - 3;
      boxId(px0 - 1, ground - 3, pz0 - 1, 2, Math.max(0, top - ground + 3), 2, pierId);
      for (let w = -4.2; w <= 4.2; w += 0.5) {
        put(py.x - py.tz * w, top, py.z + py.tx * w, pierCapId);
        put(py.x - py.tz * w, top - 1, py.z + py.tx * w, Math.abs(w) < 2.6 ? pierCapId : 0);
      }
      continue;
    }
    // Sculpted tube pylon: tapered banded architectural column + precision 0.125 m aerospace saddle cradle!
    const R = TUBE_R;
    const cradleBottom = Math.floor(py.y - R - 3.2);
    for (let y = Math.max(0, ground - 8); y <= cradleBottom && y < ceiling; y++) {
      const t = clamp((cradleBottom - y) / Math.max(12, cradleBottom - ground));
      const hw = Math.round(2.5 + t * 2.5), hd = Math.round(2 + t * 2);
      const band = y % 6 === 0;
      for (let dz = -hd; dz <= hd; dz++) {
        for (let dx = -hw; dx <= hw; dx++) {
          if (Math.abs(dx) === hw && Math.abs(dz) === hd) continue;
          const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
          put(px0 + dx, y, pz0 + dz, band ? whiteId : edge && (Math.abs(dx) <= hw - 2 || Math.abs(dz) <= hd - 2) ? darkGlassId : concreteId);
        }
      }
    }
    // Precision 0.125 m sculpted clamp collar, aerodynamic lower nacelle saddle & flared transition haunch.
    const tl = Math.hypot(py.tx, py.tz) || 1;
    const ftx = py.tx / tl, ftz = py.tz / tl;
    const fbx = ftz, fbz = -ftx;
    for (let al = -2.5; al <= 2.51; al += 0.118) {
      const aAl = Math.abs(al);
      const cx = py.x + ftx * al, cz = py.z + ftz * al;
      const inClamp = aAl <= 0.82;
      const saddleT = clamp(1 - aAl / 2.55);
      const saddleDr = Math.max(1, Math.round(1 + saddleT * 7));
      for (let a = 0; a < TUBE_ANG_N; a++) {
        const ca = tubeCos[a], sa = tubeSin[a];
        if (!inClamp && sa > -0.14) continue;
        const maxDr = inClamp ? (aAl < 0.25 ? 6 : 8) : saddleDr;
        const isSideGlow = inClamp && aAl < 0.35 && Math.abs(sa) < 0.16;
        const isGroove = inClamp && aAl > 0.3 && aAl < 0.55;
        for (let dr = 1; dr <= maxDr; dr++) {
          if (dr < maxDr && aAl < 2.25 && !(inClamp && aAl > 0.68)) {
            // Only fill surface skin & end caps of saddle/clamp to keep voxel count lean!
            if (dr > 1) continue;
          }
          const rr = R + dr * M;
          const wx = cx + fbx * ca * rr, wy = py.y + sa * rr, wz = cz + fbz * ca * rr;
          const val = dr === maxDr
            ? (isSideGlow ? valCollarGlow : isGroove ? valTubeSteel : valTubeWhite)
            : valTubeTitanium;
          microWorld(wx, wy, wz, val);
        }
      }
    }
    // Curved 0.125 m structural haunch flaring cleanly from the pylon shaft up into the cradle belly.
    const yHaunch0 = cradleBottom + 1;
    const yHaunch1 = py.y - R * 0.42;
    for (let yy = yHaunch0; yy <= yHaunch1; yy += M) {
      const u = yy - py.y;
      const fH = clamp((yy - yHaunch0) / Math.max(0.5, yHaunch1 - yHaunch0));
      const maxB = 2.6 + fH * 3.8;
      const maxAl = 1.9 + fH * 0.45;
      for (let al = -maxAl; al <= maxAl + 1e-4; al += 0.125) {
        const isAlEdge = Math.abs(al) > maxAl - 0.18;
        for (let bb = -maxB; bb <= maxB + 1e-4; bb += 0.125) {
          const isBEdge = Math.abs(bb) > maxB - 0.2;
          if (!isAlEdge && !isBEdge) continue;
          if (Math.hypot(bb, u) < R + 0.05) continue;
          const isRib = Math.abs(al) < 0.2 || Math.abs(Math.abs(al) - 1.1) < 0.16;
          const wx = py.x + ftx * al + fbx * bb, wz = py.z + ftz * al + fbz * bb;
          microWorld(wx, yy, wz, isRib ? valTubeWhite : isAlEdge ? valTubeTitanium : valTubeTitMid);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 9. Street furniture: lights, signals, sign gantries.
  // -------------------------------------------------------------------------
  const lampHead = 0xfff2d8;
  const streetLight = (x: number, y: number, z: number, ax: number, az: number, h: number, arm: number) => {
    if (!inCrop(x, z)) return;
    microLine({ x, y, z }, { x, y: y + h, z }, C.pole, 'normal', 0, 2);
    microLine({ x, y: y + h, z }, { x: x + ax * arm, y: y + h + 0.25, z: z + az * arm }, C.pole, 'normal', 0, 1);
    for (let a = -0.25; a <= 0.25; a += M) {
      for (let b2 = -0.125; b2 <= 0.125; b2 += M) {
        micro(x + ax * (arm + a) - az * b2, y + h + 0.125, z + az * (arm + a) + ax * b2, lampHead, 'emissive', Math.round(22 + 26 * lights));
      }
    }
  };
  if (lights > 0.02) {
    for (let di = 0; di < decks.length; di++) {
      const d = decks[di];
      const mode = modes[di];
      const L = d.pts[d.pts.length - 1].s;
      if (d.kind === 'art') {
        for (let s = 20, side = 1; s < L - 18; s += 30, side = -side) {
          const k = Math.round(s);
          if (mode[k] === MODE_TUNNEL) continue;
          const p = d.pts[k];
          if (!near(p.x, p.z, 13)) continue;
          const rx = -p.tz, rz = p.tx;
          const w = side * (mode[k] === MODE_ELEV ? 9.3 : 8.6);
          const x = p.x + rx * w, z = p.z + rz * w;
          const i = rIdx(x, z);
          const h8 = slopeH8(p.h, 'art');
          const ySurf = Math.floor(h8 / 8) + 1 + (h8 & 7) * M;
          if (i >= 0 && rmask[i] & BIT_EXP && deckMin[i] < ySurf + 9) continue;
          streetLight(Math.floor(x) + 0.5, ySurf, Math.floor(z) + 0.5, -rx * side, -rz * side, 7, 1.75);
        }
      } else if (d.kind === 'exp') {
        for (let s = 21; s < L; s += 42) {
          const k = Math.round(s);
          if (mode[k] === MODE_TUNNEL) continue;
          const p = d.pts[k];
          if (!near(p.x, p.z, 4)) continue;
          const h8 = slopeH8(p.h, 'exp');
          const y = Math.floor(h8 / 8) + 1 + (h8 & 7) * M + 0.75;
          const rx = -p.tz, rz = p.tx;
          const x = Math.floor(p.x) + 0.5, z = Math.floor(p.z) + 0.5;
          if (!inCrop(x, z)) continue;
          microLine({ x, y, z }, { x, y: y + 8, z }, C.pole, 'normal', 0, 2);
          for (const sg of [-1, 1]) {
            microLine({ x, y: y + 8, z }, { x: x + rx * sg * 2.6, y: y + 8.25, z: z + rz * sg * 2.6 }, C.pole, 'normal', 0, 1);
            for (let a = -0.25; a <= 0.25; a += M) micro(x + rx * sg * (2.6 + a), y + 8.125, z + rz * sg * (2.6 + a), lampHead, 'emissive', Math.round(22 + 26 * lights));
          }
        }
      }
    }
  }

  // Traffic signals on the right-hand kerb of every approach into an avenue intersection.
  {
    const degree = new Map<string, number>();
    const nodeKey = (d: WeaveDeck, end: 0 | 1) => {
      const [kind, a, b] = d.id.split(':');
      const dir = kind === 'a0' ? 0 : 1;
      const A = Number(a) + (end && dir === 0 ? 1 : 0), B = Number(b) + (end && dir === 1 ? 1 : 0);
      return `${A}:${B}`;
    };
    for (const d of decks) if (d.kind === 'art') for (const e of [0, 1] as const) degree.set(nodeKey(d, e), (degree.get(nodeKey(d, e)) ?? 0) + 1);
    for (let di = 0; di < decks.length; di++) {
      const d = decks[di];
      if (d.kind !== 'art') continue;
      const L = d.pts[d.pts.length - 1].s;
      for (const e of [0, 1] as const) {
        if ((degree.get(nodeKey(d, e)) ?? 0) < 3) continue;
        const s = e === 0 ? 15.5 : L - 15.5;
        const k = Math.round(s);
        if (modes[di][k] === MODE_TUNNEL) continue;
        const p = d.pts[k];
        if (!near(p.x, p.z, 10)) continue;
        const rx = -p.tz, rz = p.tx;
        const sg = e === 0 ? -1 : 1;
        const fx = e === 0 ? -p.tx : p.tx, fz = e === 0 ? -p.tz : p.tz;
        const x = p.x + rx * sg * 8.4, z = p.z + rz * sg * 8.4;
        if (!inCrop(x, z)) continue;
        const h8 = slopeH8(p.h, 'art');
        const y = Math.floor(h8 / 8) + 1 + (h8 & 7) * M;
        microLine({ x, y, z }, { x, y: y + 5.5, z }, C.pole, 'normal', 0, 2);
        const ex = x - rx * sg * 5.2, ez = z - rz * sg * 5.2;
        microLine({ x, y: y + 5.5, z }, { x: ex, y: y + 5.5, z: ez }, C.pole, 'normal', 0, 2);
        const phase = hash(Math.round(p.x), Math.round(p.z), 170, seed) < 0.5;
        const lit = [phase ? 0xff3b30 : 0x3b0c0c, 0x3a2a08, phase ? 0x0c2a12 : 0x2cff6a];
        for (let q = 0; q < 3; q++) {
          for (let a = 0; a < 2; a++) {
            micro(ex - fx * 0.125 + rx * a * M, y + 5.125 - q * 0.25, ez - fz * 0.125 + rz * a * M, q === 1 ? 0x2a2a2a : lit[q === 0 ? 0 : 2],
              (q === 0 && phase) || (q === 2 && !phase) ? 'emissive' : 'normal', 80);
          }
        }
      }
    }
  }

  // Overhead 0.125 m open-web titanium truss sign gantries ahead of every diverge.
  for (const g of plan.gantries) {
    if (!near(g.x, g.z, 14)) continue;
    const h8 = slopeH8(g.h, 'exp');
    const y = Math.floor(h8 / 8) + 1 + (h8 & 7) * M;
    if (terrainAt(g.x, g.z) > y + 1) continue;
    const rx = -g.tz, rz = g.tx;
    // Twin open-lattice support legs on median and outer verge.
    for (const pw of [0.35, 9.7]) {
      const px = g.x + rx * pw, pz = g.z + rz * pw;
      microLine({ x: px, y, z: pz }, { x: px, y: y + 7.25, z: pz }, C.titanium, 'normal', 0, 2);
      microLine({ x: px + g.tx * 0.5, y, z: pz + g.tz * 0.5 }, { x: px + g.tx * 0.5, y: y + 7.25, z: pz + g.tz * 0.5 }, C.titanium, 'normal', 0, 2);
      for (let yy = 0.75; yy < 7; yy += 1.25) {
        microLine({ x: px, y: y + yy, z: pz }, { x: px + g.tx * 0.5, y: y + yy + 1.1, z: pz + g.tz * 0.5 }, C.titaniumMid, 'normal', 0, 1);
      }
    }
    // Horizontal space-frame truss spanning the carriageway (top & bottom chords + diagonal bracing).
    for (const dy of [6.375, 7.25]) {
      for (const dt of [0, 0.5]) {
        microLine(
          { x: g.x + rx * 0.35 + g.tx * dt, y: y + dy, z: g.z + rz * 0.35 + g.tz * dt },
          { x: g.x + rx * 9.7 + g.tx * dt, y: y + dy, z: g.z + rz * 9.7 + g.tz * dt },
          C.titanium, 'normal', 0, 1,
        );
      }
    }
    for (let w = 0.5; w < 9.2; w += 1.0) {
      const up = (Math.floor(w) & 1) === 0;
      microLine(
        { x: g.x + rx * w, y: y + (up ? 6.375 : 7.25), z: g.z + rz * w },
        { x: g.x + rx * (w + 1), y: y + (up ? 7.25 : 6.375), z: g.z + rz * (w + 1) },
        C.titaniumMid, 'normal', 0, 1,
      );
    }
    // Sleek 0.25 m thin emerald-green highway signboard with crisp 0.125 m white border, glyphs,
    // downward exit arrow & brushed aluminum rear backing + horizontal mounting rails!
    const fx = -g.tx * 0.25, fz = -g.tz * 0.25;
    for (let w = 2.0; w <= 8.8; w += M) {
      for (let hy = 0; hy <= 1.875; hy += M) {
        const bx = g.x + rx * w + fx, bz = g.z + rz * w + fz;
        const isBorder = w <= 2.13 || w >= 8.67 || hy <= 0.13 || hy >= 1.74;
        const isText = !isBorder && (
          (hy >= 1.24 && hy <= 1.38 && w >= 2.6 && w <= 7.0 && mod(Math.floor(w * 2.5), 3) !== 0)
          || (hy >= 0.74 && hy <= 0.88 && w >= 2.6 && w <= 6.2 && mod(Math.floor(w * 2.8), 4) !== 0)
        );
        const isMountBar = Math.abs(hy - 0.5) < 0.08 || Math.abs(hy - 1.375) < 0.08;
        micro(bx, y + 5.875 + hy, bz, isBorder || isText ? C.paint : C.signGreen);
        micro(bx + g.tx * 0.18, y + 5.875 + hy, bz + g.tz * 0.18, isMountBar ? C.titanium : C.titaniumMid);
      }
    }
    // Crisp downward white exit arrow on the right panel + downward glowing sign floodlights.
    for (let a = 0; a <= 0.875; a += M) {
      micro(g.x + rx * 7.8 + fx - g.tx * M, y + 6.375 + a, g.z + rz * 7.8 + fz - g.tz * M, C.paint);
    }
    for (let a = 1; a <= 3; a++) {
      micro(g.x + rx * (7.8 - a * M) + fx - g.tx * M, y + 6.375 + a * M, g.z + rz * (7.8 - a * M) + fz - g.tz * M, C.paint);
      micro(g.x + rx * (7.8 + a * M) + fx - g.tx * M, y + 6.375 + a * M, g.z + rz * (7.8 + a * M) + fz - g.tz * M, C.paint);
    }
    for (const lw of [3.5, 5.5, 7.5]) {
      micro(g.x + rx * lw + fx - g.tx * 0.375, y + 7.75, g.z + rz * lw + fz - g.tz * 0.375, 0xfff4d8, 'emissive', Math.round(36 + 32 * lights));
    }
  }

  // -------------------------------------------------------------------------
  // 10. Continuous sloped lane markings (crisp 0.125 m paint embedded flush on all decks & ramps).
  // -------------------------------------------------------------------------
  for (let di = 0; di < decks.length; di++) {
    const d = decks[di];
    const pts = d.pts;
    const n = pts.length;
    const L = pts[n - 1].s;
    const lines: { w: number; dash: boolean; col: number }[] =
      d.kind === 'exp' ? [
        { w: 1.45, dash: false, col: C.paintYellow }, { w: -1.45, dash: false, col: C.paintYellow },
        { w: 9.0, dash: false, col: C.paint }, { w: -9.0, dash: false, col: C.paint },
        { w: 5.3, dash: true, col: C.paint }, { w: -5.3, dash: true, col: C.paint },
      ]
      : d.kind === 'ramp' ? [{ w: 2.55, dash: false, col: C.paint }, { w: -2.55, dash: false, col: C.paint }]
      : d.kind === 'art' ? [
        { w: 0.25, dash: false, col: C.paintYellow }, { w: -0.25, dash: false, col: C.paintYellow },
        { w: 3.5, dash: true, col: C.paint }, { w: -3.5, dash: true, col: C.paint },
      ]
      : [{ w: 0, dash: true, col: C.paintYellow }];
    for (let k = 0; k + 1 < n; k++) {
      const p = pts[k], q = pts[k + 1];
      if (!near(p.x, p.z, d.hw + 2)) continue;
      if (p.s < d.trim0 || p.s > d.trim1) continue;
      for (const ln of lines) {
        if (ln.dash && mod(Math.floor(p.s / 6), 2) === 1) continue;
        for (let t = 0; t < 1; t += M) {
          const h = lerp(p.h, q.h, t);
          const h8 = slopeH8(h, d.kind);
          const yB = Math.floor(h8 / 8), sub = h8 - yB * 8;
          const paintY = sub === 0 ? yB + 1 : yB + 1 + (sub - 1) * M;
          const x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t);
          const tx = lerp(p.tx, q.tx, t), tz = lerp(p.tz, q.tz, t);
          const wx = x - tz * ln.w, wz = z + tx * ln.w;
          micro(wx, paintY, wz, ln.col);
        }
      }
    }
    if (d.kind === 'art') {
      for (const e of [0, 1] as const) {
        const s = e === 0 ? 15.2 : L - 15.2;
        const k = Math.round(s);
        const p = pts[Math.min(n - 1, k)];
        if (!near(p.x, p.z, 10)) continue;
        const h8 = slopeH8(p.h, d.kind);
        const yB = Math.floor(h8 / 8), sub = h8 - yB * 8;
        const paintY = sub === 0 ? yB + 1 : yB + 1 + (sub - 1) * M;
        const sg = e === 0 ? -1 : 1;
        for (let w = 0.6; w <= 6.6; w += M) {
          for (let a = 0; a < 3; a++) micro(p.x - p.tz * sg * w + p.tx * a * M, paintY, p.z + p.tx * sg * w + p.tz * a * M, C.paint);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 11. Emit visible voxels (never culling opaque voxels behind translucent glass) + micro cubes.
  // -------------------------------------------------------------------------
  const isOpaque = (id: number) => id !== 0 && palette[id].material !== 'translucent';
  const opq = new Uint8Array(palette.length);
  for (let q = 1; q < palette.length; q++) opq[q] = palette[q].material !== 'translucent' ? 1 : 0;
  let standardCount = 0, translucentCount = 0, emissiveCount = 0;
  const hx = width / 2, hz = depth / 2;
  for (let y = 0; y < ceiling; y++) {
    const yInner = y > 0 && y < ceiling - 1;
    for (let z = 0; z < depth; z++) {
      const zInner = yInner && z > 0 && z < depth - 1;
      let i = z * width + y * layer;
      for (let x = 0; x < width; x++, i++) {
        const id = cells[i];
        if (!id) continue;
        if (
          zInner && x > 0 && x < width - 1
          && opq[cells[i - 1]] && opq[cells[i + 1]] && opq[cells[i - width]] && opq[cells[i + width]]
          && opq[cells[i - layer]] && opq[cells[i + layer]]
        ) continue;
        const p = palette[id];
        voxels.push({
          x: x + 0.5 - hx, y, z: z + 0.5 - hz,
          sizeX: 1, sizeY: 1, sizeZ: 1,
          color: p.color, material: p.material, materialId: p.materialId,
          transparency: p.transparency, emission: p.emission, emissive: p.emissive, intensity: p.intensity,
        });
        const hi = x + z * width;
        if (y + 1 > heights[hi]) heights[hi] = y + 1;
        if (p.material === 'translucent') translucentCount++;
        else if (p.material === 'emissive') emissiveCount++;
        standardCount++;
      }
    }
  }
  for (let bi = 0; bi < mBrickKeys.length; bi++) {
    const bKey = mBrickKeys[bi];
    if (cells[bKey]) continue;
    const brick = mBricks.get(bKey)!;
    const by = Math.floor(bKey / layer);
    const rem = bKey - by * layer;
    const bz = Math.floor(rem / width);
    const bx = rem - bz * width;
    const hi = bx + bz * width;
    const baseIx = bx << 3, baseIy = by << 3, baseIz = bz << 3;
    for (let slot = 0; slot < 512; slot++) {
      const val = brick[slot];
      if (!val) continue;
      const ix = baseIx | (slot & 7);
      const iz = baseIz | ((slot >> 3) & 7);
      const iy = baseIy | (slot >> 6);
      const mid = (val & 0xff) - 1;
      const col = val >>> 8;
      let material: WeaveMaterialKind = 'normal';
      let transparency = 0;
      let emission = 0;
      if (mid >= SPACE_MATERIAL_IDS.TRANSLUCENT_MIN && mid <= SPACE_MATERIAL_IDS.TRANSLUCENT_MAX) {
        material = 'translucent';
        transparency = mid - 1;
        translucentCount++;
      } else if (mid >= SPACE_MATERIAL_IDS.EMISSIVE_MIN && mid <= SPACE_MATERIAL_IDS.EMISSIVE_MAX) {
        material = 'emissive';
        emission = mid - 101;
        emissiveCount++;
      }
      const vy = iy * M;
      if (vy + M > heights[hi]) heights[hi] = vy + M;
      voxels.push({
        x: ix * M + M / 2 - hx,
        y: vy,
        z: iz * M + M / 2 - hz,
        sizeX: M,
        sizeY: M,
        sizeZ: M,
        color: col,
        material,
        materialId: mid,
        transparency,
        emission,
        emissive: material === 'emissive',
        intensity: emission / 50,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 12. Cameras: hero overview of the nearest interchange, landmark tour, rooftop deck view.
  // -------------------------------------------------------------------------
  const local = (p: WeavePoint): WeavePoint => ({ x: p.x - ox - width / 2, y: p.y, z: p.z - oz - depth / 2 });
  const inside = (x: number, z: number, m: number) => x > ox + m && x < X1 - m && z > oz + m && z < Z1 - m;
  const cxw = config.offsetX, czw = config.offsetZ;
  const ics = plan.interchanges
    .filter(ic => inside(ic.x, ic.z, Math.min(width, depth) * 0.16))
    .sort((a, b) => Math.hypot(a.x - cxw, a.z - czw) - Math.hypot(b.x - cxw, b.z - czw));
  const hero = ics[0] ?? null;
  const sunLen = Math.hypot(SKYWEAVE_SUN.x, SKYWEAVE_SUN.z) || 1;
  const sunX = SKYWEAVE_SUN.x / sunLen, sunZ = SKYWEAVE_SUN.z / sunLen;
  const clampIn = (p: WeavePoint): WeavePoint => ({
    x: clamp(p.x, ox + 8, X1 - 8), y: p.y, z: clamp(p.z, oz + 8, Z1 - 8),
  });
  let overviewView: WeaveView;
  {
    // Frame the interchange but keep the whole crop in view by pulling the focus towards its centre.
    const focus = hero
      ? { x: lerp(hero.x, cxw, 0.3), z: lerp(hero.z, czw, 0.3), levelHigh: hero.levelHigh }
      : { x: cxw, z: czw, levelHigh: Math.round(world.terrain(cxw, czw)) + 18 };
    const dist = Math.min(width, depth) * 0.42;
    const pos = clampIn({ x: focus.x - sunX * dist * 0.9 + sunZ * dist * 0.35, y: focus.levelHigh + Math.min(width, depth) * 0.2 + 24, z: focus.z - sunZ * dist * 0.9 - sunX * dist * 0.35 });
    overviewView = {
      position: local(pos),
      target: local({ x: focus.x + sunX * 30, y: focus.levelHigh - 6, z: focus.z + sunZ * 30 }),
    };
  }
  const landmarkViews: (WeaveView & { label: string })[] = [];
  if (hero) {
    const ramp = hero.ramps[0];
    const mid = ramp.pts[Math.floor(ramp.pts.length * 0.55)];
    landmarkViews.push({
      label: `${hero.kind} ${hero.id}`,
      position: local(clampIn({ x: hero.x + 70, y: hero.levelHigh + 10, z: hero.z + 85 })),
      target: local({ x: mid.x, y: mid.h, z: mid.z }),
    });
  }
  // Tunnel portal close-up.
  portal: for (let di = 0; di < decks.length; di++) {
    const d = decks[di];
    const mode = modes[di];
    for (let k = 1; k < d.pts.length; k++) {
      if (mode[k] === MODE_TUNNEL && mode[k - 1] !== MODE_TUNNEL) {
        const p = d.pts[k];
        if (!inside(p.x, p.z, 30)) continue;
        // Stand back over the open approach (lower k is daylight) and look into the portal.
        landmarkViews.push({
          label: `tunnel portal ${d.id}`,
          position: local(clampIn({ x: p.x - p.tx * 42 - p.tz * 14, y: p.h + 20, z: p.z - p.tz * 42 + p.tx * 14 })),
          target: local({ x: p.x, y: p.h + 4, z: p.z }),
        });
        break portal;
      }
    }
  }
  const tubeSpan = spans.find(sp => sp.kind === 'tube' && sp.pts.some(p => inside(p.x, p.z, 40)));
  if (tubeSpan) {
    const p = tubeSpan.pts.reduce((best, q) => (Math.hypot(q.x - cxw, q.z - czw) < Math.hypot(best.x - cxw, best.z - czw) ? q : best));
    const side = Math.hypot(p.x - p.tz * 40 - cxw, p.z + p.tx * 40 - czw) < Math.hypot(p.x + p.tz * 40 - cxw, p.z - p.tx * 40 - czw) ? 1 : -1;
    landmarkViews.push({
      label: `glass tube ${tubeSpan.id}`,
      position: local(clampIn({ x: p.x - p.tx * 24 - p.tz * 22 * side, y: p.h + 5.5, z: p.z - p.tz * 24 + p.tx * 22 * side })),
      target: local({ x: p.x + p.tx * 18, y: p.h - 1.5, z: p.z + p.tz * 18 }),
    });
  }
  const diamondSeg = plan.segments.find(sg => sg.diamonds.length && sg.diamondAt && inside(sg.deck.pts[Math.round(sg.diamondAt.s)].x, sg.deck.pts[Math.round(sg.diamondAt.s)].z, 30));
  if (diamondSeg && diamondSeg.diamondAt) {
    const p = diamondSeg.deck.pts[Math.round(diamondSeg.diamondAt.s)];
    landmarkViews.push({
      label: `diamond ${diamondSeg.id}`,
      position: local(clampIn({ x: p.x - p.tz * 60 + p.tx * 40, y: p.h + 22, z: p.z + p.tx * 60 + p.tz * 40 })),
      target: local({ x: p.x, y: p.h - 3, z: p.z }),
    });
  }
  const tubeSpans = spans.filter(sp => sp.kind === 'tube');
  const clearOfTubes = (p: WeavePoint) => {
    for (const sp of tubeSpans) {
      for (let k = 0; k < sp.pts.length; k += 2) {
        const q = sp.pts[k];
        if (Math.hypot(p.x - q.x, p.y - q.h, p.z - q.z) < TUBE_R + 14) return false;
      }
    }
    return true;
  };
  const notable = buildings
    .filter(b => (b.family === 1 || b.family === 2 || b.family === 6) && inside(b.x, b.z, 24))
    .sort((a, b) => b.height - a.height);
  for (const t of notable.slice(0, 2)) {
    const candidates: WeavePoint[] = [
      clampIn({ x: t.x - 46, y: t.base + t.height * 0.55, z: t.z + 56 }),
      clampIn({ x: t.x + 52, y: t.base + t.height * 0.58, z: t.z + 48 }),
      clampIn({ x: t.x - 52, y: t.base + t.height * 0.58, z: t.z - 48 }),
      clampIn({ x: t.x + 46, y: t.base + t.height * 0.65, z: t.z - 56 }),
    ];
    const camPos = candidates.find(clearOfTubes) ?? clampIn({ x: t.x - 46, y: Math.min(ceiling - 8, t.base + t.height * 0.85), z: t.z + 56 });
    landmarkViews.push({
      label: `${WEAVE_FAMILIES[t.family]} ${t.id}`,
      position: local(camPos),
      target: local({ x: t.x, y: t.base + t.height * 0.5, z: t.z }),
    });
  }
  const dome = buildings.find(b => b.family === 4 && inside(b.x, b.z, 24));
  if (dome) {
    landmarkViews.push({
      label: `biodome ${dome.id}`,
      position: local({ x: dome.x - 26, y: dome.base + 18, z: dome.z + 30 }),
      target: local({ x: dome.x, y: dome.base + 6, z: dome.z }),
    });
  }
  let deckView: WeaveView | null = null;
  // Rooftop deck with an unobstructed sight line to the interchange.
  const lookAt = hero ? { x: hero.x, y: hero.levelHigh, z: hero.z } : { x: cxw, y: terrainAt(cxw, czw) + 12, z: czw };
  const sightClear = (host: WeaveBuilding) => {
    const y0 = host.base + host.height + 3;
    for (let t = 0.05; t <= 0.95; t += 0.03) {
      const x = lerp(host.x, lookAt.x, t), z = lerp(host.z, lookAt.z, t), y = lerp(y0, lookAt.y, t);
      if (Math.hypot(x - host.x, z - host.z) < host.radius + 2) continue;
      for (const o of buildings) {
        if (o === host) continue;
        if (Math.hypot(o.x - x, o.z - z) < o.radius + 3 && o.base + o.height + 2 > y) return false;
      }
      if (terrainAt(x, z) + 2 > y) return false;
    }
    return true;
  };
  const deckHost = buildings
    .filter(b => (b.family === 0 || b.family === 5 || b.family === 7) && inside(b.x, b.z, b.radius + 8) && b.base + b.height + 5 < ceiling)
    .sort((a, b) => Math.hypot(a.x - lookAt.x, a.z - lookAt.z) - Math.hypot(b.x - lookAt.x, b.z - lookAt.z))
    .find(b => Math.hypot(b.x - lookAt.x, b.z - lookAt.z) > 60 && sightClear(b));
  if (deckHost) {
    const px = Math.floor(deckHost.x), pz = Math.floor(deckHost.z);
    let top = -1;
    for (let y = ceiling - 1; y >= 0; y--) if (isOpaque(get(px - ox, y, pz - oz))) { top = y; break; }
    if (top > 0) {
      deckView = { position: local({ x: px + 0.5, y: top + 2.7, z: pz + 0.5 }), target: local(lookAt) };
    }
  }

  const tunnelPortals = decks.reduce((acc, d, di) => {
    const mode = modes[di];
    for (let k = 1; k < d.pts.length; k++) {
      if ((mode[k] === MODE_TUNNEL) !== (mode[k - 1] === MODE_TUNNEL) && near(d.pts[k].x, d.pts[k].z, 0)) acc++;
    }
    return acc;
  }, 0);

  return {
    voxels,
    heights,
    width,
    depth,
    standardCount,
    translucentCount,
    emissiveCount,
    decks: decks.filter(d => d.maxX >= ox && d.minX <= X1 && d.maxZ >= oz && d.minZ <= Z1),
    interchanges: plan.interchanges.filter(ic => near(ic.x, ic.z, 160)),
    spans: spans.filter(sp => sp.pts.some(p => near(p.x, p.z, 8))),
    pylons: pylons.filter(p => near(p.x, p.z, 10)),
    buildings: buildings.filter(b => near(b.x, b.z, b.radius)),
    parks: parks.filter(p => near(p.x, p.z, p.r)),
    tunnelPortals,
    overviewView,
    landmarkViews,
    deckView,
  };
}
