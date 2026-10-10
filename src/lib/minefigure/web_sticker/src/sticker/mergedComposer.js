/** Experimental A4 layout: print core/decor together, cut their masks separately. */

import { createCanvas, resolveVoxelConsistency } from './skinHelper.js';
import { PART_PIXELS_PER_UNIT } from '../../../shared/assemblySettings.js';
import { generateParts, disposeStickerParts, pasteWithDilate, DILATE_TIMES } from './stickerCore.js';
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

// MessageChannel yields to input/rendering without background timer throttling.
async function yieldToPage(signal) {
  await new Promise(resolve => {
    if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
  signal?.throwIfAborted();
}

function disposeFaceImages(groups) {
  const canvases = new Set(groups.flatMap(group => group.rows.flatMap(row =>
    row.faces.flatMap(face => face.pieces.flatMap(piece => [piece.image, piece.coreImage, piece.decorImage])))));
  for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 1;
}

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

function createLayoutConfig(preview = false) {
  const scale = preview ? 0.2 : 1;
  return {
    preview: !!preview,
    scale,
    pageWidth: Math.round(PAGE_WIDTH * scale),
    pageHeight: Math.round(PAGE_HEIGHT * scale),
    padding: Math.round(PADDING * scale),
    safeWidth: Math.round(SAFE_WIDTH * scale),
    groupGap: Math.round(GROUP_GAP * scale),
    faceGap: Math.round(FACE_GAP * scale),
    rowGap: Math.round(ROW_GAP * scale),
    inset: Math.round(INSET * scale),
    titleHeight: Math.round(TITLE_HEIGHT * scale),
    labelHeight: Math.round(LABEL_HEIGHT * scale),
    compactLabelHeight: Math.round(88 * scale),
    splitGap: Math.round(SPLIT_GAP * scale),
    dilateTimes: preview ? 1 : DILATE_TIMES,
  };
}

function combineFace(parts, partIndex, faceIndex, scale, split, layoutConfig) {
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
  combined.width = combined.height = 1;

  if (layoutConfig?.preview) {
    if (!split || faceIndex < 2) {
      return { faceIndex, width: image.width, height: image.height, pieces: [{ image, y: 0 }] };
    }
    const half = Math.floor(image.height / 2);
    const upper = crop(image, 0, half);
    const lower = crop(image, half + 1, image.height - half - 1);
    return {
      faceIndex, width: image.width, height: upper.height + layoutConfig.splitGap + lower.height,
      pieces: [
        { image: upper, y: 0 },
        { image: lower, y: half + layoutConfig.splitGap },
      ],
    };
  }

  if (!split || faceIndex < 2) {
    const vectorPaths = traceCuteTorsoCutterPaths([core, decor], image.width, image.height, { exclusiveCore: true })
      ?? traceAssemblyHoleCutterPaths([core, decor], image.width, image.height, { exclusiveCore: true, scale });
    if (vectorPaths) {
      return { faceIndex, width: image.width, height: image.height, pieces: [{ image, vectorPaths, y: 0 }] };
    }
  }

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
    return { faceIndex, width: image.width, height: image.height, pieces: [{ image, coreImage, decorImage, y: 0 }] };
  }

  // Equivalent to the legacy rotate90 + splitLimb, displayed upright: omit
  // the same single center row, preserve each half's size and the 20px gap.
  const half = Math.floor(image.height / 2);
  const upper = crop(image, 0, half);
  const lower = crop(image, half + 1, image.height - half - 1);
  return {
    faceIndex, width: image.width, height: upper.height + (layoutConfig?.splitGap ?? SPLIT_GAP) + lower.height,
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
        y: half + (layoutConfig?.splitGap ?? SPLIT_GAP),
        vectorPaths: traceAssemblyHoleCutterPaths([core, decor], image.width, image.height,
          { exclusiveCore: true, scale, cropRect: [0, half + 1, image.width, lower.height] }),
      },
    ],
  };
}

