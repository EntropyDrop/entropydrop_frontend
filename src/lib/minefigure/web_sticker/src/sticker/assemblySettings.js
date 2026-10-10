import { ASSEMBLY_HOLES, assemblyFaceSize, stickerHoleCircle } from '../../../shared/assemblySettings.js';
import { createCanvas } from './skinHelper.js';
export { ASSEMBLY_HOLES, ASSEMBLY_STORAGE_KEY, PART_PIXELS_PER_MM, normalizeAssemblySettings, shouldSplitLimb } from '../../../shared/assemblySettings.js';

const cutterSources = new WeakMap();

/** Retain the unpunched layer and exact circles for vector cutting geometry. */
export function getAssemblyCutterSource(canvas) {
  return cutterSources.get(canvas);
}

/** Use pixel centres so circles keep their specified physical diameter. */
export function punchAssemblyHoles(parts, settings, { rasterScale = 1, cuteMode = false, isSlim = false, modelScale = 1, retainCutterSources = true } = {}) {
  for (const hole of ASSEMBLY_HOLES) {
    if (settings.holeDiameters[hole.id] === 0) continue;
    for (const layer of ['0', 'core']) {
      const canvas = parts[`${hole.face}/${layer}`];
      if (!canvas) continue;
      // Validate in the export's physical coordinates before mapping to a
      // lightweight preview. Socket diameters and offsets must not grow when
      // the face bitmap gets smaller.
      const [partIndex, faceIndex] = hole.face.split('/').map(Number);
      const size = rasterScale === 1 ? canvas : assemblyFaceSize(partIndex, faceIndex, isSlim, cuteMode, modelScale);
      const circle = stickerHoleCircle(hole, size.width, size.height, settings);
      const cx = rasterScale === 1 ? circle.cx : circle.cx * canvas.width / size.width;
      const cy = rasterScale === 1 ? circle.cy : circle.cy * canvas.height / size.height;
      const radius = circle.radius * rasterScale;
      if (retainCutterSources) {
        let source = cutterSources.get(canvas);
        if (!source) {
          const unpunched = createCanvas(canvas.width, canvas.height);
          unpunched.getContext('2d').drawImage(canvas, 0, 0);
          source = { canvas: unpunched, circles: [] };
          cutterSources.set(canvas, source);
        }
        source.circles.push({ cx, cy, radius });
      }
      const ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const radiusSq = radius * radius;
      for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(canvas.height, Math.ceil(cy + radius)); y++) {
        for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(canvas.width, Math.ceil(cx + radius)); x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radiusSq) {
            pixels.data[(y * canvas.width + x) * 4 + 3] = 0;
          }
        }
      }
      ctx.putImageData(pixels, 0, 0);
    }
  }
}
