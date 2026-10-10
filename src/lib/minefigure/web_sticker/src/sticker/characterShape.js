/** Cute proportions from entropydrop_frontend/src/components/MC.tsx. */
import { createCanvas } from './skinHelper.js';
import { resizeCanvasNearest } from './rasterTransform.js';
import { CUTE_HEIGHT, CUTE_SCALE, CUTE_TAPER, cuteSourceRow, cuteTorsoWidthFactor } from '../../../shared/characterProportions.js';
export { CUTE_HEIGHT, CUTE_SCALE, CUTE_TAPER, CUTE_ARM_TILT, cuteSourceRow, getCutePartPose } from '../../../shared/characterProportions.js';

// Keep the exact, axis-aligned cut geometry before rasterizing Cute's taper.
// Front/back faces have no assembly holes to punch after this transformation.
const untaperedTorsoCanvases = new WeakMap();

export function getUntaperedCuteTorsoCanvas(canvas) {
  return untaperedTorsoCanvases.get(canvas);
}

/** Axis-aligned source edges remain straight under this linear-width taper. */
export function mapCuteTorsoStickerPoint([x, y], sourceWidth, sourceHeight, width, height) {
  const fractionY = y / sourceHeight;
  const rowWidth = cuteTorsoWidthFactor(1 - fractionY);
  return [width / 2 + (x / sourceWidth - 0.5) * width * rowWidth, fractionY * height];
}

/** Sample the same eight rows as MC's Cute materials, including both limb halves. */
export function createSkinFaceCanvas(skinCanvas, uv, cuteMode = false) {
  const [u, v, w, h, flipH, flipV] = uv;
  const targetH = cuteMode && h === 12 ? CUTE_HEIGHT : h;
  const canvas = createCanvas(w, targetH);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(flipH ? w : 0, flipV ? targetH : 0);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  if (targetH !== h) {
    for (let row = 0; row < targetH; row++) {
      ctx.drawImage(skinCanvas, u, v + cuteSourceRow(row), w, 1, 0, row, w, 1);
    }
  } else {
    ctx.drawImage(skinCanvas, u, v, w, h, 0, 0, w, h);
  }
  ctx.restore();
  return canvas;
}

export function taperCuteTorso(geometry) {
  const height = geometry.parameters.height;
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) + height / 2) / height));
    pos.setX(i, pos.getX(i) * (1 - CUTE_TAPER * t));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Unfold the tapered torso into flat faces, preserving the length of each seam. */
export function transformCuteSticker(canvas, partIndex, faceIndex, modelScale = 1) {
  if (partIndex === 0) return modelScale === 1 ? canvas : resizeCanvasNearest(canvas, Math.floor(canvas.width * modelScale), Math.floor(canvas.height * modelScale));
  const isTorso = partIndex === 1;
  const isVertical = faceIndex >= 2;
  const isSide = faceIndex >= 4;
  const taper = isTorso && (faceIndex === 2 || faceIndex === 3);
  const widthScale = isSide ? 1 : CUTE_SCALE * (isTorso && faceIndex === 0 ? 1 - CUTE_TAPER : 1);
  const heightScale = isVertical
    ? CUTE_SCALE * (isTorso && isSide ? Math.hypot(1, 8 * CUTE_TAPER / (2 * CUTE_HEIGHT)) : 1)
    : 1;
  const width = Math.max(1, Math.floor(Math.floor(canvas.width * widthScale) * modelScale));
  const height = Math.max(1, Math.floor(Math.floor(canvas.height * heightScale) * modelScale));
  const out = createCanvas(width, height);
  const source = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const ctx = out.getContext('2d');
  const pixels = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const rowWidth = taper ? cuteTorsoWidthFactor(1 - (y + 0.5) / height) : 1;
    const sy = Math.min(canvas.height - 1, Math.floor((y + 0.5) * canvas.height / height));
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width - 0.5) / rowWidth + 0.5;
      if (u < 0 || u >= 1) continue;
      const sx = Math.min(canvas.width - 1, Math.floor(u * canvas.width));
      const from = (sy * canvas.width + sx) * 4;
      const to = (y * width + x) * 4;
      pixels.data.set(source.subarray(from, from + 4), to);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (taper) untaperedTorsoCanvases.set(out, canvas);
  return out;
}
