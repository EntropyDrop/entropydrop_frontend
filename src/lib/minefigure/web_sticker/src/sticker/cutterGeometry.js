/** Preserve analytic cut geometry independently of the printed raster image. */
import { createCanvas } from './skinHelper.js';
import { getUntaperedCuteTorsoCanvas, mapCuteTorsoStickerPoint } from './characterShape.js';
import { getAssemblyCutterSource } from './assemblySettings.js';
import { traceCutterPaths, traceCutterPathsWithCircularHoles } from './vectorTracer.js';

function excludeDecorPixels(core, decor) {
  const ctx = core.getContext('2d');
  const pixels = ctx.getImageData(0, 0, core.width, core.height);
  const outer = decor.getContext('2d').getImageData(0, 0, core.width, core.height).data;
  for (let i = 3; i < pixels.data.length; i += 4) {
    if (outer[i] > 128) pixels.data[i] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
}

/** Clip unpunched masks against circles in final page pixels, preserving seams. */
export function traceAssemblyHoleCutterPaths(canvases, width, height, {
  rotate = false, exclusiveCore = false, scale, cropRect = [0, 0, width, height],
} = {}) {
  const originals = canvases.map(getAssemblyCutterSource);
  if (!originals.every(Boolean)) return null;
  const faceWidth = rotate ? height : width, faceHeight = rotate ? width : height;
  const physicalScale = scale ?? faceWidth / originals[0].canvas.width;
  const [cropX, cropY, cropWidth, cropHeight] = cropRect;
  const sources = originals.map(({ canvas }) => {
    const full = createCanvas(width, height);
    const ctx = full.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (rotate) {
      ctx.translate(0, height);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(canvas, 0, 0, faceWidth, faceHeight);
    const cropped = createCanvas(cropWidth, cropHeight);
    cropped.getContext('2d').drawImage(full, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return cropped;
  });
  if (exclusiveCore) excludeDecorPixels(sources[0], sources[1]);
  const circles = originals[0].circles.map(({ cx, cy, radius }) => ({
    cx: (rotate ? cy : cx) * physicalScale - cropX,
    cy: (rotate ? faceWidth - cx * physicalScale : cy * physicalScale) - cropY,
    radius: radius * physicalScale,
  })).filter(({ cx, cy, radius }) => cx + radius > 0 && cx - radius < cropWidth && cy + radius > 0 && cy - radius < cropHeight);
  // A4 uses 20 px/mm; circle chord error is at most 0.005 mm.
  return traceCutterPathsWithCircularHoles(sources, circles, { tolerance: 0.1 });
}

export function traceCuteTorsoCutterPaths(canvases, width, height, { rotate = false, exclusiveCore = false } = {}) {
  const sources = canvases.map(getUntaperedCuteTorsoCanvas);
  if (!sources.every(Boolean)) return null;
  const sourceWidth = sources[0].width;
  const sourceHeight = sources[0].height;
  if (exclusiveCore) {
    // Match merged printing: an opaque decor pixel owns its area, including
    // alphaThreshold=1 where the legacy core can also fill that source pixel.
    const core = createCanvas(sourceWidth, sourceHeight);
    core.getContext('2d').drawImage(sources[0], 0, 0);
    excludeDecorPixels(core, sources[1]);
    sources[0] = core;
  }
  // Merge and validate each unique edge in the original rectangular face.
  // Every source segment is horizontal/vertical, so transforming its endpoints
  // exactly represents the entire segment, including shared junctions.
  const paths = traceCutterPaths(sources, { traceScale: 1 });
  const faceWidth = rotate ? height : width;
  const faceHeight = rotate ? width : height;
  return paths.map(({ points, closed }) => ({
    closed,
    points: points.map((point) => {
      const [x, y] = mapCuteTorsoStickerPoint(point, sourceWidth, sourceHeight, faceWidth, faceHeight);
      return rotate ? [y, faceWidth - x] : [x, y];
    }),
  }));
}

export function translateCutterPaths(paths, x, y) {
  return paths.map(({ points, closed }) => ({
    closed, points: points.map(([px, py]) => [px + x, py + y]),
  }));
}
