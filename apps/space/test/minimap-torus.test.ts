import test from 'node:test';
import assert from 'node:assert/strict';
import { Minimap } from '../src/ui/Minimap.ts';
import { Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '@entropydrop/space-engine/voxel/Chunk.ts';
import { TORUS_SIZE_X, TORUS_SIZE_Z } from '@entropydrop/space-engine/torus/TorusWorld.ts';

function createMockElement(tag = 'div'): any {
  const children: any[] = [];
  const el: any = {
    tagName: tag.toUpperCase(),
    style: {},
    clientWidth: 192,
    children,
    childNodes: children,
    appendChild(child: any) { children.push(child); return child; },
    querySelector(sel: string) {
      if (sel === 'canvas') return createMockCanvas();
      return null;
    }
  };
  return el;
}

function createMockCanvas() {
  const el: any = {
    width: 192,
    height: 192,
    style: {},
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
      clearRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fillText: () => {},
      setTransform: () => {},
    })
  };
  return el;
}

function setupMockDOM() {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return createMockCanvas();
      return createMockElement(tag);
    }
  };
  (globalThis as any).window = {
    devicePixelRatio: 1,
    addEventListener: () => {}
  };
  return {
    cleanup() {
      (globalThis as any).document = undefined;
      (globalThis as any).window = undefined;
    }
  };
}

function makeMockChunk(cx: number, cz: number, blockHeight = 10, color = 0x3c8527) {
  return {
    cx,
    cz,
    getLocalBlock: (lx: number, y: number, lz: number) => (y <= blockHeight ? 1 : 0),
    getLocalColor: (lx: number, y: number, lz: number) => color
  };
}

test('Minimap bounds and caches column scans without changing array-backed samples', () => {
  const dom = setupMockDOM();
  let blockProbes = 0;
  let highestProbedY = -1;
  let rangeReads = 0;
  const topAt = (lx: number, lz: number) => (lx * 3 + lz * 5) % 13;
  const colorAt = (lx: number, lz: number) => 0x110000 | (lx << 8) | lz;
  const referenceChunk = {
    dataVersion: 1,
    getOccupiedYRange: () => ({ min: 0, max: 12 }),
    getLocalBlock: (lx: number, y: number, lz: number) => {
      blockProbes++;
      highestProbedY = Math.max(highestProbedY, y);
      return y <= topAt(lx, lz) ? 1 : 0;
    },
    getLocalColor: (lx: number, _y: number, lz: number) => colorAt(lx, lz),
  };
  referenceChunk.getOccupiedYRange = () => {
    rangeReads++;
    return { min: 0, max: 12 };
  };

  const blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
  const colors = new Uint32Array(blocks.length);
  let expectedProbes = 0;
  for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      const topY = topAt(lx, lz);
      const index = Chunk.getIndex(lx, topY, lz);
      blocks[index] = 1;
      colors[index] = colorAt(lx, lz);
      expectedProbes += 12 - topY + 1;
    }
  }
  const arrayChunk = {
    dataVersion: 1,
    blocks,
    colors,
    getOccupiedYRange: () => ({ min: 0, max: 12 }),
    getLocalBlock: () => { throw new Error('array-backed chunks should use direct storage'); },
    getLocalColor: () => { throw new Error('array-backed chunks should use direct storage'); },
  };
  const makeWorld = (chunk: any) => {
    const chunks = new Map([['0,0', chunk]]);
    return {
      chunks,
      getChunk: (cx: number, cz: number) => chunks.get(`${cx},${cz}`) || null,
      microVoxels: { cells: new Map() },
    };
  };

  const reference = new Minimap(makeWorld(referenceChunk), null);
  const optimized = new Minimap(makeWorld(arrayChunk), null);
  reference.recomputeTerrain(0, 0);
  optimized.recomputeTerrain(0, 0);

  assert.equal(highestProbedY, 12, 'the minimap must not probe known-empty upper layers');
  assert.equal(blockProbes, expectedProbes);
  assert.equal(rangeReads, 1, 'occupied bounds should be read once per chunk version');
  assert.deepEqual(optimized.heights, reference.heights);
  assert.deepEqual(optimized.colors, reference.colors);
  assert.deepEqual(optimized.imageData?.data, reference.imageData?.data);

  reference.recomputeTerrain(1, 0);
  assert.equal(blockProbes, expectedProbes, 'player movement should reuse unchanged chunk surfaces');
  assert.equal(rangeReads, 1);

  referenceChunk.dataVersion++;
  reference.recomputeTerrain(2, 0);
  assert.equal(blockProbes, expectedProbes * 2, 'voxel revisions must invalidate the cached surface');
  assert.equal(rangeReads, 2);
  dom.cleanup();
});

