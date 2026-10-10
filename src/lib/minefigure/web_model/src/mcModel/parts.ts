import * as THREE from 'three';
import type { Vec3, BuildOptions, LimbSpec } from '../types/index.js';
import { TokenRegistry, CUT_TOKEN, CUTTER_COLORS, WHITE } from './tokens.js';
import { boxAt, cylinderZ, cylinderY, sphere, createBeveledBox } from './primitives.js';
import { createSolidBlock, createDecorCubes } from './skinBlocks.js';
import { buildPartGeometry, type CutterWithToken } from './csg.js';
import { CUTE_HEIGHT } from '../../../shared/characterProportions.js';
import { shapeCuteGeometry } from './cute.js';
import { ASSEMBLY_JOINTS, DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM, MODEL_MM_PER_UNIT, normalizeAssemblySettings } from '../../../shared/assemblySettings.js';
import { assemblyCutters } from './assembly.js';

export function taperProfile(vertices: Vec3[], _totalSteps: number, step: number): Vec3[] {
  const progress = step / 10;
  const ratio = 1.5 / 2.5; // hole_width = 2.5
  const scale = (1 - progress) * (1 - ratio) + ratio;
  return vertices.map((v) => [v[0] * scale, v[1] * scale, v[2] + progress * 3]);
}

export interface HeadBuildResult {
  block: THREE.BufferGeometry;
  decorGeoms: THREE.BufferGeometry[];
  cutters: Array<CutterWithToken & { label: string; color: string }>;
}

export function buildHead(
  pixels: Float32Array,
  width: number,
  reg: TokenRegistry,
  opts: BuildOptions
): HeadBuildResult {
  const headHeight = 14;
  const includeDecor = opts.decor !== false;

  const block = createSolidBlock(
    [0, 0, headHeight],
    [8, 8, 8],
    [
      [8, 8],
      [16, 8],
      [0, 8],
      [8, 0],
      [16, 0],
      [24, 8],
    ],
    pixels,
    width,
    reg
  );

  const decorGeoms = includeDecor
    ? createDecorCubes(
      [0, 0, headHeight],
      [8, 8, 8],
      [
        [8, 8],
        [16, 8],
        [0, 8],
        [8, 0],
        [16, 0],
        [24, 8],
      ],
      [9 / 8, 9 / 8, 9 / 8],
      [32, 0],
      pixels,
      width,
      reg
    )
    : [];

  // All callers use the sticker's circular socket, including callers without
  // explicit assembly settings. Zero diameter leaves the bottom closed.
  return { block, decorGeoms, cutters: assemblyCutters(0, [0, 0, headHeight], opts) };
}

export interface TorsoBuildResult {
  block: THREE.BufferGeometry;
  decorGeoms: THREE.BufferGeometry[];
  cutters: Array<CutterWithToken & { label: string; color: string }>;
}

export function buildTorso(
  pixels: Float32Array,
  width: number,
  reg: TokenRegistry,
  opts: BuildOptions
): TorsoBuildResult {
  const includeDecor = opts.decor !== false;
  const cute = !!opts.cuteMode;
  const position: Vec3 = cute ? [0, 0, 0] : [0, 0, 4];
  const size: Vec3 = [4, 8, cute ? CUTE_HEIGHT : 12];
  const block = createSolidBlock(
    position,
    size,
    [
      [20, 20],
      [28, 20],
      [16, 20],
      [20, 16],
      [28, 16],
      [32, 20],
    ],
    pixels,
    width,
    reg
  );

  const decorGeoms = includeDecor
    ? createDecorCubes(
      position,
      size,
      [
        [20, 20],
        [28, 20],
        [16, 20],
        [20, 16],
        [28, 16],
        [32, 20],
      ],
      [4.5 / 4, 8.5 / 8, (size[2] + 0.5) / size[2]],
      [0, 16],
      pixels,
      width,
      reg
    )
    : [];

  if (cute) {
    shapeCuteGeometry(block, true);
    for (const geometry of decorGeoms) shapeCuteGeometry(geometry, true, true);
  }
  return { block, decorGeoms, cutters: assemblyCutters(1, position, opts) };
}

