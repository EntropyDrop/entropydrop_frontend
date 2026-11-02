const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');

const compiled = build({
    stdin: {
        contents: `export { MonitorPage } from './src/pages/MonitorPage';
            export { UserMenu } from './src/components/UserMenu';
            export { CreditsPage } from './src/pages/CreditsPage';
            export { default as current } from './src/constants/locales/en';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-router-dom', '@react-oauth/google', '@iconify/react', 'recharts', 'framer-motion'],
    plugins: [{ name: 'campaign-boundaries', setup(build) {
        build.onResolve({ filter: /\/utils\/(api|httpClient|authClient|creatorReferral)$|\/hooks\/(useCurrentUser|useAuthSession|usePaymentStatus)$|\/(SkinAvatarImage|GoogleSignInButton|ProfileSkinPreview)$/ }, args => ({ path: args.path, external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function fixture(check, notifications = [], history = []) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://entropydrop.test/' });
    const { window } = dom;
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const requests = [], navigations = [];
    const user = { id: 'user-1', username: 'CampaignUser', credits: 10 };
    const navigate = url => navigations.push(url);
    const setUser = () => {};
    const api = {
        apiResponseJson: response => response.json(),
        apiFetch: async (url, init = {}) => {
            requests.push({ url, ...init });
            let data;
            if (url === '/api/monitor/gift_active_users') data = { gifted_users: 1 };
            else if (url.startsWith('/api/forum/notifications?')) data = { notifications, unread_count: notifications.filter(n => !n.isRead).length, total: notifications.length };
            else if (url.startsWith('/api/users/me/credits/history?')) data = { items: history, total: history.length };
            else if (url.endsWith('/read')) data = { status: 'success' };
            else if (url === '/api/monitor/stats') data = { queue_stats: {}, workers: [], summary: {}, history: [], history_24h: [] };
            else if (url === '/api/monitor/model_prices') data = {};
            else if (url === '/api/monitor/backend-instances') data = { total_instances: 0, healthy_count: 0, instances: [] };
            else if (url === '/api/monitor/backend-instances/history') data = { series: [] };
            else if (url === '/api/monitor/mode_status') data = { text_to_skin_enabled: true, image_to_skin_enabled: true, image_edit_to_skin_enabled: true };
            else if (url.startsWith('/api/monitor/unfinished?') || url.startsWith('/api/monitor/subscription-credit-audits?')) {
                data = { items: [], total_count: 0, total_pages: 0, summary: { total_orders: 0, success_count: 0, anomaly_count: 0, total_credits_granted: 0, total_revenue: 0 } };
            } else throw new Error(`Unexpected request: ${url}`);
            return new Response(JSON.stringify(data));
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, {
        module, exports: module.exports, window, document: window.document, URL, URLSearchParams, console,
        setInterval: () => 1, clearInterval: () => {}, setTimeout, clearTimeout,
        require(name) {
            if (name === 'recharts') return new Proxy({}, { get: () => () => null });
            if (name === '@iconify/react') return { Icon: ({ icon }) => React.createElement('span', { 'data-icon': icon }) };
            if (name === 'react-router-dom') return {
                useNavigate: () => navigate,
                useSearchParams: () => [new URLSearchParams(), () => {}],
                Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
            };
            if (name === 'framer-motion') return {
                AnimatePresence: ({ children }) => children,
                motion: { div: ({ children, initial, animate, exit, transition, ...props }) => React.createElement('div', props, children) },
            };
            if (/\/utils\/(api|httpClient)$/.test(name)) return api;
            if (/\/utils\/(authClient|creatorReferral)$/.test(name)) return {};
            if (name.endsWith('/hooks/useCurrentUser')) return { useCurrentUser: () => ({ user, setUser }) };
            if (name.endsWith('/hooks/useAuthSession')) return { useAuthSession: () => 'test-session' };
            if (name.endsWith('/hooks/usePaymentStatus')) return { usePaymentStatus: () => ({ isPaymentUnderMaintenance: false }) };
            if (/\/(SkinAvatarImage|GoogleSignInButton|ProfileSkinPreview)$/.test(name)) return new Proxy({}, { get: () => () => null });
            return require(name);
        },
    });
    const root = require('react-dom/client').createRoot(document.getElementById('root'));
    const { current } = module.exports;
    const click = element => React.act(() => { assert.ok(element); element.click(); });
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
    const change = (input, value) => React.act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const render = component => React.act(() => root.render(React.createElement(module.exports[component], {
        current, lang: 'en', setLang: () => {}, isAuto: false, setIsAuto: () => {},
    })));
    try { await check({ render, click, button, change, requests, navigations }); }
    finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        window.close();
    }
}

test('campaign URL is optional, validated, confirmed and submitted with the gift', async () => {
    await fixture(async ({ render, click, button, change, requests }) => {
        await render('MonitorPage');
        const message = document.querySelector('input[aria-label="Gift reason/message"]');
        const url = document.getElementById('active-user-gift-url');
        const giftRequests = () => requests.filter(request => request.url === '/api/monitor/gift_active_users');
        await change(message, ' Campaign reward ');
        for (const invalid of ['javascript:alert(1)', 'ftp://example.com', 'https://', 'not a URL']) {
            await change(url, invalid);
            assert.equal(url.getAttribute('aria-invalid'), 'true');
            assert.equal(button('GIFT ACTIVE').disabled, true);
        }
        await change(url, ' https://example.com/campaign?source=gift#details ');
        assert.equal(url.getAttribute('aria-invalid'), 'false');
        await click(button('GIFT ACTIVE'));
        const preview = document.querySelector('a[href="https://example.com/campaign?source=gift#details"]');
        assert.ok(preview);
        assert.equal(preview.target, '_blank');
        await click(button('Cancel'));
        assert.equal(giftRequests().length, 0);
        assert.equal(url.value, 'https://example.com/campaign?source=gift#details');
        await click(button('GIFT ACTIVE'));
        await click(button('CONFIRM GIFT'));
        assert.deepEqual(JSON.parse(giftRequests()[0].body), {
            amount: 10, message: 'Campaign reward', action_url: 'https://example.com/campaign?source=gift#details',
        });
        assert.equal(message.value, '');
        assert.equal(url.value, '');

        await change(message, 'No link reward');
        await click(button('GIFT ACTIVE'));
        await click(button('CONFIRM GIFT'));
        assert.deepEqual(JSON.parse(giftRequests()[1].body), { amount: 10, message: 'No link reward', action_url: null });
    });
});

test('notification action opens a new tab and marks read without triggering the row navigation', async () => {
    const notifications = [
        { id: 'campaign', actionUrl: 'https://example.com/campaign', postTitle: '10|Campaign' },
        { id: 'legacy', postTitle: '10|Legacy' },
        { id: 'unsafe', actionUrl: 'javascript:alert(1)', postTitle: '10|Unsafe' },
        { id: 'invalid', actionUrl: 'https://', postTitle: '10|Invalid' },
    ].map(n => ({ type: 'system_gift', senderName: 'System', createdAt: 'Just now', isRead: false, ...n }));
    await fixture(async ({ render, click, requests, navigations }) => {
        await render('UserMenu');
        await click(document.querySelector('[data-icon="pixelarticons:mail"]').closest('button'));
        const links = document.querySelectorAll('a');
        assert.equal(links.length, 1, 'old notifications and unsafe links have no action button');
        const link = links[0];
        assert.equal(link.href, notifications[0].actionUrl);
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener noreferrer');
        assert.match(link.getAttribute('aria-label'), /new tab/);
        await click(link);
        assert.deepEqual(navigations, [], 'the action must not navigate the current tab to credits');
        assert.ok(document.querySelector('a'), 'the notification list remains open');
        const readRequests = () => requests.filter(request => request.url.endsWith('/campaign/read'));
        assert.equal(readRequests().length, 1);
        assert.equal(readRequests()[0].method, 'POST');
        await click(link);
        assert.equal(readRequests().length, 1, 'an already-read notification is not marked twice');
        await click([...document.querySelectorAll('p')].find(node => node.textContent.includes('Legacy')));
        assert.deepEqual(navigations, ['/credits'], 'clicking a legacy gift still opens credits');
        assert.equal(requests.filter(request => request.url.endsWith('/legacy/read')).length, 1);
    }, notifications);
});

test('transaction history shows the campaign link beside its description and preserves filters', async () => {
    const history = [
        { id: 'campaign', action: 'system_gift', amount: 10, source: 'Campaign reward', actionUrl: 'https://example.com/campaign' },
        { id: 'legacy', action: 'system_gift', amount: 5, source: 'Legacy reward' },
        { id: 'unsafe', action: 'system_gift', amount: 5, source: 'Unsafe URL', actionUrl: 'javascript:alert(1)' },
        { id: 'expense', action: 'generation', amount: -1, source: 'Skin generation' },
    ].map(log => ({ timestamp: '2026-11-02T00:00:00Z', ...log }));
    await fixture(async ({ render, click, button, requests, navigations }) => {
        await render('CreditsPage');
        const actionLinks = () => [...document.querySelectorAll('a')].filter(link => link.textContent === 'View details');
        assert.equal(actionLinks().length, 1);
        const link = actionLinks()[0];
        assert.equal(link.href, history[0].actionUrl);
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener noreferrer');
        assert.match(link.parentElement.textContent, /Campaign reward/);
        await click(link);
        assert.deepEqual(navigations, []);
        assert.equal(requests.filter(request => request.method === 'POST').length, 0, 'opening transaction details is read-only');

        await click(button('Outgoing (-)'));
        assert.equal(actionLinks().length, 0);
        assert.match(document.body.textContent, /Skin generation/);
        await click(button('Incoming (+)'));
        assert.equal(actionLinks().length, 1);
        assert.match(document.body.textContent, /Legacy reward/);
        assert.equal(document.body.textContent.includes('Skin generation'), false);
    }, [], history);
});
