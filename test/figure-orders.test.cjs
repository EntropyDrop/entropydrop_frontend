const test = require('node:test');
const kitSpecifications = require('./fixtures/kit-specifications.json');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export * from './src/pages/OrdersPage'; export { OrderKitDetails } from './src/pages/figure/print/KitSpecificationsDetails'; export * from './src/pages/figure/print/orderItems'; export { default as en } from './src/constants/locales/en';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom', '@iconify/react'],
    plugins: [{ name: 'order-boundaries', setup(build) {
        build.onResolve({ filter: /\/components\/(Skin2DImg|Skin3DModal)$|\/utils\/api$|\/hooks\/useAuthSession$|\/print\/FigureOrderPreviewModal$/ }, args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function fixture(check, options = {}) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const requests = [];
    const events = [], timers = new Map();
    let session = 'account-a';
    const popup = { closed: false, document: { title: '', body: { textContent: '' } }, location: { href: '' }, close() { this.closed = true; } };
    dom.window.open = (...args) => { events.push({ type: 'open', args }); return options.popupBlocked ? null : popup; };
    dom.window.setInterval = callback => { const id = timers.size + 1; timers.set(id, callback); return id; };
    dom.window.clearInterval = id => timers.delete(id);
    const navigate = () => {};
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `kit-${i}`, refer_log_id: 'skin-a', skin_url: `/snapshot-${i}.png`, model_type: 'Cute DIY Kit', price: 40, kit_specifications_snapshot: kitSpecifications }));
    const legacy = { id: 'legacy', refer_log_id: 'skin-b', skin_url: '/legacy.png', model_type: 'Figure10cm', price: 60 };
    const order = { id: 'order-quantity', order_type: 'print', status: 'pending_payment', price: 180, total_price: 180, shipping_fee: 0, created_at: '2026-10-09T00:00:00Z', items: [...items, legacy], address: options.address };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, AbortController, URL, Event: dom.window.Event, document, window: dom.window,
        require(name) {
            if (name === '@iconify/react') return { Icon: () => null };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => session };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                events.push({ type: 'request', url });
                if (url.endsWith('/create-paypal-order')) {
                    if (options.createDeferred) return options.createDeferred;
                    return { ok: !options.createError, status: options.createError ? 500 : 200, json: async () => options.createError ? { detail: 'Checkout unavailable' } : { id: 'PAYPAL-ORDER', status: options.paypalStatus || 'CREATED', approval_url: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER' } };
                }
                if (url.endsWith('/pay')) {
                    if (options.captureError && !init.skipGlobalError) {
                        dom.window.dispatchEvent(new dom.window.CustomEvent('global-error', { detail: options.captureError }));
                    }
                    if (!options.captureError) order.status = 'paid';
                    return { ok: !options.captureError, status: options.captureError ? 400 : 200, json: async () => options.captureError ? { detail: options.captureError } : order };
                }
                if (init.method === 'DELETE') {
                    order.items = order.items.filter(item => item.id !== url.split('/').at(-1)); order.price -= 40; order.total_price -= 40;
                }
                return { ok: true, json: async () => ({ items: [order], total_pages: 1 }) };
            } };
            if (name.endsWith('/components/Skin2DImg')) return { Skin2DImg: ({ src }) => React.createElement('img', { src }) };
            if (name.endsWith('/components/Skin3DModal')) return { Skin3DModal: ({ isOpen, textureUrl }) => isOpen ? React.createElement('div', { 'data-preview': 'legacy' }, textureUrl) : null };
            if (name.endsWith('/print/FigureOrderPreviewModal')) return { FigureOrderPreviewModal: ({ textureUrl, onClose }) => React.createElement('div', { 'data-preview': 'figure' }, textureUrl, React.createElement('button', { onClick: onClose }, 'Close preview')) };
            if (name === 'react-router-dom') return { useNavigate: () => navigate, useSearchParams: () => [new URLSearchParams()], Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const { OrdersPage, groupOrderItems, en } = module.exports;
    const button = label => Array.from(document.querySelectorAll('button')).find(el => el.textContent === label || el.getAttribute('aria-label') === label);
    const click = el => React.act(async () => { assert.ok(el); el.click(); });
    try {
        await React.act(async () => root.render(React.createElement(OrdersPage, { current: en })));
        await check({ requests, items, en, button, click, groupOrderItems, popup, events, timers,
            tick: () => React.act(async () => { for (const callback of Array.from(timers.values())) callback(); }),
            changeSession: next => React.act(async () => { session = next; root.render(React.createElement(OrdersPage, { current: en })); }),
            unmount: () => React.act(async () => root.unmount()),
            renderDetails: item => React.act(async () => root.render(React.createElement(module.exports.OrderKitDetails, { item, current: en }))) });
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

test('orders show combined quantity, unit price and subtotal for kits with separate snapshots', async () => fixture(async e => {
    assert.ok(document.body.textContent.includes('Items (4)'));
    assert.ok(document.body.textContent.includes('Quantity: 3 × $40.00'));
    assert.ok(document.body.textContent.includes('Subtotal: $120.00'));
    assert.ok(document.body.textContent.includes('Quantity: 1 × $60.00'));
    assert.equal(document.querySelectorAll('img').length, 2);
    assert.ok(e.button(e.en.figurePrint.commissionOrder.title));
}));

test('orders show the complete saved shipping address including country and alphanumeric postal code', async () => fixture(async () => {
    for (const text of ['Alex Example', 'United Kingdom', 'London', 'Example street', 'SW1A 1AA', '+44 7700900123']) {
        assert.ok(document.body.textContent.includes(text), `missing address field: ${text}`);
    }
}, { address: { recipient_name: 'Alex Example', country: 'GB', state: '', city: 'London', detail_address: 'Example street', zip_code: 'SW1A 1AA', phone: '+44 7700900123' } }));

test('Pay Now opens the checkout immediately, then confirms payment once and refreshes the order', async () => fixture(async e => {
    e.events.length = 0;
    await e.click(e.button(e.en.orders.payNow));
    assert.equal(e.events[0].type, 'open', 'popup must open within the click, before the API request');
    assert.equal(e.events[1].url, '/api/orders/order-quantity/create-paypal-order');
    const creation = e.requests.find(request => request.url.endsWith('/create-paypal-order'));
    assert.equal(JSON.parse(creation.body).return_url, 'http://localhost/credits?payment_redirect=1');
    assert.equal(e.popup.location.href, 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER');
    assert.equal(e.button(e.en.credits.waitingPayment).disabled, true);
    assert.equal(e.button(e.en.orders.removeOne).disabled, true);
    assert.equal(e.button(e.en.orders.cancelOrder).disabled, true);
    assert.equal(e.button(e.en.figurePrint.commissionOrder.title).disabled, true);
    assert.equal(e.requests.some(request => request.url.endsWith('/paypal/config') || request.url.endsWith('/pay')), false);
    e.popup.closed = true;
    await e.tick(); await e.tick();
    const captures = e.requests.filter(request => request.url.endsWith('/pay'));
    assert.equal(captures.length, 1);
    assert.equal(JSON.parse(captures[0].body).paypal_order_id, 'PAYPAL-ORDER');
    assert.ok(document.body.textContent.includes(e.en.modal.paySuccess));
    assert.equal(e.requests.filter(request => request.url.startsWith('/api/orders?')).length, 2);
    assert.equal(e.button(e.en.orders.payNow), undefined);
    assert.equal(e.button(e.en.figurePrint.commissionOrder.title), undefined);
    assert.equal(e.timers.size, 0);
}));

test('a blocked popup creates no payment voucher and leaves Pay Now enabled', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.payNow));
    assert.ok(document.body.textContent.includes(e.en.orders.popupBlocked));
    assert.equal(e.requests.some(request => request.method === 'POST'), false);
    assert.equal(e.button(e.en.orders.payNow).disabled, false);
}, { popupBlocked: true }));

