import { createCanvas } from './skinHelper.js';
export const PAGE_WIDTH = 4200;
export const PAGE_HEIGHT = 5940;
export const PADDING = 160;
export const SAFE_WIDTH = PAGE_WIDTH - PADDING * 2;
export function scaleImage(canvas, scale) {
  const w = Math.max(1, Math.floor(canvas.width * scale));
  const h = Math.max(1, Math.floor(canvas.height * scale));
  const scaled = createCanvas(w, h);
  const ctx = scaled.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, w, h);
  return scaled;
}
