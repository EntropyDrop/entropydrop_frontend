const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export { FigurePrintPage } from './src/pages/FigurePrintPage';
        export { FigurePrintOfferBadge } from './src/components/FigureDiscountBadge';
        export { default as en } from './src/constants/locales/en';
        export { default as zh } from './src/constants/locales/zh-hans';
        export { FIGURE_PRINT_TERMS } from './src/constants/figurePrintTerms';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom'],
    plugins: [{ name: 'print-page-boundaries', setup(build) {
        build.onResolve({ filter: /^@iconify\/react$|\/components\/(PageContainer|SEO|GoogleSignInButton)$|\/utils\/(httpClient|api|authClient|authSession)$|\/hooks\/(useAuthSession|useCurrentUser)$|\/print\/(figureEngine|FigurePreview|FigureCommissionDialog|download)$/ },
            args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const downloadButtons = node => Array.from(node.querySelectorAll('button')).filter(button =>
    /STL$/.test(button.getAttribute('aria-label') || '') || /^(下载|Download).* (SVG|PNG)$/.test(button.textContent));

async function withPage(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const downloads = [], requests = [], stored = [], generatedInfo = [], imageRequests = [];
    dom.window.Storage.prototype.setItem = (...args) => stored.push(args);
    const generation = deferred();
    const ids = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'shortConnector', 'longConnector'];
    let session = options.guest ? null : 'account-a';
    const listeners = new Set();
    const server = { stockStatus: 200, stock: [{ model_type: 'Cute DIY Kit', price: 40 }], ...options.server };
    const location = { search: options.search || '', state: options.empty ? null : { textureUrl: 'data:image/png;base64,test', source: options.source } };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, AbortController, document, URLSearchParams,
        window: dom.window, localStorage: dom.window.localStorage, Event: dom.window.Event,
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
        Image: class { width = 64; height = 64; set src(_url) { queueMicrotask(() => this.onload()); } },
        setTimeout: callback => callback(),
        require(name) {
            if (name.endsWith('/utils/httpClient')) return { request: async url => { imageRequests.push(url); return { ok: true, blob: async () => ({}) }; } };
            if (name.endsWith('/utils/authClient')) return { waitForAuthReady: async () => {} };
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/hooks/useCurrentUser')) return { useCurrentUser: () => ({ user: options.guest ? null : { id: session, is_pro: options.isPro === true } }) };
            if (name.endsWith('/utils/api')) return {
                apiResponseJson: response => response.json(),
                apiFetch: async (url, init = {}) => {
                    requests.push({ url, ...init });
                    if (url.includes('/model-stock')) return { ok: server.stockStatus === 200, json: async () => server.stock };
                    if (url.endsWith('/production-source')) return { ok: (server.productionStatus || 200) === 200, json: async () => server.production };
                    if (url.startsWith('/api/logs/')) {
                        const entry = server.skins?.[url.slice('/api/logs/'.length)] || { status: 404 };
                        const response = typeof entry === 'function' ? entry(init) : entry;
                        if (response.pending) await response.pending.promise;
                        if (response.networkError) throw new Error('Network unavailable');
                        return { ok: (response.status || 200) === 200, status: response.status || 200, json: async () => response.data };
                    }
                    return { ok: false, status: 404, json: async () => ({}) };
                },
            };
            if (name.endsWith('/components/PageContainer')) return { PageContainer: ({ children }) => React.createElement('main', null, children) };
            if (name.endsWith('/components/SEO')) return { SEO: () => null };
            if (name.endsWith('/components/GoogleSignInButton')) return { GoogleSignInButton: () => React.createElement('button', null, 'Google sign in') };
            if (name.endsWith('/print/FigurePreview')) return { FigurePreview: () => React.createElement('div', null, 'preview') };
            if (name.endsWith('/print/FigureCommissionDialog')) return { FigureCommissionDialog: ({ source, model }) => React.createElement('aside', { 'data-source-id': source.id, 'data-model-id': model.id }, 'commission') };
            if (name.endsWith('/print/figureEngine')) return {
                generateFigure: (_image, _signal, _progress, info, options) => { generatedInfo.push({ ...info, generatedModelType: options?.modelType }); return generation.promise.then(() => ({ parts: ids.map(id => ({ id })), stickerUrl: 'blob:sticker', cutterUrl: 'blob:cutter' })); },
                generateFullFigureAssets: async output => ({ stickerUrl: output.fullStickerUrl || output.stickerUrl, cutterUrl: output.fullCutterUrl || output.cutterUrl }),
                disposeFigure() {}, exportPartStl: part => part,
            };
            if (name.endsWith('/print/download')) return { downloadUrl: (...args) => downloads.push(args) };
            if (name === 'react-router-dom') return { useLocation: () => location, useNavigate: () => () => {},
                Link: ({ to, children, state, ...props }) => React.createElement('a', { href: to, 'data-route-state': state ? JSON.stringify(state) : undefined, ...props }, children) };
            if (name === '@iconify/react') return { Icon: () => null };
            return require(name);
        },
    });
    const node = document.getElementById('root'); let root = createRoot(node);
    const { FigurePrintPage, FIGURE_PRINT_TERMS } = module.exports;
    const current = module.exports[options.lang || 'en'];
    const render = () => React.act(async () => { root.render(React.createElement(options.badge ? module.exports.FigurePrintOfferBadge : FigurePrintPage, { current })); });
    const button = text => Array.from(document.querySelectorAll('button')).find(button => button.textContent === text || (text === current.figurePrint.commission && button.textContent.startsWith(text)));
    const click = element => { assert.ok(element, 'expected a clickable element'); return React.act(async () => element.click()); };
    try {
        await render();
        await check({ node, downloads, requests, imageRequests, stored, generatedInfo, server, current, terms: FIGURE_PRINT_TERMS, button, click,
            modal: () => document.querySelector('dialog'),
            finish: () => React.act(async () => generation.resolve()), resolve: pending => React.act(async () => pending.resolve()),
            cancel: () => click(button(current.modal.cancel)),
            switchAccount: account => React.act(async () => { session = account; listeners.forEach(listener => listener()); }),
            replaceSource: async () => { location.state = { textureUrl: 'data:image/png;base64,replacement' }; await render(); },
            navigate: async (search, state = null) => { location.search = search; location.state = state; await render(); },
            remount: async () => { await React.act(() => root.unmount()); root = createRoot(node); await render(); },
        });
        assert.equal(stored.length, 0, 'acceptance must not be persisted in browser storage');
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

for (const lang of ['zh', 'en']) {
    test(`${lang}: a selected skin keeps its source in the page, sticker and commissioning handoff`, async () => {
        const source = { id: 'skin123', name: 'Test skin', publisher: 'Sample maker', publisherId: 'maker456', parentId: 'original789', publicLicense: 'CC BY-NC 4.0', isPublic: false };
        await withPage({ lang, source }, async env => {
            assert.equal(env.node.querySelector('input[type="file"]'), null);
            assert.equal(env.node.querySelector('header a[href="/skin/collection"]').textContent, env.current.figurePrint.chooseCollection);
            assert.equal(Array.from(env.node.querySelectorAll('a')).some(link => link.textContent === env.current.figurePrint.discoverSkins), false);
            assert.equal(env.node.querySelector('header a[href="/figure/showcase"]').textContent, env.current.nav.showcase);
            assert.equal(env.node.querySelector('a[href="/skin/?id=skin123"]').textContent, source.name);
            assert.equal(env.node.querySelector('a[href="/skin/collection/maker456"]'), null);
            assert.equal(env.node.querySelector('a[href="/skin/?id=original789"]'), null);
            const editLink = env.node.querySelector('a[href="/skin/edit"]');
            assert.equal(editLink.textContent, env.current.nav.edit);
            assert.deepEqual(JSON.parse(editLink.dataset.routeState), {
                textureUrl: 'data:image/png;base64,test', name: source.name, passedLogId: source.id, isPublic: false,
            });
            await env.finish();
            assert.equal(env.generatedInfo[0].sourceUrl, 'https://entropydrop.com/skin/?id=skin123');
            assert.equal(env.generatedInfo[0].sourceIsPublic, false);
            assert.equal(env.generatedInfo[0].publisher, source.publisher);
            assert.equal(env.generatedInfo[0].publisherId, source.publisherId);
            assert.equal(env.generatedInfo[0].generatedModelType, 'cute10');
            await env.click(env.button(env.current.figurePrint.commission));
            assert.equal(env.node.querySelector('aside').dataset.sourceId, source.id);
            assert.equal(env.node.querySelector('aside').dataset.modelId, 'cute10');
            const models = env.node.querySelector('select');
            assert.equal(models.getAttribute('aria-label'), env.current.figurePrint.modelType);
            assert.equal(models.value, 'cute10');
            assert.deepEqual(Array.from(models.options).map(option => option.textContent), ['CUTE-10cm']);
            assert.ok(env.requests.every(request => request.url.includes('/model-stock')), 'opening commissioning must not accept the download terms');
        });
    });
}

test('an empty page offers collections, Discover and Showcase without a local upload or commissioning action', async () => {
    await withPage({ empty: true }, async env => {
        assert.equal(env.node.querySelector('a[href="/skin/collection"]').textContent, env.current.figurePrint.chooseCollection);
        assert.equal(env.node.querySelector('a[href="/skin/"]').textContent, env.current.figurePrint.discoverSkins);
        assert.equal(env.node.querySelector('a[href="/figure/showcase"]').textContent, env.current.nav.showcase);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
        assert.equal(env.node.querySelector('input[type="file"]'), null);
        assert.equal(env.node.querySelector('select'), null);
        assert.equal(downloadButtons(env.node).length, 0);
        assert.equal(env.node.querySelectorAll('a').length, 3);
        assert.equal(env.node.querySelector('header'), null);
        assert.equal(env.node.querySelector('a[href="/skin/edit"]'), null);
        assert.ok(env.node.textContent.includes(env.current.figurePrint.empty));
        assert.equal(env.generatedInfo.length, 0);
    });
});

const publicSkin = {
    id: 'shared-skin', name: 'Shared figure', is_public: true, result: 'https://cdn.example.test/shared-skin.png',
    creator: { id: 'public-maker', username: 'Public maker' }, parent: '',
    license: { public_license: 'cc-by-nc-4.0' },
};

test('print URLs carry the ID of public and private skins alike', () => {
    const module = { exports: {} };
    const { buildSync } = require('esbuild');
    vm.runInNewContext(buildSync({
        entryPoints: [path.resolve(__dirname, '../src/pages/figure/print/figureSource.ts')],
        bundle: true, write: false, platform: 'node', format: 'cjs',
    }).outputFiles[0].text, { module, exports: module.exports });
    const { createFigureSource, figurePrintPath } = module.exports;
    for (const is_public of [true, false, undefined, null]) {
        assert.equal(figurePrintPath(createFigureSource({ ...publicSkin, is_public })), '/figure/3dprint?id=shared-skin');
    }
    const modal = require('node:fs').readFileSync(path.resolve(__dirname, '../src/components/MCModal.tsx'), 'utf8');
    assert.match(modal, /navigate\(figurePrintPath\(source\)\);/, 'the skin dialog opens the ID link without router state');
});

for (const lang of ['zh', 'en']) test(`${lang}: a guest can open and refresh a shared print URL without navigation state`, async () => {
    await withPage({ lang, guest: true, empty: true, search: '?id=shared-skin', server: { skins: { 'shared-skin': { data: publicSkin } } } }, async env => {
        assert.equal(env.node.querySelector('a[href="/skin/?id=shared-skin"]').textContent, publicSkin.name);
        assert.deepEqual(env.imageRequests, [publicSkin.result]);
        assert.equal(env.generatedInfo[0].sourceId, publicSkin.id);
        assert.equal(env.generatedInfo[0].sourceIsPublic, true);
        assert.equal(env.generatedInfo[0].publisher, publicSkin.creator.username);
        await env.finish();
        assert.ok(downloadButtons(env.node).every(button => !button.disabled));
        await env.click(downloadButtons(env.node)[0]);
        assert.ok(env.modal().textContent.includes(env.current.figurePrint.loginForDownload));
        await env.remount();
        assert.deepEqual(env.imageRequests, [publicSkin.result, publicSkin.result]);
        const lookups = env.requests.filter(request => request.url.startsWith('/api/logs/'));
        assert.equal(lookups.length, 2);
        assert.ok(lookups.every(request => request.auth === 'none' && request.credentials === 'omit' && request.cache === 'no-store'));
    });
});

for (const [reason, response] of [
    ['missing visibility', { data: { ...publicSkin, is_public: undefined } }],
    ['non-boolean visibility', { data: { ...publicSkin, is_public: 'true' } }],
    ['another skin', { data: { ...publicSkin, id: 'other-skin' } }],
    ['missing image', { data: { ...publicSkin, result: '' } }],
    ['missing response', { data: null }],
    ['forbidden skin', { status: 403 }],
    ['deleted skin', { status: 404 }],
]) test(`shared printing rejects ${reason} without falling back to private navigation state`, async () => {
    await withPage({ search: '?id=shared-skin', source: { id: 'private-skin', isPublic: false }, server: { skins: { 'shared-skin': response } } }, async env => {
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.sharedSourceUnavailable);
        assert.equal(env.imageRequests.length, 0);
        assert.equal(env.generatedInfo.length, 0);
        assert.equal(downloadButtons(env.node).length, 0);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
    });
});

const privateSkin = { ...publicSkin, id: 'my-private-skin', name: 'My private figure', is_public: false, result: 'https://cdn.example.test/private.png',
    creator: { id: 'account-a', username: 'Owner' } };
const ownerOnly = data => init => init.auth === 'none' ? { status: 403 } : { data };
const logLookups = env => env.requests.filter(request => request.url.startsWith('/api/logs/'));

for (const lang of ['zh', 'en']) test(`${lang}: the signed-in owner can open a private skin by its print link`, async () => {
    await withPage({ lang, empty: true, search: '?id=my-private-skin', server: { skins: { 'my-private-skin': ownerOnly(privateSkin) } } }, async env => {
        assert.equal(env.node.querySelector('a[href="/skin/?id=my-private-skin"]').textContent, privateSkin.name);
        assert.deepEqual(env.imageRequests, [privateSkin.result]);
        assert.equal(env.generatedInfo[0].sourceId, privateSkin.id);
        assert.equal(env.generatedInfo[0].sourceIsPublic, false);
        assert.equal(env.generatedInfo[0].publisher, 'Owner');
        const lookups = logLookups(env);
        assert.deepEqual(lookups.map(request => request.auth), ['none', 'required'], 'the anonymous lookup comes first, then the account lookup');
        assert.equal(lookups[0].credentials, 'omit');
        await env.finish();
        assert.ok(downloadButtons(env.node).every(button => !button.disabled));
        await env.click(env.button(env.current.figurePrint.commission));
        assert.equal(env.node.querySelector('aside').dataset.sourceId, privateSkin.id);
    });
});

for (const [reason, response] of [
    ['a 403 for anonymous requests', ownerOnly(privateSkin)],
    ['private data returned to an anonymous request', { data: privateSkin }],
]) test(`a guest cannot open a private skin link: ${reason}`, async () => {
    await withPage({ guest: true, empty: true, search: '?id=my-private-skin', server: { skins: { 'my-private-skin': response } } }, async env => {
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.sharedSourceUnavailable);
        assert.equal(env.imageRequests.length, 0);
        assert.equal(env.generatedInfo.length, 0);
        assert.deepEqual(logLookups(env).map(request => request.auth), ['none'], 'a guest never makes an account lookup');
    });
});

test('another account cannot open a private skin link', async () => {
    await withPage({ empty: true, search: '?id=my-private-skin', server: { skins: { 'my-private-skin': { status: 403 } } } }, async env => {
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.sharedSourceUnavailable);
        assert.equal(env.imageRequests.length, 0);
        assert.deepEqual(logLookups(env).map(request => request.auth), ['none', 'required']);
        assert.equal(downloadButtons(env.node).length, 0);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
    });
});

