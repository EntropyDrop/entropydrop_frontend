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
        build.onResolve({ filter: /^(?:@iconify\/react|framer-motion)$|\/components\/(?:SEO|Skin2DImg|MCModal|LoadingPlaceholder|CollectionUploadPicker)$/ },
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

async function mount(fetch, { userId = 42, width = 1920 } = {}) {
    const dom = new JSDOM('<div id="root"></div>', {
        url: `https://app.example.test/skin/collection/${userId}`,
    });
    const { window } = dom;
    window.innerWidth = width;
    window.localStorage.setItem('token', 'existing-token');
    const module = { exports: {} };
    const visuals = {
        Icon: ({ icon }) => React.createElement('svg', { 'data-icon': icon }),
        AnimatePresence: ({ children }) => children,
        SEO: () => null, Skin2DImg: () => null, MCModal: () => null,
        LoadingPlaceholder: () => null, CollectionUploadPicker: () => null,
    };
    const context = vm.createContext({
        window, localStorage: window.localStorage, document: window.document,
        fetch, Headers, Response, AbortController, DOMException, atob, console,
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
        { initialEntries: [`/skin/collection/${userId}`] },
        React.createElement(Navigation),
        React.createElement(Routes, null,
            React.createElement(Route, { path: '/skin/collection/:userId',
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
