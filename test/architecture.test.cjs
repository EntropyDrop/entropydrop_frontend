const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter, Routes, Route, useNavigate, useLocation } = require('react-router-dom');
const projectRoot = path.resolve(__dirname, '..');
const visualNames = new Set(['MCModal', 'DiscoveryBackground', 'DiscoverySearch', 'Skin2DImg', 'SEO', 'UserMenu', 'ErrorModal', 'LoadingPlaceholder', 'CreatePostForm', 'PostDetailView', 'AddVideoForm']);
const compiled = build({
    stdin: { contents: `
        export { apiFetch, apiJson, apiResponseJson } from './src/utils/api';
        export { request } from './src/utils/httpClient';
        export { bootstrapAuthSession } from './src/utils/authClient';
        export { SharedRequestCache } from './src/utils/sharedRequestCache';
        export { useCurrentUser } from './src/hooks/useCurrentUser';
        export { useDiscoverySearch } from './src/pages/discovery/useDiscoverySearch';
        export { useSkinDetails } from './src/components/mcmodal/useSkinDetails';
        export { useForumData } from './src/pages/figure/useForumData';
        export { useSkinLicensePolicy } from './src/hooks/useSkinLicensePolicy';
        export { DiscoveryPage } from './src/pages/DiscoveryPage';
        export { FigurePage } from './src/pages/FigurePage';
        export { Layout } from './src/components/Layout';
        export { default as current } from './src/constants/locales/en';
    `, resolveDir: projectRoot, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'react-dom'],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
    plugins: [{ name: 'architecture-visual-boundaries', setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
            const name = args.path === '@iconify/react' ? 'Icon' : args.path.split('/').at(-1);
            if (name === 'Icon' || visualNames.has(name)) return { path: `architecture-visual:${name}`, external: true };
        });
    } }],
}).then(result => result.outputFiles[0].text);
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { resolve, promise }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function skin(id) { return { id, result: `${id}.png`, prompt: '', is_public: true, name: id, creator: { id: 'user', username: 'user' } }; }
function post(id) { return { id, title: id, category: 'discussions', comments: [] }; }
async function setup(fetch = async () => json({}), token = 'user') {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/skin/', pretendToBeVisual: true });
    const { window } = dom;
    if (token) window.localStorage.setItem('token', token);
    const loads = [], events = [], errors = [];
    window.localStorage.setItem('isAuto', 'false');
    window.addEventListener('global-error', event => events.push(event.detail));
    window.fetch = fetch;
    const originalFetch = window.fetch;
    const module = { exports: {} };
    const requireModule = name => {
        if (!name.startsWith('architecture-visual:')) return require(name);
        const component = name.split(':')[1]; loads.push(component);
        if (component === 'Icon') return { Icon: ({ icon }) => React.createElement('svg', { 'data-icon': icon }) };
        if (component === 'DiscoveryBackground') return { DiscoveryBackground: ({ onSelect }) => React.createElement('button', { 'data-pick': true, onClick: () => onSelect(skin('picked')) }, 'pick skin') };
        if (component === 'MCModal') return { MCModal: ({ item, closeModal, onItemSelect }) => React.createElement('div', { 'data-modal': item.id },
            item.result, React.createElement('button', { onClick: closeModal }, 'close skin'),
            React.createElement('button', { onClick: () => onItemSelect('next') }, 'next skin')) };
        if (component === 'CreatePostForm') return { CreatePostForm: () => React.createElement('div', null, 'editor loaded') };
        return { [component]: () => null };
    };
    vm.runInNewContext(await compiled, { module, exports: module.exports, require: requireModule,
        window, document: window.document, localStorage: window.localStorage, navigator: window.navigator,
        fetch: (...args) => window.fetch(...args), URL, URLSearchParams, Request, Response, Headers, FormData, Blob, AbortController, DOMException,
        atob, Event: window.Event, CustomEvent: window.CustomEvent, alert() {}, setTimeout, clearTimeout,
        console: { ...console, error: (...args) => errors.push(args) },
    });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window; global.document = window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(window.document.getElementById('root'));
    return { ...module.exports, window, root, node: window.document.getElementById('root'), events, errors, loads, originalFetch,
        render: element => React.act(() => root.render(element)),
        async close() { await React.act(() => root.unmount()); global.window = previous.window; global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act; window.close(); },
    };
}
async function click(env, text) {
    const button = [...env.node.querySelectorAll('button')].find(node => node.textContent === text);
    assert.ok(button, `button ${text}`);
    await React.act(() => button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })));
}

