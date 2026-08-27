import { BlockTypes } from './BlockTypes.ts';

/**
 * STL-to-block-body converter.
 *
 * - `parseSTLData` parses binary STL, including VisCAM/SolidView embedded 15-bit
 *   colors, and ASCII STL.
 * - `voxelizeSTL` rasterizes a triangle mesh into blocks:
 *   1. The surface pass samples every triangle at no more than half-cell spacing,
 *      nudging samples inward by ε so boundary-aligned faces do not grow the shell.
 *   2. The interior pass uses +X ray parity at unmarked cell centers, accelerated
 *      by a (y,z) triangle bucket index.
 *   3. The union forms a closed solid normalized so its minimum corner is zero.
 */

export interface STLTriangle {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  normal?: [number, number, number];
  /** Embedded 8-bit RGB color, or null/undefined. */
  color?: number | null;
}

export interface STLVoxelResult {
  /** Block-set entries normalized to a zero minimum corner. */
  blocks: { dx: number; dy: number; dz: number; size: number; block: number; color: number }[];
  /** Grid dimensions in voxels, including padding. */
  size: { sx: number; sy: number; sz: number };
  /** Grid world bounds, including one cell of padding. */
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

export const MAX_STL_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_STL_TRIANGLES = 250000;
const MAX_GRID_CELLS = 16 * 1024 * 1024; // 256^3 limit.
const MAX_OUTPUT_BLOCKS = 200000;
/** Inward normal offset relative to cell size; avoids inflating boundary-aligned meshes. */
const INWARD_OFFSET_RATIO = 1e-3;

// ---------------------------------------------------------------------------
// STL parsing.
// ---------------------------------------------------------------------------

function parseAttributeColor(attr: number): number | null {
  // VisCAM/SolidView: bit 15 enables color; bits 10-14=R, 5-9=G, 0-4=B.
  if (attr === 0 || (attr & 0x8000) === 0) return null;
  const r = (attr >> 10) & 0x1f;
  const g = (attr >> 5) & 0x1f;
  const b = attr & 0x1f;
  return (((r << 3) | (r >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((b << 3) | (b >> 2));
}

function parseBinarySTL(view: DataView, triCount: number): STLTriangle[] {
  if (triCount > MAX_STL_TRIANGLES) {
    throw new Error(`STL has too many triangles (maximum ${MAX_STL_TRIANGLES.toLocaleString('en-US')})`);
  }
  const triangles: STLTriangle[] = [];
  let off = 84;
  for (let i = 0; i < triCount; i++) {
    if (off + 50 > view.byteLength) break;
    const normal: [number, number, number] = [
      view.getFloat32(off, true),
      view.getFloat32(off + 4, true),
      view.getFloat32(off + 8, true)
    ];
    const verts: [number, number, number][] = [];
    for (let j = 0; j < 3; j++) {
      const base = off + 12 + j * 12;
      verts.push([
        view.getFloat32(base, true),
        view.getFloat32(base + 4, true),
        view.getFloat32(base + 8, true)
      ]);
    }
    const color = parseAttributeColor(view.getUint16(off + 48, true));
    triangles.push({ a: verts[0], b: verts[1], c: verts[2], normal, color });
    off += 50;
  }
  return triangles;
}

function parseAsciiSTL(text: string): STLTriangle[] {
  const triangles: STLTriangle[] = [];
  const chunks = text.split(/\bfacet\b/i).slice(1);
  if (chunks.length > MAX_STL_TRIANGLES) {
    throw new Error(`STL has too many triangles (maximum ${MAX_STL_TRIANGLES.toLocaleString('en-US')})`);
  }
  for (const chunk of chunks) {
    const normalMatch = chunk.match(/\bnormal\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/i);
    const verts = [...chunk.matchAll(/\bvertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/gi)];
    if (verts.length < 3) continue;
    const v = verts.slice(0, 3).map(m => [
      parseFloat(m[1]),
      parseFloat(m[2]),
      parseFloat(m[3])
    ]) as [number, number, number][];
    triangles.push({
      a: v[0],
      b: v[1],
      c: v[2],
      normal: normalMatch
        ? [parseFloat(normalMatch[1]), parseFloat(normalMatch[2]), parseFloat(normalMatch[3])]
        : undefined
    });
  }
  return triangles;
}

/** Parse binary or ASCII STL into triangles; throw if the format is unrecognized. */
export function parseSTLData(buffer: ArrayBuffer): STLTriangle[] {
  if (!buffer || buffer.byteLength < 84) throw new Error('STL file is too small (need at least 84 bytes)');
  if (buffer.byteLength > MAX_STL_FILE_BYTES) {
    throw new Error(`STL file exceeds the ${MAX_STL_FILE_BYTES / (1024 * 1024)} MiB import limit`);
  }
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  // Binary STL length must be exactly 84 + 50 × triangle count.
  if (84 + triCount * 50 === buffer.byteLength && triCount > 0) {
    const triangles = parseBinarySTL(view, triCount);
    if (triangles.length > 0) return triangles;
  }
  const text = new TextDecoder().decode(new Uint8Array(buffer));
  const triangles = parseAsciiSTL(text);
  if (triangles.length === 0) throw new Error('No triangles found in STL (unsupported or corrupt file)');
  return triangles;
}

/** Return the longest mesh extent in world units; throw if there are no valid vertices. */
function meshExtent(triangles: STLTriangle[]): number {
  if (!triangles || triangles.length === 0) throw new Error('STL has no triangles');
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const t of triangles) {
    for (const v of [t.a, t.b, t.c]) {
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) throw new Error('STL contains no valid vertices');
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

export interface STLSizePlan {
  /** Scale that maps the longest model axis to sizeBlocks world units. */
  scale: number;
  /** Voxel edge length: 1 for standard blocks or 0.2 for microblocks. */
  cellSize: number;
  /** Whether to represent the model with 5x5x5 microblocks. */
  micro: boolean;
  /** Cell count on the longest axis; microblock mode uses sizeBlocks × 5. */
  cells: number;
}

/**
 * Plan output size. Required sizeBlocks sets the longest-axis length in standard
 * cells regardless of the STL's original units. precision < 0.5 selects 5x5x5
 * microblocks, increasing resolution fivefold without changing the world-space size.
 */
export function planSTLSize(triangles: STLTriangle[], sizeBlocks: number, precision: number): STLSizePlan {
  const extent = meshExtent(triangles);
  const N = Math.max(1, Math.floor(sizeBlocks) || 1);
  const scale = extent > 0 ? N / extent : 1;
  if (precision > 0 && precision < 0.5) {
    return { micro: true, cells: N * 5, cellSize: 0.2, scale };
  }
  return { micro: false, cells: N, cellSize: 1, scale };
}

// ---------------------------------------------------------------------------
// Voxelization.
// ---------------------------------------------------------------------------

/** Compute a unit normal by cross product; return null for a degenerate triangle. */
function triangleNormal(t: STLTriangle): [number, number, number] | null {
  const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2];
  const vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return [nx / len, ny / len, nz / len];
}

/**
 * Count intersections between a triangle and a +X ray from (ox, oy, oz) using
 * Möller–Trumbore. Only t > 0 counts; the surface pass handles t≈0.
 */
function rayXIntersectsTriangle(t: STLTriangle, ox: number, oy: number, oz: number): number {
  const ax = t.a[0] - ox, ay = t.a[1] - oy, az = t.a[2] - oz;
  const bx = t.b[0] - ox, by = t.b[1] - oy, bz = t.b[2] - oz;
  const cx = t.c[0] - ox, cy = t.c[1] - oy, cz = t.c[2] - oz;
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  // pvec = D × e2, D = (1,0,0) → (0, -e2z, e2y)
  const det = e1y * (-e2z) + e1z * e2y;
  if (Math.abs(det) < 1e-12) return 0;
  const invDet = 1 / det;
  const tx = -ax, ty = -ay, tz = -az;
  const u = (ty * (-e2z) + tz * e2y) * invDet;
  if (u < 0 || u > 1) return 0;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = qx * invDet; // D · qvec
  if (v < 0 || u + v > 1) return 0;
  const tHit = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return tHit > 1e-9 ? 1 : 0;
}

/**
 * Rasterize an STL triangle mesh into a block set.
 * @param triangles Parsed triangles.
 * @param blockSize Quantization cell size: 1 for standard blocks or 0.2 for microblocks.
 * @param defaultColor Block color used when the STL has no embedded color.
 * @param opts.micro Emit 5x5x5 microblocks when true; standard blocks otherwise.
 * @param opts.scale Uniform scale mapping the longest axis to the target size.
 */
export function voxelizeSTL(triangles: STLTriangle[], blockSize = 1, defaultColor = 0xf2a93b, opts: { micro?: boolean; scale?: number } = {}): STLVoxelResult {
  if (!triangles || triangles.length === 0) throw new Error('STL has no triangles');
  const s = blockSize > 0 ? blockSize : 1;
  const eps = s * INWARD_OFFSET_RATIO;
  if (opts.scale && opts.scale !== 1) {
    const k = opts.scale;
    triangles = triangles.map(t => ({
      a: [t.a[0] * k, t.a[1] * k, t.a[2] * k] as [number, number, number],
      b: [t.b[0] * k, t.b[1] * k, t.b[2] * k] as [number, number, number],
      c: [t.c[0] * k, t.c[1] * k, t.c[2] * k] as [number, number, number],
      normal: t.normal,
      color: t.color
    }));
  }

  // --- Bounds and color ---
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let embeddedColor: number | null = null;
  for (const t of triangles) {
    for (const v of [t.a, t.b, t.c]) {
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] > maxZ) maxZ = v[2];
    }
    if (embeddedColor === null && t.color != null) embeddedColor = t.color;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) throw new Error('STL contains no valid vertices');
  const color = embeddedColor ?? defaultColor;

  // --- Grid with one cell of padding on every side ---
  const gminX = Math.floor(minX / s) - 1;
  const gminY = Math.floor(minY / s) - 1;
  const gminZ = Math.floor(minZ / s) - 1;
  const gsx = Math.ceil(maxX / s) - gminX + 1;
  const gsy = Math.ceil(maxY / s) - gminY + 1;
  const gsz = Math.ceil(maxZ / s) - gminZ + 1;
  if (gsx * gsy * gsz > MAX_GRID_CELLS) {
    throw new Error(`Voxel grid too large (${gsx}×${gsy}×${gsz}); lower the target size`);
  }

  const grid = new Uint8Array(gsx * gsy * gsz); // 0=empty, 1=occupied.
  const idx = (x: number, y: number, z: number) => (x * gsy + y) * gsz + z;
  const cellOf = (wx: number, wy: number, wz: number) => [
    Math.floor(wx / s) - gminX,
    Math.floor(wy / s) - gminY,
    Math.floor(wz / s) - gminZ
  ];

  // --- Preindex triangles in (y,z) buckets for point-in-mesh and ray-parity tests ---
  const bucketSize = Math.max(s * 2, 1e-3);
  const bucket = new Map<string, number[]>();
  const bucketKey = (by: number, bz: number) => `${by},${bz}`;
  for (let ti = 0; ti < triangles.length; ti++) {
    const t = triangles[ti];
    const minBy = Math.floor(Math.min(t.a[1], t.b[1], t.c[1]) / bucketSize);
    const maxBy = Math.floor(Math.max(t.a[1], t.b[1], t.c[1]) / bucketSize);
    const minBz = Math.floor(Math.min(t.a[2], t.b[2], t.c[2]) / bucketSize);
    const maxBz = Math.floor(Math.max(t.a[2], t.b[2], t.c[2]) / bucketSize);
    for (let by = minBy; by <= maxBy; by++) {
      for (let bz = minBz; bz <= maxBz; bz++) {
        const key = bucketKey(by, bz);
        let list = bucket.get(key);
        if (!list) { list = []; bucket.set(key, list); }
        list.push(ti);
      }
    }
  }

  /** A point is inside when a +X ray has odd parity against its (y,z) bucket. */
  const pointInsideMesh = (px: number, py: number, pz: number): boolean => {
    const list = bucket.get(bucketKey(Math.floor(py / bucketSize), Math.floor(pz / bucketSize))) || [];
    let crossings = 0;
    for (const ti of list) {
      const t = triangles[ti];
      if (Math.max(t.a[0], t.b[0], t.c[0]) <= px) continue;
      crossings += rayXIntersectsTriangle(t, px, py, pz);
    }
    return crossings % 2 === 1;
  };

  // --- 1) Surface pass: sample triangles at no more than half-cell spacing and move inward by ε ---
  // Do not trust file winding. Test the centroid at ±εn to find the interior side,
  // producing a one-cell shell for either winding without inflating aligned faces.
  for (const t of triangles) {
    const edgeAB = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]);
    const edgeBC = Math.hypot(t.c[0] - t.b[0], t.c[1] - t.b[1], t.c[2] - t.b[2]);
    const edgeCA = Math.hypot(t.a[0] - t.c[0], t.a[1] - t.c[1], t.a[2] - t.c[2]);
    const maxEdge = Math.max(edgeAB, edgeBC, edgeCA);
    const n = Math.max(1, Math.min(8, Math.ceil(maxEdge / s) * 2));
    const normal = triangleNormal(t);
    const cx = (t.a[0] + t.b[0] + t.c[0]) / 3;
    const cy = (t.a[1] + t.b[1] + t.c[1]) / 3;
    const cz = (t.a[2] + t.b[2] + t.c[2]) / 3;
    let nx = 0, ny = 0, nz = 0;
    if (normal) {
      const inward = pointInsideMesh(cx - normal[0] * eps, cy - normal[1] * eps, cz - normal[2] * eps);
      const dir = inward ? -1 : 1; // Move toward -n when the interior lies there, otherwise +n.
      nx = normal[0] * eps * dir;
      ny = normal[1] * eps * dir;
      nz = normal[2] * eps * dir;
    }
    for (let i = 0; i <= n; i++) {
      for (let j = 0; i + j <= n; j++) {
        const k = n - i - j;
        const u = i / n, v = j / n, w = k / n;
        const px = t.a[0] * u + t.b[0] * v + t.c[0] * w;
        const py = t.a[1] * u + t.b[1] * v + t.c[1] * w;
        const pz = t.a[2] * u + t.b[2] * v + t.c[2] * w;
        // Pull samples ε toward the centroid so vertices and edges on voxel
        // boundaries remain on the triangle's interior side.
        const gx = cx - px, gy = cy - py, gz = cz - pz;
        const gd = Math.hypot(gx, gy, gz);
        const pull = gd > 0 ? Math.min(1, eps / gd) : 0;
        const fx = px + gx * pull + nx;
        const fy = py + gy * pull + ny;
        const fz = pz + gz * pull + nz;
        const [ccx, ccy, ccz] = cellOf(fx, fy, fz);
        if (ccx >= 0 && ccx < gsx && ccy >= 0 && ccy < gsy && ccz >= 0 && ccz < gsz) {
          grid[idx(ccx, ccy, ccz)] = 1;
        }
      }
    }
  }

