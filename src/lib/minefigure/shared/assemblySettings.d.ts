export type HoleId = 'headBottom' | 'torsoTop' | 'torsoLeftArm' | 'torsoRightArm' | 'torsoLeftLeg' | 'torsoRightLeg' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type JointId = 'leftArmJoint' | 'rightArmJoint' | 'leftLegJoint' | 'rightLegJoint';
export interface AssemblySettings {
  holeDiameters: Record<HoleId, number>;
  holeDepths: Record<HoleId | JointId, number>;
  stickerHoleAllowanceMm: number;
  torsoSideHoleTopDistanceMm: number;
  torsoBottomHoleEdgeDistanceMm: number;
  splitArms: boolean;
  splitLegs: boolean;
}
export interface AssemblyInput {
  holeDiameters?: Partial<Record<HoleId, number>>;
  holeDepths?: Partial<Record<HoleId | JointId, number>>;
  stickerHoleAllowanceMm?: number;
  torsoSideHoleTopDistanceMm?: number;
  torsoBottomHoleEdgeDistanceMm?: number;
  splitArms?: boolean;
  splitLegs?: boolean;
}
export interface AssemblyHole { id: HoleId; label: string; face: string; diameterMm: number; cuteDiameterMm?: number; depthMm: number; cuteDepthMm?: number; yPx?: number }
export interface AssemblyJoint { id: JointId; label: string; partIndex: number; depthMm: number }
export interface AssemblySocket { id: HoleId; label: string; center: [number, number, number]; normal: [number, number, number]; radius: number; length: number }
export const ASSEMBLY_STORAGE_KEY: string;
export const DEFAULT_ASSEMBLY_HOLE_DIAMETER_MM: number;
export const MODEL_MM_PER_UNIT: number;
export const PART_PIXELS_PER_UNIT: number;
export const PART_PIXELS_PER_MM: number;
export const ASSEMBLY_HOLES: AssemblyHole[];
export const ASSEMBLY_JOINTS: AssemblyJoint[];
export function normalizeAssemblySettings(settings?: AssemblyInput, cuteMode?: boolean): AssemblySettings;
export function shouldSplitLimb(partIndex: number, settings: AssemblySettings): boolean;
export function assemblyFaceSize(partIndex: number, faceIndex: number, isSlim?: boolean, cuteMode?: boolean): { width: number; height: number };
export function assemblyHoleCircle(hole: AssemblyHole, width: number, height: number, settings: AssemblySettings): { cx: number; cy: number; radius: number };
export function stickerHoleCircle(hole: AssemblyHole, width: number, height: number, settings: AssemblySettings): { cx: number; cy: number; radius: number };
export function validateAssemblySettings(settings?: AssemblyInput, isSlim?: boolean, cuteMode?: boolean): AssemblySettings;
export function validateStickerAssemblySettings(settings?: AssemblyInput, isSlim?: boolean, cuteMode?: boolean): AssemblySettings;
export function assemblySockets(partIndex: number, settings: AssemblySettings, isSlim?: boolean, cuteMode?: boolean): AssemblySocket[];
