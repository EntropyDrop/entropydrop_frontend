/** Voxel guide geometry using the same UV/grid mapping as resolveVoxelConsistency. */
import * as THREE from 'three';
import { CUTE_HEIGHT, CUTE_TAPER, cuteSourceRow } from './characterShape.js';

// BoxGeometry face groups: +X, -X, +Y, -Y, +Z, -Z.
const FACE_GROUPS = { left: 0, right: 1, top: 2, bottom: 3, front: 4, back: 5 };
const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SKIN_FACES = ['front', 'back', 'top', 'bottom', 'left', 'right'];
const BARE_SURFACE = [1, 1, 1];

/**
 * The skin has already passed alpha preprocessing and resolveVoxelConsistency.
 * Core emits textured surface quads; decor emits one cube per occupied cell,
 * with individual face colors and no coincident cubes at UV corners.
 */
export function createSkinVoxelGeometry(skin, uvs, size, { cuteMode, partIndex, isDecor }) {
  const width = uvs.top[2], depth = uvs.top[3];
  const sourceHeight = uvs.front[3];
  const height = cuteMode && sourceHeight === 12 ? CUTE_HEIGHT : sourceHeight;
  const voxels = new Map();
  const color = new THREE.Color();

  for (const face of SKIN_FACES) {
    const [u, v, faceWidth, faceHeight] = uvs[face];
    const sampledHeight = cuteMode && faceHeight === 12 ? CUTE_HEIGHT : faceHeight;
    for (let py = 0; py < sampledHeight; py++) {
      for (let px = 0; px < faceWidth; px++) {
        const sourceY = sampledHeight !== faceHeight ? cuteSourceRow(py) : py;
        const pixel = skin.getPixel(u + px, v + sourceY);
        if (isDecor && pixel[3] === 0) continue;
        let cell;
        // Resolver coordinates [width, depth, height] become Three.js
        // [width, height, front], with +X = character left and +Z = front.
        switch (face) {
          case 'front': cell = [px, height - 1 - py, depth - 1]; break;
          case 'back': cell = [width - 1 - px, height - 1 - py, 0]; break;
          case 'left': cell = [width - 1, height - 1 - py, depth - 1 - px]; break;
          case 'right': cell = [0, height - 1 - py, px]; break;
          case 'top': cell = [px, height - 1, py]; break;
          case 'bottom': cell = [px, 0, py]; break;
        }
        const key = cell.join(',');
        color.setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, THREE.SRGBColorSpace);
        // Missing core stickers still leave a closed, white printed surface.
        const rgb = pixel[3] === 0 ? BARE_SURFACE : [color.r, color.g, color.b];
        let voxel = voxels.get(key);
        if (!voxel) {
          voxel = { cell, colors: new Array(6) };
          voxels.set(key, voxel);
        }
        voxel.colors[FACE_GROUPS[face]] = rgb;
      }
    }
  }

  const physicalHeight = cuteMode && partIndex !== 0 ? size[1] - 4 : size[1];
  const step = [size[0] / width, physicalHeight / height, size[2] / depth];
  const indexedCube = new THREE.BoxGeometry(...step);
  const cube = indexedCube.toNonIndexed();
  indexedCube.dispose();
  const corners = cube.attributes.position;
  const positions = [], colors = [];
  for (const voxel of voxels.values()) {
    const [ix, iy, iz] = voxel.cell;
    const center = [
      (ix + 0.5) * step[0] - size[0] / 2,
      (iy + 0.5) * step[1] - physicalHeight / 2,
      (iz + 0.5) * step[2] - size[2] / 2,
    ];
    for (const group of cube.groups) {
      const face = group.materialIndex;
      if (!isDecor && !voxel.colors[face]) continue;
      if (isDecor) {
        const neighbor = NEIGHBORS[face];
        // Adjacent full cubes share a hidden face; do not draw it twice.
        if (voxels.has([ix + neighbor[0], iy + neighbor[1], iz + neighbor[2]].join(','))) continue;
      }
      // The sheet contains the outer face only, not the exposed step walls.
      const rgb = voxel.colors[face] ?? BARE_SURFACE;
      for (let i = group.start; i < group.start + group.count; i++) {
        let x = center[0] + corners.getX(i);
        const y = center[1] + corners.getY(i), z = center[2] + corners.getZ(i);
        if (cuteMode && partIndex === 1) {
          const t = Math.max(0, Math.min(1, (y + physicalHeight / 2) / physicalHeight));
          x *= 1 - CUTE_TAPER * t;
        }
        positions.push(x, y, z);
        colors.push(...rgb);
      }
    }
  }
  cube.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.addGroup(0, positions.length / 3, 0);
  geometry.computeVertexNormals();
  return geometry;
}
