const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const THREE = require('three');

const code = buildSync({
    stdin: { contents: `
        export * from './src/pages/figure/print/figureEngine';
        export { FIGURE_MODELS, getOrderPrintModel, getPrintModelProfile } from './src/pages/figure/print/figureModels';
        export { composeMergedPages } from './src/lib/minefigure/web_sticker/src/sticker/mergedComposer.js';
        export { generateParts, disposeStickerParts } from './src/lib/minefigure/web_sticker/src/sticker/stickerCore.js';
        export { resizeCanvasNearest } from './src/lib/minefigure/web_sticker/src/sticker/rasterTransform.js';
        export { getAssemblyCutterSource } from './src/lib/minefigure/web_sticker/src/sticker/assemblySettings.js';
        export { getUntaperedCuteTorsoCanvas } from './src/lib/minefigure/web_sticker/src/sticker/characterShape.js';
        export { projectHeightRuler } from './src/pages/figure/print/heightRuler';
        export { drawStickerInfo } from './src/pages/figure/print/stickerInfo';
        export { createPreviewPart } from './src/pages/figure/print/previewParts';
        export { createAssemblyPreview, ARM_TUBE_OUTER_DIAMETER_MM } from './src/pages/figure/print/explodedView';
        export { TokenRegistry } from './src/lib/minefigure/web_model/src/mcModel/tokens';
        export { createDecorCubes } from './src/lib/minefigure/web_model/src/mcModel/skinBlocks';
        export { buildHead } from './src/lib/minefigure/web_model/src/mcModel/parts';
        export { buildPartGeometry } from './src/lib/minefigure/web_model/src/mcModel/csg';
        export { createSkinVoxelGeometry } from './src/lib/minefigure/web_sticker/src/sticker/voxelPreview.js';
        export { buildFigure } from './src/lib/minefigure/web_model/src/mcModel/figure';
        export { createCanvas, processSkin, resolveVoxelConsistency } from './src/lib/minefigure/web_sticker/src/sticker/skinHelper.js';
        export { generatePageCutterSVG } from './src/lib/minefigure/web_sticker/src/sticker/vectorTracer.js';
        export { normalizeAssemblySettings, validateStickerAssemblySettings, assemblySockets, MODEL_MM_PER_UNIT, ASSEMBLY_HOLES, assemblyFaceSize, stickerHoleCircle } from './src/lib/minefigure/shared/assemblySettings.js';
    `, resolveDir: path.resolve(__dirname, '..'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['three', 'three/*', 'manifold-3d', 'manifold-3d/*'],
}).outputFiles[0].text;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, require: name => name === 'manifold-3d' ? async options => (await import('manifold-3d')).default(options) : require(name), console, setTimeout, clearTimeout, requestAnimationFrame: callback => setTimeout(callback, 0), Blob, URL, AbortController, DOMException });
const engine = moduleRef.exports;

function skinCanvas(legacy = false, slim = false) {
    const canvas = engine.createCanvas(64, legacy ? 32 : 64);
    const ctx = canvas.getContext('2d');
    ctx.fillRect(0, 0, 64, canvas.height);
    ctx.clearRect(32, 0, 32, 16);
    if (!legacy) {
        ctx.clearRect(0, 32, 64, 16);
        ctx.clearRect(0, 48, 16, 16);
        ctx.clearRect(48, 48, 16, 16);
        if (slim) ctx.clearRect(47, 52, 1, 1);
    }
    return canvas;
}

function previewFixture() {
    const geometries = [
        new THREE.BoxGeometry(3, 4, 5).rotateX(0.3).translate(6, -2, 9),
        new THREE.BoxGeometry(1, 2, 1).translate(8, -2, 10),
    ];
    const part = { id: 'leftArm', label: 'Arm', position: [0, 0, -4], meshes: geometries.map(geometry => ({ geometry, name: 'mesh' })), cutters: [] };
    const preview = engine.createPreviewPart(part);
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);
    world.add(preview.pivot);
    scene.updateMatrixWorld(true);
    return { geometries, part, preview, scene, world, dispose: () => {
        geometries.forEach(geometry => geometry.dispose());
        preview.meshes.forEach(mesh => mesh.material.dispose());
    } };
}

test('preview pivots sit at part centers without moving baked assembly geometry', () => {
    const fixture = previewFixture();
    try {
        const { preview, part, world } = fixture;
        const center = new THREE.Box3().setFromObject(preview.pivot).getCenter(new THREE.Vector3());
        assert.ok(preview.pivot.getWorldPosition(new THREE.Vector3()).distanceTo(center) < 1e-8);
        const originalMatrix = world.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(...part.position));
        for (const mesh of preview.meshes) {
            const positions = mesh.geometry.getAttribute('position');
            for (let index = 0; index < positions.count; index++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positions, index);
                assert.ok(vertex.clone().applyMatrix4(originalMatrix).distanceTo(vertex.applyMatrix4(mesh.matrixWorld)) < 1e-8);
            }
        }
    } finally { fixture.dispose(); }
});