test('signing in opens a private skin link and signing out drops it', async () => {
    await withPage({ guest: true, empty: true, search: '?id=my-private-skin', server: { skins: { 'my-private-skin': ownerOnly(privateSkin) } } }, async env => {
        assert.ok(env.node.querySelector('[role="alert"]'));
        await env.switchAccount('account-a');
        assert.equal(env.node.querySelector('[role="alert"]'), null);
        assert.deepEqual(env.imageRequests, [privateSkin.result]);
        assert.equal(env.generatedInfo[0].sourceId, privateSkin.id);
        await env.switchAccount(null);
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.sharedSourceUnavailable);
        assert.equal(downloadButtons(env.node).length, 0);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
    });
});

for (const search of ['?id=', '?id=..%2Fprivate', '?id=https%3A%2F%2Fexample.test%2Fskin.png', '?id=shared-skin&id=other', `?id=${'a'.repeat(81)}`]) {
    test(`invalid shared skin IDs never load a texture: ${search}`, async () => {
        await withPage({ search }, async env => {
            assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.sharedSourceUnavailable);
            assert.equal(env.requests.length, 0);
            assert.equal(env.imageRequests.length, 0);
        });
    });
}

for (const response of [{ status: 503 }, { networkError: true }]) test(`shared skin lookup errors allow retry: ${JSON.stringify(response)}`, async () => {
    await withPage({ empty: true, search: '?id=shared-skin', server: { skins: { 'shared-skin': response } } }, async env => {
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.loadFailed);
        assert.equal(env.imageRequests.length, 0);
        env.server.skins['shared-skin'] = { data: publicSkin };
        await env.click(env.button(env.current.figurePrint.retry));
        assert.deepEqual(env.imageRequests, [publicSkin.result]);
    });
});

