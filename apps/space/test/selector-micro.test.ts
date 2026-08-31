import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Contraption } from '../src/engine/contraption/Contraption.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';
import { ActionDomain, executeBasicAction } from '../src/engine/actions/BasicActions.ts';
import { SceneRenderer } from '../src/engine/render/SceneRenderer.ts';
import { SpaceUiStore } from '../src/ui/react/store/SpaceUiStore.ts';

/**
 * Selector tool micro-block selection mode:
 * - Tab toggles between standard 1 m block selection (the default) and
 *   0.2 m micro-block selection while the Selector tool is active.
 * - Micro single-cell toggles target the surface micro cell under the crosshair.
 * - Micro 2-point boxes materialize into the existing micro voxels they contain.
 * - G/T/Del operate on the sparse micro selection.
 */

function makeMicroController(overrides: any = {}) {
  const controller: any = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.selectorMicroMode = false;
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = { hit: false };
  controller.inventorySlots = new Array(9).fill(null);
  controller.selectedInventoryIndex = 0;
  controller.inventories = null;
  controller.keys = {};
  controller.contraptions = overrides.manager || null;
  controller.world = overrides.world || null;
  controller.particles = { emitBlockBreak() {} };
  controller.sound = { playBlockBreak() {}, playWrenchClick() {} };
  const toasts: string[] = [];
  controller.ui = {
    showToast: m => toasts.push(m),
    renderInventoryBar() {},
    notifyContraptionStructureChanged() {}
  };
  Object.assign(controller, overrides);
  controller.__toasts = toasts;
  return controller;
}

/** Lightweight world stub exposing just the surface the selection flows use. */
function makeStubWorld(keys: Array<[string, number]>) {
  const world: any = {
    microVoxels: { cells: new Map(keys.map(([key, color]) => [key, color])) },
    getBlock: () => BlockTypes.AIR,
    getBlockColor: () => 0,
    getMicroBlock(mx, my, mz) {
      const color = world.microVoxels.cells.get(`${mx},${my},${mz}`);
      return color === undefined ? null : { block: BlockTypes.COLOR_BLOCK, color };
    },
    removeMicroBlock(mx, my, mz) {
      const key = `${mx},${my},${mz}`;
      const removed = world.microVoxels.cells.delete(key);
      return removed;
    },
    extractMicroCellRegion(minX, minY, minZ, maxX, maxY, maxZ) {
      const found = [];
      for (const key of [...world.microVoxels.cells.keys()]) {
        const [mx, my, mz] = key.split(',').map(Number);
        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY && mz >= minZ && mz <= maxZ) {
          found.push({ mx, my, mz, color: world.microVoxels.cells.get(key), part: null });
          world.microVoxels.cells.delete(key);
        }
      }
      return found;
    },
    worldToChunkCoords: () => ({ cx: 0, cz: 0 }),
    getChunk: () => null
  };
  return world;
}

test('Selector defaults to standard block selection and Tab toggles micro mode', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const controller = makeMicroController({ manager });
  assert.equal(controller.selectorMicroMode, false, 'default must be standard blocks');

  // An in-progress standard single-cell selection must be discarded on switch.
  manager.toggleWorldGlueCell({ x: 1.5, y: 5, z: 1.5 });
  assert.notEqual(manager.connectedSelection, null);

  controller.toggleSelectorMicroMode();
  assert.equal(controller.selectorMicroMode, true);
  assert.equal(manager.connectedSelection, null, 'standard single selection cleared on mode switch');
  assert.equal(controller.selectorLevel, null);
  assert.equal(controller.selectorRange, null);
  assert.ok(controller.__toasts.some(m => m.includes('MICRO')));

  controller.toggleSelectorMicroMode();
  assert.equal(controller.selectorMicroMode, false);
  assert.ok(controller.__toasts.some(m => m.includes('STANDARD')));
});

test('selector micro cell resolves the surface micro cell under the crosshair', () => {
  const controller = makeMicroController();

  // Top face of standard cell (2,5,7); crosshair near (2.6, 6.0, 7.2).
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 7 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 2.6, y: 6.0, z: 7.2 }
  };
  assert.deepEqual(controller.selectorMicroCellFromRaycast(), { x: 13, y: 29, z: 36 });

  // Left face of the same cell: entry x=2.0 pushed against normal -x.
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 7 },
    normal: { x: -1, y: 0, z: 0 }, entry: { x: 2.0, y: 5.4, z: 7.6 }
  };
  assert.deepEqual(controller.selectorMicroCellFromRaycast(), { x: 10, y: 27, z: 38 });

  // Bottom face with no entry point: falls back to the cell origin.
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 7 },
    normal: { x: 0, y: -1, z: 0 }
  };
  assert.deepEqual(controller.selectorMicroCellFromRaycast(), { x: 10, y: 25, z: 35 });

  // A micro hit selects the hit micro cell directly.
  controller.currentRaycast = {
    hit: true, kind: 'micro', hitPos: { x: 0.4, y: 5, z: 7 },
    microPos: { x: 2, y: 25, z: 35 }, normal: { x: 0, y: 1, z: 0 }
  };
  assert.deepEqual(controller.selectorMicroCellFromRaycast(), { x: 2, y: 25, z: 35 });

  // No hit → null.
  controller.currentRaycast = { hit: false };
  assert.equal(controller.selectorMicroCellFromRaycast(), null);
});