test('XYZ drags move only the selected part in world space and leave STL data intact', async () => {
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js');
    const fixture = previewFixture();
    const { preview, part, scene, world } = fixture;
    const neighbor = engine.createPreviewPart({ ...part, position: [10, 0, -4] });
    world.add(neighbor.pivot);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    const center = preview.pivot.getWorldPosition(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(25, 15, 30));
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const transform = new TransformControls(camera);
    scene.add(transform.getHelper());
    transform.setSpace('world');
    transform.attach(preview.pivot);
    const neighborPosition = neighbor.pivot.position.clone();
    const originalStl = Buffer.from(await engine.exportPartStl(part).arrayBuffer());
    try {
        for (const axis of ['X', 'Y', 'Z']) {
            transform.axis = axis;
            scene.updateMatrixWorld(true);
            const start = preview.pivot.getWorldPosition(new THREE.Vector3());
            const displacement = new THREE.Vector3().setComponent('XYZ'.indexOf(axis), 2);
            const down = start.clone().project(camera);
            const move = start.clone().add(displacement).project(camera);
            transform.pointerDown({ x: down.x, y: down.y, button: 0 });
            transform.pointerMove({ x: move.x, y: move.y, button: -1 });
            transform.pointerUp({ button: 0 });
            scene.updateMatrixWorld(true);
            assert.ok(preview.pivot.getWorldPosition(new THREE.Vector3()).distanceTo(start.add(displacement)) < 1e-7, axis);
            assert.ok(neighbor.pivot.position.equals(neighborPosition), 'other parts stay in place');
        }
        assert.deepEqual(Buffer.from(await engine.exportPartStl(part).arrayBuffer()), originalStl, 'preview movement cannot alter printable mesh data');
        preview.pivot.position.copy(preview.initialPosition);
        scene.updateMatrixWorld(true);
        assert.ok(preview.pivot.getWorldPosition(new THREE.Vector3()).distanceTo(center) < 1e-8, 'reset restores assembled position');
    } finally {
        transform.getHelper().dispose(); // Headless controls have no DOM listeners to disconnect.
        neighbor.meshes.forEach(mesh => mesh.material.dispose());
        fixture.dispose();
    }
});

test('Cute defaults validate for both arm types and keep all six limbs whole', () => {
    for (const slim of [false, true]) {
        const settings = engine.validateStickerAssemblySettings(engine.normalizeAssemblySettings({}, true), slim, true);
        assert.equal(settings.splitArms, false);
        assert.equal(settings.splitLegs, false);
        assert.equal(settings.holeDiameters.leftArm, 4.1);
        assert.equal(settings.holeDiameters.headBottom, 7.8);
        assert.equal(settings.torsoSideHoleTopDistanceMm, 5);
        const shoulder = engine.assemblySockets(1, settings, slim, true).find(socket => socket.id === 'torsoLeftArm');
        assert.ok(Math.abs(shoulder.radius * 2 * engine.MODEL_MM_PER_UNIT - 4.1) < 1e-9);
    }
});