// port of _limb_specs
export function limbSpecs(requested: Record<string, boolean>, isAlex: boolean, cuteMode = false): LimbSpec[] {
  const armWidth = isAlex ? 3 : 4;
  const armMiddleOffset = isAlex ? 39 : 40;
  const rightArmMiddleOffset = isAlex ? 47 : 48;
  const armEndOffset = isAlex ? 43 : 44;
  const rightArmEndOffset = isAlex ? 51 : 52;
  const armDecorScale: Vec3 = [4.5 / 4, isAlex ? 3.5 / 3 : 4.5 / 4, 12.5 / 12];
  const armLocY = isAlex ? 5.5 : 6;

  const specs: LimbSpec[] = [];
  if (requested.leftArm) {
    specs.push({
      id: 'leftArm',
      name: 'left_arm',
      position: [0, armLocY, 4],
      entitySize: [4, armWidth, 12],
      faceOffsets: [
        [36, 52],
        [armMiddleOffset, 52],
        [32, 52],
        [36, 48],
        [armMiddleOffset, 48],
        [armEndOffset, 52],
      ],
      decorScale: armDecorScale,
      decorOffset: [16, 0],
      isLeft: true,
      isArm: true,
    });
  }
  if (requested.rightArm) {
    specs.push({
      id: 'rightArm',
      name: 'right_arm',
      position: [0, -armLocY, 4],
      entitySize: [4, armWidth, 12],
      faceOffsets: [
        [44, 20],
        [rightArmMiddleOffset, 20],
        [40, 20],
        [44, 16],
        [rightArmMiddleOffset, 16],
        [rightArmEndOffset, 20],
      ],
      decorScale: armDecorScale,
      decorOffset: [0, 16],
      isLeft: false,
      isArm: true,
    });
  }
  if (requested.leftLeg) {
    specs.push({
      id: 'leftLeg',
      name: 'left_leg',
      position: [0, 2, -8],
      entitySize: [4, 4, 12],
      faceOffsets: [
        [20, 52],
        [24, 52],
        [16, 52],
        [20, 48],
        [24, 48],
        [28, 52],
      ],
      decorScale: [4.5 / 4, 4.5 / 4, 12.5 / 12],
      decorOffset: [-16, 0],
      isLeft: true,
      isArm: false,
    });
  }
  if (requested.rightLeg) {
    specs.push({
      id: 'rightLeg',
      name: 'right_leg',
      position: [0, -2, -8],
      entitySize: [4, 4, 12],
      faceOffsets: [
        [4, 20],
        [8, 20],
        [0, 20],
        [4, 16],
        [8, 16],
        [12, 20],
      ],
      decorScale: [4.5 / 4, 4.5 / 4, 12.5 / 12],
      decorOffset: [0, 16],
      isLeft: false,
      isArm: false,
    });
  }
  if (cuteMode) {
    for (const spec of specs) {
      spec.position = [0, 0, 0];
      spec.entitySize[2] = CUTE_HEIGHT;
      spec.decorScale = [...spec.decorScale];
      spec.decorScale[2] = (CUTE_HEIGHT + 0.5) / CUTE_HEIGHT;
    }
  }
  return specs;
}

export interface LimbHalfResult {
  name: string;
  geometry: THREE.BufferGeometry | null;
}

export interface LimbBuildResult {
  halves: LimbHalfResult[];
  cutters: Array<CutterWithToken & { label: string; color: string }>;
}

/**
 * Port of split_limb + create_limb_joint_hole + create_limb_connector_hole.
 * Returns upper/lower halves plus cutter metadata for visualization.
 */
export async function buildLimb(
  spec: LimbSpec,
  pixels: Float32Array,
  width: number,
  reg: TokenRegistry,
  opts: BuildOptions
): Promise<LimbBuildResult> {
  const includeDecor = opts.decor !== false;
  const [lx, ly, lz] = spec.position;
  const splitZ = lz + 0.01;
  const isArm = spec.name.endsWith('_arm');
  const cute = !!opts.cuteMode;
  const settings = normalizeAssemblySettings(opts.assemblySettings, cute);
  const split = isArm ? settings.splitArms : settings.splitLegs;

  // split cutters (port of split_limb, with obj.location = (0,0,0))
  const upperSplit: CutterWithToken & { label: string; color: string } = {
    geometry: boxAt([lx, ly, splitZ - 50], [100, 100, 100.01], 0),
    visual: boxAt([lx, ly, splitZ], [18, 18, 0.02], 0),
    token: CUT_TOKEN,
    label: '拆分平面（上半）',
    color: CUTTER_COLORS.split,
  };
  const lowerSplit: CutterWithToken & { label: string; color: string } = {
    geometry: boxAt([lx, ly, splitZ + 50], [100, 100, 100.01], 0),
    visual: boxAt([lx, ly, splitZ], [18, 18, 0.02], 0),
    token: CUT_TOKEN,
    label: '拆分平面（下半）',
    color: CUTTER_COLORS.split,
  };

  const partIndex = isArm ? (spec.isLeft ? 2 : 3) : (spec.isLeft ? 4 : 5);
  const joint = ASSEMBLY_JOINTS.find(item => item.partIndex === partIndex)!;
  const depth = settings.holeDepths[joint.id] / MODEL_MM_PER_UNIT;
  const jointRadius = DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM / MODEL_MM_PER_UNIT / 2;
  // Measure the same requested depth from each actual split face; do not count
  // the cutter's outside extension or the 0.01-unit split gap as hole depth.
  const makeJoint = (upper: boolean): CutterWithToken & { label: string; color: string } => {
    const side = upper ? 1 : -1;
    const surfaceZ = splitZ + side * 0.005;
    const outside = 0.3;
    return {
      geometry: cylinderZ([lx, ly, surfaceZ + side * (depth - outside) / 2], jointRadius, depth + outside),
      token: CUT_TOKEN,
      label: `${joint.label.replace(' · 每侧', '')}（${upper ? '上半' : '下半'}）`,
      color: CUTTER_COLORS.joint,
    };
  };
  const upperJoint = makeJoint(true);
  const lowerJoint = makeJoint(false);
  const connectorCutters = assemblyCutters(partIndex, spec.position, { ...opts, assemblySettings: settings });
  const upperCutters = [upperSplit, upperJoint, ...connectorCutters];
  const lowerCutters = [lowerSplit, lowerJoint];

  const allDecor = includeDecor
    ? createDecorCubes(spec.position, spec.entitySize, spec.faceOffsets, spec.decorScale, spec.decorOffset, pixels, width, reg)
    : [];
  if (cute) for (const geometry of allDecor) shapeCuteGeometry(geometry, false, true);

  const build = async (cutters: CutterWithToken[]) => {
    const block = createSolidBlock(spec.position, spec.entitySize, spec.faceOffsets, pixels, width, reg);
    if (cute) shapeCuteGeometry(block);
    try {
      // Both halves start from the complete outer solid. Filtering cubes by
      // their centre drops portions of voxels that cross the split plane.
      return await buildPartGeometry(block, allDecor, reg.tokens, cutters);
    } finally {
      block.dispose();
    }
  };
  try {
    if (!split) {
      for (const cutter of [upperSplit, lowerSplit, upperJoint, lowerJoint]) {
        cutter.geometry.dispose();
        cutter.visual?.dispose();
      }
      return {
        halves: [{ name: spec.name, geometry: await build(connectorCutters) }],
        cutters: connectorCutters,
      };
    }
    return {
      halves: [
        { name: spec.name + '_upper', geometry: await build(upperCutters) },
        { name: spec.name + '_lower', geometry: await build(lowerCutters) },
      ],
      cutters: [upperSplit, lowerSplit, upperJoint, lowerJoint, ...connectorCutters],
    };
  } finally {
    for (const geometry of allDecor) geometry.dispose();
  }
}