test('request client leaves native fetch unchanged and adds credentials only to backend API calls', async () => {
    const calls = [];
    const env = await setup(async (url, options) => { calls.push({ url, options }); return json({}); });
    try {
        assert.strictEqual(env.window.fetch, env.originalFetch);
        await env.request('https://cdn.example.test/skin.png');
        await env.request('https://api.example.test/api/logs/a');
        assert.equal(calls[0].options.headers.has('Authorization'), false);
        assert.equal(calls[0].options.credentials, undefined);
        assert.equal(calls[1].options.headers.get('Authorization'), 'Bearer user');
        assert.equal(calls[1].options.credentials, 'include');
    } finally { await env.close(); }
});

test('profile consumers share a request; cancelling one lease leaves the other request alive', async () => {
    const work = deferred(); let calls = 0, signal;
    const env = await setup((url, options) => { calls++; signal = options.signal; return work.promise; });
    try {
        const controller = new AbortController();
        const first = env.apiFetch('/api/users/me', { signal: controller.signal });
        const second = env.apiFetch('/api/users/me');
        await new Promise(resolve => setImmediate(resolve));
        const cancelled = assert.rejects(first, { name: 'AbortError' });
        controller.abort(); await cancelled;
        assert.equal(calls, 1); assert.equal(signal.aborted, false);
        work.resolve(json({ id: 'user' }));
        assert.equal((await (await second).json()).id, 'user');
        assert.equal((await (await env.apiFetch('/api/users/me')).json()).id, 'user');
        assert.equal(calls, 1);
    } finally { await env.close(); }
});

test('all leases cancelled abort the network and the next request retries', async () => {
    const work = deferred(); let calls = 0, signal;
    const env = await setup((url, options) => { calls++; signal = options.signal; return calls === 1 ? work.promise : json({ id: 'retry' }); });
    try {
        const controller = new AbortController();
        const pending = env.apiFetch('/api/users/me', { signal: controller.signal });
        await new Promise(resolve => setImmediate(resolve));
        const cancelled = assert.rejects(pending, { name: 'AbortError' }); controller.abort(); await cancelled;
        await Promise.resolve(); assert.equal(signal.aborted, true);
        assert.equal((await (await env.apiFetch('/api/users/me')).json()).id, 'retry');
        work.resolve(json({ id: 'stale' })); await new Promise(resolve => setImmediate(resolve));
        assert.equal((await (await env.apiFetch('/api/users/me')).json()).id, 'retry'); assert.equal(calls, 2);
    } finally { await env.close(); }
});

test('mutations and profile update events invalidate cached reads', async () => {
    let reads = 0;
    const env = await setup(async (url, options) => json({ id: options.method === 'POST' ? 'write' : `read-${++reads}` }));
    try {
        await env.apiFetch('/api/users/me'); await env.apiFetch('/api/users/me'); assert.equal(reads, 1);
        await env.apiFetch('/api/users/me/minecraft_skin', { method: 'POST', body: '{}' });
        await env.apiFetch('/api/users/me'); assert.equal(reads, 2);
        env.window.dispatchEvent(new env.window.Event('user-updated'));
        await env.apiFetch('/api/users/me'); assert.equal(reads, 3);
        await env.apiFetch('/api/users/me', { cache: 'no-store' }); assert.equal(reads, 4);
    } finally { await env.close(); }
});

test('temporary or rejected query responses are not cached', async () => {
    let reads = 0;
    const env = await setup(async () => json({ id: 'recovered' }, ++reads === 1 ? 503 : 200));
    try {
        assert.equal((await env.apiFetch('/api/users/me', { skipGlobalError: true })).status, 503);
        assert.equal((await (await env.apiFetch('/api/users/me')).json()).id, 'recovered'); assert.equal(reads, 2);
    } finally { await env.close(); }
});