for (const slim of [false, true]) test(`exploded Cute assembly maps every joint and non-printed tube without modifying ${slim ? 'slim' : 'classic'} STL geometry`, async () => {
    const skin = engine.processSkin(skinCanvas(false, slim), 0.5);
    const model = await engine.buildFigure(Float32Array.from(skin.data, channel => channel / 255), 64, {
        parts: Object.fromEntries(engine.PRINT_PARTS.map(id => [id, true])),
        decor: true, cuteMode: true, isAlex: slim, fillTransparentBase: false,
        assemblySettings: engine.normalizeAssemblySettings({}, true),
    });
    const before = await Promise.all(model.results.map(async part => Buffer.from(await engine.exportPartStl(part).arrayBuffer())));
    const assembly = engine.createAssemblyPreview(model.results, slim, 'cute7');
    const { items } = assembly;
    const head = items.find(item => item.key === 'head');
    const arm = items.find(item => item.key === 'leftArm');
    const tube = items.find(item => item.key === 'leftTube');
    let externalDisposed = false, printableDisposed = false;
    tube.meshes[0].geometry.addEventListener('dispose', () => { externalDisposed = true; });
    model.results[0].meshes[0].geometry.addEventListener('dispose', () => { printableDisposed = true; });
    try {
        assert.equal(items.length, 11, 'six body parts, one long joint, two short joints and two tubes');
        assert.equal(items.filter(item => item.pivot.visible).length, 8);
        assert.deepEqual(Array.from(assembly.connections, link => [link.from.item.key, link.item.key, link.to.item.key]), [
            ['torso', 'longConnector', 'head'], ['torso', 'shortConnector', 'leftLeg'], ['torso', 'rightHipJoint', 'rightLeg'],
            ['torso', 'leftTube', 'leftArm'], ['torso', 'rightTube', 'rightArm'],
        ]);
        const short = items.find(item => item.key === 'shortConnector');
        const rightShort = items.find(item => item.key === 'rightHipJoint');
        assert.equal(short.meshes[0].geometry, rightShort.meshes[0].geometry);
        assert.notEqual(short.meshes[0].material, rightShort.meshes[0].material);
        const manualHead = head.pivot.position.clone().add(new THREE.Vector3(1, 2, 3));
        head.pivot.position.copy(manualHead);
        assembly.setExploded(true);
        assert.equal(items.filter(item => item.pivot.visible).length, 11);
        assert.ok(assembly.guides.visible);
        assert.ok(head.pivot.position.z > head.assembled.z);
        const tubes = items.filter(item => item.tubeLengthMm);
        assert.equal(tubes.length, 2);
        for (const item of tubes) {
            assert.ok(item.explodedOnly, 'tubes are preview-only purchased components');
            assert.equal(item.tubeLengthMm, 12, 'each purchased PTFE tube is 12 mm long');
            item.meshes[0].geometry.computeBoundingBox();
            const size = item.meshes[0].geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(engine.MODEL_MM_PER_UNIT);
            assert.ok(Math.abs(size.y - item.tubeLengthMm) < 1e-5);
            assert.ok(Math.abs(size.x - engine.ARM_TUBE_OUTER_DIAMETER_MM) < 1e-5);
        }
        const manualArm = arm.pivot.position.clone().add(new THREE.Vector3(2, 0, 0));
        arm.pivot.position.copy(manualArm);
        assembly.updateGuides();
        const armConnection = assembly.connections.find(link => link.item === tube);
        const guide = assembly.guides.children[assembly.connections.indexOf(armConnection)];
        const guideEnd = new THREE.Vector3().fromBufferAttribute(guide.geometry.getAttribute('position'), 3);
        assert.ok(guideEnd.distanceTo(armConnection.to.anchor.clone().add(manualArm)) < 1e-5, 'guides follow XYZ drags');
        assembly.setExploded(false);
        assert.ok(head.pivot.position.equals(manualHead), 'normal-view manual positions survive toggling');
        assert.equal(tube.pivot.visible, false);
        assembly.setExploded(true);
        assert.ok(arm.pivot.position.equals(manualArm), 'exploded-view manual positions survive toggling');
        assembly.resetPositions();
        assert.ok(arm.pivot.position.equals(arm.exploded));
        assembly.setExploded(false);
        assembly.resetPositions();
        assert.ok(head.pivot.position.equals(head.assembled));
        for (const [index, part] of model.results.entries()) {
            assert.deepEqual(Buffer.from(await engine.exportPartStl(part).arrayBuffer()), before[index]);
        }
    } finally {
        assembly.dispose();
        assert.equal(externalDisposed, true);
        assert.equal(printableDisposed, false, 'disposing the preview cannot dispose export geometry');
        engine.disposeParts(model.results);
    }
});

test('legacy skins are expanded and mirrored before body-type selection', () => {
    const skin = engine.processSkin(skinCanvas(true), 0.5);
    assert.equal(skin.width, 64);
    assert.equal(skin.height, 64);
    assert.equal(skin.isSlim, false);
    assert.equal(skin.data[(52 * 64 + 40) * 4 + 3], 255);
    assert.equal(engine.processSkin(skinCanvas(false, true), 0.5).isSlim, true);
    assert.throws(() => engine.processSkin(engine.createCanvas(128, 128), 0.5), /128/);
});

test('real Cute solids export all parts with millimetre scale and valid STL triangles', async () => {
    const skin = engine.processSkin(skinCanvas(), 0.5);
    engine.resolveVoxelConsistency(skin);
    const pixels = Float32Array.from(skin.data, channel => channel / 255);
    const snapshot = pixels.slice();
    const model = await engine.buildFigure(pixels, 64, {
        parts: Object.fromEntries(engine.PRINT_PARTS.map(id => [id, true])),
        decor: true, cuteMode: true, isAlex: skin.isSlim, fillTransparentBase: false,
        assemblySettings: engine.normalizeAssemblySettings({}, true),
    });
    try {
        assert.deepEqual(Array.from(pixels), Array.from(snapshot), 'building must not change the shared sticker pixels');
        assert.deepEqual(Array.from(model.results, part => part.id), Array.from(engine.PRINT_PARTS));
        for (const part of model.results) {
            const geometry = part.exportGeometry;
            assert.ok(geometry.getAttribute('position').count > 0, part.id);
            const data = new DataView(await engine.exportPartStl(part).arrayBuffer());
            const triangles = data.getUint32(80, true);
            assert.equal(data.byteLength, 84 + triangles * 50);
            for (let i = 0; i < triangles; i++) for (let j = 0; j < 12; j++) {
                assert.ok(Number.isFinite(data.getFloat32(84 + i * 50 + j * 4, true)), part.id);
            }
            if (part.id.endsWith('Connector')) {
                assert.ok(Array.from(geometry.getAttribute('color').array).every(value => Math.abs(value - 1) < 1e-6), 'uncovered connectors must be white');
            }
            if (part.id === 'head') {
                geometry.computeBoundingBox();
                const size = geometry.boundingBox.getSize(new THREE.Vector3());
                assert.ok(Math.abs(size.x * engine.MODEL_MM_PER_UNIT - 8 * 27.1 / 9) < 1e-5, 'eight-pixel base head preserves physical sticker scale');
            }
        }
    } finally { engine.disposeParts(model.results); }
});

