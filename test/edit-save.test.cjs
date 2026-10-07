const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');

const compiled = build({
    stdin: {
        contents: `export { EditPage } from './src/pages/EditPage';
            export { default as current } from './src/constants/locales/en';`,
        resolveDir: path.resolve(__dirname, '..'), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-router-dom', 'editor-visuals'],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.example.test') },
    // Keep saving, license resolution and authentication real; replace graphics.
    plugins: [{ name: 'editor-visuals', setup(build) {
        build.onResolve({ filter: /^(?:three|@iconify\/react)$|\/components\/(?:MC|utils)$/ },
            () => ({ path: 'editor-visuals', external: true }));
    } }],
}).then(result => result.outputFiles[0].text);

async function mount({ isPro = true, parent = null, previewFails = false, confirmImport = true } = {}) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.example.test/skin/edit' });
    const { window } = dom;
    window.localStorage.setItem('token', 'editor-user');
    const writes = [];
    const imageLoads = [];
    window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect() {}, drawImage() {}, putImageData() {},
        getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    });
    window.HTMLCanvasElement.prototype.toBlob = callback => callback(new Blob(['skin'], { type: 'image/png' }));
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,c2tpbg==';
    const visuals = {
        Icon: ({ icon }) => React.createElement('svg', { 'data-icon': icon }), MC: () => null,
        CanvasTexture: class { dispose() {} }, NearestFilter: 1, SRGBColorSpace: 'srgb',
        Skin2D: () => new Promise(resolve => imageLoads.push(() => resolve(window.document.createElement('canvas')))),
        isSlim: () => false, convertSkinLayout() {},
    };
    const module = { exports: {} };
    vm.runInNewContext(await compiled, {
        module, exports: module.exports,
        require: name => name === 'editor-visuals' ? visuals : require(name),
        window, localStorage: window.localStorage, document: window.document, navigator: window.navigator,
        Image: class { width = 64; height = 64; set src(value) { imageLoads.push(() => this.onload?.()); } },
        FileReader: class { readAsDataURL() { queueMicrotask(() => this.onload?.({ target: { result: 'data:image/png;base64,c2tpbg==' } })); } },
        fetch: async (input, options) => {
            const url = new URL(input);
            let data;
            if (options.method === 'POST') {
                writes.push({ path: url.pathname, body: options.body });
                data = { id: 'saved' };
            } else if (url.pathname === '/api/licenses/preview') {
                if (previewFails) return new Response('{}', { status: 403 });
                data = { code: parent ? (String(parent.creator.id) === '42' ? parent.license.code : 'cc-by-nc-4.0')
                    : url.searchParams.get('source_rights') === 'original' ? 'original-work' : 'source-license',
                    is_pro: isPro, parent_is_private: parent?.is_public === false, public_license: 'cc-by-nc-4.0' };
            } else data = url.pathname === '/api/users/me' ? { id: '42', is_pro: isPro } : parent;
            return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        },
        Headers, Request, Response, URL, URLSearchParams, FormData, Blob, AbortController, DOMException, atob,
        Event: window.Event, CustomEvent: window.CustomEvent, setTimeout, clearTimeout, console,
    });
    const { EditPage, current } = module.exports;
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = window; global.document = window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(window.document.getElementById('root'));
    const state = parent ? { textureUrl: 'https://cdn.example.test/skin.png', passedLogId: parent.id, isPublic: parent.is_public } : undefined;
    await React.act(() => root.render(React.createElement(MemoryRouter,
        { initialEntries: [{ pathname: '/skin/edit', state }] }, React.createElement(EditPage, { current }))));
    await React.act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    const env = {
        node: window.document.getElementById('root'), window, current, writes,
        async close() {
            await React.act(() => root.unmount());
            global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
            window.close();
        },
    };
    await React.act(async () => {
        for (const load of imageLoads.splice(0)) load();
        await new Promise(resolve => setImmediate(resolve));
    });
    env.pickImport = async () => {
        const input = env.node.querySelector('#import-input');
        Object.defineProperty(input, 'files', { value: [new File(['skin'], 'skin.png', { type: 'image/png' })], configurable: true });
        await React.act(async () => {
            input.dispatchEvent(new window.Event('change', { bubbles: true }));
            await new Promise(resolve => setImmediate(resolve));
            for (const load of imageLoads.splice(0)) load();
        });
    };
    if (!parent) {
        await env.pickImport();
        if (confirmImport) await click(env, env.current.edit.confirmImport);
    }
    return env;
}

async function click(env, text) {
    const button = [...env.node.querySelectorAll('button')].find(node =>
        node.textContent === text || [...node.children].some(child => child.textContent === text));
    assert.ok(button, `Missing button: ${text}`);
    assert.equal(button.disabled, false);
    await React.act(async () => {
        button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
        await new Promise(resolve => setImmediate(resolve));
    });
}