function prepareGroup(part, parts, scale, width, layoutConfig, allowReflow = false) {
  const faceGap = layoutConfig?.faceGap ?? FACE_GAP;
  const inset = layoutConfig?.inset ?? INSET;
  const labelHeight = layoutConfig?.labelHeight ?? LABEL_HEIGHT;
  const titleHeight = layoutConfig?.titleHeight ?? TITLE_HEIGHT;
  const rowGap = layoutConfig?.rowGap ?? ROW_GAP;
  let faceRows = part.rows;
  const faceWidth = face => Math.floor(parts[`${part.index}/${face}/0`].width * scale);
  const maxWidth = width - inset * 2;
  if (allowReflow && faceRows.some(row => row.reduce((sum, face) => sum + faceWidth(face), 0) + faceGap * (row.length - 1) > maxWidth)) {
    faceRows = [[]];
    let occupiedWidth = 0;
    for (const face of part.rows.flat()) {
      let row = faceRows[faceRows.length - 1];
      if (row.length && occupiedWidth + faceGap + faceWidth(face) > maxWidth) {
        row = [];
        faceRows.push(row);
        occupiedWidth = 0;
      }
      occupiedWidth += (row.length ? faceGap : 0) + faceWidth(face);
      row.push(face);
    }
  }
  const rows = faceRows.map((indices) => {
    const faces = indices.map((face) => combineFace(parts, part.index, face, scale, part.split, layoutConfig));
    const rowWidth = faces.reduce((sum, face) => sum + face.width, 0) + faceGap * (faces.length - 1);
    if (rowWidth > width - inset * 2) throw new Error(`${part.title} 超出 A4 布局，已保留原尺寸并停止生成`);
    return { faces, width: rowWidth, height: Math.max(...faces.map((face) => face.height)) + labelHeight };
  });
  return {
    ...part, rows, width,
    height: titleHeight + rows.reduce((sum, row) => sum + row.height, 0) + rowGap * (rows.length - 1) + inset,
  };
}

/** Pack complete faces at their existing scale, including split-piece gaps. */
function prepareCompactSheet(groups, startY, maxBottom, layoutConfig) {
  const { safeWidth, faceGap, rowGap, compactLabelHeight } = layoutConfig;
  const faces = groups.flatMap(group => group.rows.flatMap(row => row.faces.map(face => ({
    face, title: group.title, height: face.height + compactLabelHeight,
  }))));
  const ordered = faces.map((item, order) => ({ ...item, order })).sort((a, b) =>
    b.height - a.height || b.face.width - a.face.width || a.order - b.order);
  const compactRows = [];
  for (const item of ordered) {
    if (item.face.width > safeWidth) return null;
    let bestRow = null;
    let bestWaste = Infinity;
    // Height decreases in this order, so fitting an existing row adds no height.
    for (const row of compactRows) {
      const width = row.width + faceGap + item.face.width;
      const waste = safeWidth - width;
      if (waste >= 0 && waste < bestWaste) {
        bestRow = row;
        bestWaste = waste;
      }
    }
    if (!bestRow) {
      bestRow = { items: [], width: 0, height: item.height };
      compactRows.push(bestRow);
    }
    bestRow.width += (bestRow.items.length ? faceGap : 0) + item.face.width;
    bestRow.items.push(item);
  }
  const groupsBottom = startY + compactRows.reduce((sum, row) => sum + row.height, 0)
    + rowGap * Math.max(0, compactRows.length - 1);
  return groupsBottom <= maxBottom ? { compactRows, groupsBottom } : null;
}

function drawFace(printCtx, layerContexts, face, x, y, vectorPaths, layoutConfig) {
  for (const piece of face.pieces) {
    const pieceY = y + piece.y;
    if (layoutConfig.preview) {
      // Screen previews only need the face colors and socket holes. Print bleed
      // and independent cutter masks are generated when an export is requested.
      printCtx.fillStyle = '#f0f0f0';
      printCtx.fillRect(x, pieceY, piece.image.width, piece.image.height);
      printCtx.drawImage(piece.image, x, pieceY);
      continue;
    }
    pasteWithDilate(printCtx, piece.image, [x, pieceY], layoutConfig.dilateTimes, [240, 240, 240, 255]);
    if (!layerContexts.length) continue;
    if (piece.vectorPaths) {
      vectorPaths.push(...translateCutterPaths(piece.vectorPaths, x, pieceY));
    } else if (piece.coreImage && piece.decorImage) {
      layerContexts[0].drawImage(piece.coreImage, x, pieceY);
      layerContexts[1].drawImage(piece.decorImage, x, pieceY);
    }
  }
}

function drawGroup(printCtx, layerContexts, group, x, y, height, vectorPaths, layoutConfig) {
  const scale = layoutConfig?.scale ?? 1;
  const inset = layoutConfig?.inset ?? INSET;
  const titleHeight = layoutConfig?.titleHeight ?? TITLE_HEIGHT;
  const labelHeight = layoutConfig?.labelHeight ?? LABEL_HEIGHT;
  const faceGap = layoutConfig?.faceGap ?? FACE_GAP;
  const rowGap = layoutConfig?.rowGap ?? ROW_GAP;

  printCtx.save();
  printCtx.strokeStyle = '#d4dde6';
  printCtx.lineWidth = Math.max(1, Math.round(2 * scale));
  printCtx.strokeRect(x, y, group.width, height);
  printCtx.restore();
  text(printCtx, group.title, x + inset, y + Math.round(14 * scale), Math.round(58 * scale));

  let rowY = y + titleHeight;
  for (const row of group.rows) {
    let faceX = x + Math.floor((group.width - row.width) / 2);
    for (const face of row.faces) {
      text(printCtx, FACE_LABELS[face.faceIndex], faceX + face.width / 2, rowY, Math.round(40 * scale), { align: 'center' });
      drawFace(printCtx, layerContexts, face, faceX, rowY + labelHeight, vectorPaths, layoutConfig);
      faceX += face.width + faceGap;
    }
    rowY += row.height + rowGap;
  }
}