test('cutting SVG preserves A4 size and vector paths without an extra page-border cut', () => {
    const canvas = engine.createCanvas(4200, 5940);
    const svg = engine.generatePageCutterSVG({ cutterCanvas: canvas, cutterTraceOptions: { vectorPaths: [{ points: [[100, 100], [300, 100], [300, 300], [100, 300]], closed: true }] } }, { includeBackground: false });
    assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 4200 5940"/);
    assert.match(svg, /<path d="[^"]+" fill="none" stroke=/);
    assert.doesNotMatch(svg, /<rect|<image/);
});

test('sticker annotations stay in reserved whitespace and cannot enter the cutting SVG', () => {
    const area = { x: 1500, y: 4500, width: 2540, height: 1100 };
    const drawn = [];
    const ctx = {
        save() {}, restore() {}, beginPath() {}, rect(...bounds) { assert.deepEqual(bounds, Object.values(area)); }, clip() {},
        measureText: text => ({ width: Array.from(text).length * 30 }),
        fillText(text, x, y) { drawn.push({ text, x, y, font: this.font }); },
    };
    const cutterCanvas = engine.createCanvas(4200, 5940);
    const page = { cutterCanvas, cutterTraceOptions: { vectorPaths: [{ points: [[400, 400], [500, 400], [500, 600]], closed: true }] } };
    const before = engine.generatePageCutterSVG(page, { includeBackground: false });
    engine.drawStickerInfo({ width: 4200, height: 5940, getContext: () => ctx }, area, {
        name: '很长的皮肤名称'.repeat(200), publisher: 'A\nB', publisherId: 'maker456', sourceId: 'skin123', sourceUrl: 'https://entropydrop.com/skin/?id=skin123', publicLicense: 'CC BY-NC 4.0',
        labels: { publisher: 'Publisher', userId: 'User ID', source: 'Skin' },
    });
    assert.equal(drawn[0].text, 'EntropyDrop · CUTE-10cm');
    assert.ok(drawn[1].text.endsWith('…'));
    assert.ok(drawn.some(line => line.text === 'Publisher: A B'));
    assert.ok(drawn.some(line => line.text === 'User ID: maker456'));
    assert.equal(drawn.at(-1).text, 'https://entropydrop.com/skin/?id=skin123', 'source URL is the final printed annotation');
    assert.ok(drawn.every(line => !line.text.includes('CC BY')));
    assert.ok(drawn.every(line => line.font.includes('"Fusion-Pixel-Zh-Hans"')));
    assert.ok(drawn.some(line => line.text.includes('https://entropydrop.com/skin/?id=skin123')));
    for (const line of drawn.slice(2)) {
        assert.ok(line.x >= area.x && line.y >= area.y);
        assert.ok(line.x + ctx.measureText(line.text).width <= area.x + area.width);
        assert.ok(line.y + 38 <= area.y + area.height);
    }
    assert.equal(engine.generatePageCutterSVG(page, { includeBackground: false }), before);
});

test('tiered loading creates fast preview sticker first and generates full 4200x5940 assets on demand', async () => {
    const controller = new AbortController();
    const info = { name: 'Tiered Hero', publisher: 'Tester', publisherId: '1', sourceId: 'skin1', sourceUrl: 'http://localhost/skin1', labels: { publisher: 'Maker', userId: 'ID', source: 'Skin' } };
    const output = await engine.generateFigure(skinCanvas(), controller.signal, () => {}, info);
    try {
        assert.equal(output.isPreviewSticker, true);
        assert.ok(output.stickerUrl);
        assert.equal(output.cutterUrl, '');
        assert.equal(output.fullStickerUrl, undefined);
        assert.equal(output.fullCutterUrl, undefined);
        assert.equal(output.parts.length, 8);
        assert.equal(output.modelType, 'cute10');
        const previewUrl = output.previewStickerUrl;
        assert.equal(previewUrl, output.stickerUrl);

        // On demand full asset generation
        const full = await engine.generateFullFigureAssets(output, controller.signal, () => {});
        assert.ok(full.stickerUrl);
        assert.ok(full.cutterUrl);
        const svg = await (await fetch(full.cutterUrl)).text();
        assert.match(svg, /width="210mm"/);
        assert.match(svg, /height="297mm"/);
        assert.equal(output.isPreviewSticker, false);
        assert.equal(output.fullStickerUrl, full.stickerUrl);
        assert.equal(output.fullCutterUrl, full.cutterUrl);
        assert.equal(output.cutterUrl, full.cutterUrl);
        assert.equal(output.previewStickerUrl, previewUrl, 'full downloads retain the lightweight screen preview');

        // Subsequent call returns cached assets immediately
        const cached = await engine.generateFullFigureAssets(output, controller.signal, () => {});
        assert.equal(cached.stickerUrl, full.stickerUrl);
        assert.equal(cached.cutterUrl, full.cutterUrl);
    } finally {
        engine.disposeFigure(output);
    }
});

test('cancelled generation stops before allocating a model', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(engine.generateFigure(null, controller.signal, () => assert.fail('cancelled progress')), error => error.name === 'AbortError');
});

