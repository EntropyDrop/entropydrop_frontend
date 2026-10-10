const test = require('node:test');
const kitSpecifications = require('./fixtures/kit-specifications.json');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const initialDOM = new JSDOM('<div></div>');
global.window = initialDOM.window; global.document = initialDOM.window.document;
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: { contents: `export * from './src/pages/figure/print/FigureCommissionDialog'; export { FIGURE_MODELS } from './src/pages/figure/print/figureModels'; export { default as en } from './src/constants/locales/en';`, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', supported: { 'dynamic-import': false },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-router-dom', '@iconify/react'],
    plugins: [{ name: 'commission-boundaries', setup(build) {
        build.onResolve({ filter: /\/components\/GoogleSignInButton$|\/utils\/(api|authClient|authSession)$|\/hooks\/useAuthSession$/ }, args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const addressA = { id: 'address-a', recipient_name: 'Alex Example', country: 'US', state: 'CA', city: 'San Jose', detail_address: 'First example address', zip_code: '95131', phone: '+1 2025550100', is_default: true };
const addressB = { ...addressA, id: 'address-b', detail_address: 'Second example address', is_default: false };

async function withDialog(options, check) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const requests = [], navigated = [];
    let closed = 0, session = options.guest ? null : 'account-a';
    const listeners = new Set();
    const server = { stock: [{ model_type: 'Cute DIY Kit', price: 40, stock: 300, available: true, kit_specifications: kitSpecifications }], addresses: [addressA], status: 200, postStatus: 200, deleteStatus: 200, pendingPost: null, pendingLoad: null, ...options.server };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console, AbortController, document, window: dom.window, localStorage: dom.window.localStorage, Event: dom.window.Event, confirm: () => options.confirmDelete !== false,
        require(name) {
            if (name.endsWith('/utils/authClient')) return { waitForAuthReady: async () => {} };
            if (name.endsWith('/utils/authSession')) return { getAuthSessionKey: () => session };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session) };
            if (name.endsWith('/utils/api')) return { apiResponseJson: response => response.json(), apiFetch: async (url, init = {}) => {
                requests.push({ url, ...init });
                const post = init.method === 'POST';
                if (post && server.pendingPost) await server.pendingPost.promise;
                if (!post && server.pendingLoad) await server.pendingLoad.promise;
                if (init.method === 'PUT') server.addresses = server.addresses.map(address => address.id === url.split('/').at(-1) ? { ...address, ...JSON.parse(init.body) } : address);
                if (init.method === 'DELETE') {
                    if (server.pendingDelete) await server.pendingDelete.promise;
                    if (server.deleteStatus === 200) server.addresses = server.addresses.filter(address => address.id !== url.split('/').at(-1));
                    return { ok: server.deleteStatus === 200, status: server.deleteStatus };
                }
                if (url === '/api/addresses' && server.failAddressRefresh && requests.some(request => request.method === 'DELETE')) return { ok: false, status: 500 };
                const status = post ? server.postStatus : server.status;
                return { ok: status === 200, status, json: async () => url.includes('model-stock') ? server.stock : url === '/api/addresses' ? server.addresses : { id: 'order-a' } };
            } };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name.endsWith('/components/GoogleSignInButton')) return { GoogleSignInButton: () => React.createElement('button', null, 'Google sign in') };
            if (name === 'react-router-dom') return { useNavigate: () => url => navigated.push(url), Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) };
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const { FigureCommissionDialog, FIGURE_MODELS, en } = module.exports;
    const source = { id: 'skin-a', name: 'Fixture', publisher: 'Maker', publisherId: 'maker-a', parentId: '', publicLicense: '' };
    const button = text => Array.from(document.querySelectorAll('button')).find(element => element.textContent === text || element.getAttribute('aria-label') === text);
    const click = element => React.act(async () => { assert.ok(element); element.click(); });
    try {
        await React.act(async () => root.render(React.createElement(FigureCommissionDialog, { current: en, source, model: FIGURE_MODELS[0], onClose: () => { closed++; } })));
        await check({ server, requests, navigated, button, click, en, closed: () => closed, submit: () => button(en.figurePrint.commissionOrder.checkout),
            resolve: pending => React.act(async () => pending.resolve()),
            switchAccount: account => React.act(async () => { session = account; listeners.forEach(listener => listener()); }),
        });
        assert.equal(requests.some(request => request.url.includes('figure_print_terms')), false, 'commissioning is separate from download consent');
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

test('commissioning creates one unpaid Cute order from its source and address, then opens Orders', async () => {
    await withDialog({}, async env => {
        assert.ok(document.body.textContent.includes('$40.00'));
        assert.equal(document.body.textContent.includes('Moving parts in the preview'), false);
        assert.equal(document.body.textContent.includes('Review the final total'), false);
        assert.equal(document.body.textContent.includes('300 kits'), false);
        assert.equal(document.body.textContent.includes('Available stock'), false);
        assert.ok(document.body.textContent.includes(env.en.figurePrint.commissionOrder.approval));
        for (const label of ['Free', '3 days', '2 weeks', 'CUTE-7cm DIY kit', kitSpecifications.assembly_note]) {
            assert.ok(document.body.textContent.includes(label));
        }
        const details = Object.fromEntries(Array.from(document.querySelectorAll('dt')).map(term => [term.textContent, term.nextElementSibling.textContent]));
        const t = env.en.figurePrint.commissionOrder;
        assert.equal(details[t.productName], 'CUTE-7cm DIY kit');
        assert.equal(details[t.customSkinId], 'skin-a');
        assert.equal(details[t.dimensions], kitSpecifications.dimensions);
        assert.deepEqual(Array.from(document.querySelectorAll('li')).map(item => item.textContent), kitSpecifications.materials.map(material => `${material.name} ×${material.quantity}${material.description ? ` — ${material.description}` : ''}`));
        const pending = deferred(); env.server.pendingPost = pending;
        const submit = env.submit(); assert.equal(submit.disabled, false);
        await React.act(async () => { submit.click(); submit.click(); });
        assert.equal(env.requests.filter(request => request.method === 'POST').length, 1);
        assert.equal(env.navigated.length, 0);
        assert.equal(env.button(env.en.modal.cancel).disabled, true);
        await env.resolve(pending);
        const post = env.requests.find(request => request.method === 'POST');
        assert.deepEqual(JSON.parse(post.body), { order_type: 'print', log_id: 'skin-a', model_type: 'Cute DIY Kit', address_id: 'address-a', quantity: 1, sticker_language: 'en' });
        assert.deepEqual(env.navigated, ['/skin/orders']);
    });
});

for (const [label, stock] of [
    ['an older model is the only product', [{ model_type: 'PLA+sticker', price: 60, available: true }]],
    ['the Cute kit is sold out', [{ model_type: 'Cute DIY Kit', price: 40, stock: 0, available: false }]],
    ['the price is invalid', [{ model_type: 'Cute DIY Kit', price: 0, available: true }]],
]) test(`commissioning cannot order when ${label}`, async () => {
    await withDialog({ server: { stock } }, async env => {
        assert.equal(env.submit().disabled, true);
        assert.ok(document.body.textContent.includes(env.en.figurePrint.commissionOrder.unavailable));
        await env.click(env.submit());
        assert.equal(env.requests.some(request => request.method === 'POST'), false);
    });
});

test('guests see sign-in and cannot retrieve addresses or create orders', async () => {
    await withDialog({ guest: true }, async env => {
        assert.ok(env.button('Google sign in'));
        assert.equal(env.submit(), undefined);
        assert.equal(env.requests.some(request => request.url === '/api/addresses'), false);
        assert.equal(env.requests.some(request => request.method === 'POST'), false);
    });
});

test('failed order creation keeps the drawer open without navigating or claiming success', async () => {
    await withDialog({ server: { postStatus: 500 } }, async env => {
        await env.click(env.submit());
        assert.equal(env.navigated.length, 0);
        assert.equal(env.closed(), 0);
        assert.ok(document.querySelector('[role="alert"]').textContent.includes(env.en.figurePrint.commissionOrder.createFailed));
    });
});

test('account changes discard a late order response', async () => {
    await withDialog({}, async env => {
        const pending = deferred(); env.server.pendingPost = pending;
        await env.click(env.submit());
        await env.switchAccount('account-b');
        await env.resolve(pending);
        assert.equal(document.querySelector('dialog'), null);
        assert.equal(env.navigated.length, 0);
        assert.equal(env.requests.find(request => request.method === 'POST').signal.aborted, true);
    });
});

test('unavailable order data is retryable and never enables ordering', async () => {
    await withDialog({ server: { status: 500 } }, async env => {
        assert.equal(env.submit().disabled, true);
        assert.ok(document.querySelector('[role="alert"]'));
        env.server.status = 200;
        await env.click(env.button(env.en.figurePrint.retry));
        assert.equal(env.submit().disabled, false);
    });
});


test('kit quantity updates the total and is sent in one atomic order request', async () => {
    await withDialog({}, async env => {
        const select = document.querySelector('select');
        await React.act(async () => { select.value = '3'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
        assert.ok(document.body.textContent.includes('$120.00'));
        const pending = deferred(); env.server.pendingPost = pending;
        await env.click(env.submit());
        assert.equal(select.disabled, true);
        const posts = env.requests.filter(request => request.method === 'POST');
        assert.equal(posts.length, 1);
        assert.equal(JSON.parse(posts[0].body).quantity, 3);
        await env.resolve(pending);
    });
});

test('quantity selection respects available stock and the 10-kit order limit', async () => {
    await withDialog({ server: { stock: [{ model_type: 'Cute DIY Kit', price: 40, stock: 2, available: true, kit_specifications: kitSpecifications }] } }, async () => {
        assert.deepEqual(Array.from(document.querySelectorAll('select option')).map(option => option.value), ['1', '2']);
    });
    await withDialog({}, async () => {
        assert.equal(document.querySelectorAll('select option').length, 10);
    });
});


test('kit details come from the catalog response, including future model specifications', async () => {
    const specifications = { product_name: 'Catalog-only product', dimensions: 'Approx. 8 × 5 × 3 cm', materials: [{ name: 'New part', quantity: 2 }], assembly_note: 'Catalog assembly instructions.' };
    await withDialog({ server: { stock: [{ model_type: 'Cute DIY Kit', price: 40, stock: 2, available: true, kit_specifications: specifications }] } }, async env => {
        assert.ok(document.body.textContent.includes(specifications.product_name));
        assert.ok(document.body.textContent.includes(specifications.dimensions));
        assert.ok(document.body.textContent.includes('New part ×2'));
        assert.ok(document.body.textContent.includes(specifications.assembly_note));
        assert.equal(document.body.textContent.includes('7 × 4.5 × 2.8 cm'), false);
        assert.equal(env.submit().disabled, false);
    });
});

test('missing catalog specifications block ordering instead of substituting frontend text', async () => {
    await withDialog({ server: { stock: [{ model_type: 'Cute DIY Kit', price: 40, stock: 2, available: true }] } }, async env => {
        assert.equal(env.submit().disabled, true);
        assert.ok(document.body.textContent.includes(env.en.figurePrint.commissionOrder.specificationsUnavailable));
        assert.equal(document.body.textContent.includes(kitSpecifications.dimensions), false);
    });
});

function addressCard(street) {
    return [...document.querySelectorAll('div')].find(element => element.textContent === street)?.parentElement;
}

test('an incomplete selected address blocks adding a kit until its recipient is saved', async () => {
    await withDialog({ server: { addresses: [{ ...addressA, recipient_name: '' }] } }, async env => {
        assert.equal(env.submit().disabled, true);
        assert.ok(document.querySelector('footer').textContent.includes(env.en.address.completeAddress));
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        await env.click(env.button(env.en.address.editAddress));
        await React.act(async () => {
            const input = document.querySelector('[name="recipient_name"]');
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'Saved Recipient');
            input.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
        await env.click(env.button(env.en.address.save));
        assert.ok(document.querySelector('footer').textContent.includes('Saved Recipient'));
        assert.equal(env.submit().disabled, false);
    });
});

test('deleting an explicitly selected address clears checkout until another address is selected', async () => {
    await withDialog({ server: { addresses: [addressA, addressB] } }, async env => {
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        await env.click(addressCard(addressB.detail_address));
        assert.ok(document.querySelector('footer').textContent.includes(addressB.detail_address));
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        const pending = deferred(); env.server.pendingDelete = pending;
        await env.click(addressCard(addressB.detail_address).querySelector(`[aria-label="${env.en.address.deleteAddress}"]`));
        assert.ok(document.querySelector('footer').textContent.includes(addressB.detail_address), 'keep the address until deletion succeeds');
        await env.resolve(pending);
        assert.equal(document.querySelector('footer').textContent.includes(addressB.detail_address), false);
        assert.ok(document.querySelector('footer').textContent.includes(env.en.figurePrint.commissionOrder.noAddress));
        assert.equal(env.submit().disabled, true);
        await env.click(env.submit());
        assert.equal(env.requests.some(request => request.method === 'POST'), false);
        await env.click(addressCard(addressA.detail_address));
        assert.equal(env.submit().disabled, false);
        await env.click(env.submit());
        assert.equal(JSON.parse(env.requests.find(request => request.method === 'POST').body).address_id, addressA.id);
    });
});

for (const failAddressRefresh of [false, true]) test(`deleting the last address clears checkout even when refreshing fails: ${failAddressRefresh}`, async () => {
    await withDialog({ server: { failAddressRefresh } }, async env => {
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        await env.click(env.button(env.en.address.deleteAddress));
        assert.equal(document.body.textContent.includes(addressA.detail_address), false);
        assert.ok(document.body.textContent.includes(env.en.address.noAddresses));
        assert.ok(document.querySelector('footer').textContent.includes(env.en.figurePrint.commissionOrder.noAddress));
        assert.equal(env.submit().disabled, true);
    });
});

test('deleting a different address keeps the selected shipping address', async () => {
    await withDialog({ server: { addresses: [addressA, addressB] } }, async env => {
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        await env.click(addressCard(addressB.detail_address).querySelector(`[aria-label="${env.en.address.deleteAddress}"]`));
        assert.ok(document.querySelector('footer').textContent.includes(addressA.detail_address));
        assert.equal(env.submit().disabled, false);
    });
});

for (const [label, options] of [['cancelled', { confirmDelete: false }], ['failed', { server: { deleteStatus: 500 } }]]) test(`${label} deletion keeps the address in checkout and in the picker`, async () => {
    await withDialog(options, async env => {
        await env.click(env.button(env.en.figurePrint.commissionOrder.change));
        await env.click(env.button(env.en.address.deleteAddress));
        assert.ok(addressCard(addressA.detail_address));
        assert.ok(document.querySelector('footer').textContent.includes(addressA.detail_address));
        assert.equal(env.submit().disabled, false);
        if (label === 'cancelled') assert.equal(env.requests.some(request => request.method === 'DELETE'), false);
    });
});