function drawCharacterGuides(ctx, skin, groupsBottom, cuteMode, layoutConfig) {
  const scale = layoutConfig?.scale ?? 1;
  const pageHeight = layoutConfig?.pageHeight ?? PAGE_HEIGHT;
  const padding = layoutConfig?.padding ?? PADDING;
  const rowGap = layoutConfig?.rowGap ?? ROW_GAP;
  const faceGap = layoutConfig?.faceGap ?? FACE_GAP;
  const groupGap = layoutConfig?.groupGap ?? GROUP_GAP;
  const pageWidth = layoutConfig?.pageWidth ?? PAGE_WIDTH;

  const labelHeight = Math.round(116 * scale);
  const height = Math.min(Math.round(1000 * scale), pageHeight - padding - groupsBottom - rowGap - labelHeight);
  if (height < Math.round(320 * scale)) throw new Error('A4 下方没有足够空间放置完整角色参考图');
  const width = Math.round(height * 0.56);
  const y = pageHeight - padding - height - labelHeight;
  const views = [
    { label: 'Front', direction: [0.35, 0.18, 1], screenLeft: 'RIGHT', screenRight: 'LEFT' },
    { label: 'Back', direction: [-0.35, 0.18, -1], screenLeft: 'LEFT', screenRight: 'RIGHT' },
  ];
  for (const [index, view] of views.entries()) {
    const x = padding + index * (width + faceGap);
    const image = renderSkinPreview({
      skin, outputSize: [width, height], camFront: view.direction,
      coreOpacity: 1, decorOpacity: 1, fitToBounds: true, unlit: true, cuteMode, voxelMode: true,
    });
    ctx.drawImage(image, x, y);
    const sideSize = Math.min(Math.round(40 * scale), Math.floor(width / 7));
    text(ctx, view.screenLeft, x + width / 4, y + height + Math.round(10 * scale), sideSize, { align: 'center' });
    text(ctx, view.screenRight, x + width * 3 / 4, y + height + Math.round(10 * scale), sideSize, { align: 'center' });
    text(ctx, view.label, x + width / 2, y + height + Math.round(64 * scale), Math.round(40 * scale), { align: 'center' });
  }
  const infoX = padding + 2 * (width + faceGap) + groupGap;
  return { x: infoX, y, width: pageWidth - padding - infoX, height: height + labelHeight };
}

