const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');

const projectRoot = path.resolve(__dirname, '..');
const compiled = build({
    stdin: {
        contents: `export { CollectionPage } from './src/pages/CollectionPage';
            export { default as current } from './src/constants/locales/en';`,
        resolveDir: projectRoot,
        loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'collection-visuals'],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
    // Keep the page, router, authentication and API code real. Only replace
    // visuals that do not participate in collection loading.
    plugins: [{ name: 'collection-visuals', setup(build) {
        build.onResolve({ filter: /^(?:@iconify\/react|framer-motion)$|\/components\/(?:SEO|Skin2DImg|MCModal|LoadingPlaceholder)$/ },
            () => ({ path: 'collection-visuals', external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function json(data) {
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

function originals(userId = 42, own = true) {
    return (own ? ['liked', 'creations_public', 'creations_private'] : ['creations_public'])
        .map(id => ({ id, name: id, user_id: userId, is_public: id === 'creations_public',
            item_count: 1, original_creation: true, previews: [] }));
}

function collections(url, userId = 42) {
    const isPublic = url.searchParams.get('is_public') === 'true';
    const page = Number(url.searchParams.get('page'));
    return json({
        items: [{ id: `${userId}-${isPublic}-${page}`, name: `custom-${userId}-${isPublic}-${page}`,
            user_id: userId, is_public: isPublic, item_count: 0, original_creation: false }],
        page, total_pages: 2,
        original_items: page === 1 ? originals(userId, userId === 42) : [],
    });
}

async function mount(fetch, { userId = 42, width = 1920, collectionId } = {}) {
    const initialPath = `/skin/collection/${userId}${collectionId ? `/${collectionId}` : ''}`;
    const dom = new JSDOM('<div id="root"></div>', {
        url: `https://app.example.test${initialPath}`,
    });
    const { window } = dom;
    window.innerWidth = width;
    window.localStorage.setItem('token', 'existing-token');
    const module = { exports: {} };
    const visuals = {
        Icon: ({ icon }) => React.createElement('svg', { 'data-icon': icon }),
        AnimatePresence: ({ children }) => children,
        motion: { div: ({ children, initial, animate, exit, transition, ...props }) => React.createElement('div', props, children) },
        SEO: () => null, Skin2DImg: () => null,
        MCModal: ({ item }) => React.createElement('div', { 'data-modal-skin-public': String(item.is_public) }),
        LoadingPlaceholder: () => null,
    };
    const context = vm.createContext({
        window, localStorage: window.localStorage, document: window.document,
        fetch, Headers, Response, Request,
        URL: class extends URL { static createObjectURL() { return 'blob:mock-skin'; } },
        Image: class { width = 64; height = 64; set src(value) { this.onload?.(); } },
        URLSearchParams, FormData, Blob, AbortController, DOMException, atob, console,
        Event: window.Event, CustomEvent: window.CustomEvent, navigator: window.navigator,
        require: name => name === 'collection-visuals' ? visuals : require(name),
        module, exports: module.exports,
    });
    vm.runInContext(await compiled, context);
    const { CollectionPage, current } = module.exports;
    const previous = { window: global.window, document: global.document,
        act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = createRoot(node);
    let navigate;
    function Navigation() {
        navigate = useNavigate();
        return null;
    }
    await React.act(() => root.render(React.createElement(MemoryRouter,
        { initialEntries: [initialPath] },
        React.createElement(Navigation),
        React.createElement(Routes, null,
            React.createElement(Route, { path: '/skin/collection/:userId/:collectionId?',
                element: React.createElement(CollectionPage, { current }) })))));
    return {
        node, window, current,
        navigate: destination => React.act(() => navigate(destination)),
        async close() {
            await React.act(() => root.unmount());
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
            window.close();
        },
    };
}

function assertOwnDefaults(env) {
    for (const name of [env.current.collection.myLikes, env.current.collection.creationsPublic,
        env.current.collection.creationsPrivate]) {
        assert.ok(env.node.textContent.includes(name), `Missing ${name}`);
    }
}

for (const width of [1920, 700]) {
    test(`refresh at ${width}px waits for identity before loading own collections`, async () => {
        const status = deferred();
        const latePublic = deferred();
        const requests = [];
        const env = await mount(input => {
            const url = new URL(input);
            requests.push(url);
            if (url.pathname === '/api/users/me') return status.promise;
            if (url.pathname === '/api/users/42/collections') return latePublic.promise;
            return Promise.resolve(collections(url));
        }, { width });
        try {
            assert.deepEqual(requests.map(url => url.pathname), ['/api/users/me']);
            await React.act(() => status.resolve(json({ id: 42, is_pro: true })));
            assertOwnDefaults(env);
            await React.act(() => latePublic.resolve(collections(
                new URL('https://api.example.test/api/users/42/collections?page=1&is_public=true'), 99)));
            assertOwnDefaults(env);
            assert.equal(requests.filter(url => url.pathname === '/api/users/42/collections').length, 0);
        } finally {
            await env.close();
        }
    });
}

test('a late response from another user cannot replace own defaults after navigation', async () => {
    const latePublic = deferred();
    let otherSignal;
    const env = await mount((input, options) => {
        const url = new URL(input);
        if (url.pathname === '/api/users/me') return Promise.resolve(json({ id: 42, is_pro: true }));
        if (url.pathname === '/api/users/99/collections') {
            otherSignal = options.signal;
            // Simulate a response already in flight, even after cancellation.
            return latePublic.promise;
        }
        return Promise.resolve(collections(url));
    }, { userId: 99 });
    try {
        await env.navigate('/skin/collection/42');
        assertOwnDefaults(env);
        await React.act(() => latePublic.resolve(collections(
            new URL('https://api.example.test/api/users/99/collections?page=1&is_public=true'), 99)));
        assertOwnDefaults(env);
        assert.equal(otherSignal?.aborted, true);
        assert.equal(env.node.textContent.includes('custom-99'), false);
    } finally {
        await env.close();
    }
});

test('an empty original_items on a later custom page preserves default collections', async () => {
    let holdFirstPage = false;
    const laterFirstPage = deferred();
    const env = await mount(input => {
        const url = new URL(input);
        if (url.pathname === '/api/users/me') return Promise.resolve(json({ id: 42, is_pro: true }));
        if (holdFirstPage && url.searchParams.get('page') === '1') return laterFirstPage.promise;
        return Promise.resolve(collections(url));
    });
    try {
        assertOwnDefaults(env);
        holdFirstPage = true;
        const privateLabel = [...env.node.querySelectorAll('span')]
            .find(span => span.textContent === env.current.collection.labelPrivate);
        const next = privateLabel.parentElement.querySelector('[data-icon="pixelarticons:chevron-right"]')
            .closest('button');
        await React.act(() => next.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
        assert.ok(env.node.textContent.includes('custom-42-false-2'));
        assertOwnDefaults(env);
    } finally {
        await env.close();
    }
});

async function click(env, text, scope = env.node) {
    const button = [...scope.querySelectorAll('button')].find(node => node.textContent === text);
    assert.ok(button, `Missing button: ${text}`);
    await React.act(() => button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
}

async function openUpload(env, isPublic, custom = false) {
    await click(env, env.current.collection.upload);
    const picker = env.node.querySelector('[role="dialog"]');
    if (!isPublic) await click(env, env.current.collection.private, picker);
    const targetName = custom ? `custom-42-${isPublic}-1`
        : isPublic ? env.current.collection.creationsPublic : env.current.collection.creationsPrivate;
    const target = [...picker.querySelectorAll('button[aria-pressed]')]
        .find(button => button.textContent.includes(targetName));
    assert.ok(target, `Missing upload destination: ${targetName}`);
    await React.act(() => target.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
    const choose = [...picker.querySelectorAll('button')].find(button => button.textContent === env.current.collection.chooseImage);
    assert.equal(choose.disabled, false);
    assert.equal(picker.querySelector('#private-upload-picker-notice'), null);
    const input = env.node.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['skin'], 'skin.png', { type: 'image/png' })], configurable: true });
    await React.act(() => input.dispatchEvent(new env.window.Event('change', { bubbles: true })));
    return env.node.querySelector('[role="dialog"]');
}

async function mountUploader(isPro, { previewResponse, collectionResponse, ...mountOptions } = {}) {
    const writes = [];
    const previews = [];
    const metadataRequests = [];
    const env = await mount((input, options) => {
        const url = new URL(input);
        if (url.pathname === '/api/users/me') return Promise.resolve(json({ id: 42, is_pro: isPro }));
        if (url.pathname === '/api/licenses/preview') {
            previews.push(url);
            return previewResponse ? previewResponse.promise : Promise.resolve(json({
                code: 'source-license', is_pro: isPro, parent_is_private: false,
                public_license: url.searchParams.get('is_public') === 'true' ? 'cc-by-nc-4.0' : null,
            }));
        }
        if (options.method === 'POST') {
            writes.push({ path: url.pathname, body: options.body });
            return Promise.resolve(json({ id: 'uploaded', log_id: 'uploaded', name: 'skin', data: { result: 'skin.png' } }));
        }
        if (url.pathname === '/api/collections/items') {
            return Promise.resolve(json({ items: [], page: 1, total_pages: 1, total: 0 }));
        }
        if (url.pathname === '/api/collections' && !url.searchParams.has('is_public')) {
            metadataRequests.push({ url, signal: options.signal });
            return collectionResponse ? collectionResponse.promise : Promise.resolve(collections(url));
        }
        return Promise.resolve(collections(url));
    }, mountOptions);
    return { env, writes, previews, metadataRequests };
}

for (const isPro of [false, true]) {
    for (const custom of [false, true]) {
        test(`public ${isPro ? 'Pro' : 'Free'} ${custom ? 'custom folder' : 'creations'} upload confirms editor rights and CC sharing`, async () => {
            const { env, writes, previews } = await mountUploader(isPro);
            try {
                const dialog = await openUpload(env, true, custom);
                assert.ok(dialog.textContent.includes(env.current.edit.importRightsMessage));
                assert.ok(dialog.textContent.includes(env.current.edit.publicSaveRightsMessage));
                assert.equal(dialog.textContent.includes(env.current.skinLicense.yourRights), false);
                assert.equal(dialog.querySelector('select'), null);
                assert.equal(dialog.querySelector('[role="radiogroup"]'), null);
                assert.equal(previews.length, 1);
                assert.equal(previews[0].searchParams.has('source_rights'), false);
                assert.equal(writes.length, 0);
                await click(env, env.current.modal.confirm, dialog);
                assert.equal(writes.length, custom ? 2 : 1);
                assert.equal(writes[0].path, '/api/collections/creations_public/upload');
                assert.equal(writes[0].body.has('source_rights'), false);
                assert.equal(writes[0].body.has('requested_license'), false);
                assert.equal(writes[0].body.get('public_license_consent'), 'true');
                assert.equal(writes[0].body.get('license_consent'), 'true');
                if (custom) assert.equal(writes[1].path, '/api/collections/items');
            } finally { await env.close(); }
        });
    }
}

for (const custom of [false, true]) {
    test(`private ${custom ? 'custom folder' : 'creations'} upload submits directly without a rights prompt`, async () => {
        const { env, writes, previews } = await mountUploader(true);
        try {
            const dialog = await openUpload(env, false, custom);
            assert.equal(dialog, null);
            assert.equal(previews.length, 0);
            assert.equal(writes[0].path, '/api/collections/creations_private/upload');
            assert.equal(writes[0].body.has('source_rights'), false);
            assert.equal(writes[0].body.get('license_consent'), 'true');
            assert.equal(writes[0].body.get('public_license_consent'), 'false');
            assert.equal(writes[0].body.has('requested_license'), false);
            assert.equal(writes.length, custom ? 2 : 1);
            if (custom) {
                assert.equal(writes[1].path, '/api/collections/items');
                assert.equal(JSON.parse(writes[1].body).collection_id, '42-false-1');
            }
        } finally { await env.close(); }
    });
}

for (const isPublic of [false, true]) {
    test(`canceling public upload preserves the next ${isPublic ? 'public confirmation' : 'direct private upload'}`, async () => {
        const { env, writes } = await mountUploader(true);
        try {
            let dialog = await openUpload(env, true);
            await click(env, env.current.modal.cancel, dialog);
            assert.equal(writes.length, 0);
            dialog = await openUpload(env, isPublic);
            if (isPublic) {
                assert.ok(dialog.textContent.includes(env.current.edit.publicSaveRightsMessage));
                assert.equal(writes.length, 0);
                await click(env, env.current.modal.confirm, dialog);
            } else {
                assert.equal(dialog, null);
            }
            assert.equal(writes.length, 1);
            assert.equal(writes[0].path, `/api/collections/creations_${isPublic ? 'public' : 'private'}/upload`);
            assert.equal(writes[0].body.get('public_license_consent'), String(isPublic));
        } finally { await env.close(); }
    });
}

test('public uploads show pending and failed permission checks and block confirmation', async () => {
    const previewResponse = deferred();
    const { env, writes } = await mountUploader(true, { previewResponse });
    try {
        const dialog = await openUpload(env, true);
        const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === env.current.modal.confirm);
        assert.equal(confirm.disabled, true);
        assert.equal(dialog.querySelector('[role="status"]').textContent, env.current.skinLicense.loading);
        await click(env, env.current.modal.confirm, dialog);
        assert.equal(writes.length, 0);
        await React.act(() => previewResponse.resolve(new Response('{}', { status: 503 })));
        assert.equal(confirm.disabled, true);
        assert.equal(dialog.querySelector('[role="alert"]').textContent, env.current.skinLicense.unavailableDescription);
        await click(env, env.current.modal.confirm, dialog);
        assert.equal(writes.length, 0);
    } finally { await env.close(); }
});

for (const custom of [false, true]) {
    test(`upload inside private ${custom ? 'custom folder' : 'creations'} skips rights notices and confirmation`, async () => {
        const { env, writes, previews } = await mountUploader(true);
        try {
            const collectionId = custom ? '42-false-1' : 'creations_private';
            await env.navigate(`/skin/collection/42/${collectionId}`);
            const upload = [...env.node.querySelectorAll('button')].find(button => button.textContent === env.current.collection.upload);
            assert.ok(upload);
            assert.equal(upload.hasAttribute('aria-describedby'), false);
            assert.equal(env.node.querySelector('#private-collection-upload-notice'), null);
            const input = env.node.querySelector('#upload-item-input');
            Object.defineProperty(input, 'files', { value: [new File(['skin'], 'skin.png', { type: 'image/png' })], configurable: true });
            await React.act(() => input.dispatchEvent(new env.window.Event('change', { bubbles: true })));
            assert.equal(env.node.querySelector('[role="dialog"]'), null);
            assert.equal(previews.length, 0);
            assert.equal(writes.length, custom ? 2 : 1);
            assert.equal(writes[0].path, '/api/collections/creations_private/upload');
            assert.equal(writes[0].body.get('license_consent'), 'true');
            assert.equal(writes[0].body.get('public_license_consent'), 'false');
            if (custom) assert.equal(JSON.parse(writes[1].body).collection_id, collectionId);
        } finally { await env.close(); }
    });
}

for (const collectionId of ['creations_private', '42-false-1', '42-false-2']) {
    test(`directly opening ${collectionId} restores the upload button and private destination`, async () => {
        const { env, writes, metadataRequests } = await mountUploader(true, { collectionId });
        try {
            const upload = [...env.node.querySelectorAll('button')].find(button => button.textContent === env.current.collection.upload);
            assert.ok(upload);
            assert.equal(upload.disabled, false);
            const input = env.node.querySelector('#upload-item-input');
            Object.defineProperty(input, 'files', { value: [new File(['skin'], 'skin.png', { type: 'image/png' })], configurable: true });
            await React.act(() => input.dispatchEvent(new env.window.Event('change', { bubbles: true })));
            assert.equal(env.node.querySelector('[role="dialog"]'), null);
            assert.equal(writes[0].path, '/api/collections/creations_private/upload');
            assert.equal(writes[0].body.get('public_license_consent'), 'false');
            const custom = collectionId !== 'creations_private';
            assert.equal(writes.length, custom ? 2 : 1);
            if (custom) assert.equal(JSON.parse(writes[1].body).collection_id, collectionId);
            assert.equal(metadataRequests.length, collectionId === '42-false-2' ? 2 : custom ? 1 : 0);
        } finally { await env.close(); }
    });
}

test('pending collection metadata cannot enable uploads or overwrite a new destination', async () => {
    const collectionResponse = deferred();
    const { env, writes, metadataRequests } = await mountUploader(true, { collectionId: '42-false-1', collectionResponse });
    try {
        assert.equal(env.node.querySelector('#upload-item-input'), null);
        await env.navigate('/skin/collection/42/creations_private');
        assert.equal(metadataRequests[0].signal.aborted, true);
        await React.act(() => collectionResponse.resolve(collections(new URL('https://api.example.test/api/collections?page=1'))));
        const input = env.node.querySelector('#upload-item-input');
        assert.ok(input);
        Object.defineProperty(input, 'files', { value: [new File(['skin'], 'skin.png', { type: 'image/png' })], configurable: true });
        await React.act(() => input.dispatchEvent(new env.window.Event('change', { bubbles: true })));
        assert.equal(writes.length, 1);
        assert.equal(writes[0].path, '/api/collections/creations_private/upload');
    } finally { await env.close(); }
});

test('failed metadata resolution keeps custom collection uploads unavailable', async () => {
    const collectionResponse = deferred();
    const { env, writes } = await mountUploader(true, { collectionId: '42-false-1', collectionResponse });
    try {
        await React.act(() => collectionResponse.resolve(new Response('{}', { status: 404 })));
        assert.equal(env.node.querySelector('#upload-item-input'), null);
        assert.equal(writes.length, 0);
    } finally { await env.close(); }
});

test('another user’s public creations never expose an upload button', async () => {
    const { env, writes } = await mountUploader(true, { collectionId: 'creations_public' });
    try {
        assert.ok(env.node.querySelector('#upload-item-input'));
        await env.navigate('/skin/collection/99/creations_public');
        assert.equal(env.node.querySelector('#upload-item-input'), null);
        assert.equal(writes.length, 0);
    } finally { await env.close(); }
});

async function mountMover({ isPublic = false, skinIsPublic = isPublic, skinVisibilities = [skinIsPublic], targetPage } = {}) {
    const source = { id: 7, name: 'Source collection', user_id: 42, is_public: isPublic, original_creation: false, item_count: 1 };
    const target = { ...source, id: 'later-target', name: 'Later collection' };
    const writes = [];
    const requests = [];
    let moved = false;
    let metadataLoaded = false;
    const env = await mount((input, options) => {
        const url = new URL(input);
        if (url.pathname === '/api/users/me') return Promise.resolve(json({ id: 42, is_pro: true }));
        if (url.pathname === '/api/collections/items/item-1/move') {
            writes.push({ path: url.pathname, body: JSON.parse(options.body) });
            moved = true;
            return Promise.resolve(json({ message: 'Item moved successfully' }));
        }
        if (url.pathname === '/api/collections/items') {
            return Promise.resolve(json({ items: moved ? [] : skinVisibilities.map((visibility, index) => ({
                id: `item-${index + 1}`, collection_id: '7', name: `Skin ${index + 1}`, type: 'human_upload', log_id: `skin-${index + 1}`,
                data: { result: 'skin.png', is_public: visibility },
            })), page: 1, total_pages: 1, total: moved ? 0 : skinVisibilities.length }));
        }
        if (url.pathname === '/api/collections' && !metadataLoaded) {
            metadataLoaded = true;
            return Promise.resolve(json({ items: [source], page: 1, total_pages: 1 }));
        }
        if (url.pathname === '/api/collections') {
            requests.push({ url, signal: options.signal });
            const page = Number(url.searchParams.get('page'));
            if (targetPage) return targetPage({ page, source, target, requests });
            return Promise.resolve(json({ items: page === 1 ? [source,
                { ...source, id: 'opposite', name: 'Other visibility', is_public: !isPublic },
                { ...source, id: 'creations', name: 'Virtual creations', original_creation: true },
            ] : [target], page, total_pages: 2 }));
        }
        throw new Error(`Unexpected request: ${url}`);
    }, { collectionId: '7' });
    return { env, writes, requests };
}

async function openMove(env) {
    const button = [...env.node.querySelectorAll('button')].find(button => button.title === env.current.collection.moveToCollection);
    assert.ok(button, 'Move action is available inside the collection');
    await React.act(() => button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
    return env.node.querySelector('[role="dialog"]');
}

for (const { isPublic, skinIsPublic } of [
    { isPublic: false, skinIsPublic: false },
    { isPublic: false, skinIsPublic: true },
    { isPublic: true, skinIsPublic: true },
]) {
    test(`a ${skinIsPublic ? 'public' : 'private'} skin in a ${isPublic ? 'public' : 'private'} folder gets its own move permissions`, async () => {
        const { env, writes, requests } = await mountMover({ isPublic, skinIsPublic });
        try {
            assert.equal(requests.length, 0);
            const badge = env.node.querySelector('span.absolute.bottom-2.right-2');
            assert.equal(badge?.textContent, skinIsPublic ? env.current.collection.public : env.current.collection.private);
            const dialog = await openMove(env);
            assert.equal(dialog.textContent.includes(env.current.collection.noCollectionAvailable), false);
            assert.equal(dialog.textContent.includes('Source collection'), false);
            assert.equal(dialog.textContent.includes('Other visibility'), skinIsPublic);
            assert.equal(dialog.textContent.includes('Virtual creations'), false);
            assert.deepEqual(requests.map(request => request.url.searchParams.get('page')), ['1', '2']);
            assert.ok(requests.every(request => request.url.searchParams.get('is_public') === (skinIsPublic ? null : 'false')));
            assert.ok(requests.every(request => request.url.searchParams.get('show_original_creation') === 'false'));
            await click(env, 'Later collection', dialog);
            assert.deepEqual(writes, [{ path: '/api/collections/items/item-1/move', body: { target_collection_id: 'later-target' } }]);
            assert.equal(env.node.querySelector('[role="dialog"]'), null);
        } finally { await env.close(); }
    });
}

for (const isPublic of [false, true]) {
    test(`public skins can move from ${isPublic ? 'public to private' : 'private to public'} folders`, async () => {
        const { env, writes } = await mountMover({ isPublic, skinIsPublic: true });
        try {
            const dialog = await openMove(env);
            await click(env, 'Other visibility', dialog);
            assert.deepEqual(writes, [{ path: '/api/collections/items/item-1/move', body: { target_collection_id: 'opposite' } }]);
        } finally { await env.close(); }
    });
}

test('mixed skins in a private folder show individual badges and pass skin visibility to details', async () => {
    const { env } = await mountMover({ isPublic: false, skinVisibilities: [true, false] });
    try {
        const badges = [...env.node.querySelectorAll('span.absolute.bottom-2.right-2')];
        assert.deepEqual(badges.map(badge => badge.textContent), [env.current.collection.public, env.current.collection.private]);
        const preview = badges[0].parentElement.querySelector('div');
        await React.act(() => preview.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
        assert.equal(env.node.querySelector('[data-modal-skin-public]').getAttribute('data-modal-skin-public'), 'true');
    } finally { await env.close(); }
});

test('a missing skin visibility never inherits public move permissions from its folder', async () => {
    const { env, requests } = await mountMover({ isPublic: true, skinVisibilities: [null] });
    try {
        assert.equal([...env.node.querySelectorAll('button')].some(button => button.title === env.current.collection.moveToCollection), false);
        assert.equal(env.node.querySelector('span.absolute.bottom-2.right-2'), null);
        assert.equal(requests.length, 0);
    } finally { await env.close(); }
});

test('move destinations show loading until every page has completed', async () => {
    const pending = deferred();
    const { env } = await mountMover({ targetPage: ({ page, source }) => page === 1
        ? Promise.resolve(json({ items: [source], total_pages: 2 })) : pending.promise });
    try {
        const dialog = await openMove(env);
        assert.equal(dialog.querySelector('[role="status"]').textContent, env.current.mcmodal.loading);
        assert.equal(dialog.textContent.includes(env.current.collection.noCollectionAvailable), false);
        await React.act(() => pending.resolve(json({ items: [], total_pages: 2 })));
        assert.equal(dialog.querySelector('[role="status"]'), null);
        assert.ok(dialog.textContent.includes(env.current.collection.noCollectionAvailable));
    } finally { await env.close(); }
});

test('a failed move destination page shows retry instead of an empty list', async () => {
    let fail = true;
    const { env, requests } = await mountMover({ targetPage: ({ page, source, target }) => Promise.resolve(
        page === 2 && fail ? new Response('{}', { status: 503 })
            : json({ items: page === 1 ? [source] : [target], total_pages: 2 }),
    ) });
    try {
        const dialog = await openMove(env);
        assert.equal(dialog.querySelector('[role="alert"]').textContent, env.current.collection.moveCollectionsLoadFailed);
        assert.equal(dialog.textContent.includes(env.current.collection.noCollectionAvailable), false);
        fail = false;
        await click(env, env.current.collection.retry, dialog);
        assert.equal(dialog.querySelector('[role="alert"]'), null);
        assert.ok(dialog.textContent.includes('Later collection'));
        assert.deepEqual(requests.map(request => request.url.searchParams.get('page')), ['1', '2', '1', '2']);
    } finally { await env.close(); }
});

test('canceling and reopening move ignores late results from the previous load', async () => {
    const late = deferred();
    let attempts = 0;
    const { env, requests } = await mountMover({ targetPage: ({ target }) => {
        attempts += 1;
        return attempts === 1 ? late.promise : Promise.resolve(json({ items: [target], total_pages: 1 }));
    } });
    try {
        let dialog = await openMove(env);
        await click(env, env.current.modal.cancel, dialog);
        assert.equal(requests[0].signal.aborted, true);
        dialog = await openMove(env);
        assert.ok(dialog.textContent.includes('Later collection'));
        await React.act(() => late.resolve(json({ items: [{ id: 'stale', name: 'Stale collection', is_public: false }], total_pages: 1 })));
        assert.equal(dialog.textContent.includes('Stale collection'), false);
        assert.ok(dialog.textContent.includes('Later collection'));
    } finally { await env.close(); }
});

test('Free accounts cannot choose a file for private upload', async () => {
    const { env, writes } = await mountUploader(false);
    try {
        await click(env, env.current.collection.upload);
        const picker = env.node.querySelector('[role="dialog"]');
        await click(env, env.current.collection.private, picker);
        const target = [...picker.querySelectorAll('button[aria-pressed]')]
            .find(button => button.textContent.includes(env.current.collection.creationsPrivate));
        await React.act(() => target.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
        const choose = [...picker.querySelectorAll('button')].find(button => button.textContent === env.current.collection.chooseImage);
        assert.equal(choose.disabled, true);
        assert.equal(writes.length, 0);
    } finally { await env.close(); }
});