test('model-only order previews skip sticker rasters and export URLs', async () => {
    const output = await engine.generateFigure(skinCanvas(), new AbortController().signal, () => {}, undefined, { generateStickers: false, modelType: 'cute7' });
    try {
        assert.equal(output.parts.length, 8);
        assert.equal(output.modelType, 'cute7');
        assert.equal(output.stickerUrl, '');
        assert.equal(output.cutterUrl, '');
        assert.equal(output.fullStickerUrl, undefined);
    } finally { engine.disposeFigure(output); }
});

for (const [slim, modelScale] of [[false, 1], [true, 1.5]]) test(`outer-only ${slim ? 'slim' : 'classic'} stickers preserve the complete generator's surface pixels`, () => {
    const skin = engine.processSkin(skinCanvas(false, slim), 0.5);
    engine.resolveVoxelConsistency(skin);
    const options = { cuteMode: true, modelScale };
    const all = engine.generateParts(skin, 0.5, options);
    const outer = engine.generateParts(skin, 0.5, { ...options, outerOnly: true });
    try {
        assert.equal(Object.keys(outer).length, 72);
        assert.ok(Object.keys(all).length > Object.keys(outer).length);
        for (const [key, canvas] of Object.entries(outer)) {
            assert.match(key, /^\d\/\d\/(0|core)$/);
            assert.equal(canvas.width, all[key].width, key);
            assert.equal(canvas.height, all[key].height, key);
            assert.deepEqual(Buffer.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data),
                Buffer.from(all[key].getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data), key);
        }
    } finally { engine.disposeStickerParts(all); engine.disposeStickerParts(outer); }
});

test('packed RGBA copies preserve transparent colors and exact nearest-neighbor boundary sampling', () => {
    const source = engine.createCanvas(3, 2);
    const pixels = Uint8ClampedArray.from({ length: 24 }, (_, index) => index * 11 % 256);
    source.getContext('2d').putImageData({ data: pixels }, 0, 0);
    for (const [width, height] of [[4, 5], [6, 4], [3, 2]]) {
        const resized = engine.resizeCanvasNearest(source, width, height);
        const actual = resized.getContext('2d').getImageData(0, 0, width, height).data;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const sx = Math.floor(((2 * x + 1) * 3 - 1) / (2 * width));
            const sy = Math.floor(((2 * y + 1) * 2 - 1) / (2 * height));
            assert.deepEqual(Array.from(actual.slice((y * width + x) * 4, (y * width + x + 1) * 4)),
                Array.from(pixels.slice((sy * 3 + sx) * 4, (sy * 3 + sx + 1) * 4)));
        }
    }
});

