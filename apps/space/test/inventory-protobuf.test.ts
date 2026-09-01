import test from 'node:test';
import assert from 'node:assert/strict';
import { Backpack, InventoryResource } from '../src/generated/inventory.ts';
import {
  decodeBackpack,
  decodeInventoryResource,
  encodeInventoryResource,
  inventoryResourcePreviewItem,
} from '../src/engine/storage/InventoryProtobuf.ts';


const CROSS_LANGUAGE_BLOCKSET_HEX = '080352190a0543726f737312100801100420462d34ab12003203746970';

test('inventory Protobuf has the same deterministic wire bytes as the backend codec', () => {
  const encoded = encodeInventoryResource('blockset', {
    type: 'space-blockset',
    version: 3,
    name: 'Cross',
    blocks: [{ dx: -1, dy: 2, dz: 0, mx: 4, my: 3, mz: 2, color: 0x12ab34, part: 'tip' }],
  });
  assert.equal(Buffer.from(encoded).toString('hex'), CROSS_LANGUAGE_BLOCKSET_HEX);
  const decoded = decodeInventoryResource(Buffer.from(CROSS_LANGUAGE_BLOCKSET_HEX, 'hex'));
  assert.equal(decoded.category, 'blockset');
  assert.deepEqual(decoded.portable.blocks[0], {
    dx: -1, dy: 2, dz: 0, mx: 4, my: 3, mz: 2, block: 1, color: 0x12ab34, part: 'tip',
  });
});

test('backpack decoder rejects a resource placed in the wrong category group', () => {
  const colorSet = InventoryResource.decode(encodeInventoryResource('colorset', {
    type: 'space-colorset',
    version: 3,
    name: 'Palette',
    colors: new Array(9).fill('#123456'),
  }));
  const encoded = Backpack.encode({
    schemaVersion: 3,
    activeCategory: 0,
    blockSets: { selected: 0, slots: [{ index: 0, resource: colorSet }] },
    entities: undefined,
    colorSets: undefined,
  }).finish();
  assert.throws(() => decodeBackpack(encoded), /blockset group contains a colorset/);
});

test('market preview conversion preserves full resources and expands micro voxel coordinates', () => {
  const blockSet = inventoryResourcePreviewItem('blockset', {
    name: 'Micro',
    blocks: [{ dx: 2, dy: -1, dz: 4, mx: 3, my: 2, mz: 1, color: 0x123456 }],
  });
  assert.equal(blockSet.kind, 'blockset');
  assert.deepEqual(blockSet.blocks[0], {
    dx: 2.6, dy: -0.6, dz: 4.2, mx: 3, my: 2, mz: 1, color: 0x123456, size: 0.2,
  });

  const entity = inventoryResourcePreviewItem('entity', {
    blocks: [{ dx: 1, dy: 2, dz: 3, entityId: 'arm', color: 0xabcdef }],
    childEntities: [{ id: 'arm', parentId: 'root', pivot: [1, 2, 3] }],
  });
  assert.equal(entity.kind, 'entity');
  assert.deepEqual(
    { x: entity.blocks[0].localX, y: entity.blocks[0].localY, z: entity.blocks[0].localZ, size: entity.blocks[0].size },
    { x: 1, y: 2, z: 3, size: 1 },
  );
  assert.deepEqual(entity.childEntities, [{ id: 'arm', parentId: 'root', pivot: [1, 2, 3] }]);
});
