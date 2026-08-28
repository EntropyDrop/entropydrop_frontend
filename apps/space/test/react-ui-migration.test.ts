import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const COMPONENT_FILES = [
  '../src/ui/react/SpaceRoot.tsx',
  '../src/ui/react/components/Hud.tsx',
  '../src/ui/react/components/WorldWidgets.tsx',
  '../src/ui/react/components/SimpleModals.tsx',
  '../src/ui/react/components/InventoryModal.tsx',
  '../src/ui/react/components/EditorModal.tsx'
];

const componentSource = COMPONENT_FILES
  .map(file => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n');

const REQUIRED_UI_IDS = [
  'canvas-container', 'crosshair', 'hud-overlay', 'fps-val', 'ping-val', 'pos-val',
  'hud-entities-list', 'global-settings-btn', 'color-palette-bar', 'inventory-bar',
  'selector-panel-wrapper', 'hotbar', 'toast', 'code-editor-modal',
  'global-playback-group', 'component-tree-list', 'component-inspector-panel',
  'code-tab-bar', 'script-textarea', 'entity-preview-canvas', 'tele-console-logs',
  'agent-chat-box', 'blueprints-modal', 'blueprints-grid', 'inventory-modal',
  'inventory-grid', 'api-docs-modal', 'api-docs-body', 'global-settings-modal',
  'pause-screen', 'start-btn', 'minimap-container', 'nav-system-container', 'nav-start-btn'
];

test('React components own every stable game UI contract', () => {
  for (const id of REQUIRED_UI_IDS) {
    assert.match(componentSource, new RegExp(`id=[{]?['\"]${id}['\"]`), `missing React UI contract #${id}`);
  }
  assert.doesNotMatch(componentSource, /getElementById|querySelector|\.innerHTML\s*=|createElement\(/);
});

test('legacy UIManager is removed and the engine uses the DOM-free store', () => {
  const managerUrl = new URL('../src/ui/UIManager.ts', import.meta.url);
  const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const storeSource = readFileSync(new URL('../src/ui/react/store/SpaceUiStore.ts', import.meta.url), 'utf8');
  assert.equal(existsSync(managerUrl), false);
  assert.doesNotMatch(mainSource, /UIManager|uiManager/);
  assert.match(mainSource, /spaceUiStore/);
  assert.doesNotMatch(storeSource, /getElementById|querySelector|\.innerHTML\s*=|createElement\(/);
});

test('index.html contains only the auth gate and React host', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="space-entry-gate"/);
  assert.match(indexHtml, /id="space-react-root"/);
  assert.doesNotMatch(indexHtml, /id="canvas-container"|id="hud-overlay"|id="pause-screen"|id="inventory-modal"/);
});

test('React mounts synchronously before Game construction', () => {
  const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const mountIndex = mainSource.indexOf('mountSpaceUi();');
  const gameClassIndex = mainSource.indexOf('class Game');
  assert.ok(mountIndex >= 0 && mountIndex < gameClassIndex);
});