test('Minimap skips standard scans for an empty chunk', () => {
  const dom = setupMockDOM();
  let blockProbes = 0;
  const chunk = {
    getOccupiedYRange: () => null,
    getLocalBlock: () => { blockProbes++; return 0; },
    getLocalColor: () => 0,
  };
  const chunks = new Map([['0,0', chunk]]);
  const minimap = new Minimap({
    chunks,
    getChunk: (cx: number, cz: number) => chunks.get(`${cx},${cz}`) || null,
    microVoxels: { cells: new Map() },
  }, null);

  minimap.recomputeTerrain(0, 0);

  assert.equal(blockProbes, 0);
  dom.cleanup();
});

test('disabled Minimap skips all terrain work', () => {
  const dom = setupMockDOM();
  const minimap = new Minimap({
    get chunks() {
      throw new Error('disabled minimap should not inspect terrain');
    },
  }, null);
  minimap.attachCanvas(createMockCanvas());
  minimap.setEnabled(false);

  assert.equal(minimap.isEnabled(), false);
  assert.doesNotThrow(() => minimap.update({ x: 0, z: 0 }, 0, false, null));
  dom.cleanup();
});

test('Minimap seamlessly renders across toroidal boundary at (1, 1, 1)', () => {
  const dom = setupMockDOM();
  const chunks = new Map<string, any>();
  // Chunk at (0, 0)
  chunks.set('0,0', makeMockChunk(0, 0, 15, 0x112233));
  // Chunk wrapped on negative X side: (1023, 0)
  chunks.set('1023,0', makeMockChunk(1023, 0, 18, 0x445566));
  // Chunk wrapped on negative Z side: (0, 127)
  chunks.set('0,127', makeMockChunk(0, 127, 20, 0x778899));
  // Chunk wrapped on both negative X and Z: (1023, 127)
  chunks.set('1023,127', makeMockChunk(1023, 127, 22, 0xaabbcc));

  const world = {
    chunks,
    getChunk: (cx: number, cz: number) => chunks.get(`${cx},${cz}`) || null,
    terrainVersion: 1,
    microVoxels: { cells: new Map() }
  };

  const minimap = new Minimap(world, null);
  // Recompute at player position (1, 1)
  minimap.recomputeTerrain(1, 1);

  // Center pixel is at index gz = 96, gx = 96 (where player is at 1,1)
  const centerIdx = 96 * Minimap.CELLS + 96;
  assert.equal(minimap.heights[centerIdx], 16); // 15 + 1
  assert.equal(minimap.colors[centerIdx], 0x112233);

  // 3 pixels to the left across the wrapped X boundary (x = 16382)
  // dx = 16382 - 1 = -3, gx = 96 - 3 = 93
  const leftWrappedIdx = 96 * Minimap.CELLS + 93;
  assert.equal(minimap.heights[leftWrappedIdx], 19); // 18 + 1
  assert.equal(minimap.colors[leftWrappedIdx], 0x445566);

  // 3 pixels up across the wrapped Z boundary (z = 2046)
  // dz = 2046 - 1 = -3, gz = 96 - 3 = 93
  const topWrappedIdx = 93 * Minimap.CELLS + 96;
  assert.equal(minimap.heights[topWrappedIdx], 21); // 20 + 1
  assert.equal(minimap.colors[topWrappedIdx], 0x778899);

  dom.cleanup();
});

test('Minimap correctly wraps entity positions near toroidal boundaries', () => {
  const dom = setupMockDOM();
  const world = { chunks: new Map(), getChunk: () => null, terrainVersion: 1 };

  // Contraption at x = 16380 (4 meters to the left of player at x = 0)
  const contraption = {
    position: { x: 16380, y: 20, z: 0 }
  };
  const contraptionManager = {
    contraptions: [contraption]
  };

  const minimap = new Minimap(world, contraptionManager);
  minimap.attachCanvas(createMockCanvas());

  // When player is at (0, 0), the update call should not throw and correctly process entity
  assert.doesNotThrow(() => {
    minimap.update({ x: 0, z: 0 }, 0, false, null);
  });

  dom.cleanup();
});