for (const isPro of [false, true]) {
    test(`editor public imports preserve source rights for ${isPro ? 'Pro' : 'Free'} accounts`, async () => {
        const env = await mount({ isPro });
        try {
            await click(env, env.current.edit.collect);
            assert.ok(env.node.textContent.includes(env.current.edit.publicSaveLicenseNotice));
            assert.equal(env.node.textContent.includes(env.current.skinLicense.yourRights), false);
            assert.equal(env.node.querySelector('[role="radiogroup"]'), null);
            assert.equal(env.node.textContent.includes(env.current.skinLicense.sourceTitle), false);
            await click(env, env.current.edit.saveAsPublic);
            assert.equal(env.writes.length, 0, 'Publication awaits explicit confirmation');
            assert.ok(env.node.textContent.includes(env.current.edit.publicSaveRightsMessage));
            await click(env, env.current.modal.confirm);
            assert.equal(env.writes.length, 1);
            assert.equal(env.writes[0].path, '/api/collections/creations_public/upload');
            assert.equal(env.writes[0].body.get('mode'), 'human_upload');
            assert.equal(env.writes[0].body.has('source_rights'), false);
            assert.equal(env.writes[0].body.get('license_consent'), 'true');
            assert.equal(env.writes[0].body.has('requested_license'), false);
            assert.equal(env.writes[0].body.get('public_license_consent'), 'true');
        } finally { await env.close(); }
    });
}

test('editor private imports keep source rights without public confirmation or license choice', async () => {
    const env = await mount();
    try {
        await click(env, env.current.edit.collect);
        assert.equal(env.node.querySelector('[role="radiogroup"]'), null);
        assert.ok(env.node.textContent.includes(env.current.edit.privateSaveLicenseNotice));
        await click(env, env.current.edit.saveAsPrivate);
        assert.equal(env.writes[0].path, '/api/collections/creations_private/upload');
        assert.equal(env.writes[0].body.has('source_rights'), false);
        assert.equal(env.writes[0].body.get('license_consent'), 'true');
        assert.equal(env.writes[0].body.get('public_license_consent'), 'false');
    } finally { await env.close(); }
});

test('existing private edits inherit without a license panel or public prompt', async () => {
    const env = await mount({ parent: { id: 'private-parent', is_public: false,
        creator: { id: '42' }, license: { code: 'entropydrop-commercial-1.0' } } });
    try {
        await click(env, env.current.edit.collect);
        assert.equal(env.node.textContent.includes(env.current.skinLicense.yourRights), false);
        assert.ok(env.node.textContent.includes(env.current.skinLicense.privateInherited));
        const publicSave = [...env.node.querySelectorAll('button')].find(node => node.textContent === env.current.edit.saveAsPublic);
        assert.equal(publicSave.disabled, true);
        await click(env, env.current.edit.saveAsPrivate);
        assert.equal(env.writes[0].body.get('parent'), 'private-parent');
        assert.equal(env.writes[0].body.has('source_rights'), false);
        assert.equal(env.writes[0].body.has('requested_license'), false);
    } finally { await env.close(); }
});

test('import requires upload/edit confirmation and allows canceling then choosing the same file', async () => {
    const env = await mount({ confirmImport: false });
    try {
        assert.ok(env.node.textContent.includes(env.current.edit.importRightsMessage));
        assert.equal([...env.node.querySelectorAll('button')].some(button => button.title === env.current.edit.collect), false);
        assert.equal(env.writes.length, 0);
        await click(env, env.current.modal.cancel);
        assert.equal(env.node.querySelector('[role="dialog"]'), null);
        await env.pickImport();
        await click(env, env.current.edit.confirmImport);
        await click(env, env.current.edit.collect);
        assert.equal(env.node.textContent.includes(env.current.skinLicense.sourceTitle), false);
        await click(env, env.current.edit.saveAsPrivate);
        assert.equal(env.writes.length, 1);
        assert.equal(env.writes[0].body.get('license_consent'), 'true');
        assert.equal(env.writes[0].body.has('source_rights'), false);
        assert.equal(env.writes[0].body.get('public_license_consent'), 'false');
    } finally { await env.close(); }
});

test('canceling replacement import preserves the current skin and its inherited permissions', async () => {
    const env = await mount({ parent: { id: 'private-parent', is_public: false,
        creator: { id: '42' }, license: { code: 'entropydrop-commercial-1.0' } } });
    try {
        await env.pickImport();
        assert.ok(env.node.textContent.includes(env.current.edit.importRightsMessage));
        await click(env, env.current.modal.cancel);
        await click(env, env.current.edit.collect);
        await click(env, env.current.edit.saveAsPrivate);
        assert.equal(env.writes[0].body.get('parent'), 'private-parent');
        assert.equal(env.writes[0].body.get('mode'), 'human_edit');
        assert.equal(env.writes[0].body.has('license_consent'), false);
    } finally { await env.close(); }
});

test('a failed permission preview disables both saves', async () => {
    const env = await mount({ previewFails: true });
    try {
        await click(env, env.current.edit.collect);
        for (const label of [env.current.edit.saveAsPublic, env.current.edit.saveAsPrivate]) {
            assert.equal([...env.node.querySelectorAll('button')].find(node => node.textContent.includes(label)).disabled, true);
        }
        assert.equal(env.writes.length, 0);
    } finally { await env.close(); }
});
