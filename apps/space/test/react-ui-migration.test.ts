import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spaceUiMarkup } from '../src/ui/react/spaceUiMarkup.ts';

const REQUIRED_UI_IDS = [
  'crosshair',
  'hud-overlay',
  'fps-val',
  'ping-val',
  'pos-val',
  'hud-entities-list',
  'global-settings-btn',
  'color-palette-bar',
  'inventory-bar',
  'selector-panel-wrapper',
  'hotbar',
  'toast',
  'code-editor-modal',
  'global-playback-group',
  'component-tree-list',
  'component-inspector-panel',
  'code-tab-bar',
  'script-textarea',
  'entity-preview-canvas',
  'tele-console-logs',
  'agent-chat-box',
  'blueprints-modal',
  'blueprints-grid',
  'inventory-modal',
  'inventory-grid',
  'api-docs-modal',
  'api-docs-body',
  'global-settings-modal',
  'pause-screen',
  'start-btn',
  'minimap-container',
  'nav-system-container',
  'nav-start-btn'
];

test('React UI markup preserves every stable UIManager DOM contract without duplicate ids', () => {
  const ids = [...spaceUiMarkup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

  assert.equal(ids.length, 115, 'the complete migrated interface should stay structurally complete');
  assert.equal(new Set(ids).size, ids.length, 'React UI must not contain duplicate ids');
  for (const id of REQUIRED_UI_IDS) {
    assert.ok(ids.includes(id), `missing engine UI contract #${id}`);
  }
});

test('index.html contains only bootstrap hosts; game overlays are React-owned', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="space-entry-gate"/);
  assert.match(indexHtml, /id="canvas-container"/);
  assert.match(indexHtml, /id="space-react-root"/);
  assert.doesNotMatch(indexHtml, /id="hud-overlay"|id="pause-screen"|id="inventory-modal"/);
});

test('React mounts before UIManager construction so engine bindings cannot race the DOM', () => {
  const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const mountIndex = mainSource.indexOf('mountSpaceUi();');
  const gameClassIndex = mainSource.indexOf('class Game');
  assert.ok(mountIndex >= 0 && mountIndex < gameClassIndex);
});