test('cancelling checkout keeps the order unpaid without displaying a false success or error', async () => fixture(async e => {
    const errors = [];
    window.addEventListener('global-error', event => errors.push(event.detail));
    await e.click(e.button(e.en.orders.payNow));
    e.popup.closed = true; await e.tick();
    assert.equal(e.button(e.en.orders.payNow).disabled, false);
    assert.equal(document.body.textContent.includes(e.en.modal.paySuccess), false);
    assert.equal(document.body.textContent.includes(e.en.orders.paymentFailed), false);
    assert.deepEqual(errors, [], 'cancellation must not trigger the shared API error dialog');
}, { captureError: 'PayPal payment is not approved' }));

test('checkout creation failure closes the empty popup and permits retry', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.payNow));
    assert.equal(e.popup.closed, true);
    assert.equal(e.timers.size, 0);
    assert.ok(document.body.textContent.includes('Checkout unavailable'));
    assert.equal(e.button(e.en.orders.payNow).disabled, false);
}, { createError: true }));

test('capture failures are shown without marking the order paid', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.payNow));
    e.popup.closed = true; await e.tick();
    assert.ok(document.body.textContent.includes('PayPal amount mismatch'));
    assert.equal(document.body.textContent.includes(e.en.modal.paySuccess), false);
    assert.equal(e.button(e.en.orders.payNow).disabled, false);
}, { captureError: 'PayPal amount mismatch' }));