for (const slim of [false, true]) test(`lightweight ${slim ? 'slim' : 'classic'} sticker rasters keep physical socket positions and proportions`, () => {
    const skin = engine.processSkin(skinCanvas(false, slim), 0.5);
    engine.resolveVoxelConsistency(skin);
    const settings = engine.normalizeAssemblySettings({}, true, 1.5);
    const parts = engine.generateParts(skin, 0.5, { cuteMode: true, modelScale: 1.5, outerOnly: true, rasterScale: 0.2 });
    try {
        assert.equal(Object.keys(parts).length, 72);
        for (const [key, canvas] of Object.entries(parts)) {
            const [part, face] = key.split('/').map(Number);
            const size = engine.assemblyFaceSize(part, face, slim, true, 1.5);
            assert.equal(canvas.width, Math.floor(size.width * 0.2), key);
            assert.equal(canvas.height, Math.floor(size.height * 0.2), key);
            assert.equal(engine.getAssemblyCutterSource(canvas), undefined, 'preview must not retain full cutting sources');
            assert.equal(engine.getUntaperedCuteTorsoCanvas(canvas), undefined, 'preview must not retain taper cutting sources');
        }
        for (const hole of engine.ASSEMBLY_HOLES) {
            const [part, face] = hole.face.split('/').map(Number);
            const size = engine.assemblyFaceSize(part, face, slim, true, 1.5);
            const circle = engine.stickerHoleCircle(hole, size.width, size.height, settings);
            const core = parts[`${hole.face}/core`];
            const decor = parts[`${hole.face}/0`];
            const cx = circle.cx * core.width / size.width;
            const cy = circle.cy * core.height / size.height;
            const radius = circle.radius * 0.2;
            const masks = [core, decor].map(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
            const alpha = (x, y) => Math.max(...masks.map(mask => mask[(Math.floor(y) * core.width + Math.floor(x)) * 4 + 3]));
            assert.equal(alpha(cx, cy), 0, hole.id);
            assert.equal(alpha(cx + radius * 0.7, cy), 0, `${hole.id} radius`);
            assert.equal(alpha(cx + radius + 2, cy), 255, `${hole.id} outer edge`);
        }
    } finally { engine.disposeStickerParts(parts); }
});

for (const [slim, modelScale] of [[false, 1], [false, 1.5], [true, 1], [true, 1.5]]) test(`lightweight sheet keeps all 36 faces on A4 (${slim ? 'slim' : 'classic'}, scale ${modelScale})`, async () => {
    const skin = engine.processSkin(skinCanvas(false, slim), 0.5);
    const pages = await engine.composeMergedPages(skin, { cuteMode: true, modelScale, preview: true });
    try {
        const page = pages[0];
        assert.equal(pages.length, 1);
        assert.equal(page.pageCanvas.width, 840);
        assert.equal(page.pageCanvas.height, 1188);
        assert.equal(page.faceCount, 36);
        assert.equal(page.isPreview, true);
        assert.equal(page.cutterCanvas, null);
        assert.deepEqual(Array.from(page.cutterLayers), []);
        assert.deepEqual(Array.from(page.cutterTraceOptions.vectorPaths), []);
        assert.ok(page.infoArea.height > 0);
        assert.ok(page.infoArea.y + page.infoArea.height <= page.pageCanvas.height);
    } finally { for (const page of pages) page.pageCanvas.width = page.pageCanvas.height = 1; }
});

test('sticker preparation can be cancelled between parts before allocating an A4 page', async () => {
    const controller = new AbortController();
    const updates = [];
    const skin = engine.processSkin(skinCanvas(), 0.5);
    await assert.rejects(engine.composeMergedPages(skin, { cuteMode: true, modelScale: 1.5, preview: true, signal: controller.signal }, percent => {
        updates.push(percent);
        if (percent > 5) controller.abort();
    }), error => error.name === 'AbortError');
    assert.ok(updates.at(-1) < 20, 'cancelled before page composition');
});

test('historical Cute A4 sheets retain their raster seams and analytic hole cuts', async () => {
    const skin = engine.processSkin(skinCanvas(), 0.5);
    const pages = await engine.composeMergedPages(skin, { cuteMode: true, modelScale: 1, preview: false });
    try {
        const page = pages[0];
        assert.equal(page.pageCanvas.width, 4200);
        assert.equal(page.pageCanvas.height, 5940);
        assert.equal(page.faceCount, 36);
        assert.ok(page.cutterTraceOptions.vectorPaths.length > 0, 'legacy group layout must include its analytic hole and taper paths');
        assert.ok(page.cutterLayers.some(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
            .some((value, index) => index % 4 === 3 && value > 128)), 'non-vector faces retain their independent cutter masks');
    } finally {
        for (const page of pages) for (const canvas of [page.pageCanvas, page.cutterCanvas, ...page.cutterLayers]) if (canvas) canvas.width = canvas.height = 1;
    }
});

test('cancelling during a build suppresses stale progress and prevents publishing old exports', async () => {
    const controller = new AbortController();
    const updates = [];
    await assert.rejects(engine.generateFigure(skinCanvas(), controller.signal, progress => {
        assert.equal(controller.signal.aborted, false, 'late progress must be ignored');
        updates.push(progress);
        if (progress >= 16) controller.abort();
    }), error => error.name === 'AbortError');
    assert.ok(updates.length > 1, 'the cancellation happened after generation started');
    assert.ok(updates.at(-1) < 65, 'no sticker or export stage was published');
});

const headFaceOffsets = [[8, 8], [16, 8], [0, 8], [8, 0], [16, 0], [24, 8]];
const headGuideUvs = { front: [40, 8, 8, 8], back: [56, 8, 8, 8], left: [48, 8, 8, 8], right: [32, 8, 8, 8], top: [40, 0, 8, 8], bottom: [48, 0, 8, 8] };
function setSkinPixel(pixels, x, y, color) { pixels.set(color, (y * 64 + x) * 4); }
function assertRgb(actual, expected, label) {
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(actual[channel] - expected[channel]) < 1e-6, `${label}: ${actual} != ${expected}`);
}

test('all six sticker directions leave unsupported voxel faces white, including multicolor corners', () => {
    const groupIds = [0, 2, 3, 4, 5, 1];
    for (const [faceIndex, [u, v]] of headFaceOffsets.entries()) {
        const pixels = new Float32Array(64 * 64 * 4);
        setSkinPixel(pixels, u + 32 + 3, v + 3, [1, 0, 0, 1]);
        const registry = new engine.TokenRegistry();
        const cubes = engine.createDecorCubes([0, 0, 0], [8, 8, 8], headFaceOffsets, [9 / 8, 9 / 8, 9 / 8], [32, 0], pixels, 64, registry);
        try {
            assert.equal(cubes.length, 1);
            cubes[0].groups.forEach((group, index) => assertRgb(registry.tokens[group.materialIndex].color,
                index === groupIds[faceIndex] ? [1, 0, 0] : [1, 1, 1], `face ${faceIndex}, cube side ${index}`));
        } finally { cubes.forEach(cube => cube.dispose()); }
    }
    const pixels = new Float32Array(64 * 64 * 4);
    // Front, left and top texels describe the same outer corner voxel.
    setSkinPixel(pixels, 47, 8, [1, 0, 0, 1]);
    setSkinPixel(pixels, 48, 8, [0, 1, 0, 1]);
    setSkinPixel(pixels, 47, 7, [0, 0, 1, 1]);
    const registry = new engine.TokenRegistry();
    const cubes = engine.createDecorCubes([0, 0, 0], [8, 8, 8], headFaceOffsets, [9 / 8, 9 / 8, 9 / 8], [32, 0], pixels, 64, registry);
    try {
        assert.equal(cubes.length, 1, 'one solid corner, not overlapping cubes');
        const expected = [[1, 0, 0], [1, 1, 1], [0, 1, 0], [1, 1, 1], [0, 0, 1], [1, 1, 1]];
        cubes[0].groups.forEach((group, index) => assertRgb(registry.tokens[group.materialIndex].color, expected[index], `corner side ${index}`));
    } finally { cubes.forEach(cube => cube.dispose()); }
});

