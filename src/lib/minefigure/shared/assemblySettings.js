import { CUTE_HEIGHT, CUTE_SCALE, CUTE_TAPER, cuteTorsoWidthFactor, cuteTorsoSideNormal } from './characterProportions.js';

export const ASSEMBLY_STORAGE_KEY = 'minefigure-sticker-assembly-settings';
export const DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM = 7.8;
export const MODEL_MM_PER_UNIT = 27.1 / 9;
export const PART_PIXELS_PER_UNIT = 50;
export const PART_PIXELS_PER_MM = PART_PIXELS_PER_UNIT / MODEL_MM_PER_UNIT;

export const ASSEMBLY_HOLES = [
  { id: 'headBottom', label: '头底 · 颈孔', face: '0/1', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 15.8 },
  { id: 'torsoTop', label: '躯干顶部 · 颈孔', face: '1/0', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 9 },
  { id: 'torsoLeftArm', label: '躯干左侧 · 手臂孔', face: '1/4', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, cuteDiameterMm: 4.1, cute10DiameterMm: 7.8, depthMm: 7.5, cuteDepthMm: 4, cute10DepthMm: 7 },
  { id: 'torsoRightArm', label: '躯干右侧 · 手臂孔', face: '1/5', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, cuteDiameterMm: 4.1, cute10DiameterMm: 7.8, depthMm: 7.5, cuteDepthMm: 4, cute10DepthMm: 7 },
  { id: 'torsoLeftLeg', label: '躯干底部 · 左腿孔', face: '1/1', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 8.1 },
  { id: 'torsoRightLeg', label: '躯干底部 · 右腿孔', face: '1/1', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 8.1 },
  { id: 'leftArm', label: '左臂 · 肩孔', face: '2/5', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, cuteDiameterMm: 4.1, cute10DiameterMm: 7.8, depthMm: 9, cuteDepthMm: 7, cute10DepthMm: 10 },
  { id: 'rightArm', label: '右臂 · 肩孔', face: '3/4', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, cuteDiameterMm: 4.1, cute10DiameterMm: 7.8, depthMm: 9, cuteDepthMm: 7, cute10DepthMm: 10 },
  { id: 'leftLeg', label: '左腿 · 顶孔', face: '4/0', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 9, cuteDepthMm: 12 },
  { id: 'rightLeg', label: '右腿 · 顶孔', face: '5/0', diameterMm: DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, depthMm: 9, cuteDepthMm: 12 },
];

// Each value is the inward depth on either side of that limb's split plane.
export const ASSEMBLY_JOINTS = [
  { id: 'leftArmJoint', label: '左臂中间 · 每侧', partIndex: 2, depthMm: 8.3 },
  { id: 'rightArmJoint', label: '右臂中间 · 每侧', partIndex: 3, depthMm: 8.3 },
  { id: 'leftLegJoint', label: '左腿中间 · 每侧', partIndex: 4, depthMm: 8.3 },
  { id: 'rightLegJoint', label: '右腿中间 · 每侧', partIndex: 5, depthMm: 8.3 },
];

