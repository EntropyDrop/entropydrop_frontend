import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';

test('resolution setting is applied to the renderer and follows automatic updates', () => {
  const applied: Array<'auto' | number> = [];
  const renderer: any = {
    setResolutionScale(setting: 'auto' | number) {
      applied.push(setting);
      const scale = setting === 'auto' ? 1 : setting;
      return {
        mode: setting === 'auto' ? 'auto' : 'fixed',
        scale,
        fixedScale: scale,
        averageFrameMs: 1000 / 60,
        nativePixelRatio: 2,
        effectivePixelRatio: 2 * scale,
      };
    },
  };
  const store = new SpaceUiStore();

  store.setSceneRenderer(renderer);
  store.setResolutionScale('0.67', false);

  assert.deepEqual(applied, ['auto', 0.67]);
  assert.equal(store.getSnapshot().resolutionScaleMode, '0.67');
  assert.equal(store.getSnapshot().resolutionScale, 0.67);
  assert.equal(store.getSnapshot().resolutionPixelRatio, 1.34);

  renderer.onResolutionScaleChange({
    mode: 'auto',
    scale: 0.8,
    fixedScale: 0.67,
    averageFrameMs: 16.5,
    nativePixelRatio: 2,
    effectivePixelRatio: 1.6,
  });
  assert.equal(store.getSnapshot().resolutionScaleMode, 'auto');
  assert.equal(store.getSnapshot().resolutionScale, 0.8);
  assert.equal(store.getSnapshot().resolutionPixelRatio, 1.6);
});
