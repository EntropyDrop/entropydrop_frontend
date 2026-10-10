import * as THREE from 'three';
import type { Vec2, Vec3, ColorRGBA } from '../types/index.js';
import type { TokenRegistry } from './tokens.js';
import { WHITE } from './tokens.js';

export interface ModelFaceConfig {
  offset: Vec2 | number[];
  size: Vec2;
  start: Vec3;
  xDir: Vec3;
  yDir: Vec3;
  group: number;
}

const _pixel: ColorRGBA = [0, 0, 0, 0];

/** Read pixel (x, y) from a normalized RGBA Float32Array; wraps like Python. */
export function pxAt(
  pixels: Float32Array,
  width: number,
  x: number,
  y: number,
  out: ColorRGBA | number[] = [0, 0, 0, 0]
): ColorRGBA | number[] {
  const w = width;
  const h = pixels.length / (4 * w);
  const xx = ((x % w) + w) % w;
  const yy = ((y % h) + h) % h;
  const i = (yy * w + xx) * 4;
  out[0] = pixels[i]!;
  out[1] = pixels[i + 1]!;
  out[2] = pixels[i + 2]!;
  out[3] = pixels[i + 3]!;
  return out;
}

/**
 * Regions of the skin that are sampled exclusively for the decor (second)
 * layer, per part: face offsets + decor offsets. Transparent pixels there
 * intentionally stay transparent: decor cubes are only generated for fully
 * opaque pixels.
 */
export function inDecorRegion(x: number, y: number): boolean {
  return (
    (y < 16 && x >= 32) || // head hat: faces (0..31, 0..15) + (32, 0)
    (y >= 32 && y < 48 && x < 56) || // torso jacket (16..39) + right pants (0..15) + right sleeve (40..55)
    (y >= 48 && (x < 16 || x >= 48)) // left pants (0..15) + left sleeve (48..63)
  );
}

/**
 * Fill transparent pixels of the skin's first-layer (base) regions with the
 * color of the nearest opaque pixel (multi-source BFS). Skins like a1.png have
 * large transparent base areas; without filling, those surface faces are
 * dropped and the figure ends up full of see-through holes after the boolean
 * cuts. The decor regions are left untouched.
 */
export function fillTransparentPixels(pixels: Float32Array, width: number): Float32Array {
  const w = width;
  const h = pixels.length / (4 * w);
  const isBase = new Uint8Array(w * h);
  const srcIndex = new Int32Array(w * h);
  const queue: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inDecorRegion(x, y)) continue;
      isBase[i] = 1;
      if (pixels[i * 4 + 3]! >= 1) {
        srcIndex[i] = i;
        queue.push(i);
      } else {
        srcIndex[i] = -1;
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i / w) | 0;
    const src = srcIndex[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (isBase[ni] && srcIndex[ni] === -1) {
        srcIndex[ni] = src;
        queue.push(ni);
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!isBase[i] || srcIndex[i] === -1 || srcIndex[i] === i) continue;
    const s = srcIndex[i]! * 4;
    const d = i * 4;
    pixels[d] = pixels[s]!;
    pixels[d + 1] = pixels[s + 1]!;
    pixels[d + 2] = pixels[s + 2]!;
    pixels[d + 3] = 1;
  }
  return pixels;
}

export function faceConfigs(
  width: number,
  depth: number,
  height: number,
  faceOffsets: Vec2[] | number[][]
): ModelFaceConfig[] {
  return [
    { offset: faceOffsets[0]!, size: [width, height], start: [1, -1, 1], xDir: [0, 1, 0], yDir: [0, 0, -1], group: 0 },
    { offset: faceOffsets[1]!, size: [depth, height], start: [1, 1, 1], xDir: [-1, 0, 0], yDir: [0, 0, -1], group: 2 },
    { offset: faceOffsets[2]!, size: [depth, height], start: [-1, -1, 1], xDir: [1, 0, 0], yDir: [0, 0, -1], group: 3 },
    { offset: faceOffsets[3]!, size: [width, depth], start: [-1, -1, 1], xDir: [0, 1, 0], yDir: [1, 0, 0], group: 4 },
    { offset: faceOffsets[4]!, size: [width, depth], start: [-1, -1, -1], xDir: [0, 1, 0], yDir: [1, 0, 0], group: 5 },
    { offset: faceOffsets[5]!, size: [width, height], start: [-1, 1, 1], xDir: [0, -1, 0], yDir: [0, 0, -1], group: 1 },
  ];
}

export function posKey(local: Vec3): string {
  return local[0] + ',' + local[1] + ',' + local[2];
}