test('changing shared IDs cancels old lookups and ignores their late responses', async () => {
    const pending = deferred();
    await withPage({ empty: true, search: '?id=shared-skin', server: { skins: {
        'shared-skin': { data: publicSkin, pending },
        'next-skin': { data: { ...publicSkin, id: 'next-skin', result: 'next.png' } },
    } } }, async env => {
        assert.equal(env.node.querySelector('[role="status"]').textContent, env.current.figurePrint.sharedSourceLoading);
        assert.equal(env.imageRequests.length, 0);
        const first = env.requests.find(request => request.url === '/api/logs/shared-skin');
        await env.navigate('?id=next-skin');
        assert.equal(first.signal.aborted, true);
        await env.resolve(pending);
        assert.deepEqual(env.imageRequests, ['next.png']);
        assert.equal(env.generatedInfo[0].sourceId, 'next-skin');
        await env.navigate('?id=private-skin');
        assert.ok(env.node.querySelector('[role="alert"]'));
        assert.equal(env.node.querySelector('a[href="/skin/?id=next-skin"]'), null);
        assert.equal(downloadButtons(env.node).length, 0);
    });
});

test('raw image URLs in the query cannot open a shared print preview', async () => {
    await withPage({ empty: true, search: '?url=https%3A%2F%2Fexample.test%2Fprivate.png&textureUrl=private.png' }, async env => {
        assert.equal(env.requests.length, 0);
        assert.equal(env.imageRequests.length, 0);
        assert.equal(env.generatedInfo.length, 0);
    });
});

