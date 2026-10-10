import type { AssemblySettings } from '../../../shared/assemblySettings.js';
import type { ProcessedSkin } from './skinHelper.js';
export const STICKER_FONT_FAMILY: string;
export interface StickerPage {
    pageCanvas: HTMLCanvasElement;
    cutterCanvas: HTMLCanvasElement | null;
    cutterLayers: HTMLCanvasElement[];
    cutterTraceOptions: { vectorPaths: { points: [number, number][]; closed: boolean }[] };
    infoArea: { x: number; y: number; width: number; height: number };
    faceCount: number;
}
export function composeMergedPages(skin: ProcessedSkin, options: { alphaThreshold: number; cuteMode: boolean; modelScale?: number; preview?: boolean; assemblySettings: AssemblySettings; signal?: AbortSignal }, onProgress?: (percent: number, message: string) => void): Promise<StickerPage[]>;
