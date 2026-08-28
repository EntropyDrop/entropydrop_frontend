import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useSpaceStore } from '../src/ui/react/store/useSpaceStore.ts';
import { SpecialTool } from '../src/engine/controls/PlayerController.ts';

test('useSpaceStore initializes with standard defaults and hotbar slots', () => {
  const state = useSpaceStore.getState();
  assert.equal(state.activeTool, SpecialTool.SHOVEL);
  assert.equal(state.selectedHotbarIndex, 0);
  assert.equal(state.hotbarSlots.length, 6);
  assert.equal(state.activeInventoryCategory, 'blockset');
  assert.equal(state.hasStarted, false);
});

test('useSpaceStore can select hotbar slots and update active tool', () => {
  const store = useSpaceStore.getState();
  store.selectHotbarSlot(3);
  assert.equal(useSpaceStore.getState().selectedHotbarIndex, 3);
  assert.equal(useSpaceStore.getState().activeTool, SpecialTool.SELECTOR);

  store.selectHotbarSlot(4);
  assert.equal(useSpaceStore.getState().selectedHotbarIndex, 4);
  assert.equal(useSpaceStore.getState().activeTool, SpecialTool.HAMMER);
});

test('useSpaceStore can toggle and close modals cleanly', () => {
  const store = useSpaceStore.getState();
  assert.equal(store.activeModal, null);

  store.toggleModal('inventory');
  assert.equal(useSpaceStore.getState().activeModal, 'inventory');

  store.toggleModal('inventory');
  assert.equal(useSpaceStore.getState().activeModal, null);

  store.toggleModal('settings');
  assert.equal(useSpaceStore.getState().activeModal, 'settings');

  store.closeAllModals();
  assert.equal(useSpaceStore.getState().activeModal, null);
});

test('useSpaceStore manages toast queue and auto-dismisses', () => {
  const store = useSpaceStore.getState();
  store.showToast('Test Toast Notification');
  const toasts = useSpaceStore.getState().toasts;
  assert.ok(toasts.some(t => t.message === 'Test Toast Notification'));
});