  // --- 2) Interior pass: fill unmarked cells by +X ray parity ---
  // Add deterministic jitter of order s·1e-3 so rays do not cross shared edges or
  // vertices and count coplanar triangles twice. Jitter stays within [0.1, 0.9].
  const hash01 = (n: number, salt: number): number => {
    let v = (n * 73856093) ^ (salt * 19349663);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    v = (v ^ (v >>> 16)) >>> 0;
    return 0.1 + 0.8 * (v / 4294967296);
  };
  const jitterScale = s * 1e-3;
  for (let x = 0; x < gsx; x++) {
    for (let y = 0; y < gsy; y++) {
      for (let z = 0; z < gsz; z++) {
        const cell = idx(x, y, z);
        if (grid[cell] === 1) continue;
        const wx = (x + gminX) * s + s * 0.5;
        const wy = (y + gminY) * s + s * 0.5 + hash01(x, 1) * jitterScale;
        const wz = (z + gminZ) * s + s * 0.5 + hash01(z, 2) * jitterScale;
        if (pointInsideMesh(wx, wy, wz)) grid[cell] = 1;
      }
    }
  }

  // --- 3) Collect occupied cells and normalize the minimum corner to zero ---
  let minBx = Infinity, minBy = Infinity, minBz = Infinity;
  const filled: number[][] = [];
  for (let x = 0; x < gsx; x++) {
    for (let y = 0; y < gsy; y++) {
      for (let z = 0; z < gsz; z++) {
        if (grid[idx(x, y, z)] === 1) {
          filled.push([x, y, z]);
          if (x < minBx) minBx = x;
          if (y < minBy) minBy = y;
          if (z < minBz) minBz = z;
        }
      }
    }
  }
  if (filled.length === 0) throw new Error('Voxelization produced no voxels; try a finer quantization size');

