const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');

const model = 'SKING_DDJ_v101c';
const options = ['pro', 'standard'].map(pricing_tier => ({
    id: `${model}:${pricing_tier}`, model_version: model, pricing_tier,
}));
const compiled = build({
    stdin: {
        contents: `export { GeneratePage } from './src/pages/GeneratePage';
            export { default as current } from './src/constants/locales/en';
            export { generationModelParams } from './src/utils/generationModels';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'generation-visuals'],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
    plugins: [{ name: 'generation-visuals', setup(build) {
        build.onResolve({ filter: /^(?:@iconify\/react|framer-motion)$|\/components\/(?:SEO|utils|LoadingPlaceholder|MCModal|ConfirmModal)$/ },
            () => ({ path: 'generation-visuals', external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function mount(isPro, { imageOptions = options, maintenance = [], userStatusReady } = {}) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://site.example.test/skin/generate' });
    const { window } = dom;
    window.localStorage.setItem('token', 'test-session');
    const requests = [];
    const visuals = {
        Icon: ({ icon }) => React.createElement('svg', { 'data-icon': icon }),
        AnimatePresence: ({ children }) => children,
        motion: { div: ({ children }) => React.createElement('div', null, children) },
        SEO: () => null, LoadingSpinner: () => null, MCModal: () => null, ConfirmModal: () => null,
    };
    const module = { exports: {} };
    const context = vm.createContext({
        window, document: window.document, localStorage: window.localStorage,
        URL, URLSearchParams, Headers, FormData, Response, DOMException, atob,
        Event: window.Event, setInterval, clearInterval, setTimeout, clearTimeout, console,
        require: name => name === 'generation-visuals' ? visuals : require(name),
        module, exports: module.exports,
        fetch: async input => {
            const url = new URL(input);
            requests.push(url);
            let data;
            switch (url.pathname) {
                case '/api/models': data = {
                    image_to_skin_models: [...new Set(imageOptions.map(option => option.model_version))],
                    image_to_skin_options: imageOptions,
                    text_to_image_models: [], image_edit_models: [],
                }; break;
                case '/api/users/me':
                    await userStatusReady;
                    data = { id: 'test-user', is_pro: isPro }; break;
                case '/api/history': data = { items: [], total_pages: 0, page: 1 }; break;
                case '/api/generate/queue_status': data = { queued_count: 0, processing_count: 0, total_queue_count: 0 }; break;
                case '/api/generation_credit_cost': {
                    const tier = url.searchParams.get('pricing_tier');
                    const option = imageOptions.find(option => option.model_version === url.searchParams.get('model_version')
                        && option.pricing_tier === tier);
                    assert.ok(option, 'Cost requests identify an available model and pricing tier');
                    data = { credits: tier === 'pro' ? 4 : 12, is_pro: tier === 'pro', under_maintenance: maintenance.includes(option.id) };
                    break;
                }
                default: throw new Error(`Unexpected request: ${url}`);
            }
            return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        },
    });
    vm.runInContext(await compiled, context);
    const { GeneratePage, current, generationModelParams } = module.exports;
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = createRoot(node);
    await React.act(() => root.render(React.createElement(MemoryRouter,
        { initialEntries: ['/skin/generate'] }, React.createElement(GeneratePage, { current }))));
    return {
        node, requests, current, generationModelParams,
        trigger: () => node.querySelector(`button[aria-label="${current.generate.modelVersion}"]`),
        click: button => React.act(() => button.click()),
        async close() {
            await React.act(() => root.unmount());
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
            window.close();
        },
    };
}

for (const isPro of [false, true]) {
    test(`${isPro ? 'Pro' : 'Free'} users default to the first Pro option and ${isPro ? 'automatically use Pro pricing' : 'can choose all-users pricing'}`, async () => {
        const env = await mount(isPro);
        try {
            const trigger = env.trigger();
            assert.match(trigger.textContent, /PRO ONLY\s*4/);
            if (!isPro) {
                const subscribe = [...env.node.querySelectorAll('button')].find(button =>
                    button.textContent.includes(env.current.generate.btnSubscribePro));
                assert.ok(subscribe, 'Free user sees the Pro subscription action');
            }
            await env.click(trigger);
            const entries = [...env.node.querySelectorAll('button')].filter(button =>
                button !== trigger && button.textContent.startsWith(model));
            assert.equal(entries.length, 2);
            const pro = entries.find(button => button.textContent.includes('PRO ONLY'));
            const standard = entries.find(button => button.textContent.includes('ALL USERS'));
            assert.match(pro.textContent, /PRO ONLY\s*4/);
            assert.match(standard.textContent, /ALL USERS\s*12/);
            assert.equal(standard.disabled, false);
            await env.click(standard);
            assert.match(env.trigger().textContent, isPro ? /PRO ONLY\s*4/ : /ALL USERS\s*12/);
            assert.equal(env.trigger().getAttribute('aria-expanded'), 'false');
            if (!isPro) {
                const generate = [...env.node.querySelectorAll('button')].find(button =>
                    button.textContent.includes(env.current.generate.btnStart));
                assert.ok(generate, 'Free user can select the unrestricted option');
            }
            assert.ok(env.requests.filter(url => url.pathname.endsWith('/queue_status'))
                .every(url => url.searchParams.get('model_version') === model && !url.searchParams.has('pricing_tier')));

            const lookup = Object.fromEntries(options.map(option => [option.id, option]));
            for (const tier of ['pro', 'standard']) {
                const payload = new FormData();
                env.generationModelParams(`${model}:${tier}`, lookup).forEach((value, key) => payload.append(key, value));
                assert.equal(payload.get('model_version'), model);
                assert.equal(payload.get('pricing_tier'), tier);
            }
            const combined = env.generationModelParams('z_image + legacy', lookup);
            assert.equal(combined.get('model_version'), 'legacy');
            assert.equal(combined.get('aux_model_version'), 'z_image');
            assert.equal(combined.has('pricing_tier'), false);
        } finally { await env.close(); }
    });
}

const secondModel = 'SKING_DDJ_v102';
const secondOptions = ['pro', 'standard'].map(pricing_tier => ({
    id: `${secondModel}:${pricing_tier}`, model_version: secondModel, pricing_tier,
}));

async function selectSecondStandard(env) {
    await env.click(env.trigger());
    const standard = [...env.node.querySelectorAll('button')].find(button =>
        button.textContent.startsWith(secondModel) && button.textContent.includes('ALL USERS'));
    assert.ok(standard);
    await env.click(standard);
}

test('Pro users selecting another all-users model switch to that same model at Pro pricing', async () => {
    const env = await mount(true, { imageOptions: [...options, ...secondOptions] });
    try {
        await selectSecondStandard(env);
        assert.ok(env.trigger().textContent.startsWith(secondModel));
        assert.match(env.trigger().textContent, /PRO ONLY\s*4/);
    } finally { await env.close(); }
});

for (const unavailable of ['missing', 'maintenance']) {
    test(`Pro users keep all-users pricing when the matching Pro option is ${unavailable}`, async () => {
        const env = await mount(true, {
            imageOptions: [...options, ...secondOptions.filter(option => unavailable !== 'missing' || option.pricing_tier !== 'pro')],
            maintenance: unavailable === 'maintenance' ? [`${secondModel}:pro`] : [],
        });
        try {
            await selectSecondStandard(env);
            assert.ok(env.trigger().textContent.startsWith(secondModel));
            assert.match(env.trigger().textContent, /ALL USERS\s*12/);
        } finally { await env.close(); }
    });
}

test('A pending Pro status switches the selected model to its matching Pro option when loaded', async () => {
    let resolveUserStatus;
    const userStatusReady = new Promise(resolve => { resolveUserStatus = resolve; });
    const env = await mount(true, { imageOptions: [...options, ...secondOptions], userStatusReady });
    try {
        await selectSecondStandard(env);
        assert.match(env.trigger().textContent, /ALL USERS\s*12/);
        await React.act(async () => { resolveUserStatus(); });
        assert.ok(env.trigger().textContent.startsWith(secondModel));
        assert.match(env.trigger().textContent, /PRO ONLY\s*4/);
    } finally { await env.close(); }
});
