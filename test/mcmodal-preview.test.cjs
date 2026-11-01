const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../src/components/MCModalPreview.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', '@react-three/fiber', '@react-three/drei', '@iconify/react', './MC', '../utils/httpClient', './FigureDiscountBadge'],
}).outputFiles[0].text;

test('modal scene skips unrelated updates, renders idle on demand, and suspends in hidden tabs', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const renders = [];
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, console, document, window,
        require(name) {
            if (name === '@react-three/fiber') return { Canvas: props => { renders.push(props); return null; } };
            if (name === '@react-three/drei') return { Stage: () => null, OrbitControls: () => null };
            if (name === './MC') return { MinecraftCharacter: () => null };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === './FigureDiscountBadge') return { FigurePrintOfferBadge: () => null };
            if (name === '../utils/httpClient') return {};
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const props = {
        textureUrl: '/skin.png', mode: 'plane', action: 'idle', modelType: 'steve',
        visibleParts: { head: true, body: true, leftArm: true, rightArm: true, leftLeg: true, rightLeg: true },
        setMode() {}, setAction() {}, convertModel() {}, togglePart() {}, current: { mcmodal: {} },
    };
    const render = async patch => {
        Object.assign(props, patch);
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...props })));
    };
    try {
        await render({});
        assert.equal(renders.at(-1).frameloop, 'demand');
        assert.deepEqual(Array.from(renders.at(-1).dpr), [1, 1.5]);
        const count = renders.length;
        await render({ current: { mcmodal: {} }, onEdit() {}, modelType: 'alex', downloadFilename: 'renamed.png' });
        assert.equal(renders.length, count, 'Metadata and model detection must not rebuild the scene');
        await render({ action: 'walk' });
        assert.equal(renders.at(-1).frameloop, 'always');
        await render({ action: 'idle', mode: 'cute' });
        assert.equal(renders.at(-1).frameloop, 'always', 'Cute idle breathing stays animated');
        await React.act(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new window.Event('visibilitychange'));
        });
        assert.equal(renders.at(-1).frameloop, 'never');
        await React.act(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new window.Event('visibilitychange'));
        });
        assert.equal(renders.at(-1).frameloop, 'always');
        await render({ mode: 'voxel', action: 'idle' });
        assert.equal(renders.at(-1).frameloop, 'demand');
        await render({ action: 'dance' });
        assert.equal(renders.at(-1).frameloop, 'always');
    } finally {
        await React.act(async () => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});
