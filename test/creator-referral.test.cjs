const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const initial = new JSDOM('<div></div>');
global.window = initial.window; global.document = initial.window.document;
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export * from './src/components/CreatorReferralTracker'; export * from './src/utils/creatorReferral';
        export * from './src/pages/figure/CreatorCodeSettings'; export { default as en } from './src/constants/locales/en';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'],
    plugins: [{ name: 'referral-boundaries', setup(build) {
        build.onResolve({ filter: /^react-router-dom$|\/hooks\/useAuthSession$|\/utils\/(api|authSession)$/ }, args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

const receipt = code => ({ code, token: `signed-${code}`, expires_at: new Date(Date.now() + 86400000).toISOString() });
async function fixture(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://entropydrop.example.test/figure/3dprint' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const requests = [], listeners = new Set();
    let search = options.search || '', session = options.session || null;
    const records = [];
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, window: dom.window, document, localStorage: dom.window.localStorage, URLSearchParams, Event: dom.window.Event, AbortController,
        require(name) {
            if (name === 'react-router-dom') return { useLocation: () => ({ search }) };
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                const body = init.body ? JSON.parse(init.body) : null;
                if (url.endsWith('/visit')) {
                    if (options.pending?.[body.code]) await options.pending[body.code];
                    return { ok: body.code !== 'INVALID', json: async () => receipt(body.code) };
                }
                if (url === '/api/creators/manage') return { ok: true, json: async () => [...records] };
                if (url.startsWith('/api/creators/manage/')) {
                    const record = { ...body, code: url.split('/').at(-1), version: (body.expected_version || 0) + 1,
                        attributed_orders: 0, acquired_users: 0, paid_sales: 0, pending_commission: 0, eligible_commission: 0 };
                    records.splice(0, records.length, record);
                    return { ok: true, json: async () => record };
                }
                return { ok: true, json: async () => ({ saved: true }) };
            } };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const current = module.exports.en;
    const render = () => React.act(async () => root.render(React.createElement(options.admin ? module.exports.CreatorCodeSettings : module.exports.CreatorReferralTracker, { current })));
    try {
        await render();
        await check({ ...module.exports, current, requests, node: document.getElementById('root'), storage: dom.window.localStorage,
            navigate: async value => { search = value; await render(); },
            login: async () => { await React.act(async () => { session = 'user'; listeners.forEach(listener => listener()); }); },
            click: text => React.act(async () => { const button = [...document.querySelectorAll('button')].find(element => element.textContent === text); assert.ok(button); button.click(); }),
            field: (label, value) => React.act(async () => {
                const field = [...document.querySelectorAll('label')].find(element => element.textContent === label)?.querySelector('input');
                assert.ok(field, label);
                Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(field, value);
                field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            }),
        });
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

test('referral links survive redirects and bind their receipt on login without exposing credentials to visits', async () => fixture({ search: '?id=skin&ref=alpha' }, async e => {
    assert.equal(e.readReferralReceipt().code, 'ALPHA');
    assert.equal(e.requests[0].auth, 'none'); assert.equal(e.requests[0].credentials, 'omit');
    assert.deepEqual(JSON.parse(JSON.stringify(e.googleLoginPayload('google'))), { token: 'google', referral_token: 'signed-ALPHA' });
    await e.navigate(''); await e.login();
    assert.equal(e.readReferralReceipt(), null);
    assert.equal(e.requests.filter(request => request.url.endsWith('/visit')).length, 1);
    assert.equal(JSON.parse(e.requests.find(request => request.url.endsWith('/referral')).body).token, 'signed-ALPHA');
}));

test('expired receipts and ambiguous link parameters never become a login referral', async () => fixture({ search: '?ref=ALPHA&ref=BETA' }, async e => {
    e.storage.setItem('creator_referral', JSON.stringify({ ...receipt('ALPHA'), expires_at: '2020-01-01T00:00:00Z' }));
    assert.equal(e.readReferralReceipt(), null);
    assert.equal(e.googleLoginPayload('google').referral_token, undefined);
    assert.equal(e.requests.length, 0);
}));

test('late referral lookups cannot overwrite a newer creator link', async () => {
    let resolve;
    const pending = { ALPHA: new Promise(done => { resolve = done; }) };
    await fixture({ search: '?ref=ALPHA', pending }, async e => {
        await e.navigate('?ref=BETA');
        await React.act(async () => resolve());
        assert.equal(e.readReferralReceipt().code, 'BETA');
        assert.equal(e.requests[0].signal.aborted, true);
        await e.navigate('?ref=INVALID');
        assert.equal(e.readReferralReceipt().code, 'BETA');
    });
});

test('creator management saves explicit rates, generates a link, and edits with a version check', async () => fixture({ admin: true, session: 'admin' }, async e => {
    const t = e.current.creatorCodes;
    await e.field(t.label, 'alpha'); await e.field(t.creatorEmail, 'creator@example.test');
    await e.field(`${t.discountRate} (%)`, '10'); await e.field(`${t.commissionRate} (%)`, '12.5');
    await e.click(t.save);
    const write = e.requests.find(request => request.method === 'PUT');
    assert.ok(write);
    assert.deepEqual(JSON.parse(write.body), { creator_email: 'creator@example.test', discount_bps: 1000, commission_bps: 1250, active: true, expires_at: null });
    assert.ok(document.querySelector('input[readonly]').value.endsWith('/figure/3dprint?ref=ALPHA'));
    await e.click(e.current.nav.edit);
    await e.field(`${t.discountRate} (%)`, '5'); await e.click(t.save);
    assert.equal(JSON.parse(e.requests.filter(request => request.method === 'PUT').at(-1).body).expected_version, 1);
}));