test('toggleMicroCell toggles sparse 0.2 m cells and is exclusive of standard single mode', () => {
  const manager = new ContraptionManager(new THREE.Scene(), {}, null, null);
  const info1 = manager.toggleMicroCell({ x: 2.6, y: 5.12, z: 2.8 });
  assert.equal(info1.granularity, 'micro');
  assert.equal(info1.count, 1);
  assert.equal(info1.ready, true);
  assert.deepEqual(manager.microSelection, [{ x: 13, y: 25, z: 14 }]);

  const info2 = manager.toggleMicroCell({ x: 2.6, y: 5.12, z: 2.8 });
  assert.equal(info2.count, 0);
  assert.equal(info2.ready, false);

  // Entering standard single mode clears the micro set and vice versa.
  manager.toggleWorldGlueCell({ x: 1.5, y: 5, z: 1.5 });
  assert.equal(manager.microSelection, null);
  assert.equal(manager.toggleMicroCell({ x: 1.1, y: 5.1, z: 1.1 }).granularity, 'micro');
  assert.equal(manager.connectedSelection, null);

  assert.equal(manager.hasValidSelection(), true);
  assert.equal(manager.getSelectionBlockCount(), 1);
  assert.equal(manager.getSelectionBounds(), null, 'sparse micro selection has no standard bounds');
  manager.clearSelection();
  assert.equal(manager.microSelection, null);
  assert.equal(manager.hasValidSelection(), false);
});

test('micro box corners clamp to the 64 standard-cell entity limit', () => {
  const world = makeStubWorld([[ '0,0,0', 0x111111 ], [ '319,0,0', 0x222222 ], [ '400,0,0', 0x333333 ]]);
  const manager = new ContraptionManager(new THREE.Scene(), world, null, null);
  const result = executeBasicAction({ manager, world, selectionHost: null }, {
    domain: ActionDomain.SELECTION,
    action: 'box',
    a: { x: 0, y: 0, z: 0 },
    b: { x: 80, y: 0, z: 0 },
    micro: true
  });
  assert.equal(result.clamped, true, 'an 80 m span exceeds the 64×64×64 limit');
  const xs = manager.microSelection.map(c => c.x).sort((a, b) => a - b);
  assert.deepEqual(xs, [0, 319], 'materialization keeps only micro cells inside the clamped span');
});

test('shared corner actions materialize a micro box into existing micro voxels', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    [ '13,25,14', 0x111111 ],
    [ '14,25,14', 0x222222 ],
    [ '30,25,30', 0x333333 ] // outside the box
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  const ctx = { manager, world, selectionHost: null };

  executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION,
    action: 'corner-a',
    point: { x: 2.6, y: 5.0, z: 2.8 },
    micro: true
  });
  assert.deepEqual(manager.selectionCornerA, { x: 13, y: 25, z: 14, micro: true });
  assert.equal(manager.microSelection, null, 'materialization happens only on the second corner');

  const result = executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION,
    action: 'corner-b',
    point: { x: 2.8, y: 5.2, z: 2.8 },
    micro: true
  });
  assert.equal(result.materialized, 2);
  assert.equal(manager.selectionCornerA, null);
  assert.equal(manager.selectionCornerB, null);
  assert.deepEqual(manager.microSelection, [{ x: 13, y: 25, z: 14 }, { x: 14, y: 25, z: 14 }]);
  assert.equal(manager.hasValidSelection(), true);

  const info = manager.getWorldGlueSelectionInfo();
  assert.equal(info.mode, 'single');
  assert.equal(info.granularity, 'micro');
  assert.equal(info.count, 2);
  assert.ok(info.ready);
  assert.equal(info.pointCount, 0);
});

test('shared toggle-cell with the micro flag toggles 0.2 m cells', () => {
  const manager = new ContraptionManager(new THREE.Scene(), {}, null, null);
  const ctx = { manager, world: {}, selectionHost: null };
  let result = executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION,
    action: 'toggle-cell',
    point: { x: 3.3, y: 4.1, z: 3.9 },
    micro: true
  });
  assert.deepEqual(result.selection.cells, [{ x: 16, y: 20, z: 19 }]);
  assert.equal(result.selection.granularity, 'micro');

  result = executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION,
    action: 'toggle-cell',
    point: { x: 3.3, y: 4.1, z: 3.9 },
    micro: true
  });
  assert.equal(result.selection.count, 0);
  assert.equal(result.selection.ready, false);
});

