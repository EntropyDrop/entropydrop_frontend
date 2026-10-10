const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export * from './src/pages/FigureManagePage'; export * from './src/components/FigureOrderNotification'; export { default as en } from './src/constants/locales/en';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
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
    const server = { status: 200, pending: null, ...options };
    const order = { id: 'order-test', user_id: 'customer', total_price: 60, created_at: '2026-10-09T00:00:00Z', order_type: 'print', status: 'paid', goods_status: 'awaiting_review', figure_review_status: 'pending', items: [{ id: 'part', model_type: 'Cute DIY Kit', refer_log_id: 'skin-a', source_snapshot: { skin_id: 'skin-a', publisher_id: 'maker-a', license: 'cc-by-nc-4.0' } }], ...options.order };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, AbortController, document, window: dom.window,
        require(name) {
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/hooks/useCurrentUser')) return { useCurrentUser: () => ({ user: { id: session, is_admin: options.admin !== false && !!session } }) };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
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
    const button = label => Array.from(document.querySelectorAll('button')).find(el => el.textContent === label);
    const click = el => React.act(async () => { assert.ok(el); el.click(); });
    const input = value => React.act(async () => {
        const el = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    try {
        await React.act(async () => root.render(React.createElement(FigureManagePage, { current: en })));
        await check({ server, requests, button, click, input, t: en.figureManagement,
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
