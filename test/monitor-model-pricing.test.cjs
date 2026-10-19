const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');

test('Monitor saves prices, switches and display priorities for every model and restores them on reload', async () => {
    const compiled = await build({
        stdin: {
            contents: `export { MonitorPage } from './src/pages/MonitorPage';
                export { default as current } from './src/constants/locales/en';`,
            resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
        },
        bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
        external: ['react', 'react-dom', 'react/jsx-runtime', 'monitor-visuals', 'monitor-api'],
        plugins: [{ name: 'monitor-boundaries', setup(build) {
            build.onResolve({ filter: /^(?:@iconify\/react|recharts)$/ }, () => ({ path: 'monitor-visuals', external: true }));
            build.onResolve({ filter: /\/utils\/(?:api|httpClient)$/ }, () => ({ path: 'monitor-api', external: true }));
        } }],
    });
    const dom = new JSDOM('<div id="root"></div>');
    const { window } = dom;
    const prices = {
        SKING_DDJ_v101c: { credits: 4, free_credits: 12, pricing_tiers: ['pro', 'standard'], is_pro: false, under_maintenance: false, display_priority: 5 },
        sking_v73_flux_4b_000027000: { credits: 4, free_credits: 4, pricing_tiers: [], is_pro: false, under_maintenance: false },
        z_image: { credits: 0, free_credits: 0, pricing_tiers: [], is_pro: false, under_maintenance: false },
    };
    const writes = [];
    const api = { apiFetch: async (url, init = {}) => {
        let data;
        if (url === '/api/monitor/model_prices') {
            if (init.method === 'POST') {
                const { model_name, ...config } = JSON.parse(init.body);
                writes.push({ model_name, ...config });
                prices[model_name] = config;
                data = { model_name, ...config };
            } else data = prices;
        } else if (url === '/api/monitor/stats') {
            data = { queue_stats: {}, workers: [], summary: {}, history: [], history_24h: [] };
        } else if (url === '/api/monitor/backend-instances') {
            data = { total_instances: 0, healthy_count: 0, instances: [] };
        } else if (url === '/api/monitor/backend-instances/history') {
            data = { series: [] };
        } else if (url === '/api/monitor/mode_status') {
            data = { text_to_skin_enabled: true, image_to_skin_enabled: true, image_edit_to_skin_enabled: true };
        } else if (url.startsWith('/api/monitor/unfinished?') || url.startsWith('/api/monitor/subscription-credit-audits?')) {
            data = { items: [], total_count: 0, total_pages: 0, summary: {
                total_orders: 0, success_count: 0, anomaly_count: 0, total_credits_granted: 0, total_revenue: 0,
            } };
        } else throw new Error(`Unexpected request: ${url}`);
        return new Response(JSON.stringify(data));
    } };
    const visuals = new Proxy({}, { get: () => () => null });
    const module = { exports: {} };
    const context = vm.createContext({
        window, document: window.document, setInterval, clearInterval, setTimeout, clearTimeout, console,
        module, exports: module.exports,
        require: name => name === 'monitor-api' ? api : name === 'monitor-visuals' ? visuals : require(name),
    });
    vm.runInContext(compiled.outputFiles[0].text, context);
    const { MonitorPage, current } = module.exports;
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = require('react-dom/client').createRoot(node);
    try {
        await React.act(() => root.render(React.createElement(MonitorPage, { current })));
        for (const model of Object.keys(prices)) {
            const input = name => node.querySelector(`input[aria-label="${model} ${name} credits"]`);
            const priority = () => node.querySelector(`input[aria-label="${model} Display priority"]`);
            const toggle = name => node.querySelector(`button[role="switch"][aria-label="${model} ${name}"]`);
            assert.ok(input('Free'), `${model} has a Free price`);
            assert.ok(input('Pro'), `${model} has a Pro price`);
            assert.equal(priority().value, String(prices[model].display_priority ?? 0));
            const displayPriority = (Object.keys(prices).indexOf(model) + 1) * 10;
            await React.act(() => {
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(priority(), String(displayPriority));
                priority().dispatchEvent(new window.Event('input', { bubbles: true }));
            });
            for (const name of ['Pro only', 'Maintenance']) {
                assert.equal(toggle(name).getAttribute('aria-checked'), 'false');
                await React.act(() => toggle(name).click());
                assert.equal(toggle(name).getAttribute('aria-checked'), 'true');
            }
            const expected = { ...prices[model], is_pro: true, under_maintenance: true };
            const save = [...input('Free').closest('label').parentElement.querySelectorAll('button')]
                .find(button => button.textContent === 'SAVE');
            await React.act(() => save.click());
            assert.deepEqual(writes.at(-1), {
                model_name: model, credits: expected.credits, free_credits: expected.free_credits,
                is_pro: true, under_maintenance: true, display_priority: displayPriority,
            });
            assert.equal(toggle('Pro only').getAttribute('aria-checked'), 'true');
            assert.equal(toggle('Maintenance').getAttribute('aria-checked'), 'true');
            assert.equal(priority().value, String(displayPriority));
        }
        assert.equal(writes.length, 3);
        const firstModel = Object.keys(prices)[0];
        const priority = node.querySelector(`input[aria-label="${firstModel} Display priority"]`);
        await React.act(() => {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(priority, '0');
            priority.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
        const save = [...priority.closest('label').parentElement.querySelectorAll('button')]
            .find(button => button.textContent === 'SAVE');
        await React.act(() => save.click());
        assert.equal(writes.at(-1).display_priority, 0, 'zero explicitly resets the priority');
        await React.act(() => root.render(null));
        await React.act(() => root.render(React.createElement(MonitorPage, { current })));
        for (const model of Object.keys(prices)) {
            assert.equal(node.querySelector(`input[aria-label="${model} Display priority"]`).value,
                String(prices[model].display_priority), 'saved priorities survive page reload');
        }
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        window.close();
    }
});
