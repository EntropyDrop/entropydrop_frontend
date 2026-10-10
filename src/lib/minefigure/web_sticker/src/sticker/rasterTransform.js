/** Pixel transforms shared by printing and cutter masks, independent of Canvas filtering. */
import { createCanvas } from './skinHelper.js';

/**
 * Sample destination pixel centres with integer arithmetic. At an exact source
 * boundary choose the preceding pixel consistently for both complementary
 * layers. imageSmoothingEnabled=false alone does not define that tie-break
 * across browsers, and independently filtered masks can create extra cuts.
 */
export function resizeCanvasNearest(source, width, height) {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const pixels = ctx.createImageData(width, height);
  const input = source.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, source.width, source.height).data;
  // Copy the four RGBA bytes together without creating per-pixel arrays.
  const inputPixels = new Uint32Array(input.buffer, input.byteOffset, input.byteLength / 4);
  const outputPixels = new Uint32Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength / 4);
  const xs = new Uint32Array(width);
  for (let x = 0; x < width; x++) {
    xs[x] = Math.floor(((2 * x + 1) * source.width - 1) / (2 * width));
  }
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(((2 * y + 1) * source.height - 1) / (2 * height));
    for (let x = 0; x < width; x++) {
      outputPixels[y * width + x] = inputPixels[sy * source.width + xs[x]];
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return out;
}

/** Exact counter-clockwise quarter turn without a floating-point Canvas transform. */
export function rotateCanvas90(source) {
  const out = createCanvas(source.height, source.width);
  const ctx = out.getContext('2d');
  const pixels = ctx.createImageData(out.width, out.height);
  const input = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const from = (y * source.width + x) * 4;
    const to = ((source.width - 1 - x) * out.width + y) * 4;
    pixels.data[to] = input[from];
    pixels.data[to + 1] = input[from + 1];
    pixels.data[to + 2] = input[from + 2];
    pixels.data[to + 3] = input[from + 3];
  }
  ctx.putImageData(pixels, 0, 0);
  return out;
}

/** Integer crop preserves the mask exactly, including its transparent pixels. */
export function cropCanvasPixels(source, x, y, width, height) {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  const pixels = ctx.createImageData(width, height);
  const input = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * source.width + x) * 4;
    pixels.data.set(input.subarray(from, from + width * 4), row * width * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  return out;
}