test('JSON parsing cannot commit an earlier account body', async () => {
    const body = deferred();
    const env = await setup(async () => ({ ok: true, status: 200, json: () => body.promise }));
    try {
        const pending = env.apiJson('/api/logs/a'); await new Promise(resolve => setImmediate(resolve));
        const rejected = assert.rejects(pending, { name: 'AbortError' });
        env.window.localStorage.setItem('token', 'new-user'); body.resolve({ private: true }); await rejected;
    } finally { await env.close(); }
});

test('shared query cache enforces entry limits, byte budget and expiry', async () => {
    const env = await setup();
    try {
        const cache = new env.SharedRequestCache(value => value);
        for (let i = 0; i < 33; i++) await cache.get(String(i), 10000, async () => 1);
        assert.equal(await cache.get('0', 10000, async () => 2), 2);
        await cache.get('huge', 10000, async () => 3 * 1024 * 1024);
        assert.equal(await cache.get('huge', 10000, async () => 4), 4);
        await cache.get('expired', -1, async () => 1);
        assert.equal(await cache.get('expired', 10000, async () => 2), 2);
    } finally { await env.close(); }
});

test('mounted current-user hooks reuse profile data and clear it on account change and logout', async () => {
    let reads = 0;
    const env = await setup(async (url, options) => { reads++; return json({ id: options.headers.get('Authorization').slice(7), username: 'loaded' }); });
    let first, second;
    function Consumer({ index }) { const state = env.useCurrentUser(); if (index === 1) first = state; else second = state;
        return React.createElement('span', null, state.user?.id || 'anonymous'); }
    try {
        await env.render(React.createElement(React.StrictMode, null, React.createElement(Consumer, { index: 1 }), React.createElement(Consumer, { index: 2 })));
        assert.equal(reads, 1); assert.equal(first.user.id, 'user'); assert.equal(second.user.id, 'user');
        await React.act(() => first.refresh(true));
        assert.equal(reads, 2); assert.equal(second.user.id, 'user');
        await React.act(() => { env.window.localStorage.setItem('token', 'other-user'); env.window.dispatchEvent(new env.window.Event('auth-token-updated')); });
        assert.equal(reads, 3); assert.equal(first.user.id, 'other-user');
        await React.act(() => { env.window.localStorage.removeItem('token'); env.window.dispatchEvent(new env.window.Event('logout')); });
        assert.equal(first.user, null); assert.equal(second.user, null); assert.equal(env.node.textContent, 'anonymousanonymous');
    } finally { await env.close(); }
});

test('Discovery selection uses one modal, preserves URL parameters and follows back/forward', async () => {
    const env = await setup(async url => String(url).includes('/search') ? json({ items: [skin('one')], total: 1 }) : json(skin('seed')));
    let navigate, location;
    function Probe() { navigate = useNavigate(); location = useLocation(); return null; }
    const layoutProps = { current: env.current, lang: 'en', setLang() {}, isAuto: true, setIsAuto() {} };
    try {
        await env.render(React.createElement(MemoryRouter, { initialEntries: ['/skin/?id=seed&keep=yes'] }, React.createElement(Probe),
            React.createElement(env.Layout, layoutProps, React.createElement(Routes, null,
                React.createElement(Route, { path: '/skin/', element: React.createElement(env.DiscoveryPage, { current: env.current }) }),
                React.createElement(Route, { path: '/other', element: React.createElement('div', null, 'other page') })))));
        assert.equal(env.node.querySelectorAll('[data-modal]').length, 1);
        assert.equal(env.node.querySelector('[data-modal]').dataset.modal, 'seed');
        await click(env, env.current.discovery.modeList);
        assert.equal(location.search, '?id=seed&keep=yes&view=list'); assert.equal(env.node.querySelectorAll('[data-modal]').length, 1);
        await click(env, 'next skin');
        assert.equal(env.node.querySelector('[data-modal]').dataset.modal, 'next'); assert.equal(env.node.querySelector('[data-modal]').textContent.includes('seed.png'), false);
        await React.act(() => navigate(-1)); assert.equal(env.node.querySelector('[data-modal]').dataset.modal, 'seed');
        await React.act(() => navigate(1)); assert.equal(env.node.querySelector('[data-modal]').dataset.modal, 'next');
        await click(env, 'close skin'); assert.equal(env.node.querySelector('[data-modal]'), null); assert.equal(location.search, '?keep=yes&view=list');
        await React.act(() => navigate('/other')); assert.equal(env.node.querySelector('[data-modal]'), null); assert.ok(env.node.textContent.includes('other page'));
    } finally { await env.close(); }
});