export function normalizeAssemblySettings(settings = {}, cuteMode = false, modelScale = 1) {
  if (!settings || typeof settings !== 'object') throw new Error('装配设置格式无效');
  const cute10 = cuteMode && modelScale === 1.5;
  const holeDiameters = {};
  for (const hole of ASSEMBLY_HOLES) {
    const diameter = settings.holeDiameters?.[hole.id] ?? (cute10 ? hole.cute10DiameterMm : undefined)
      ?? (cuteMode ? hole.cuteDiameterMm ?? hole.diameterMm : hole.diameterMm);
    if (typeof diameter !== 'number' || !Number.isFinite(diameter) || diameter < 0 || diameter > 30) {
      throw new Error(`${hole.label}直径必须为 0–30 mm 的数字`);
    }
    holeDiameters[hole.id] = diameter;
  }
  const holeDepths = {};
  for (const hole of [...ASSEMBLY_HOLES, ...ASSEMBLY_JOINTS]) {
    const depth = settings.holeDepths?.[hole.id] ?? (cute10 ? hole.cute10DepthMm : undefined)
      ?? (cuteMode ? hole.cuteDepthMm ?? hole.depthMm : hole.depthMm);
    if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0.1 || depth > 50) {
      throw new Error(`${hole.label}深度必须为 0.1–50 mm 的数字`);
    }
    holeDepths[hole.id] = depth;
  }
  const wideArmHoleDepthMm = settings.wideArmHoleDepthMm ?? 11;
  if (typeof wideArmHoleDepthMm !== 'number' || !Number.isFinite(wideArmHoleDepthMm) || wideArmHoleDepthMm < 0.1 || wideArmHoleDepthMm > 50) {
    throw new Error('非 Cute 粗臂肩孔深度必须为 0.1–50 mm 的数字');
  }
  const stickerHoleAllowanceMm = settings.stickerHoleAllowanceMm ?? 1;
  if (typeof stickerHoleAllowanceMm !== 'number' || !Number.isFinite(stickerHoleAllowanceMm) || stickerHoleAllowanceMm < 0 || stickerHoleAllowanceMm > 10) {
    throw new Error('贴纸孔径补偿必须为 0–10 mm 的数字');
  }
  const torsoSideHoleTopDistanceMm = settings.torsoSideHoleTopDistanceMm ?? (cuteMode ? 5 : 7) * modelScale;
  if (typeof torsoSideHoleTopDistanceMm !== 'number' || !Number.isFinite(torsoSideHoleTopDistanceMm) || torsoSideHoleTopDistanceMm < 0 || torsoSideHoleTopDistanceMm > 50) {
    throw new Error('躯干侧孔圆心距顶部必须为 0–50 mm 的数字');
  }
  // Cute preserves the original shoulder offset; standard uses 5.5 mm.
  const armHoleTopDistanceMm = settings.armHoleTopDistanceMm ?? Math.round((cuteMode ? 4.9 : 5.5) * modelScale * 1e8) / 1e8;
  if (typeof armHoleTopDistanceMm !== 'number' || !Number.isFinite(armHoleTopDistanceMm) || armHoleTopDistanceMm < 0 || armHoleTopDistanceMm > 50) {
    throw new Error('手臂肩孔圆心距顶部必须为 0–50 mm 的数字');
  }
  // Standard preserves the original ratio to 0.1 mm; Cute uses 6 mm.
  const torsoBottomHoleEdgeDistanceMm = settings.torsoBottomHoleEdgeDistanceMm ?? (cuteMode ? 6 : 6.4) * modelScale;
  if (typeof torsoBottomHoleEdgeDistanceMm !== 'number' || !Number.isFinite(torsoBottomHoleEdgeDistanceMm) || torsoBottomHoleEdgeDistanceMm < 0 || torsoBottomHoleEdgeDistanceMm > 50) {
    throw new Error('躯干底孔圆心距左右边缘必须为 0–50 mm 的数字');
  }
  const result = { holeDiameters, holeDepths, wideArmHoleDepthMm, stickerHoleAllowanceMm, torsoSideHoleTopDistanceMm, armHoleTopDistanceMm, torsoBottomHoleEdgeDistanceMm };
  for (const key of ['splitArms', 'splitLegs']) {
    const value = settings[key] ?? !cuteMode;
    if (typeof value !== 'boolean') throw new Error('肢体分切设置无效');
    result[key] = value;
  }
  return result;
}

export function shouldSplitLimb(partIndex, settings) {
  return partIndex === 2 || partIndex === 3 ? settings.splitArms
    : partIndex === 4 || partIndex === 5 ? settings.splitLegs : false;
}

function partDimensions(partIndex, isSlim, cuteMode, modelScale = 1) {
  const head = partIndex === 0;
  return {
    width: head || partIndex === 1 ? 8 : isSlim && (partIndex === 2 || partIndex === 3) ? 3 : 4,
    depth: head ? 8 : 4,
    height: head ? 8 : cuteMode ? CUTE_HEIGHT : 12,
    extra: head ? 1 : 0.5,
    scale: (!head && cuteMode ? CUTE_SCALE : 1) * modelScale,
  };
}

