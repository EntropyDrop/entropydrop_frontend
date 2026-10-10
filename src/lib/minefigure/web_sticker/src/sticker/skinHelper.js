/**
 * Skin loader, decoder, 64x32 -> 64x64 upgrader, and model type (slim/classic) detector.
 */

/**
 * Creates an OffscreenCanvas or regular Canvas of the given size.
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function createCanvas(width, height) {
  // The UI/export pipeline relies on HTMLCanvasElement APIs such as
  // `toDataURL()` and callback-based `toBlob()`. Modern browsers also expose
  // OffscreenCanvas on the window, but it only has `convertToBlob()` and would
  // make skin thumbnails and every PNG export fail. Keep OffscreenCanvas
  // for workers, where there is no DOM, and prefer a regular canvas in-page.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  // Headless Node mock canvas
  const buffer = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    getContext: (type) => ({
      imageSmoothingEnabled: false,
      fillStyle: '#000000',
      globalCompositeOperation: 'source-over',
      fillRect: (x, y, w, h) => {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 255;
            buffer[idx + 1] = 255;
            buffer[idx + 2] = 255;
            buffer[idx + 3] = 255;
          }
        }
      },
      clearRect: (x, y, w, h) => {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
            const idx = (py * width + px) * 4;
            buffer[idx] = 0;
            buffer[idx + 1] = 0;
            buffer[idx + 2] = 0;
            buffer[idx + 3] = 0;
          }
        }
      },
      drawImage: (...args) => {
        const [src, ...coords] = args;
        if (!src || !src.getContext) return;
        const sCtx = src.getContext('2d');
        const sBuf = sCtx.getImageData(0, 0, src.width, src.height).data;

        let srcX = 0, srcY = 0, srcW = src.width, srcH = src.height;
        let dstX = 0, dstY = 0, dstW = width, dstH = height;

        if (coords.length === 2) {
          [dstX, dstY] = coords;
          dstW = src.width;
          dstH = src.height;
        } else if (coords.length === 4) {
          [dstX, dstY, dstW, dstH] = coords;
        } else if (coords.length === 8) {
          [srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH] = coords;
        }

        for (let y = 0; y < dstH; y++) {
          for (let x = 0; x < dstW; x++) {
            const tx = dstX + x;
            const ty = dstY + y;
            if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;

            const sxPos = Math.floor(srcX + (x + 0.5) * (srcW / dstW));
            const syPos = Math.floor(srcY + (y + 0.5) * (srcH / dstH));
            if (sxPos < 0 || sxPos >= src.width || syPos < 0 || syPos >= src.height) continue;

            const sIdx = (syPos * src.width + sxPos) * 4;
            const tIdx = (ty * width + tx) * 4;

            buffer[tIdx] = sBuf[sIdx];
            buffer[tIdx + 1] = sBuf[sIdx + 1];
            buffer[tIdx + 2] = sBuf[sIdx + 2];
            buffer[tIdx + 3] = sBuf[sIdx + 3];
          }
        }
      },
      getImageData: (x, y, w, h) => ({
        data: buffer,
        width: w,
        height: h,
      }),
      putImageData: (imgData, x, y) => {
        buffer.set(imgData.data);
      },
      createImageData: (w, h) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      fillText: () => {},
      measureText: (txt = '') => ({ width: String(txt).length * 10 }),
    }),
    toDataURL: () => 'data:image/png;base64,',
    toBlob: (cb) => cb && cb(new Blob(['mock'])),
  };
}

/**
 * Loads an image from URL or data URI.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Creates a deterministic 64x64 classic skin for the initial demo state.
 * Keeping this procedural avoids treating an unrelated or malformed image in
 * `public/` as a valid skin and keeps the app usable before the first upload.
 */