test('an already approved voucher is confirmed directly without requesting approval again', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.payNow));
    assert.equal(e.popup.location.href, '');
    assert.equal(e.popup.closed, true);
    assert.equal(e.requests.filter(request => request.url.endsWith('/pay')).length, 1);
    assert.ok(document.body.textContent.includes(e.en.modal.paySuccess));
}, { paypalStatus: 'APPROVED' }));

test('a confirmation retry resumes the pending voucher without another PayPal approval', async () => {
    const options = { captureError: 'Payment confirmation pending; retry without creating another order' };
    await fixture(async e => {
        await e.click(e.button(e.en.orders.payNow));
        e.popup.closed = true; await e.tick();
        assert.ok(document.body.textContent.includes(options.captureError));
        await e.click(e.button(e.en.modal.confirm));
        options.captureError = null;
        options.paypalStatus = 'CAPTURE_PENDING';
        e.popup.closed = false;
        e.popup.location.href = '';
        await e.click(e.button(e.en.orders.payNow));
        assert.equal(e.popup.location.href, '');
        assert.equal(e.popup.closed, true);
        const captures = e.requests.filter(request => request.url.endsWith('/pay'));
        assert.equal(captures.length, 2);
        assert.ok(captures.every(request => JSON.parse(request.body).paypal_order_id === 'PAYPAL-ORDER'));
        assert.ok(document.body.textContent.includes(e.en.modal.paySuccess));
    }, options);
});

test('switching accounts closes checkout and stops capture polling', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.payNow));
    await e.changeSession('account-b'); await e.tick();
    assert.equal(e.popup.closed, true);
    assert.equal(e.timers.size, 0);
    assert.equal(e.requests.some(request => request.url.endsWith('/pay')), false);
    assert.equal(e.button(e.en.orders.payNow).disabled, false);
}));

test('leaving the page during initialization aborts the request and ignores its late response', async () => {
    let resolve;
    const createDeferred = new Promise(done => { resolve = done; });
    await fixture(async e => {
        await e.click(e.button(e.en.orders.payNow));
        await e.unmount();
        assert.equal(e.popup.closed, true);
        assert.equal(e.requests.find(request => request.url.endsWith('/create-paypal-order')).signal.aborted, true);
        await React.act(async () => resolve({ ok: true, json: async () => ({ id: 'LATE', approval_url: 'https://www.paypal.com/checkoutnow?token=LATE' }) }));
        assert.equal(e.popup.location.href, '');
        assert.equal(e.timers.size, 0);
    }, { createDeferred });
});

test('different source skins, models and historical prices never share a quantity', async () => fixture(async e => {
    const groups = e.groupOrderItems([...e.items, { ...e.items[0], id: 'old-price', price: 30 }, { ...e.items[0], id: 'other-skin', refer_log_id: 'skin-b' }, { ...e.items[0], id: 'other-model', model_type: 'Figure10cm' }, { ...e.items[0], id: 'unknown-a', refer_log_id: null }, { ...e.items[0], id: 'unknown-b', refer_log_id: null }]);
    assert.equal(groups.length, 6);
    assert.equal(groups[0].quantity, 3);
    assert.ok(groups.slice(1).every(group => group.quantity === 1));
}));

