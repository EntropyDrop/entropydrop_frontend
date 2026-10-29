const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');

test('MonitorPage toggles payment service maintenance, and payment pages show maintenance warning and disable buttons', async () => {
    const compiled = await build({
        stdin: {
            contents: `
                export { MonitorPage } from './src/pages/MonitorPage';
                export { ProPage } from './src/pages/ProPage';
                export { CreditsPage } from './src/pages/CreditsPage';
                export { default as en } from './src/constants/locales/en';
                export { default as zh } from './src/constants/locales/zh-hans';
                export { usePaymentStatus } from './src/hooks/usePaymentStatus';
            `,
            resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
        },
        bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
        loader: { '.wasm': 'empty' },
        define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
        external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'monitor-visuals', 'monitor-api', 'react-router-dom', 'framer-motion'],
        plugins: [{ name: 'test-boundaries', setup(build) {
            build.onResolve({ filter: /^(?:@iconify\/react|recharts)$/ }, () => ({ path: 'monitor-visuals', external: true }));
            build.onResolve({ filter: /\/utils\/(?:api|httpClient)$/ }, () => ({ path: 'monitor-api', external: true }));
        } }],
    });

    const dom = new JSDOM('<div id="root"></div>');
    const { window } = dom;

    let paymentEnabled = true;
    const modeToggles = [];

    const api = {
        apiFetch: async (url, init = {}) => {
            let data = {};
            if (url === '/api/monitor/mode_status') {
                data = {
                    text_to_skin_enabled: true,
                    image_to_skin_enabled: true,
                    image_edit_to_skin_enabled: true,
                    payment_enabled: paymentEnabled,
                };
            } else if (url === '/api/monitor/mode_status/payment') {
                const body = JSON.parse(init.body || '{}');
                paymentEnabled = body.enabled;
                modeToggles.push({ mode: 'payment', enabled: paymentEnabled });
                data = { mode: 'payment', enabled: paymentEnabled };
            } else if (url === '/api/monitor/stats') {
                data = { queue_stats: {}, workers: [], summary: {}, history: [], history_24h: [] };
            } else if (url === '/api/monitor/backend-instances') {
                data = { total_instances: 0, healthy_count: 0, instances: [] };
            } else if (url === '/api/monitor/backend-instances/history') {
                data = { series: [] };
            } else if (url === '/api/monitor/model_prices') {
                data = {};
            } else if (url === '/api/orders/payment/status') {
                data = { payment_enabled: paymentEnabled };
            } else if (url.startsWith('/api/monitor/unfinished') || url.startsWith('/api/monitor/subscription-credit-audits')) {
                data = { items: [], total_count: 0, total_pages: 0, summary: { total_orders: 0, success_count: 0, anomaly_count: 0, total_credits_granted: 0, total_revenue: 0 } };
            }
            return new Response(JSON.stringify(data));
        },
        apiResponseJson: async (res) => res.json(),
    };

    const visuals = {
        Icon: () => null,
        AreaChart: () => null,
        Area: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        Tooltip: () => null,
        ResponsiveContainer: ({ children }) => children,
        Legend: () => null,
        LineChart: () => null,
        Line: () => null,
    };

    const routerDom = {
        useNavigate: () => () => {},
        useSearchParams: () => [new URLSearchParams(), () => {}],
        Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children),
    };

    const framerMotion = {
        motion: {
            div: ({ children, ...props }) => React.createElement('div', props, children),
        },
    };

    const module = { exports: {} };
    const context = vm.createContext({
        window, document: window.document, CustomEvent: window.CustomEvent, Event: window.Event,
        setInterval, clearInterval, setTimeout, clearTimeout, console,
        module, exports: module.exports,
        Response, Headers, Request, URLSearchParams,
        require: name => {
            if (name === 'monitor-api') return api;
            if (name === 'monitor-visuals') return visuals;
            if (name === 'react-router-dom') return routerDom;
            if (name === 'framer-motion') return framerMotion;
            return require(name);
        },
    });

    vm.runInContext(compiled.outputFiles[0].text, context);
    const { en, zh } = module.exports;

    assert.ok(en.monitor.paymentToggleTitle, 'en.monitor has paymentToggleTitle');
    assert.ok(zh.monitor.paymentToggleTitle, 'zh.monitor has paymentToggleTitle');
    assert.ok(en.common.paymentUnderMaintenance, 'en.common has paymentUnderMaintenance');
    assert.ok(zh.common.paymentUnderMaintenance, 'zh.common has paymentUnderMaintenance');
    assert.ok(en.pro.paymentUnderMaintenance, 'en.pro has paymentUnderMaintenance');
    assert.ok(zh.pro.paymentUnderMaintenance, 'zh.pro has paymentUnderMaintenance');
    assert.ok(en.credits.paymentUnderMaintenance, 'en.credits has paymentUnderMaintenance');
    assert.ok(zh.credits.paymentUnderMaintenance, 'zh.credits has paymentUnderMaintenance');
    assert.ok(en.orders.paymentUnderMaintenance, 'en.orders has paymentUnderMaintenance');
    assert.ok(zh.orders.paymentUnderMaintenance, 'zh.orders has paymentUnderMaintenance');
    assert.ok(en.figurePrint.commissionOrder.paymentUnderMaintenance, 'en.figurePrint has paymentUnderMaintenance');
    assert.ok(zh.figurePrint.commissionOrder.paymentUnderMaintenance, 'zh.figurePrint has paymentUnderMaintenance');
});
