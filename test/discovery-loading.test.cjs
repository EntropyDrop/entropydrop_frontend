const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const jsxRuntime = require('react/jsx-runtime');
const projectRoot = path.resolve(__dirname, '..');

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function compile(entry, replacements) {
    return build({
        entryPoints: [path.join(projectRoot, entry)], bundle: true, write: false,
        platform: 'node', format: 'cjs', jsx: 'automatic',
        supported: { 'dynamic-import': false },
        external: ['react', 'react/jsx-runtime', 'three'],
        define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
        plugins: [{ name: 'discovery-test-boundaries', setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
                const replacement = replacements[args.path];
                return replacement ? { path: replacement, external: true } : undefined;
            });
        } }],
    }).then(result => result.outputFiles[0].text);
}

const backgroundCode = compile('src/components/DiscoveryBackground.tsx', {
    './DiscoveryScene': 'discovery-scene-test',
});
const discoveryCode = compile('src/components/Discovery.tsx', {
    '@react-three/fiber': 'discovery-fiber-test', './utils': 'discovery-images-test',
});

function environment(code, fetch, requireModule) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/skin/' });
    const { window } = dom;
    const module = { exports: {} };
    const errors = [];
    vm.runInContext(code, vm.createContext({
        window, document: window.document, localStorage: window.localStorage,
        URL, URLSearchParams, fetch, Headers, Response, AbortController, DOMException,
        console: { ...console, error: (...args) => errors.push(args), warn() {} },
        require: requireModule, module, exports: module.exports,
        performance, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    }));
    const previous = { window: global.window, document: global.document,
        act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = createRoot(node);
    return { ...module.exports, window, node, root, errors, async close() {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    } };
}

async function mountBackground({ sceneReady = false, strict = false } = {}) {
    const renderer = deferred();
    const data = deferred();
    const requests = [];
    let receivedProps;
    let rendererStarted = false;
    if (sceneReady) renderer.resolve();
    const env = environment(await backgroundCode, (url, options) => {
        requests.push({ url, options });
        return data.promise.then(response => response.clone());
    }, name => {
        if (name === 'react') return { ...React, lazy(loader) {
            return React.lazy(() => {
                rendererStarted = true;
                return renderer.promise.then(loader);
            });
        } };
        if (name === 'discovery-scene-test') return { DiscoveryScene(props) {
            receivedProps = props;
            return React.createElement('div', null,
                props.items === null ? 'data pending' : props.items.map(item => item.id).join(','));
        } };
        return require(name);
    });
    const props = { selected: null, onSelect() {}, onLoading() {}, paused: false,
        fallback: React.createElement('div', null, 'renderer pending') };
    const element = React.createElement(env.DiscoveryBackground, props);
    await React.act(() => env.root.render(strict ? React.createElement(React.StrictMode, null, element) : element));
    return { ...env, requests, data, renderer, props,
        get receivedProps() { return receivedProps; },
        get rendererStarted() { return rendererStarted; } };
}

test('discovery data starts and can finish while the renderer download is still pending', async () => {
    const env = await mountBackground();
    try {
        assert.equal(env.rendererStarted, true);
        assert.equal(env.requests.length, 1);
        assert.equal(env.requests[0].url, 'https://api.example.test/api/discovery');
        assert.equal(env.receivedProps, undefined);
        assert.equal(env.node.textContent, 'renderer pending');
        await React.act(() => env.data.resolve(new Response(JSON.stringify([
            { id: ' first ', result: ' /first.png ' }, null, { id: 'missing-image' },
        ]))));
        assert.equal(env.receivedProps, undefined);
        await React.act(() => env.renderer.resolve());
        assert.equal(env.node.textContent, 'first');
        assert.equal(env.receivedProps.items[0].result, '/first.png');
        assert.equal(env.receivedProps.items[0].is_public, true);
        assert.equal(env.requests.length, 1);
        await React.act(() => env.root.render(React.createElement(env.DiscoveryBackground,
            { ...env.props, selected: { id: 'first' }, paused: true })));
        assert.equal(env.receivedProps.paused, true);
        assert.equal(env.requests.length, 1, 'opening a modal must not refetch the gallery');
    } finally { await env.close(); }
});

test('a ready renderer waits for data and HTTP failure settles to an empty gallery', async () => {
    const env = await mountBackground({ sceneReady: true });
    try {
        assert.equal(env.node.textContent, 'data pending');
        await React.act(() => env.data.resolve(new Response('{}', { status: 503 })));
        assert.equal(env.receivedProps.items.length, 0);
        assert.equal(env.errors.length, 1);
    } finally { await env.close(); }
});

test('leaving discovery aborts its pending request without showing a global error', async () => {
    const env = await mountBackground({ sceneReady: true });
    try {
        await React.act(() => env.root.render(null));
        assert.equal(env.requests[0].options.signal.aborted, true);
        assert.equal(env.requests[0].options.skipGlobalError, true);
        await React.act(() => env.data.resolve(new Response('[]')));
        assert.equal(env.node.textContent, '');
        assert.equal(env.errors.length, 0);
    } finally { await env.close(); }
});

test('StrictMode cancels the discarded request and delivers only the active result', async () => {
    const env = await mountBackground({ sceneReady: true, strict: true });
    try {
        assert.equal(env.requests.length, 2);
        assert.equal(env.requests[0].options.signal.aborted, true);
        assert.equal(env.requests[1].options.signal.aborted, false);
        await React.act(() => env.data.resolve(new Response('[]')));
        assert.equal(env.receivedProps.items.length, 0);
        assert.equal(env.errors.length, 0);
    } finally { await env.close(); }
});

test('six cached images completing together all reach the scene and release their textures', async () => {
    const THREE = require('three');
    const disposed = [];
    let surface;
    function hostJsx(type, props, key) {
        if (typeof type !== 'string') return jsxRuntime.jsx(type, props, key);
        return jsxRuntime.jsxs('div', type === 'meshStandardMaterial'
            ? { 'data-texture': props.map.id }
            : { children: props.children, ref: props.ref }, key);
    }
    const env = environment(await discoveryCode, () => { throw new Error('Scene must not fetch gallery data'); }, name => {
        if (name === 'three') return { ...THREE, CanvasTexture: class extends THREE.CanvasTexture {
            dispose() { disposed.push(this.id); super.dispose(); }
        } };
        if (name === 'react/jsx-runtime') return { ...jsxRuntime, jsx: hostJsx, jsxs: hostJsx };
        if (name === 'discovery-fiber-test') return {
            useFrame() {}, useThree: select => select({ gl: { domElement: surface }, camera: {}, size: { width: 1280 } }),
        };
        if (name === 'discovery-images-test') return { Skin2D: async () => env.window.document.createElement('canvas') };
        return require(name);
    });
    surface = env.window.document.createElement('canvas');
    try {
        const items = Array.from({ length: 6 }, (_, i) => ({ id: String(i), result: `/${i}.png`, prompt: '', is_public: true }));
        await React.act(() => env.root.render(React.createElement(env.Discovery, { items })));
        assert.equal(env.node.querySelectorAll('[data-texture]').length, 6);
        await React.act(() => env.root.render(null));
        assert.equal(new Set(disposed).size, 6);
    } finally { await env.close(); }
});
