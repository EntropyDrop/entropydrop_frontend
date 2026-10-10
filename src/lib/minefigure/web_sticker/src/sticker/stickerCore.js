/**
 * Core voxel slicing, layer carving, hole punching, and dilation engine.
 * Browser port of mc_sticker.py `gen_parts` and image filters.
 */

import { createCanvas } from './skinHelper.js';
import { resizeCanvasNearest } from './rasterTransform.js';
import { CUTE_HEIGHT, cuteSourceRow, transformCuteSticker } from './characterShape.js';
import { normalizeAssemblySettings, punchAssemblyHoles } from './assemblySettings.js';
import { PART_PIXELS_PER_UNIT } from '../../../shared/assemblySettings.js';

export const OUTPUT_SCALE = PART_PIXELS_PER_UNIT;
export const DILATE_TIMES = 6;

/**
 * 4-connectivity cross dilation on an image with +2px padding per iteration.
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function crossDilateWithPadding(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const newW = w + 2;
  const newH = h + 2;

  const result = createCanvas(newW, newH);
  const rCtx = result.getContext('2d', { willReadFrequently: true });
  rCtx.imageSmoothingEnabled = false;

  // Draw 4 directional offsets: (1, 0), (1, 2), (0, 1), (2, 1)
  const crossOffsets = [
    [1, 0], // Top
    [1, 2], // Bottom
    [0, 1], // Left
    [2, 1], // Right
  ];

  for (const [ox, oy] of crossOffsets) {
    rCtx.drawImage(canvas, ox, oy);
  }

  // Draw center on top
  rCtx.drawImage(canvas, 1, 1);
  return result;
}

/**
 * Punches a centered square hole into a canvas (alpha = 0).
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {number} holeWidthRatio
 * @param {number} holeHeightRatio
 */