for (const lang of ['zh', 'en']) {
    test(`${lang}: a signed-in account downloads every format directly, without a separate agreement step`, async () => {
        await withPage({ lang }, async env => {
            assert.equal(env.node.querySelector('a[href="/pro"]'), null);
            assert.ok(downloadButtons(env.node).every(button => button.disabled));
            await env.finish(); const buttons = downloadButtons(env.node); assert.equal(buttons.length, 10);
            for (const button of buttons) { await env.click(button); assert.equal(env.modal(), null); }
            assert.equal(env.downloads.length, 10);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.stl')).length, 8);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.png')).length, 1);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.svg')).length, 1);
            assert.equal(env.node.querySelector('input[type="checkbox"]'), null);
            assert.ok(env.node.querySelector('a[href="/pro"]'));
            assert.equal(env.requests.some(request => request.url.includes('figure_print_terms')), false);
        });
    });
}
test('guests can preview but must sign in before downloading; the notice has no agreement checkbox', async () => {
    await withPage({ guest: true }, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]);
        assert.ok(env.modal().textContent.includes(env.current.figurePrint.loginForDownload));
        assert.ok(env.modal().textContent.includes(env.current.figurePrintTerms.summary));
        assert.equal(env.modal().querySelector('input[type="checkbox"]'), null);
        assert.equal(env.modal().querySelector(`a[href="${env.terms.path}"]`).target, '_blank');
        assert.ok(env.requests.every(request => request.url.includes('/model-stock'))); assert.equal(env.downloads.length, 0);
        await env.cancel(); assert.equal(env.modal(), null); assert.equal(env.downloads.length, 0);
    });
});
for (const action of ['switchAccount', 'replaceSource']) {
    test(`${action} while the sign-in notice is open cancels the pending download`, async () => {
        await withPage({ guest: true }, async env => {
            await env.finish(); await env.click(downloadButtons(env.node)[0]); assert.ok(env.modal());
            await env[action](action === 'switchAccount' ? 'account-b' : undefined);
            assert.equal(env.modal(), null); assert.equal(env.downloads.length, 0);
        });
    });
}

