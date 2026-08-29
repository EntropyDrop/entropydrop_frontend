import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  parseGLTFData,
  parse3DModelData,
  voxelizeModel,
  planModelSize,
  sampleTriangleColor,
  extractTrianglesFromObject3D,
  type VoxelTriangle
} from '../src/engine/voxel/ModelVoxelizer.ts';
import { PlayerController, SpecialTool } from '../src/engine/controls/PlayerController.ts';
import { BlockTypes } from '../src/engine/voxel/BlockTypes.ts';

function makeController(overrides: any = {}) {
  const controller: any = Object.create(PlayerController.prototype);
  controller.activeTool = SpecialTool.SELECTOR;
  controller.selectedSubtree = null;
  controller.selectedBlockSelection = null;
  controller.selectorLevel = null;
  controller.selectorRange = null;
  controller.contraptions = overrides.manager || null;
  controller.world = overrides.world || null;
  controller.keys = {};
  const toasts: string[] = [];
  controller.ui = {
    showToast: m => toasts.push(m),
    renderInventoryBar() {}
  };
  Object.assign(controller, overrides);
  controller.inventoryCategory();
  controller.__toasts = toasts;
  return controller;
}

/** Build a valid binary GLB from JSON and binary chunks */
function createGlb(json: any, bin: Buffer): ArrayBuffer {
  const jsonText = JSON.stringify(json);
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const jsonBytes = Buffer.from(jsonText + ' '.repeat(jsonPad));

  const binPad = (4 - (bin.length % 4)) % 4;
  const binBytes = binPad > 0 ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

  const totalLength = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // Header
  glb.writeUInt32LE(0x46546C67, offset); offset += 4; // 'glTF'
  glb.writeUInt32LE(2, offset); offset += 4; // version 2
  glb.writeUInt32LE(totalLength, offset); offset += 4;

  // Chunk 0: JSON
  glb.writeUInt32LE(jsonBytes.length, offset); offset += 4;
  glb.writeUInt32LE(0x4E4F534A, offset); offset += 4; // 'JSON'
  jsonBytes.copy(glb, offset); offset += jsonBytes.length;

  // Chunk 1: BIN
  glb.writeUInt32LE(binBytes.length, offset); offset += 4;
  glb.writeUInt32LE(0x004E4942, offset); offset += 4; // 'BIN\0'
  binBytes.copy(glb, offset); offset += binBytes.length;

  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}

test('sampleTriangleColor correctly prioritizes textures, vertex colors, and material colors', () => {
  // 1. Texture sampler
  const textureData = new Uint8Array([
    255, 0, 0, 255,   // top-left (0, 1 in UV): Red
    0, 255, 0, 255,   // top-right (1, 1 in UV): Green
    0, 0, 255, 255,   // bottom-left (0, 0 in UV): Blue
    255, 255, 0, 255  // bottom-right (1, 0 in UV): Yellow
  ]);
  const triWithTex: VoxelTriangle = {
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0, 1, 0],
    uvs: [[0, 1], [1, 1], [0, 0]], // top-left, top-right, bottom-left
    texture: { data: textureData, width: 2, height: 2 }
  };
  // Sample near vertex A (top-left) -> red 0xff0000
  const colorA = sampleTriangleColor(triWithTex, 1, 0, 0);
  assert.equal(colorA, 0xff0000);
  // Sample near vertex B (top-right) -> green 0x00ff00
  const colorB = sampleTriangleColor(triWithTex, 0, 1, 0);
  assert.equal(colorB, 0x00ff00);

  // 2. Vertex colors
  const triWithVertCol: VoxelTriangle = {
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0, 1, 0],
    vertexColors: [[255, 0, 0], [0, 255, 0], [0, 0, 255]]
  };
  assert.equal(sampleTriangleColor(triWithVertCol, 1, 0, 0), 0xff0000);
  assert.equal(sampleTriangleColor(triWithVertCol, 0, 1, 0), 0x00ff00);
  assert.equal(sampleTriangleColor(triWithVertCol, 0, 0, 1), 0x0000ff);

  // 3. Flat material color
  const triWithMatCol: VoxelTriangle = {
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0, 1, 0],
    color: 0x336699
  };
  assert.equal(sampleTriangleColor(triWithMatCol, 0.33, 0.33, 0.34), 0x336699);

  // 4. Default fallback
  const plainTri: VoxelTriangle = {
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0, 1, 0]
  };
  assert.equal(sampleTriangleColor(plainTri, 0.33, 0.33, 0.34, 0x123456), 0x123456);
});

test('extractTrianglesFromObject3D extracts geometry, vertex colors, material colors, and transforms from Three.js scene', () => {
  const scene = new THREE.Scene();
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    2, 0, 0,
    0, 2, 0
  ]);
  const colors = new Float32Array([
    1, 0, 0, // Red
    0, 1, 0, // Green
    0, 0, 1  // Blue
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(10, 5, 0); // Translate
  scene.add(mesh);

  const triangles = extractTrianglesFromObject3D(scene);
  assert.equal(triangles.length, 1);
  assert.deepEqual(triangles[0].a, [10, 5, 0]);
  assert.deepEqual(triangles[0].b, [12, 5, 0]);
  assert.deepEqual(triangles[0].c, [10, 7, 0]);
  assert.deepEqual(triangles[0].vertexColors, [[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
});

test('extractTrianglesFromObject3D honors the base-color texture UV channel and transform', () => {
  const scene = new THREE.Scene();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0
  ], 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    0, 0,
    0, 0
  ], 2));
  geom.setAttribute('uv1', new THREE.Float32BufferAttribute([
    0, 1,
    1, 1,
    0, 0
  ], 2));

  const texture = new THREE.DataTexture(
    new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255
    ]),
    2,
    2,
    THREE.RGBAFormat
  );
  texture.channel = 1;
  texture.flipY = false;
  texture.offset.set(0.25, 0);
  texture.repeat.set(0.5, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture });
  scene.add(new THREE.Mesh(geom, material));

  const [triangle] = extractTrianglesFromObject3D(scene);
  assert.ok(triangle.uvs);
  assert.deepEqual(triangle.uvs, [[0.25, 1], [0.75, 1], [0.25, 0]]);

  material.dispose();
  texture.dispose();
  geom.dispose();
});