test('selector click flow: two plain clicks build a materialized micro box, third clears it', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    [ '13,29,14', 0x111111 ],
    [ '14,29,14', 0x222222 ]
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });
  controller.selectorMicroMode = true;

  // Corner 1: top face of cell (2,5,2), crosshair at (2.6, 6.0, 2.2).
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 2 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 2.6, y: 6.0, z: 2.2 }
  };
  controller.handleLeftClick();
  assert.deepEqual(manager.selectionCornerA, { x: 13, y: 29, z: 11, micro: true });
  assert.equal(manager.microSelection, null);

  // Corner 2: top face hit at (2.8, 6.0, 2.8) → micro (14, 29, 14).
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 2 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 2.8, y: 6.0, z: 2.8 }
  };
  controller.handleLeftClick();
  assert.equal(manager.selectionCornerA, null, 'confirmed micro box is materialized, not kept as a box');
  assert.equal(manager.selectionCornerB, null);
  assert.deepEqual(manager.microSelection, [{ x: 13, y: 29, z: 14 }, { x: 14, y: 29, z: 14 }]);
  assert.ok(controller.__toasts.some(m => m.includes('micro box set')));

  // Third plain click clears the completed micro selection.
  controller.handleLeftClick();
  assert.equal(manager.microSelection, null);
  assert.equal(manager.selectionCornerA, null);
  assert.ok(controller.__toasts.some(m => m.includes('selection cleared')));
});

test('selector Shift+click toggles micro cells while in micro mode', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });
  controller.selectorMicroMode = true;

  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 2 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 2.6, y: 6.0, z: 2.2 }
  };
  controller.handleLeftClick({ shiftKey: true });
  assert.deepEqual(manager.microSelection, [{ x: 13, y: 29, z: 11 }]);
  assert.ok(controller.__toasts.some(m => m.includes('micro mode')));

  controller.handleLeftClick({ shiftKey: true });
  assert.equal(manager.microSelection.length, 0, 'toggling the same micro cell removes it');
  assert.equal(manager.getSelectionBlockCount(), 0);
});

test('Del removes exactly the selected micro voxels and nothing else', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    [ '13,29,14', 0x111111 ],
    [ '14,29,14', 0x222222 ],
    [ '20,20,20', 0x333333 ] // untouched
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });

  manager.toggleMicroCell({ x: 2.6, y: 5.8, z: 2.8 }); // (13, 29, 14)
  manager.toggleMicroCell({ x: 2.8, y: 5.8, z: 2.8 }); // (14, 29, 14)
  controller.deleteSelectionBlocks();

  assert.equal(world.microVoxels.cells.has('13,29,14'), false, 'selected micro voxel removed');
  assert.equal(world.microVoxels.cells.has('14,29,14'), false, 'selected micro voxel removed');
  assert.equal(world.microVoxels.cells.has('20,20,20'), true, 'outside micro voxel kept');
  assert.equal(manager.microSelection, null, 'selection reset after delete');
  assert.ok(controller.__toasts.some(m => m.includes('Deleted 2 micro voxels')));
});

test('G assembles a sparse micro selection into 0.2 m entity blocks', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    [ '13,25,14', 0x111111 ],
    [ '14,26,14', 0x222222 ]
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  manager.toggleMicroCell({ x: 2.6, y: 5.12, z: 2.8 });
  manager.toggleMicroCell({ x: 2.8, y: 5.32, z: 2.8 });

  const result = executeBasicAction({ manager, world, selectionHost: null }, {
    domain: ActionDomain.SELECTION,
    action: 'assemble'
  });
  const entity = result.entity;
  assert.ok(entity, `assembly should succeed (reason: ${result.reason})`);
  assert.equal(entity.blocks.length, 2);
  assert.deepEqual(entity.blocks.map(b => b.size), [0.2, 0.2]);
  // The entity origin anchors the sparse min corner; the block offsets stay
  // relative to that origin even though the root pivot is the AABB center.
  const origin = { x: 13 / 5, y: 25 / 5, z: 14 / 5 };
  assert.equal(entity.originWorldPos.x, origin.x);
  assert.equal(entity.originWorldPos.y, origin.y);
  assert.equal(entity.originWorldPos.z, origin.z);
  const locals = entity.blocks
    .map(b => [Math.round(b.localX * 5) / 5, Math.round(b.localY * 5) / 5, Math.round(b.localZ * 5) / 5])
    .sort();
  assert.deepEqual(locals, [[0, 0, 0], [0.2, 0.2, 0]], 'relative offsets follow the sparse min corner');
  assert.equal(world.microVoxels.cells.size, 0, 'extracted micro voxels leave the world');
  assert.equal(manager.microSelection, null, 'selection cleared after assembly');
  assert.ok(manager.contraptions.includes(entity));
});

