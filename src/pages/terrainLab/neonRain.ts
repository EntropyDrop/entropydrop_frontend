/** Irregular neon city built exclusively from 1m / 0.125m cubes.
 * Coordinates are world-anchored; material is always normal or emissive.
 * X/Z identify cube centres, Y identifies its bottom. No textures are required. */
export interface NeonRainConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  rainHeight: number;
  rainLotSize: number;
  rainWindows: number;
  rainSigns: number;
  rainBridges: number;
  rainTraffic: number;
  rainAmount: number;
  rainGlow: number;
}

export const NEON_RAIN_DEFAULTS = {
  rainHeight: 112, rainLotSize: 23, rainWindows: 0.6, rainSigns: 0.7,
  rainBridges: 0.55, rainTraffic: 0.55, rainAmount: 0.3, rainGlow: 0.65,
};

export interface RainVoxel {
  x: number; y: number; z: number;
  sizeX: 1 | 0.125; sizeY: 1 | 0.125; sizeZ: 1 | 0.125;
  color: number;
  material: 'normal' | 'emissive';
  emissive: boolean;
  intensity: number;
}

interface Rect { x: number; z: number; w: number; d: number }
interface Section extends Rect { bottom: number; top: number }
interface Tower extends Rect { height: number; family: number; sections: Section[] }
interface Lane extends Rect { alongX: boolean }

const MICRO = 0.125;
const COLORS = {
  road: 0x101b2c, pavement: 0x253449, frame: 0x405873, roof: 0x253c56,
  dark: 0x081222, glass: 0x1c3f5b, steel: 0x516780,
  cyan: 0x38ddff, blue: 0x367ccc, pink: 0xf550c8, amber: 0xffb268,
};
const WALLS = [0x27384f, 0x243e54, 0x313c59, 0x20354b, 0x3a3b51, 0x2d4055];
const WORDS = ['NOVA', 'GRID', 'BYTE', 'RAM', 'VOID', 'DATA', '雨', '光', '夜'];
const GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  D: ['110', '101', '101', '101', '110'], G: ['111', '100', '101', '101', '111'],
  I: ['111', '010', '010', '010', '111'], M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['1001', '1101', '1011', '1001', '1001'], O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'], T: ['111', '010', '010', '010', '010'],
  V: ['101', '101', '101', '101', '010'], Y: ['101', '101', '010', '010', '010'],
  E: ['111', '100', '110', '100', '111'],
  '雨': ['1111111', '0001000', '1111111', '1001001', '1101011', '1001001', '1101011'],
  '光': ['0001000', '0101010', '0011100', '1111111', '0010100', '0100101', '1000111'],
  '夜': ['0001000', '1111111', '0010100', '0111110', '1010010', '0011100', '0010011'],
};

