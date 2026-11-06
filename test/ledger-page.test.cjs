const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const compiled = build({
    stdin: {
        contents: `export { LedgerPage } from './src/pages/LedgerPage';
            export { FinancialsPage } from './src/pages/FinancialsPage';
            export { default as en } from './src/constants/locales/en';
            export { default as zh } from './src/constants/locales/zh-hans';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom'],
    plugins: [{ name: 'ledger-boundaries', setup(build) {
        build.onResolve({ filter: /^(?:@iconify\/react|framer-motion|recharts)$|\/components\/PageContainer$|\/utils\/api$/ },
            args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function monthly(category, amount, currency = 'USD', overrides = {}) {
    return { id: `paypal-monthly:2026-09:${currency}:${category}`, date: '2026-09', provider: 'paypal',
        aggregation: 'monthly', category, currency, type: amount < 0 ? 'expense' : 'revenue',
        desc: category, amount_value: amount, ...overrides };
}
function aws(amount = -2) {
    return { id: 'aws:2026-09-23', date: '2026-09-23 00:00', provider: 'aws',
        currency: 'USD', type: 'expense', desc: 'AWS Cloud Services', amount_value: amount };
}

async function renderPage(payload, check, component = 'LedgerPage', language = 'en') {
    const dom = new JSDOM('<div id="root"></div>');
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const requests = [];
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console,
        require(name) {
            if (name.endsWith('/utils/api')) return { apiFetch: async (url, options) => {
                requests.push({ url, options }); return { ok: true, json: async () => payload };
            } };
            if (name.endsWith('/components/PageContainer')) return { PageContainer: ({ children }) => React.createElement('div', null, children) };
            if (name === 'react-router-dom') return { useNavigate: () => () => {} };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === 'framer-motion') return { motion: { div: ({ children, initial, animate, transition, ...props }) => React.createElement('div', props, children) } };
            if (name === 'recharts') return {
                ResponsiveContainer: ({ children }) => React.createElement('div', null, children),
                AreaChart: ({ data }) => React.createElement('div', { 'data-trend': JSON.stringify(data) }),
                PieChart: () => null, Area: () => null, XAxis: () => null, YAxis: () => null,
                CartesianGrid: () => null, Tooltip: () => null, Pie: () => null, Cell: () => null, Legend: () => null,
            };
            return require(name);
        },
    });
    const node = document.getElementById('root');
    const root = createRoot(node);
    try {
        await React.act(async () => { root.render(React.createElement(module.exports[component], { current: module.exports[language] })); });
        assert.equal(requests[0].url, '/api/public/ledger');
        assert.equal(requests[0].options.cache, 'no-store');
        assert.equal(requests[0].options.auth, 'none');
        await check(node, dom.window);
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

const paypalCard = page => page.querySelector('.grid.grid-cols-1').firstElementChild;

test('monthly PayPal rows use fixed labels and never render provider free text or transaction IDs', async () => {
    await renderPage({ entries: [monthly('payment', 24.03, 'USD', {
        id: 'PRIVATE-TX', desc: 'PRIVATE-TITLE 明 王 payer@example.test', source: 'PRIVATE-SOURCE',
    }), monthly('refund_reversal', -8)] }, page => {
        assert.match(paypalCard(page).textContent, /\+USD 16\.03/);
        assert.match(page.textContent, /Payments/);
        assert.match(page.textContent, /Refunds and reversals/);
        assert.match(page.textContent, /Monthly total \(UTC\)/);
        assert.match(page.textContent, /2026-09/);
        assert.doesNotMatch(page.innerHTML, /PRIVATE|payer@example|明|王|paypal-monthly:/);
    });
});

test('a reversal retains the nonrefunded fee as a loss', async () => {
    await renderPage({ entries: [monthly('payment', 7.35), monthly('refund_reversal', -8)] }, page => {
        const card = paypalCard(page);
        assert.match(card.textContent, /-USD 0\.65/);
        assert.match(card.querySelector('.tabular-nums').className, /text-red-400/);
        assert.match(page.textContent, /\+USD 7\.35/);
        assert.match(page.textContent, /-USD 8\.00/);
    });
});

test('a fully offset payment displays zero net inflow', async () => {
    await renderPage({ entries: [monthly('payment', 8), monthly('refund_reversal', -8)] }, page => {
        assert.match(paypalCard(page).textContent, /\+USD 0\.00/);
    });
});

test('PayPal totals stay separate by currency and provider filters still work', async () => {
    await renderPage({ entries: [monthly('payment', 7.35), monthly('payment', 100, 'EUR'), aws()] }, async (page, window) => {
        assert.match(paypalCard(page).textContent, /\+USD 7\.35/);
        assert.match(paypalCard(page).textContent, /\+EUR 100\.00/);
        assert.doesNotMatch(paypalCard(page).textContent, /107\.35/);
        const button = [...page.querySelectorAll('button')].find(node => node.textContent === 'AWS1');
        await React.act(() => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
        assert.match(page.textContent, /AWS Cloud Services/);
        assert.doesNotMatch(page.textContent, /Monthly total \(UTC\)/);
    });
});

for (const arrayPayload of [false, true]) test(`legacy PayPal details are hidden for ${arrayPayload ? 'array' : 'object'} responses`, async () => {
    const entries = [{ provider: 'paypal', id: 'PRIVATE-TX', date: '2026-09-23 02:53',
        desc: 'PRIVATE-TITLE', amount_value: 123.45 }, aws()];
    await renderPage(arrayPayload ? entries : { entries, summaries: { paypal: { total: 'PRIVATE-SUMMARY' } } }, page => {
        assert.doesNotMatch(page.innerHTML, /PRIVATE|123\.45|02:53/);
        assert.match(page.textContent, /AWS Cloud Services/);
    });
});

test('Chinese ledger shows monthly category labels', async () => {
    await renderPage({ entries: [monthly('refund_reversal', -8)] }, page => {
        assert.match(page.textContent, /退款及撤销/);
        assert.match(page.textContent, /月度汇总（UTC）/);
        assert.match(paypalCard(page).textContent, /月度汇总组数: 1/);
    }, 'LedgerPage', 'zh');
});

test('financial overview selects one currency and retains both flows in a monthly group', async () => {
    await renderPage({ entries: [monthly('payment', 7, 'USD', { revenue_value: 10, expense_value: -3 }),
        monthly('payment', 100, 'EUR'), aws()] }, async (page, window) => {
        const cards = page.querySelector('.grid.grid-cols-2');
        assert.match(cards.children[0].textContent, /USD 5\.00/);
        assert.match(cards.children[1].textContent, /USD 10\.00/);
        assert.match(cards.children[2].textContent, /USD 5\.00/);
        assert.deepEqual(JSON.parse(page.querySelector('[data-trend]').dataset.trend), [
            { name: '2026-09', revenue: 10, expenditure: 5 },
        ]);
        const select = page.querySelector('select');
        assert.equal(select.value, 'USD');
        await React.act(() => { select.value = 'EUR'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
        assert.match(cards.children[0].textContent, /EUR 100\.00/);
        assert.match(cards.children[2].textContent, /EUR 0\.00/);
        assert.doesNotMatch(cards.textContent, /USD|105\.00/);
        assert.deepEqual(JSON.parse(page.querySelector('[data-trend]').dataset.trend), [
            { name: '2026-09', revenue: 100, expenditure: 0 },
        ]);
    }, 'FinancialsPage');
});

test('empty public ledger renders without fabricated currency totals', async () => {
    await renderPage({ entries: [] }, page => {
        assert.match(page.textContent, /No synced billing records/);
        assert.match(paypalCard(page).textContent, /—/);
    });
});
