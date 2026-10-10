import type * as THREE from 'three';
import type { FigurePart, Vec3 } from '../types/index.js';
import { CUTE_HEIGHT, CUTE_SCALE, cuteTorsoWidthFactor, cuteSourceRow, getCutePartPose } from '../../../shared/characterProportions.js';

// Figure parts receive ASSEMBLY_SHIFT.z = -4; keep the feet on z = -18.
const CUTE_ORIGIN_Z = -14;
export const CUTE_SHOULDER_INSET = 1.5;

/** Rebuild eight voxel rows from the same source texels as the sticker engine. */
export function resampleCutePixels(pixels: Float32Array, width: number): void {
  const source = new Float32Array(pixels);
  // These strips contain every vertical body/limb face, in both skin layers.
  // Top/bottom UVs and the entire head are outside these strips.
  for (const startY of [20, 36, 52]) {
    for (let row = 0; row < CUTE_HEIGHT; row++) {
      const from = ((startY + cuteSourceRow(row)) * width) * 4;
      pixels.set(source.subarray(from, from + width * 4), ((startY + row) * width) * 4);
    }
  }
}

/** Shape local solids before CSG so socket cylinders retain circular sections. */
export function shapeCuteGeometry(geometry: THREE.BufferGeometry, torso = false, decor = false): void {
  const positions = geometry.getAttribute('position');
  const height = CUTE_HEIGHT + (decor ? 0.5 : 0);
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const t = Math.max(0, Math.min(1, (z + height / 2) / height));
    positions.setY(i, positions.getY(i) * CUTE_SCALE * (torso ? cuteTorsoWidthFactor(t) : 1));
    positions.setZ(i, z * CUTE_SCALE);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function cuteModelPose(partIndex: number, isAlex: boolean): { position: Vec3; rotationX: number } {
  const pose = getCutePartPose(partIndex, isAlex);
  return {
    position: [pose.position[2], pose.position[0], pose.position[1] + CUTE_ORIGIN_Z],
    rotationX: pose.rotationZ,
  };
}

/** Shoulder axis passes through the touching arm and sloped torso faces. */
export function cuteShoulderAnchor(isLeft: boolean, isAlex: boolean): { center: Vec3; angle: number } {
  const side = isLeft ? 1 : -1;
  const arm = cuteModelPose(isLeft ? 2 : 3, isAlex);
  const torso = cuteModelPose(1, isAlex);
  const y = -side * (isAlex ? 3 : 4) * CUTE_SCALE / 2;
  const z = CUTE_HEIGHT * CUTE_SCALE / 2 - CUTE_SHOULDER_INSET;
  const cos = Math.cos(arm.rotationX), sin = Math.sin(arm.rotationX);
  return {
    center: [0, arm.position[1] + y * cos - z * sin, arm.position[2] + y * sin + z * cos - torso.position[2]],
    angle: arm.rotationX,
  };
}

/** Bake assembly poses into both preview and export meshes, including cutters. */
export function placeCuteParts(parts: FigurePart[], partIndex: number, isAlex: boolean): void {
  const { position, rotationX } = cuteModelPose(partIndex, isAlex);
  const geometries = new Set<THREE.BufferGeometry>();
  for (const part of parts) {
    part.printUp = [0, -Math.sin(rotationX), Math.cos(rotationX)];
    for (const mesh of part.meshes) geometries.add(mesh.geometry);
    if (part.exportGeometry) geometries.add(part.exportGeometry);
    for (const cutter of part.cutters) {
      geometries.add(cutter.geometry);
      if (cutter.visual) geometries.add(cutter.visual);
    }
  }
  for (const geometry of geometries) {
    // Head geometry is generated with its original 14-unit center; other
    // Cute parts are constructed about their local origin.
    if (partIndex === 0) geometry.translate(0, 0, -14);
    if (rotationX) geometry.rotateX(rotationX);
    geometry.translate(...position);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
}
