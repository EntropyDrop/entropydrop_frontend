/** Deterministic, world-anchored city grammar. Geometry uses 1m and 1/4m cubes. */
export interface NexusConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  offsetX: number;
  offsetZ: number;
  yCutoff: number;
  seed: number;
  nexusPitch: number;
  nexusHeight: number;
  nexusDetail: number;
  nexusWindows: number;
  nexusBridges: number;
  nexusGlow: number;
}

export interface NexusVoxel {
  x: number;
  y: number;
  z: number;
  color: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  emissive?: boolean;
  intensity?: number;
}

export const NEXUS_DEFAULTS = {
  nexusPitch: 28,
  nexusHeight: 76,
  nexusDetail: 0.75,
  nexusWindows: 0.6,
  nexusBridges: 3,
  nexusGlow: 0.5,
};

function hash(x: number, y: number, z: number, seed: number): number {
  // Integer avalanche, independent of iteration order or preview bounds.
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const C = {
  asphalt: 0x101c30, podium: 0x24364b, wall: 0x30465e, panel: 0x38536c,
  frame: 0x526a80, roof: 0x243a50, equipment: 0x596d80, dark: 0x080e19,
  cyan: 0x39cfea, blue: 0x4c8fc4, pink: 0xec4aab, amber: 0xffaf65,
};

// Tiny pixel lettering, built from micro cubes rather than textures or planes.
const GLYPHS: Record<string, string[]> = {
  N: ['1001', '1101', '1101', '1011', '1001'],
  E: ['1111', '1000', '1110', '1000', '1111'],
  X: ['1001', '0110', '0110', '0110', '1001'],
  U: ['1001', '1001', '1001', '1001', '1111'],
  S: ['1111', '1000', '1111', '0001', '1111'],
  G: ['1111', '1000', '1011', '1001', '1111'],
  R: ['1110', '1001', '1110', '1010', '1001'],
  I: ['111', '010', '010', '010', '111'],
  D: ['1110', '1001', '1001', '1001', '1110'],
  '0': ['111', '101', '101', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
};

export function generateNeonNexus(config: NexusConfig): {
  voxels: NexusVoxel[];
  heights: Float32Array;
  width: number;
  depth: number;
} {
  const width = Math.max(1, Math.floor(config.sizeX));
  const depth = Math.max(1, Math.floor(config.sizeZ));
  const ceiling = Math.max(1, Math.floor(Math.min(config.sizeY, config.yCutoff)));
  const originX = Math.floor(config.offsetX - width / 2);
  const originZ = Math.floor(config.offsetZ - depth / 2);
  const pitch = Math.max(24, Math.round(config.nexusPitch / 2) * 2);
  const maxHeight = Math.max(20, Math.floor(config.nexusHeight));
  const seed = Math.floor(config.seed);
  const detail = Math.max(0, Math.min(1, config.nexusDetail));
  const lights = Math.max(0, Math.min(1, config.nexusWindows));
  const voxels: NexusVoxel[] = [];
  const heights = new Float32Array(width * depth);
  const cells = new Uint8Array(width * depth * ceiling);
  const layer = width * depth;
  const palette = [0, C.asphalt, C.podium, C.wall, C.panel, C.frame, C.roof, C.equipment];

  const inside = (x: number, y: number, z: number) =>
    x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < ceiling;
  const get = (x: number, y: number, z: number) => inside(x, y, z) ? cells[x + z * width + y * layer] : 0;

  // Stamp solids first, then cull all six hidden sides when producing the shell.
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: number) => {
    const x0 = Math.max(0, Math.floor(x - originX));
    const z0 = Math.max(0, Math.floor(z - originZ));
    const x1 = Math.min(width, Math.floor(x + sx - originX));
    const z1 = Math.min(depth, Math.floor(z + sz - originZ));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(ceiling, Math.floor(y + sy));
    if (x1 <= x0 || z1 <= z0 || y1 <= y0) return;
    for (let iy = y0; iy < y1; iy++) {
      for (let iz = z0; iz < z1; iz++) {
        cells.fill(material, x0 + iz * width + iy * layer, x1 + iz * width + iy * layer);
      }
    }
  };

  const cube = (x: number, y: number, z: number, size: number, color: number, intensity = 0) => {
    // Clip whole detail cubes: slicing never leaves floating details above the cut.
    if (x - size / 2 < originX || x + size / 2 > originX + width ||
        z - size / 2 < originZ || z + size / 2 > originZ + depth || y < 0 || y + size > ceiling) return;
    voxels.push({ x: x - originX - width / 2, y, z: z - originZ - depth / 2,
      sizeX: size, sizeY: size, sizeZ: size, color, emissive: intensity > 0, intensity });
    const column = Math.floor(x - originX) + Math.floor(z - originZ) * width;
    heights[column] = Math.max(heights[column], y + size);
  };

  const line = (a: number[], b: number[], size: number, color: number, intensity = 0) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(length / size));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      cube(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t, size, color, intensity);
    }
  };

  const sign = (x: number, y: number, z: number, word: string, color: number, vertical: boolean, side: boolean) => {
    const pixel = 0.25;
    const columns = vertical ? 6 : word.length * 5 + 1;
    const rows = vertical ? word.length * 7 + 1 : 7;
    const put = (u: number, v: number, c: number, glow = 0, front = false) => {
      cube(x + (side ? (front ? 0.26 : 0) : u * pixel), y + v * pixel,
        z + (side ? u * pixel : (front ? 0.26 : 0)), pixel, c, glow);
    };
    for (let u = 0; u < columns; u++) {
      for (let v = 0; v < rows; v++) {
        const border = u === 0 || v === 0 || u === columns - 1 || v === rows - 1;
        put(u, v, border ? color : C.dark, border ? 1.7 : 0);
      }
    }
    [...word].forEach((letter, index) => {
      const glyph = GLYPHS[letter] ?? GLYPHS.N;
      glyph.forEach((row, gy) => [...row].forEach((bit, gx) => {
        if (bit === '1') put(1 + gx + (vertical ? 0 : index * 5),
          rows - 2 - gy - (vertical ? index * 7 : 0), color, 2.4, true);
      }));
    });
  };

  box(originX, 0, originZ, width, 1, depth, 1);
  const firstX = Math.floor(originX / pitch) - 1;
  const lastX = Math.floor((originX + width) / pitch);
  const firstZ = Math.floor(originZ / pitch) - 1;
  const lastZ = Math.floor((originZ + depth) / pitch);
  for (let tx = firstX; tx <= lastX; tx++) {
    for (let tz = firstZ; tz <= lastZ; tz++) {
      const bx = tx * pitch;
      const bz = tz * pitch;
      const lot = pitch - 8;
      const span = Math.floor((lot - 2) / 2);
      const district = hash(tx, 0, tz, seed);
      const podiumHeight = district > 0.55 ? 5 : 3;
      box(bx + 4, 1, bz + 4, lot, podiumHeight, lot, 2);
      box(bx + 3, podiumHeight + 1, bz + 3, lot + 2, 1, lot + 2, 5);

      // Four packed towers with offset crowns and different proportions per street tile.
      for (let sx = 0; sx < 2; sx++) {
        for (let sz = 0; sz < 2; sz++) {
          const r = hash(tx * 2 + sx, 1, tz * 2 + sz, seed);
          const x = bx + 4 + sx * (span + 2);
          const z = bz + 4 + sz * (span + 2);
          const h = Math.floor(maxHeight * (0.36 + r * 0.61));
          const w = span - (r > 0.66 ? 1 : 0);
          const d = span - (r < 0.25 ? 1 : 0);
          const shoulder = Math.floor(h * 0.66);
          const crown = Math.floor(h * 0.86);
          box(x, podiumHeight + 2, z, w, shoulder - podiumHeight - 2, d, 3);
          box(x + (sx ? 1 : 0), shoulder, z + (sz ? 1 : 0), w - 1, crown - shoulder, d - 1, 4);
          box(x + 1, crown, z + 1, Math.max(3, w - 3), h - crown, Math.max(3, d - 3), 3);

          // Offset service annexes and projecting machinery rooms break the tower silhouette.
          if (r > 0.45) {
            box(x - 1, 9, z + 2, 3, Math.floor(h * 0.38), Math.max(3, d - 3), 4);
            box(x + w - 2, shoulder - 5, z + 1, 3, 4, Math.max(3, d - 2), 2);
          }

          // Deep mechanical collars and narrow vertical buttresses, all dark steel.
          for (let level = 8; level < shoulder; level += 8) {
            box(x - 1, level, z - 1, w + 2, 1, d + 2, 5);
            if (level % 16 === 0) box(x, level + 1, z, w, 1, d, 2);
          }
          for (const dx of [0, w - 1]) for (const dz of [0, d - 1]) {
            box(x + dx, podiumHeight + 2, z + dz, 1, shoulder - podiumHeight - 2, 1, 5);
          }
          box(x + 1, h, z + 1, Math.max(3, w - 3), 1, Math.max(3, d - 3), 6);
          box(x + 2, h + 1, z + 2, 2, 2, 2, 7);
          if (r > 0.5) box(x + 3, h + 1, z + 4, 1, 3, 2, 7);
          line([x + 2.5, h + 3, z + 2.5], [x + 2.5, h + 6, z + 2.5], 0.25, C.frame);
          cube(x + 2.5, h + 6, z + 2.5, 0.25, C.pink, 3);
          if (r < detail) {
            // Rooftop vents on both setback terraces.
            for (let vent = 0; vent < 4; vent++) {
              cube(x + 0.5 + vent * 0.5, shoulder, z + d - 0.5, 0.5, C.equipment);
              cube(x + 0.5 + vent * 0.5, shoulder + 0.5, z + d - 0.5, 0.25, C.dark);
            }
          }

          if (detail > 0.15 && r < detail + 0.15) {
            const signY = Math.max(7, Math.floor(shoulder * 0.55));
            sign(x + w + 0.2, signY, z + 1, r > 0.5 ? 'NEXUS' : 'GRID',
              r > 0.35 ? C.pink : C.amber, true, true);
            sign(x + 1, Math.min(shoulder - 2, 15), z + d + 0.2, r > 0.4 ? 'NEXUS' : 'GRID', C.cyan, false, false);
          }
        }
      }

      // District transfer halls connect the lower towers into a single bulky arcology.
      box(bx + 4, 10, bz + 4, lot, 3, 3, 2);
      box(bx + 4, 10, bz + 4, 3, 3, lot, 2);
      if (district < detail) {
        sign(bx + 8, 10.2, bz + 7.2, 'NEXUS', district > 0.5 ? C.amber : C.pink, false, false);
      }

      // Repeating elevated transport rings with cross-street spans at shared levels.
      for (let tier = 0; tier < config.nexusBridges; tier++) {
        const y = 16 + tier * 19;
        if (y + 3 >= maxHeight) continue;
        const railColor = tier % 2 ? C.pink : C.cyan;
        box(bx + 4, 1, bz + 4, 2, y + 2, 2, 5);
        // Continuous streets in X/Z: terminals overlap the neighboring district's deck.
        box(bx, y, bz + 3, pitch, 2, 3, 2);
        box(bx + 3, y, bz, 3, 2, pitch, 2);
        box(bx, y - 1, bz + 4, pitch, 1, 1, 5);
        box(bx + 4, y - 1, bz, 1, 1, pitch, 5);
        for (const lane of [3.15, 5.85]) {
          line([bx, y + 2.05, bz + lane], [bx + pitch, y + 2.05, bz + lane], 0.25, railColor, 0.9);
          line([bx + lane, y + 2.05, bz], [bx + lane, y + 2.05, bz + pitch], 0.25, C.cyan, 0.9);
        }
        // Drooping utility conduits hang beneath road canyons.
        if (detail > 0.4) {
          for (let t = 0; t <= 32; t++) {
            const fraction = t / 32;
            const cableY = y - 1 - Math.sin(fraction * Math.PI) * 2.6;
            cube(bx - 4 + fraction * 8, cableY, bz + 3, 0.25, C.dark);
            cube(bx + 3, cableY, bz - 4 + fraction * 8, 0.25, C.dark);
          }
        }
        if (detail > 0.6 && tier === 0) sign(bx + 8, y - 1, bz + 6.2, 'GRID', C.cyan, false, false);
      }

      // Road grid: micro-width circuit seams, leaving almost all asphalt dark.
      for (let offset = -3; offset <= 3; offset += 3) {
        line([bx + offset, 1.02, bz - 4], [bx + offset, 1.02, bz + pitch - 4], 0.25, C.cyan, 0.7);
        line([bx - 4, 1.02, bz + offset], [bx + pitch - 4, 1.02, bz + offset], 0.25, C.cyan, 0.7);
      }
      for (let t = 0; t < pitch; t += 3) {
        line([bx - 3, 1.02, bz + t], [bx + 3, 1.02, bz + t], 0.25, C.blue, 0.55);
        line([bx + t, 1.02, bz - 3], [bx + t, 1.02, bz + 3], 0.25, C.blue, 0.55);
      }

      // Hover traffic: block-built silhouette, windscreen and tiny navigation lights.
      if (detail > 0.3) {
        const carX = bx + 0.5;
        const carZ = bz + 10 + Math.floor(district * 7);
        const carY = district > 0.5 ? 9 + Math.floor(district * 12) : 1.5;
        for (let u = 0; u < 2; u++) for (let v = 0; v < 5; v++) {
          cube(carX + u * 0.5, carY, carZ + v * 0.5, 0.5, C.frame);
          if (v > 0 && v < 4) cube(carX + u * 0.5, carY + 0.5, carZ + v * 0.5, 0.5, v === 3 ? C.blue : C.dark);
        }
        for (const u of [0, 0.5]) {
          cube(carX + u, carY + 0.1, carZ + 2.4, 0.25, C.cyan, 2);
          cube(carX + u, carY + 0.1, carZ - 0.4, 0.25, C.pink, 2);
        }
      }
    }
  }

  // Exposed shell plus facade micro-geometry. No interior voxel instances.
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < ceiling; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const material = get(x, y, z);
        if (!material) continue;
        const wx = originX + x;
        const wz = originZ + z;
        heights[x + z * width] = Math.max(heights[x + z * width], y + 1);
        const faces = directions.map(([dx, dz]) => !get(x + dx, y, z + dz));
        if (!faces.some(Boolean) && get(x, y - 1, z) && get(x, y + 1, z)) continue;
        const panel = (wx % 3 === 0 || wz % 3 === 0) && material === 3;
        cube(wx + 0.5, y, wz + 0.5, 1, panel ? C.panel : palette[material]);
        if (y < 3 || (material !== 3 && material !== 4)) continue;

        for (let f = 0; f < directions.length; f++) {
          if (!faces[f]) continue;
          const [dx, dz] = directions[f];
          const h = hash(wx, y * 7 + f, wz, seed);
          const along = dx ? wz : wx;
          const faceX = wx + 0.5 + dx * 0.62;
          const faceZ = wz + 0.5 + dz * 0.62;
          // Fine panel framing subdivides each massive facade into repeatable modules.
          if (detail > 0.35 && along % 3 === 0) {
            for (let trim = 0; trim < 4; trim++) cube(faceX, y + trim * 0.25, faceZ, 0.25, C.frame);
          } else if (detail > 0.35 && y % 6 === 0) {
            for (let trim = 0; trim < 4; trim++) cube(faceX - dz * (trim * 0.25 - 0.375),
              y + 0.72, faceZ + dx * (trim * 0.25 - 0.375), 0.25, C.frame);
          }
          // 1/4m recessed window matrix, dark every third floor for facade rhythm.
          if (y % 3 !== 0 && along % 3 !== 0) {
            const lit = h < lights;
            const color = h < lights * 0.77 ? C.cyan : h < lights * 0.94 ? C.blue : C.amber;
            cube(faceX, y + 0.32, faceZ, 0.25, lit ? color : C.dark, lit ? 1.2 : 0);
            if (detail > 0.45) cube(faceX - dz * 0.36, y + 0.32, faceZ + dx * 0.36,
              0.25, lit ? color : C.dark, lit ? 1.2 : 0);
          } else if (h < detail && y % 6 === 0 && along % 3 === 0) {
            // AC units, louvers, maintenance boxes and cabling break the flat facade.
            cube(faceX + dx * 0.15, y + 0.12, faceZ + dz * 0.15, 0.5, C.equipment);
            cube(faceX + dx * 0.43, y + 0.22, faceZ + dz * 0.43, 0.25, C.dark);
          }
        }
      }
    }
  }
  return { voxels, heights, width, depth };
}