export function faceLocalPosition(
  face: ModelFaceConfig,
  pixelX: number,
  pixelY: number,
  halfDepth: number,
  halfWidth: number,
  halfHeight: number
): Vec3 {
  return [
    face.start[0] * (halfDepth - 0.5) + face.xDir[0] * pixelX + face.yDir[0] * pixelY,
    face.start[1] * (halfWidth - 0.5) + face.xDir[1] * pixelX + face.yDir[1] * pixelY,
    face.start[2] * (halfHeight - 0.5) + face.xDir[2] * pixelX + face.yDir[2] * pixelY,
  ];
}

export function faceDecorLocation(
  face: ModelFaceConfig,
  pixelX: number,
  pixelY: number,
  halfDepth: number,
  halfWidth: number,
  halfHeight: number,
  decorScale: Vec3,
  location: Vec3
): Vec3 {
  return [
    location[0] + (face.start[0] * halfDepth + face.xDir[0] * pixelX + face.yDir[0] * pixelY - 0.5 * face.start[0]) * decorScale[0],
    location[1] + (face.start[1] * halfWidth + face.xDir[1] * pixelX + face.yDir[1] * pixelY - 0.5 * face.start[1]) * decorScale[1],
    location[2] + (face.start[2] * halfHeight + face.xDir[2] * pixelX + face.yDir[2] * pixelY - 0.5 * face.start[2]) * decorScale[2],
  ];
}

/**
 * Build a subdivided solid watertight box of size `(depth, blockWidth, height)`
 * at `location`, where each 1×1 quad on the 6 outer faces carries its skin pixel material index.
 * It is a 100% closed 2-manifold solid with zero internal gaps, zero coincident faces,
 * and correct outward normals, providing a clean watertight manifold for CSG operations.
 */
export function createSolidBlock(
  location: Vec3,
  entitySize: Vec3,
  faceOffsets: Vec2[] | number[][],
  pixels: Float32Array,
  width: number,
  reg: TokenRegistry
): THREE.BufferGeometry {
  const depth = entitySize[0];
  const blockWidth = entitySize[1];
  const height = entitySize[2];
  const halfDepth = depth / 2;
  const halfWidth = blockWidth / 2;
  const halfHeight = height / 2;
  const [lx, ly, lz] = location;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];

  const vertMap = new Map<string, number>();
  const getVertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let idx = vertMap.get(k);
    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      uvs.push(0, 0);
      vertMap.set(k, idx);
    }
    return idx;
  };

  const addQuad = (
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
    v3: Vec3,
    norm: Vec3,
    matIndex: number
  ) => {
    const i0 = getVertex(v0[0], v0[1], v0[2], norm[0], norm[1], norm[2]);
    const i1 = getVertex(v1[0], v1[1], v1[2], norm[0], norm[1], norm[2]);
    const i2 = getVertex(v2[0], v2[1], v2[2], norm[0], norm[1], norm[2]);
    const i3 = getVertex(v3[0], v3[1], v3[2], norm[0], norm[1], norm[2]);

    const groupStart = indices.length;
    indices.push(i0, i1, i2);
    indices.push(i0, i2, i3);
    groups.push({ start: groupStart, count: 6, materialIndex: matIndex });
  };

  const getMatIndex = (sx: number, sy: number): number => {
    pxAt(pixels, width, sx, sy, _pixel);
    // A missing base texel means no sticker at this location. Keep the solid
    // closed and show its bare surface instead of inventing a skin color.
    if (_pixel[3] < 1) return reg.get(WHITE);
    return reg.get(_pixel);
  };

  // 0: +X face (Front) — normal [+1, 0, 0]
  {
    const off = faceOffsets[0]!;
    const x = lx + halfDepth;
    const norm: Vec3 = [1, 0, 0];
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < blockWidth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const y0 = ly - halfWidth + px;
        const y1 = y0 + 1;
        const z1 = lz + halfHeight - py;
        const z0 = z1 - 1;
        addQuad([x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1], norm, matIdx);
      }
    }
  }

  // 1: +Y face (Right) — normal [0, +1, 0]
  {
    const off = faceOffsets[1]!;
    const y = ly + halfWidth;
    const norm: Vec3 = [0, 1, 0];
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < depth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const x1 = lx + halfDepth - px;
        const x0 = x1 - 1;
        const z1 = lz + halfHeight - py;
        const z0 = z1 - 1;
        addQuad([x1, y, z0], [x0, y, z0], [x0, y, z1], [x1, y, z1], norm, matIdx);
      }
    }
  }

  // 2: -Y face (Left) — normal [0, -1, 0]
  {
    const off = faceOffsets[2]!;
    const y = ly - halfWidth;
    const norm: Vec3 = [0, -1, 0];
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < depth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const x0 = lx - halfDepth + px;
        const x1 = x0 + 1;
        const z1 = lz + halfHeight - py;
        const z0 = z1 - 1;
        addQuad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], norm, matIdx);
      }
    }
  }

  // 3: +Z face (Top) — normal [0, 0, +1]
  {
    const off = faceOffsets[3]!;
    const z = lz + halfHeight;
    const norm: Vec3 = [0, 0, 1];
    for (let py = 0; py < depth; py++) {
      for (let px = 0; px < blockWidth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const y0 = ly - halfWidth + px;
        const y1 = y0 + 1;
        const x0 = lx - halfDepth + py;
        const x1 = x0 + 1;
        addQuad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], norm, matIdx);
      }
    }
  }

  // 4: -Z face (Bottom) — normal [0, 0, -1]
  {
    const off = faceOffsets[4]!;
    const z = lz - halfHeight;
    const norm: Vec3 = [0, 0, -1];
    for (let py = 0; py < depth; py++) {
      for (let px = 0; px < blockWidth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const y0 = ly - halfWidth + px;
        const y1 = y0 + 1;
        const x0 = lx - halfDepth + py;
        const x1 = x0 + 1;
        addQuad([x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z], norm, matIdx);
      }
    }
  }

  // 5: -X face (Back) — normal [-1, 0, 0]
  {
    const off = faceOffsets[5]!;
    const x = lx - halfDepth;
    const norm: Vec3 = [-1, 0, 0];
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < blockWidth; px++) {
        const matIdx = getMatIndex(px + off[0]!, py + off[1]!);
        const y1 = ly + halfWidth - px;
        const y0 = y1 - 1;
        const z1 = lz + halfHeight - py;
        const z0 = z1 - 1;
        addQuad([x, y1, z0], [x, y0, z0], [x, y0, z1], [x, y1, z1], norm, matIdx);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  for (const g of groups) {
    geom.addGroup(g.start, g.count, g.materialIndex);
  }
  return geom;
}

