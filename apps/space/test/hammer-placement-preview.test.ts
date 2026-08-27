import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { ContraptionManager } from '../src/engine/contraption/ContraptionManager.ts';
import { SceneRenderer, getInventoryPreviewBlocks } from '../src/engine/render/SceneRenderer.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

function makeController(slot) {
  const controller = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.HAMMER;
  controller.inventorySlots = [slot];
  controller.selectedInventoryIndex = 0;
  controller.currentRaycast = { hit: false };
  controller.hoveredContraptionHit = null;
  controller.physics = { getEyePosition: () => new THREE.Vector3(1, 2, 3) };
  controller.camera = { quaternion: new THREE.Quaternion() };
  controller.inventoryPlacementPreview = null;
  return controller;
}

test('Hammer hover preview uses the same snapped pose as block-set placement', () => {
  const slot = {
    kind: 'blockset',
    blockCount: 1,
    blocks: [{ dx: 0, dy: 0, dz: 0, size: 1, color: 0x48dbfb }]
  };
  const controller = makeController(slot);
  // Entity hit wins over terrain behind it, just like left-click placement.
  controller.hoveredContraptionHit = {
    point: new THREE.Vector3(4.75, 5.2, 6.9),
    normal: new THREE.Vector3(1, 0, 0)
  };
  controller.currentRaycast = {
    hit: true,
    hitPos: { x: 20, y: 20, z: 20 },
    normal: { x: 0, y: 1, z: 0 }
  };

  controller.updateInventoryPlacementPreview();
  const buildPose = controller.getInventoryPlacementPose(slot);

  assert.ok(controller.inventoryPlacementPreview);
  assert.deepEqual(controller.inventoryPlacementPreview.position.toArray(), [5, 5, 6]);
  assert.deepEqual(buildPose.position.toArray(), [5, 5, 6]);
  assert.equal(controller.inventoryPlacementPreview.slot, slot);
});

test('Hammer ghost hides without a hovered surface, on an empty slot, or in another tool', () => {
  const slot = {
    kind: 'blockset',
    blocks: [{ dx: 0, dy: 0, dz: 0, size: 1 }]
  };
  const controller = makeController(slot);

  controller.updateInventoryPlacementPreview();
  assert.equal(controller.inventoryPlacementPreview, null, 'air is not a hover target');

  controller.currentRaycast = {
    hit: true,
    hitPos: { x: 2, y: 3, z: 4 },
    normal: { x: 0, y: 1, z: 0 }
  };
  controller.updateInventoryPlacementPreview();
  assert.ok(controller.inventoryPlacementPreview);

  controller.activeTool = SpecialTool.SELECTOR;
  controller.updateInventoryPlacementPreview();
  assert.equal(controller.inventoryPlacementPreview, null);

  controller.activeTool = SpecialTool.HAMMER;
  controller.inventorySlots[0] = null;
  controller.updateInventoryPlacementPreview();
  assert.equal(controller.inventoryPlacementPreview, null);
});

test('entity preview blocks reproduce the hierarchy pose built from the same slot', () => {
  const slot = {
    rootId: 'root',
    blockCount: 2,
    blocks: [
      { localX: 0, localY: 0, localZ: 0, size: 1, color: 0xf2a93b, block: BlockTypes.COLOR_BLOCK, entityId: 'root' },
      { localX: 2, localY: 0, localZ: 0, size: 1, color: 0x48dbfb, block: BlockTypes.COLOR_BLOCK, entityId: 'arm' }
    ],
    childEntities: [{
      id: 'arm',
      parentId: 'root',
      pivot: [2.5, 0.5, 0.5],
      localPosition: [1.25, 0.5, 0],
      localRotation: [0, 0, Math.PI / 2]
    }],
    scripts: [],
    enabled: []
  };
  const scene = new THREE.Scene();
  const manager = new ContraptionManager(scene, {}, null, null);
  const entity = manager.buildFromSlot(slot, new THREE.Vector3());
  const previewBlocks = getInventoryPreviewBlocks(slot);

  assert.equal(previewBlocks.length, entity.blocks.length);
  for (let index = 0; index < entity.blocks.length; index++) {
    const builtCenter = entity.getBlockWorldCenter(entity.blocks[index]);
    assert.ok(
      previewBlocks[index].center.distanceTo(builtCenter) < 1e-8,
      `preview block ${index} must match the built hierarchy pose`
    );
  }
});

