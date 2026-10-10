const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');

const compiled = build({
    stdin: { contents: `export { GeneratePage } from './src/pages/GeneratePage';
        export { default as current } from './src/constants/locales/en';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'history-deps'],
    plugins: [{ name: 'history-deps', setup(builder) {
        builder.onResolve({ filter: /^(?:@iconify\/react|framer-motion)$|\.\.\/(?:components\/|hooks\/|utils\/(?:api|httpClient|alert|date)$)/ },
            () => ({ path: 'history-deps', external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function historyResponse(prompt, status = 'success') {
    return new Response(JSON.stringify({ items: [{ id: prompt, prompt, name: prompt, status,
        mode: 'aigc_image_to_skin', result: '', timestamp: '2026-10-10', is_public: true }],
        page: 1, total_pages: 1 }));
}

async function mount() {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/skin/generate' });
    const { window } = dom;
    let session = 'user-one';
    const requests = [], timers = new Set();
    const passthrough = ({ children }) => children;
    const deps = {
        useAuthSession: () => session,
        useCurrentUser: () => ({ user: { id: session, is_pro: false }, refresh() {} }),
        useSkinLicensePolicy: () => ({ ready: true, code: 'cc-by-nc-4.0', key: session }),
        PageContainer: passthrough, GeneratedLicenseCard: () => null, SEO: () => null,
        Icon: () => null, LoadingSpinner: () => null, MCModal: () => null, ConfirmModal: () => null,
        AnimatePresence: passthrough, motion: { div: passthrough },
        formatDate: value => value, showError: message => { throw new Error(message); },
        apiResponseJson: response => response.json(),
        apiFetch: async (url, options) => {
            if (url.startsWith('/api/history?')) {
                return new Promise(resolve => requests.push({ url, signal: options.signal, resolve }));
            }
            assert.equal(url, '/api/models');
            return new Response('{}');
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, {
        module, exports: module.exports, require: name => name === 'history-deps' ? deps : require(name),
        window, document: window.document, localStorage: window.localStorage,
        URLSearchParams, AbortController, console,
        setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
        setTimeout, clearTimeout,
    });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window; global.document = window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = createRoot(node);
    const render = () => root.render(React.createElement(MemoryRouter, null,
        React.createElement(module.exports.GeneratePage, { current: module.exports.current })));
    await React.act(render);
    return { node, requests, timers,
        async changeSession(value) { session = value; await React.act(render); },
        async respond(index, response) { await React.act(async () => { requests[index].resolve(response); }); },
        async close() {
            await React.act(() => root.unmount());
            global.window = previous.window; global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act; window.close();
        },
    };
}

test('history updates do not retrigger fetching and polling stops when generation completes', async () => {
    const env = await mount();
    try {
        assert.equal(env.requests.length, 1);
        await env.respond(0, historyResponse('queued skin', 'pending'));
        assert.equal(env.requests.length, 1, 'State updates must not start a fetch loop');
        assert.equal(env.timers.size, 1);
        await React.act(() => { for (const tick of env.timers) tick(); });
        assert.equal(env.requests.length, 2);
        await env.respond(1, historyResponse('finished skin'));
        assert.ok(env.node.textContent.includes('finished skin'));
        assert.equal(env.timers.size, 0);
        assert.equal(env.requests.length, 2);
    } finally { await env.close(); }
});

test('switching accounts and unmounting cancel history requests, including late responses', async () => {
    const env = await mount();
    try {
        await env.changeSession('user-two');
        assert.equal(env.requests[0].signal.aborted, true);
        assert.equal(env.requests.length, 2);
        await env.respond(1, historyResponse('current account skin'));
        await env.respond(0, historyResponse('old account skin'));
        assert.ok(env.node.textContent.includes('current account skin'));
        assert.ok(!env.node.textContent.includes('old account skin'));
        await env.changeSession('user-three');
        assert.equal(env.requests[2].signal.aborted, false);
    } finally { await env.close(); }
    assert.equal(env.requests[2].signal.aborted, true);
});
