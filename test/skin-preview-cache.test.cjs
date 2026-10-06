const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build, buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function compiledModule(file, context = {}) {
    const code = buildSync({ entryPoints: [path.resolve(__dirname, '..', file)], bundle: true,
        write: false, platform: 'node', format: 'cjs', external: ['three'] }).outputFiles[0].text;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require, ...context });
    return module.exports;
}

const { AsyncResourceCache } = compiledModule('src/utils/asyncResourceCache.ts');

test('cache deduplicates pending work even while completed entries are evicted', async () => {
    const cache = new AsyncResourceCache({ maxEntries: 1, maxBytes: 10, ttlMs: 1000, sizeOf: () => 1 });
    const work = deferred();
    let loads = 0;
    const first = cache.getOrLoad('pending', () => { loads++; return work.promise; });
    await cache.getOrLoad('other', async () => 2);
    assert.strictEqual(cache.getOrLoad('pending', () => { throw Error('duplicate'); }), first);
    work.resolve(3);
    assert.equal(await first, 3);
    assert.equal(await cache.getOrLoad('pending', async () => 4), 3);
    assert.equal(loads, 1);
});

test('cache enforces bytes, entry count, LRU ordering and expiry', async () => {
    let now = 0;
    const cache = new AsyncResourceCache({ maxEntries: 2, maxBytes: 10, ttlMs: 10,
        sizeOf: value => value, now: () => now });
    await cache.getOrLoad('a', async () => 4);
    await cache.getOrLoad('b', async () => 4);
    assert.equal(await cache.getOrLoad('a', async () => 99), 4); // touch a
    await cache.getOrLoad('c', async () => 4); // evict b
    assert.equal(await cache.getOrLoad('a', async () => 99), 4);
    assert.equal(await cache.getOrLoad('b', async () => 2), 2);
    now = 11;
    assert.equal(await cache.getOrLoad('a', async () => 3), 3);
    assert.equal(await cache.getOrLoad('huge', async () => 20), 20);
    assert.equal(await cache.getOrLoad('huge', async () => 21), 21, 'oversized values must not stay cached');
    const bytes = new AsyncResourceCache({ maxEntries: 99, maxBytes: 5, ttlMs: 100, sizeOf: value => value });
    await bytes.getOrLoad('a', async () => 3);
    await bytes.getOrLoad('b', async () => 3);
    assert.equal(await bytes.getOrLoad('a', async () => 1), 1, 'byte budget evicts independently of entry count');
});

test('failures are retryable and clearing pending work cannot repopulate the cache', async () => {
    const cache = new AsyncResourceCache({ maxEntries: 2, maxBytes: 10, ttlMs: 1000, sizeOf: () => 1 });
    await assert.rejects(cache.getOrLoad('failed', async () => { throw Error('failure'); }), /failure/);
    assert.equal(await cache.getOrLoad('failed', async () => 7), 7);
    const old = deferred();
    const pending = cache.getOrLoad('a', () => old.promise);
    await Promise.resolve();
    cache.clear();
    assert.equal(await cache.getOrLoad('a', async () => 9), 9);
    old.resolve(1);
    assert.equal(await pending, 1);
    assert.equal(await cache.getOrLoad('a', async () => 10), 9);
});

