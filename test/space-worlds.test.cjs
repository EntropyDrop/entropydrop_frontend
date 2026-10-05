const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

function load(entry, pageUrl = 'https://entropydrop.com/space/intro', browser = null) {
    const source = buildSync({ entryPoints: [path.join(root, entry)], bundle: true, write: false,
        platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-router-dom'],
        define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SPACE_URL: 'https://space.entropydrop.com/', VITE_API_BASE_URL: 'https://api.example.test' }) },
        loader: { '.css': 'empty' },
    }).outputFiles[0].text;
    const module = { exports: {} };
    const context = vm.createContext({ window: browser || { location: { href: pageUrl } },
        document: browser?.document, localStorage: browser?.localStorage, navigator: browser?.navigator,
        fetch: async () => new Response(JSON.stringify({ online_players: 0, max_online_players: 32 }), { headers: { 'Content-Type': 'application/json' } }),
        Response, Request, Headers, AbortController, DOMException,
        URL, URLSearchParams, console, require, module, exports: module.exports,
        setTimeout, clearTimeout, setInterval, clearInterval,
    });
    vm.runInContext(source, context);
    return module.exports;
}

for (const world of ['nature', 'copper-metropolis']) {
    test(`${world} survives login resolution and cross-origin token handoff`, () => {
        const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
        const { resolveSpaceDestination, spaceDestinationWithToken } = load('src/utils/spaceLogin.ts');
        const appUrl = 'https://space.entropydrop.com/?force_pc=1&world=default&token=old#view=world&token=old';
        const launch = new URL(spaceWorldLaunchUrl(appUrl, world, 'https://entropydrop.com/space/intro'), 'https://entropydrop.com');
        assert.equal(launch.pathname, '/space/login');
        assert.equal(launch.searchParams.has('token'), false);
        const destination = resolveSpaceDestination(launch.searchParams.get('destination'), appUrl, 'https://entropydrop.com/space/login');
        const result = new URL(spaceDestinationWithToken(destination, 'new-token', 'https://entropydrop.com'));
        assert.equal(result.origin, 'https://space.entropydrop.com');
        assert.equal(result.searchParams.get('world'), world);
        assert.equal(result.searchParams.get('force_pc'), '1');
        assert.equal(result.searchParams.has('token'), false);
        assert.equal(new URLSearchParams(result.hash.slice(1)).get('view'), 'world');
        assert.equal(new URLSearchParams(result.hash.slice(1)).get('token'), 'new-token');
    });

    test(`${world} survives a local same-origin handoff without exposing credentials`, () => {
        const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
        const { resolveSpaceDestination, spaceDestinationWithToken } = load('src/utils/spaceLogin.ts');
        const page = 'http://localhost:5173/space/login';
        const launch = new URL(spaceWorldLaunchUrl('/space/app/?force_pc=1', world, page), page);
        const destination = resolveSpaceDestination(launch.searchParams.get('destination'), '/space/app/', page);
        const result = new URL(spaceDestinationWithToken(destination, 'private-token', new URL(page).origin));
        assert.equal(result.pathname, '/space/app/');
        assert.equal(result.searchParams.get('world'), world);
        assert.equal(result.searchParams.get('force_pc'), '1');
        assert.equal(result.hash, '');
    });
}

test('configured development origin is preserved for both worlds', () => {
    const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
    const { resolveSpaceDestination } = load('src/utils/spaceLogin.ts');
    const target = 'https://space-dev-908123.entropydrop.com/';
    for (const world of ['nature', 'copper-metropolis']) {
        const launch = new URL(spaceWorldLaunchUrl(target, world, 'http://localhost:5173/space/intro'), 'http://localhost:5173');
        const resolved = resolveSpaceDestination(launch.searchParams.get('destination'), target, 'http://localhost:5173/space/login');
        assert.equal(resolved.origin, new URL(target).origin);
        assert.equal(resolved.searchParams.get('world'), world);
    }
});

for (const locale of ['en', 'zh-hans']) {
    test(`${locale} retains the original heading and specs with a single background carousel`, () => {
        const current = load(`src/constants/locales/${locale}.ts`).default;
        const { SpacePage } = load('src/pages/SpacePage.tsx');
        const dom = new JSDOM(renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SpacePage, { current }))));
        const hero = dom.window.document.querySelector('.space-world-hero');
        const heading = hero.querySelector('h1');
        assert.equal(heading.textContent, 'EntropyDrop Space');
        assert.ok(heading.className.includes('lg:text-6xl'));
        assert.ok(hero.textContent.includes('PHYSICS'));
        assert.ok(hero.textContent.includes('AI AGENT'));
        assert.ok(hero.textContent.includes('TORUS'));
        const images = [...dom.window.document.querySelectorAll('.space-world-background img')];
        assert.equal(images.length, 2);
        assert.equal(hero.querySelector('.space-world-background'), null);
        assert.equal(dom.window.document.querySelector('.space-world-page').className.includes('bg-transparent'), true);
        images.forEach(image => {
            assert.equal(image.getAttribute('alt'), '');
            assert.ok(fs.existsSync(path.join(root, 'public', image.getAttribute('src'))));
            assert.match(image.getAttribute('srcset'), /960w, .*1920w/);
        });
        assert.equal(hero.querySelectorAll('a').length, 1);
        assert.equal(hero.querySelectorAll('h1').length, 1);
        assert.equal(dom.window.document.querySelector('.space-worlds-grid'), null);
        const play = hero.querySelector('a');
        assert.ok(play.textContent.includes(current.space_page.primaryCta));
        assert.ok(play.textContent.includes('Nature'));
        assert.equal(new URL(new URL(play.href, 'https://entropydrop.com').searchParams.get('destination')).searchParams.get('world'), 'nature');
        assert.equal(hero.querySelectorAll('[aria-pressed]').length, 2);
        dom.window.close();
    });
}