export function punchSquareHole(canvas, holeWidthRatio, holeHeightRatio) {
  const w = canvas.width;
  const h = canvas.height;
  const x0 = Math.floor((w - w * holeWidthRatio) / 2);
  const y0 = Math.floor((h - h * holeHeightRatio) / 2);
  const x1 = Math.floor((w + w * holeWidthRatio) / 2);
  const y1 = Math.floor((h + h * holeHeightRatio) / 2);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const idx = (y * w + x) * 4;
      data[idx + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Punches a circular hole into a canvas (alpha = 0).
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {[number, number]} location [normX, normY]
 * @param {number} circleRadiusRatio radius relative to canvas width
 */
export function punchHole(canvas, location, circleRadiusRatio) {
  const w = canvas.width;
  const h = canvas.height;
  const cx = Math.floor(w * location[0]);
  const cy = Math.floor(h * location[1]);
  const r = Math.floor(w * circleRadiusRatio);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Pillow ImageDraw.ellipse uses bounding box [cx - r, cy - r, cx + r, cy + r]
  // Semi-axes are r + 0.5 to cover the bounding box
  const rBound = r + 0.5;
  const rSq = rBound * rBound;
  const yStart = Math.max(0, cy - r);
  const yEnd = Math.min(h - 1, cy + r);
  const xStart = Math.max(0, cx - r);
  const xEnd = Math.min(w - 1, cx + r);

  for (let y = yStart; y <= yEnd; y++) {
    const dy = y - cy;
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= rSq) {
        const idx = (y * w + x) * 4;
        data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Pastes an image with cross-dilation and background color.
 * @param {CanvasRenderingContext2D} pgCtx Target page context
 * @param {HTMLCanvasElement | OffscreenCanvas} img Source image
 * @param {[number, number]} offset [x, y]
 * @param {number} dilateTimes Number of dilation passes (e.g. 6)
 * @param {[number, number, number, number]} bgColor RGBA [240, 240, 240, 255]
 */
export function pasteWithDilate(pgCtx, img, offset, dilateTimes, bgColor = [0, 0, 0, 0]) {
  let cur = img;
  let newX = offset[0];
  let newY = offset[1];

  for (let i = 0; i < dilateTimes; i++) {
    cur = crossDilateWithPadding(cur);
    newX -= 1;
    newY -= 1;
  }

  if (bgColor[3] > 0) {
    // Match Python's Image.new("RGBA", img.size, bg_color): retain the
    // backing across the whole padded rectangle, including transparent areas.
    const bgCanvas = createCanvas(cur.width, cur.height);
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`;
    bgCtx.fillRect(0, 0, cur.width, cur.height);
    // Composite the dilated graphic on top of the solid backing.
    bgCtx.drawImage(cur, 0, 0);

    pgCtx.drawImage(bgCanvas, newX, newY);
  } else {
    pgCtx.drawImage(cur, newX, newY);
  }
}

/**
 * Splits a limb vertically down the middle with +20px gap.
 * @param {CanvasRenderingContext2D} pgCtx Target canvas context
 * @param {HTMLCanvasElement | OffscreenCanvas} tmp Image to split
 * @param {[number, number]} offset [x, y]
 * @param {number} dilateTimes
 * @param {[number, number, number, number]} bgColor
 */
export function splitLimb(pgCtx, tmp, offset, dilateTimes, bgColor = [0, 0, 0, 0]) {
  const halfW = Math.floor(tmp.width / 2);
  const h = tmp.height;

  // Left half [0, halfW]
  const tmpLow = createCanvas(halfW, h);
  const ctxLow = tmpLow.getContext('2d');
  ctxLow.drawImage(tmp, 0, 0, halfW, h, 0, 0, halfW, h);

  // Right half [halfW + 1, width]
  const rightW = tmp.width - (halfW + 1);
  const tmpHigh = createCanvas(rightW, h);
  const ctxHigh = tmpHigh.getContext('2d');
  ctxHigh.drawImage(tmp, halfW + 1, 0, rightW, h, 0, 0, rightW, h);

  pasteWithDilate(pgCtx, tmpLow, offset, dilateTimes, bgColor);
  pasteWithDilate(pgCtx, tmpHigh, [offset[0] + halfW + 20, offset[1]], dilateTimes, bgColor);
}

/**
 * Generates all sticker slice layers and core images for all 6 character parts.
 * @param {SkinData} skin
 * @param {number} [alphaThreshold=0.5]
 * @returns {Record<string, HTMLCanvasElement>} Map of 'partIdx/faceIdx/layerName' -> Canvas
 */
export function generateParts(skin, alphaThreshold = 0.5, { cuteMode = false, modelScale = 1, assemblySettings: inputSettings } = {}) {
  const assemblySettings = normalizeAssemblySettings(inputSettings, cuteMode, modelScale);
  const isSlim = skin.isSlim;
  const threshVal = (alphaThreshold !== null && alphaThreshold !== undefined)
    ? (alphaThreshold <= 1.0 ? alphaThreshold * 255 : Number(alphaThreshold))
    : 128;
  // Match preprocessSkinAlpha: equality survives, including opaque pixels at
  // threshold 1. Zero alpha stays absent even when the threshold is zero.
  const visibleAlpha = (alpha) => alpha > 0 && alpha >= threshVal;
  const partsData = {}; // key: "partIdx/faceIdx/dz" or "partIdx/faceIdx/core"

  const partsConfig = [
    // 0: Head
    {
      partIdx: 0,
      decorOffset: [32, 0],
      faces: [
        { size: [8, 8, 8], offset: [8, 0] },   // 0: top
        { size: [8, 8, 8], offset: [16, 0] },  // 1: bottom
        { size: [8, 8, 8], offset: [8, 8] },   // 2: front
        { size: [8, 8, 8], offset: [24, 8] },  // 3: back
        { size: [8, 8, 8], offset: [16, 8] },  // 4: left
        { size: [8, 8, 8], offset: [0, 8] },   // 5: right
      ]
    },
    // 1: Body
    {
      partIdx: 1,
      decorOffset: [0, 16],
      faces: [
        { size: [8, 4, 12], offset: [20, 16] },      // 0: top
        { size: [8, 4, 12], offset: [28, 16] },      // 1: bottom
        { size: [8, 12, 4], offset: [20, 20] },      // 2: front
        { size: [8, 12, 4], offset: [32, 20] },      // 3: back
        { size: [4, 12, 8], offset: [28, 20] },      // 4: left
        { size: [4, 12, 8], offset: [16, 20] },      // 5: right
      ]
    },
    // 2: Left Arm
    {
      partIdx: 2,
      decorOffset: [16, 0],
      faces: [
        { size: [isSlim ? 3 : 4, 4, 12], offset: [36, 48] },                           // 0: top
        { size: [isSlim ? 3 : 4, 4, 12], offset: [40 - (isSlim ? 1 : 0), 48] },        // 1: bottom
        { size: [isSlim ? 3 : 4, 12, 4], offset: [36, 52] },                           // 2: front
        { size: [isSlim ? 3 : 4, 12, 4], offset: [44 - (isSlim ? 1 : 0), 52] },        // 3: back
        { size: [4, 12, 4], offset: [40 - (isSlim ? 1 : 0), 52] },                     // 4: left
        { size: [4, 12, 4], offset: [32, 52] },                                        // 5: right
      ]
    },
    // 3: Right Arm
    {
      partIdx: 3,
      decorOffset: [0, 16],
      faces: [
        { size: [isSlim ? 3 : 4, 4, 12], offset: [44, 16] },                           // 0: top
        { size: [isSlim ? 3 : 4, 4, 12], offset: [48 - (isSlim ? 1 : 0), 16] },        // 1: bottom
        { size: [isSlim ? 3 : 4, 12, 4], offset: [44, 20] },                           // 2: front
        { size: [isSlim ? 3 : 4, 12, 4], offset: [52 - (isSlim ? 1 : 0), 20] },        // 3: back
        { size: [4, 12, 4], offset: [48 - (isSlim ? 1 : 0), 20] },                     // 4: left
        { size: [4, 12, 4], offset: [40, 20] },                                        // 5: right
      ]
    },
    // 4: Left Leg
    {
      partIdx: 4,
      decorOffset: [-16, 0],
      faces: [
        { size: [4, 4, 12], offset: [20, 48] }, // 0: top
        { size: [4, 4, 12], offset: [24, 48] }, // 1: bottom
        { size: [4, 12, 4], offset: [20, 52] }, // 2: front
        { size: [4, 12, 4], offset: [28, 52] }, // 3: back
        { size: [4, 12, 4], offset: [24, 52] }, // 4: left
        { size: [4, 12, 4], offset: [16, 52] }, // 5: right
      ]
    },
    // 5: Right Leg
    {
      partIdx: 5,
      decorOffset: [0, 16],
      faces: [
        { size: [4, 4, 12], offset: [4, 16] },  // 0: top
        { size: [4, 4, 12], offset: [8, 16] },  // 1: bottom
        { size: [4, 12, 4], offset: [4, 20] },  // 2: front
        { size: [4, 12, 4], offset: [12, 20] }, // 3: back
        { size: [4, 12, 4], offset: [8, 20] },  // 4: left
        { size: [4, 12, 4], offset: [0, 20] },  // 5: right
      ]
    }
  ];

  for (const part of partsConfig) {
    if (cuteMode && part.partIdx !== 0) {
      part.faces = part.faces.map((face) => ({ ...face, size: face.size.map((n) => n === 12 ? CUTE_HEIGHT : n) }));
    }
    const partIdx = part.partIdx;
    const decorOffset = part.decorOffset;
    const [x, y, z] = part.faces[0].size; // Voxel dimensions

    // 3D Voxel Grid: colors[faceIdx][x][y][z] = [r, g, b, a] (每个面的颜色互不影响)
    const colors = Array.from({ length: 6 }, () =>
      Array.from({ length: x }, () =>
        Array.from({ length: y }, () =>
          Array.from({ length: z }, () => [0, 0, 0, 0])
        )
      )
    );

    // Initialize outer layer voxel colors for each face independently
    for (let faceIdx = 0; faceIdx < part.faces.length; faceIdx++) {
      const { size, offset } = part.faces[faceIdx];
      for (let dx = 0; dx < size[0]; dx++) {
        for (let dy = 0; dy < size[1]; dy++) {
          const sourceY = cuteMode && partIdx !== 0 && faceIdx >= 2 ? cuteSourceRow(dy) : dy;
          const c = skin.getPixel(offset[0] + dx + decorOffset[0], offset[1] + sourceY + decorOffset[1]);
          if (!visibleAlpha(c[3])) continue;
          c[3] = 255;

          if (faceIdx === 0) { // top
            colors[0][dx][y - 1 - dy][z - 1] = c;
          } else if (faceIdx === 1) { // bottom
            colors[1][dx][y - 1 - dy][0] = c;
          } else if (faceIdx === 2) { // front
            colors[2][dx][0][z - 1 - dy] = c;
          } else if (faceIdx === 3) { // back
            colors[3][x - 1 - dx][y - 1][z - 1 - dy] = c;
          } else if (faceIdx === 4) { // left
            colors[4][x - 1][dx][z - 1 - dy] = c;
          } else if (faceIdx === 5) { // right
            colors[5][0][y - 1 - dx][z - 1 - dy] = c;
          }
        }
      }
    }

    // Extract slice layers for each face
    for (let faceIdx = 0; faceIdx < part.faces.length; faceIdx++) {
      const { size, offset } = part.faces[faceIdx];
      const decorScaleW = (size[0] + (partIdx === 0 ? 1 : 0.5)) / size[0];
      const decorScaleH = (size[1] + (partIdx === 0 ? 1 : 0.5)) / size[1];

      const maxDz = size[2] - (isSlim && (faceIdx === 4 || faceIdx === 5) && (partIdx === 2 || partIdx === 3) ? 1 : 0);
      const outW = Math.floor(size[0] * decorScaleW * OUTPUT_SCALE);
      const outH = Math.floor(size[1] * decorScaleH * OUTPUT_SCALE);

      for (let dz = 0; dz < maxDz; dz++) {
        // Build small slice
        const sliceSmall = createCanvas(size[0], size[1]);
        const sCtx = sliceSmall.getContext('2d');
        const sImgData = sCtx.createImageData(size[0], size[1]);
        const sData = sImgData.data;

        for (let dx = 0; dx < size[0]; dx++) {
          for (let dy = 0; dy < size[1]; dy++) {
            let vx, vy, vz, vx_prev, vy_prev, vz_prev;
            if (faceIdx === 0) { // top
              vx = dx; vy = y - 1 - dy; vz = z - 1 - dz;
              vx_prev = dx; vy_prev = y - 1 - dy; vz_prev = z - 1 - dz + 1;
            } else if (faceIdx === 1) { // bottom
              vx = x - 1 - dx; vy = y - 1 - dy; vz = dz;
              vx_prev = x - 1 - dx; vy_prev = y - 1 - dy; vz_prev = dz - 1;
            } else if (faceIdx === 2) { // front
              vx = dx; vy = dz; vz = z - 1 - dy;
              vx_prev = dx; vy_prev = dz - 1; vz_prev = z - 1 - dy;
            } else if (faceIdx === 3) { // back
              vx = x - 1 - dx; vy = y - 1 - dz; vz = z - 1 - dy;
              vx_prev = x - 1 - dx; vy_prev = y - 1 - dz + 1; vz_prev = z - 1 - dy;
            } else if (faceIdx === 4) { // left
              vx = x - 1 - dz; vy = dx; vz = z - 1 - dy;
              vx_prev = x - 1 - dz + 1; vy_prev = dx; vz_prev = z - 1 - dy;
            } else if (faceIdx === 5) { // right
              vx = dz; vy = y - 1 - dx; vz = z - 1 - dy;
              vx_prev = dz - 1; vy_prev = y - 1 - dx; vz_prev = z - 1 - dy;
            }

            // 忽略重叠部分：前一层已有实体像素则跳过
            if (dz !== 0) {
              let hasPrev = false;
              for (let f = 0; f < 6; f++) {
                if (colors[f][vx_prev][vy_prev][vz_prev][3] !== 0) {
                  hasPrev = true;
                  break;
                }
              }
              if (hasPrev) continue;
            }

            let c;
            if (dz === 0) {
              c = colors[faceIdx][vx][vy][vz];
            } else {
              c = colors[faceIdx][vx][vy][vz];
              if (c[3] === 0) {
                for (let f = 0; f < 6; f++) {
                  if (colors[f][vx][vy][vz][3] !== 0) {
                    c = colors[f][vx][vy][vz];
                    break;
                  }
                }
              }
            }

            const pIdx = (dy * size[0] + dx) * 4;
            sData[pIdx] = c[0];
            sData[pIdx + 1] = c[1];
            sData[pIdx + 2] = c[2];
            sData[pIdx + 3] = c[3];
          }
        }
        sCtx.putImageData(sImgData, 0, 0);

        // Use the same explicit pixel sampling in every browser.
        const sliceOut = resizeCanvasNearest(sliceSmall, outW, outH);
        const outCtx = sliceOut.getContext('2d', { willReadFrequently: true });

        // Carve out center hollow box for inner layers (dz != 0)
        if (dz !== 0) {
          const coreBoxW = size[0] * OUTPUT_SCALE;
          const coreBoxH = size[1] * OUTPUT_SCALE;
          const x0 = Math.floor((outW - coreBoxW) / 2);
          const y0 = Math.floor((outH - coreBoxH) / 2);
          const x1 = Math.floor((outW + coreBoxW) / 2);
          const y1 = Math.floor((outH + coreBoxH) / 2);
          outCtx.clearRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        }

        partsData[`${partIdx}/${faceIdx}/${dz}`] = sliceOut;
      }

      // Generate base CORE layer
      // Crop core from base skin
      const coreW = size[0] * OUTPUT_SCALE;
      const coreH = size[1] * OUTPUT_SCALE;

      // Extract base face pixels
      const baseSmall = createCanvas(size[0], size[1]);
      const baseCtx = baseSmall.getContext('2d');
      baseCtx.imageSmoothingEnabled = false;
      if (cuteMode && partIdx !== 0 && faceIdx >= 2) {
        for (let row = 0; row < size[1]; row++) {
          baseCtx.drawImage(skin.canvas, offset[0], offset[1] + cuteSourceRow(row), size[0], 1, 0, row, size[0], 1);
        }
      } else {
        baseCtx.drawImage(skin.canvas, offset[0], offset[1], size[0], size[1], 0, 0, size[0], size[1]);
      }

      if (faceIdx === 1) {
        // Bottom slices are viewed from below: reverse the core's horizontal
        // axis too, including the head, so core/decor share one physical UV map.
        const orig = baseCtx.getImageData(0, 0, size[0], size[1]);
        const flipped = baseCtx.createImageData(size[0], size[1]);
        for (let y = 0; y < size[1]; y++) {
          for (let x = 0; x < size[0]; x++) {
            const srcIdx = (y * size[0] + x) * 4;
            const dstIdx = (y * size[0] + (size[0] - 1 - x)) * 4;
            flipped.data[dstIdx] = orig.data[srcIdx];
            flipped.data[dstIdx + 1] = orig.data[srcIdx + 1];
            flipped.data[dstIdx + 2] = orig.data[srcIdx + 2];
            flipped.data[dstIdx + 3] = orig.data[srcIdx + 3];
          }
        }
        baseCtx.putImageData(flipped, 0, 0);
      }

      const coreCanvas = resizeCanvasNearest(baseSmall, coreW, coreH);
      const coreCtx = coreCanvas.getContext('2d', { willReadFrequently: true });

      // Mask core against slice 0 alpha
      const slice0 = partsData[`${partIdx}/${faceIdx}/0`];
      const slice0Ctx = slice0.getContext('2d', { willReadFrequently: true });
      const slice0ImgData = slice0Ctx.getImageData(0, 0, outW, outH);
      const s0Data = slice0ImgData.data;

      const coreRes = createCanvas(outW, outH);
      const crCtx = coreRes.getContext('2d', { willReadFrequently: true });
      const crImgData = crCtx.createImageData(outW, outH);
      const crData = crImgData.data;

      const coreImgData = coreCtx.getImageData(0, 0, coreW, coreH);
      const cData = coreImgData.data;

      const padX = Math.floor((outW - coreW) / 2);
      const padY = Math.floor((outH - coreH) / 2);

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const outIdx = (y * outW + x) * 4;
          const s0Alpha = s0Data[outIdx + 3];

          // Show base only where decor is absent, within the core bounds.
          if (!visibleAlpha(s0Alpha) && x >= padX && x < padX + coreW && y >= padY && y < padY + coreH) {
            const cx = x - padX;
            const cy = y - padY;
            const cIdx = (cy * coreW + cx) * 4;
            const cAlpha = cData[cIdx + 3];

            if (visibleAlpha(cAlpha)) {
              crData[outIdx] = cData[cIdx];
              crData[outIdx + 1] = cData[cIdx + 1];
              crData[outIdx + 2] = cData[cIdx + 2];
              crData[outIdx + 3] = 255;
            }
          }
        }
      }
      crCtx.putImageData(crImgData, 0, 0);
      partsData[`${partIdx}/${faceIdx}/core`] = coreRes;
    }
  }

  // --- Hole Punching ---

  if (cuteMode) {
    for (const [key, canvas] of Object.entries(partsData)) {
      const [partIndex, faceIndex] = key.split('/').map(Number);
      partsData[key] = transformCuteSticker(canvas, partIndex, faceIndex, modelScale);
    }
  }
  // Punch after resizing: standard and Cute faces use the same millimetres.
  punchAssemblyHoles(partsData, assemblySettings);

  return partsData;
}
