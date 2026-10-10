export const CUTE_HEIGHT: number;
export const CUTE_SCALE: number;
export const CUTE_TAPER: number;
export type ModelType = 'standard' | 'cute7' | 'cute10';
export const MODEL_TYPES: ModelType[];
export function getModelProfile(modelType?: ModelType): { cuteMode: boolean; modelScale: number };
export function cuteTorsoWidthFactor(t: number): number;
export function cuteTorsoSideNormal(width: number, height: number, side: number): [number, number, number];
export const CUTE_ARM_TILT: number;
export function cuteSourceRow(row: number, height?: number): number;
export function getCutePartPose(partIndex: number, isSlim?: boolean): {
  position: [number, number, number];
  scale: [number, number, number];
  rotationZ: number;
};