const savedSticker = require('./fixtures/order-sticker.json');
const productionSource = { id: 'kit-a', order_id: 'order-a', model_type: 'Cute DIY Kit', skin_url: 'https://private.example.test/orders/order-a/kit-a.png?signature=fresh', sticker_snapshot: savedSticker };

for (const visibility of [true, false, null]) test(`production stickers preserve saved source visibility: ${visibility}`, async () => {
    await withPage({ search: '?order=order-a&item=kit-a', server: { production: {
        ...productionSource, sticker_snapshot: { ...savedSticker, source_is_public: visibility },
    } } }, async env => {
        await env.finish();
        assert.equal(env.generatedInfo[0].sourceIsPublic, visibility);
        assert.equal(env.generatedInfo[0].sourceUrl, savedSticker.source_url);
    });
});

test('production reloads the saved order image and exact sticker text even with a different UI language', async () => {
    await withPage({ search: '?order=order-a&item=kit-a', lang: 'zh', server: { production: productionSource } }, async env => {
        await env.finish();
        assert.deepEqual(env.imageRequests, [productionSource.skin_url]);
        assert.deepEqual(JSON.parse(JSON.stringify(env.generatedInfo[0])), {
            generatedModelType: 'cute10', brand: savedSticker.brand, modelName: savedSticker.model_name,
            name: savedSticker.skin_name, publisher: savedSticker.publisher_name, publisherId: savedSticker.publisher_id,
            sourceId: savedSticker.skin_id, sourceUrl: savedSticker.source_url,
            labels: { publisher: 'Published by', userId: 'User ID', source: 'Skin' },
        });
        assert.equal(env.node.querySelector('select').disabled, true);
        assert.equal(env.node.querySelector('a[href="/skin/edit"]'), null);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
        assert.ok(env.node.textContent.includes(savedSticker.skin_name));
        assert.equal(env.node.textContent.includes(savedSticker.publisher_name), false);
        await env.remount();
        assert.equal(env.requests.length, 2);
        assert.ok(env.requests.every(request => request.url === '/api/figure/orders/order-a/items/kit-a/production-source' && request.auth === 'required'));
    });
});

