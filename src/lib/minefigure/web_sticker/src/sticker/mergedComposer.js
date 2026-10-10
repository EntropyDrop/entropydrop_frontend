/** Experimental A4 layout: print core/decor together, cut their masks separately. */

import { createCanvas, resolveVoxelConsistency } from './skinHelper.js';
import { generateParts, pasteWithDilate, DILATE_TIMES } from './stickerCore.js';
import { PAGE_WIDTH, PAGE_HEIGHT, PADDING, SAFE_WIDTH, scaleImage } from './pageComposer.js';
import { renderSkinPreview } from './previewRenderer.js';
import { normalizeAssemblySettings, shouldSplitLimb } from './assemblySettings.js';
import { traceAssemblyHoleCutterPaths, traceCuteTorsoCutterPaths, translateCutterPaths } from './cutterGeometry.js';

const GROUP_GAP = 80;
const FACE_GAP = 40;
const ROW_GAP = 56;
const INSET = 32;
const TITLE_HEIGHT = 80;
const LABEL_HEIGHT = 50;
const SPLIT_GAP = 20;
const FACE_LABELS = ['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right'];
const PARTS = [
  { index: 0, title: 'HEAD', rows: [[2, 3, 4], [5, 0, 1]] },
  { index: 1, title: 'TORSO', rows: [[2, 3, 4, 5], [0, 1]] },
  { index: 2, title: 'LEFT ARM', rows: [[2, 3, 4, 5], [0, 1]] },
  { index: 3, title: 'RIGHT ARM', rows: [[2, 3, 4, 5], [0, 1]] },
  { index: 4, title: 'LEFT LEG', rows: [[2, 3, 4, 5], [0, 1]] },
  { index: 5, title: 'RIGHT LEG', rows: [[2, 3, 4, 5], [0, 1]] },
];

export const STICKER_FONT_FAMILY = '"Fusion-Pixel-Zh-Hans", monospace';

function text(ctx, value, x, y, size, { align = 'left' } = {}) {
  ctx.save();
  ctx.font = `${Math.max(12, Math.round(size / 12) * 12)}px ${STICKER_FONT_FAMILY}`;
  ctx.fillStyle = '#25364a';
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(value, Math.round(x), Math.round(y));
  ctx.restore();
}

function crop(canvas, y, height) {
  const piece = createCanvas(canvas.width, height);
  piece.getContext('2d').drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
  return piece;
}

function combineFace(parts, partIndex, faceIndex, scale, split) {
  const key = `${partIndex}/${faceIndex}`;
  const decor = parts[`${key}/0`];
  const core = parts[`${key}/core`];
  if (!decor || !core || decor.width !== core.width || decor.height !== core.height) {
    throw new Error(`部件 ${key} 的内外层尺寸不一致，无法合并`);
  }
  // Both masks have already received the same assembly holes. Core only fills
  // transparent decor pixels; source-over keeps the outer colors on top.
  const combined = createCanvas(decor.width, decor.height);
  const ctx = combined.getContext('2d');
  ctx.drawImage(core, 0, 0);
  ctx.drawImage(decor, 0, 0);
  const image = scaleImage(combined, scale);
  const coreImage = scaleImage(core, scale);
  const decorImage = scaleImage(decor, scale);
  // Assign printed pixels to one layer. In particular, alphaThreshold=1 can
  // produce a legacy core beneath opaque decor; it must not be cut twice.
  const coreCtx = coreImage.getContext('2d');
  const corePixels = coreCtx.getImageData(0, 0, coreImage.width, coreImage.height);
  const decorPixels = decorImage.getContext('2d').getImageData(0, 0, decorImage.width, decorImage.height).data;
  for (let i = 3; i < corePixels.data.length; i += 4) {
    if (decorPixels[i] > 128) corePixels.data[i] = 0;
  }
  coreCtx.putImageData(corePixels, 0, 0);
  if (!split || faceIndex < 2) {
    const vectorPaths = traceCuteTorsoCutterPaths([core, decor], image.width, image.height, { exclusiveCore: true })
      ?? traceAssemblyHoleCutterPaths([core, decor], image.width, image.height, { exclusiveCore: true, scale });
    return { faceIndex, width: image.width, height: image.height, pieces: [{ image, coreImage, decorImage, vectorPaths, y: 0 }] };
  }

  // Equivalent to the legacy rotate90 + splitLimb, displayed upright: omit
  // the same single center row, preserve each half's size and the 20px gap.
  const half = Math.floor(image.height / 2);
  const upper = crop(image, 0, half);
  const lower = crop(image, half + 1, image.height - half - 1);
  return {
    faceIndex, width: image.width, height: upper.height + SPLIT_GAP + lower.height,
    pieces: [
      {
        image: upper, coreImage: crop(coreImage, 0, half), decorImage: crop(decorImage, 0, half), y: 0,
        vectorPaths: traceAssemblyHoleCutterPaths([core, decor], image.width, image.height,
          { exclusiveCore: true, scale, cropRect: [0, 0, image.width, half] }),
      },
      {
        image: lower,
        coreImage: crop(coreImage, half + 1, lower.height),
        decorImage: crop(decorImage, half + 1, lower.height),
        y: half + SPLIT_GAP,
        vectorPaths: traceAssemblyHoleCutterPaths([core, decor], image.width, image.height,
          { exclusiveCore: true, scale, cropRect: [0, half + 1, image.width, lower.height] }),
      },
    ],
  };
}