test('Discover ignores out-of-order search results and reuses criteria across views', async () => {
    const calls = []; let state;
    const env = await setup((url, options) => { const work = deferred(); calls.push({ url: new URL(url), options, work }); return work.promise; });
    function Consumer({ view }) { state = env.useDiscoverySearch(view, env.current); return null; }
    try {
        await env.render(React.createElement(Consumer, { view: '3d' })); assert.equal(calls.length, 0);
        await React.act(() => state.setQuery('older')); await React.act(() => state.handleSearch(1));
        await React.act(() => state.setQuery('newer')); await React.act(() => state.handleSearch(1));
        assert.equal(calls[0].options.signal.aborted, true);
        await React.act(() => calls[1].work.resolve(json({ items: [skin('new')], total: 1 })));
        await React.act(() => calls[0].work.resolve(json({ items: [skin('old')], total: 1 })));
        assert.equal(state.items[0].id, 'new'); assert.equal(state.isLoading, false);
        await env.render(React.createElement(Consumer, { view: 'list' }));
        assert.equal(state.query, 'newer'); assert.equal(state.items[0].id, 'new'); assert.equal(calls.length, 2);
    } finally { await env.close(); }
});

test('skin selection cancels detail ancestry and count requests together', async () => {
    const calls = []; let state;
    const env = await setup((url, options) => { const work = deferred(); calls.push({ url: String(url), options, work }); return work.promise; });
    function Consumer({ id }) { state = env.useSkinDetails(skin(id), `${id}.png`); return null; }
    try {
        await env.render(React.createElement(Consumer, { id: 'old', key: 'old' }));
        await React.act(() => calls[0].work.resolve(json({ ...skin('old'), parent: 'parent-old' })));
        assert.equal(calls.length, 4);
        await env.render(React.createElement(Consumer, { id: 'new', key: 'new' }));
        for (const call of calls.slice(0, 4)) assert.equal(call.options.signal.aborted, true);
        await React.act(() => calls[4].work.resolve(json(skin('new'))));
        await React.act(() => { for (const call of calls.slice(1, 4)) call.work.resolve(json({ ...skin('parent-old'), items: ['old'], total: 999 })); });
        assert.equal(state.item.id, 'new'); assert.equal(state.parentItem, null); assert.equal(state.relatedCollectionsCount, null);
    } finally { await env.close(); }
});

test('forum details and comments cannot overwrite a newer URL selection', async () => {
    const calls = []; let state;
    const env = await setup((url, options) => { const work = deferred(); calls.push({ url: String(url), options, work }); return work.promise; });
    function Consumer({ id }) { state = env.useForumData('discussions', '', 'latest', id); return null; }
    try {
        await env.render(React.createElement(Consumer, { id: 'old' }));
        assert.equal(calls.filter(call => call.url.includes('/comments?')).length, 1);
        await env.render(React.createElement(Consumer, { id: 'new' }));
        await React.act(() => { for (const call of calls.filter(call => call.url.includes('/posts/new'))) call.work.resolve(json(call.url.includes('/comments?') ? { comments: [{ id: 'new-comment' }], total: 1 } : post('new'))); });
        await React.act(() => { for (const call of calls.filter(call => call.url.includes('/posts/old'))) call.work.resolve(json(call.url.includes('/comments?') ? { comments: [{ id: 'old-comment' }], total: 1 } : post('old'))); });
        assert.equal(state.selectedPost.id, 'new'); assert.equal(state.comments[0].id, 'new-comment');
        await env.render(React.createElement(Consumer, { id: null })); assert.equal(state.selectedPost, null); assert.equal(state.comments.length, 0);
    } finally { await env.close(); }
});

test('forum loads the editor only when the publish form opens', async () => {
    const env = await setup(async url => String(url).includes('/api/users/me') ? json({ id: 'user' }) : json({ posts: [], total: 0 }));
    try {
        await env.render(React.createElement(MemoryRouter, { initialEntries: ['/figure/discussions'] }, React.createElement(Routes, null,
            React.createElement(Route, { path: '/figure/:category', element: React.createElement(env.FigurePage, { current: env.current }) }))));
        assert.equal(env.loads.includes('CreatePostForm'), false);
        assert.equal(env.loads.includes('PostDetailView'), false);
        await click(env, env.current.figureForum.publishPost);
        assert.equal(env.loads.includes('CreatePostForm'), true); assert.ok(env.node.textContent.includes('editor loaded'));
    } finally { await env.close(); }
});