test('production failures do not fall back to a skin passed through navigation state', async () => {
    await withPage({ search: '?order=order-a&item=kit-a', server: { productionStatus: 409, production: productionSource } }, async env => {
        assert.ok(env.node.querySelector('[role="alert"]'));
        assert.equal(env.imageRequests.length, 0);
        assert.equal(env.generatedInfo.length, 0);
        env.server.productionStatus = 200;
        await env.click(env.button(env.current.figurePrint.retry));
        await env.finish();
        assert.deepEqual(env.imageRequests, [productionSource.skin_url]);
        await env.switchAccount(null);
        assert.ok(env.node.querySelector('[role="alert"]'));
        assert.equal(downloadButtons(env.node).length, 0);
    });
});

test('a shared skin parameter cannot override a production order or bypass its authorization', async () => {
    await withPage({ search: '?order=order-a&item=kit-a&id=shared-skin', server: { productionStatus: 403, skins: { 'shared-skin': { data: publicSkin } } } }, async env => {
        assert.equal(env.node.querySelector('[role="alert"]').textContent, env.current.figurePrint.productionSourceFailed);
        assert.ok(env.requests.every(request => request.url.endsWith('/production-source') && request.auth === 'required'));
        assert.equal(env.imageRequests.length, 0);
        assert.equal(env.generatedInfo.length, 0);
    });
});

