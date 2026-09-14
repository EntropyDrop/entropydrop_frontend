const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('Space welcome page does not expose offline mode entries', () => {
  const source = readFileSync(join(__dirname, '../src/pages/SpacePage.tsx'), 'utf8');
  assert.doesNotMatch(source, /offlineSpaceAppUrl/);
  assert.doesNotMatch(source, /data\.offlineCta/);
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
