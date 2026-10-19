const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
// React detects input event support when react-dom loads.
const initialDOM = new JSDOM('<div></div>');
global.window = initialDOM.window; global.document = initialDOM.window.document;
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export * from './src/pages/FigureManagePage'; export * from './src/components/FigureOrderNotification'; export { default as en } from './src/constants/locales/en'; export { default as zh } from './src/constants/locales/zh-hans';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom'],
    plugins: [{ name: 'admin-boundaries', setup(build) {
        build.onResolve({ filter: /\/components\/(Skin2DImg|Skin3DModal)$|\/utils\/(api|authSession)$|\/hooks\/(useAuthSession|useCurrentUser)$/ }, args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function fixture(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    const requests = [], listeners = new Set();
    let session = 'admin';
    const server = { promotion: { discount_bps: 5000, version: 1 }, discountStatus: 200, status: 200, pending: null, catalogStatus: 200, saveStatus: 200, models: [{ id: 'cute-kit', model_type: 'Cute DIY Kit', product_name: 'CUTE-10cm', stock: 300, price: 40 }, { id: 'legacy-kit', model_type: 'PLA+sticker', product_name: null, stock: 10, price: 60 }], ...options };
    const order = { id: 'order-test', user_id: 'customer', total_price: 60, created_at: '2026-10-09T00:00:00Z', order_type: 'print', status: 'paid', goods_status: 'awaiting_review', figure_review_status: 'pending', items: [{ id: 'part', model_type: 'Cute DIY Kit', refer_log_id: 'skin-a', source_snapshot: { skin_id: 'skin-a', publisher_id: 'maker-a', license: 'cc-by-nc-4.0' } }], ...options.order };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, AbortController, document, Event: dom.window.Event, window: dom.window,
        require(name) {
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/hooks/useCurrentUser')) return { useCurrentUser: () => ({ user: { id: session, is_admin: options.admin !== false && !!session } }) };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                if (url === '/api/figure/models/discount') {
                    if (init.method === 'PATCH' && server.pending) await server.pending;
                    if (init.method === 'PATCH' && server.discountStatus === 200) {
                        const body = JSON.parse(init.body);
                        server.promotion = { discount_bps: body.discount_bps, version: server.promotion.version + 1 };
                    }
                    return { ok: server.discountStatus === 200, status: server.discountStatus, json: async () => ({ ...server.promotion }) };
                }
                if (url.startsWith('/api/figure/models')) {
                    if (init.method === 'PATCH' && server.pending) await server.pending;
                    const status = init.method === 'PATCH' ? server.saveStatus : server.catalogStatus;
                    let result = server.models;
                    if (init.method === 'PATCH' && status === 200) {
                        const { stock, price } = JSON.parse(init.body);
                        const model = server.models.find(model => url.endsWith('/' + model.id));
                        Object.assign(model, { stock, price });
                        result = { ...model };
                    }
                    return { ok: status === 200, status, json: async () => status === 200 ? structuredClone(result) : { detail: 'Rejected by server' } };
                }
                if (init.method === 'POST' && server.pending) await server.pending;
                return { ok: server.status === 200, status: server.status, json: async () => init.method === 'POST' ? { detail: 'Rejected by server' } : { items: [order], total: 1, total_pages: 1 } };
            } };
            if (name.endsWith('/components/Skin2DImg')) return { Skin2DImg: () => null };
            if (name.endsWith('/components/Skin3DModal')) return { Skin3DModal: () => null };
            if (name === 'react-router-dom') return { Link: ({ to, children, state, ...props }) => React.createElement('a', { href: to, ...props }, children) };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const { FigureManagePage, FigureOrderNotification, en } = module.exports;
    const current = module.exports[options.lang || 'en'];
    const button = label => Array.from(document.querySelectorAll('button')).find(el => el.textContent === label && !el.closest('[hidden]'));
    const click = el => React.act(async () => { assert.ok(el); el.click(); });
    const input = value => React.act(async () => {
        const el = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    try {
        await React.act(async () => root.render(React.createElement(FigureManagePage, { current })));
        await check({ server, requests, button, click, input, t: current.figureManagement, discount: current.figureDiscount,
            field: name => document.querySelector(`input[name="${name}"]`),
            edit: (name, value) => React.act(async () => {
                const el = document.querySelector(`input[name="${name}"]`);
                Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
                el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            }),
            logout: () => React.act(async () => { session = null; listeners.forEach(l => l()); }),
            renderNotice: n => React.act(async () => root.render(React.createElement(FigureOrderNotification, { current: en, notification: n }))),
        });
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

test('ordinary users cannot fetch the admin queue', async () => fixture({admin:false}, async e => {
    assert.equal(e.requests.length, 0);
    assert.ok(document.body.textContent.includes(e.t.restricted));
}));

test('paid unreviewed orders cannot start production and approval requires active confirmation', async () => fixture({}, async e => {
    assert.ok(document.body.textContent.includes('cc-by-nc-4.0'));
    assert.equal(e.button(e.t.start), undefined);
    await e.click(e.button(e.t.approve));
    assert.equal(e.button(e.t.confirm).disabled, true);
    await e.click(document.querySelector('input[type=checkbox]'));
    assert.equal(e.button(e.t.confirm).disabled, false);
    await e.click(e.button(e.t.confirm));
    const post=e.requests.find(r=>r.method==='POST');
    assert.deepEqual(JSON.parse(post.body), { decision: 'approve', reason: '' });
    assert.ok(post.url.endsWith('/review'));
}));

test('reject dialog explains the full refund and requires a reason without posting on cancel', async () => fixture({}, async e => {
    await e.click(e.button(e.t.reject));
    assert.ok(document.querySelector('dialog').textContent.includes(e.t.rejectHint));
    assert.equal(e.button(e.t.confirm).disabled, true);
    assert.equal(document.querySelector('textarea').required, true);
    await e.click(e.button(e.t.cancel));
    assert.equal(e.requests.some(r=>r.method==='POST'), false);
}));

test('approval request failure stays visible and does not imply success', async () => fixture({}, async e => {
    await e.click(e.button(e.t.approve));
    await e.click(document.querySelector('input[type=checkbox]'));
    e.server.status=409;
    await e.click(e.button(e.t.confirm));
    assert.ok(document.querySelector('dialog'));
    assert.ok(document.querySelector('[role=alert]').textContent.includes('Rejected by server'));
}));

test('double clicks submit once and logout cancels stale admin work', async () => fixture({}, async e => {
    let resolve; e.server.pending = new Promise(done=>{resolve=done});
    await e.click(e.button(e.t.approve));
    await e.click(document.querySelector('input[type=checkbox]'));
    const confirm=e.button(e.t.confirm);
    await React.act(async()=>{confirm.click();confirm.click()});
    assert.equal(e.requests.filter(r=>r.method==='POST').length,1);
    await e.logout();
    await React.act(async()=>resolve());
    assert.equal(document.querySelector('dialog'),null);
    assert.equal(e.requests.find(r=>r.method==='POST').signal.aborted,true);
}));

test('rejected orders only offer refund sync and mailbox text contains the reason', async () => fixture({order:{status:'refund_pending',figure_review_status:'rejected',goods_status:'rejected',figure_review_reason:'Missing source permission',refund_status:'pending'}},async e=>{
    assert.equal(e.button(e.t.approve),undefined);
    assert.equal(e.button(e.t.start),undefined);
    assert.ok(e.button(e.t.sync));
    assert.ok(document.body.textContent.includes('Missing source permission'));
    await e.renderNotice({type:'figure_rejected',orderId:'order-test',message:'Missing source permission'});
    assert.ok(document.body.textContent.includes(e.t.notifications.figure_rejected));
    assert.ok(document.body.textContent.includes('order-test'));
    assert.ok(document.body.textContent.includes('Missing source permission'));
}));


const savedSticker = require('./fixtures/order-sticker.json');
for (const complete of [true, false]) test(`approved orders ${complete ? 'open a durable production link' : 'block production when sticker fields are missing'}`, async () => fixture({
    order: { figure_review_status: 'approved', items: [{ id: 'kit-a', model_type: 'Cute DIY Kit', skin_url: '/private-order-copy.png', sticker_snapshot: { ...savedSticker, missing_fields: complete ? [] : ['publisher_name'] } }] },
}, async e => {
    const link = Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') === '/figure/3dprint?order=order-test&item=kit-a');
    assert.equal(!!link, complete);
    if (link) assert.equal(link.textContent, e.t.prepare);
    assert.ok(document.body.textContent.includes(savedSticker.skin_name));
    assert.ok(document.body.textContent.includes(savedSticker.publisher_name));
}));

for (const lang of ['en', 'zh']) test(`${lang}: model settings load all print models and save stock and USD price`, async () => fixture({ lang }, async e => {
    assert.equal(e.requests.some(r => r.url === '/api/figure/models'), false);
    await e.click(e.button(e.t.models.title));
    assert.ok(document.body.textContent.includes('CUTE-10cm'));
    assert.ok(document.body.textContent.includes('PLA+sticker'));
    assert.equal(document.querySelectorAll('form[aria-label]').length, 2);
    assert.equal(e.field('stock').value, '300');
    assert.equal(e.field('price').value, '40');
    assert.equal(e.button(e.t.models.save).disabled, true);
    await e.edit('stock', '0'); await e.edit('price', '45.25');
    await e.click(e.button(e.t.models.save));
    const patch = e.requests.find(r => r.method === 'PATCH');
    assert.equal(patch.url, '/api/figure/models/cute-kit');
    assert.equal(patch.auth, 'required');
    assert.deepEqual(JSON.parse(patch.body), { stock: 0, price: 45.25, expected_stock: 300, expected_price: 40 });
    assert.ok(document.body.textContent.includes(e.t.models.saved));
    await e.edit('stock', '100'); await e.click(e.button(e.t.models.save));
    assert.equal(JSON.parse(e.requests.filter(r => r.method === 'PATCH')[1].body).expected_stock, 0);
}));

test('model drafts survive navigation and Reset restores the last saved values', async () => fixture({}, async e => {
    await e.click(e.button(e.t.models.title)); await e.edit('stock', '42');
    await e.click(e.button(e.t.ordersTab)); await e.click(e.button(e.t.models.title));
    assert.equal(e.field('stock').value, '42');
    await e.click(e.button(e.t.models.reset));
    assert.equal(e.field('stock').value, '300');
    assert.equal(e.requests.some(r => r.method === 'PATCH'), false);
}));

for (const [field, value] of [['stock', '-1'], ['stock', '2.5'], ['stock', ''], ['stock', '2147483648'], ['price', '0'], ['price', '-1'], ['price', '1.234'], ['price', '1000000']]) test(`invalid ${field} ${JSON.stringify(value)} cannot be saved`, async () => fixture({}, async e => {
    await e.click(e.button(e.t.models.title)); await e.edit(field, value);
    assert.equal(e.button(e.t.models.save).disabled, true);
    assert.equal(e.field(field).getAttribute('aria-invalid'), 'true');
    assert.equal(e.requests.some(r => r.method === 'PATCH'), false);
}));

for (const status of [409, 500, 403]) test(`model save failure ${status} requires a fresh read before retry`, async () => fixture({ saveStatus: status }, async e => {
    await e.click(e.button(e.t.models.title)); await e.edit('stock', '42');
    await e.click(e.button(e.t.models.save));
    const expected = status === 409 ? e.t.models.conflict : status === 403 ? e.t.restricted : e.t.models.saveFailed;
    assert.ok(document.querySelector('[role=alert]').textContent.includes(expected));
    assert.equal(document.body.textContent.includes(e.t.models.saved), false);
    assert.equal(e.button(e.t.models.save).disabled, true);
    e.server.models[0].stock = 299;
    await e.click(e.button(e.t.refresh));
    assert.equal(e.field('stock').value, '299');
    assert.equal(e.field('stock').disabled, false);
}));

test('model read errors and empty catalogs are recoverable', async () => fixture({ catalogStatus: 500 }, async e => {
    await e.click(e.button(e.t.models.title));
    assert.ok(document.querySelector('[role=alert]').textContent.includes(e.t.models.loadFailed));
    e.server.catalogStatus = 200; e.server.models = [];
    await e.click(e.button(e.t.refresh));
    assert.ok(document.body.textContent.includes(e.t.models.empty));
    assert.equal(document.querySelector('input[name=stock]'), null);
}));

test('model double submits are ignored and logout aborts the pending update', async () => fixture({}, async e => {
    let resolve; e.server.pending = new Promise(done => { resolve = done; });
    await e.click(e.button(e.t.models.title)); await e.edit('stock', '42');
    const save = e.button(e.t.models.save);
    await React.act(async () => { save.click(); save.click(); });
    assert.equal(e.requests.filter(r => r.method === 'PATCH').length, 1);
    assert.equal(e.button(e.t.refresh).disabled, true);
    await e.logout();
    assert.equal(e.requests.find(r => r.method === 'PATCH').signal.aborted, true);
    await React.act(async () => resolve());
    assert.equal(document.querySelector('input[name=stock]'), null);
    assert.equal(document.body.textContent.includes(e.t.models.saved), false);
}));

for (const lang of ['en', 'zh']) test(`${lang}: global discount can be saved and disabled with a version check`, async () => fixture({ lang }, async e => {
    await e.click(e.button(e.discount.title));
    assert.equal(e.field('global-discount').value, '50');
    await e.edit('global-discount', '25.5');
    await e.click(e.button(e.t.models.save));
    assert.deepEqual(JSON.parse(e.requests.find(r => r.method === 'PATCH').body), { discount_bps: 2550, expected_version: 1 });
    assert.ok(document.body.textContent.includes(e.discount.saved));
    await e.edit('global-discount', '0');
    await e.click(e.button(e.t.models.save));
    assert.deepEqual(e.server.promotion, { discount_bps: 0, version: 3 });
}));

for (const value of ['-1', '100', '1.234', '']) test(`invalid global percentage ${JSON.stringify(value)} is blocked`, async () => fixture({}, async e => {
    await e.click(e.button(e.discount.title));
    await e.edit('global-discount', value);
    assert.equal(e.button(e.t.models.save).disabled, true);
    assert.ok(document.body.textContent.includes(e.discount.invalid));
    assert.equal(e.requests.filter(r => r.method === 'PATCH').length, 0);
}));

test('a conflicting global update requires refresh and discards the stale draft', async () => fixture({}, async e => {
    await e.click(e.button(e.discount.title));
    await e.edit('global-discount', '20');
    e.server.discountStatus = 409;
    await e.click(e.button(e.t.models.save));
    assert.ok(document.body.textContent.includes(e.discount.changed));
    assert.equal(e.button(e.t.models.save).disabled, true);
    e.server.discountStatus = 200;
    e.server.promotion = { discount_bps: 3000, version: 2 };
    await e.click(e.button(e.t.refresh));
    assert.equal(e.field('global-discount').value, '30');
}));

test('global discount double submits are ignored and logout cancels a pending save', async () => fixture({}, async e => {
    let resolve; e.server.pending = new Promise(done => { resolve = done; });
    await e.click(e.button(e.discount.title)); await e.edit('global-discount', '25');
    const save = e.button(e.t.models.save);
    await React.act(async () => { save.click(); save.click(); });
    assert.equal(e.requests.filter(r => r.method === 'PATCH').length, 1);
    await e.logout();
    assert.equal(e.requests.find(r => r.method === 'PATCH').signal.aborted, true);
    await React.act(async () => resolve());
    assert.equal(document.body.textContent.includes(e.discount.saved), false);
}));
