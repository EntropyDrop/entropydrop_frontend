import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../src/engine/audio/SoundManager.ts';
import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';

test('SoundManager supports setMuted, getMuted, and toggleMute', () => {
  const sound = new SoundManager();
  assert.equal(sound.getMuted(), false);

  sound.setMuted(true);
  assert.equal(sound.getMuted(), true);

  sound.toggleMute();
  assert.equal(sound.getMuted(), false);

  sound.toggleMute();
  assert.equal(sound.getMuted(), true);
});

test('SpaceUiStore setMuted syncs state, notifies controller, and updates snapshot', () => {
  const sound = new SoundManager();
  const controller: any = {
    sound,
    fov: 75,
    perspective: 'first_person',
    thirdPersonDistance: 4
  };

  const ui = new SpaceUiStore();
  ui.setController(controller);

  assert.equal(ui.getSnapshot().isMuted, false);

  ui.setMuted(true);
  assert.equal(ui.getSnapshot().isMuted, true);
  assert.equal(sound.getMuted(), true);

  ui.toggleMute();
  assert.equal(ui.getSnapshot().isMuted, false);
  assert.equal(sound.getMuted(), false);
});
