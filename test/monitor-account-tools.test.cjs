const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');

test('Monitor looks up the recipient and submits a future Pro Plus expiry in UTC', async () => {
    const compiled = await build({
        stdin: {
            contents: `export { MonitorAccountTools } from './src/components/MonitorAccountTools';
                export { default as current } from './src/constants/locales/zh-hans';`,
            resolveDir: path.resolve(__dirname, '..'),
            loader: 'tsx',
        },
        bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
        external: ['react', 'react/jsx-runtime', '@iconify/react', 'monitor-api'],
        plugins: [{ name: 'mock-api', setup(build) {
            build.onResolve({ filter: /\/utils\/api$/ }, () => ({ path: 'monitor-api', external: true }));
        } }],
    });
    const { window } = new JSDOM('<div id="root"></div>');
    const requests = [];
    const target = { email: 'target@example.com', username: 'Target Player' };
    const api = {
        apiResponseJson: response => response.json(),
        async apiFetch(url, { method, body }) {
            const payload = JSON.parse(body);
            requests.push({ url, method, payload });
            if (url === '/api/monitor/users/lookup' && payload.email.toLowerCase() === target.email) {
                return Response.json(target);
            }
            if (url === '/api/monitor/users/gift-pro-plus' && payload.email === target.email) {
                return Response.json({ email: target.email, expires_at: payload.expires_at });
            }
            return Response.json({ detail: 'User not found' }, { status: 404 });
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled.outputFiles[0].text, {
        module, exports: module.exports, FormData: window.FormData,
        require: name => name === 'monitor-api' ? api : name === '@iconify/react' ? { Icon: () => null } : require(name),
    });
    const { MonitorAccountTools, current } = module.exports;
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window;
    global.document = window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const node = window.document.getElementById('root');
    const root = require('react-dom/client').createRoot(node);
    const input = name => node.querySelector(`input[name="${name}"]`);
    const enter = (field, value) => React.act(() => {
        input(field).value = value;
        input(field).dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const submit = field => React.act(() => input(field).form.querySelector('button').click());
    let statsRefreshes = 0;

    try {
        await React.act(() => root.render(React.createElement(MonitorAccountTools, {
            current, onGift: () => statsRefreshes++,
        })));
        assert.equal(input('expires_at'), null);

        await enter('email', 'missing@example.com');
        await submit('email');
        assert.match(node.textContent, /未找到该邮箱对应的账号/);
        assert.equal(input('expires_at'), null);

        await enter('email', 'TARGET@example.com');
        await submit('email');
        assert.match(node.textContent, /Target Player/);

        await enter('expires_at', '2000-01-01T12:00');
        await submit('expires_at');
        assert.equal(requests.length, 2);
        assert.match(input('expires_at').validationMessage, /未来/);

        const year = new Date().getFullYear() + 1;
        await enter('expires_at', `${year}-06-15T16:30`);
        await submit('expires_at');
        assert.deepEqual(requests.at(-1), {
            url: '/api/monitor/users/gift-pro-plus',
            method: 'POST',
            payload: { email: target.email, expires_at: new Date(year, 5, 15, 16, 30).toISOString() },
        });
        assert.match(node.textContent, /已向 target@example\.com 赠送 Pro Plus/);
        assert.equal(statsRefreshes, 1);

        await enter('email', 'changed@example.com');
        assert.equal(input('expires_at'), null);
        assert.doesNotMatch(node.textContent, /Target Player/);
    } finally {
        await React.act(() => root.unmount());
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        window.close();
    }
});
