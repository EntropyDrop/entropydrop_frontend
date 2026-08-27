import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneRenderer } from '../src/engine/render/SceneRenderer.ts';
import { Contraption } from '../src/engine/contraption/Contraption.ts';

test('micro selection hologram culls internal overlapping faces and lines', () => {
  const renderer = Object.create(SceneRenderer.prototype);
  renderer.scene = new THREE.Scene();
  renderer.setupSelectionHologram();

  // Create a solid 2x2x2 cube of 8 microcells (coords 0..1 in x, y, z)
  const microCells: Array<{ x: number; y: number; z: number }> = [];
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < 2; z++) {
        microCells.push({ x, y, z });
      }
    }
  }

  renderer.updateSelectionHologram(null, null, microCells);

  assert.ok(renderer.selectionMicroCellsGroup.visible);
  assert.equal(renderer.selectionMicroCellsGroup.children.length, 2, 'should have 1 fill mesh and 1 line segments');

  const fillMesh = renderer.selectionMicroCellsGroup.children[0] as THREE.Mesh;
  const lineSegments = renderer.selectionMicroCellsGroup.children[1] as THREE.LineSegments;

  // A 2x2x2 cube has 6 outer faces. Each outer face has 2x2 = 4 micro quads.
  // Total external quads = 6 * 4 = 24 quads.
  // 24 quads * 2 triangles * 3 vertices = 144 vertices.
  // Without culling, 8 cells * 6 faces * 2 triangles * 3 vertices = 288 vertices.
  const posAttr = fillMesh.geometry.attributes.position;
  assert.equal(posAttr.count, 144, 'fill geometry should contain exactly 24 external quads (144 vertices)');

  // External border lines: 2x2 on 6 faces has 24 unique quad borders with 60 line segments.
  const lineAttr = lineSegments.geometry.attributes.position;
  assert.ok(lineAttr.count > 0);
  assert.ok(lineAttr.count < 8 * 24, 'internal lines between adjacent microcells must be culled');
});

test('entity block selection highlight culls internal overlapping edges', () => {
  const contraption = Object.create(Contraption.prototype);
  contraption.entityNodes = new Map();
  const rootNode = { id: 'root', group: new THREE.Group(), pivotLocal: new THREE.Vector3(0, 0, 0) };
  contraption.entityNodes.set('root', rootNode);
  contraption.subtreeHighlightBoxes = [];
  contraption.clearSubtreeHighlight = Contraption.prototype.clearSubtreeHighlight.bind(contraption);

  // 2 adjacent microblocks: (0, 0, 0) and (0.2, 0, 0)
  const blocks = [
    { entityId: 'root', localX: 0, localY: 0, localZ: 0, size: 0.2 },
    { entityId: 'root', localX: 0.2, localY: 0, localZ: 0, size: 0.2 }
  ];

  contraption.highlightBlocks(blocks);

  assert.equal(contraption.subtreeHighlightBoxes.length, 1, 'should combine into 1 culled highlight per node');
  const lineSegments = contraption.subtreeHighlightBoxes[0].group;
  const linePos = lineSegments.geometry.attributes.position;

  // 2 separate boxes have 2 * 12 = 24 segments (48 vertices).
  // A merged 2x1x1 box has 10 exposed faces with 20 deduplicated edges (40 vertices).
  assert.equal(linePos.count, 40, 'shared face internal edges should be culled');
});
