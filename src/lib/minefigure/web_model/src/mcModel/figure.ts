import type {
  Vec3,
  PartId,
  BuildOptions,
  ProgressCallback,
  BuildResult,
  FigurePart,
  LimbSpec,
} from '../types/index.js';
import { TokenRegistry } from './tokens.js';
import { pxAt, fillTransparentPixels } from './skinBlocks.js';
import { buildPartGeometry } from './csg.js';
import { buildHead, buildTorso, limbSpecs, buildLimb, buildConnector } from './parts.js';
import { placeCuteParts, resampleCutePixels } from './cute.js';
import { validateAssemblySettings } from '../../../shared/assemblySettings.js';

export const PART_IDS: PartId[] = [
  'head',
  'torso',
  'leftArmUpper',
  'leftArmLower',
  'rightArmUpper',
  'rightArmLower',
  'leftLegUpper',
  'leftLegLower',
  'rightLegUpper',
  'rightLegLower',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
  'shortConnector',
  'longConnector',
];

export const PART_LABELS: Record<string, string> = {
  head: '头部',
  torso: '躯干',
  leftArmUpper: '左臂（上）',
  leftArmLower: '左臂（下）',
  rightArmUpper: '右臂（上）',
  rightArmLower: '右臂（下）',
  leftLegUpper: '左腿（上）',
  leftLegLower: '左腿（下）',
  rightLegUpper: '右腿（上）',
  rightLegLower: '右腿（下）',
  leftArm: '左臂',
  rightArm: '右臂',
  leftLeg: '左腿',
  rightLeg: '右腿',
  shortConnector: '短连接件',
  longConnector: '长连接件',
};

export const PART_FILENAMES: Record<string, string> = {
  head: 'head.stl',
  torso: 'torso.stl',
  leftArmUpper: 'left_arm_upper.stl',
  leftArmLower: 'left_arm_lower.stl',
  rightArmUpper: 'right_arm_upper.stl',
  rightArmLower: 'right_arm_lower.stl',
  leftLegUpper: 'left_leg_upper.stl',
  leftLegLower: 'left_leg_lower.stl',
  rightLegUpper: 'right_leg_upper.stl',
  rightLegLower: 'right_leg_lower.stl',
  leftArm: 'left_arm.stl',
  rightArm: 'right_arm.stl',
  leftLeg: 'left_leg.stl',
  rightLeg: 'right_leg.stl',
  shortConnector: 'short_connector.stl',
  longConnector: 'long_connector.stl',
};

/** Assembly shift applied to every part (built frame -> figure frame). */
export const ASSEMBLY_SHIFT: Vec3 = [0, 0, -4];

interface TaskItem {
  id: string;
  label: string;
  spec?: LimbSpec;
  isShort?: boolean;
  isConnector?: boolean;
}

/**
 * Build the whole figure.
 *
 * @param pixels normalized RGBA, 64*64*4
 * @param width image width (64)
 * @param opts BuildOptions { parts, decor, headOnly, isAlex }
 * @param onProgress (msg: string, done: number, total: number) => void
 */
