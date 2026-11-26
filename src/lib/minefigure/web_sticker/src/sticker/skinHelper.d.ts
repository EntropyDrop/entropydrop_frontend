export interface ProcessedSkin {
    canvas: HTMLCanvasElement;
    data: Uint8ClampedArray;
    width: number;
    height: number;
    isSlim: boolean;
}
export function createCanvas(width: number, height: number): HTMLCanvasElement;
export function processSkin(source: HTMLImageElement | HTMLCanvasElement | ImageData, alphaThreshold?: number): ProcessedSkin;
export function resolveVoxelConsistency(skin: ProcessedSkin): void;