function prepareGroup(part, parts, scale, width) {
  const rows = part.rows.map((indices) => {
    const faces = indices.map((face) => combineFace(parts, part.index, face, scale, part.split));
    const rowWidth = faces.reduce((sum, face) => sum + face.width, 0) + FACE_GAP * (faces.length - 1);
    if (rowWidth > width - INSET * 2) throw new Error(`${part.title} 超出 A4 布局，已保留原尺寸并停止生成`);
    return { faces, width: rowWidth, height: Math.max(...faces.map((face) => face.height)) + LABEL_HEIGHT };
  });
  return {
    ...part, rows, width,
    height: TITLE_HEIGHT + rows.reduce((sum, row) => sum + row.height, 0) + ROW_GAP * (rows.length - 1) + INSET,
  };
}

function drawGroup(printCtx, cutterCtx, layerContexts, group, x, y, height, vectorPaths) {
  printCtx.save();
  printCtx.strokeStyle = '#d4dde6';
  printCtx.lineWidth = 2;
  printCtx.strokeRect(x, y, group.width, height);
  printCtx.restore();
  text(printCtx, group.title, x + INSET, y + 14, 58);

  let rowY = y + TITLE_HEIGHT;
  for (const row of group.rows) {
    let faceX = x + Math.floor((group.width - row.width) / 2);
    for (const face of row.faces) {
      text(printCtx, FACE_LABELS[face.faceIndex], faceX + face.width / 2, rowY, 40, { align: 'center' });
      for (const piece of face.pieces) {
        const pieceY = rowY + LABEL_HEIGHT + piece.y;
        pasteWithDilate(printCtx, piece.image, [faceX, pieceY], DILATE_TIMES, [240, 240, 240, 255]);
        cutterCtx.drawImage(piece.image, faceX, pieceY);
        if (piece.vectorPaths) {
          vectorPaths.push(...translateCutterPaths(piece.vectorPaths, faceX, pieceY));
        } else {
          // Vector faces replace these masks, so there is no second raster cut.
          layerContexts[0].drawImage(piece.coreImage, faceX, pieceY);
          layerContexts[1].drawImage(piece.decorImage, faceX, pieceY);
        }
      }
      faceX += face.width + FACE_GAP;
    }
    rowY += row.height + ROW_GAP;
  }
}