test('T samples a micro selection into a block set without removing world voxels', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    [ '13,25,14', 0x111111 ],
    [ '14,25,14', 0x222222 ]
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });
  controller.selectorMicroMode = true;
  manager.toggleMicroCell({ x: 2.6, y: 5.12, z: 2.8 }); // has a voxel
  manager.toggleMicroCell({ x: 3.0, y: 5.0, z: 3.0 }); // (15,25,15): empty

  const raw = controller.sampleWorldSelectionAsBlockSet();
  assert.equal(raw.length, 1, 'empty selected cells are skipped');
  assert.equal(raw[0].size, 0.2);
  assert.equal(raw[0].color, 0x111111);
  assert.deepEqual(raw[0], { dx: 0, dy: 0, dz: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x111111 });
  assert.equal(world.microVoxels.cells.size, 2, 'T is read-only');
});

test('entity 2-point box in micro mode keeps only 0.2 m blocks', () => {
  const scene = new THREE.Scene();
  // Three blocks in distinct cells: two standard (1 m) and one micro (0.2 m).
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff },
      { localX: 4, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0xff0000 },
      { localX: 1.2, localY: 0.4, localZ: 0.4, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x00ff00 }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.registerContraption(contraption);
  const ctx = { manager, world: {}, selectionHost: null };
  // A wide box covering the whole entity in node-local space.
  const a = { x: -3, y: -1, z: -1 };
  const b = { x: 3, y: 1, z: 1 };

  const standard = executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION, action: 'entity-box', target: { contraption }, nodeId: 'root', a, b, space: 'node-local'
  });
  assert.equal(standard.selection.blocks.length, 3, 'standard mode keeps standard + micro blocks');

  const micro = executeBasicAction(ctx, {
    domain: ActionDomain.SELECTION, action: 'entity-box', target: { contraption }, nodeId: 'root', a, b, space: 'node-local', micro: true
  });
  assert.equal(micro.selection.blocks.length, 1, 'micro mode keeps only 0.2 m blocks');
  assert.equal(micro.selection.blocks[0].size, 0.2);
  assert.equal(micro.selection.blocks[0].color, 0x00ff00);
});

test('copying an entity micro selection removes empty layers below its lowest voxel', () => {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x111111 },
      { localX: 0, localY: 0.8, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x222222 },
      { localX: 0.2, localY: 0.8, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x333333 }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.registerContraption(contraption);
  const controller = makeMicroController({ manager });
  controller.selectorMicroMode = true;
  controller.selectedBlockSelection = {
    contraption,
    nodeId: 'root',
    blocks: contraption.blocks.filter(block => block.localY === 0.8)
  };

  const slot = controller.copySelectionToInventory();

  assert.ok(slot);
  assert.deepEqual(slot.blocks.map(block => block.localY), [0, 0],
    'the copied top layer should move down four micro cells to y=0');
  assert.deepEqual(contraption.blocks.map(block => block.localY), [0, 0.8, 0.8],
    'copying must not move the source entity voxels');
});

test('pending micro box preview carries meter coordinates and the micro flag', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });
  controller.selectorMicroMode = true;

  // Corner 1 is stored as the micro cell under (2.6, 5.0, 2.2) → (13, 25, 11).
  manager.setCornerA({ x: 2.6, y: 5.0, z: 2.2 }, { micro: true });
  assert.deepEqual(manager.selectionCornerA, { x: 13, y: 25, z: 11, micro: true });

  // Crosshair on the top face of cell (2,5,2) at entry (2.8, 6.0, 2.8) → cursor cell (14, 29, 14).
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 2, y: 5, z: 2 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 2.8, y: 6.0, z: 2.8 }
  };
  controller.updateMicroCarvePreview();
  const preview = controller.boxSelectionPreview;
  assert.ok(preview, 'a pending micro box should show a live preview');
  assert.equal(preview.micro, true, 'the renderer must be told this preview is micro-granular');
  assert.deepEqual(preview.pointA, { x: 13 / 5, y: 25 / 5, z: 11 / 5 }, 'pointA must be corner 1 in meters');
  assert.deepEqual(preview.cursor, { x: 14 / 5, y: 29 / 5, z: 14 / 5 }, 'cursor must be the target micro cell origin in meters');
});

test('box selection preview quantizes micro coordinates to 0.2 m cells, not meters', () => {
  const renderer: any = Object.create(SceneRenderer.prototype);
  renderer.scene = { add() {} };
  renderer.setupBoxSelectionPreview();

  // Micro: corner cell (13,25,11) → meters 2.6,5.0,2.2; cursor cell (14,29,14) → 2.8,5.8,2.8.
  // The span is 2×5×4 micro cells = 0.4×1.0×0.8 m, anchored at the corner origin.
  renderer.setBoxSelectionPreview({ x: 2.6, y: 5.0, z: 2.2 }, { x: 2.8, y: 5.8, z: 2.8 }, true);
  assert.ok(renderer.boxSelectionGroup.visible);
  assert.ok(Math.abs(renderer.boxSelectionFill.scale.x - 0.4) < 1e-9, 'x span = 2 micro cells');
  assert.ok(Math.abs(renderer.boxSelectionFill.scale.y - 1.0) < 1e-9, 'y span = 5 micro cells');
  assert.ok(Math.abs(renderer.boxSelectionFill.scale.z - 0.8) < 1e-9, 'z span = 4 micro cells');
  assert.ok(Math.abs(renderer.boxSelectionGroup.position.x - 2.8) < 1e-9, 'center x = min + half span');
  assert.ok(Math.abs(renderer.boxSelectionGroup.position.y - 5.5) < 1e-9, 'center y');
  assert.ok(Math.abs(renderer.boxSelectionGroup.position.z - 2.6) < 1e-9, 'center z');

  // The same meter values in standard mode still floor to whole meter cells.
  renderer.setBoxSelectionPreview({ x: 2.6, y: 5.0, z: 2.2 }, { x: 2.8, y: 5.8, z: 2.8 });
  assert.deepEqual(renderer.boxSelectionFill.scale.toArray(), [1, 1, 1], 'standard preview spans whole meter cells');
  assert.deepEqual(renderer.boxSelectionGroup.position.toArray(), [2.5, 5.5, 2.5], 'standard preview centers on meter cells');

  renderer.setBoxSelectionPreview(null, null);
  assert.equal(renderer.boxSelectionGroup.visible, false);
});