/**
 * Creates one solid cube per occupied decor voxel. A corner can be sampled by
 * several UV faces: keep their colors on the corresponding cube faces instead
 * of stacking coincident, differently colored cubes at the same position.
 * Only these outer faces have stickers; exposed step walls remain bare white.
 */
export function createDecorCubes(
  location: Vec3,
  entitySize: Vec3,
  faceOffsets: Vec2[] | number[][],
  decorScale: Vec3,
  decorOffset: Vec2,
  pixels: Float32Array,
  width: number,
  reg: TokenRegistry
): THREE.BufferGeometry[] {
  const depth = entitySize[0];
  const blockWidth = entitySize[1];
  const height = entitySize[2];
  const halfDepth = depth / 2;
  const halfWidth = blockWidth / 2;
  const halfHeight = height / 2;

  const faces = faceConfigs(blockWidth, depth, height, faceOffsets);
  const decorGeoms: THREE.BufferGeometry[] = [];
  const baseCube = new THREE.BoxGeometry(decorScale[0], decorScale[1], decorScale[2]);
  const voxels = new Map<string, {
    local: Vec3;
    materials: Array<number | undefined>;
  }>();
  const bareMaterial = reg.get(WHITE);

  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi]!;
    for (let py = 0; py < face.size[1]; py++) {
      for (let px = 0; px < face.size[0]; px++) {
        const sx = px + face.offset[0]! + decorOffset[0];
        const sy = py + face.offset[1]! + decorOffset[1];
        pxAt(pixels, width, sx, sy, _pixel);
        if (_pixel[3] !== 1.0) continue;

        const local = faceLocalPosition(face, px, py, halfDepth, halfWidth, halfHeight);
        const key = posKey(local);
        const matIdx = reg.get(_pixel);
        let voxel = voxels.get(key);
        if (!voxel) {
          voxel = { local, materials: new Array(6) };
          voxels.set(key, voxel);
        }
        voxel.materials[face.group] = matIdx;
      }
    }
  }

  for (const voxel of voxels.values()) {
    const cube = baseCube.clone();
    cube.translate(
      location[0] + voxel.local[0] * decorScale[0],
      location[1] + voxel.local[1] * decorScale[1],
      location[2] + voxel.local[2] * decorScale[2]
    );
    // BoxGeometry's groups are +X, -X, +Y, -Y, +Z, -Z.
    for (const group of cube.groups) {
      group.materialIndex = voxel.materials[group.materialIndex!] ?? bareMaterial;
    }
    decorGeoms.push(cube);
  }

  baseCube.dispose();
  return decorGeoms;
}
