const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

// Minimal pixel-backed canvas for normalization; Cute rendering writes real RGBA pixels.
class PixelCanvas {
    constructor(width = 0, height = 0) { this.width = width; this.height = height; }
    get data() {
        if (this.pixels?.length !== this.width * this.height * 4) this.pixels = new Uint8ClampedArray(this.width * this.height * 4);
        return this.pixels;
    }
    getContext() {
        const canvas = this;
        let transform = { x: 0, y: 0, sx: 1, sy: 1 }; const stack = [];
        return {
            clearRect() { canvas.data.fill(0); },
            save() { stack.push({ ...transform }); }, restore() { transform = stack.pop(); },
            translate(x, y) { transform.x += x; transform.y += y; }, scale(x, y) { transform.sx *= x; transform.sy *= y; },
            drawImage(source, ...args) {
                const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8 ? args : [0, 0, source.width, source.height, ...args];
                const original = source.data.slice();
                for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
                    const tx = Math.floor(transform.x + (dx + x + .5) * transform.sx);
                    const ty = Math.floor(transform.y + (dy + y + .5) * transform.sy);
                    const from = (Math.floor(sy + y * sh / dh) * source.width + Math.floor(sx + x * sw / dw)) * 4;
                    canvas.data.set(original.subarray(from, from + 4), (ty * canvas.width + tx) * 4);
                }
            },
            getImageData(x, y, width, height) {
                const data = new Uint8ClampedArray(width * height * 4);
                for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
                    const from = ((y + row) * canvas.width + x + col) * 4;
                    data.set(canvas.data.subarray(from, from + 4), (row * width + col) * 4);
                }
                return { data, width, height };
            },
            createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
            putImageData(image) { canvas.data.set(image.data); },
        };
    }
}
const moduleRef = { exports: {} };
vm.runInNewContext(buildSync({ entryPoints: [path.resolve(__dirname, '../src/utils/skin2dRenderer.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text,
    { module: moduleRef, exports: moduleRef.exports, document: { createElement: () => new PixelCanvas() } });
const { renderSkinIsometricFast } = moduleRef.exports;
function paint(skin, x, y, width, height, color) {
    for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) skin.data.set(color, (row * skin.width + col) * 4);
}
function fixture(slim = false, legacy = false, scale = 1) {
    const skin = new PixelCanvas(64 * scale, (legacy ? 32 : 64) * scale);
    const parts = [[0, 0, 8, 8, 8], [16, 16, 8, 12, 4], [40, 16, slim ? 3 : 4, 12, 4], [0, 16, 4, 12, 4]];
    if (!legacy) parts.push([32, 48, slim ? 3 : 4, 12, 4], [16, 48, 4, 12, 4]);
    parts.forEach(([x, y, w, h, d], i) => {
        paint(skin, x * scale, y * scale, (2 * w + 2 * d) * scale, (h + d) * scale, [(i + 1) * 30, 255, 0, 255]);
        for (let row = 0; row < h; row++) paint(skin, x * scale, (y + d + row) * scale, (2 * w + 2 * d) * scale, scale, [(i + 1) * 30, row * 16, 0, 255]);
    });
    if (slim) paint(skin, 55 * scale, 20 * scale, scale, scale, [0, 0, 0, 0]);
    return skin;
}
function render(source, options = {}) {
    const output = new PixelCanvas();
    renderSkinIsometricFast(output, source, { scale: 8, showOverlay: false, overlayInflated: true, cuteMode: true, ...options });
    return output;
}
function pixels(canvas) { return Array.from({ length: canvas.width * canvas.height }, (_, i) => [...canvas.data.slice(i * 4, i * 4 + 4)]); }

for (const slim of [false, true]) test(`Cute ${slim ? 'slim' : 'classic'} preview keeps the head and samples the same eight body rows as printing`, () => {
    const output = render(fixture(slim));
    assert.ok(output.height < 210 && output.height > 170, 'Cute must be shorter than the 32-unit standard body at scale 8');
    const colors = pixels(output).filter(p => p[3]);
    const rows = red => [...new Set(colors.filter(p => p[0] === red && p[1] !== 255).map(p => p[1] / 16))].sort((a, b) => a - b);
    assert.deepEqual(rows(30), [0, 1, 2, 3, 4, 5, 6, 7], 'head texels retain all eight original rows');
    assert.deepEqual(rows(60), [0, 2, 3, 5, 6, 8, 9, 11], 'torso keeps the shared Cute resampling pattern');
    assert.deepEqual(rows(120), [0, 2, 3, 5, 6, 8, 9, 11], 'short legs still include the original bottom row');
    assert.ok(pixels(output).filter(p => p[3]).every(p => p[3] === 255), 'opaque faces must have no partially transparent triangle seams');
});

test('Cute preview fits every pixel inside its canvas and distinguishes slim arms', () => {
    const classic = render(fixture()), slim = render(fixture(true));
    assert.ok(classic.width > slim.width);
    for (const output of [classic, slim]) {
        const border = pixels(output).filter((_, i) => i < output.width || i >= output.width * (output.height - 1) || i % output.width === 0 || i % output.width === output.width - 1);
        assert.ok(border.every(p => p[3] === 0), 'head, feet, and tilted arms must not clip');
    }
});

test('Cute overlay cutouts and partial alpha compose over the base without double-blending triangle edges', () => {
    const skin = fixture();
    paint(skin, 8, 8, 8, 8, [255, 0, 0, 255]);
    paint(skin, 40, 8, 8, 8, [0, 0, 255, 128]);
    const without = pixels(render(skin));
    const withOverlay = pixels(render(skin, { showOverlay: true, overlayInflated: false }));
    assert.equal(without.some(p => p[2]), false);
    assert.ok(withOverlay.some(p => p[0] === 127 && p[2] === 128 && p[3] === 255));
    assert.ok(withOverlay.filter(p => p[2]).every(p => p[2] === 128), 'a shared diagonal must not blend the same face twice');
});

test('legacy Cute skins reuse mirrored limbs, and HD textures preserve the same preview pixels', () => {
    const legacy = fixture(false, true);
    const modern = new PixelCanvas(64, 64); modern.data.set(legacy.data);
    for (const [sx, sy, dx, dy] of [[40, 16, 32, 48], [0, 16, 16, 48]]) {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const from = ((sy + y) * 64 + sx + 15 - x) * 4;
            modern.data.set(legacy.data.slice(from, from + 4), ((dy + y) * 64 + dx + x) * 4);
        }
    }
    assert.deepEqual(render(legacy).data, render(modern).data);
    assert.deepEqual(render(fixture()).data, render(fixture(false, false, 2)).data);
});