test('entity focus guide hugs 0.2 m blocks in micro mode instead of their 1 m cell', () => {
  const scene = new THREE.Scene();
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x00ff00 },
      { localX: 4, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const controller = makeMicroController();
  controller.selectorRange = { contraption, nodeId: 'root', pointA: null, pointB: null };

  // Standard mode over a 1 m block: full-size guide at the cell center.
  controller.hoveredContraptionHit = {
    contraption, entityId: 'root', cell: { x: 4, y: 0, z: 0 },
    block: contraption.blocks[1], point: new THREE.Vector3(4.5, 10.5, 0.5)
  };
  controller.updateMicroCarvePreview();
  assert.ok(controller.focusBlockPreview, 'hover shows the aim guide');
  assert.equal(controller.focusBlockPreview.cellSize, 1);
  assert.equal(controller.focusBlockPreview.center.x, 4.5);

  // Micro mode over the 0.2 m block: the guide shrinks onto the block itself.
  controller.selectorMicroMode = true;
  controller.hoveredContraptionHit = {
    contraption, entityId: 'root', cell: { x: 0, y: 0, z: 0 },
    block: contraption.blocks[0], point: new THREE.Vector3(0.1, 10.1, 0.1)
  };
  controller.updateMicroCarvePreview();
  assert.equal(controller.focusBlockPreview.cellSize, 0.2, 'micro target must shrink the guide');
  const center = controller.focusBlockPreview.center.toArray();
  assert.ok(center.every((v, i) => Math.abs(v - [0.1, 10.1, 0.1][i]) < 1e-9), 'guide centers on the micro block');
});

/**
 * Build the scenario used by the entity-range corner tests: an entity at
 * world (0,10,0) with two stacked 1 m blocks plus one 0.2 m block sitting in
 * the upper part of the third standard cell (origin-local y 2.6..2.8).
 */
function makeEntityWithTopMicroLayer(scene) {
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff },
      { localX: 0, localY: 1, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff },
      { localX: 0, localY: 2.6, localZ: 0.4, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x00ff00 }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.registerContraption(contraption);
  return { contraption, manager };
}

test('entity 2-point box: a world-clicked corner snaps to the 0.2 m surface cell in micro mode', () => {
  const scene = new THREE.Scene();
  const { contraption, manager } = makeEntityWithTopMicroLayer(scene);
  const controller = makeMicroController({ manager, world: {} });
  controller.selectorMicroMode = true;

  const node = contraption.entityNodes.get('root');
  controller.selectorLevel = { contraption, nodeId: 'root' };
  controller.selectorRange = { contraption, nodeId: 'root', pointA: null, pointB: null };

  // Corner 1: entity click at origin-local (0.4, 2.4, 0.5).
  const pointAWorld = node.group.localToWorld(new THREE.Vector3(
    0.4 - node.pivotLocal.x, 2.4 - node.pivotLocal.y, 0.5 - node.pivotLocal.z
  ));
  controller.hoveredContraptionHit = {
    contraption, entityId: 'root', cell: { x: 0, y: 2, z: 0 },
    block: contraption.blocks[2], point: pointAWorld
  };
  controller.handleLeftClick();
  assert.ok(controller.selectorRange?.pointA, 'corner 1 anchored in node-local space');

  // Corner 2: WORLD click on the top face of standard cell (0,12,0) with the
  // crosshair at entry (0.3, 13.0, 0.6). The surface micro cell is
  // (1, 64, 3) -> meter origin (0.2, 12.8, 0.6). Snapping this corner to the
  // whole standard cell (0,12,0) would drop the top 0.2 m layer (local y
  // 2.6..2.8) out of the range.
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 0, y: 12, z: 0 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 0.3, y: 13.0, z: 0.6 }
  };
  controller.handleLeftClick();

  const selected = manager.entitySelection?.blocks || [];
  assert.equal(selected.length, 1, 'the top 0.2 m layer must be inside the range');
  assert.equal(selected[0].size, 0.2);
  assert.equal(selected[0].localY, 2.6);
  assert.equal(selected[0].color, 0x00ff00);
  assert.ok(
    !controller.__toasts.some(m => m.includes('No blocks of')),
    'no false "No blocks" miss for the aimed 0.2 m layer'
  );
  assert.equal(controller.selectorRange, null, 'box mode exits after resolution');
});

