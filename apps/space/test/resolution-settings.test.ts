import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';
import {
  DEFAULT_DISTANT_SURFACE_SETTINGS,
  normalizeDistantSurfaceSettings,
} from '../src/engine/render/DistantSurfaceLayer.ts';

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
    effectsQuality: 'reduced',
    nativePixelRatio: 2,
    effectivePixelRatio: 1.6,
  });
  assert.equal(store.getSnapshot().resolutionScaleMode, 'auto');
  assert.equal(store.getSnapshot().resolutionScale, 0.8);
  assert.equal(store.getSnapshot().resolutionPixelRatio, 1.6);
  assert.equal(store.getSnapshot().resolutionEffectsQuality, 'reduced');
});

test('world shape setting is applied immediately through the renderer bridge', () => {
  const applied: string[] = [];
  const lodEnabled: boolean[] = [];
  const renderer = {
    setWorldShapeMode(mode: string) {
      applied.push(mode);
      return mode;
    },
    getWorldShapeMode: () => applied.at(-1) || 'earth',
  };
  const store = new SpaceUiStore();
  store.setWorld({
    renderDistance: 8,
    getDistantSurfaceSettings: () => ({ ...DEFAULT_DISTANT_SURFACE_SETTINGS }),
    setDistantSurfaceEnabled(enabled: boolean) {
      lodEnabled.push(enabled);
      return enabled;
    },
  });

  store.setSceneRenderer(renderer);
  store.setWorldShapeMode('earth', false);
  store.setWorldShapeMode('torus', false);

  assert.equal(store.getSnapshot().worldShapeMode, 'torus');
  assert.deepEqual(applied, ['earth', 'earth', 'torus']);
  assert.deepEqual(lodEnabled, [false, false, false, true]);
});

test('distant terrain thresholds apply immediately through settings state', () => {
  const applied: any[] = [];
  const world = {
    renderDistance: 8,
    getDistantSurfaceSettings: () => ({ ...DEFAULT_DISTANT_SURFACE_SETTINGS }),
    setDistantSurfaceSettings(value: any) {
      const normalized = normalizeDistantSurfaceSettings(value);
      applied.push(normalized);
      return normalized;
    },
  };
  const store = new SpaceUiStore();
  store.setWorld(world);
  store.setDistantSurfaceSetting('lod32Distance', 3000, false);
  store.setDistantSurfaceSetting('connectionDistance', 0, false);
  store.setDistantSurfaceSetting('lod16Enabled', false, false);

  assert.equal(applied.length, 3);
  assert.equal(store.getSnapshot().distantSurfaceSettings.lod32Distance, 3000);
  assert.equal(store.getSnapshot().distantSurfaceSettings.connectionDistance, 0);
  assert.equal(store.getSnapshot().distantSurfaceSettings.lod16Enabled, false);
});