export function createDefaultSkinCanvas() {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);

  const fill = (color, x, y, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  };

  // Head base layer.
  fill('#d8a477', 0, 8, 32, 8);
  fill('#5b3525', 8, 0, 8, 8);
  fill('#d8a477', 16, 0, 8, 8);
  fill('#5b3525', 24, 8, 8, 8);
  fill('#5b3525', 8, 8, 8, 2);
  fill('#4aa3df', 9, 11, 2, 1);
  fill('#4aa3df', 13, 11, 2, 1);

  // Sparse hat overlay so the demo shows both sliced decor and its core.
  fill('#3c241b', 40, 0, 8, 2);
  fill('#3c241b', 40, 8, 8, 2);
  fill('#3c241b', 32, 8, 2, 8);
  fill('#3c241b', 62, 8, 2, 8);

  // Torso and jacket.
  fill('#1699c5', 16, 20, 24, 12);
  fill('#20afd8', 20, 16, 16, 4);
  fill('#0d6f96', 20, 20, 8, 2);
  fill('#0d6f96', 20, 36, 8, 2);
  fill('#0d6f96', 16, 36, 2, 12);
  fill('#0d6f96', 38, 36, 2, 12);

  // Right arm base and sleeve overlay.
  fill('#d8a477', 40, 16, 16, 16);
  fill('#1699c5', 40, 16, 16, 7);
  fill('#0d6f96', 40, 32, 16, 3);
  fill('#0d6f96', 40, 36, 2, 12);

  // Right leg base and pants overlay.
  fill('#334f9d', 0, 16, 16, 16);
  fill('#243c82', 0, 32, 16, 3);
  fill('#243c82', 0, 36, 2, 12);

  // Left leg base / pants overlay.
  fill('#334f9d', 16, 48, 16, 16);
  fill('#243c82', 0, 48, 16, 3);
  fill('#243c82', 14, 52, 2, 12);

  // Left arm base / sleeve overlay. Pixel (47, 52) remains opaque, which is
  // the exact classic/slim discriminator used by mc_sticker.py.
  fill('#d8a477', 32, 48, 16, 16);
  fill('#1699c5', 32, 48, 16, 7);
  fill('#0d6f96', 48, 48, 16, 3);
  fill('#0d6f96', 62, 52, 2, 12);

  return canvas;
}


function copyMirroredFacePixels(data, srcX, srcY, w, h, dstX, dstY) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const srcIdx = ((srcY + dy) * 64 + (srcX + (w - 1 - dx))) * 4;
      const dstIdx = ((dstY + dy) * 64 + (dstX + dx)) * 4;
      data[dstIdx] = data[srcIdx];
      data[dstIdx + 1] = data[srcIdx + 1];
      data[dstIdx + 2] = data[srcIdx + 2];
      data[dstIdx + 3] = data[srcIdx + 3];
    }
  }
}

function copyMirroredLimbPixels(data, srcX, srcY, dstX, dstY) {
  // Top face
  copyMirroredFacePixels(data, srcX + 4, srcY, 4, 4, dstX + 4, dstY);
  // Bottom face
  copyMirroredFacePixels(data, srcX + 8, srcY, 4, 4, dstX + 8, dstY);
  // Front face
  copyMirroredFacePixels(data, srcX + 4, srcY + 4, 4, 12, dstX + 4, dstY + 4);
  // Back face
  copyMirroredFacePixels(data, srcX + 12, srcY + 4, 4, 12, dstX + 12, dstY + 4);
  // Right (Outer) face -> Left (Outer) face
  copyMirroredFacePixels(data, srcX, srcY + 4, 4, 12, dstX + 8, dstY + 4);
  // Left (Inner) face -> Right (Inner) face
  copyMirroredFacePixels(data, srcX + 8, srcY + 4, 4, 12, dstX, dstY + 4);
}

/**
 * Preprocesses semi-transparent pixels matching mc_render.py `preprocess_skin_alpha`.
 * @param {SkinData} skin
 * @param {number|null} alphaThreshold
 * @returns {SkinData}
 */
export function preprocessSkinAlpha(skin, alphaThreshold = null) {
  if (alphaThreshold === null || alphaThreshold === undefined) return skin;
  const cutoff = alphaThreshold <= 1.0 ? alphaThreshold * 255.0 : Number(alphaThreshold);
  const data = skin.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < cutoff || a === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else {
      data[i + 3] = 255;
    }
  }
  skin.ctx.putImageData(skin.imageData, 0, 0);
  // Recompute isSlim after alpha threshold preprocessing
  const p47_52 = skin.getPixel(47, 52);
  skin.isSlim = p47_52[3] === 0;
  return skin;
}

/**
 * Compensates missing decor layer textures when two adjacent faces are inconsistent.
 * Faithful 1:1 port of mc_voxel_texture_resolver.py.
 * Priority: front (0) > back (1) > top (2) > bottom (3) > left (4) > right (5)
 * @param {SkinData} skin
 * @returns {SkinData}
 */
