const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('Space intro describes exactly two AI integrations in both languages', () => {
  for (const locale of ['en', 'zh-hans']) {
    const source = readFileSync(join(__dirname, `../src/constants/locales/${locale}.ts`), 'utf8');
    const modes = source.split('        agentModes: {')[1].split('        agentSetup: {')[0];
    assert.deepEqual([...modes.matchAll(/id: '([^']+)'/g)].map(match => match[1]), ['external', 'entity']);
    assert.match(modes, /AGENT BUILD/);
    assert.doesNotMatch(source, /\bAI BUILD\b/);
    assert.doesNotMatch(modes, /All three|Three AI|三种/);
    assert.match(modes, /spaceAPI/);
    assert.match(modes, /entityAPI/);
    assert.match(modes, /Apply/);
  }
});

test('Space agent cards use a two-column layout and show the Agent Build entry', () => {
  const source = readFileSync(join(__dirname, '../src/pages/SpacePage.tsx'), 'utf8');
  assert.match(source, /lg:grid-cols-2 gap-4">\s*\{data\.agentModes\.cards\.map/);
  const external = source.split('{isExternal ? (')[1].split(') : (')[0];
  assert.match(external, /card\.entry/);
  assert.match(external, /navigator\.clipboard\.writeText\(agentPrompt\)/);
});

test('main-site API-key instructions follow the shared Agent Prompt contract', () => {
  const source = readFileSync(join(__dirname, '../src/pages/SpaceApiKeysPage.tsx'), 'utf8');
  assert.match(source, /spaceAgentPrompt\(connection\.origin\)/);
  assert.doesNotMatch(source, /spaceAgentPrompt\(connection\.origin,/);
});

test('Space welcome page does not expose offline mode entries', () => {
  const source = readFileSync(join(__dirname, '../src/pages/SpacePage.tsx'), 'utf8');
  assert.doesNotMatch(source, /offlineSpaceAppUrl/);
  assert.doesNotMatch(source, /data\.offlineCta/);
});

test('Space intro presents the donut world as the only terrain mode', () => {
  for (const locale of ['en', 'zh-hans']) {
    const source = readFileSync(join(__dirname, `../src/constants/locales/${locale}.ts`), 'utf8');
    const spacePage = source.split('    space_page: {')[1];
    assert.doesNotMatch(spacePage, /Earth|earth|地球/);
    assert.match(spacePage, /Torus|甜甜圈/);
  }
});

test('Space entry points route to dedicated Space domain in production and local mount in dev', () => {
  const spacePageSource = readFileSync(join(__dirname, '../src/pages/SpacePage.tsx'), 'utf8');
  assert.match(spacePageSource, /import\.meta\.env\.DEV \? '\/space\/app\/' : 'https:\/\/space\.entropydrop\.com\/'/);

  const appSource = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');
  assert.match(appSource, /import\.meta\.env\.DEV \? '\/space\/app\/' : 'https:\/\/space\.entropydrop\.com\/'/);

  const loginSource = readFileSync(join(__dirname, '../src/pages/SpaceLoginPage.tsx'), 'utf8');
  assert.match(loginSource, /import\.meta\.env\.DEV \? '\/space\/app\/' : 'https:\/\/space\.entropydrop\.com\/'/);
});

test('Space login handoff page is English-only', () => {
  const loginSource = readFileSync(join(__dirname, '../src/pages/SpaceLoginPage.tsx'), 'utf8');
  assert.doesNotMatch(loginSource, /[\u3400-\u9fff]/);
  assert.match(loginSource, /Sign in to your EntropyDrop account before entering Space\./);
  assert.match(loginSource, /loadingText="Loading Google sign-in…"/);
});
