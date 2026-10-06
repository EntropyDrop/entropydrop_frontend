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

for (const world of ['aether-archipelago', 'nature', 'copper-metropolis']) {
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

test('configured development origin is preserved for all published worlds', () => {
    const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
    const { resolveSpaceDestination } = load('src/utils/spaceLogin.ts');
    const target = 'https://space-dev-908123.entropydrop.com/';
    for (const world of ['aether-archipelago', 'nature', 'copper-metropolis']) {
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
        assert.equal(images.length, 3);
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
        assert.ok(play.getAttribute('aria-label').includes('Aether Archipelago'));
        assert.equal(play.closest('.space-world-choice').querySelector('button').getAttribute('aria-pressed'), 'true');
        assert.equal(new URL(new URL(play.href, 'https://entropydrop.com').searchParams.get('destination')).searchParams.get('world'), 'aether-archipelago');
        assert.equal(hero.querySelectorAll('[aria-pressed]').length, 3);
        dom.window.close();
    });
}

for (const reducedMotion of [false, true]) {
    test(`5-second autoplay and manual selection keep Play and Agent Prompt in the active world (reduced motion: ${reducedMotion})`, async () => {
        const dom = new JSDOM('<div id="root"></div>', { url: 'https://entropydrop.com/space/intro', pretendToBeVisual: true });
        const browser = dom.window;
        browser.matchMedia = () => ({ matches: reducedMotion });
        let visibility = 'visible';
        Object.defineProperty(browser.document, 'visibilityState', { get: () => visibility, configurable: true });
        const timers = new Map();
        let nextTimer = 0;
        browser.setInterval = (callback, ms) => { timers.set(++nextTimer, { callback, ms }); return nextTimer; };
        browser.clearInterval = id => timers.delete(id);
        const oldWindow = global.window, oldDocument = global.document;
        global.window = browser; global.document = browser.document;
        global.IS_REACT_ACT_ENVIRONMENT = true;
        const current = load('src/constants/locales/en.ts').default;
        const { SpacePage } = load('src/pages/SpacePage.tsx', browser.location.href, browser);
        const { spaceAgentPrompt } = load('../entropydrop_space/client/src/bootstrap/SpaceAgentGuide.ts');
        const reactRoot = createRoot(browser.document.getElementById('root'));
        const carouselTimer = () => [...timers.values()].find(timer => timer.ms === 5000);
        const verifyWorld = (slug, image) => {
            const active = browser.document.querySelector('.space-world-select[aria-pressed="true"]');
            assert.equal(browser.document.querySelectorAll('.space-world-select[aria-pressed="true"]').length, 1);
            assert.ok(browser.document.querySelector('.space-world-background .is-active').src.endsWith(`space_world_${image}.webp`));
            const heroPlay = browser.document.querySelector('.space-world-hero a');
            assert.equal(heroPlay.parentElement, active.parentElement);
            const playButtons = [...browser.document.querySelectorAll('a[href^="/space/login?"]')];
            assert.equal(playButtons.length, 2);
            for (const button of playButtons) {
                const destination = new URL(new URL(button.href).searchParams.get('destination'));
                assert.equal(destination.searchParams.get('world'), slug);
            }
            assert.equal(browser.document.querySelector('#space-agent-external pre').textContent, spaceAgentPrompt('https://api.example.test', slug));
        };
        const tick = async () => {
            const timer = carouselTimer();
            assert.ok(timer, 'autoplay uses a 5-second timer');
            await React.act(() => timer.callback());
        };
        try {
            await React.act(() => reactRoot.render(React.createElement(MemoryRouter, null, React.createElement(SpacePage, { current }))));
            verifyWorld('aether-archipelago', 'aether');
            for (const [slug, image] of [['nature', 'nature'], ['copper-metropolis', 'copper'], ['aether-archipelago', 'aether']]) {
                await tick();
                verifyWorld(slug, image);
            }
            const controls = [...browser.document.querySelectorAll('.space-world-select')];
            for (const [index, slug, image] of [[2, 'copper-metropolis', 'copper'], [1, 'nature', 'nature'], [0, 'aether-archipelago', 'aether']]) {
                await React.act(() => controls[index].click());
                assert.equal(controls[index].getAttribute('aria-pressed'), 'true');
                verifyWorld(slug, image);
                assert.ok(carouselTimer());
            }
            const group = browser.document.querySelector('.space-world-controls');
            await React.act(() => group.dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true, relatedTarget: browser.document.body })));
            assert.equal(carouselTimer(), undefined, 'hover pauses autoplay while choosing Play');
            await React.act(() => group.dispatchEvent(new browser.MouseEvent('mouseout', { bubbles: true, relatedTarget: browser.document.body })));
            assert.ok(carouselTimer(), 'autoplay resumes after hover');
            await React.act(() => controls[0].focus());
            assert.equal(carouselTimer(), undefined, 'keyboard focus pauses autoplay');
            await React.act(() => controls[0].blur());
            assert.ok(carouselTimer(), 'autoplay resumes after focus leaves');
            visibility = 'hidden';
            await tick();
            verifyWorld('aether-archipelago', 'aether');
            visibility = 'visible';
            await tick();
            verifyWorld('nature', 'nature');
        } finally {
            await React.act(() => reactRoot.unmount());
            assert.equal(timers.size, 0, 'unmount clears carousel and population timers');
            global.window = oldWindow; global.document = oldDocument;
            delete global.IS_REACT_ACT_ENVIRONMENT;
            dom.window.close();
        }
    });
}

test('unknown world labels never imply a fallback to Nature', () => {
    const { spaceEntranceWorldName } = load('src/utils/spaceWorlds.ts');
    assert.equal(spaceEntranceWorldName('default'), 'Aether Archipelago');
    assert.equal(spaceEntranceWorldName(null), 'Aether Archipelago');
    assert.equal(spaceEntranceWorldName('aether-archipelago'), 'Aether Archipelago');
    assert.equal(spaceEntranceWorldName('nature'), 'Nature');
    assert.equal(spaceEntranceWorldName('copper-metropolis'), 'Copper Metropolis');
    assert.equal(spaceEntranceWorldName('private-world-id'), null);
});

test('same-origin configured Space root preserves the world and blocks unrelated site paths', () => {
    const { spaceWorldLaunchUrl } = load('src/utils/spaceWorlds.ts');
    const { resolveSpaceDestination, spaceDestinationWithToken } = load('src/utils/spaceLogin.ts');
    const origin = 'https://space-dev-908123.entropydrop.com';
    for (const world of ['aether-archipelago', 'nature', 'copper-metropolis']) {
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