test('removing one kit updates quantity and subtotal without removing the whole group', async () => fixture(async e => {
    await e.click(e.button(e.en.orders.removeOne));
    assert.ok(document.body.textContent.includes(e.en.orders.confirmRemoveOne));
    await e.click(e.button(e.en.modal.confirm));
    assert.equal(e.requests.find(request => request.method === 'DELETE').url, '/api/orders/items/kit-2');
    assert.ok(document.body.textContent.includes('Quantity: 2 × $40.00'));
    assert.ok(document.body.textContent.includes('Subtotal: $80.00'));
}));

test('Cute orders open the print preview from the saved snapshot; older models retain their preview', async () => fixture(async e => {
    await e.click(document.querySelectorAll('[aria-label="Preview model"]')[0]);
    assert.ok(document.querySelector('[data-preview="figure"]').textContent.includes('/snapshot-0.png'));
    assert.equal(document.querySelector('[data-preview="legacy"]'), null);
    await e.click(e.button('Close preview'));
    await e.click(document.querySelectorAll('[aria-label="Preview model"]')[1]);
    assert.ok(document.querySelector('[data-preview="legacy"]').textContent.includes('/legacy.png'));
    assert.equal(document.querySelector('[data-preview="figure"]'), null);
}));


test('order kit details display purchased dimensions and materials per kit', async () => fixture(async e => {
    const detail = document.querySelector('details');
    await e.click(detail.querySelector('summary'));
    assert.equal(detail.open, true);
    assert.ok(detail.textContent.includes(kitSpecifications.product_name));
    assert.ok(detail.textContent.includes(kitSpecifications.dimensions));
    assert.ok(detail.textContent.includes('skin-a'));
    assert.ok(detail.textContent.includes('White 3D printed body parts ×6'));
    assert.ok(detail.textContent.includes('PTFE tube ×2'));
    assert.equal(detail.textContent.includes(e.en.orders.currentKitSpecifications), false);
}));

test('orders do not combine different specification snapshots or current-only legacy records', async () => fixture(async e => {
    const revised = { ...kitSpecifications, dimensions: 'Approx. 8 × 5 × 3 cm' };
    const groups = e.groupOrderItems([...e.items,
        { ...e.items[0], id: 'changed', kit_specifications_snapshot: revised },
        { ...e.items[0], id: 'historical', kit_specifications_snapshot: null, kit_specifications_current: kitSpecifications },
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].quantity, 3);
}));

test('historical kit details clearly distinguish current catalog data from purchase snapshots', async () => fixture(async e => {
    await e.renderDetails({ refer_log_id: 'old-skin', kit_specifications_current: kitSpecifications });
    assert.ok(document.body.textContent.includes(e.en.orders.currentKitSpecifications));
    assert.ok(document.body.textContent.includes(kitSpecifications.dimensions));
    await e.renderDetails({ refer_log_id: 'old-skin' });
    assert.ok(document.body.textContent.includes(e.en.orders.kitSpecificationsUnavailable));
    assert.equal(document.body.textContent.includes(kitSpecifications.dimensions), false);
}));


const savedSticker = require('./fixtures/order-sticker.json');
test('order details retain the saved skin and publisher identity, and different sticker snapshots stay separate', async () => fixture(async e => {
    await e.renderDetails({ ...e.items[0], sticker_snapshot: savedSticker });
    for (const value of [savedSticker.skin_id, savedSticker.skin_name, savedSticker.publisher_name, savedSticker.publisher_id]) {
        assert.ok(document.body.textContent.includes(value));
    }
    assert.equal(document.body.textContent.includes(e.en.orders.legacyStickerSnapshot), false);
    const groups = e.groupOrderItems([
        ...e.items.map(item => ({ ...item, sticker_snapshot: savedSticker })),
        { ...e.items[0], id: 'renamed-maker', sticker_snapshot: { ...savedSticker, publisher_name: 'Later name' } },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].quantity, 3);
    assert.equal(groups[1].quantity, 1);
    await e.renderDetails({ ...e.items[0], sticker_snapshot: { ...savedSticker, origin: 'legacy_backfill' } });
    assert.ok(document.body.textContent.includes(e.en.orders.legacyStickerSnapshot));
}));