test('entity 2-point box in standard mode still snaps world corners to whole cells', () => {
  const scene = new THREE.Scene();
  const { contraption, manager } = makeEntityWithTopMicroLayer(scene);
  const controller = makeMicroController({ manager, world: {} });
  controller.selectorMicroMode = false;

  const node = contraption.entityNodes.get('root');
  controller.selectorLevel = { contraption, nodeId: 'root' };
  controller.selectorRange = { contraption, nodeId: 'root', pointA: null, pointB: null };

  const pointAWorld = node.group.localToWorld(new THREE.Vector3(
    0.4 - node.pivotLocal.x, 2.4 - node.pivotLocal.y, 0.5 - node.pivotLocal.z
  ));
  controller.hoveredContraptionHit = {
    contraption, entityId: 'root', cell: { x: 0, y: 2, z: 0 },
    block: contraption.blocks[2], point: pointAWorld
  };
  controller.handleLeftClick();

  // Standard mode: corner 2 is the hit cell itself, exactly as before the
  // micro-corner fix (the 0.2 m block layer stays out of range).
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 0, y: 12, z: 0 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 0.3, y: 13.0, z: 0.6 }
  };
  controller.handleLeftClick();

  const selected = manager.entitySelection?.blocks || [];
  assert.equal(selected.length, 1, 'standard mode selects the middle whole cell only');
  assert.equal(selected[0].size || 1, 1, 'the middle standard block is a whole cell');
  assert.equal(selected[0].localY, 1);
});

test('entity-range world hover preview quantizes the cursor to the surface micro cell in micro mode', () => {
  const scene = new THREE.Scene();
  const { contraption, manager } = makeEntityWithTopMicroLayer(scene);
  const controller = makeMicroController({ manager, world: {} });
  controller.selectorMicroMode = true;

  const node = contraption.entityNodes.get('root');
  controller.selectorRange = { contraption, nodeId: 'root', pointA: null, pointB: null };
  const pointAWorld = node.group.localToWorld(new THREE.Vector3(
    0.4 - node.pivotLocal.x, 2.4 - node.pivotLocal.y, 0.5 - node.pivotLocal.z
  ));
  controller.hoveredContraptionHit = {
    contraption, entityId: 'root', cell: { x: 0, y: 2, z: 0 },
    block: contraption.blocks[2], point: pointAWorld
  };
  controller.handleLeftClick();

  // Hover the terrain (top face of cell (0,12,0), entry (0.3, 13.0, 0.6)).
  // The preview cursor must match what the click will store, expressed in the
  // entity's oriented voxel grid: the surface micro cell origin
  // (0.2, 2.8, 0.6), not the standard cell corner (0,2,0).
  controller.hoveredContraptionHit = null;
  controller.currentRaycast = {
    hit: true, kind: 'standard', hitPos: { x: 0, y: 12, z: 0 },
    normal: { x: 0, y: 1, z: 0 }, entry: { x: 0.3, y: 13.0, z: 0.6 }
  };
  controller.updateMicroCarvePreview();
  const preview = controller.boxSelectionPreview;
  assert.ok(preview, 'entity-range hover shows the live box preview');
  assert.equal(preview.micro, true);
  assert.ok(preview.cursor.distanceTo(new THREE.Vector3(1 / 5, 14 / 5, 3 / 5)) < 1e-12);
  assert.equal(preview.frame.object, node.group, 'preview should inherit the entity node transform');

  // In standard mode the cursor stays the whole hit cell in the same grid.
  controller.selectorMicroMode = false;
  controller.updateMicroCarvePreview();
  assert.ok(controller.boxSelectionPreview.cursor.distanceTo(new THREE.Vector3(0, 2, 0)) < 1e-12);
});

test('standard selection is unaffected: micro flag defaults to off', () => {
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.setCornerA({ x: 1.4, y: 5.2, z: 1.9 });
  manager.setCornerB({ x: 3.9, y: 6.8, z: 4.1 });
  assert.equal(manager.microSelection, null, 'standard box never materializes a micro set');
  assert.deepEqual(manager.selectionCornerA, { x: 1, y: 5, z: 1 });
  assert.deepEqual(manager.selectionCornerB, { x: 3, y: 6, z: 4 });
  const info = manager.getWorldGlueSelectionInfo();
  assert.equal(info.granularity, 'standard');
  assert.equal(info.mode, 'box');

  // A standard toggle-cell still returns the standard snapshot shape.
  const toggle = manager.toggleWorldGlueCell({ x: 2.5, y: 5.5, z: 2.5 });
  assert.equal(toggle.granularity, 'standard');
  assert.equal(manager.microSelection, null);
});

