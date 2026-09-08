const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const root = path.resolve(__dirname, '..');

function compile(entry, base = 'https://api.example.test/skin') {
    return buildSync({ entryPoints: [path.join(root, entry)], bundle: true, write: false,
        platform: 'node', format: 'cjs', external: ['react'],
        define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(base) },
    }).outputFiles[0].text;
}

function environment(fetch, token = 'existing-token') {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/skin/generate' });
    const { window } = dom;
    if (token) window.localStorage.setItem('token', token);
    window.localStorage.setItem('isAuto', 'false');
    window.fetch = fetch;
    const events = [], alerts = [];
    for (const name of ['logout', 'auth-token-updated', 'global-error']) window.addEventListener(name, () => events.push(name));
    const module = { exports: {} };
    const context = vm.createContext({ window, localStorage: window.localStorage, navigator: window.navigator,
        alert: message => alerts.push(message), fetch: (...args) => window.fetch(...args), URL, Request, Response, Headers, AbortController, DOMException,
        Event: window.Event, CustomEvent: window.CustomEvent, atob, console, require, module, exports: module.exports });
    return { dom, window, events, alerts, context, load(entry, base) {
        vm.runInContext(compile(entry, base), context);
        return context.module.exports;
    } };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

for (const failure of [503, 'network', 'malformed']) {
    test(`temporary refresh failure ${failure} preserves the session`, async () => {
        const env = environment(async input => {
            if (String(input).includes('/auth/refresh')) {
                if (failure === 'network') throw new TypeError('offline');
                return json({}, failure === 'malformed' ? 200 : failure);
            }
            return json({}, 401);
        });
        env.load('src/utils/fetchInterceptor.ts');
        const result = await env.window.fetch('https://api.example.test/skin/api/users/me');
        assert.equal(result.status, 503);
        assert.equal(env.window.localStorage.getItem('token'), 'existing-token');
        assert.equal(env.events.includes('logout'), false);
        assert.equal(env.alerts.length, 0);
        assert.equal(env.events.includes('global-error'), true);
        env.dom.window.close();
    });
}

test('explicit refresh rejection expires the session once', async () => {
    const env = environment(async () => json({}, 401));
    env.load('src/utils/fetchInterceptor.ts');
    await env.window.fetch('https://api.example.test/skin/api/users/me');
    assert.equal(env.window.localStorage.getItem('token'), null);
    assert.equal(env.events.filter(e => e === 'logout').length, 1);
    assert.equal(env.alerts.length, 1);
    env.dom.window.close();
});

test('concurrent 401 requests share refresh and retain POST bodies', async () => {
    let refreshes = 0;
    const retriedBodies = [];
    const env = environment(async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('/auth/refresh')) {
            refreshes++;
            await new Promise(resolve => setTimeout(resolve, 10));
            return json({ access_token: 'new-token' });
        }
        const headers = input instanceof Request ? input.headers : new Headers(init.headers);
        if (headers.get('Authorization') !== 'Bearer new-token') return json({}, 401);
        retriedBodies.push(input instanceof Request ? await input.text() : init.body);
        return json({ ok: true });
    });
    env.load('src/utils/fetchInterceptor.ts');
    const url = 'https://api.example.test/skin/api/submit';
    const results = await Promise.all([
        env.window.fetch(new Request(url, { method: 'POST', body: 'first' })),
        env.window.fetch(url, { method: 'POST', body: 'second' }),
    ]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    assert.equal(refreshes, 1);
    assert.deepEqual(retriedBodies.sort(), ['first', 'second']);
    env.dom.window.close();
});

test('API defaults and normalization always include the site mount', () => {
    const env = environment(async () => json({}));
    const { API_BASE_URL, normalizeApiBase } = env.load('src/utils/apiConfig.ts', '');
    assert.equal(API_BASE_URL, 'http://localhost:8000/skin');
    assert.equal(normalizeApiBase('https://api.example.test/'), 'https://api.example.test/skin');
    assert.equal(normalizeApiBase('https://api.example.test/skin/'), 'https://api.example.test/skin');
    env.dom.window.close();
});

test('an earlier account response cannot populate the next account page', async () => {
    let resolveResponse;
    const env = environment(() => new Promise(resolve => { resolveResponse = resolve; }));
    const { apiFetch } = env.load('src/utils/api.ts');
    const pending = apiFetch('/api/users/me');
    env.window.localStorage.setItem('token', 'another-account');
    resolveResponse(json({ id: 'previous-account', credits: 100 }));
    await assert.rejects(pending, { name: 'AbortError' });
    env.dom.window.close();
});

test('mounted React consumers observe login, account changes and logout without reloading', async () => {
    const env = environment(async () => json({}), null);
    const oldWindow = global.window, oldDocument = global.document;
    global.window = env.window;
    global.document = env.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const { useAuthSession } = env.load('src/hooks/useAuthSession.ts');
    let effects = 0;
    function Consumer() {
        const session = useAuthSession();
        React.useEffect(() => { effects++; }, [session]);
        return React.createElement('span', null, session || 'anonymous');
    }
    const node = env.window.document.getElementById('root');
    const reactRoot = createRoot(node);
    const token = (sub, exp) => `header.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`;
    try {
        await React.act(() => reactRoot.render(React.createElement(Consumer)));
        assert.equal(node.textContent, 'anonymous');
        await React.act(() => {
            env.window.localStorage.setItem('token', token('user-a', 1));
            env.window.dispatchEvent(new env.window.Event('auth-token-updated'));
        });
        assert.equal(node.textContent, 'user-a');
        const effectsBeforeRefresh = effects;
        await React.act(() => {
            env.window.localStorage.setItem('token', token('user-a', 2));
            env.window.dispatchEvent(new env.window.Event('auth-token-updated'));
        });
        assert.equal(effects, effectsBeforeRefresh);
        await React.act(() => {
            env.window.localStorage.setItem('token', token('user-b', 2));
            env.window.dispatchEvent(new env.window.StorageEvent('storage', { key: 'token' }));
        });
        assert.equal(node.textContent, 'user-b');
        await React.act(() => {
            env.window.localStorage.removeItem('token');
            env.window.dispatchEvent(new env.window.Event('logout'));
        });
        assert.equal(node.textContent, 'anonymous');
    } finally {
        await React.act(() => reactRoot.unmount());
        global.window = oldWindow;
        global.document = oldDocument;
        delete global.IS_REACT_ACT_ENVIRONMENT;
        env.dom.window.close();
    }
});