test('license previews discard late source permissions and never enable saving on failures', async () => {
    const late = deferred();
    const env = await setup(async input => {
        const url = new URL(input);
        if (url.pathname === '/api/users/me') return json({ id: 'owner', is_pro: true });
        if (url.searchParams.get('parent') === 'old') return late.promise;
        if (url.searchParams.get('parent') === 'failed') return json({ detail: 'Denied' }, 403);
        return json({ code: 'cc-by-nc-4.0', is_pro: true, parent_is_private: false, public_license: 'cc-by-nc-4.0' });
    });
    function Preview({ parent }) {
        const policy = env.useSkinLicensePolicy({ operation: 'save', parentId: parent });
        return React.createElement('button', { disabled: !policy.ready }, policy.code);
    }
    try {
        await env.render(React.createElement(Preview, { parent: 'old' }));
        assert.equal(env.node.querySelector('button').disabled, true);
        await env.render(React.createElement(Preview, { parent: 'new' }));
        assert.equal(env.node.textContent, 'cc-by-nc-4.0');
        await React.act(() => late.resolve(json({ code: 'entropydrop-commercial-1.0', is_pro: true })));
        assert.equal(env.node.textContent, 'cc-by-nc-4.0');
        await env.render(React.createElement(Preview, { parent: 'failed' }));
        assert.equal(env.node.textContent, 'unavailable');
        assert.equal(env.node.querySelector('button').disabled, true);
    } finally { await env.close(); }
});


test('public data starts during session restoration while profile requests wait', async () => {
    const restoration = deferred(), gallery = deferred(); const calls = [];
    const env = await setup((url, options) => {
        calls.push({ url: String(url), options });
        if (String(url).includes('/auth/refresh')) return restoration.promise;
        if (String(url).includes('/api/discovery')) return gallery.promise;
        return Promise.resolve(json({ id: 'restored-user' }));
    }, null);
    try {
        const startup = env.bootstrapAuthSession();
        const publicData = env.apiFetch('/api/discovery', { auth: 'none' });
        const privateData = env.apiJson('/api/users/me', { auth: 'required' });
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/api/auth/refresh', '/api/discovery']);
        restoration.resolve(json({ access_token: 'restored-user' })); await startup;
        gallery.resolve(json([skin('public')]));
        assert.equal((await (await publicData).json())[0].id, 'public');
        assert.equal((await privateData).id, 'restored-user');
        assert.equal(calls.find(call => call.url.includes('/users/me')).options.headers.get('Authorization'), 'Bearer restored-user');
    } finally { await env.close(); }
});

test('a pending refresh cannot replace a newly selected account', async () => {
    const restoration = deferred();
    const env = await setup(() => restoration.promise);
    try {
        const startup = env.bootstrapAuthSession();
        env.window.localStorage.setItem('token', 'new-account');
        env.window.dispatchEvent(new env.window.Event('auth-token-updated'));
        restoration.resolve(json({ access_token: 'previous-account' })); await startup;
        assert.equal(env.window.localStorage.getItem('token'), 'new-account');
    } finally { await env.close(); }
});


test('logout closes Discover search and cancels its pending request', async () => {
    const work = deferred(); let state, signal;
    const env = await setup((url, options) => { signal = options.signal; return work.promise; });
    function Consumer() { state = env.useDiscoverySearch('3d', env.current); return null; }
    try {
        await env.render(React.createElement(Consumer));
        await React.act(() => state.setQuery('search')); await React.act(() => state.handleSearch(1));
        assert.equal(state.isOpen, true);
        await React.act(() => { env.window.localStorage.removeItem('token'); env.window.dispatchEvent(new env.window.Event('logout')); });
        assert.equal(state.isOpen, false); assert.equal(signal.aborted, true);
        work.resolve(json({ items: [skin('old')], total: 1 }));
        await React.act(async () => { await new Promise(resolve => setImmediate(resolve)); });
        assert.equal(state.items.length, 0); assert.equal(env.events.length, 0);
    } finally { await env.close(); }
});
