const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const fs = require('node:fs');

const compiled = build({
    stdin: { contents: `export { FigurePrintPage } from './src/pages/FigurePrintPage';
        export { default as en } from './src/constants/locales/en';
        export { default as zh } from './src/constants/locales/zh-hans';
        export { FIGURE_PRINT_TERMS } from './src/constants/figurePrintTerms';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom'],
    plugins: [{ name: 'print-page-boundaries', setup(build) {
        build.onResolve({ filter: /^@iconify\/react$|\/components\/(PageContainer|SEO|GoogleSignInButton)$|\/utils\/(httpClient|api|authClient|authSession)$|\/hooks\/useAuthSession$|\/print\/(figureEngine|FigurePreview|FigureCommissionDialog|download)$/ },
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
    const server = { version: '1.0', accepted: options.accepted ? '1.0' : null, acceptedAt: options.accepted ? '2026-10-09T00:00:00Z' : null,
        getStatus: 200, postStatus: 200, pendingPost: null, stockStatus: 200, stock: [{ model_type: 'Cute DIY Kit', price: 40 }], ...options.server };
    const status = () => ({ required_version: server.version, accepted_version: server.accepted, accepted_at: server.acceptedAt });
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
            if (name.endsWith('/utils/api')) return {
                apiResponseJson: response => response.json(),
                apiFetch: async (url, init = {}) => {
                    requests.push({ url, ...init });
                    if (url.includes('/model-stock')) return { ok: server.stockStatus === 200, json: async () => server.stock };
                    if (url.endsWith('/production-source')) return { ok: (server.productionStatus || 200) === 200, json: async () => server.production };
                    let httpStatus = server.getStatus;
                    if (init.method === 'POST') {
                        if (server.pendingPost) await server.pendingPost.promise;
                        httpStatus = server.postStatus;
                        if (httpStatus === 200) { server.accepted = server.version; server.acceptedAt = '2026-10-09T08:00:00Z'; }
                    }
                    return { ok: httpStatus === 200, status: httpStatus, json: async () => status() };
                },
            };
            if (name.endsWith('/components/PageContainer')) return { PageContainer: ({ children }) => React.createElement('main', null, children) };
            if (name.endsWith('/components/SEO')) return { SEO: () => null };
            if (name.endsWith('/components/GoogleSignInButton')) return { GoogleSignInButton: () => React.createElement('button', null, 'Google sign in') };
            if (name.endsWith('/print/FigurePreview')) return { FigurePreview: () => React.createElement('div', null, 'preview') };
            if (name.endsWith('/print/FigureCommissionDialog')) return { FigureCommissionDialog: ({ source, model }) => React.createElement('aside', { 'data-source-id': source.id, 'data-model-id': model.id }, 'commission') };
            if (name.endsWith('/print/figureEngine')) return {
                generateFigure: (_image, _signal, _progress, info) => { generatedInfo.push(info); return generation.promise.then(() => ({ parts: ids.map(id => ({ id })), stickerUrl: 'blob:sticker', cutterUrl: 'blob:cutter' })); },
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
    const render = () => React.act(async () => { root.render(React.createElement(FigurePrintPage, { current })); });
    const button = text => Array.from(document.querySelectorAll('button')).find(button => button.textContent === text || (text === current.figurePrint.commission && button.textContent.startsWith(text)));
    const click = element => { assert.ok(element, 'expected a clickable element'); return React.act(async () => element.click()); };
    try {
        await render();
        const archive = JSON.parse(fs.readFileSync(path.join(__dirname, `../docs/legal/figure-print-terms/${FIGURE_PRINT_TERMS.version}.json`), 'utf8'));
        const termsText = current.figurePrintTerms;
        assert.deepEqual(archive.languages[options.lang === 'zh' ? 'zh-hans' : 'en'], JSON.parse(JSON.stringify({
            title: termsText.title, summary: termsText.summary, sections: termsText.sections,
        })), 'the accepted version must have a matching archived text');
        assert.equal(archive.effectiveDate, FIGURE_PRINT_TERMS.effectiveDate);
        await check({ node, downloads, requests, imageRequests, stored, generatedInfo, server, current, terms: FIGURE_PRINT_TERMS, button, click,
            modal: () => document.querySelector('dialog'), checkbox: () => document.querySelector('input[type="checkbox"]'),
            finish: () => React.act(async () => generation.resolve()), resolve: pending => React.act(async () => pending.resolve()),
            cancel: () => click(button(current.modal.cancel)), confirm: () => click(button(current.figurePrint.agreeAndDownload)),
            switchAccount: account => React.act(async () => { session = account; listeners.forEach(listener => listener()); }),
            replaceSource: async () => { location.state = { textureUrl: 'data:image/png;base64,replacement' }; await render(); },
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
            assert.equal(Array.from(env.node.querySelectorAll('a')).some(link => link.textContent === env.current.figurePrint.chooseCollection), false);
            assert.equal(Array.from(env.node.querySelectorAll('a')).some(link => link.textContent === env.current.figurePrint.discoverSkins), false);
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
            assert.equal(env.generatedInfo[0].publisher, source.publisher);
            assert.equal(env.generatedInfo[0].publisherId, source.publisherId);
            await env.click(env.button(env.current.figurePrint.commission));
            assert.equal(env.node.querySelector('aside').dataset.sourceId, source.id);
            assert.equal(env.node.querySelector('aside').dataset.modelId, 'cute');
            const models = env.node.querySelector('select');
            assert.equal(models.getAttribute('aria-label'), env.current.figurePrint.modelType);
            assert.equal(models.value, 'cute');
            assert.deepEqual(Array.from(models.options).map(option => option.textContent), ['CUTE-7cm']);
            assert.ok(env.requests.every(request => request.url.includes('/model-stock')), 'opening commissioning must not accept the download terms');
        });
    });
}

test('an empty page offers collections and Discover without a local upload or commissioning action', async () => {
    await withPage({ empty: true }, async env => {
        assert.equal(env.node.querySelector('a[href="/skin/collection"]').textContent, env.current.figurePrint.chooseCollection);
        assert.equal(env.node.querySelector('a[href="/skin/"]').textContent, env.current.figurePrint.discoverSkins);
        assert.equal(env.button(env.current.figurePrint.commission), undefined);
        assert.equal(env.node.querySelector('input[type="file"]'), null);
        assert.equal(env.node.querySelector('select'), null);
        assert.equal(downloadButtons(env.node).length, 0);
        assert.equal(env.node.querySelectorAll('a').length, 2);
        assert.equal(env.node.querySelector('header'), null);
        assert.equal(env.node.querySelector('a[href="/skin/edit"]'), null);
        assert.ok(env.node.textContent.includes(env.current.figurePrint.empty));
        assert.equal(env.generatedInfo.length, 0);
    });
});

for (const lang of ['zh', 'en']) {
    test(`${lang}: first download waits for saved consent; every format and re-entry use the account record`, async () => {
        await withPage({ lang }, async env => {
            assert.equal(env.checkbox(), null);
            assert.ok(downloadButtons(env.node).every(button => button.disabled));
            await env.finish(); const buttons = downloadButtons(env.node); assert.equal(buttons.length, 10);
            await env.click(buttons[0]); assert.equal(env.checkbox().checked, false);
            assert.equal(env.modal().querySelector(`a[href="${env.terms.path}"]`).target, '_blank');
            await env.confirm(); assert.equal(env.requests.filter(r => r.method === 'POST').length, 0);
            await env.click(env.checkbox());
            const pending = deferred(); env.server.pendingPost = pending;
            await env.confirm(); assert.equal(env.downloads.length, 0);
            await env.resolve(pending); assert.equal(env.downloads.length, 1); assert.equal(env.modal(), null);
            assert.deepEqual(JSON.parse(env.requests.find(r => r.method === 'POST').body), { version: env.terms.version, accepted: true });
            for (const button of buttons.slice(1)) await env.click(button);
            assert.equal(env.downloads.length, 10);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.stl')).length, 8);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.png')).length, 1);
            assert.equal(env.downloads.filter(([, name]) => name.endsWith('.svg')).length, 1);
            await env.remount(); await env.click(downloadButtons(env.node)[0]);
            assert.equal(env.downloads.length, 11); assert.equal(env.requests.filter(r => r.method === 'POST').length, 1);
            assert.equal(env.modal(), null);
        });
    });
}
test('guests can preview but must sign in before confirming or downloading', async () => {
    await withPage({ guest: true }, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]);
        assert.ok(env.modal().textContent.includes(env.current.figurePrint.loginForDownload));
        assert.equal(env.checkbox(), null); assert.ok(env.requests.every(request => request.url.includes('/model-stock'))); assert.equal(env.downloads.length, 0);
    });
});
test('cancel saves nothing and reopening requires an unchecked confirmation', async () => {
    await withPage({}, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]); await env.click(env.checkbox()); await env.cancel();
        await env.click(downloadButtons(env.node)[0]); assert.equal(env.checkbox().checked, false);
        assert.equal(env.downloads.length, 0); assert.equal(env.requests.filter(r => r.method === 'POST').length, 0);
    });
});
test('failed saves block downloads and permit retry', async () => {
    await withPage({ server: { postStatus: 503 } }, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]); await env.click(env.checkbox()); await env.confirm();
        assert.equal(env.downloads.length, 0); assert.ok(env.modal().textContent.includes(env.current.figurePrint.consentSaveFailed));
        env.server.postStatus = 200; await env.confirm(); assert.equal(env.downloads.length, 1);
    });
});
test('lookup failures cannot assume acceptance and permit retry', async () => {
    await withPage({ accepted: true, server: { getStatus: 503 } }, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]); assert.equal(env.downloads.length, 0);
        assert.ok(env.modal().textContent.includes(env.current.figurePrint.consentLoadFailed));
        env.server.getStatus = 200; await env.click(env.button(env.current.figurePrint.retry)); assert.equal(env.downloads.length, 1);
    });
});
for (const server of [{ version: '2.0' }, { postStatus: 409 }]) {
    test(`a terms version mismatch stops downloading (${JSON.stringify(server)})`, async () => {
        await withPage({ server }, async env => {
            await env.finish(); await env.click(downloadButtons(env.node)[0]);
            if (env.checkbox()) { await env.click(env.checkbox()); await env.confirm(); }
            assert.equal(env.downloads.length, 0); assert.equal(env.checkbox(), null);
            assert.ok(env.modal().textContent.includes(env.current.figurePrint.consentVersionMismatch));
        });
    });
}
test('an older saved version needs explicit new acceptance', async () => {
    await withPage({ server: { accepted: '0.9', acceptedAt: '2026-10-08T00:00:00Z' } }, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]);
        assert.equal(env.checkbox().checked, false); assert.equal(env.downloads.length, 0);
    });
});
for (const action of ['cancel', 'switchAccount', 'replaceSource']) {
    test(`${action} during a save prevents a late response from downloading`, async () => {
        await withPage({}, async env => {
            await env.finish(); await env.click(downloadButtons(env.node)[0]); await env.click(env.checkbox());
            const pending = deferred(); env.server.pendingPost = pending; await env.confirm();
            await env[action](action === 'switchAccount' ? 'account-b' : undefined); await env.resolve(pending);
            assert.equal(env.downloads.length, 0); assert.equal(env.modal(), null);
        });
    });
}
test('rapid duplicate confirmations send one save and one download', async () => {
    await withPage({}, async env => {
        await env.finish(); await env.click(downloadButtons(env.node)[0]); await env.click(env.checkbox());
        const button = env.button(env.current.figurePrint.agreeAndDownload);
        await React.act(async () => { button.click(); button.click(); });
        assert.equal(env.requests.filter(r => r.method === 'POST').length, 1); assert.equal(env.downloads.length, 1);
    });
});


const savedSticker = require('./fixtures/order-sticker.json');
const productionSource = { id: 'kit-a', order_id: 'order-a', model_type: 'Cute DIY Kit', skin_url: 'https://private.example.test/orders/order-a/kit-a.png?signature=fresh', sticker_snapshot: savedSticker };

test('production reloads the saved order image and exact sticker text even with a different UI language', async () => {
    await withPage({ search: '?order=order-a&item=kit-a', lang: 'zh', server: { production: productionSource } }, async env => {
        await env.finish();
        assert.deepEqual(env.imageRequests, [productionSource.skin_url]);
        assert.deepEqual(JSON.parse(JSON.stringify(env.generatedInfo[0])), {
            brand: savedSticker.brand, modelName: savedSticker.model_name,
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
