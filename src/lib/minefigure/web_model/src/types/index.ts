import type * as THREE from 'three';
import type { AssemblySettings } from '../../../shared/assemblySettings.js';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type ColorRGBA = [number, number, number, number];
export type ColorRGB = [number, number, number];

export type PartId =
  | 'head'
  | 'torso'
  | 'leftArmUpper'
  | 'leftArmLower'
  | 'rightArmUpper'
  | 'rightArmLower'
  | 'leftLegUpper'
  | 'leftLegLower'
  | 'rightLegUpper'
  | 'rightLegLower'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'shortConnector'
  | 'longConnector';

export type LogicalPartId =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'shortConnector'
  | 'longConnector';

export interface SkinData {
  pixels: Float32Array;
  width: number;
  height: number;
  isLegacy: boolean;
  name: string;
}

export interface BuildOptions {
  parts: Partial<Record<PartId, boolean>>;
  decor?: boolean;
  headOnly?: boolean;
  isAlex?: boolean;
  cuteMode?: boolean;
  modelScale?: number;
  /** Fill missing base texels from neighbours; false leaves an untextured white surface. */
  fillTransparentBase?: boolean;
  assemblySettings?: AssemblySettings;
}

export interface CutterSpec {
  geometry: THREE.BufferGeometry;
  visual?: THREE.BufferGeometry;
  label: string;
  color: string;
  position: Vec3;
}

export interface FigureMesh {
  geometry: THREE.BufferGeometry;
  name: string;
}

export interface FigurePart {
  id: PartId;
  label: string;
  position: Vec3;
  meshes: FigureMesh[];
  cutters: CutterSpec[];
  exportGeometry?: THREE.BufferGeometry | null;
  /** Own top normal after any baked assembly rotation; used by print packing. */
  printUp?: Vec3;
}

export interface BuildResult {
  results: FigurePart[];
  isAlex: boolean;
}

export type ProgressCallback = (msg: string, done: number, total: number) => void;

export interface FaceConfig {
  dir: Vec3;
  size: Vec2;
  offset: Vec2;
  constCoord: number;
  constVal: number;
  uAxis: number;
  vAxis: number;
  uFlip: boolean;
  vFlip: boolean;
}

export interface MaterialToken {
  color: ColorRGBA | Float32Array | number[];
  opacity: number;
}

export interface LimbSpec {
  id: string;
  name: string;
  position: Vec3;
  location?: Vec3;
  entitySize: Vec3;
  faceOffsets: Vec2[] | number[][];
  decorScale: Vec3;
  decorOffset: Vec2;
  isLeft: boolean;
  isArm: boolean;
}

export interface TransformOffset {
  dx: number;
  dy: number;
  dz: number;
}
