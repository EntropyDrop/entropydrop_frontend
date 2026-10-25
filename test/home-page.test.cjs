const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('Home page localization contains all 3 business lines and creative loop in en and zh-hans', () => {
    for (const locale of ['en', 'zh-hans']) {
        const source = readFileSync(join(__dirname, `../src/constants/locales/${locale}.ts`), 'utf8');
        assert.match(source, /nav:\s*\{[\s\S]*home:\s*['"][^'"]+['"]/);
        assert.match(source, /home:\s*\{/);
        assert.match(source, /loop:\s*\{/);
        assert.match(source, /services:\s*\{/);
        assert.match(source, /skin:\s*\{/);
        assert.match(source, /space:\s*\{/);
        assert.match(source, /figure:\s*\{/);
        assert.match(source, /openSource:\s*\{/);
    }
});

test('Home page zh-hans localization avoids mixed English labels and tags', () => {
    const zhSource = readFileSync(join(__dirname, '../src/constants/locales/zh-hans.ts'), 'utf8');
    const homeSection = zhSource.slice(zhSource.indexOf('home: {'));
    assert.doesNotMatch(homeSection, /OPEN-SOURCE CREATOR ECOSYSTEM/);
    assert.doesNotMatch(homeSection, /THE CREATIVE LOOP/);
    assert.doesNotMatch(homeSection, /AI AVATAR FORGE/);
    assert.doesNotMatch(homeSection, /VOXEL MULTIVERSE/);
    assert.doesNotMatch(homeSection, /PHYSICAL REALITY/);
    assert.doesNotMatch(homeSection, /OPEN SOURCE & TRANSPARENT/);
    assert.doesNotMatch(homeSection, /Agent Ready/);
    assert.doesNotMatch(homeSection, /程序化 Realm/);
});

test('TOP_NAV_ITEMS contains home navigation item pointing to /', () => {
    const navSource = readFileSync(join(__dirname, '../src/constants/nav.ts'), 'utf8');
    assert.match(navSource, /\{ key: 'home', icon: 'pixelarticons:home', path: '\/' \}/);
});

test('App.tsx defines HomePage route on / and redirects /home to /', () => {
    const appSource = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');
    assert.match(appSource, /const HomePage = lazy\(/);
    assert.match(appSource, /<Route path="\/" element=\{<HomePage current=\{currentLangData\} \/>\} \/>/);
    assert.match(appSource, /<Route path="\/home" element=\{<Navigate to="\/" replace \/>\} \/>/);
});

test('Layout.tsx wraps the brand logo in a link pointing to / and handles isHomeSection', () => {
    const layoutSource = readFileSync(join(__dirname, '../src/components/Layout.tsx'), 'utf8');
    assert.match(layoutSource, /const isHomeSection = location\.pathname === '\/'/);
    assert.match(layoutSource, /<Link\s+to="\/"[^>]*>\s*<h1/);
});

test('HomePage.tsx introduces the 3 business lines with direct CTA links', () => {
    const homeSource = readFileSync(join(__dirname, '../src/pages/HomePage.tsx'), 'utf8');
    // Skin Studio
    assert.match(homeSource, /\/skin\/generate/);
    // Space Voxel Multiverse
    assert.match(homeSource, /\/space\/intro/);
    // 3D Printed Figures
    assert.match(homeSource, /\/figure\/3dprint/);
    // Open source / transparency
    assert.match(homeSource, /github\.com\/EntropyDrop/);
    assert.match(homeSource, /huggingface\.co\/EntropyDrop/);
    assert.match(homeSource, /\/public\/ledger/);
});

test('HomePage.tsx uses smooth horizontal translucent Aether background (sides transparent, center semi-transparent) and physical figure photo', () => {
    const homeSource = readFileSync(join(__dirname, '../src/pages/HomePage.tsx'), 'utf8');
    assert.match(homeSource, /\/images\/space_world_aether\.webp/);
    assert.match(homeSource, /\/images\/figure_physical_showcase\.jpg/);
    assert.match(homeSource, /linear-gradient\(90deg,\s*rgba\(6,11,8,0\)\s*0%/);
    assert.match(homeSource, /bg-\[\#1b2420\]/);
});

test('HomePage.tsx implements Apple-style progressive scroll reveal for copy and products', () => {
    const homeSource = readFileSync(join(__dirname, '../src/pages/HomePage.tsx'), 'utf8');
    assert.match(homeSource, /function ScrollReveal\(/);
    assert.match(homeSource, /IntersectionObserver/);
    assert.match(homeSource, /cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    assert.match(homeSource, /<ScrollReveal\s+delay=\{/);
});