test('create-child from microblock selection isolates selected microblocks and calculates accurate pivot', () => {
  const scene = new THREE.Scene();
  // 5 stacked microblocks inside the same 1 m cell (0, 2, 0)
  const contraption = new Contraption(
    1,
    [
      { localX: 0, localY: 0, localZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff },
      { localX: 0, localY: 2.0, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x111111 },
      { localX: 0, localY: 2.2, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x222222 },
      { localX: 0, localY: 2.4, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x333333 },
      { localX: 0, localY: 2.6, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x444444 },
      { localX: 0, localY: 2.8, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK, color: 0x555555 }
    ],
    new THREE.Vector3(0, 10, 0),
    scene
  );
  const manager = new ContraptionManager(scene, {}, null, null);
  manager.registerContraption(contraption);
  const controller = makeMicroController({ manager, world: {} });
  controller.selectorMicroMode = true;

  // Box-select only the top two microblocks (localY 2.6 and 2.8)
  const node = contraption.entityNodes.get('root');
  const a = { x: -1, y: 2.65 - node.pivotLocal.y, z: -1 };
  const b = { x: 1, y: 3.05 - node.pivotLocal.y, z: 1 };
  const result = executeBasicAction({ manager, world: {}, selectionHost: null }, {
    domain: ActionDomain.SELECTION,
    action: 'entity-box',
    target: { contraption },
    nodeId: 'root',
    a,
    b,
    space: 'node-local',
    micro: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.selection.blocks.length, 2, 'only the 2 top micro blocks selected');

  // G creates child component from the selected blocks
  controller.selectedBlockSelection = {
    contraption,
    nodeId: 'root',
    blocks: result.selection.blocks
  };
  controller.createChildFromSelectedBlocks();

  // Verify child entity
  const childDef = [...contraption.childDefinitions.values()][0];
  assert.ok(childDef, 'child component created');
  const childBlocks = contraption.blocks.filter(b => b.entityId === childDef.id);
  const rootBlocks = contraption.blocks.filter(b => (b.entityId || 'root') === 'root');
  assert.equal(childBlocks.length, 2, 'child must contain exactly the 2 selected microblocks');
  assert.equal(rootBlocks.length, 4, 'root must retain the standard block + 3 unselected microblocks');

  // Pivot should accurately center the two microblocks:
  // x: [0, 0.2] -> 0.1, y: [2.6, 3.0] -> 2.8, z: [0, 0.2] -> 0.1
  assert.ok(Math.abs(childDef.pivot[0] - 0.1) < 1e-6, `pivot X = 0.1, got ${childDef.pivot[0]}`);
  assert.ok(Math.abs(childDef.pivot[1] - 2.8) < 1e-6, `pivot Y = 2.8, got ${childDef.pivot[1]}`);
  assert.ok(Math.abs(childDef.pivot[2] - 0.1) < 1e-6, `pivot Z = 0.1, got ${childDef.pivot[2]}`);
});

test('assembleSelection extracts both standard blocks and microblocks from standard 2-point box', () => {
  const scene = new THREE.Scene();
  const world = {
    extractRegion(minX, minY, minZ, maxX, maxY, maxZ) {
      return [{ worldX: 0, worldY: 0, worldZ: 0, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff }];
    },
    extractMicroRegion(minX, minY, minZ, maxX, maxY, maxZ) {
      return [{ mx: 1, my: 1, mz: 1, color: 0x00ff00, part: null }];
    },
    worldToChunkCoords: () => ({ cx: 0, cz: 0 }),
    getChunk: () => null
  };
  const manager = new ContraptionManager(scene, world, null, null);
  manager.setCornerA({ x: 0, y: 0, z: 0 });
  manager.setCornerB({ x: 1, y: 1, z: 1 });

  const result = executeBasicAction({ manager, world, selectionHost: null }, {
    domain: ActionDomain.SELECTION,
    action: 'assemble'
  });

  assert.ok(result.entity, 'entity assembled');
  assert.equal(result.entity.blocks.length, 2, 'must contain both standard block and carved microblock');
  const sizes = result.entity.blocks.map(b => b.size || 1).sort();
  assert.deepEqual(sizes, [0.2, 1]);
});

test('mixed-mode setCornerB scales standard cornerA to micro coordinates', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    ['10,25,10', 0x111111],
    ['13,27,13', 0x222222]
  ]);
  const manager = new ContraptionManager(scene, world, null, null);

  // Corner A set in standard mode at cell (2, 5, 2)
  manager.setCornerA({ x: 2, y: 5, z: 2 });
  assert.equal(manager.selectionCornerA.micro, undefined);
  assert.deepEqual(manager.selectionCornerA, { x: 2, y: 5, z: 2 });

  // Corner B set with micro: true at meter (2.8, 5.8, 2.8) -> micro cell (14, 29, 14)
  const result = manager.setCornerB({ x: 2.8, y: 5.8, z: 2.8 }, { micro: true });
  assert.equal(result.materialized, 2, 'should materialize both microblocks within span');
  assert.equal(manager.microSelection.length, 2);
  assert.deepEqual(manager.microSelection, [{ x: 10, y: 25, z: 10 }, { x: 13, y: 27, z: 13 }]);
});