/** Same rounded output dimensions used by generateParts/transformCuteSticker. */
export function assemblyFaceSize(partIndex, faceIndex, isSlim = false, cuteMode = false, modelScale = 1) {
  const p = partDimensions(partIndex, isSlim, cuteMode);
  let width = Math.floor(((faceIndex >= 4 ? p.depth : p.width) + p.extra) * PART_PIXELS_PER_UNIT);
  let height = Math.floor(((faceIndex >= 2 ? p.height : p.depth) + p.extra) * PART_PIXELS_PER_UNIT);
  if (cuteMode && partIndex !== 0) {
    width = Math.floor(width * (faceIndex >= 4 ? 1 : CUTE_SCALE * (partIndex === 1 && faceIndex === 0 ? 1 - CUTE_TAPER : 1)));
    height = Math.floor(height * (faceIndex >= 2 ? CUTE_SCALE * (partIndex === 1 && faceIndex >= 4 ? Math.hypot(1, 8 * CUTE_TAPER / (2 * CUTE_HEIGHT)) : 1) : 1));
  }
  return { width: Math.floor(width * modelScale), height: Math.floor(height * modelScale) };
}

function isTorsoSideHole(hole) {
  return hole.id === 'torsoLeftArm' || hole.id === 'torsoRightArm';
}

function sideHoleTopDistanceMm(hole, settings) {
  if (isTorsoSideHole(hole)) return settings.torsoSideHoleTopDistanceMm;
  if (hole.id === 'leftArm' || hole.id === 'rightArm') return settings.armHoleTopDistanceMm;
  return undefined;
}

function isTorsoBottomHole(hole) {
  return hole.id === 'torsoLeftLeg' || hole.id === 'torsoRightLeg';
}

function circleForDiameter(hole, width, height, diameterMm, settings, sticker = false) {
  const radius = diameterMm * PART_PIXELS_PER_MM / 2;
  const bottomHole = isTorsoBottomHole(hole);
  const edgeDistance = settings.torsoBottomHoleEdgeDistanceMm * PART_PIXELS_PER_MM;
  const cx = bottomHole ? (hole.id === 'torsoLeftLeg' ? edgeDistance : width - edgeDistance) : width / 2;
  const topDistance = sideHoleTopDistanceMm(hole, settings);
  const cy = topDistance === undefined ? height / 2 : topDistance * PART_PIXELS_PER_MM;
  const maxRadius = Math.min(cx, cy, width - cx, height - cy) - 1;
  if (radius > 0 && radius > maxRadius) {
    const maxMm = Math.max(0, Math.floor(maxRadius * 2 / PART_PIXELS_PER_MM * 10) / 10);
    const positionHint = topDistance !== undefined ? '调整圆心距顶部或' : bottomHole ? '调整圆心距左右边缘或' : '';
    throw new Error(`${hole.label}${sticker ? '贴纸孔（含补偿）' : ''}超出所在面：当前孔位最多支持 ${maxMm.toFixed(1)} mm，请${positionHint}减小孔径${sticker ? '或贴纸孔径补偿' : ''}`);
  }
  if (bottomHole && radius > 0) {
    if (edgeDistance >= width / 2) throw new Error('躯干底孔圆心距左右边缘必须小于底面宽度的一半');
    const otherId = hole.id === 'torsoLeftLeg' ? 'torsoRightLeg' : 'torsoLeftLeg';
    const otherDiameter = settings.holeDiameters[otherId];
    const otherRadius = (otherDiameter + (sticker ? settings.stickerHoleAllowanceMm : 0)) * PART_PIXELS_PER_MM / 2;
    if (otherDiameter > 0 && width - 2 * edgeDistance <= radius + otherRadius + 1) {
      throw new Error(`躯干底部两${sticker ? '个贴纸孔（含补偿）' : '孔'}过近或重叠，请减小圆心距左右边缘或孔径${sticker ? '、贴纸孔径补偿' : ''}`);
    }
  }
  return { cx, cy, radius };
}

export function assemblyHoleCircle(hole, width, height, settings) {
  return circleForDiameter(hole, width, height, settings.holeDiameters[hole.id], settings);
}

/** Diameter allowance applies only to sticker holes; disabled holes stay disabled. */
export function stickerHoleCircle(hole, width, height, settings) {
  const diameter = settings.holeDiameters[hole.id];
  return circleForDiameter(hole, width, height, diameter === 0 ? 0 : diameter + settings.stickerHoleAllowanceMm, settings, true);
}

