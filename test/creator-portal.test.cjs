const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const domInit = new JSDOM('<div></div>');
global.window = domInit.window; global.document = domInit.window.document;
const React = require('react');
const { createRoot } = require('react-dom/client');
const compiled = build({ stdin: { contents: `export * from './src/pages/CreatorPage'; export * from './src/pages/creator/CreatorPayoutAdmin'; export { default as en } from './src/constants/locales/en';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'],
    plugins: [{ name: 'portal-boundaries', setup(build) { build.onResolve({ filter: /\/hooks\/(useCurrentUser|useAuthSession)$|\/utils\/(api|authSession)$/ }, args => ({ path: args.path, external: true })); } }],
}).then(result => result.outputFiles[0].text);
const record = { id: 'payout-1', amount_cents: 1200, currency: 'USD', payout_email: 'receiver@example.test', creator_email: 'creator@example.test', status: 'pending_review', created_at: '2026-01-01', updated_at: '2026-01-01', events: [] };
const page = (items, number = 1, total = 21) => ({ items, page: number, page_size: 20, total, total_pages: Math.ceil(total / 20) });
async function fixture(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/creator' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    let session = 'creator-a', creator = options.creator !== false;
    const listeners = new Set(), requests = [];
    let posted = 0;
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, window: dom.window, document: dom.window.document, AbortController,
        crypto: require('node:crypto').webcrypto, require(name) {
            if (name.endsWith('/hooks/useCurrentUser')) return { useCurrentUser: () => ({ user: session ? { id: session, email: 'creator@example.test', is_creator: creator } : null }) };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                if (options.pending && url.includes('/me/users')) await options.pending;
                const ok = data => ({ ok: true, json: async () => data });
                if (url === '/api/creators/me') return ok({ balance: { available_cents: 2500, pending_cents: 500, reserved_cents: 0, paid_cents: 1000, adjustment_cents: 0 }, codes: [{ code: 'ALPHA', active: true, usable: true, discount_percent: 10, commission_percent: 15 }] });
                if (url.includes('/me/users')) return ok(page([{ reference: url.includes('page=2') ? 'USER-SECOND' : 'USER-FIRST', email: 'a***@g***', code: 'ALPHA', referred_at: '2026-01-01' }], url.includes('page=2') ? 2 : 1));
                if (url.includes('/me/orders')) return ok(page([{ reference: 'ORDER-MASKED', customer_reference: 'USER-FIRST', email: 'a***@g***', code: 'ALPHA', created_at: '2026-01-01', product_amount_cents: 9000, commission_cents: 1200, status: 'eligible' }], 1, 1));
                if (url.endsWith('/transfer')) return ok({ ...record, status: 'paid' });
                if (url.endsWith('/reject')) return ok({ ...record, status: 'rejected' });
                if (url.includes('/manage/payouts')) return ok(page([options.record || record], 1, 1));
                if (init.method === 'POST') { posted++; if (options.failFirst && posted === 1) throw new Error('Network uncertain'); return ok(record); }
                if (url.includes('/me/payouts')) return ok(page([record], 1, 1));
                throw new Error('Unexpected request: ' + url);
            } };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root')), current = module.exports.en;
    const render = () => React.act(async () => root.render(React.createElement(options.admin ? module.exports.CreatorPayoutAdmin : module.exports.CreatorPage, { current })));
    const click = async (text, scope = document) => React.act(async () => { const button = [...scope.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(button, text); button.click(); });
    const field = async (label, value) => React.act(async () => { const element = [...document.querySelectorAll('label')].find(node => node.textContent === label)?.querySelector('input,textarea'); assert.ok(element, label);
        const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    try { await render(); await check({ current, requests, click, field, logout: async () => React.act(async () => { session = null; listeners.forEach(fn => fn()); }) }); }
    finally { await React.act(() => root.unmount()); Object.assign(global, { window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: previous.act }); dom.window.close(); }
}

test('creator dashboard paginates masked users, orders and withdrawal history', async () => fixture({}, async e => {
    const t = e.current.creatorPortal;
    assert.ok(document.body.textContent.includes('$25.00'));
    assert.ok(document.body.textContent.includes('USER-FIRST'));
    await e.click(e.current.figureManagement.next);
    assert.ok(document.body.textContent.includes('USER-SECOND'));
    await e.click(t.orders);
    assert.ok(e.requests.some(r => r.url.includes('/me/orders?page=1')));
    assert.ok(document.body.textContent.includes('ORDER-MASKED'));
    await e.click(t.payouts);
    assert.ok(document.body.textContent.includes('receiver@example.test'));
}));

test('withdrawal confirms recipient and amount and reuses the request identity after uncertain response', async () => fixture({ failFirst: true }, async e => {
    const t = e.current.creatorPortal;
    assert.ok(document.body.textContent.includes('5 days') && document.body.textContent.includes('Stripe fee'));
    assert.equal(document.body.textContent.includes('PayPal'), false);
    await e.field(t.payoutEmail, 'receiver@example.test'); await e.field(t.amount, '12.00');
    await e.click(t.request);
    const confirm = document.querySelector('[role=dialog]').textContent;
    assert.ok(confirm.includes('$12.00 USD') && confirm.includes('receiver@example.test') && confirm.includes('Stripe fee'));
    assert.equal(e.requests.filter(r => r.method === 'POST').length, 0);
    await e.click(t.submitRequest);
    await e.click(t.request); await e.click(t.submitRequest);
    const posts = e.requests.filter(r => r.method === 'POST').map(r => JSON.parse(r.body));
    assert.equal(posts.length, 2); assert.equal(posts[0].request_key, posts[1].request_key);
    assert.equal(posts[0].amount_cents, 1200); assert.equal(posts[0].payout_email, 'receiver@example.test'); assert.equal('paypal_email' in posts[0], false);
}));

test('ordinary users cannot render or fetch the creator dashboard', async () => fixture({ creator: false }, async e => {
    assert.ok(document.body.textContent.includes(e.current.creatorPortal.restricted)); assert.equal(e.requests.length, 0);
}));

test('late account responses are aborted and cannot restore creator data after logout', async () => {
    let resolve; const pending = new Promise(done => { resolve = done; });
    await fixture({ pending }, async e => {
        await e.logout(); await React.act(async () => resolve());
        assert.equal(e.requests.find(r => r.url.includes('/me/users')).signal.aborted, true);
        assert.ok(!document.body.textContent.includes('USER-FIRST'));
    });
});

test('admin records a Stripe receipt with the fee taken out of the requested amount', async () => fixture({ admin: true }, async e => {
    const t = e.current.creatorPortal;
    assert.ok(document.body.textContent.includes(t.adminHint));
    await e.click(t.recordTransfer);
    const dialog = document.querySelector('[role=dialog]'); assert.ok(dialog.textContent.includes('$12.00 USD → receiver@example.test'));
    assert.equal(e.requests.filter(r => r.method === 'POST').length, 0);
    await e.field(t.transferReference, 'tr_1Abc23'); await e.field(t.feeAmount, '1.50');
    assert.ok(dialog.textContent.includes(`${t.creatorReceives}: $10.50 USD`));
    await e.click(t.recordTransfer, dialog);
    const post = e.requests.find(r => r.method === 'POST');
    assert.ok(post.url.endsWith('/api/creators/manage/payouts/payout-1/transfer'));
    assert.deepEqual(JSON.parse(post.body), { transfer_reference: 'tr_1Abc23', fee_cents: 150, note: '' });
}));

test('a fee that is not below the withdrawal amount or a malformed receipt is never submitted', async () => fixture({ admin: true }, async e => {
    const t = e.current.creatorPortal;
    await e.click(t.recordTransfer);
    const dialog = document.querySelector('[role=dialog]');
    await e.field(t.transferReference, 'tr_1Abc23'); await e.field(t.feeAmount, '12.00');
    assert.ok(dialog.textContent.includes(`${t.creatorReceives}: —`));
    await e.click(t.recordTransfer, dialog);
    assert.ok(dialog.textContent.includes(t.feeInvalid));
    await e.field(t.feeAmount, '1'); await e.field(t.transferReference, 'bad receipt');
    await e.click(t.recordTransfer, dialog);
    assert.ok(dialog.textContent.includes(t.referenceInvalid));
    assert.equal(e.requests.filter(r => r.method === 'POST').length, 0);
}));

test('admin rejection sends the reason to the reject endpoint', async () => fixture({ admin: true }, async e => {
    const t = e.current.creatorPortal;
    await e.click(t.reject);
    const dialog = document.querySelector('[role=dialog]');
    await e.field(t.reviewNote, 'Please verify your Stripe email');
    await e.click(t.reject, dialog);
    const post = e.requests.find(r => r.method === 'POST');
    assert.ok(post.url.endsWith('/api/creators/manage/payouts/payout-1/reject'));
    assert.deepEqual(JSON.parse(post.body), { note: 'Please verify your Stripe email' });
}));

test('payout cards show the fee, the amount received, the receipt and the processing deadline', async () => {
    const paid = { ...record, status: 'paid', fee_cents: 150, net_cents: 1050, transfer_reference: 'tr_1Abc23', paid_at: '2026-01-03T00:00:00Z' };
    await fixture({ admin: true, record: paid }, async e => {
        const t = e.current.creatorPortal, text = document.body.textContent;
        assert.ok(text.includes(`${t.fee}: $1.50`) && text.includes(`${t.netAmount}: $10.50`) && text.includes(`${t.transferReference}: tr_1Abc23`));
        assert.equal([...document.querySelectorAll('button')].some(button => button.textContent === t.recordTransfer), false);
    });
    await fixture({ admin: true, record: { ...record, due_at: '2026-01-06T00:00:00Z' } }, async e => {
        assert.ok(document.body.textContent.includes(e.current.creatorPortal.dueBy));
    });
});