for (const [reason, production] of [
    ['a different item', { ...productionSource, id: 'other-kit' }],
    ['incomplete sticker metadata', { ...productionSource, sticker_snapshot: { ...savedSticker, missing_fields: ['publisher_name'] } }],
]) test(`production cannot generate from ${reason}`, async () => {
    await withPage({ search: '?order=order-a&item=kit-a', server: { production } }, async env => {
        assert.ok(env.node.querySelector('[role="alert"]'));
        assert.equal(env.generatedInfo.length, 0);
        assert.equal(env.imageRequests.length, 0);
    });
});


for (const [price, label] of [[40, '$40'], [42.5, '$42.50']]) test(`order button displays the selected kit's catalog price ${label} for guests`, async () => {
    await withPage({ guest: true, server: { stock: [{ model_type: 'Older model', price: 60 }, { model_type: 'Cute DIY Kit', price }] } }, async env => {
        assert.equal(env.button(env.current.figurePrint.commission).textContent, `${env.current.figurePrint.commission}· ${label}`);
        assert.equal(env.requests.find(request => request.url.includes('/model-stock')).auth, 'none');
    });
});

for (const [reason, server] of [
    ['request failure', { stockStatus: 500 }],
    ['missing model', { stock: [{ model_type: 'Older model', price: 60 }] }],
    ['invalid price', { stock: [{ model_type: 'Cute DIY Kit', price: -10 }] }],
]) test(`order button never invents a price on ${reason}`, async () => {
    await withPage({ server }, async env => {
        assert.equal(env.button(env.current.figurePrint.commission).textContent, env.current.figurePrint.commission);
    });
});


test('production retains cute7 geometry and filenames for a historical kit', async () => {
    const historical = { ...productionSource, sticker_snapshot: { ...savedSticker, model_name: 'CUTE-7cm' } };
    await withPage({ search: '?order=order-a&item=kit-a', server: { production: historical } }, async env => {
        await env.finish();
        assert.equal(env.generatedInfo[0].generatedModelType, 'cute7');
        assert.equal(env.node.querySelector('select').value, 'cute7');
        assert.equal(env.node.querySelector('select').selectedOptions[0].textContent, 'CUTE-7cm');
    });
});

