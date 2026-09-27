const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const root = path.resolve(__dirname, '..');

function compile(entry) {
    return buildSync({ entryPoints: [path.join(root, entry)], bundle: true, write: false,
        platform: 'node', format: 'cjs', jsx: 'automatic',
        external: ['react', 'react-dom', 'react-router-dom', '@react-oauth/google'],
        define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'https://api.example.test' }) },
    }).outputFiles[0].text;
}
const pageSource = compile('src/pages/SpaceAuthorizePage.tsx');
const localeSource = compile('src/constants/locales/en.ts');
const token = sub => `header.${Buffer.from(JSON.stringify({ sub, exp: 9999999999 })).toString('base64url')}.signature`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const pending = (email = 'owner@example.test') => ({ name: 'My coding agent', status: 'pending',
    account: { id: email, email }, expires_at: new Date(Date.now() + 600000).toISOString() });

async function mount(fetchImpl, account = 'owner') {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://site.example.test/space/authorize#code=ABCD-EFGH-JKLM' });
    const window = dom.window;
    if (account) window.localStorage.setItem('token', token(account));
    const previous = { window: global.window, document: global.document };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const calls = [];
    const module = { exports: {} };
    const context = vm.createContext({ window, document: window.document, localStorage: window.localStorage,
        navigator: window.navigator, URL, URLSearchParams, Request, Response, Headers, FormData, AbortController, DOMException,
        Event: window.Event, atob, console, require, module, exports: module.exports,
        fetch: async (url, options = {}) => {
            calls.push({ url: String(url), options });
            return fetchImpl(String(url), options);
        } });
    vm.runInContext(localeSource, context);
    const current = context.module.exports.default;
    vm.runInContext(pageSource, context);
    const Page = context.module.exports.SpaceAuthorizePage;
    const node = window.document.getElementById('root');
    const reactRoot = createRoot(node);
    await React.act(async () => reactRoot.render(React.createElement(MemoryRouter,
        { initialEntries: ['/space/authorize#code=ABCD-EFGH-JKLM'] }, React.createElement(Page, { current }))));
    return { node, window, calls,
        async click(label) {
            const button = [...node.querySelectorAll('button')].find(button => button.textContent === label);
            assert.ok(button, label);
            await React.act(async () => button.click());
        },
        async account(sub) {
            await React.act(async () => {
                if (sub) window.localStorage.setItem('token', token(sub));
                else window.localStorage.removeItem('token');
                window.dispatchEvent(new window.Event('auth-token-updated'));
            });
        },
        async close() {
            await React.act(async () => reactRoot.unmount());
            global.window = previous.window;
            global.document = previous.document;
            delete global.IS_REACT_ACT_ENVIRONMENT;
            dom.window.close();
        },
    };
}

test('consent shows account and pairing code and requires an explicit approval click', async () => {
    const env = await mount(async url => json(url.endsWith('/decision') ? { status: 'approved' } : pending()));
    try {
        assert.match(env.node.textContent, /owner@example.test/);
        assert.match(env.node.textContent, /ABCD-EFGH-JKLM/);
        assert.match(env.node.textContent, /Full Space access/);
        assert.equal(env.calls.filter(call => call.url.endsWith('/decision')).length, 0);
        await env.click('Authorize agent');
        const decision = env.calls.find(call => call.url.endsWith('/decision'));
        assert.deepEqual(JSON.parse(decision.options.body), { user_code: 'ABCD-EFGH-JKLM', approve: true });
        assert.equal(decision.options.headers.get('Authorization'), 'Bearer ' + token('owner'));
        assert.match(env.node.textContent, /Connection approved/);
        assert.doesNotMatch(env.node.textContent, /edapi_/);
        assert.equal(env.calls.some(call => call.url.endsWith('/token')), false);
    } finally { await env.close(); }
});

test('deny sends a refusal and shows the terminal state', async () => {
    const env = await mount(async url => json(url.endsWith('/decision') ? { status: 'denied' } : pending()));
    try {
        await env.click('Deny');
        assert.equal(JSON.parse(env.calls.at(-1).options.body).approve, false);
        assert.match(env.node.textContent, /Connection denied/);
        assert.equal([...env.node.querySelectorAll('button')].some(b => b.textContent === 'Authorize agent'), false);
    } finally { await env.close(); }
});

test('an expired request cannot be approved', async () => {
    const env = await mount(async () => json({ ...pending(), expires_at: new Date(Date.now() - 1000).toISOString() }));
    try {
        assert.match(env.node.textContent, /expired or is invalid/);
        const approve = [...env.node.querySelectorAll('button')].find(b => b.textContent === 'Authorize agent');
        assert.equal(approve.disabled, true);
        await env.click('Authorize agent');
        assert.equal(env.calls.length, 1);
    } finally { await env.close(); }
});

test('sign-in preserves the code without automatically approving', async () => {
    const env = await mount(async url => url.endsWith('/inspect') ? json(pending()) : json({}, 503), null);
    try {
        assert.match(env.node.textContent, /Sign in to review this connection/);
        assert.equal(env.calls.some(call => call.url.endsWith('/inspect')), false);
        await env.account('owner');
        assert.match(env.node.textContent, /owner@example.test/);
        assert.match(env.node.textContent, /ABCD-EFGH-JKLM/);
        assert.equal(env.calls.some(call => call.url.endsWith('/decision')), false);
    } finally { await env.close(); }
});

test('an old account response cannot populate the next account consent page', async () => {
    let finishOld;
    let count = 0;
    const env = await mount(async () => ++count === 1 ? new Promise(resolve => { finishOld = resolve; }) : json(pending('new@example.test')));
    try {
        await env.account('new-owner');
        await React.act(async () => finishOld(json(pending('old@example.test'))));
        assert.match(env.node.textContent, /new@example.test/);
        assert.doesNotMatch(env.node.textContent, /old@example.test/);
        await env.account(null);
        assert.doesNotMatch(env.node.textContent, /new@example.test/);
    } finally { await env.close(); }
});

test('an expired server response shows recovery instructions and no approve button', async () => {
    const env = await mount(async () => json({ detail: { code: 'AGENT_AUTHORIZATION_EXPIRED' } }, 410));
    try {
        assert.match(env.node.textContent, /Ask your agent to start a new connection/);
        assert.equal([...env.node.querySelectorAll('button')].some(b => b.textContent === 'Authorize agent'), false);
    } finally { await env.close(); }
});