test('renderer shows colored, scaled voxel instances at the placement origin', () => {
  const renderer = Object.create(SceneRenderer.prototype);
  renderer.scene = { add() {} };
  renderer.setupInventoryPlacementPreview();
  const slot = {
    kind: 'blockset',
    blocks: [
      { dx: 0, dy: 0, dz: 0, size: 1, color: 0xeb4d4b },
      { dx: 1, dy: 2, dz: 3, size: 0.2, color: 0x48dbfb }
    ]
  };

  renderer.setInventoryPlacementPreview({
    slot,
    kind: 'blockset',
    position: new THREE.Vector3(10, 20, 30)
  });
  assert.equal(renderer.inventoryPlacementGroup.visible, true);
  assert.deepEqual(renderer.inventoryPlacementGroup.position.toArray(), [10, 20, 30]);
  assert.equal(renderer.inventoryPlacementFill.count, 2);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  renderer.inventoryPlacementFill.getMatrixAt(1, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.ok(position.distanceTo(new THREE.Vector3(1.1, 2.1, 3.1)) < 1e-6);
  assert.ok(scale.distanceTo(new THREE.Vector3(0.2, 0.2, 0.2)) < 1e-6);

  renderer.setInventoryPlacementPreview(null);
  assert.equal(renderer.inventoryPlacementGroup.visible, false);
});

test('hammer ghost is depth-tested and outlines quads without triangle diagonals', () => {
  const renderer = Object.create(SceneRenderer.prototype);
  renderer.scene = { add() {} };
  renderer.setupInventoryPlacementPreview();
  const slot = {
    kind: 'blockset',
    blocks: [
      { dx: 0, dy: 0, dz: 0, size: 1, color: 0xeb4d4b },
      { dx: 1, dy: 2, dz: 3, size: 0.2, color: 0x48dbfb }
    ]
  };

  renderer.setInventoryPlacementPreview({
    slot,
    kind: 'blockset',
    position: new THREE.Vector3(10, 20, 30)
  });

  // No X-ray: both passes depth-test against the scene.
  assert.equal(renderer.inventoryPlacementFill.material.depthTest, true);
  assert.equal(renderer.inventoryPlacementFill.material.depthWrite, true,
    'the fill must write depth so interior edges hide behind the outer shell');
  assert.equal(renderer.inventoryPlacementWire.material.depthTest, true);
  assert.equal(renderer.inventoryPlacementWire.material.depthWrite, false);

  // The outline is line segments, not a triangulated wireframe mesh.
  const wire = renderer.inventoryPlacementWire;
  assert.equal(wire.isLineSegments, true);
  assert.equal(wire.material.wireframe, undefined);
  const wireGeometry = wire.geometry;
  assert.equal(wireGeometry.isInstancedBufferGeometry, true);
  assert.equal(wireGeometry.instanceCount, 2);
  // 12 clean box edges per instance (24 line vertices) — a wireframe-mesh
  // box would carry 6 extra triangle diagonals.
  assert.equal(wireGeometry.getAttribute('position').count, 24);

  const iCenter = wireGeometry.getAttribute('iCenter');
  const iScale = wireGeometry.getAttribute('iScale');
  // Float32 storage: compare with a tolerance.
  assert.ok(Math.abs(iCenter.getX(1) - 1.1) < 1e-6);
  assert.ok(Math.abs(iCenter.getY(1) - 2.1) < 1e-6);
  assert.ok(Math.abs(iCenter.getZ(1) - 3.1) < 1e-6);
  assert.ok(Math.abs(iScale.getX(1) - 0.2) < 1e-6);

  // Rebuilding disposes the previous wire geometry instead of leaking it.
  let disposedGeometryEvent = false;
  let disposedMaterialEvent = false;
  wireGeometry.addEventListener('dispose', () => { disposedGeometryEvent = true; });
  wire.material.addEventListener('dispose', () => { disposedMaterialEvent = true; });
  renderer.setInventoryPlacementPreview({
    slot: {
      kind: 'blockset',
      blocks: [{ dx: 0, dy: 0, dz: 0, size: 1, color: 0x20bf6b }]
    },
    kind: 'blockset',
    position: new THREE.Vector3(10, 20, 30)
  });
  assert.equal(disposedGeometryEvent, true, 'the previous wire geometry is disposed on rebuild');
  assert.equal(disposedMaterialEvent, true, 'the previous wire material is disposed on rebuild');
});