function hash(x: number, z: number, salt: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt, 1442695041) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function generateNeonRain(config: NeonRainConfig) {
  const width = Math.max(1, Math.floor(config.sizeX)), depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff)));
  const ox = Math.floor(config.offsetX - width / 2), oz = Math.floor(config.offsetZ - depth / 2);
  const seed = Math.floor(config.seed), maxHeight = Math.max(32, Math.floor(config.rainHeight));
  const lotSize = Math.max(16, Math.min(32, config.rainLotSize));
  const windows = clamp01(config.rainWindows), signs = clamp01(config.rainSigns);
  const bridgeDensity = clamp01(config.rainBridges), traffic = clamp01(config.rainTraffic);
  const rain = clamp01(config.rainAmount);
  const layer = width * depth;
  const cells = new Uint8Array(layer * ceiling);
  const heights = new Float32Array(layer);
  const voxels: RainVoxel[] = [];
  const microVoxels = new Map<number, RainVoxel>();
  const palette = [{ color: 0, emissive: false }];
  const colorIds = new Map<number, number>();
  const lots: Rect[] = [], lanes: Lane[] = [], towers: Tower[] = [];
  const bridges: { from: Section; to: Section; level: number; alongX: boolean; cross: number }[] = [];
  const inside = (x: number, y: number, z: number) => x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < ceiling;
  const get = (x: number, y: number, z: number) => inside(x, y, z) ? cells[x + z * width + y * layer] : 0;
  const near = (r: Rect, margin = 0) => r.x < ox + width + margin && r.x + r.w > ox - margin && r.z < oz + depth + margin && r.z + r.d > oz - margin;

  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, emissive = false) => {
    const x0 = Math.max(0, Math.floor(x - ox)), x1 = Math.min(width, Math.floor(x + w - ox));
    const z0 = Math.max(0, Math.floor(z - oz)), z1 = Math.min(depth, Math.floor(z + d - oz));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(ceiling, Math.floor(y + h));
    if (x0 >= x1 || z0 >= z1 || y0 >= y1) return;
    const key = color + (emissive ? 0x1000000 : 0);
    let id = colorIds.get(key);
    if (id === undefined) { id = palette.length; colorIds.set(key, id); palette.push({ color, emissive }); }
    for (let iy = y0; iy < y1; iy++) for (let iz = z0; iz < z1; iz++) cells.fill(id, x0 + iz * width + iy * layer, x1 + iz * width + iy * layer);
  };
  const micro = (x: number, y: number, z: number, color: number, intensity = 0) => {
    // Quantization keeps cable bends, rain streaks and lettering on one lattice.
    x = Math.round(x * 8) / 8; y = Math.round(y * 8) / 8; z = Math.round(z * 8) / 8;
    if (x < ox || x + MICRO > ox + width || z < oz || z + MICRO > oz + depth || y < 0 || y + MICRO > ceiling) return;
    const key = (x - ox) * 8 + (z - oz) * 8 * width * 8 + y * 8 * layer * 64;
    microVoxels.set(key, { x: x + MICRO / 2 - ox - width / 2, y, z: z + MICRO / 2 - oz - depth / 2,
      sizeX: MICRO, sizeY: MICRO, sizeZ: MICRO, color,
      material: intensity > 0 ? 'emissive' : 'normal', emissive: intensity > 0, intensity });
  };
  const detailBox = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, intensity = 0) => {
    if (!near({ x, z, w, d }) || y >= ceiling) return;
    for (let iy = 0; iy < h; iy += MICRO) for (let iz = 0; iz < d; iz += MICRO) for (let ix = 0; ix < w; ix += MICRO) {
      if (ix > 0 && ix + MICRO < w && iz > 0 && iz + MICRO < d && iy > 0 && iy + MICRO < h) continue;
      micro(x + ix, y + iy, z + iz, color, intensity);
    }
  };
  const line = (x: number, y: number, z: number, length: number, axis: 'x' | 'y' | 'z', color: number, intensity = 0) => {
    for (let i = 0; i < length; i += MICRO) micro(x + (axis === 'x' ? i : 0), y + (axis === 'y' ? i : 0), z + (axis === 'z' ? i : 0), color, intensity);
  };

  // Pixel lettering and its backing board both consist of micro cubes.
  const sign = (x: number, y: number, z: number, word: string, vertical: boolean, side: boolean, color: number) => {
    const glyphs = [...word].map(letter => GLYPHS[letter]);
    const cols = (vertical ? Math.max(...glyphs.map(g => g[0].length)) : glyphs.reduce((sum, g) => sum + g[0].length + 1, -1)) + 2;
    const rows = (vertical ? glyphs.reduce((sum, g) => sum + g.length + 1, -1) : Math.max(...glyphs.map(g => g.length))) + 2;
    const pixel = 0.25;
    const put = (u: number, v: number, c: number, glow: number, front: boolean) => detailBox(
      x + (side ? (front ? MICRO : 0) : u * pixel), y + v * pixel,
      z + (side ? u * pixel : (front ? MICRO : 0)), side ? MICRO : pixel, pixel, side ? pixel : MICRO, c, glow);
    for (let u = 0; u < cols; u++) for (let v = 0; v < rows; v++) {
      const edge = u === 0 || v === 0 || u === cols - 1 || v === rows - 1;
      put(u, v, edge ? color : COLORS.dark, edge ? 1.5 : 0, false);
    }
    let cursor = 1;
    for (const glyph of glyphs) {
      glyph.forEach((row, gy) => [...row].forEach((bit, gx) => {
        if (bit === '1') put((vertical ? 1 : cursor) + gx, rows - 1 - (vertical ? cursor : 1) - gy, color, 2.5, true);
      }));
      cursor += (vertical ? glyph.length : glyph[0].length) + 1;
    }
  };

  box(ox, 0, oz, width, 1, depth, COLORS.road);
  const split = (r: Rect, level: number) => {
    const random = (salt: number) => hash(r.x, r.z, salt + level * 17, seed);
    const axisX = r.w / r.d > 1.3 || (r.w / r.d > 0.78 && random(1) > 0.5);
    const length = axisX ? r.w : r.d;
    if ((r.w < lotSize * (1.1 + random(2) * 0.4) && r.d < lotSize * (1.1 + random(3) * 0.4)) || length < 30 || level >= 6) { lots.push(r); return; }
    const street = level < 2 ? 8 + Math.floor(random(4) * 4) : 4 + Math.floor(random(4) * 3);
    const cut = Math.max(12, Math.min(length - street - 12, Math.floor(length * (0.32 + random(5) * 0.36))));
    const remainder = length - cut - street;
    if (remainder < 12) { lots.push(r); return; }
    lanes.push({ x: r.x + (axisX ? cut : 0), z: r.z + (axisX ? 0 : cut), w: axisX ? street : r.w, d: axisX ? r.d : street, alongX: !axisX });
    split({ ...r, w: axisX ? cut : r.w, d: axisX ? r.d : cut }, level + 1);
    split({ x: r.x + (axisX ? cut + street : 0), z: r.z + (axisX ? 0 : cut + street), w: axisX ? remainder : r.w, d: axisX ? r.d : remainder }, level + 1);
  };
  // Jittered large districts ensure shared edges without repeating small tiles.
  const region = 176;
  const edge = (i: number, axis: number) => i * region - 88 + Math.floor(hash(i, axis, 160, seed) * 26);
  for (let rx = Math.floor((ox + 88) / region) - 1; rx <= Math.floor((ox + width + 88) / region) + 1; rx++) {
    for (let rz = Math.floor((oz + 88) / region) - 1; rz <= Math.floor((oz + depth + 88) / region) + 1; rz++) {
      const x = edge(rx, 0), z = edge(rz, 1), w = edge(rx + 1, 0) - x, d = edge(rz + 1, 1) - z;
      if (!near({ x, z, w, d }, 96)) continue;
      lanes.push({ x, z, w: 10, d, alongX: false }, { x: x + 10, z, w: w - 10, d: 10, alongX: true });
      split({ x: x + 10, z: z + 10, w: w - 10, d: d - 10 }, 0);
    }
  }

  for (const lot of lots) {
    // Include the neighbours needed by long express bridges across crop edges.
    if (!near(lot, 96)) continue;
    const random = (salt: number) => hash(lot.x, lot.z, salt, seed);
    const family = Math.floor(random(20) * 5), wall = WALLS[Math.floor(random(21) * WALLS.length)];
    const accent = random(22) < 0.68 ? COLORS.cyan : COLORS.pink;
    const x = lot.x + 1, z = lot.z + 1, w = lot.w - 2, d = lot.d - 2;
    const cluster = (Math.sin((x + 33) * 0.031) + Math.cos((z - 16) * 0.039)) * 0.12;
    const height = Math.max(20, Math.floor(maxHeight * (0.4 + random(23) * 0.45 + cluster)));
    const podium = 5 + Math.floor(random(24) * 5);
    box(lot.x, 1, lot.z, lot.w, 1, lot.d, COLORS.pavement);
    box(x, 2, z, w, podium - 2, d, wall);
    box(x, podium, z, w, 1, d, COLORS.frame);
    // Street-level entrances and shopfront windows are full standard blocks.
    for (let u = 1; u < w - 1; u += 3) {
      box(x + u, 3, z + d - 1, 2, 2, 1, COLORS.dark);
      if (random(25 + u) < 0.45) line(x + u, 5, z + d, 1.5, 'x', COLORS.amber, 1.3);
    }
    const sections: Section[] = [{ x, z, w, d, bottom: 2, top: podium + 1 }];
    const addSection = (r: Rect, bottom: number, top: number) => {
      sections.push({ ...r, bottom, top });
      box(r.x, bottom, r.z, r.w, top - bottom, r.d, wall);
    };
    const shoulder = Math.floor(height * (0.46 + random(26) * 0.18));
    if (family === 0 && w >= 14) {
      const half = Math.floor((w - 3) / 2);
      addSection({ x, z, w: half, d }, podium + 1, height);
      addSection({ x: x + half + 3, z: z + 1, w: w - half - 3, d: d - 2 }, podium + 1, Math.floor(height * 0.8));
      box(x + half, shoulder, z + 2, 3, 2, Math.max(3, d - 4), COLORS.frame);
    } else if (family === 1) {
      addSection({ x, z, w, d }, podium + 1, shoulder);
      addSection({ x: x + Math.floor(w * 0.3), z, w: Math.ceil(w * 0.7), d: Math.max(5, d - 3) }, shoulder, height);
    } else if (family === 2) {
      addSection({ x, z, w, d }, podium + 1, shoulder);
      addSection({ x, z, w: Math.max(5, w - 4), d: Math.max(5, d - 4) }, shoulder, Math.floor(height * 0.84));
      addSection({ x, z: z + 1, w: Math.max(4, w - 7), d: Math.max(4, d - 6) }, Math.floor(height * 0.84), height);
    } else if (family === 3) {
      addSection({ x, z, w, d: Math.max(5, Math.floor(d * 0.56)) }, podium + 1, height);
      addSection({ x, z: z + Math.max(5, Math.floor(d * 0.56)), w: Math.max(5, Math.floor(w * 0.54)), d: d - Math.max(5, Math.floor(d * 0.56)) }, podium + 1, Math.floor(height * 0.71));
    } else {
      addSection({ x, z, w, d }, podium + 1, height);
    }

    const floors = 3 + Math.floor(random(27) * 2), bay = 2 + Math.floor(random(28) * 3);
    for (const section of sections.slice(1)) {
      const { x: sx, z: sz, w: sw, d: sd, bottom, top } = section;
      for (let face = 0; face < 4; face++) {
        const side = face >= 2, far = face % 2 === 1, length = side ? sd : sw;
        const put = (u: number, y: number, span: number, high: number, color: number) => box(
          side ? sx + (far ? sw - 1 : 0) : sx + u, y,
          side ? sz + u : sz + (far ? sd - 1 : 0), side ? 1 : span, high, side ? span : 1, color);
        for (let u = 0; u < length; u += bay + 3) put(u, bottom, 1, top - bottom, COLORS.frame);
        for (let y = bottom + 1; y < top - 1; y += floors) {
          if ((y - bottom - 1) % (floors * (3 + family % 2)) === 0) put(0, y - 1, length, 1, COLORS.frame);
          for (let u = 1; u < length - 1; u += bay) {
            put(u, y, Math.min(bay - 1, length - 1 - u), Math.min(floors - 1, top - y), COLORS.dark);
            const h = hash(sx + u, sz + face, y + 70, seed);
            if (h > windows) continue;
            const color = h < windows * 0.68 ? COLORS.cyan : h < windows * 0.9 ? COLORS.blue : h < windows * 0.96 ? COLORS.pink : COLORS.amber;
            const panelW = family === 4 ? 0.5 : 0.25, panelH = family === 1 ? 0.5 : 0.375;
            const mx = side ? sx + (far ? sw : -MICRO) : sx + u + 0.25;
            const mz = side ? sz + u + 0.25 : sz + (far ? sd : -MICRO);
            detailBox(mx, y + 0.5, mz, side ? MICRO : panelW, panelH, side ? panelW : MICRO, color, 0.9 + h);
            if (bay > 2) detailBox(mx + (side ? 0 : 0.875), y + 0.5, mz + (side ? 0.875 : 0), side ? MICRO : 0.25, 0.25, side ? 0.25 : MICRO, color, 0.8);
          }
        }
      }
      box(sx, top, sz, sw, 1, sd, COLORS.roof);
      if (random(30 + top) < 0.48) line(sx, top + 1, sz + sd - MICRO, sw, 'x', accent, 1.3);
      // Different mechanical crowns: offset stacks, antenna frames and beacon cubes.
      const ex = sx + 1, ez = sz + 1;
      box(ex, top + 1, ez, Math.min(3, sw - 2), 2 + family % 2, Math.min(3, sd - 2), COLORS.steel);
      if (random(31 + top) < 0.7) {
        line(ex + 0.5, top + 3, ez + 0.5, 3 + random(32 + top) * 4, 'y', COLORS.steel);
        if (random(39 + top) < 0.3) box(sx + sw - 2, top + 1, sz + sd - 2, 1, 1, 1, accent, true);
      }
      if (random(33 + top) < signs) {
        const word = WORDS[Math.floor(random(34 + top) * WORDS.length)];
        const signY = Math.max(bottom + 2, Math.min(top - 9, Math.floor((bottom + top) / 2)));
        sign(sx + sw - 2, signY, sz + sd, word, true, false, random(35 + top) < 0.6 ? COLORS.pink : COLORS.cyan);
        if (sw > 10 && random(36 + top) < signs * 0.5) sign(sx + 1, bottom + 2, sz + sd, WORDS[Math.floor(random(37 + top) * 6)], false, false, COLORS.cyan);
      }
      if (sd > 10 && random(38 + top) < signs * 0.6) sign(sx + sw, bottom + 4, sz + 2,
        WORDS[Math.floor(random(40 + top) * WORDS.length)], true, true,
        random(41 + top) < 0.25 ? COLORS.amber : random(41 + top) < 0.65 ? COLORS.pink : COLORS.cyan);
    }
    towers.push({ x, z, w, d, height, family, sections });
  }

  for (const lane of lanes) {
    if (!near(lane)) continue;
    const { x, z, w, d, alongX } = lane;
    const length = alongX ? w : d, breadth = alongX ? d : w;
    // Thin circuit lines only occupy real roads; every segment has its own phase.
    for (let u = 0.5; u < breadth; u += breadth >= 8 ? 3 : breadth - 1) line(x + (alongX ? 0 : u), 1, z + (alongX ? u : 0), length, alongX ? 'x' : 'z', COLORS.cyan, 0.6);
    if (breadth >= 8) {
      for (let t = 1 + Math.floor(hash(x, z, 100, seed) * 4); t < length; t += 5) line(x + (alongX ? t : 0.5), 1, z + (alongX ? 0.5 : t), breadth - 1, alongX ? 'z' : 'x', COLORS.blue, 0.75);
      for (let t = 2; t < Math.min(6, length); t += 0.5) line(x + (alongX ? t : 1), 1, z + (alongX ? 1 : t), breadth - 2, alongX ? 'z' : 'x', COLORS.cyan, 1);
    }
    for (let t = 6; t < length - 5; t += 13) {
      const r = hash(x, z, 110 + t, seed);
      if (r >= traffic) continue;
      const cross = Math.max(1, Math.floor(breadth / 2) - 1);
      const cx = x + (alongX ? t : cross), cz = z + (alongX ? cross : t);
      const carY = r < traffic * 0.18 ? 13 + Math.floor(r * 87) : 1;
      box(cx, carY, cz, alongX ? 4 : 2, 1, alongX ? 2 : 4, r < traffic * 0.5 ? COLORS.steel : WALLS[4]);
      box(cx + (alongX ? 1 : 0), carY + 1, cz + (alongX ? 0 : 1), 2, 1, 2, COLORS.glass);
      for (const side of [0.25, 1.5]) {
        detailBox(cx + (alongX ? 4 : side), carY + 0.375, cz + (alongX ? side : 4), alongX ? MICRO : 0.25, 0.25, alongX ? 0.25 : MICRO, COLORS.cyan, 2.3);
        micro(cx + (alongX ? -MICRO : side), carY + 0.375, cz + (alongX ? side : -MICRO), COLORS.pink, 2);
      }
    }
  }

  // Bridges attach to real occupied sections at independently chosen heights.
  for (const a of towers) {
    const alongX = hash(a.x, a.z, 120, seed) > 0.5;
    const express = hash(a.x, a.z, 119, seed) < 0.2;
    let neighbour: Tower | undefined, distance = express ? 64 : 25;
    for (const b of towers) {
      const gap = alongX ? b.x - a.x - a.w : b.z - a.z - a.d;
      const overlap = alongX ? Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (gap >= (express ? 28 : 3) && gap < distance && overlap >= 4) { neighbour = b; distance = gap; }
    }
    if (!neighbour) continue;
    for (let tier = 0; tier < 3; tier++) {
      if (hash(a.x, a.z, 121 + tier, seed) > bridgeDensity) continue;
      const level = Math.floor(Math.min(a.height, neighbour.height) * (0.22 + tier * 0.23 + hash(a.x, a.z, 125 + tier, seed) * 0.06));
      const from = a.sections.find(s => level >= s.bottom && level + 2 < s.top);
      const to = neighbour.sections.find(s => level >= s.bottom && level + 2 < s.top);
      if (!from || !to) continue;
      const low = alongX ? Math.max(from.z, to.z) : Math.max(from.x, to.x);
      const high = alongX ? Math.min(from.z + from.d, to.z + to.d) : Math.min(from.x + from.w, to.x + to.w);
      if (high - low < 3) continue;
      const cross = Math.floor((low + high - 3) / 2);
      const bx = alongX ? from.x + from.w : cross, bz = alongX ? cross : from.z + from.d;
      const run = alongX ? to.x - bx : to.z - bz;
      if (run < 1) continue;
      box(bx, level, bz, alongX ? run : 3, 1, alongX ? 3 : run, COLORS.frame);
      for (const edge of [0, 2.875]) line(bx + (alongX ? 0 : edge), level + 1, bz + (alongX ? edge : 0), run, alongX ? 'x' : 'z', tier === 1 ? COLORS.pink : COLORS.cyan, 1.5);
      // Two hanging cable bundles, snapped to the micro grid.
      for (const side of [0.25, 2.5]) for (let t = 0; t < run; t += MICRO) {
        const y = level - MICRO - Math.sin(Math.PI * t / run) * Math.min(4, run * 0.25);
        micro(bx + (alongX ? t : side), y, bz + (alongX ? side : t), COLORS.dark);
      }
      bridges.push({ from, to, level, alongX, cross });
    }
  }

  // Sparse voxel rain has deterministic world positions and obeys slicing too.
  for (let rx = Math.floor(ox / 8) - 1; rx <= Math.floor((ox + width) / 8); rx++) {
    for (let rz = Math.floor(oz / 8) - 1; rz <= Math.floor((oz + depth) / 8); rz++) {
      if (hash(rx, rz, 140, seed) > rain) continue;
      const x = rx * 8 + hash(rx, rz, 141, seed) * 6, z = rz * 8 + hash(rx, rz, 142, seed) * 6;
      const y = 8 + hash(rx, rz, 143, seed) * maxHeight;
      for (let t = 0; t < 8; t++) micro(x + Math.floor(t / 3) * MICRO, y + t * MICRO, z, COLORS.steel);
    }
  }

  let standardCount = 0, emissiveCount = 0;
  for (let y = 0; y < ceiling; y++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const id = get(x, y, z);
    if (!id) continue;
    heights[x + z * width] = y + 1;
    if (get(x - 1, y, z) && get(x + 1, y, z) && get(x, y - 1, z) && get(x, y + 1, z) && get(x, y, z - 1) && get(x, y, z + 1)) continue;
    const { color, emissive } = palette[id];
    voxels.push({ x: x + 0.5 - width / 2, y, z: z + 0.5 - depth / 2, sizeX: 1, sizeY: 1, sizeZ: 1,
      color, material: emissive ? 'emissive' : 'normal', emissive, intensity: emissive ? 1.7 : 0 });
    standardCount++;
    if (emissive) emissiveCount++;
  }
  for (const cube of microVoxels.values()) {
    const x = Math.floor(cube.x + width / 2), z = Math.floor(cube.z + depth / 2);
    if (get(x, Math.floor(cube.y), z)) continue;
    voxels.push(cube);
    heights[x + z * width] = Math.max(heights[x + z * width], cube.y + MICRO);
    if (cube.emissive) emissiveCount++;
  }
  return { voxels, heights, width, depth, standardCount, emissiveCount, towers, bridges };
}