export function validateAssemblySettings(settings, isSlim = false, cuteMode = false, modelScale = 1) {
  const result = normalizeAssemblySettings(settings, cuteMode, modelScale);
  for (const hole of ASSEMBLY_HOLES) {
    const [part, face] = hole.face.split('/').map(Number);
    const size = assemblyFaceSize(part, face, isSlim, cuteMode, modelScale);
    assemblyHoleCircle(hole, size.width, size.height, result);
  }
  return result;
}

export function validateStickerAssemblySettings(settings, isSlim = false, cuteMode = false, modelScale = 1) {
  const result = normalizeAssemblySettings(settings, cuteMode, modelScale);
  for (const hole of ASSEMBLY_HOLES) {
    const [part, face] = hole.face.split('/').map(Number);
    const size = assemblyFaceSize(part, face, isSlim, cuteMode, modelScale);
    stickerHoleCircle(hole, size.width, size.height, result);
  }
  return result;
}

/** Circular sockets on the same unfolded face coordinates as the stickers.
 * Model coordinates: X = depth, Y = width, Z = height; centers are part-local.
 */
export function assemblySockets(partIndex, settings, isSlim = false, cuteMode = false, modelScale = 1) {
  const p = partDimensions(partIndex, isSlim, cuteMode, modelScale);
  const w = (p.width + p.extra) * p.scale;
  const h = (p.height + p.extra) * p.scale;
  return ASSEMBLY_HOLES.filter(hole => Number(hole.face.split('/')[0]) === partIndex).flatMap(hole => {
    const face = Number(hole.face.split('/')[1]);
    const size = assemblyFaceSize(partIndex, face, isSlim, cuteMode, modelScale);
    const circle = assemblyHoleCircle(hole, size.width, size.height, settings);
    if (!circle.radius) return [];
    const radius = settings.holeDiameters[hole.id] / MODEL_MM_PER_UNIT / 2;
    // Depth is measured inward along the face normal, in print millimetres.
    // Only standard 4-pixel shoulders use the shared wide-arm depth. Cute
    // shoulders keep the same per-side settings for both skin arm widths.
    const wideShoulder = !cuteMode && !isSlim && (hole.id === 'leftArm' || hole.id === 'rightArm');
    const depthMm = wideShoulder ? settings.wideArmHoleDepthMm : settings.holeDepths[hole.id];
    const depth = depthMm / MODEL_MM_PER_UNIT;
    let surface, normal;
    if (face < 2) {
      const top = face === 0;
      const faceW = w * (cuteMode && partIndex === 1 && top ? 1 - CUTE_TAPER : 1);
      // Bottom-face coordinates mirror the width axis when unfolded. Position the
      // model directly in millimetres rather than using rounded sticker pixels.
      const y = isTorsoBottomHole(hole)
        ? (hole.id === 'torsoLeftLeg' ? 1 : -1) * (faceW / 2 - settings.torsoBottomHoleEdgeDistanceMm / MODEL_MM_PER_UNIT)
        : (top ? 1 : -1) * (circle.cx / size.width - 0.5) * faceW;
      surface = [0, y, (top ? 1 : -1) * h / 2];
      normal = [0, 0, top ? 1 : -1];
    } else {
      const side = face === 4 ? 1 : -1;
      const tapered = cuteMode && partIndex === 1;
      // The shared offset is measured along the unfolded side surface from its top.
      // Use the physical face length here; the sticker raster rounds its height to pixels.
      const sideLengthMm = Math.hypot(h, tapered ? w * CUTE_TAPER / 2 : 0) * MODEL_MM_PER_UNIT;
      const topDistance = sideHoleTopDistanceMm(hole, settings);
      const t = 1 - (topDistance === undefined ? circle.cy / size.height : topDistance / sideLengthMm);
      surface = [0, side * w / 2 * (tapered ? cuteTorsoWidthFactor(t) : 1), (t - 0.5) * h];
      // Use the actual sloped face's perpendicular, mirrored on the two sides.
      normal = tapered ? cuteTorsoSideNormal(w, h, side) : [0, side, 0];
    }
    // Extend just outside the surface so the CSG cut opens both skin layers.
    const outside = 0.3;
    const center = surface.map((v, i) => v + normal[i] * (outside - depth) / 2);
    return [{ id: hole.id, label: hole.label, center, normal, radius, length: depth + outside }];
  });
}
