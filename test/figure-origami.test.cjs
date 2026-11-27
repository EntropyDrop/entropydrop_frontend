const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { build, buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const engineCode = buildSync({
    stdin: {
        contents: `
            export * from './src/pages/figure/origami/origamiModels';
            export * from './src/pages/figure/origami/origamiLayout';
            export * from './src/pages/figure/origami/origamiDualLayer';
            export * from './src/pages/figure/origami/origamiEngine';
            export { createCanvas, processSkin } from './src/lib/minefigure/web_sticker/src/sticker/skinHelper.js';
            export { createFigureSource, figureOrigamiPath } from './src/pages/figure/print/figureSource';
            export * from './src/pages/figure/helpers';
            export { default as enLocale } from './src/constants/locales/en';
            export { default as zhLocale } from './src/constants/locales/zh-hans';
        `,
        resolveDir: path.resolve(__dirname, '..'),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
}).outputFiles[0].text;

const engineModule = { exports: {} };
const engineBlobs = new Map();
let blobSeq = 0;
const engineContext = {
    module: engineModule,
    exports: engineModule.exports,
    require,
    console,
    Blob,
    AbortController,
    DOMException,
    URL: {
        createObjectURL(blob) {
            const url = `blob:origami-${++blobSeq}`;
            engineBlobs.set(url, blob);
            return url;
        },
        revokeObjectURL(url) {
            engineBlobs.delete(url);
        },
    },
};
vm.runInNewContext(engineCode, engineContext);
const engine = engineModule.exports;

function makeSkinCanvas({ legacy = false, slim = false, fillAllOverlay = false, markPixels = [] } = {}) {
    const canvas = engine.createCanvas(64, legacy ? 32 : 64);
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(64, canvas.height);
    const data = imgData.data;
    const fillRect = (x0, y0, w, h, rgba) => {
        for (let y = y0; y < y0 + h && y < canvas.height; y++) {
            for (let x = x0; x < x0 + w; x++) {
                const idx = (y * 64 + x) * 4;
                data[idx] = rgba[0];
                data[idx + 1] = rgba[1];
                data[idx + 2] = rgba[2];
                data[idx + 3] = rgba[3];
            }
        }
    };
    fillRect(0, 0, 32, 16, [180, 140, 110, 255]);
    fillRect(0, 16, 56, 16, [50, 110, 180, 255]);
    if (!legacy) {
        fillRect(16, 48, 32, 16, [50, 110, 180, 255]);
        if (fillAllOverlay) {
            fillRect(32, 0, 32, 16, [220, 70, 60, 255]); // hat overlay
            fillRect(0, 32, 56, 16, [60, 180, 120, 255]); // torso + right arm/leg overlay
            fillRect(0, 48, 16, 16, [60, 180, 120, 255]); // left leg overlay
            fillRect(48, 48, 16, 16, [60, 180, 120, 255]); // left arm overlay
        }
        if (slim) {
            const idx = (52 * 64 + 47) * 4;
            data[idx + 3] = 0;
        }
    }
    for (const [x, y, rgba] of markPixels) {
        const idx = (y * 64 + x) * 4;
        data[idx] = rgba[0];
        data[idx + 1] = rgba[1];
        data[idx + 2] = rgba[2];
        data[idx + 3] = rgba[3];
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

for (const isSlim of [false, true]) {
    test(`classic ${isSlim ? 'slim (Alex)' : 'standard (Steve)'} PAPER-STD-10cm A4 layout fits safely with zero overlap`, () => {
        const layout = engine.buildOrigamiLayout(isSlim, 'paper-std-10cm');
        assert.equal(layout.modelName, 'PAPER-STD-10cm');
        assert.equal(layout.shape, 'standard');
        assert.equal(layout.pageWidthMm, 210);
        assert.equal(layout.pageHeightMm, 297);
        assert.equal(layout.heightCm, 10);
        assert.equal(layout.basePages.length, 1);
        assert.equal(layout.basePages[0].role, 'all');
        assert.equal(layout.parts.length, 6);

        const armW = isSlim ? 3 : 4;
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'head').sizePx), [8, 8, 8]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'torso').sizePx), [8, 12, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'rightArm').sizePx), [armW, 12, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'leftArm').sizePx), [armW, 12, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'rightLeg').sizePx), [4, 12, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'leftLeg').sizePx), [4, 12, 4]);

        for (const [index, part] of layout.parts.entries()) {
            assert.equal(part.faces.length, 6, `${part.id} has 6 cuboid faces`);
            assert.equal(part.tabs.length, 7, `${part.id} has exactly 7 glue tabs`);
            assert.equal(part.foldLines.length, 12, `${part.id} has 5 body + 7 tab fold lines`);
            assert.equal(part.cutPolygon.length, 26, `${part.id} has a single 26-vertex closed cut outline`);

            for (const [x, y] of part.cutPolygon) {
                assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6, `${part.id} x=${x} within horizontal margin`);
                assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM, `${part.id} y=${y} within vertical safe cut area`);
            }

            for (const other of layout.parts.slice(index + 1)) {
                assert.equal(rectsOverlap(part.bounds, other.bounds), false, `${part.id} overlaps ${other.id}`);
            }
            assert.equal(rectsOverlap(part.bounds, layout.infoArea), false, `${part.id} overlaps infoArea`);
        }
    });

    test(`cute ${isSlim ? 'slim (Alex)' : 'standard (Steve)'} PAPER-CUTE-10cm 2-page A4 layout fits safely with tapered torso and zero overlap`, () => {
        const layout = engine.buildOrigamiLayout(isSlim, 'paper-cute-10cm');
        assert.equal(layout.modelName, 'PAPER-CUTE-10cm');
        assert.equal(layout.shape, 'cute');
        assert.equal(layout.heightCm, 10);
        assert.equal(layout.basePages.length, 2);
        assert.equal(layout.basePages[0].role, 'headTorso');
        assert.equal(layout.basePages[1].role, 'limbs');
        assert.equal(layout.parts.length, 6);

        const armW = isSlim ? 3 : 4;
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'head').sizePx), [8, 8, 8]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'torso').sizePx), [8, 8, 4]);
        assert.equal(layout.parts.find(p => p.id === 'torso').taper, 0.3);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'rightArm').sizePx), [armW, 8, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'leftArm').sizePx), [armW, 8, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'rightLeg').sizePx), [4, 8, 4]);
        assert.deepEqual(Array.from(layout.parts.find(p => p.id === 'leftLeg').sizePx), [4, 8, 4]);

        for (const basePage of layout.basePages) {
            const expectedCount = basePage.role === 'headTorso' ? 2 : 4;
            assert.equal(basePage.parts.length, expectedCount);
            for (const [index, part] of basePage.parts.entries()) {
                assert.equal(part.faces.length, 6);
                assert.equal(part.tabs.length, 7);
                assert.equal(part.foldLines.length, 12);
                assert.equal(part.cutPolygon.length, part.id === 'torso' ? 28 : 26, `${part.id} closed cut polygon`);

                for (const [x, y] of part.cutPolygon) {
                    assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6, `P${basePage.pageNumber} ${part.id} x=${x} within margin`);
                    assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM, `P${basePage.pageNumber} ${part.id} y=${y} within safe cut area`);
                }
                for (const other of basePage.parts.slice(index + 1)) {
                    assert.equal(rectsOverlap(part.bounds, other.bounds), false, `P${basePage.pageNumber} ${part.id} overlaps ${other.id}`);
                }
                assert.equal(rectsOverlap(part.bounds, basePage.infoArea), false, `P${basePage.pageNumber} ${part.id} overlaps infoArea`);
            }

            const svg = engine.generateOrigamiBasePageSvg(basePage);
            assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
            assert.equal((svg.match(/<path id="cut-/g) || []).length, expectedCount);
            assert.equal((svg.match(/<path id="fold-/g) || []).length, expectedCount);
            assert.doesNotMatch(svg, /<rect|<image/);
        }
    });

    test(`13cm models (${isSlim ? 'slim' : 'standard'}): PAPER-STD-13cm (2 base pages) and PAPER-CUTE-13cm (3 base pages w/ rotated head) fit safely with zero overlap`, () => {
        // 1) PAPER-STD-13cm: 2 base pages (headTorso + limbs)
        const std13 = engine.buildOrigamiLayout(isSlim, 'paper-std-13cm');
        assert.equal(std13.modelName, 'PAPER-STD-13cm');
        assert.equal(std13.shape, 'standard');
        assert.equal(std13.heightCm, 13);
        assert.equal(std13.basePages.length, 2);
        assert.deepEqual(Array.from(std13.basePages, p => p.role), ['headTorso', 'limbs']);
        for (const basePage of std13.basePages) {
            const expectedCount = basePage.role === 'headTorso' ? 2 : 4;
            assert.equal(basePage.parts.length, expectedCount);
            for (const [index, part] of basePage.parts.entries()) {
                assert.equal(part.cutPolygon.length, 26);
                for (const [x, y] of part.cutPolygon) {
                    assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6, `STD-13 P${basePage.pageNumber} ${part.id} x=${x} within margin`);
                    assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM, `STD-13 P${basePage.pageNumber} ${part.id} y=${y} within safe cut area`);
                }
                for (const other of basePage.parts.slice(index + 1)) {
                    assert.equal(rectsOverlap(part.bounds, other.bounds), false, `STD-13 P${basePage.pageNumber} ${part.id} overlaps ${other.id}`);
                }
                assert.equal(rectsOverlap(part.bounds, basePage.infoArea), false);
            }
            const svg = engine.generateOrigamiBasePageSvg(basePage);
            assert.equal((svg.match(/<path id="cut-/g) || []).length, expectedCount);
        }

        // 2) PAPER-CUTE-13cm: 3 base pages (head rotated 90° + tapered torso + limbs)
        const cute13 = engine.buildOrigamiLayout(isSlim, 'paper-cute-13cm');
        assert.equal(cute13.modelName, 'PAPER-CUTE-13cm');
        assert.equal(cute13.shape, 'cute');
        assert.equal(cute13.heightCm, 13);
        assert.equal(cute13.basePages.length, 3);
        assert.deepEqual(Array.from(cute13.basePages, p => p.role), ['head', 'torso', 'limbs']);
        const head13 = cute13.parts.find(p => p.id === 'head');
        assert.ok(head13.bounds.height > head13.bounds.width, 'PAPER-CUTE-13cm head is rotated 90° so it fits within A4 width');
        for (const basePage of cute13.basePages) {
            const expectedCount = basePage.role === 'limbs' ? 4 : 1;
            assert.equal(basePage.parts.length, expectedCount);
            for (const [index, part] of basePage.parts.entries()) {
                assert.equal(part.cutPolygon.length, part.id === 'torso' ? 28 : 26);
                for (const [x, y] of part.cutPolygon) {
                    assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6, `CUTE-13 P${basePage.pageNumber} ${part.id} x=${x} within margin`);
                    assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM, `CUTE-13 P${basePage.pageNumber} ${part.id} y=${y} within safe cut area`);
                }
                for (const other of basePage.parts.slice(index + 1)) {
                    assert.equal(rectsOverlap(part.bounds, other.bounds), false, `CUTE-13 P${basePage.pageNumber} ${part.id} overlaps ${other.id}`);
                }
                assert.equal(rectsOverlap(part.bounds, basePage.infoArea), false);
            }
            const svg = engine.generateOrigamiBasePageSvg(basePage);
            assert.equal((svg.match(/<path id="cut-/g) || []).length, expectedCount);
        }
    });
}

test('face extraction flips bottom UV vertically, merges outer layer into base when enabled, and mirrors 64x32 legacy skins', () => {
    const canvas = makeSkinCanvas({
        markPixels: [
            [16, 0, [255, 0, 0, 255]],
            [16, 7, [0, 255, 0, 255]],
            [40, 8, [0, 0, 255, 255]],
        ],
    });
    const skin = engine.processSkin(canvas, 0.5);
    const layout = engine.buildOrigamiLayout(skin.isSlim);

    const withOverlay = engine.extractPartFaceCanvases(skin.data, layout, true);
    const withoutOverlay = engine.extractPartFaceCanvases(skin.data, layout, false);

    const bottomPixels = withOverlay.head.bottom.getContext('2d').getImageData(0, 0, 8, 8).data;
    assert.deepEqual(Array.from(bottomPixels.slice(0, 4)), [0, 255, 0, 255], 'bottom dy=0 matches front edge');
    const lastRowIdx = 7 * 8 * 4;
    assert.deepEqual(Array.from(bottomPixels.slice(lastRowIdx, lastRowIdx + 4)), [255, 0, 0, 255], 'bottom dy=7 matches back edge');

    const frontOn = withOverlay.head.front.getContext('2d').getImageData(0, 0, 8, 8).data;
    const frontOff = withoutOverlay.head.front.getContext('2d').getImageData(0, 0, 8, 8).data;
    assert.deepEqual(Array.from(frontOn.slice(0, 4)), [0, 0, 255, 255]);
    assert.deepEqual(Array.from(frontOff.slice(0, 4)), [180, 140, 110, 255]);

    const legacySkin = engine.processSkin(makeSkinCanvas({ legacy: true }), 0.5);
    assert.equal(legacySkin.width, 64);
    assert.equal(legacySkin.height, 64);
    assert.equal(legacySkin.isSlim, false);
});

test('dual-layer support algorithm segments islands, traces hollow cutouts, and sizes 1-piece equilateral triangular supports', () => {
    const mm = 3.125;

    // 1) Solid 8x8 patch -> 4 symmetric corner-inset key voxels, all 1-piece equilateral triangle supports
    const solid8x8 = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) solid8x8.push([x, y]);
    const anchors8x8 = engine.selectKeySupportVoxels(solid8x8);
    assert.deepEqual(
        Array.from(anchors8x8, p => Array.from(p)),
        [[1, 1], [6, 1], [1, 6], [6, 6]],
        'solid 8x8 gets 4 symmetric corner-inset anchors',
    );
    for (const pt of anchors8x8) {
        const sized = engine.sizeTriangleSupport(solid8x8, pt, mm);
        assert.equal(sized.kind, 'triangle');
        assert.ok(sized.sideMm > 2.5);
    }

    // 2) Thin 8x1 headband strip -> evenly spaced triangle supports hidden within 1px height
    const strip8x1 = Array.from({ length: 8 }, (_, x) => [x, 0]);
    const anchorsStrip = engine.selectKeySupportVoxels(strip8x1);
    assert.ok(anchorsStrip.length >= 2 && anchorsStrip.length <= 3, '8x1 strip gets 2-3 spaced supports');
    for (const pt of anchorsStrip) {
        const sized = engine.sizeTriangleSupport(strip8x1, pt, mm);
        assert.equal(sized.kind, 'triangle');
        assert.ok(sized.sideMm * (Math.sqrt(3) / 2) < mm, 'triangle altitude stays strictly inside 1px strip width');
    }

    // 3) Single isolated 1x1 voxel -> 1 triangle support strictly smaller than one 3.125 mm pixel
    const dot1x1 = [[3, 4]];
    const anchorsDot = engine.selectKeySupportVoxels(dot1x1);
    assert.deepEqual(Array.from(anchorsDot, p => Array.from(p)), [[3, 4]]);
    const dotSized = engine.sizeTriangleSupport(dot1x1, anchorsDot[0], mm);
    assert.equal(dotSized.kind, 'triangle');
    assert.ok(dotSized.sideMm < mm, 'single-voxel triangle support stays hidden behind 1x1 voxel');

    // 4) Hollow 5x5 helmet visor (center 3x1 eye slot cut out) -> produces 2 boundary loops (outer + inner hole)
    const hollow = [];
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            if (y === 2 && x >= 1 && x <= 3) continue;
            hollow.push([x, y]);
        }
    }
    const loops = engine.tracePixelBoundaryLoops(hollow);
    assert.equal(loops.length, 2, 'hollow visor produces outer perimeter + inner eye cutout loop');

    // 5) 4-connected geodesic stability: 3x3 centered, 4x4 & 5x5 4-corner (no seesaw), 4x1 2-end, U-shape supports both legs across air, staircase supports middle bend
    const gridToPixels = rows => {
        const pts = [];
        rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') pts.push([x, y]); }));
        return pts;
    };
    const normPts = pts => Array.from(pts, p => Array.from(p));

    assert.deepEqual(normPts(engine.selectKeySupportVoxels(gridToPixels(['###', '###', '###']))), [[1, 1]], '3x3 centered');
    assert.deepEqual(normPts(engine.selectKeySupportVoxels(gridToPixels(['####']))), [[0, 0], [3, 0]], '4x1 bridged at both ends');
    assert.deepEqual(
        normPts(engine.selectKeySupportVoxels(gridToPixels(['####', '####', '####', '####']))),
        [[0, 0], [3, 0], [0, 3], [3, 3]],
        '4x4 gets 4 symmetric corner supports instead of 1 off-center support',
    );
    assert.deepEqual(
        normPts(engine.selectKeySupportVoxels(gridToPixels(['#####', '#####', '#####', '#####', '#####']))),
        [[1, 1], [3, 1], [1, 3], [3, 3]],
        '5x5 gets 4 symmetric inset supports (no diagonal seesaw)',
    );
    const uSupports = normPts(engine.selectKeySupportVoxels(gridToPixels(['####', '#..#', '#..#', '#..#'])));
    assert.ok(uSupports.some(([x, y]) => x === 0 && y === 3), 'narrow U-shape supports left hanging leg');
    assert.ok(uSupports.some(([x, y]) => x === 3 && y === 3), 'narrow U-shape supports right hanging leg (geodesic does not jump across air)');
    assert.ok(uSupports.length >= 3, 'narrow U-shape also braces top bridge');

    const stairSupports = normPts(engine.selectKeySupportVoxels(gridToPixels(['##..', '.##.', '..##', '...#'])));
    assert.equal(stairSupports.length, 3, '7px 1-wide diagonal staircase gets 3 supports (both ends + middle bend)');

    // 6) Pure diagonally-touching pixels are split into separate 4-connected islands, each with its own support
    const diagSkin = engine.processSkin(makeSkinCanvas({
        markPixels: [
            [40, 8, [255, 0, 0, 255]],
            [41, 9, [0, 255, 0, 255]],
            [42, 10, [0, 0, 255, 255]],
        ],
    }), 0.5);
    const diagPlan = engine.buildDualLayerPlan(engine.buildOrigamiLayout(false, 'paper-std-10cm'), diagSkin.data);
    assert.equal(diagPlan.islands.length, 3, 'diagonally-touching voxels are strictly split into 3 separate islands');
    assert.equal(diagPlan.supportCount, 3, 'every diagonal-only voxel gets its own L-support');
});

for (const modelId of ['paper-std-10cm', 'paper-std-13cm', 'paper-cute-10cm', 'paper-cute-13cm']) {
    test(`dual-layer A4 packing (${modelId}) places all islands & triangular supports inside safe bounds with zero overlap even on 100% overlay skins`, () => {
        const markPixels = [];
        for (let y = 8; y < 16; y++) for (let x = 40; x < 48; x++) markPixels.push([x, y, [0, 0, 0, 0]]);
        for (let x = 40; x < 48; x++) markPixels.push([x, 8, [255, 200, 40, 255]]);
        markPixels.push([43, 12, [40, 220, 255, 255]]);
        for (let y = 14; y < 16; y++) for (let x = 40; x < 42; x++) markPixels.push([x, y, [200, 40, 200, 255]]);

        const skin = engine.processSkin(makeSkinCanvas({ fillAllOverlay: true, markPixels }), 0.5);
        const layout = engine.buildOrigamiLayout(skin.isSlim, modelId);
        const plan = engine.buildDualLayerPlan(layout, skin.data);

        assert.ok(plan.islands.length >= 36, 'extracts islands across all faces');
        assert.ok(plan.supportCount > 0, 'generates equilateral triangle supports');
        assert.equal(plan.supports.length, plan.supportCount);
        assert.ok(plan.supports.every(s => s.kind === 'triangle'), 'every support uses the 1-piece equilateral triangular prism');

        const expectedStartPage = layout.basePages.length + 1;
        assert.equal(plan.overlayPages[0].pageNumber, expectedStartPage, `${modelId} overlay starts on Page ${expectedStartPage}`);

        if (layout.shape === 'cute') {
            const torsoFrontIsland = plan.islands.find(i => i.partId === 'torso' && i.faceName === 'front');
            assert.ok(torsoFrontIsland, 'Cute torso front overlay extracted');
            assert.equal(torsoFrontIsland.taperTopFactor, 0.3, 'Cute torso front overlay inherits CUTE_TAPER (0.3)');
            const placedTorsoFront = plan.overlayPages.flatMap(p => p.islands).find(p => p.island === torsoFrontIsland);
            assert.ok(placedTorsoFront);
            const [p0, p1, p2, p3] = placedTorsoFront.cutLoopsMm[0];
            const topW = Math.abs(p1[0] - p0[0]);
            const botW = Math.abs(p2[0] - p3[0]);
            assert.ok(Math.abs(topW / botW - 0.7) < 1e-3, `Cute torso front overlay top/bottom width ratio (${topW}/${botW}) should equal 0.7`);
        }

        // Every support anchor mounts strictly inside (0, 1) x (0, 1) on its base face
        for (const sup of plan.supports) {
            assert.ok(sup.baseU > 0 && sup.baseU < 1, `support #${sup.index} baseU=${sup.baseU} inside base face`);
            assert.ok(sup.baseV > 0 && sup.baseV < 1, `support #${sup.index} baseV=${sup.baseV} inside base face`);
        }

        for (const island of plan.islands) {
            assert.ok(island.supports.length >= 1, `${island.id} has at least 1 support`);
            const pixelSet = new Set(island.pixels.map(([x, y]) => `${x},${y}`));
            for (const sup of island.supports) {
                assert.ok(pixelSet.has(`${sup.x},${sup.y}`), `${island.id} support #${sup.index} sits on an occupied pixel`);
            }
        }

        assert.ok(plan.overlayPages.length >= 1);
        for (const page of plan.overlayPages) {
            const boxes = [
                ...page.islands.map(i => ({ id: `island-${i.island.id}`, x: i.x, y: i.y, width: i.widthMm, height: i.heightMm })),
                ...page.supports.map(s => ({ id: `support-${s.anchor.index}`, ...s.bounds })),
            ];
            for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                    assert.equal(rectsOverlap(boxes[i], boxes[j]), false, `${boxes[i].id} overlaps ${boxes[j].id}`);
                }
            }
            for (const placed of page.islands) {
                for (const loop of placed.cutLoopsMm) {
                    for (const [x, y] of loop) {
                        assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6);
                        assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM);
                    }
                }
            }
            for (const placed of page.supports) {
                assert.equal(placed.pieces.length, 1, 'triangle support is 1 unfolded piece');
                assert.equal(placed.pieces[0].cutPolygon.length, 13, 'self-gluing equilateral triangle support polygon has 13 vertices');
                assert.equal(placed.pieces[0].foldLines.length, 5, 'triangle support has 5 mountain fold lines (3 equal sides, self-glue tab, top & bottom flaps)');
                assert.equal(placed.pieces[0].glueTabPolygons.length, 3, 'triangle support has top flap, bottom flap, and self-glue tab');
                assert.ok(placed.pieces[0].foldLines.every(l => l.kind === 'mountain'));
                const expectedWallW = 3 * placed.anchor.sideMm;
                assert.ok(Math.abs(placed.pieces[0].wallRect.width - expectedWallW) < 0.02, 'wall strip consists of 3 equal equilateral sides');
                assert.ok(placed.bounds.width > expectedWallW + 0.9, 'bounds extend past 3-wall strip with the extra self-gluing segment');
                for (const [x, y] of placed.pieces[0].cutPolygon) {
                    assert.ok(x >= engine.PAGE_MARGIN_X_MM - 1e-6 && x <= 210 - engine.PAGE_MARGIN_X_MM + 1e-6);
                    assert.ok(y >= engine.CUT_SAFE_TOP_MM && y <= engine.CUT_SAFE_BOTTOM_MM);
                }
            }

            const svg = engine.generateOverlayPageSvg(page);
            assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
            assert.match(svg, /<g id="cut-lines"/);
            assert.match(svg, /<g id="fold-lines"/);
            assert.doesNotMatch(svg, /<rect|<image/);
        }
    });
}