test('parseGLTFData parses full-color GLB model with vertex colors', async () => {
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, COLOR_0: 1 },
        indices: 2
      }]
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 0], min: [0, 0, 0] },
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 6 }
    ],
    buffers: [{ byteLength: 78 }]
  };

  const bin = Buffer.concat([
    Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
    Buffer.from(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]).buffer), // Red, Green, Blue
    Buffer.from(new Uint16Array([0, 1, 2]).buffer)
  ]);

  const glbBuffer = createGlb(json, bin);
  const triangles = await parseGLTFData(glbBuffer);

  assert.equal(triangles.length, 1);
  assert.deepEqual(triangles[0].vertexColors, [[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
});

test('voxelizeModel quantizes a full-color model into color-preserving blocks', () => {
  // A unit triangle with red vertex color
  const triangles: VoxelTriangle[] = [
    {
      a: [0, 0, 0],
      b: [1, 0, 0],
      c: [0, 1, 0],
      color: 0xff2233
    },
    {
      a: [0, 0, 1],
      b: [1, 0, 1],
      c: [0, 1, 1],
      color: 0x3344ff
    }
  ];

  const plan = planModelSize(triangles, 4, 1);
  const result = voxelizeModel(triangles, plan.cellSize, 0xffffff, { scale: plan.scale });

  assert.ok(result.blocks.length > 0);
  assert.equal(result.blocks[0].block, BlockTypes.COLOR_BLOCK);
  // Blocks preserve the quantized full-color values
  const colors = new Set(result.blocks.map(b => b.color));
  assert.ok(colors.has(0xff2233) || colors.has(0x3344ff));
});

test('voxelizeModel colors every shell block from large textured triangles', () => {
  const side = 16;
  const texture = {
    data: new Uint8Array([255, 0, 0, 255]),
    width: 1,
    height: 1
  };
  const triangle = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): VoxelTriangle => ({
    a, b, c,
    color: 0xffffff,
    uvs: [[0, 0], [1, 0], [1, 1]],
    texture
  });
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number]
  ): VoxelTriangle[] => [triangle(a, b, c), triangle(a, c, d)];

  const triangles = [
    ...quad([0, 0, 0], [0, side, 0], [0, side, side], [0, 0, side]),
    ...quad([side, 0, 0], [side, 0, side], [side, side, side], [side, side, 0]),
    ...quad([0, 0, 0], [0, 0, side], [side, 0, side], [side, 0, 0]),
    ...quad([0, side, 0], [side, side, 0], [side, side, side], [0, side, side]),
    ...quad([0, 0, 0], [side, 0, 0], [side, side, 0], [0, side, 0]),
    ...quad([0, 0, side], [0, side, side], [side, side, side], [side, 0, side])
  ];

  const result = voxelizeModel(triangles, 1, 0xffffff, { hollow: true });
  assert.ok(result.blocks.length > 500);
  assert.deepEqual(new Set(result.blocks.map(block => block.color)), new Set([0xff0000]));
});

test('parse3DModelData auto-detects GLB, GLTF, and STL files', async () => {
  // 1. GLB
  const glbJson = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1
      }]
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 0], min: [0, 0, 0] },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 }
    ],
    buffers: [{ byteLength: 42 }]
  };
  const glbBin = Buffer.concat([
    Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
    Buffer.from(new Uint16Array([0, 1, 2]).buffer)
  ]);
  const glbBuffer = createGlb(glbJson, glbBin);
  const glbTris = await parse3DModelData(glbBuffer, 'test_model.glb');
  assert.equal(glbTris.length, 1);

  // 2. STL (ASCII)
  const stlText = `solid test
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid test`;
  const stlBuffer = new TextEncoder().encode(stlText).buffer;
  const stlTris = await parse3DModelData(stlBuffer, 'test_model.stl');
  assert.equal(stlTris.length, 1);
});

test('PlayerController imports full-color 3D model into block set inventory', async () => {
  const controller = makeController();
  const blocks = [
    { dx: 0, dy: 0, dz: 0, size: 1, block: BlockTypes.COLOR_BLOCK, color: 0xff0000 },
    { dx: 1, dy: 0, dz: 0, size: 1, block: BlockTypes.COLOR_BLOCK, color: 0x00ff00 },
    { dx: 0, dy: 1, dz: 0, size: 1, block: BlockTypes.COLOR_BLOCK, color: 0x0000ff }
  ];

  const slot = controller.importBlockSetToInventory(blocks, 'robot.glb @size 16');
  assert.ok(slot);
  assert.equal(slot.kind, 'blockset');
  assert.equal(slot.blockCount, 3);
  assert.equal(controller.activeInventoryCategory, 'blockset');
  assert.equal(controller.inventories.blockset.items[0].blocks[0].color, 0xff0000);
  assert.equal(controller.inventories.blockset.items[0].blocks[1].color, 0x00ff00);
  assert.equal(controller.inventories.blockset.items[0].blocks[2].color, 0x0000ff);
});
