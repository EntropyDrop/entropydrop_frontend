const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const THREE = require('three');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../src/pages/figure/print/FigurePreview.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'three', 'three/*'],
}).outputFiles[0].text;

test('voxel switch starts on, removes resets and changes colors without resetting the scene', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 900, height: 650, left: 0, top: 0 });
    const renderers = [];
    class Renderer {
        constructor() { this.domElement = document.createElement('canvas'); this.shadowMap = {}; renderers.push(this); }
        setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
        render(scene, camera) { this.scene = scene; this.camera = camera; }
    }
    class Orbit extends THREE.EventDispatcher {
        constructor() { super(); this.target = new THREE.Vector3(); }
        update() {} dispose() {}
    }
    class Transform extends THREE.EventDispatcher {
        constructor() { super(); this.helper = new THREE.Group(); }
        setMode() {} setSpace() {} setSize() {} dispose() {} detach() {}
        getHelper() { return this.helper; }
    }
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, console, window: dom.window, document,
        ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } disconnect() {} },
        require(name) {
            if (name === 'three') return { ...THREE, WebGLRenderer: Renderer };
            if (name.endsWith('/OrbitControls.js')) return { OrbitControls: Orbit };
            if (name.endsWith('/TransformControls.js')) return { TransformControls: Transform };
            return require(name);
        },
    });
    const geometry = new THREE.BoxGeometry(8, 8, 8).toNonIndexed();
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    const voxelColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) voxelColors[i * 3] = 1;
    geometry.setAttribute('voxelColor', new THREE.BufferAttribute(voxelColors, 3));
    let sourceDisposed = false, previewDisposed = false;
    geometry.addEventListener('dispose', () => { sourceDisposed = true; });
    const parts = [{ id: 'head', meshes: [{ geometry }], position: [0, 0, 0], cutters: [] }];
    const root = createRoot(document.getElementById('root'));
    try {
        await React.act(async () => root.render(React.createElement(module.exports.FigurePreview, {
            parts, isSlim: false, modelType: 'cute10', voxelModeLabel: 'Voxel mode', voxelModeHint: 'Show colored edges',
            partLabels: { head: 'Head' }, assemblyLabels: { toggle: 'Exploded view', legend: 'Connections', neck: 'Neck', hips: 'Hips', shoulders: 'Shoulders', parts: {} },
            onError: () => assert.fail('preview failed'),
        })));
        const toggle = document.querySelector('[role=switch]');
        assert.equal(toggle.getAttribute('aria-checked'), 'true');
        assert.deepEqual(Array.from(document.querySelectorAll('button'), b => b.textContent), ['Exploded view', 'Voxel mode']);
        const renderer = renderers[0];
        const world = renderer.scene.children[0];
        const pivot = world.children[0];
        const mesh = pivot.children[0].children[0];
        mesh.geometry.addEventListener('dispose', () => { previewDisposed = true; });
        assert.equal(mesh.geometry.getAttribute('color').getY(0), 0);
        assert.equal(geometry.getAttribute('color').getY(0), 1);
        await React.act(async () => document.querySelector('button').click());
        const explode = document.querySelector('button');
        assert.equal(explode.getAttribute('aria-pressed'), 'true');
        pivot.position.add(new THREE.Vector3(1, 2, 3));
        const position = pivot.position.clone();
        renderer.camera.position.add(new THREE.Vector3(3, 4, 5));
        const camera = renderer.camera.position.clone();
        for (const enabled of [false, true, false]) {
            await React.act(async () => toggle.click());
            assert.equal(toggle.getAttribute('aria-checked'), String(enabled));
            assert.equal(mesh.geometry.getAttribute('color').getY(0), enabled ? 0 : 1);
            assert.ok(pivot.position.equals(position));
            assert.ok(renderer.camera.position.equals(camera));
            assert.equal(explode.getAttribute('aria-pressed'), 'true');
            assert.equal(renderers.length, 1);
        }
    } finally {
        await React.act(async () => root.unmount());
        assert.equal(previewDisposed, true);
        assert.equal(sourceDisposed, false);
        geometry.dispose();
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});