function drawCharacterGuides(ctx, skin, groupsBottom, cuteMode) {
  const labelHeight = 116;
  const height = Math.min(1000, PAGE_HEIGHT - PADDING - groupsBottom - ROW_GAP - labelHeight);
  if (height < 320) throw new Error('A4 下方没有足够空间放置完整角色参考图');
  const width = Math.round(height * 0.56);
  const y = PAGE_HEIGHT - PADDING - height - labelHeight;
  const views = [
    { label: 'Front', direction: [0.35, 0.18, 1], screenLeft: 'RIGHT', screenRight: 'LEFT' },
    { label: 'Back', direction: [-0.35, 0.18, -1], screenLeft: 'LEFT', screenRight: 'RIGHT' },
  ];
  for (const [index, view] of views.entries()) {
    const x = PADDING + index * (width + FACE_GAP);
    const image = renderSkinPreview({
      skin, outputSize: [width, height], camFront: view.direction,
      coreOpacity: 1, decorOpacity: 1, fitToBounds: true, unlit: true, cuteMode, voxelMode: true,
    });
    ctx.drawImage(image, x, y);
    // Anatomical sides match LEFT/RIGHT ARM and LEG above. Looking at the
    // character's front reverses screen sides; looking at its back does not.
    const sideSize = Math.min(40, Math.floor(width / 7));
    text(ctx, view.screenLeft, x + width / 4, y + height + 10, sideSize, { align: 'center' });
    text(ctx, view.screenRight, x + width * 3 / 4, y + height + 10, sideSize, { align: 'center' });
    text(ctx, view.label, x + width / 2, y + height + 64, 40, { align: 'center' });
  }
  const infoX = PADDING + 2 * (width + FACE_GAP) + GROUP_GAP;
  return { x: infoX, y, width: PAGE_WIDTH - PADDING - infoX, height: height + labelHeight };
}

/** Keep the legacy 27.1mm head scale, holes, gray bleed and limb split geometry. */
export async function composeMergedPages(skin, { alphaThreshold = 0.5, cuteMode = false, assemblySettings: inputSettings } = {}, onProgress = null) {
  const assemblySettings = normalizeAssemblySettings(inputSettings, cuteMode);
  onProgress?.(5, '正在准备内外层合并实验模式...');
  resolveVoxelConsistency(skin);
  const parts = generateParts(skin, alphaThreshold, { cuteMode, assemblySettings });
  const scale = 542 / parts['0/0/0'].width;
  const groupWidth = Math.floor((SAFE_WIDTH - GROUP_GAP) / 2);
  const groups = PARTS.map((part) => prepareGroup({ ...part, split: shouldSplitLimb(part.index, assemblySettings) }, parts, scale, groupWidth));
  const rowHeights = [0, 2, 4].map((index) => Math.max(groups[index].height, groups[index + 1].height));
  const startY = PADDING + 180;
  const groupsBottom = startY + rowHeights.reduce((sum, height) => sum + height, 0) + GROUP_GAP * 2;
  if (groupsBottom > PAGE_HEIGHT - PADDING) {
    throw new Error('合并后的部件超出单张 A4，已保留实际尺寸并停止生成');
  }

  const pageCanvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const cutterCanvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  // Keep layer ownership in separate masks. The combined mask alone loses
  // the internal seams and is only retained for legacy raster consumers.
  const cutterLayers = [createCanvas(PAGE_WIDTH, PAGE_HEIGHT), createCanvas(PAGE_WIDTH, PAGE_HEIGHT)];
  const layerContexts = cutterLayers.map((canvas) => canvas.getContext('2d'));
  const vectorPaths = [];
  const printCtx = pageCanvas.getContext('2d');
  const cutterCtx = cutterCanvas.getContext('2d');
  printCtx.fillStyle = '#ffffff';
  printCtx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  let rowY = startY;
  for (let row = 0; row < 3; row++) {
    onProgress?.(20 + row * 20, `正在排版合并贴纸：第 ${row + 1} / 3 组...`);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    for (let col = 0; col < 2; col++) {
      drawGroup(printCtx, cutterCtx, layerContexts, groups[row * 2 + col], PADDING + col * (groupWidth + GROUP_GAP), rowY, rowHeights[row], vectorPaths);
    }
    rowY += rowHeights[row] + GROUP_GAP;
  }

  onProgress?.(90, '正在渲染完整角色正面与背面参考图...');
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const infoArea = drawCharacterGuides(printCtx, skin, groupsBottom, cuteMode);
  onProgress?.(100, '合并完成：全部部件已排入 1 张 A4！');
  return [{ pageIdx: 0, pageCanvas, cutterCanvas, cutterLayers, cutterTraceOptions: { vectorPaths }, infoArea, layoutMode: 'merged', cuteMode, assemblySettings, title: `A4 1 · 全部部件（${cuteMode ? 'Cute · ' : ''}实验）`, faceCount: 36 }];
}