test('non-pro users see the Pro support prompt only after downloading and can dismiss it', async () => {
    await withPage({ isPro: false }, async env => {
        assert.equal(env.node.querySelector('a[href="/pro"]'), null);
        await env.finish();
        assert.equal(env.node.querySelector('a[href="/pro"]'), null);
        await env.click(downloadButtons(env.node)[0]);
        assert.equal(env.downloads.length, 1);
        const proLink = env.node.querySelector('a[href="/pro"]');
        assert.ok(proLink, 'Pro support link should be present for non-pro user');
        assert.equal(proLink.textContent, env.current.figurePrint.proSupportAction);
        assert.ok(env.node.textContent.includes(env.current.figurePrint.proSupportPrompt));

        const dismissBtn = env.node.querySelector(`button[aria-label="${env.current.figurePrint.dismissProPrompt}"]`);
        assert.ok(dismissBtn, 'Dismiss button should be present');
        await env.click(dismissBtn);
        assert.equal(env.node.querySelector('a[href="/pro"]'), null, 'Prompt should be dismissed');
        await env.click(downloadButtons(env.node)[1]);
        assert.equal(env.node.querySelector('a[href="/pro"]'), null, 'Further downloads should keep the prompt dismissed');
    });
});

test('guests do not see the Pro support prompt before completing a download', async () => {
    await withPage({ guest: true }, async env => {
        await env.finish();
        await env.click(downloadButtons(env.node)[0]);
        assert.equal(env.downloads.length, 0);
        assert.equal(env.node.querySelector('a[href="/pro"]'), null);
        assert.ok(!env.node.textContent.includes(env.current.figurePrint.proSupportPrompt));
    });
});

test('Pro members do not see the Pro support prompt banner', async () => {
    await withPage({ isPro: true }, async env => {
        await env.finish();
        await env.click(downloadButtons(env.node)[0]);
        assert.equal(env.downloads.length, 1);
        assert.equal(env.node.querySelector('a[href="/pro"]'), null, 'Pro support link should NOT be present for Pro member');
        assert.ok(!env.node.textContent.includes(env.current.figurePrint.proSupportPrompt));
    });
});

test('production orders do not display the Pro support banner', async () => {
    await withPage({ search: '?order=order-a&item=kit-a', isPro: false, server: { production: productionSource } }, async env => {
        await env.finish();
        await env.click(downloadButtons(env.node)[0]);
        assert.equal(env.downloads.length, 1);
        assert.equal(env.node.querySelector('a[href="/pro"]'), null, 'Pro support link should NOT be present in production order view');
    });
});

test('production orders do not display choose from collection link', async () => {
    await withPage({ search: '?order=order-a&item=kit-a', server: { production: productionSource } }, async env => {
        await env.finish();
        assert.equal(env.node.querySelector('header a[href="/skin/collection"]'), null);
    });
});


test('the print purchase button shows the original price, discounted price and offer', async () => {
    await withPage({ guest: true, server: { stock: [{ model_type: 'Cute DIY Kit', price: 30, discounted_price: 15, global_discount_bps: 5000 }] } }, async env => {
        const purchase = env.button(env.current.figurePrint.commission);
        assert.equal(purchase.querySelector('del').textContent, '$30');
        assert.ok(purchase.textContent.includes('$15'));
        assert.ok(purchase.textContent.includes(env.current.figureDiscount.badge.replace('{percent}', '50')));
    });
});

for (const lang of ['en', 'zh']) test(`${lang}: the modal badge follows the saved global discount and hides when disabled`, async () => {
    await withPage({ lang, badge: true, guest: true, server: { stock: [{ model_type: 'Cute DIY Kit', price: 30, discounted_price: 15, global_discount_bps: 5000 }] } }, async env => {
        assert.equal(env.node.textContent, env.current.figureDiscount.badge.replace('{percent}', '50'));
        env.server.stock = [{ ...env.server.stock[0], global_discount_bps: 2550 }];
        await React.act(async () => window.dispatchEvent(new window.Event('figure-pricing-updated')));
        assert.equal(env.node.textContent, env.current.figureDiscount.badge.replace('{percent}', '25.5'));
        env.server.stock = [{ ...env.server.stock[0], global_discount_bps: 0 }];
        await React.act(async () => window.dispatchEvent(new window.Event('focus')));
        assert.equal(env.node.textContent, '');
    });
});