export function resolveVoxelConsistency(skin) {
  const isSlim = skin.isSlim;
  const data = skin.data;

  const getPixel = (x, y) => {
    if (x < 0 || x >= 64 || y < 0 || y >= 64) return [0, 0, 0, 0];
    const idx = (Math.floor(y) * 64 + Math.floor(x)) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };

  const setPixel = (x, y, c) => {
    if (x < 0 || x >= 64 || y < 0 || y >= 64) return;
    const idx = (Math.floor(y) * 64 + Math.floor(x)) * 4;
    data[idx] = c[0];
    data[idx + 1] = c[1];
    data[idx + 2] = c[2];
    data[idx + 3] = c[3];
  };

  const parts = [
    // 0: head
    {
      decorOffset: [32, 0],
      faces: [
        { size: [8, 8, 8], offset: [8, 8] },   // 0: front
        { size: [8, 8, 8], offset: [24, 8] },  // 1: back
        { size: [8, 8, 8], offset: [16, 8] },  // 2: left
        { size: [8, 8, 8], offset: [0, 8] },   // 3: right
        { size: [8, 8, 8], offset: [8, 0] },   // 4: top
        { size: [8, 8, 8], offset: [16, 0] },  // 5: bottom
      ]
    },
    // 1: body
    {
      decorOffset: [0, 16],
      faces: [
        { size: [8, 12, 4], offset: [20, 20] },     // 0: front
        { size: [8, 12, 4], offset: [32, 20] },     // 1: back
        { size: [4, 12, 8], offset: [28, 20] },     // 2: left
        { size: [4, 12, 8], offset: [16, 20] },     // 3: right
        { size: [8, 4, 12], offset: [20, 16] },     // 4: top
        { size: [8, 4, 12], offset: [28, 16] },     // 5: bottom
      ]
    },
    // 2: left arm
    {
      decorOffset: [16, 0],
      faces: [
        { size: [isSlim ? 3 : 4, 12, 4], offset: [36, 52] },                      // 0: front
        { size: [isSlim ? 3 : 4, 12, 4], offset: [44 - (isSlim ? 1 : 0), 52] },   // 1: back
        { size: [4, 12, 4], offset: [40 - (isSlim ? 1 : 0), 52] },                // 2: left
        { size: [4, 12, 4], offset: [32, 52] },                                   // 3: right
        { size: [isSlim ? 3 : 4, 4, 12], offset: [36, 48] },                      // 4: top
        { size: [isSlim ? 3 : 4, 4, 12], offset: [40 - (isSlim ? 1 : 0), 48] },   // 5: bottom
      ]
    },
    // 3: right arm
    {
      decorOffset: [0, 16],
      faces: [
        { size: [isSlim ? 3 : 4, 12, 4], offset: [44, 20] },                      // 0: front
        { size: [isSlim ? 3 : 4, 12, 4], offset: [52 - (isSlim ? 1 : 0), 20] },   // 1: back
        { size: [4, 12, 4], offset: [48 - (isSlim ? 1 : 0), 20] },                // 2: left
        { size: [4, 12, 4], offset: [40, 20] },                                   // 3: right
        { size: [isSlim ? 3 : 4, 4, 12], offset: [44, 16] },                      // 4: top
        { size: [isSlim ? 3 : 4, 4, 12], offset: [48 - (isSlim ? 1 : 0), 16] },   // 5: bottom
      ]
    },
    // 4: left leg
    {
      decorOffset: [-16, 0],
      faces: [
        { size: [4, 12, 4], offset: [20, 52] }, // 0: front
        { size: [4, 12, 4], offset: [28, 52] }, // 1: back
        { size: [4, 12, 4], offset: [24, 52] }, // 2: left
        { size: [4, 12, 4], offset: [16, 52] }, // 3: right
        { size: [4, 4, 12], offset: [20, 48] }, // 4: top
        { size: [4, 4, 12], offset: [24, 48] }, // 5: bottom
      ]
    },
    // 5: right leg
    {
      decorOffset: [0, 16],
      faces: [
        { size: [4, 12, 4], offset: [4, 20] },  // 0: front
        { size: [4, 12, 4], offset: [12, 20] }, // 1: back
        { size: [4, 12, 4], offset: [8, 20] },  // 2: left
        { size: [4, 12, 4], offset: [0, 20] },  // 3: right
        { size: [4, 4, 12], offset: [4, 16] },  // 4: top
        { size: [4, 4, 12], offset: [8, 16] },  // 5: bottom
      ]
    }
  ];

  for (const part of parts) {
    const decorOffset = part.decorOffset;
    const [x, y, z] = part.faces[4].size;

    const colors = Array.from({ length: x }, () =>
      Array.from({ length: y }, () =>
        Array.from({ length: z }, () => [0, 0, 0, 0])
      )
    );
    const priorities = Array.from({ length: x }, () =>
      Array.from({ length: y }, () => new Uint8Array(z).fill(99))
    );

    const inverse = new Map();

    for (let idx = 0; idx < part.faces.length; idx++) {
      const { size, offset } = part.faces[idx];
      for (let dx = 0; dx < size[0]; dx++) {
        for (let dy = 0; dy < size[1]; dy++) {
          const imgX = offset[0] + dx + decorOffset[0];
          const imgY = offset[1] + dy + decorOffset[1];
          const c = getPixel(imgX, imgY);

          let newX = 0, newY = 0, newZ = 0;
          if (idx === 4) { // top
            newX = dx; newY = y - 1 - dy; newZ = z - 1;
          } else if (idx === 5) { // bottom
            newX = dx; newY = y - 1 - dy; newZ = 0;
          } else if (idx === 0) { // front
            newX = dx; newY = 0; newZ = z - 1 - dy;
          } else if (idx === 1) { // back
            newX = x - 1 - dx; newY = y - 1; newZ = z - 1 - dy;
          } else if (idx === 2) { // left
            newX = x - 1; newY = dx; newZ = z - 1 - dy;
          } else if (idx === 3) { // right
            newX = 0; newY = y - 1 - dx; newZ = z - 1 - dy;
          }

          const vKey = `${newX},${newY},${newZ}`;
          if (!inverse.has(vKey)) {
            inverse.set(vKey, []);
          }
          inverse.get(vKey).push([imgX, imgY]);

          if (c[3] === 0) continue;

          let prio = 99;
          if (idx === 0) prio = 0;      // front
          else if (idx === 1) prio = 1; // back
          else if (idx === 4) prio = 2; // top
          else if (idx === 5) prio = 3; // bottom
          else if (idx === 2) prio = 4; // left
          else if (idx === 3) prio = 5; // right

          if (priorities[newX][newY][newZ] > prio) {
            colors[newX][newY][newZ] = c;
            priorities[newX][newY][newZ] = prio;
          }
        }
      }
    }

    for (let dx = 0; dx < x; dx++) {
      for (let dy = 0; dy < y; dy++) {
        for (let dz = 0; dz < z; dz++) {
          const vKey = `${dx},${dy},${dz}`;
          if (!inverse.has(vKey)) continue;
          if (priorities[dx][dy][dz] === 99) continue;

          const targetList = inverse.get(vKey);
          for (const [ix, iy] of targetList) {
            const existingC = getPixel(ix, iy);
            if (existingC[3] === 0) {
              setPixel(ix, iy, colors[dx][dy][dz]);
            }
          }
        }
      }
    }
  }

  skin.ctx.putImageData(skin.imageData, 0, 0);
  return skin;
}