test('final CSG preview preserves skin caps and base while exposing white step walls and socket walls', async () => {
    const skin = engine.processSkin(skinCanvas(), 0.5);
    const pixels = Float32Array.from(skin.data, (channel, index) => index % 4 === 3 ? channel / 255 : (index % 4 === 2 ? 1 : 0));
    setSkinPixel(pixels, 43, 11, [1, 0, 0, 1]);
    const registry = new engine.TokenRegistry();
    const head = engine.buildHead(pixels, 64, registry, { parts: { head: true }, cuteMode: true, assemblySettings: engine.normalizeAssemblySettings({}, true) });
    let geometry;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
        geometry = await engine.buildPartGeometry(head.block, head.decorGeoms, registry.tokens, head.cutters);
        const mesh = new THREE.Mesh(geometry, material);
        const samples = [
            { label: 'outer sticker cap', origin: [10, -0.5, 14.5], direction: [-1, 0, 0], color: [1, 0, 0] },
            { label: 'exposed voxel side', origin: [4.25, 2, 14.5], direction: [0, -1, 0], color: [1, 1, 1] },
            { label: 'exposed voxel top', origin: [4.25, -0.5, 20], direction: [0, 0, -1], color: [1, 1, 1] },
            { label: 'exposed voxel bottom', origin: [4.25, -0.5, 8], direction: [0, 0, 1], color: [1, 1, 1] },
            { label: 'base sticker', origin: [10, 1.5, 14.5], direction: [-1, 0, 0], color: [0, 0, 1] },
            { label: 'neck socket wall', origin: [0, 0, 11], direction: [1, 0, 0], color: [1, 1, 1] },
        ];
        for (const sample of samples) {
            const ray = new THREE.Raycaster(new THREE.Vector3(...sample.origin), new THREE.Vector3(...sample.direction));
            const hit = ray.intersectObject(mesh)[0];
            assert.ok(hit, sample.label);
            const colors = geometry.getAttribute('color');
            for (const index of [hit.face.a, hit.face.b, hit.face.c]) assertRgb([colors.getX(index), colors.getY(index), colors.getZ(index)], sample.color, sample.label);
        }
    } finally {
        material.dispose(); geometry?.dispose(); head.block.dispose();
        head.decorGeoms.forEach(geometry => geometry.dispose());
        head.cutters.forEach(cutter => cutter.geometry.dispose());
    }
});

test('sticker assembly guides use white step walls and white unprinted core faces', () => {
    const skin = { getPixel: (x, y) => x === 43 && y === 11 ? [255, 0, 0, 255] : [0, 0, 0, 0] };
    const geometry = engine.createSkinVoxelGeometry(skin, headGuideUvs, [9, 9, 9], { cuteMode: true, partIndex: 0, isDecor: true });
    try {
        const normal = geometry.getAttribute('normal');
        const colors = geometry.getAttribute('color');
        assert.equal(normal.count, 36);
        for (let i = 0; i < normal.count; i++) assertRgb([colors.getX(i), colors.getY(i), colors.getZ(i)], normal.getZ(i) > 0.99 ? [1, 0, 0] : [1, 1, 1], 'guide voxel');
    } finally { geometry.dispose(); }
    const core = engine.createSkinVoxelGeometry({ getPixel: () => [0, 0, 0, 0] }, headGuideUvs, [8, 8, 8], { cuteMode: true, partIndex: 0, isDecor: false });
    try {
        assert.equal(core.getAttribute('position').count, 6 * 8 * 8 * 6, 'transparent core stays closed');
        assert.ok(Array.from(core.getAttribute('color').array).every(value => value === 1));
    } finally { core.dispose(); }
});


test('sticker headings use the stored brand and model instead of current catalog labels', () => {
    const texts = [];
    const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, measureText: text => ({ width: text.length * 10 }), fillText: text => texts.push(text) };
    engine.drawStickerInfo({ width: 4200, getContext: () => ctx }, { x: 1500, y: 4500, width: 2540, height: 1100 }, {
        brand: 'Original brand', modelName: 'Saved model name', name: 'Saved skin', publisher: 'Maker', publisherId: 'maker', sourceId: 'skin', sourceUrl: 'https://example.test/skin',
        labels: { publisher: 'Published by', userId: 'User ID', source: 'Skin' },
    });
    assert.equal(texts[0], 'Original brand · Saved model name');
});