test('dual-layer outer skin dimensions and standoffs match MCModal (MC.tsx) ratios for STD and CUTE models', () => {
    const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: got ${a}, expected ${b}`);

    // 1) PAPER-STD-10cm (Steve & Slim): Head 8->9 (+1 unit, +0.5/side), Body/Limbs +0.5 unit (+0.25/side)
    for (const isSlim of [false, true]) {
        const stdLayout = engine.buildOrigamiLayout(isSlim, 'paper-std-10cm');
        const mm = 100 / 32; // 3.125 mm
        const head = stdLayout.parts.find(p => p.id === 'head');
        const headFront = engine.getOverlayFaceMetrics(head, head.faces.find(f => f.name === 'front'), 'paper-std-10cm');
        approx(headFront.outerWidthMm, 9 * mm, 'STD head outer width = 9 units');
        approx(headFront.outerHeightMm, 9 * mm, 'STD head outer height = 9 units');
        approx(headFront.standoffMm, 0.5 * mm, 'STD head standoff = 0.5 unit');

        const torso = stdLayout.parts.find(p => p.id === 'torso');
        const torsoFront = engine.getOverlayFaceMetrics(torso, torso.faces.find(f => f.name === 'front'), 'paper-std-10cm');
        const torsoLeft = engine.getOverlayFaceMetrics(torso, torso.faces.find(f => f.name === 'left'), 'paper-std-10cm');
        approx(torsoFront.outerWidthMm, 8.5 * mm, 'STD torso front outer width = 8.5 units');
        approx(torsoFront.outerHeightMm, 12.5 * mm, 'STD torso front outer height = 12.5 units');
        approx(torsoFront.standoffMm, 0.25 * mm, 'STD torso front standoff = 0.25 unit');
        approx(torsoLeft.outerWidthMm, 4.5 * mm, 'STD torso side outer width = 4.5 units');
        approx(torsoLeft.standoffMm, 0.25 * mm, 'STD torso side standoff = 0.25 unit');

        const armW = isSlim ? 3 : 4;
        const arm = stdLayout.parts.find(p => p.id === 'rightArm');
        const armFront = engine.getOverlayFaceMetrics(arm, arm.faces.find(f => f.name === 'front'), 'paper-std-10cm');
        approx(armFront.outerWidthMm, (armW + 0.5) * mm, `STD arm (${armW}px) outer width = ${armW + 0.5} units`);
        approx(armFront.outerHeightMm, 12.5 * mm, 'STD arm outer height = 12.5 units');
        approx(armFront.standoffMm, 0.25 * mm, 'STD arm standoff = 0.25 unit');
    }

    // 2) PAPER-CUTE-10cm: Head 9x9x9, Body [8.5, 8.5, 4.5] scaled [0.85, 0.85, 1] with 0.3 taper, Limbs +0.5 scaled [0.85, 0.85, 1]
    const cuteLayout = engine.buildOrigamiLayout(false, 'paper-cute-10cm');
    const cmm = 100 / 21.6;
    const cHead = cuteLayout.parts.find(p => p.id === 'head');
    const cHeadFront = engine.getOverlayFaceMetrics(cHead, cHead.faces.find(f => f.name === 'front'), 'paper-cute-10cm');
    approx(cHeadFront.outerWidthMm, 9 * cmm, 'CUTE head outer width = 9 units');
    approx(cHeadFront.standoffMm, 0.5 * cmm, 'CUTE head standoff = 0.5 unit');

    const cTorso = cuteLayout.parts.find(p => p.id === 'torso');
    const cTorsoFront = engine.getOverlayFaceMetrics(cTorso, cTorso.faces.find(f => f.name === 'front'), 'paper-cute-10cm');
    const cTorsoTop = engine.getOverlayFaceMetrics(cTorso, cTorso.faces.find(f => f.name === 'top'), 'paper-cute-10cm');
    const cTorsoLeft = engine.getOverlayFaceMetrics(cTorso, cTorso.faces.find(f => f.name === 'left'), 'paper-cute-10cm');
    approx(cTorsoFront.outerWidthMm, 8.5 * 0.85 * cmm, 'CUTE torso front outer bottom width');
    approx(cTorsoFront.outerHeightMm, 8.5 * 0.85 * cmm, 'CUTE torso front outer height');
    approx(cTorsoFront.standoffMm, 0.25 * cmm, 'CUTE torso front standoff = 0.25 unit (Z scale 1)');
    approx(cTorsoTop.outerWidthMm, 8.5 * 0.7 * 0.85 * cmm, 'CUTE torso top outer width = 0.7x bottom');
    approx(cTorsoTop.outerHeightMm, 4.5 * cmm, 'CUTE torso top outer depth = 4.5 units');
    approx(cTorsoTop.standoffMm, 0.25 * 0.85 * cmm, 'CUTE torso top standoff = 0.25 * 0.85 unit');
    const tilt = Math.atan(0.15);
    approx(cTorsoLeft.outerWidthMm, 4.5 * cmm, 'CUTE torso side outer depth = 4.5 units');
    approx(cTorsoLeft.outerHeightMm, Math.hypot(8.5 * 0.85 * cmm, 8.5 * 0.85 * 0.15 * cmm), 'CUTE torso side outer slanted height');
    approx(cTorsoLeft.standoffMm, 0.25 * 0.85 * 0.85 * cmm * Math.cos(tilt), 'CUTE torso side perpendicular standoff');

    // 3) Verify actual packed A4 island dimensions match MCModal outer dimensions (not unscaled inner base!)
    const skin = engine.processSkin(makeSkinCanvas({ fillAllOverlay: true }), 0.5);
    const stdPlan = engine.buildDualLayerPlan(engine.buildOrigamiLayout(false, 'paper-std-10cm'), skin.data);
    const placedHeadFront = stdPlan.overlayPages.flatMap(p => p.islands).find(p => p.island.partId === 'head' && p.island.faceName === 'front');
    assert.ok(placedHeadFront);
    approx(placedHeadFront.widthMm, 9 * (100 / 32), 'packed A4 STD head overlay width is 28.125mm (9 units), not 25mm');
    approx(placedHeadFront.heightMm, 9 * (100 / 32), 'packed A4 STD head overlay height is 28.125mm (9 units), not 25mm');
    approx(placedHeadFront.island.supports[0].standoffMm, 0.5 * (100 / 32), 'head L-support height is 1.563mm');

    // 4) Single corner pixel [0, 0] on inflated Head still anchors strictly inside base face & behind outer pixel
    const cornerHead = engine.buildOrigamiLayout(false, 'paper-std-10cm').parts.find(p => p.id === 'head');
    const cornerFace = cornerHead.faces.find(f => f.name === 'front');
    const cornerMetrics = engine.getOverlayFaceMetrics(cornerHead, cornerFace, 'paper-std-10cm');
    const cornerPlacement = engine.computeSupportPlacement(cornerMetrics, cornerFace, [[0, 0]], [0, 0], 1.4);
    assert.ok(cornerPlacement.baseU > 0 && cornerPlacement.baseU < 0.125, 'corner anchor shifts inside base face');
    assert.ok(cornerPlacement.baseV > 0 && cornerPlacement.baseV < 0.125, 'corner anchor shifts inside base face vertically');
    assert.ok(Math.abs(cornerPlacement.faceOffsetXMm) + cornerPlacement.sideMm / 2 < cornerMetrics.baseWidthMm / 2, 'corner triangle does not overhang base edge');
});

test('dual-layer Page 1 keeps original base pixel colors intact and prints only anchor numbers (no crosshair strokes)', () => {
    const skin = engine.processSkin(makeSkinCanvas({ fillAllOverlay: true }), 0.5);
    const layout = engine.buildOrigamiLayout(false, 'paper-std-10cm');
    const faceCanvases = engine.extractPartFaceCanvases(skin.data, layout, false);
    const plan = engine.buildDualLayerPlan(layout, skin.data);

    let strokesWithAnchors = 0;
    let strokesWithoutAnchors = 0;
    const printedTexts = [];
    const runWithSpy = (supportAnchors) => {
        let count = 0;
        engineContext.OffscreenCanvas = function (w, h) {
            delete engineContext.OffscreenCanvas;
            const c = engine.createCanvas(w, h);
            engineContext.OffscreenCanvas = arguments.callee;
            const ctx = c.getContext('2d');
            const origStroke = ctx.stroke;
            const origFillText = ctx.fillText;
            ctx.stroke = (...args) => { count++; return origStroke.apply(ctx, args); };
            ctx.fillText = (text, ...rest) => { if (supportAnchors) printedTexts.push(String(text)); return origFillText.call(ctx, text, ...rest); };
            c.getContext = () => ctx;
            return c;
        };
        try {
            engine.renderOrigamiSheet(layout, faceCanvases, 2, undefined, undefined, { supportAnchors, showGuideLines: false });
        } finally {
            delete engineContext.OffscreenCanvas;
        }
        return count;
    };

    strokesWithoutAnchors = runWithSpy(undefined);
    strokesWithAnchors = runWithSpy(plan.supports);
    assert.equal(strokesWithAnchors, strokesWithoutAnchors, 'support anchors must not draw extra crosshair strokes over base colors');
    assert.ok(printedTexts.includes('1') && printedTexts.includes(String(plan.supportCount)), 'support anchor numbers are printed on Page 1 base');
});

test('dual-layer generateOrigami defaults to DUAL on PAPER-STD-10cm, preserves pure base on Page 1, and exports full resolution per page', async () => {
    const controller = new AbortController();
    const markPixels = [
        [40, 8, [0, 0, 255, 255]],
        [41, 8, [0, 0, 255, 255]],
        [40, 9, [0, 0, 255, 255]],
        [41, 9, [0, 0, 255, 255]],
        [44, 8, [255, 255, 0, 255]],
    ];
    const output = await engine.generateOrigami(
        makeSkinCanvas({ markPixels }),
        controller.signal,
        () => {},
        { name: 'Dual Hero', publisher: 'Maker', publisherId: '1', sourceId: 's1', sourceUrl: 'https://entropydrop.com/skin/?id=s1', labels: { publisher: 'Publisher', userId: 'ID', source: 'Skin' } },
        { modelId: 'paper-std-10cm' },
    );
    try {
        assert.equal(output.layerMode, 'dual');
        assert.equal(output.layout.modelName, 'PAPER-STD-10cm');
        assert.equal(output.sheets.length, 2, 'Page 1 base + Page 2 overlay & L-supports');
        assert.equal(output.sheets[0].kind, 'base');
        assert.equal(output.sheets[0].filenameSuffix, 'DUAL_P1_base');
        assert.equal(output.sheets[1].kind, 'overlay');
        assert.equal(output.sheets[1].filenameSuffix, 'DUAL_P2_overlay_supports');
        assert.equal(output.dualPlan.islands.length, 2);
        assert.equal(output.dualPlan.supportCount, 2);

        const baseFront = output.faceCanvases.head.front.getContext('2d').getImageData(0, 0, 8, 8).data;
        assert.deepEqual(Array.from(baseFront.slice(0, 4)), [180, 140, 110, 255]);
        const ovFront = output.overlayFaceCanvases.head.front.getContext('2d').getImageData(0, 0, 8, 8).data;
        assert.deepEqual(Array.from(ovFront.slice(0, 4)), [0, 0, 255, 255]);

        const fullP2 = await engine.generateFullOrigamiAssets(output, controller.signal, () => {}, 1);
        assert.ok(fullP2.sheetUrl);
        assert.equal(output.sheets[1].isPreviewSheet, false);
        assert.equal(output.sheets[0].isPreviewSheet, true, 'exporting Page 2 leaves Page 1 untouched');
    } finally {
        engine.disposeOrigami(output);
    }
});

test('PAPER-CUTE-10cm generates 3 pages in DUAL mode and 2 pages in SINGLE mode with per-page full export', async () => {
    const controller = new AbortController();
    const markPixels = [
        [40, 8, [0, 0, 255, 255]],
        [20, 36, [255, 80, 40, 255]], // torso front overlay pixel
    ];
    const cuteDual = await engine.generateOrigami(
        makeSkinCanvas({ markPixels }),
        controller.signal,
        () => {},
        undefined,
        { modelId: 'paper-cute-10cm', layerMode: 'dual' },
    );
    try {
        assert.equal(cuteDual.layout.modelName, 'PAPER-CUTE-10cm');
        assert.equal(cuteDual.layerMode, 'dual');
        assert.equal(cuteDual.sheets.length, 3);
        assert.deepEqual(
            Array.from(cuteDual.sheets, s => [s.kind, s.baseRole || null, s.filenameSuffix]),
            [
                ['base', 'headTorso', 'DUAL_P1_head_torso'],
                ['base', 'limbs', 'DUAL_P2_limbs'],
                ['overlay', null, 'DUAL_P3_overlay_supports'],
            ],
        );
        const fullP2 = await engine.generateFullOrigamiAssets(cuteDual, controller.signal, () => {}, 1);
        const fullP3 = await engine.generateFullOrigamiAssets(cuteDual, controller.signal, () => {}, 2);
        assert.ok(fullP2.sheetUrl && fullP3.sheetUrl);
        assert.equal(cuteDual.sheets[1].isPreviewSheet, false);
        assert.equal(cuteDual.sheets[2].isPreviewSheet, false);
    } finally {
        engine.disposeOrigami(cuteDual);
    }

    const cuteSingle = await engine.generateOrigami(
        makeSkinCanvas({ markPixels }),
        controller.signal,
        () => {},
        undefined,
        { modelId: 'paper-cute-10cm', layerMode: 'single' },
    );
    try {
        assert.equal(cuteSingle.layerMode, 'single');
        assert.equal(cuteSingle.dualPlan, undefined);
        assert.equal(cuteSingle.sheets.length, 2);
        assert.deepEqual(
            Array.from(cuteSingle.sheets, s => [s.kind, s.baseRole, s.filenameSuffix]),
            [
                ['base', 'headTorso', 'SINGLE_P1_head_torso'],
                ['base', 'limbs', 'SINGLE_P2_limbs'],
            ],
        );
    } finally {
        engine.disposeOrigami(cuteSingle);
    }
});

test('showGuideLines: false hides cut borders and dashed fold strokes on PNG while preserving SVG', async () => {
    const skin = engine.processSkin(makeSkinCanvas({ fillAllOverlay: true }), 0.5);
    const layout = engine.buildOrigamiLayout(false, 'paper-std-10cm');
    const faceCanvases = engine.extractPartFaceCanvases(skin.data, layout, false);
    const plan = engine.buildDualLayerPlan(layout, skin.data);

    // Inspect both renderOrigamiSheet and renderDualLayerOverlaySheet with a stroke-counting spy via OffscreenCanvas
    const countStrokes = fn => {
        let strokeCount = 0;
        let strokeRectCount = 0;
        engineContext.OffscreenCanvas = function (w, h) {
            delete engineContext.OffscreenCanvas;
            const c = engine.createCanvas(w, h);
            engineContext.OffscreenCanvas = arguments.callee;
            const ctx = c.getContext('2d');
            const origStroke = ctx.stroke;
            const origStrokeRect = ctx.strokeRect;
            ctx.stroke = (...args) => { strokeCount++; return origStroke.apply(ctx, args); };
            ctx.strokeRect = (...args) => { strokeRectCount++; return origStrokeRect.apply(ctx, args); };
            c.getContext = () => ctx;
            return c;
        };
        try { fn(); } finally { delete engineContext.OffscreenCanvas; }
        return { strokeCount, strokeRectCount };
    };

    const page1On = countStrokes(() => engine.renderOrigamiSheet(layout, faceCanvases, 2, undefined, undefined, { showGuideLines: true }));
    const page1Off = countStrokes(() => engine.renderOrigamiSheet(layout, faceCanvases, 2, undefined, undefined, { showGuideLines: false }));
    assert.ok(page1Off.strokeCount < page1On.strokeCount, `Page 1 strokes should drop when guide lines are off (${page1Off.strokeCount} < ${page1On.strokeCount})`);
    assert.equal(page1Off.strokeCount, 0, 'Page 1 has zero cut/fold strokes when guide lines are off');
    assert.equal(page1On.strokeRectCount, 0, 'Page 1 renders no legend/guide border box next to Published by');
    assert.equal(page1Off.strokeRectCount, 0, 'Page 1 renders no legend/guide border box when guide lines are off');

    const page2On = countStrokes(() => engine.renderDualLayerOverlaySheet(plan.overlayPages[0], 2, layout, skin.data, 2, undefined, undefined, { showGuideLines: true }));
    const page2Off = countStrokes(() => engine.renderDualLayerOverlaySheet(plan.overlayPages[0], 2, layout, skin.data, 2, undefined, undefined, { showGuideLines: false }));
    assert.ok(page2Off.strokeCount < page2On.strokeCount, `Page 2 strokes should drop when guide lines are off (${page2Off.strokeCount} < ${page2On.strokeCount})`);
    assert.equal(page2Off.strokeCount, 0, 'Page 2 has zero island/support border or fold strokes when guide lines are off');
    assert.equal(page2On.strokeRectCount, 0, 'Page 2 overlay renders no legend border box next to Published by');
    assert.equal(page2Off.strokeRectCount, 0, 'Page 2 overlay renders no legend border box when guide lines are off');
});

test('cutting and scoring SVG uses exact A4 millimetres with separate cut-lines and fold-lines groups', () => {
    const layout = engine.buildOrigamiLayout(false);
    const svg = engine.generateOrigamiSvg(layout);
    assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
    assert.match(svg, /<g id="cut-lines"/);
    assert.match(svg, /<g id="fold-lines"/);
    assert.equal((svg.match(/<path id="cut-/g) || []).length, 6);
    assert.equal((svg.match(/<path id="fold-/g) || []).length, 6);
    assert.doesNotMatch(svg, /<rect|<image/);
});

test('origami engine SINGLE mode supports tiered preview + on-demand full export and cancellation', async () => {
    const controller = new AbortController();
    const info = {
        name: 'Craft Hero',
        publisher: 'Maker',
        publisherId: 'maker1',
        sourceId: 'skin99',
        sourceUrl: 'https://entropydrop.com/skin/?id=skin99',
        sourceIsPublic: false,
        labels: { publisher: 'Published by', userId: 'User ID', source: 'Skin' },
    };
    const output = await engine.generateOrigami(makeSkinCanvas(), controller.signal, () => {}, info, { layerMode: 'single' });
    try {
        assert.equal(output.isPreviewSheet, true);
        assert.equal(output.layout.modelName, 'PAPER-STD-10cm');
        assert.equal(output.layerMode, 'single');
        assert.equal(output.sheets.length, 1);
        assert.equal(output.sheets[0].filenameSuffix, 'SINGLE_origami');
        assert.ok(output.previewSheetUrl);
        assert.ok(output.svgUrl);
        assert.equal(output.fullSheetUrl, undefined);

        const svgBlob = engineBlobs.get(output.svgUrl);
        assert.ok(svgBlob);
        const svgText = await svgBlob.text();
        assert.match(svgText, /width="210mm" height="297mm"/);

        const full = await engine.generateFullOrigamiAssets(output, controller.signal, () => {});
        assert.ok(full.sheetUrl);
        assert.equal(output.isPreviewSheet, false);
        assert.equal(output.fullSheetUrl, full.sheetUrl);

        const cached = await engine.generateFullOrigamiAssets(output, controller.signal, () => {});
        assert.equal(cached.sheetUrl, full.sheetUrl);
    } finally {
        engine.disposeOrigami(output);
    }

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
        engine.generateOrigami(makeSkinCanvas(), aborted.signal, () => assert.fail('must not report progress')),
        error => error.name === 'AbortError',
    );
});

test('figure forum exposes Sticker/Paper in bodyTypes and colorModes while preserving legacy Stickers mapping', () => {
    assert.ok(engine.BODY_TYPES_EN.includes('Sticker/Paper'));
    assert.equal(engine.MULTICOLOR_TYPES_EN[0], 'Sticker/Paper');
    assert.equal(engine.BODY_TYPES_EN.length, engine.enLocale.figureForum.bodyTypes.length);
    assert.equal(engine.BODY_TYPES_EN.length, engine.zhLocale.figureForum.bodyTypes.length);
    assert.equal(engine.MULTICOLOR_TYPES_EN.length, engine.enLocale.figureForum.colorModes.length);
    assert.equal(engine.MULTICOLOR_TYPES_EN.length, engine.zhLocale.figureForum.colorModes.length);

    assert.equal(engine.getBodyTypeLabel('Sticker/Paper', engine.enLocale), 'Sticker/Paper');
    assert.equal(engine.getBodyTypeLabel('Sticker/Paper', engine.zhLocale), '贴纸/纸张');
    assert.equal(engine.getMultiColorTypeLabel('Sticker/Paper', engine.enLocale), 'Sticker/Paper');
    assert.equal(engine.getMultiColorTypeLabel('Sticker/Paper', engine.zhLocale), '贴纸/纸张');
    // Legacy posts stored with "Stickers" still localize cleanly
    assert.equal(engine.getMultiColorTypeLabel('Stickers', engine.enLocale), 'Sticker/Paper');
    assert.equal(engine.getMultiColorTypeLabel('Stickers', engine.zhLocale), '贴纸/纸张');

    // VideoList shows support@entropydrop.com submission prompt
    const videoListSource = fs.readFileSync(path.resolve(__dirname, '../src/pages/figure/VideoList.tsx'), 'utf8');
    assert.match(videoListSource, /support@entropydrop\.com/);
    assert.match(videoListSource, /mailto:/);
    assert.match(videoListSource, /submitVideoPrefix/);
    assert.ok(engine.enLocale.figureForum.submitVideoPrefix.includes('YouTube'));
    assert.ok(engine.zhLocale.figureForum.submitVideoPrefix.includes('YouTube'));
});

test('route, navigation, sitemap, and MCModal entry use /figure/origami', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
    const origamiIdx = appSource.indexOf('<Route path="/figure/origami"');
    const wildcardIdx = appSource.indexOf('<Route path="/figure/:category"');
    assert.ok(origamiIdx > 0, 'App.tsx registers /figure/origami');
    assert.ok(origamiIdx < wildcardIdx, '/figure/origami must come before /figure/:category');

    const navSource = fs.readFileSync(path.resolve(__dirname, '../src/constants/nav.ts'), 'utf8');
    assert.match(navSource, /key:\s*'figureOrigami'[\s\S]*?path:\s*'\/figure\/origami'/);

    const sitemapSource = fs.readFileSync(path.resolve(__dirname, '../scripts/generate-sitemap.js'), 'utf8');
    assert.match(sitemapSource, /'\/figure\/origami'/);

    const modalSource = fs.readFileSync(path.resolve(__dirname, '../src/components/MCModal.tsx'), 'utf8');
    assert.match(modalSource, /navigate\(figureOrigamiPath\(source\)\);/);

    assert.equal(
        engine.figureOrigamiPath(engine.createFigureSource({ id: 'abc_123', name: 'Hero', is_public: true })),
        '/figure/origami?id=abc_123',
    );
});

const pageCompiled = build({
    stdin: {
        contents: `
            export { FigureOrigamiPage } from './src/pages/FigureOrigamiPage';
            export { default as en } from './src/constants/locales/en';
            export { default as zh } from './src/constants/locales/zh-hans';
            export { FIGURE_PRINT_TERMS } from './src/constants/figurePrintTerms';
        `,
        resolveDir: path.resolve(__dirname, '..'),
        loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom'],
    plugins: [{
        name: 'origami-page-boundaries',
        setup(b) {
            b.onResolve(
                { filter: /^@iconify\/react$|\/components\/(PageContainer|SEO|GoogleSignInButton)$|\/utils\/(httpClient|api|authClient|authSession)$|\/hooks\/(useAuthSession|useCurrentUser)$|\/origami\/(origamiEngine|OrigamiPreview)$|\/print\/download$/ },
                args => ({ path: args.path, external: true }),
            );
        },
    }],
}).then(result => result.outputFiles[0].text);

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

async function withOrigamiPage(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

    const downloads = [];
    const requests = [];
    const generatedCalls = [];
    let currentDeferred = deferred();
    let session = options.guest ? null : 'account-a';
    const listeners = new Set();
    const location = {
        search: options.search || '',
        state: options.empty ? null : { textureUrl: 'data:image/png;base64,test', source: options.source },
    };

    const mod = { exports: {} };
    vm.runInNewContext(await pageCompiled, {
        module: mod,
        exports: mod.exports,
        console,
        AbortController,
        document,
        URLSearchParams,
        window: dom.window,
        localStorage: dom.window.localStorage,
        sessionStorage: dom.window.sessionStorage,
        Event: dom.window.Event,
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
        Image: class { width = 64; height = 64; set src(_url) { queueMicrotask(() => this.onload()); } },
        setTimeout: callback => callback(),
        require(name) {
            if (name.endsWith('/utils/httpClient')) return { request: async () => ({ ok: true, blob: async () => ({}) }) };
            if (name.endsWith('/utils/authClient')) return { waitForAuthReady: async () => {} };
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) {
                return {
                    useAuthSession: () => React.useSyncExternalStore(
                        listener => { listeners.add(listener); return () => listeners.delete(listener); },
                        () => session,
                    ),
                };
            }
            if (name.endsWith('/hooks/useCurrentUser')) {
                return { useCurrentUser: () => ({ user: options.guest ? null : { id: session, is_pro: options.isPro === true } }) };
            }
            if (name.endsWith('/utils/api')) {
                return {
                    apiResponseJson: response => response.json(),
                    apiFetch: async (url, init = {}) => {
                        requests.push({ url, ...init });
                        if (url.startsWith('/api/logs/')) {
                            const entry = options.skins?.[url.slice('/api/logs/'.length)] || { status: 404 };
                            return { ok: (entry.status || 200) === 200, status: entry.status || 200, json: async () => entry.data };
                        }
                        return { ok: false, status: 404, json: async () => ({}) };
                    },
                };
            }
            if (name.endsWith('/components/PageContainer')) return { PageContainer: ({ children }) => React.createElement('main', null, children) };
            if (name.endsWith('/components/SEO')) return { SEO: () => null };
            if (name.endsWith('/components/GoogleSignInButton')) return { GoogleSignInButton: () => React.createElement('button', null, 'Google sign in') };
            if (name.endsWith('/origami/OrigamiPreview')) return { OrigamiPreview: () => React.createElement('div', null, 'origami-3d') };
            if (name.endsWith('/origami/origamiEngine')) {
                return {
                    generateOrigami: (_img, _sig, _prog, info, opts) => {
                        generatedCalls.push({ info, opts });
                        const modelId = opts?.modelId || 'paper-std-10cm';
                        const layerMode = opts?.layerMode || 'dual';
                        const isDual = layerMode === 'dual';
                        const isCute = modelId.startsWith('paper-cute-');
                        const heightCm = modelId.endsWith('-13cm') ? 13 : 10;
                        const layerTag = layerMode.toUpperCase();
                        const pending = currentDeferred;
                        const sheets = [];
                        if (modelId === 'paper-cute-13cm') {
                            sheets.push(
                                { pageNumber: 1, kind: 'base', baseRole: 'head', filenameSuffix: `${layerTag}_P1_head`, previewSheetUrl: 'blob:p1', sheetUrl: 'blob:p1', svgUrl: 'blob:svg1', isPreviewSheet: true },
                                { pageNumber: 2, kind: 'base', baseRole: 'torso', filenameSuffix: `${layerTag}_P2_torso`, previewSheetUrl: 'blob:p2', sheetUrl: 'blob:p2', svgUrl: 'blob:svg2', isPreviewSheet: true },
                                { pageNumber: 3, kind: 'base', baseRole: 'limbs', filenameSuffix: `${layerTag}_P3_limbs`, previewSheetUrl: 'blob:p3', sheetUrl: 'blob:p3', svgUrl: 'blob:svg3', isPreviewSheet: true },
                            );
                            if (isDual) {
                                sheets.push({ pageNumber: 4, kind: 'overlay', filenameSuffix: `${layerTag}_P4_overlay_supports`, previewSheetUrl: 'blob:p4', sheetUrl: 'blob:p4', svgUrl: 'blob:svg4', isPreviewSheet: true });
                            }
                        } else if (modelId === 'paper-cute-10cm' || modelId === 'paper-std-13cm') {
                            sheets.push(
                                { pageNumber: 1, kind: 'base', baseRole: 'headTorso', filenameSuffix: `${layerTag}_P1_head_torso`, previewSheetUrl: 'blob:p1', sheetUrl: 'blob:p1', svgUrl: 'blob:svg1', isPreviewSheet: true },
                                { pageNumber: 2, kind: 'base', baseRole: 'limbs', filenameSuffix: `${layerTag}_P2_limbs`, previewSheetUrl: 'blob:p2', sheetUrl: 'blob:p2', svgUrl: 'blob:svg2', isPreviewSheet: true },
                            );
                            if (isDual) {
                                sheets.push({ pageNumber: 3, kind: 'overlay', filenameSuffix: `${layerTag}_P3_overlay_supports`, previewSheetUrl: 'blob:p3', sheetUrl: 'blob:p3', svgUrl: 'blob:svg3', isPreviewSheet: true });
                            }
                        } else if (isDual) {
                            sheets.push(
                                { pageNumber: 1, kind: 'base', baseRole: 'all', filenameSuffix: `${layerTag}_P1_base`, previewSheetUrl: 'blob:p1', sheetUrl: 'blob:p1', svgUrl: 'blob:svg1', isPreviewSheet: true },
                                { pageNumber: 2, kind: 'overlay', filenameSuffix: `${layerTag}_P2_overlay_supports`, previewSheetUrl: 'blob:p2', sheetUrl: 'blob:p2', svgUrl: 'blob:svg2', isPreviewSheet: true },
                            );
                        } else {
                            sheets.push(
                                { pageNumber: 1, kind: 'base', baseRole: 'all', filenameSuffix: `${layerTag}_origami`, previewSheetUrl: 'blob:preview', sheetUrl: 'blob:preview', svgUrl: 'blob:svg', isPreviewSheet: true },
                            );
                        }
                        return pending.promise.then(() => ({
                            modelId,
                            layerMode,
                            isSlim: false,
                            includeOverlay: !isDual && (opts?.includeOverlay ?? true),
                            layout: { heightCm, shape: isCute ? 'cute' : 'standard', parts: [], basePages: [] },
                            faceCanvases: {},
                            dualPlan: isDual ? { islands: [{ id: 'H1' }, { id: 'T1' }], supports: [], supportCount: 5, overlayPages: [] } : undefined,
                            sheets,
                            previewSheetUrl: sheets[0].previewSheetUrl,
                            sheetUrl: sheets[0].sheetUrl,
                            svgUrl: sheets[0].svgUrl,
                            isPreviewSheet: true,
                        }));
                    },
                    generateFullOrigamiAssets: async (_out, _sig, _prog, pageIndex = 0) => ({
                        sheetUrl: `blob:full-sheet-${pageIndex}`,
                        svgUrl: `blob:svg-${pageIndex}`,
                    }),
                    disposeOrigami() {},
                };
            }
            if (name.endsWith('/print/download')) return { downloadUrl: (...args) => downloads.push(args) };
            if (name === 'react-router-dom') {
                return {
                    useLocation: () => location,
                    useNavigate: () => () => {},
                    Link: ({ to, children, state, ...props }) => React.createElement('a', { href: to, 'data-route-state': state ? JSON.stringify(state) : undefined, ...props }, children),
                };
            }
            if (name === '@iconify/react') return { Icon: () => null };
            return require(name);
        },
    });

    const node = document.getElementById('root');
    const root = createRoot(node);
    const { FigureOrigamiPage } = mod.exports;
    const current = mod.exports[options.lang || 'en'];
    const render = () => React.act(async () => { root.render(React.createElement(FigureOrigamiPage, { current })); });
    const button = text => Array.from(document.querySelectorAll('button')).find(btn => btn.textContent === text);
    const click = el => { assert.ok(el, 'expected clickable element'); return React.act(async () => el.click()); };
    const setSelect = async (select, value) => {
        assert.ok(select, 'expected <select> element');
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
        await React.act(async () => {
            setter.call(select, value);
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
    };

    try {
        await render();
        await check({
            node,
            downloads,
            requests,
            generatedCalls,
            current,
            button,
            click,
            modal: () => document.querySelector('dialog'),
            finish: async () => {
                const toResolve = currentDeferred;
                currentDeferred = deferred();
                await React.act(async () => toResolve.resolve());
            },
            selectModel: value => setSelect(node.querySelectorAll('header select')[0], value),
            selectLayer: value => setSelect(node.querySelectorAll('header select')[1], value),
            switchAccount: account => React.act(async () => { session = account; listeners.forEach(l => l()); }),
        });
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

for (const lang of ['zh', 'en']) {
    test(`${lang}: origami workspace supports PAPER-STD-10cm & PAPER-CUTE-10cm with DUAL (default) / SINGLE layer selector and no purchase entry`, async () => {
        const source = { id: 'skin123', name: 'Paper Knight', publisher: 'CraftMaker', publisherId: 'm1', parentId: '', publicLicense: 'CC BY-NC 4.0', isPublic: true };
        await withOrigamiPage({ lang, source }, async env => {
            assert.equal(env.node.querySelector('input[type="file"]'), null);
            assert.equal(env.button(env.current.figurePrint.commission), undefined, 'no purchase/commission button');
            assert.equal(env.node.textContent.includes(env.current.figurePrint.commissionIntro), false, 'no commission copy');
            assert.equal(env.requests.some(r => r.url.includes('/model-stock') || r.url.includes('/production-source')), false, 'no store/order API calls');

            const selects = Array.from(env.node.querySelectorAll('header select'));
            assert.equal(selects.length, 2, 'header renders Model select and Layer select side by side');
            const [modelSelect, layerSelect] = selects;
            assert.equal(modelSelect.value, 'paper-std-10cm');
            assert.deepEqual(
                Array.from(modelSelect.options).map(o => o.textContent),
                ['PAPER-STD-10cm', 'PAPER-STD-13cm', 'PAPER-CUTE-10cm', 'PAPER-CUTE-13cm'],
            );
            assert.equal(layerSelect.value, 'dual', 'layer defaults to DUAL');
            assert.deepEqual(
                Array.from(layerSelect.options).map(o => o.textContent),
                ['DUAL', 'SINGLE'],
            );
            assert.equal(env.node.querySelector('a[href="/skin/?id=skin123"]').textContent, 'Paper Knight');
            assert.equal(env.node.querySelector('a[href="/skin/edit"]').textContent, env.current.nav.edit);

            // A4 sheet instructions keep wooden sticks or glue guidance; 3D preview omits bottom-left color legend
            const jointHintRegex = lang === 'zh' ? /木棒或胶水/ : /wooden sticks or glue/i;
            assert.match(env.current.figureOrigami.sheetLabels.tipGlue, jointHintRegex);
            const previewSource = fs.readFileSync(path.resolve(__dirname, '../src/pages/figure/origami/OrigamiPreview.tsx'), 'utf8');
            assert.doesNotMatch(previewSource, /legendLabels/);

            // Verify A4 guide lines switch defaults to ON and toggles showGuideLines cleanly
            const guideSwitch = Array.from(env.node.querySelectorAll('button[role="switch"]'))
                .find(btn => btn.textContent.includes(env.current.figureOrigami.guideLines));
            assert.ok(guideSwitch, 'A4 sheet header renders cut & fold lines toggle switch');
            assert.equal(guideSwitch.getAttribute('aria-checked'), 'true');
            assert.equal(env.generatedCalls.at(-1).opts.showGuideLines, true);
            assert.equal(env.generatedCalls.at(-1).opts.layerMode, 'dual');

            // Default PAPER-STD-10cm + DUAL renders 2 page tabs and downloads Page 2 files
            await env.finish();
            await env.click(guideSwitch);
            assert.equal(guideSwitch.getAttribute('aria-checked'), 'false');
            assert.equal(env.generatedCalls.at(-1).opts.showGuideLines, false);
            await env.finish();
            const stdDualTabs = Array.from(env.node.querySelectorAll('[role="tab"]'));
            assert.equal(stdDualTabs.length, 2);
            await env.click(stdDualTabs[1]);
            await env.click(env.button(`${env.current.figureOrigami.exportSvg} (2/2)`));
            await env.click(env.button(`${env.current.figureOrigami.downloadSheet} (2/2)`));
            assert.equal(env.modal(), null, 'signed-in users download directly');
            assert.deepEqual(env.downloads.map(([, filename]) => filename), [
                'PAPER-STD-10cm_DUAL_P2_overlay_supports_cut_fold_A4.svg',
                'PAPER-STD-10cm_DUAL_P2_overlay_supports_A4.png',
            ]);
            assert.ok(env.node.querySelector('a[href="/pro"]'), 'Pro support prompt appears for non-Pro after download');

            // Switch Layer to SINGLE on PAPER-STD-10cm -> single A4 page, no tabs
            await env.selectLayer('single');
            await env.finish();
            assert.equal(env.node.querySelectorAll('[role="tab"]').length, 0);
            await env.click(env.button(env.current.figureOrigami.downloadSheet));
            assert.equal(env.downloads.at(-1)[1], 'PAPER-STD-10cm_SINGLE_origami_A4.png');

            // Switch Model to PAPER-CUTE-10cm (while SINGLE) -> 2 base pages (Head & Torso + Limbs)
            await env.selectModel('paper-cute-10cm');
            await env.finish();
            const cuteSingleTabs = Array.from(env.node.querySelectorAll('[role="tab"]'));
            assert.deepEqual(
                cuteSingleTabs.map(el => el.textContent),
                [
                    env.current.figureOrigami.pages.headTorso,
                    env.current.figureOrigami.pages.limbs.replace('{page}', '2'),
                ],
            );
            await env.click(cuteSingleTabs[1]);
            await env.click(env.button(`${env.current.figureOrigami.downloadSheet} (2/2)`));
            assert.equal(env.downloads.at(-1)[1], 'PAPER-CUTE-10cm_SINGLE_P2_limbs_A4.png');

            // Switch Layer back to DUAL on PAPER-CUTE-10cm -> 3 pages (Head & Torso, Limbs, Overlay & Supports)
            await env.selectLayer('dual');
            await env.finish();
            const cuteDualTabs = Array.from(env.node.querySelectorAll('[role="tab"]'));
            assert.equal(cuteDualTabs.length, 3);
            await env.click(cuteDualTabs[2]);
            await env.click(env.button(`${env.current.figureOrigami.downloadSheet} (3/3)`));
            assert.equal(env.downloads.at(-1)[1], 'PAPER-CUTE-10cm_DUAL_P3_overlay_supports_A4.png');

            // Switch Model to PAPER-CUTE-13cm (DUAL) -> 4 pages (Head, Torso, Limbs, Overlay & Supports)
            await env.selectModel('paper-cute-13cm');
            await env.finish();
            const cute13Tabs = Array.from(env.node.querySelectorAll('[role="tab"]'));
            assert.deepEqual(
                cute13Tabs.map(el => el.textContent),
                [
                    env.current.figureOrigami.pages.head,
                    env.current.figureOrigami.pages.torso,
                    env.current.figureOrigami.pages.limbs.replace('{page}', '3'),
                    env.current.figureOrigami.pages.overlay.replace('{page}', '4'),
                ],
            );
            await env.click(cute13Tabs[0]);
            await env.click(env.button(`${env.current.figureOrigami.downloadSheet} (1/4)`));
            assert.equal(env.downloads.at(-1)[1], 'PAPER-CUTE-13cm_DUAL_P1_head_A4.png');
        });
    });
}

test('empty origami page shows collections, Discover, Showcase, and Footer with zero purchase UI', async () => {
    await withOrigamiPage({ empty: true }, async env => {
        assert.equal(env.node.querySelector('a[href="/skin/collection"]').textContent, env.current.figurePrint.chooseCollection);
        assert.equal(env.node.querySelector('a[href="/skin/"]').textContent, env.current.figurePrint.discoverSkins);
        assert.equal(env.node.querySelector('a[href="/figure/showcase"]').textContent, env.current.nav.showcase);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
        assert.equal(env.node.querySelector('input[type="file"]'), null);
        assert.ok(env.node.querySelector('footer'));
        assert.ok(env.node.textContent.includes(env.current.figureOrigami.empty));
    });
});

test('guests must sign in with the non-commercial notice before downloading origami files', async () => {
    await withOrigamiPage({ guest: true }, async env => {
        await env.finish();
        await env.click(env.button(`${env.current.figureOrigami.downloadSheet} (1/2)`));
        assert.ok(env.modal(), 'sign-in & non-commercial dialog opens for guest');
        assert.ok(env.modal().textContent.includes(env.current.figurePrint.loginForDownload));
        assert.ok(env.modal().textContent.includes(env.current.figurePrintTerms.summary));
        assert.equal(env.downloads.length, 0);
        await env.switchAccount('account-b');
        assert.equal(env.modal(), null, 'account switch cancels pending download');
    });
});