test('T blockset copy quantizes micro coordinates cleanly without float artifacts', () => {
  const scene = new THREE.Scene();
  const world = makeStubWorld([
    ['13,25,14', 0x111111],
    ['14,25,14', 0x222222]
  ]);
  const manager = new ContraptionManager(scene, world, null, null);
  const controller = makeMicroController({ manager, world });
  controller.selectorMicroMode = true;
  manager.toggleMicroCell({ x: 2.6, y: 5.0, z: 2.8 }); // (13, 25, 14)
  manager.toggleMicroCell({ x: 2.8, y: 5.0, z: 2.8 }); // (14, 25, 14)

  const raw = controller.sampleWorldSelectionAsBlockSet();
  assert.equal(raw.length, 2);
  assert.equal(raw[0].dx, 0);
  assert.equal(raw[1].dx, 0.2);
  assert.equal(typeof raw[1].dx, 'number');
  assert.equal(raw[1].dx.toString(), '0.2', 'dx must be exactly 0.2 without float precision noise');
});

test('default mass uses block volume: 10 kg/m³, 0.08 kg per 0.2m microblock', () => {
  const scene = new THREE.Scene();

  // 1 standard block: volume = 1.0, mass = 10 kg
  const c1 = new Contraption(1, [{ localX: 0, localY: 0, localZ: 0, size: 1, block: BlockTypes.COLOR_BLOCK }], new THREE.Vector3(), scene);
  assert.equal(c1.mass, 10);

  // 1 micro block: volume = 0.008, mass = 0.08 kg -> clamped to MIN_BODY_MASS_KG (0.1 kg)
  const c2 = new Contraption(2, [{ localX: 0, localY: 0, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK }], new THREE.Vector3(), scene);
  assert.equal(c2.mass, 0.1);

  // 10 micro blocks: volume = 0.08, mass = 0.8 kg
  const microBlocks10 = Array.from({ length: 10 }, (_, i) => ({
    localX: i * 0.2, localY: 0, localZ: 0, size: 0.2, block: BlockTypes.COLOR_BLOCK
  }));
  const c3 = new Contraption(3, microBlocks10, new THREE.Vector3(), scene);
  assert.equal(c3.mass, 0.8);

  // 125 micro blocks (1 subdivided standard cell): volume = 1.0, mass = 10 kg
  const microBlocks125 = [];
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      for (let z = 0; z < 5; z++) {
        microBlocks125.push({ localX: x * 0.2, localY: y * 0.2, localZ: z * 0.2, size: 0.2, block: BlockTypes.COLOR_BLOCK });
      }
    }
  }
  const c4 = new Contraption(4, microBlocks125, new THREE.Vector3(), scene);
  assert.equal(c4.mass, 10);
});

test('React UI store exposes palette, selector, and backpack tool modes', () => {
  const controller = makeMicroController();
  controller.inventories = {
    entity: { items: Array(9).fill(null) },
    blockset: { items: Array(9).fill(null) },
    colorset: { items: Array(9).fill(null) }
  };
  const ui = new SpaceUiStore();
  ui.setController(controller);

  ui.selectHotbarSlot(0);
  assert.equal(ui.getSnapshot().hotbarSlots[ui.getSnapshot().selectedHotbarIndex].value, SpecialTool.SHOVEL);

  ui.selectHotbarSlot(2);
  assert.equal(ui.getSnapshot().hotbarSlots[ui.getSnapshot().selectedHotbarIndex].value, SpecialTool.SELECTOR);

  ui.selectHotbarSlot(3);
  assert.equal(ui.getSnapshot().hotbarSlots[ui.getSnapshot().selectedHotbarIndex].value, SpecialTool.HAMMER);
});

test('toggleSelectorMicroMode toggles between standard (1m) and micro (0.2m) mode with UI sync', () => {
  const controller = makeMicroController();
  const uiCalls: string[] = [];
  controller.ui = {
    updateToolPanelMode: () => uiCalls.push('updateToolPanelMode'),
    renderHotbar: () => uiCalls.push('renderHotbar'),
    showToast: (msg) => uiCalls.push(`toast:${msg}`)
  } as any;

  assert.equal(controller.selectorMicroMode, false, 'default is standard mode');
  controller.toggleSelectorMicroMode();
  assert.equal(controller.selectorMicroMode, true, 'toggles to micro mode');
  assert.ok(uiCalls.includes('updateToolPanelMode'));
  assert.ok(uiCalls.some(c => c.includes('MICRO mode')));

  controller.toggleSelectorMicroMode();
  assert.equal(controller.selectorMicroMode, false, 'toggles back to standard mode');
  assert.ok(uiCalls.some(c => c.includes('STANDARD mode')));
});