export async function buildFigure(
  pixels: Float32Array,
  width: number,
  opts: BuildOptions,
  onProgress: ProgressCallback = () => {}
): Promise<BuildResult> {
  const isAlex = opts.isAlex !== undefined
    ? !!opts.isAlex
    : (pxAt(pixels, width, 51, 16, [0, 0, 0, 0])[3] ?? 1) < 1.0; // load_skin() check: pixels[16][51][3] < 1.0
  opts = { ...opts, isAlex };
  if (opts.assemblySettings) opts.assemblySettings = validateAssemblySettings(opts.assemblySettings, isAlex, !!opts.cuteMode);

  // close see-through holes on a working clone (never mutate caller's pixels in place)
  const workPixels = new Float32Array(pixels);
  if (opts.fillTransparentBase !== false) fillTransparentPixels(workPixels, width);
  if (opts.cuteMode) resampleCutePixels(workPixels, width);

  // limbs are built as a unit but returned as separate upper/lower parts
  const requested: Record<string, boolean> = {
    head: !!opts.parts.head,
    torso: !!opts.parts.torso,
    leftArm: !!(opts.parts.leftArm || opts.parts.leftArmUpper || opts.parts.leftArmLower),
    rightArm: !!(opts.parts.rightArm || opts.parts.rightArmUpper || opts.parts.rightArmLower),
    leftLeg: !!(opts.parts.leftLeg || opts.parts.leftLegUpper || opts.parts.leftLegLower),
    rightLeg: !!(opts.parts.rightLeg || opts.parts.rightLegUpper || opts.parts.rightLegLower),
    shortConnector: !!opts.parts.shortConnector,
    longConnector: !!opts.parts.longConnector,
  };

  const hasBodyParts =
    requested.head ||
    requested.torso ||
    requested.leftArm ||
    requested.rightArm ||
    requested.leftLeg ||
    requested.rightLeg;

  const tasks: TaskItem[] = [];
  if (requested.head) tasks.push({ id: 'head', label: PART_LABELS.head ?? '头部' });
  if (requested.torso) tasks.push({ id: 'torso', label: PART_LABELS.torso ?? '躯干' });
  for (const spec of limbSpecs(requested, isAlex, opts.cuteMode)) {
    tasks.push({ id: spec.id, label: PART_LABELS[spec.id] ?? spec.id, spec });
  }
  if (requested.shortConnector) {
    tasks.push({ id: 'shortConnector', label: PART_LABELS.shortConnector ?? '短连接件', isShort: true, isConnector: true });
  }
  if (requested.longConnector) {
    tasks.push({ id: 'longConnector', label: PART_LABELS.longConnector ?? '长连接件', isShort: false, isConnector: true });
  }

  const results: FigurePart[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    onProgress(`正在构建 ${task.label}…`, i, tasks.length);

    if (task.isConnector) {
      const conn = await buildConnector(task.isShort);
      let position: Vec3 = [0, 0, 0];
      if (hasBodyParts) {
        // Place beside the figure footprint on the ground
        position = task.isShort ? [0, 8.5, -17] : [0, -8.5, -17];
      } else if (requested.shortConnector && requested.longConnector) {
        position = task.isShort ? [0, 3, 0] : [0, -3, 0];
      } else {
        position = [0, 0, 0];
      }

      results.push({
        id: task.id as PartId,
        label: task.label,
        position,
        meshes: [{ geometry: conn.geometry, name: task.id }],
        exportGeometry: conn.geometry,
        cutters: conn.cutters.map((c) => ({
          geometry: c.geometry,
          label: c.label,
          color: c.color,
          position,
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      continue;
    }

    const reg = new TokenRegistry();
    const firstResult = results.length;
    let cutters: Array<{ geometry: any; visual?: any; label: string; color: string }> = [];
    let block: any;
    let decorGeoms: any;
    let halves: any = null;

    if (task.id === 'head') {
      const headRes = buildHead(workPixels, width, reg, opts);
      block = headRes.block;
      decorGeoms = headRes.decorGeoms;
      cutters = headRes.cutters;
    } else if (task.id === 'torso') {
      ({ block, decorGeoms, cutters } = buildTorso(workPixels, width, reg, { ...opts, isAlex }));
    } else if (task.spec) {
      const limb = await buildLimb(task.spec, workPixels, width, reg, opts);
      cutters = limb.cutters;
      halves = limb.halves;
    }

    if (halves) {
      // one part result per half; only include the halves the user requested
      let cuttersAttached = false;
      for (const half of halves) {
        const isUpper = half.name.endsWith('_upper');
        const isWhole = !isUpper && !half.name.endsWith('_lower');
        const id = (isWhole ? task.id : task.id + (isUpper ? 'Upper' : 'Lower')) as PartId;
        if (!isWhole && !opts.parts[id] && !opts.parts[task.id as PartId]) {
          half.geometry?.dispose();
          continue;
        }
        const geometry = half.geometry;
        if (!geometry) continue;
        results.push({
          id,
          label: PART_LABELS[id] ?? id,
          position: ASSEMBLY_SHIFT,
          meshes: [{ geometry, name: half.name }],
          exportGeometry: geometry,
          cutters: cuttersAttached
            ? []
            : cutters.map((c) => ({
              geometry: c.visual || c.geometry,
              label: c.label,
              color: c.color,
              position: ASSEMBLY_SHIFT,
            })),
        });
        cuttersAttached = true;
      }
    } else {
      let geometry;
      try {
        geometry = await buildPartGeometry(block, decorGeoms, reg.tokens, cutters);
      } finally {
        block.dispose();
        for (const decor of decorGeoms) decor.dispose();
      }
      if (geometry) {
        results.push({
          id: task.id as PartId,
          label: task.label,
          position: ASSEMBLY_SHIFT,
          meshes: [{ geometry, name: task.id }],
          exportGeometry: geometry,
          cutters: cutters.map((c) => ({
            geometry: c.visual || c.geometry,
            label: c.label,
            color: c.color,
            position: ASSEMBLY_SHIFT,
          })),
        });
      }
    }
    if (opts.cuteMode) {
      const partIndices: Record<string, number> = { head: 0, torso: 1, leftArm: 2, rightArm: 3, leftLeg: 4, rightLeg: 5 };
      const partIndex = partIndices[task.id];
      if (partIndex !== undefined) placeCuteParts(results.slice(firstResult), partIndex, isAlex);
    }
    await new Promise((resolve) => setTimeout(resolve, 0)); // keep UI responsive
  }

  onProgress('完成', tasks.length, tasks.length);
  return { results, isAlex };
}

/** Count triangles across the built figure (for the stats panel). */
export function countTriangles(results: FigurePart[]): number {
  let count = 0;
  for (const part of results) {
    for (const mesh of part.meshes) {
      count += mesh.geometry.attributes.position!.count / 3;
    }
  }
  return count;
}
