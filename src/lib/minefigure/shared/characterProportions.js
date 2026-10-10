/** Shared Cute proportions and skin sampling for printable models and stickers. */
export const CUTE_HEIGHT = 8;
export const CUTE_SCALE = 0.85;
export const CUTE_TAPER = 0.3;
export const CUTE_ARM_TILT = Math.atan(8 * CUTE_TAPER / (2 * CUTE_HEIGHT));

export function cuteTorsoWidthFactor(t) {
  return 1 - CUTE_TAPER * Math.max(0, Math.min(1, t));
}

/** Outward unit normal of the torso's left/right face in model XYZ coordinates. */
export function cuteTorsoSideNormal(width, height, side) {
  const bottomY = side * width / 2;
  const topY = bottomY * cuteTorsoWidthFactor(1);
  const tangentY = topY - bottomY;
  const length = Math.hypot(height, tangentY);
  return [0, side * height / length, -side * tangentY / length];
}

export function cuteSourceRow(row, height = CUTE_HEIGHT) {
  return Math.min(11, Math.floor((row + 0.5) * 12 / height));
}

/** Coordinates are [left/right, up, front/back], with feet at zero. */
export function getCutePartPose(partIndex, isSlim = false) {
  const limbH = CUTE_HEIGHT * CUTE_SCALE;
  const bodyY = limbH * 1.5;
  const shoulderY = limbH * 2;
  if (partIndex === 0) return { position: [0, shoulderY + 4, 0], scale: [1, 1, 1], rotationZ: 0 };
  if (partIndex === 1) return { position: [0, bodyY, 0], scale: [CUTE_SCALE, CUTE_SCALE, 1], rotationZ: 0 };
  const side = partIndex === 2 || partIndex === 4 ? 1 : -1;
  if (partIndex >= 4) {
    return { position: [side * 2 * CUTE_SCALE, limbH / 2, 0], scale: [CUTE_SCALE, CUTE_SCALE, 1], rotationZ: 0 };
  }
  const armW = isSlim ? 3 : 4;
  const shoulderX = 8 * (1 - CUTE_TAPER) * CUTE_SCALE / 2 + armW * CUTE_SCALE / (2 * Math.cos(CUTE_ARM_TILT));
  return {
    position: [side * (shoulderX + limbH / 2 * Math.sin(CUTE_ARM_TILT)), shoulderY - limbH / 2 * Math.cos(CUTE_ARM_TILT), 0],
    scale: [CUTE_SCALE, CUTE_SCALE, 1], rotationZ: side * CUTE_ARM_TILT,
  };
}