/** Preserve physical sticker scale, fixed-size sockets and gray bleed. */
export async function composeMergedPages(skin, { alphaThreshold = 0.5, cuteMode = false, modelScale = 1, assemblySettings: inputSettings, preview = false, signal } = {}, onProgress = null) {
  signal?.throwIfAborted();
  const assemblySettings = normalizeAssemblySettings(inputSettings, cuteMode, modelScale);
  const layoutConfig = createLayoutConfig(preview);
  onProgress?.(5, preview ? '正在快速生成预览贴纸...' : '正在准备内外层合并实验模式...');
  resolveVoxelConsistency(skin);
  const rasterScale = preview ? 0.2 : 1;
  const parts = generateParts(skin, alphaThreshold, { cuteMode, modelScale, assemblySettings, outerOnly: true, rasterScale });
  const scale = (542 * layoutConfig.scale) / (9 * PART_PIXELS_PER_UNIT * rasterScale);
  const groupWidth = Math.floor((layoutConfig.safeWidth - layoutConfig.groupGap) / 2);
  const groups = [];
  try {
    for (const [index, part] of PARTS.entries()) {
      await yieldToPage(signal);
      onProgress?.(5 + (index + 1) / PARTS.length * 10, '正在准备贴纸部件...');
      signal?.throwIfAborted();
      groups.push(prepareGroup({ ...part, split: shouldSplitLimb(part.index, assemblySettings) }, parts, scale, groupWidth, layoutConfig, modelScale > 1));
    }
  } catch (error) {
    disposeFaceImages(groups);
    throw error;
  } finally {
    disposeStickerParts(parts);
  }
  const pageCanvases = [];
  let complete = false;
  try {
    const rowHeights = [0, 2, 4].map((index) => Math.max(groups[index].height, groups[index + 1].height));
    const startY = layoutConfig.padding + Math.round(180 * layoutConfig.scale);
    const maxBottom = layoutConfig.pageHeight - layoutConfig.padding - layoutConfig.rowGap - Math.round(436 * layoutConfig.scale);
    const compactSheet = cuteMode && modelScale > 1 ? prepareCompactSheet(groups, startY, maxBottom, layoutConfig) : null;
    const groupsBottom = compactSheet?.groupsBottom ?? startY + rowHeights.reduce((sum, height) => sum + height, 0) + layoutConfig.groupGap * 2;
    if (groupsBottom > layoutConfig.pageHeight - layoutConfig.padding) {
      throw new Error('合并后的部件超出单张 A4，已保留实际尺寸并停止生成');
    }

    const pageCanvas = createCanvas(layoutConfig.pageWidth, layoutConfig.pageHeight);
    // Cutting uses the two independent masks plus analytic hole/taper paths.
    // A third full A4 mask would never be read by generatePageCutterSVG.
    const cutterLayers = preview ? [] : [createCanvas(layoutConfig.pageWidth, layoutConfig.pageHeight), createCanvas(layoutConfig.pageWidth, layoutConfig.pageHeight)];
    pageCanvases.push(pageCanvas, ...cutterLayers);
    const layerContexts = cutterLayers.map((canvas) => canvas.getContext('2d'));
    const vectorPaths = [];
    const printCtx = pageCanvas.getContext('2d');
    printCtx.fillStyle = '#ffffff';
    printCtx.fillRect(0, 0, layoutConfig.pageWidth, layoutConfig.pageHeight);

    if (compactSheet) {
      let rowY = startY;
      for (const [index, row] of compactSheet.compactRows.entries()) {
        onProgress?.(20 + index / compactSheet.compactRows.length * 65, '正在排版 CUTE-10cm 贴纸...');
        await yieldToPage(signal);
        let faceX = layoutConfig.padding + Math.floor((layoutConfig.safeWidth - row.width) / 2);
        for (const { face, title } of row.items) {
          text(printCtx, title, faceX + face.width / 2, rowY, 34 * layoutConfig.scale, { align: 'center' });
          text(printCtx, FACE_LABELS[face.faceIndex], faceX + face.width / 2, rowY + Math.round(40 * layoutConfig.scale), 34 * layoutConfig.scale, { align: 'center' });
          drawFace(printCtx, layerContexts, face, faceX, rowY + layoutConfig.compactLabelHeight, vectorPaths, layoutConfig);
          faceX += face.width + layoutConfig.faceGap;
        }
        rowY += row.height + layoutConfig.rowGap;
      }
    } else {
      let rowY = startY;
      for (let row = 0; row < 3; row++) {
        onProgress?.(20 + row * 20, preview ? '正在排版预览贴纸...' : `正在排版合并贴纸：第 ${row + 1} / 3 组...`);
        await yieldToPage(signal);
        for (let col = 0; col < 2; col++) {
          drawGroup(printCtx, layerContexts, groups[row * 2 + col], layoutConfig.padding + col * (groupWidth + layoutConfig.groupGap), rowY, rowHeights[row], vectorPaths, layoutConfig);
        }
        rowY += rowHeights[row] + layoutConfig.groupGap;
      }
    }

    if (!preview) {
      onProgress?.(90, '正在渲染完整角色正面与背面参考图...');
      await yieldToPage(signal);
    }
    const infoY = groupsBottom + layoutConfig.rowGap;
    const infoArea = preview
      ? { x: layoutConfig.padding, y: infoY, width: layoutConfig.safeWidth, height: layoutConfig.pageHeight - layoutConfig.padding - infoY }
      : drawCharacterGuides(printCtx, skin, groupsBottom, cuteMode, layoutConfig);
    onProgress?.(100, preview ? '预览贴纸已生成' : '合并完成：全部部件已排入 1 张 A4！');
    signal?.throwIfAborted();
    complete = true;
    return [{
      pageIdx: 0,
      pageCanvas,
      cutterCanvas: null,
      cutterLayers,
      cutterTraceOptions: { vectorPaths },
      infoArea,
      layoutMode: 'merged',
      cuteMode,
      modelScale,
      assemblySettings,
      title: `A4 1 · 全部部件（${cuteMode ? 'Cute · ' : ''}实验）`,
      faceCount: 36,
      isPreview: !!preview,
    }];
  } finally {
    disposeFaceImages(groups);
    if (!complete) for (const canvas of pageCanvases) canvas.width = canvas.height = 1;
  }
}