/**
 * Reads and normalizes a skin image into a 64x64 ImageData with slim detection.
 * If alphaThreshold is specified, pre-processes semi-transparent pixels first.
 * @param {HTMLImageElement | HTMLCanvasElement | ImageBitmap | ImageData} source
 * @param {number|null} [alphaThreshold=null]
 * @returns {SkinData}
 */
export function processSkin(source, alphaThreshold = null) {
  const width = source.width;
  const height = source.height;

  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error(`不支持的皮肤尺寸 ${width}×${height}，仅支持 64×64 或 64×32 PNG`);
  }

  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    if (width === 64 && height === 32) {
      const temp = createCanvas(64, 32);
      temp.getContext('2d').putImageData(source, 0, 0);
      ctx.drawImage(temp, 0, 0);
    } else {
      ctx.putImageData(source, 0, 0);
    }
  } else {
    ctx.drawImage(source, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, 64, 64);
  const data = imageData.data;

  // If 64x32 legacy skin, mirror limbs strictly per Minecraft specification (ensure_skin64x64.py)
  if (width === 64 && height === 32) {
    // Mirror Right Leg (0, 16) to Left Leg (16, 48)
    copyMirroredLimbPixels(data, 0, 16, 16, 48);
    // Mirror Right Arm (40, 16) to Left Arm (32, 48)
    copyMirroredLimbPixels(data, 40, 16, 32, 48);
    ctx.putImageData(imageData, 0, 0);
  }

  // Pixel accessor: (x, y) -> [r, g, b, a]
  const getPixel = (x, y) => {
    if (x < 0 || x >= 64 || y < 0 || y >= 64) return [0, 0, 0, 0];
    const idx = (Math.floor(y) * 64 + Math.floor(x)) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };

  // Exact mc_sticker.py discriminator:
  // `is_slim = img.getpixel((47, 52))[3] == 0`
  const p47_52 = getPixel(47, 52);
  const isSlim = p47_52[3] === 0;

  const skinObj = {
    canvas,
    ctx,
    imageData,
    data,
    getPixel,
    isSlim,
    width: 64,
    height: 64
  };

  if (alphaThreshold !== null && alphaThreshold !== undefined) {
    preprocessSkinAlpha(skinObj, alphaThreshold);
  }

  return skinObj;
}
