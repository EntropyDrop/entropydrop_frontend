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
            export { default as current } from './src/constants/locales/en';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom'],
    plugins: [{ name: 'ledger-boundaries', setup(build) {
        build.onResolve({ filter: /^(?:@iconify\/react|framer-motion)$|\/components\/PageContainer$|\/utils\/api$/ },
            args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

function entry(id, amount) {
    return { id, date: '2026-09-23 02:53', provider: 'paypal',
        type: amount < 0 ? 'expense' : 'revenue', desc: id,
        amount: `${amount < 0 ? '-' : '+'}$${Math.abs(amount).toFixed(2)}`,
        amount_value: amount };
}

async function renderLedger(payload, check) {
    const dom = new JSDOM('<div id="root"></div>');
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const module = { exports: {} };
    vm.runInNewContext(await compiled, { module, exports: module.exports, console,
        require(name) {
            if (name.endsWith('/utils/api')) return { apiFetch: async () => ({ ok: true, json: async () => payload }) };
            if (name.endsWith('/components/PageContainer')) return { PageContainer: ({ children }) => React.createElement('div', null, children) };
            if (name === 'react-router-dom') return { useNavigate: () => () => {} };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === 'framer-motion') return { motion: { div: ({ children, initial, animate, transition, ...props }) => React.createElement('div', props, children) } };
            return require(name);
        },
    });
    const node = document.getElementById('root');
    const root = createRoot(node);
    try {
        const { LedgerPage, current } = module.exports;
        await React.act(async () => { root.render(React.createElement(LedgerPage, { current })); });
        const cards = node.querySelector('.grid.grid-cols-1');
        await check(cards.firstElementChild, node);
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
}

test('PayPal summary subtracts a reversal while retaining both ledger entries', async () => {
    await renderLedger({
        entries: [entry('payment', 7.35), entry('reversal', -8)],
        summaries: { paypal: { count: 44, total: '+$234.45', total_value: 234.45, revenue: '+$242.45', expense: '-$8.00' } },
    }, (card, page) => {
        assert.match(card.textContent, /\+\$234\.45/);
        assert.doesNotMatch(card.textContent, /242\.45/);
        assert.match(page.textContent, /\+\$7\.35/);
        assert.match(page.textContent, /-\$8\.00/);
    });
});

test('without server summaries a reversed payment retains the nonrefunded fee as a loss', async () => {
    await renderLedger({ entries: [entry('payment', 7.35), entry('reversal', -8)] }, card => {
        assert.match(card.textContent, /-\$0\.65/);
        assert.match(card.querySelector('.tabular-nums').className, /text-red-400/);
    });
});

test('a fully offset payment displays zero net inflow', async () => {
    await renderLedger([entry('payment', 8), entry('refund', -8)], card => {
        assert.match(card.textContent, /\+\$0\.00/);
        assert.doesNotMatch(card.textContent, /\+\$8\.00/);
    });
});
