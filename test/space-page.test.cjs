const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('Space welcome page does not expose offline mode entries', () => {
  const source = readFileSync(join(__dirname, '../src/pages/SpacePage.tsx'), 'utf8');
  assert.doesNotMatch(source, /offlineSpaceAppUrl/);
  assert.doesNotMatch(source, /data\.offlineCta/);
});