test('10 cm ruler shares the STL scale and doubles its screen height when zooming twice as close', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-4, 0, -2), new THREE.Vector3(4, 24, 2));
    const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 1000);
    camera.position.set(0, 12, 60); camera.lookAt(0, 12, 0);
    const far = engine.projectHeightRuler(bounds, 0, camera, 900, 600);
    const pixels = far.labels[0].y - far.labels.at(-1).y;
    const expected = (100 / engine.MODEL_MM_PER_UNIT) * 600 / (2 * 60 * Math.tan(35 * Math.PI / 360));
    assert.ok(Math.abs(pixels - expected) < 1e-8);
    assert.equal(far.labels.length, 11);
    camera.position.z = 30;
    const close = engine.projectHeightRuler(bounds, 0, camera, 900, 600);
    assert.ok(Math.abs(close.labels[0].y - close.labels.at(-1).y - pixels * 2) < 1e-8);
    const expanded = bounds.clone(); expanded.max.y = 80;
    const exploded = engine.projectHeightRuler(expanded, 0, camera, 900, 600);
    assert.ok(Math.abs(exploded.labels[0].y - exploded.labels.at(-1).y - pixels * 2) < 1e-8, 'exploding the parts must not stretch the 10 cm reference');
});

test('ruler remains on the camera-facing right across orbit angles and hides behind-camera data', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-4, 0, -2), new THREE.Vector3(4, 24, 2));
    const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 1000);
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        camera.position.set(Math.sin(angle) * 60, 12, Math.cos(angle) * 60); camera.lookAt(0, 12, 0);
        const result = engine.projectHeightRuler(bounds, 0, camera, 900, 600);
        assert.ok(result.labels.every(label => label.x > 450 && Number.isFinite(label.y)));
    }
    camera.lookAt(camera.position.clone().multiplyScalar(2));
    assert.equal(engine.projectHeightRuler(bounds, 0, camera, 900, 600), null);
    assert.equal(engine.projectHeightRuler(bounds, 0, camera, 0, 0), null);
});

for (const slim of [false, true]) test(`cute10 uses fixed 7.8 mm shoulder sockets and four short joints for ${slim ? 'slim' : 'classic'} arms`, async () => {
    const settings = engine.validateStickerAssemblySettings(engine.normalizeAssemblySettings({}, true, 1.5), slim, true, 1.5);
    assert.equal(settings.holeDepths.torsoLeftArm, 7);
    assert.equal(settings.holeDepths.leftArm, 10);
    for (const index of [1, 2, 3]) {
        const sockets = engine.assemblySockets(index, settings, slim, true, 1.5);
        for (const socket of sockets) assert.ok(Math.abs(socket.radius * 2 * engine.MODEL_MM_PER_UNIT - 7.8) < 1e-8);
    }
    const skin = engine.processSkin(skinCanvas(false, slim), 0.5);
    const model = await engine.buildFigure(Float32Array.from(skin.data, channel => channel / 255), 64, {
        parts: Object.fromEntries(engine.PRINT_PARTS.map(id => [id, true])),
        decor: true, cuteMode: true, modelScale: 1.5, isAlex: slim, fillTransparentBase: false, assemblySettings: settings,
    });
    const assembly = engine.createAssemblyPreview(model.results, slim);
    try {
        assert.equal(assembly.items.length, 11);
        assert.equal(assembly.items.some(item => item.tubeLengthMm || /Tube/.test(item.key)), false);
        assert.equal(assembly.connections.length, 5);
        const short = assembly.items.find(item => item.key === 'shortConnector');
        for (const key of ['rightHipJoint', 'leftShoulderJoint', 'rightShoulderJoint']) {
            const joint = assembly.items.find(item => item.key === key);
            assert.equal(joint.meshes[0].geometry, short.meshes[0].geometry);
            assert.notEqual(joint.meshes[0].material, short.meshes[0].material);
        }
        assert.deepEqual(Array.from(assembly.connections.slice(3), link => [link.from.item.key, link.item.key, link.to.item.key]), [
            ['torso', 'leftShoulderJoint', 'leftArm'], ['torso', 'rightShoulderJoint', 'rightArm'],
        ]);
        assembly.setExploded(true);
        assert.ok(assembly.items.every(item => item.pivot.visible));
        const head = model.results.find(part => part.id === 'head');
        head.exportGeometry.computeBoundingBox();
        const size = head.exportGeometry.boundingBox.getSize(new THREE.Vector3());
        assert.ok(Math.abs(size.z * engine.MODEL_MM_PER_UNIT - 8 * 1.5 * engine.MODEL_MM_PER_UNIT) < 1e-4, 'head geometry is enlarged before sockets are cut');
    } finally {
        assembly.dispose();
        engine.disposeParts(model.results);
    }
});

test('saved order models preserve cute7 and select cute10 only for its saved model name', () => {
    assert.equal(engine.FIGURE_MODELS.length, 1);
    assert.equal(engine.FIGURE_MODELS[0].id, 'cute10');
    assert.equal(engine.getOrderPrintModel('CUTE-10cm DIY kit'), 'cute10');
    assert.equal(engine.getOrderPrintModel('CUTE-7cm'), 'cute7');
    assert.equal(engine.getOrderPrintModel(), 'cute7');
    assert.equal(engine.getPrintModelProfile().modelScale, 1.5);
});
