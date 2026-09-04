import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';


test('Space UI shows queue position and can cancel while remaining offline', async () => {
  const store = new SpaceUiStore();
  let cancelled = 0;
  store.setSessionState('offline', 12, async () => {
    cancelled += 1;
    store.setSessionState('offline', null, null);
  });

  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().queuePosition, 12);
  await store.cancelSpaceQueue();
  assert.equal(cancelled, 1);
  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().queuePosition, null);
});

test('a completed queue waits for the player to choose online or offline Space', async () => {
  const store = new SpaceUiStore();
  let enteredOnline = 0;
  let stayedOffline = 0;
  store.setSessionState(
    'offline',
    null,
    async () => {
      stayedOffline += 1;
      store.setSessionState('offline');
    },
    true,
    () => {
      enteredOnline += 1;
    }
  );

  assert.equal(store.getSnapshot().onlineReady, true);
  assert.equal(enteredOnline, 0);

  store.enterOnlineSpace();
  assert.equal(enteredOnline, 1);

  await store.cancelSpaceQueue();
  assert.equal(stayedOffline, 1);
  assert.equal(store.getSnapshot().sessionMode, 'offline');
  assert.equal(store.getSnapshot().onlineReady, false);
});

test('Space UI keeps skin setup guidance available in settings', () => {
  const store = new SpaceUiStore();
  assert.equal(store.getSnapshot().skinWarning, null);

  store.setSkinWarning('Default skin is in use.');
  assert.equal(store.getSnapshot().skinWarning, 'Default skin is in use.');
});


test('both Space welcome surfaces expose a direct offline entry', () => {
  const appHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const welcomeSource = readFileSync(
    new URL('../../../src/pages/SpacePage.tsx', import.meta.url),
    'utf8'
  );

  assert.match(appHtml, /\?mode=offline/);
  assert.match(welcomeSource, /offlineSpaceAppUrl/);
  assert.match(welcomeSource, /data\.offlineCta/);
});