  const micro = !!opts.micro;
  let blocks: STLVoxelResult['blocks'] = [];

  if (micro) {
    // Merge fully solid 5x5x5 microblock regions into 1x1x1 standard blocks to save space.
    const merged = new Uint8Array(gsx * gsy * gsz);

    let maxBx = -Infinity, maxBy = -Infinity, maxBz = -Infinity;
    for (const [x, y, z] of filled) {
      if (x > maxBx) maxBx = x;
      if (y > maxBy) maxBy = y;
      if (z > maxBz) maxBz = z;
    }

    // Pass 1: Find all 5x5x5 aligned solid cubes starting from minBx, minBy, minBz
    for (let x = minBx; x + 4 <= maxBx; x += 5) {
      for (let y = minBy; y + 4 <= maxBy; y += 5) {
        for (let z = minBz; z + 4 <= maxBz; z += 5) {
          let isSolid = true;
          for (let dx = 0; dx < 5; dx++) {
            for (let dy = 0; dy < 5; dy++) {
              for (let dz = 0; dz < 5; dz++) {
                if (grid[idx(x + dx, y + dy, z + dz)] !== 1) {
                  isSolid = false;
                  break;
                }
              }
              if (!isSolid) break;
            }
            if (!isSolid) break;
          }

          if (isSolid) {
            for (let dx = 0; dx < 5; dx++) {
              for (let dy = 0; dy < 5; dy++) {
                for (let dz = 0; dz < 5; dz++) {
                  merged[idx(x + dx, y + dy, z + dz)] = 1;
                }
              }
            }

            const bx = x - minBx;
            const by = y - minBy;
            const bz = z - minBz;
            blocks.push({
              dx: Math.round(bx * s * 5) / 5,
              dy: Math.round(by * s * 5) / 5,
              dz: Math.round(bz * s * 5) / 5,
              size: 1,
              block: BlockTypes.COLOR_BLOCK,
              color
            });
          }
        }
      }
    }

    // Pass 2: Emit remaining unmerged occupied cells as 0.2 microblocks
    for (const [x, y, z] of filled) {
      if (merged[idx(x, y, z)] === 1) continue;

      const bx = x - minBx;
      const by = y - minBy;
      const bz = z - minBz;
      blocks.push({
        dx: Math.round(bx * s * 5) / 5,
        dy: Math.round(by * s * 5) / 5,
        dz: Math.round(bz * s * 5) / 5,
        size: 0.2,
        block: BlockTypes.COLOR_BLOCK,
        color
      });
    }
  } else {
    blocks = filled.map(([x, y, z]) => {
      const bx = x - minBx;
      const by = y - minBy;
      const bz = z - minBz;
      return {
        dx: bx,
        dy: by,
        dz: bz,
        size: 1,
        block: BlockTypes.COLOR_BLOCK,
        color
      };
    });
  }

  if (blocks.length > MAX_OUTPUT_BLOCKS) {
    throw new Error(`Too many voxels (${blocks.length}); lower the target size or use standard blocks`);
  }

  return {
    blocks,
    size: { sx: gsx, sy: gsy, sz: gsz },
    bounds: { minX: gminX * s, minY: gminY * s, minZ: gminZ * s, maxX: (gminX + gsx) * s, maxY: (gminY + gsy) * s, maxZ: (gminZ + gsz) * s }
  };
}