export interface ConnectorBuildResult {
  geometry: THREE.BufferGeometry;
  cutters: Array<{ geometry: THREE.BufferGeometry; label: string; color: string }>;
}

/**
 * Port of mc_model.create_connector: builds short/long connector clip.
 */
export async function buildConnector(short = true, location: Vec3 = [0, 0, 0]): Promise<ConnectorBuildResult> {
  const sphereOffset = 1.0;
  const sphereRadius = 1.33;
  const rectangleWidth = 1.25;
  const rectangleHeight = short ? 1.9 : 3.0;

  // Connectors have no matching sticker faces.
  const tokens = [{ color: WHITE, opacity: 1 }];
  const buildHalfMesh = async (halfLoc: Vec3) => {
    const boxGeom = boxAt(halfLoc, [rectangleWidth, rectangleHeight, rectangleWidth], 0);
    const sphereGeom = sphere(
      [halfLoc[0], halfLoc[1] - sphereOffset, halfLoc[2]],
      sphereRadius,
      32
    );

    const c1 = createBeveledBox(
      [halfLoc[0], halfLoc[1] - sphereOffset - 0.7, halfLoc[2]],
      [4.0, 3.0, 0.6],
      0.9,
      8
    );
    const c2 = boxAt(
      [halfLoc[0], halfLoc[1] - sphereOffset - sphereRadius, halfLoc[2]],
      [3.0, 1.0, 3.0],
      0
    );
    const c3 = cylinderY(halfLoc, 0.3, 5.0, 32);

    const halfCutters = [
      { geometry: c1, label: '弹性开槽', color: CUTTER_COLORS.split },
      { geometry: c2, label: '端部切平', color: CUTTER_COLORS.split },
      { geometry: c3, label: '插销孔', color: CUTTER_COLORS.joint },
    ];

    try {
      const geometry = await buildPartGeometry(boxGeom, [sphereGeom], tokens, halfCutters);
      if (!geometry) throw new Error('连接件布尔结果为空');
      return { geometry, cutters: halfCutters };
    } finally {
      boxGeom.dispose();
      sphereGeom.dispose();
    }
  };

  const rightHalfLoc: Vec3 = [
    location[0] + rectangleWidth / 2,
    location[1] - rectangleHeight / 2,
    location[2],
  ];
  const leftHalfLoc: Vec3 = [
    location[0] - rectangleWidth / 2,
    location[1] - rectangleHeight / 2,
    location[2],
  ];

  const right = await buildHalfMesh(rightHalfLoc);
  const left = await buildHalfMesh(leftHalfLoc);

  const angle = (145 * Math.PI) / 180;
  left.geometry.rotateZ(angle);
  for (const c of left.cutters) {
    c.geometry.rotateZ(angle);
  }

  let finalGeom: THREE.BufferGeometry | null;
  try {
    finalGeom = await buildPartGeometry(right.geometry, [left.geometry], tokens, []);
    if (!finalGeom) throw new Error('连接件合并结果为空');
  } finally {
    right.geometry.dispose();
    left.geometry.dispose();
  }

  return {
    geometry: finalGeom,
    cutters: [...right.cutters, ...left.cutters],
  };
}