const skinCode = build({
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.test') }, entryPoints: [path.resolve(__dirname, '../src/utils/skinPreview.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs', supported: { 'dynamic-import': false },
    plugins: [{ name: 'skin-renderer-boundary', setup(build) {
        build.onResolve({ filter: /^\.\/skin2dRenderer$/ }, () => ({ path: 'skin-renderer-test', external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function skinEnvironment(fetchOverride) {
    const dom = new JSDOM('', { url: 'https://app.test/' });
    const counts = { fetch: 0, decode: 0, close: 0, iso: 0, avatar: 0 };
    const requests = [];
    dom.window.createImageBitmap = () => {};
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, imageSmoothingEnabled: true });
    const module = { exports: {} };
    vm.runInNewContext(await skinCode, {
        module, exports: module.exports, window: dom.window, document: dom.window.document,
        localStorage: dom.window.localStorage, atob, DOMException, AbortController, console,
        URL, URLSearchParams, Request, Response, Headers, Blob, FormData,
        createImageBitmap: async () => { counts.decode++; return { width: 64, height: 64,
            close() { counts.close++; } }; },
        fetch: async (url, options) => {
            counts.fetch++; requests.push({ url, options });
            return fetchOverride ? fetchOverride(url, options) : new Response(new Blob(['skin']));
        },
        require: name => {
            assert.equal(name, 'skin-renderer-test');
            return {
                renderSkinIsometricFast(canvas, source, options) {
                    counts.iso++; canvas.width = 20 * options.scale; canvas.height = 35 * options.scale;
                },
                renderSkinAvatarFast(canvas, source, options) {
                    counts.avatar++; canvas.width = canvas.height = 9 * options.scale;
                },
            };
        },
    });
    return { ...module.exports, counts, requests, window: dom.window, close: () => dom.window.close() };
}

test('different preview sizes and avatars share one fetch and one decode', async () => {
    const env = await skinEnvironment();
    try {
        const [small, large, avatar] = await Promise.all([
            env.Skin2D('/skin.png', { scale: 4 }), env.Skin2D('/skin.png'), env.SkinAvatar('/skin.png'),
        ]);
        assert.deepEqual([small.width, large.width, avatar.width], [140, 280, 90]);
        assert.deepEqual(env.counts, { fetch: 1, decode: 1, close: 1, iso: 2, avatar: 1 });
        assert.strictEqual(await env.Skin2D('/skin.png', { scale: 4 }), small);
        await env.Skin2D('/skin.png', { showOverlay: false });
        assert.equal(env.counts.fetch, 1);
        assert.equal(env.counts.iso, 3);
        await env.Skin2D('/skin.png?signature=other');
        assert.equal(env.counts.fetch, 2, 'signed URLs must keep their full identity');
    } finally { env.close(); }
});

test('a failed image request is retried instead of poisoning either cache', async () => {
    let failures = 1;
    const env = await skinEnvironment(() => failures-- > 0
        ? new Response('', { status: 503 }) : new Response(new Blob(['skin'])));
    try {
        await assert.rejects(env.Skin2D('/skin.png'), /503/);
        await env.Skin2D('/skin.png');
        assert.equal(env.counts.fetch, 2);
        assert.equal(env.counts.decode, 1);
    } finally { env.close(); }
});

test('account changes invalidate previews, abort pending sources and keep refreshed tokens warm', async () => {
    const env = await skinEnvironment();
    const token = (sub, exp) => `header.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`;
    try {
        env.window.localStorage.setItem('token', token('a', 1));
        const original = await env.Skin2D('/private.png');
        env.window.localStorage.setItem('token', token('a', 2));
        env.window.dispatchEvent(new env.window.Event('auth-token-updated'));
        assert.strictEqual(await env.Skin2D('/private.png'), original);
        env.window.localStorage.setItem('token', token('b', 2));
        env.window.dispatchEvent(new env.window.Event('auth-token-updated'));
        assert.notStrictEqual(await env.Skin2D('/private.png'), original);
        assert.equal(env.counts.fetch, 2);
    } finally { env.close(); }
    const pending = await skinEnvironment((url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    try {
        const work = pending.Skin2D('/pending.png');
        const rejected = assert.rejects(work, error => error.name === 'AbortError');
        for (let i = 0; i < 5; i++) await Promise.resolve();
        assert.equal(pending.requests.length, 1);
        pending.window.localStorage.setItem('token', token('b', 1));
        pending.window.dispatchEvent(new pending.window.Event('auth-token-updated'));
        assert.equal(pending.requests[0].options.signal.aborted, true);
        await rejected;
    } finally { pending.close(); }
});

test('static slot orientations face inward and fades finish without further updates', () => {
    const { DISCOVERY_SLOTS, advanceDiscoveryFades, cameraSmoothing } = compiledModule('src/utils/discoveryGeometry.ts');
    const THREE = require('three');
    for (const slot of DISCOVERY_SLOTS) {
        assert.ok(Math.abs(slot.position.length() - 15) < 1e-12);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(slot.quaternion);
        assert.ok(forward.dot(slot.position.clone().normalize()) < -0.999999);
    }
    const material = new THREE.MeshBasicMaterial();
    const placeholder = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    const fades = new Set([{ material, placeholder, elapsed: 0 }]);
    advanceDiscoveryFades(fades, 0.25);
    assert.equal(material.opacity, 0.5);
    assert.equal(placeholder.visible, true);
    advanceDiscoveryFades(fades, 0.25);
    assert.equal(material.opacity, 1);
    assert.equal(placeholder.visible, false);
    assert.equal(fades.size, 0);
    assert.ok(Math.abs(cameraSmoothing(1 / 60) - 0.08) < 1e-12);
    assert.ok(Math.abs((1 - cameraSmoothing(1 / 120)) ** 120 - (1 - cameraSmoothing(1 / 60)) ** 60) < 1e-12);
    placeholder.geometry.dispose(); placeholder.material.dispose(); material.dispose();
});

test('DOM thumbnails wait for visibility, draw canvas pixels and ignore stale results', async () => {
    const result = await build({
        stdin: { contents: "export { Skin2DImg } from './src/components/Skin2DImg'; export { SkinAvatarImage } from './src/components/SkinAvatarImage'",
            resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
        bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
        external: ['react', 'react/jsx-runtime'],
        plugins: [{ name: 'canvas-boundaries', setup(build) {
            build.onResolve({ filter: /^\.\/utils$/ }, () => ({ path: 'skin-image-test', external: true }));
            build.onResolve({ filter: /^@iconify\/react$/ }, () => ({ path: 'avatar-icon-test', external: true }));
        } }],
    });
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.test/', pretendToBeVisual: true });
    const draws = [];
    dom.window.HTMLCanvasElement.prototype.getContext = function() {
        return { drawImage: source => draws.push({ target: this, source }) };
    };
    dom.window.HTMLCanvasElement.prototype.toDataURL = () => { throw Error('Must not encode PNG'); };
    const loads = [];
    const pending = new Map();
    let intersection;
    class Observer {
        constructor(callback) { intersection = callback; }
        observe() {}
        disconnect() {}
    }
    const avatar = dom.window.document.createElement('canvas'); avatar.width = avatar.height = 90;
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, console,
        IntersectionObserver: Observer,
        require: name => name === 'skin-image-test' ? {
            Skin2D: src => { loads.push(src); const work = deferred(); pending.set(src, work); return work.promise; },
            SkinAvatar: async () => avatar,
        } : name === 'avatar-icon-test' ? { Icon: () => null } : require(name),
    });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = dom.window.document.getElementById('root');
    const root = createRoot(node);
    const { Skin2DImg, SkinAvatarImage } = module.exports;
    function view(src) { return React.createElement(React.Fragment, null,
        React.createElement(Skin2DImg, { src, showRawFallback: true, className: 'preview' }),
        React.createElement(SkinAvatarImage, { textureUrl: '/avatar.png', alt: 'Minecraft avatar' })); }
    try {
        await React.act(async () => root.render(view('/a.png')));
        assert.equal(loads.length, 0, 'offscreen thumbnails must not fetch or render');
        assert.equal(node.querySelector('[aria-label="Minecraft avatar"]').tagName, 'CANVAS');
        await React.act(async () => intersection([{ isIntersecting: true }]));
        assert.deepEqual(loads, ['/a.png']);
        assert.equal(node.querySelector('.preview').tagName, 'IMG', 'raw fallback remains available while loading');
        const a = dom.window.document.createElement('canvas'); a.width = a.height = 140;
        await React.act(async () => pending.get('/a.png').resolve(a));
        const visibleA = node.querySelector('.preview');
        assert.equal(visibleA.tagName, 'CANVAS');
        assert.equal(visibleA.width, 140);
        assert.ok(draws.some(draw => draw.target === visibleA && draw.source === a));
        await React.act(async () => root.render(view('/b.png')));
        await React.act(async () => root.render(view('/c.png')));
        const c = dom.window.document.createElement('canvas'); c.width = c.height = 280;
        await React.act(async () => pending.get('/c.png').resolve(c));
        const visibleC = node.querySelector('.preview');
        assert.equal(visibleC.width, 280);
        const b = dom.window.document.createElement('canvas'); b.width = b.height = 70;
        await React.act(async () => pending.get('/b.png').resolve(b));
        assert.equal(node.querySelector('.preview').width, 280);
        assert.ok(!draws.some(draw => draw.source === b));
        await React.act(async () => root.render(null));
        assert.equal(visibleC.width, 1, 'release DOM backing pixels on unmount');
        assert.equal(c.width, 280, 'a view must never dispose the shared cached canvas');
    } finally {
        await React.act(async () => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});