for (const reducedMotion of [false, true]) {
    test(`manual world selection, both Play buttons and Agent Prompt stay synchronized (reduced motion: ${reducedMotion})`, async () => {
        const dom = new JSDOM('<div id="root"></div>', { url: 'https://entropydrop.com/space/intro', pretendToBeVisual: true });
        const browser = dom.window;
        browser.matchMedia = () => ({ matches: reducedMotion });
        const timers = new Map();
        let nextTimer = 0;
        browser.setInterval = (callback, ms) => { timers.set(++nextTimer, { callback, ms }); return nextTimer; };
        browser.clearInterval = id => timers.delete(id);
        const oldWindow = global.window, oldDocument = global.document;
        global.window = browser; global.document = browser.document;
        global.IS_REACT_ACT_ENVIRONMENT = true;
        const current = load('src/constants/locales/en.ts').default;
        const { SpacePage } = load('src/pages/SpacePage.tsx', browser.location.href, browser);
        const reactRoot = createRoot(browser.document.getElementById('root'));
        try {
            await React.act(() => reactRoot.render(React.createElement(MemoryRouter, null, React.createElement(SpacePage, { current }))));
            assert.equal([...timers.values()].some(timer => timer.ms === 12000), false);
            await React.act(async () => {
                for (const timer of timers.values()) timer.callback();
            });
            assert.ok(browser.document.querySelector('.space-world-background .is-active').src.endsWith('space_world_nature.webp'));
            const controls = [...browser.document.querySelectorAll('.space-world-controls button')];
            for (const [index, slug, image] of [[1, 'copper-metropolis', 'copper'], [0, 'nature', 'nature']]) {
                await React.act(() => controls[index].click());
                await React.act(async () => {
                    for (const timer of timers.values()) timer.callback();
                });
                assert.equal(controls[index].getAttribute('aria-pressed'), 'true');
                assert.ok(browser.document.querySelector('.space-world-background .is-active').src.endsWith(`space_world_${image}.webp`));
                const playButtons = [...browser.document.querySelectorAll('a[href^="/space/login?"]')];
                assert.equal(playButtons.length, 2);
                for (const button of playButtons) {
                    const destination = new URL(new URL(button.href).searchParams.get('destination'));
                    assert.equal(destination.searchParams.get('world'), slug);
                }
                const prompt = browser.document.querySelector('#space-agent-external pre');
                assert.ok(prompt.textContent.includes(`Target world: ${slug}.`));
                assert.equal([...timers.values()].some(timer => timer.ms === 12000), false);
            }
        } finally {
            await React.act(() => reactRoot.unmount());
            global.window = oldWindow; global.document = oldDocument;
            delete global.IS_REACT_ACT_ENVIRONMENT;
            dom.window.close();
        }
    });
}

test('unknown world labels never imply a fallback to Nature', () => {
    const { spaceEntranceWorldName } = load('src/utils/spaceWorlds.ts');
    assert.equal(spaceEntranceWorldName('default'), 'Nature');
    assert.equal(spaceEntranceWorldName('nature'), 'Nature');
    assert.equal(spaceEntranceWorldName('copper-metropolis'), 'Copper Metropolis');
    assert.equal(spaceEntranceWorldName('private-world-id'), null);
});

test('same-origin configured Space root preserves the world and blocks unrelated site paths', () => {
    const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
    const { resolveSpaceDestination, spaceDestinationWithToken } = load('src/utils/spaceLogin.ts');
    const origin = 'https://space-dev-908123.entropydrop.com';
    for (const world of ['nature', 'copper-metropolis']) {
        const launch = new URL(spaceWorldLaunchUrl(origin + '/', world, origin + '/space/intro'), origin);
        const target = resolveSpaceDestination(launch.searchParams.get('destination'), origin + '/', origin + '/space/login');
        assert.equal(target.searchParams.get('world'), world);
        assert.equal(new URL(spaceDestinationWithToken(target, 'private-token', origin)).searchParams.get('world'), world);
        assert.equal(new URL(spaceDestinationWithToken(target, 'private-token', origin)).hash, '');
    }
    for (const path of ['/skin/generate', '/space/login', '/space/intro', '/space/apikeys']) {
        assert.equal(resolveSpaceDestination(origin + path, origin + '/', origin + '/space/login').href, origin + '/');
    }
});
