import {
  Backpack,
  BodyType,
  ConstraintType,
  EntityMode,
  InventoryCategory,
  InventoryResource,
  type InventoryResource as InventoryResourceMessage,
  type Vector3,
  type Voxel,
} from '../../generated/inventory.ts';

export const INVENTORY_PROTOBUF_SCHEMA_VERSION = 3;
export const INVENTORY_PROTOBUF_MIME = 'application/x-protobuf';
const MAX_BACKPACK_SLOTS_PER_CATEGORY = 99;
export type InventoryKind = 'blockset' | 'entity' | 'colorset';

export interface PortableBackpack {
  activeCategory: InventoryKind;
  categories: Record<InventoryKind, {
    selected: number;
    items: Array<any | null>;
  }>;
}

const BODY_TYPE_TO_PROTO: Record<string, BodyType> = {
  dynamic: BodyType.BODY_TYPE_DYNAMIC,
  kinematic: BodyType.BODY_TYPE_KINEMATIC,
};
const BODY_TYPE_FROM_PROTO = ['dynamic', 'kinematic'] as const;
const MODE_TO_PROTO: Record<string, EntityMode> = {
  free_physics: EntityMode.ENTITY_MODE_FREE_PHYSICS,
  bearing: EntityMode.ENTITY_MODE_BEARING,
  piston: EntityMode.ENTITY_MODE_PISTON,
  drivable: EntityMode.ENTITY_MODE_DRIVABLE,
  projectile: EntityMode.ENTITY_MODE_PROJECTILE,
  programmable: EntityMode.ENTITY_MODE_PROGRAMMABLE,
};
const MODE_FROM_PROTO = [
  'free_physics',
  'bearing',
  'piston',
  'drivable',
  'projectile',
  'programmable',
] as const;
const CONSTRAINT_TO_PROTO: Record<string, ConstraintType> = {
  point: ConstraintType.CONSTRAINT_TYPE_POINT,
  hinge: ConstraintType.CONSTRAINT_TYPE_HINGE,
  weld: ConstraintType.CONSTRAINT_TYPE_WELD,
};
const CONSTRAINT_FROM_PROTO = ['point', 'hinge', 'weld'] as const;

function vector3(value: unknown): Vector3 | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  return { x: Number(value[0]), y: Number(value[1]), z: Number(value[2]) };
}

function vectorArray(value: Vector3 | undefined): number[] | undefined {
  return value ? [Number(value.x), Number(value.y), Number(value.z)] : undefined;
}

function voxelMessage(block: any, componentIndex = 0): Voxel {
  const micro = block.mx !== undefined && block.mx !== null;
  return {
    dx: Number(block.dx),
    dy: Number(block.dy),
    dz: Number(block.dz),
    microIndex: micro
      ? 1 + Number(block.mx) + 5 * Number(block.my) + 25 * Number(block.mz)
      : undefined,
    color: Number(block.color) >>> 0,
    part: block.part === undefined || block.part === null ? undefined : String(block.part),
    componentIndex,
  };
}

function portableVoxel(block: Voxel, entityId?: string): any {
  const portable: any = {
    dx: Number(block.dx),
    dy: Number(block.dy),
    dz: Number(block.dz),
    block: 1,
    color: Number(block.color) >>> 0,
  };
  if (block.microIndex !== undefined) {
    const packed = Number(block.microIndex) - 1;
    if (!Number.isInteger(packed) || packed < 0 || packed >= 125) {
      throw new Error('Micro voxel index is outside 0..124.');
    }
    portable.mx = packed % 5;
    portable.my = Math.floor(packed / 5) % 5;
    portable.mz = Math.floor(packed / 25);
  }
  if (block.part !== undefined) portable.part = block.part;
  if (entityId !== undefined) portable.entityId = entityId;
  return portable;
}

function requireIndex(indices: Map<string, number>, id: unknown): number {
  const index = indices.get(String(id));
  if (index === undefined) throw new Error(`Unknown component ${String(id)}.`);
  return index;
}

function componentId(ids: string[], index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) {
    throw new Error(`Component index ${index} is out of range.`);
  }
  return ids[index];
}

function enumName<T extends string>(values: readonly T[], value: number, label: string): T {
  const result = values[value];
  if (result === undefined) throw new Error(`Unknown ${label} enum value ${value}.`);
  return result;
}

function resourceMessage(category: InventoryKind, portable: any): InventoryResourceMessage {
  const base: InventoryResourceMessage = {
    schemaVersion: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    blockSet: undefined,
    entity: undefined,
    colorSet: undefined,
  };
  if (category === 'blockset') {
    base.blockSet = {
      name: String(portable.name || ''),
      blocks: (portable.blocks || []).map((block: any) => voxelMessage(block)),
    };
    return base;
  }
  if (category === 'colorset') {
    base.colorSet = {
      name: String(portable.name || ''),
      colors: (portable.colors || []).map((color: string) => (
        Number.parseInt(String(color).replace(/^#/, ''), 16) >>> 0
      )),
    };
    return base;
  }

  const components = Array.isArray(portable.childEntities) ? portable.childEntities : [];
  const indices = new Map<string, number>([['root', 0]]);
  components.forEach((component: any, index: number) => {
    const id = String(component.id || '');
    if (indices.has(id)) throw new Error(`Duplicate component ${id}.`);
    indices.set(id, index + 1);
  });
  base.entity = {
    name: String(portable.name || ''),
    components: components.map((component: any) => ({
      id: String(component.id || ''),
      parentIndex: requireIndex(indices, component.parentId || 'root'),
      collisionEnabled: component.collisionEnabled === undefined
        ? undefined
        : component.collisionEnabled === true,
      pivot: vector3(component.pivot),
      bodyType: component.bodyType === undefined ? undefined : BODY_TYPE_TO_PROTO[component.bodyType],
      mass: component.mass === undefined ? undefined : Number(component.mass),
      restitution: component.restitution === undefined ? undefined : Number(component.restitution),
      friction: component.friction === undefined ? undefined : Number(component.friction),
    })),
    blocks: (portable.blocks || []).map((block: any) => (
      voxelMessage(block, requireIndex(indices, block.entityId || 'root'))
    )),
    scripts: (portable.scripts || []).map((script: any) => ({
      componentIndex: requireIndex(indices, script.id),
      code: String(script.code || ''),
    })),
    enabled: (portable.enabled || []).map((entry: any) => ({
      componentIndex: requireIndex(indices, entry.id),
      enabled: entry.enabled === true,
    })),
    constraints: (portable.constraints || []).map((constraint: any) => ({
      id: String(constraint.id || ''),
      type: CONSTRAINT_TO_PROTO[constraint.type || 'point'],
      bodyAIsWorld: constraint.bodyA === 'world',
      bodyAComponentIndex: constraint.bodyA === 'world' ? 0 : requireIndex(indices, constraint.bodyA),
      bodyBComponentIndex: requireIndex(indices, constraint.bodyB),
      anchorA: vector3(constraint.anchorA),
      anchorB: vector3(constraint.anchorB),
      axisA: vector3(constraint.axisA),
      axisB: vector3(constraint.axisB),
      referenceA: vector3(constraint.referenceA),
      referenceB: vector3(constraint.referenceB),
      limits: constraint.limits ? {
        min: Number(constraint.limits.min),
        max: Number(constraint.limits.max),
      } : undefined,
      stiffness: Number(constraint.stiffness ?? 0.9),
      collideConnected: constraint.collideConnected === true,
    })),
    mode: MODE_TO_PROTO[portable.mode || 'free_physics'],
    bodyType: BODY_TYPE_TO_PROTO[portable.bodyType || 'dynamic'],
    mass: portable.mass === undefined ? undefined : Number(portable.mass),
    restitution: portable.restitution === undefined ? undefined : Number(portable.restitution),
    friction: portable.friction === undefined ? undefined : Number(portable.friction),
    useGravity: portable.useGravity === undefined ? undefined : portable.useGravity === true,
    bearingAxis: vector3(portable.bearingAxis),
    bearingRpm: portable.bearingRpm === undefined ? undefined : Number(portable.bearingRpm),
    pistonAxis: vector3(portable.pistonAxis),
    pistonDistance: portable.pistonDistance === undefined ? undefined : Number(portable.pistonDistance),
    pistonSpeed: portable.pistonSpeed === undefined ? undefined : Number(portable.pistonSpeed),
    cockpitPosition: vector3(portable.cockpitPosition),
    isVehicle: portable.isVehicle === undefined ? undefined : portable.isVehicle === true,
  };
  return base;
}

function portableResource(message: InventoryResourceMessage): { category: InventoryKind; portable: any } {
  if (Number(message.schemaVersion) !== INVENTORY_PROTOBUF_SCHEMA_VERSION) {
    throw new Error(`Expected inventory Protobuf v${INVENTORY_PROTOBUF_SCHEMA_VERSION}.`);
  }
  if (message.blockSet) {
    const blocks = (message.blockSet.blocks || []).map(block => portableVoxel(block));
    return {
      category: 'blockset',
      portable: {
        type: 'space-blockset',
        version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
        name: message.blockSet.name,
        blockCount: blocks.length,
        blocks,
      },
    };
  }
  if (message.colorSet) {
    return {
      category: 'colorset',
      portable: {
        type: 'space-colorset',
        version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
        name: message.colorSet.name,
        colors: (message.colorSet.colors || []).map(color => `#${(Number(color) >>> 0).toString(16).padStart(6, '0')}`),
      },
    };
  }
  if (!message.entity) throw new Error('Inventory Protobuf does not contain a resource.');

  const entity = message.entity;
  const ids = ['root', ...(entity.components || []).map(component => String(component.id || ''))];
  const blocks = (entity.blocks || []).map(block => (
    portableVoxel(block, componentId(ids, Number(block.componentIndex)))
  ));
  const portable: any = {
    type: 'space-entity',
    version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    name: entity.name,
    rootId: 'root',
    nodeCount: ids.length,
    blockCount: blocks.length,
    blocks,
    childEntities: (entity.components || []).map(component => ({
      id: String(component.id || ''),
      parentId: componentId(ids, Number(component.parentIndex)),
      kind: 'child',
      ...(component.collisionEnabled === undefined ? {} : { collisionEnabled: component.collisionEnabled }),
      ...(component.pivot === undefined ? {} : { pivot: vectorArray(component.pivot) }),
      ...(component.bodyType === undefined ? {} : {
        bodyType: enumName(BODY_TYPE_FROM_PROTO, Number(component.bodyType), 'body type'),
      }),
      ...(component.mass === undefined ? {} : { mass: Number(component.mass) }),
      ...(component.restitution === undefined ? {} : { restitution: Number(component.restitution) }),
      ...(component.friction === undefined ? {} : { friction: Number(component.friction) }),
    })),
    scripts: (entity.scripts || []).map(script => ({
      id: componentId(ids, Number(script.componentIndex)),
      code: String(script.code || ''),
    })),
    enabled: (entity.enabled || []).map(entry => ({
      id: componentId(ids, Number(entry.componentIndex)),
      enabled: entry.enabled === true,
    })),
    constraints: (entity.constraints || []).map(constraint => ({
      id: String(constraint.id || ''),
      type: enumName(CONSTRAINT_FROM_PROTO, Number(constraint.type), 'constraint type'),
      bodyA: constraint.bodyAIsWorld
        ? 'world'
        : componentId(ids, Number(constraint.bodyAComponentIndex)),
      bodyB: componentId(ids, Number(constraint.bodyBComponentIndex)),
      ...(constraint.anchorA === undefined ? {} : { anchorA: vectorArray(constraint.anchorA) }),
      ...(constraint.anchorB === undefined ? {} : { anchorB: vectorArray(constraint.anchorB) }),
      ...(constraint.axisA === undefined ? {} : { axisA: vectorArray(constraint.axisA) }),
      ...(constraint.axisB === undefined ? {} : { axisB: vectorArray(constraint.axisB) }),
      ...(constraint.referenceA === undefined ? {} : { referenceA: vectorArray(constraint.referenceA) }),
      ...(constraint.referenceB === undefined ? {} : { referenceB: vectorArray(constraint.referenceB) }),
      ...(constraint.limits === undefined ? {} : {
        limits: { min: Number(constraint.limits.min), max: Number(constraint.limits.max) },
      }),
      stiffness: Number(constraint.stiffness),
      collideConnected: constraint.collideConnected === true,
    })),
    mode: enumName(MODE_FROM_PROTO, Number(entity.mode), 'entity mode'),
    bodyType: enumName(BODY_TYPE_FROM_PROTO, Number(entity.bodyType), 'body type'),
    ...(entity.mass === undefined ? {} : { mass: Number(entity.mass) }),
    ...(entity.restitution === undefined ? {} : { restitution: Number(entity.restitution) }),
    ...(entity.friction === undefined ? {} : { friction: Number(entity.friction) }),
    ...(entity.useGravity === undefined ? {} : { useGravity: entity.useGravity }),
    ...(entity.bearingAxis === undefined ? {} : { bearingAxis: vectorArray(entity.bearingAxis) }),
    ...(entity.bearingRpm === undefined ? {} : { bearingRpm: Number(entity.bearingRpm) }),
    ...(entity.pistonAxis === undefined ? {} : { pistonAxis: vectorArray(entity.pistonAxis) }),
    ...(entity.pistonDistance === undefined ? {} : { pistonDistance: Number(entity.pistonDistance) }),
    ...(entity.pistonSpeed === undefined ? {} : { pistonSpeed: Number(entity.pistonSpeed) }),
    ...(entity.cockpitPosition === undefined ? {} : { cockpitPosition: vectorArray(entity.cockpitPosition) }),
    ...(entity.isVehicle === undefined ? {} : { isVehicle: entity.isVehicle }),
  };
  return { category: 'entity', portable };
}

export function encodeInventoryResource(category: InventoryKind, portable: any): Uint8Array {
  return InventoryResource.encode(resourceMessage(category, portable)).finish();
}

export function decodeInventoryResource(
  encoded: Uint8Array,
  expectedCategory?: InventoryKind,
): { category: InventoryKind; portable: any } {
  const decoded = portableResource(InventoryResource.decode(encoded));
  if (expectedCategory && decoded.category !== expectedCategory) {
    throw new Error(`Expected ${expectedCategory}, received ${decoded.category}.`);
  }
  return decoded;
}

/** Convert portable v3 coordinates into the runtime shape used by thumbnail rendering. */
export function inventoryResourcePreviewItem(category: InventoryKind, portable: any): any {
  if (category === 'colorset') return { ...portable, kind: category };
  const blocks = (portable?.blocks || []).map((block: any) => {
    const isMicro = block.mx !== undefined && block.my !== undefined && block.mz !== undefined;
    const x = Number(block.dx) + (isMicro ? Number(block.mx) / 5 : 0);
    const y = Number(block.dy) + (isMicro ? Number(block.my) / 5 : 0);
    const z = Number(block.dz) + (isMicro ? Number(block.mz) / 5 : 0);
    const size = isMicro ? 0.2 : 1;
    return category === 'entity'
      ? { ...block, localX: x, localY: y, localZ: z, size }
      : { ...block, dx: x, dy: y, dz: z, size };
  });
  return {
    ...portable,
    kind: category,
    blockCount: blocks.length,
    blocks,
  };
}

function categoryEnum(category: InventoryKind): InventoryCategory {
  if (category === 'entity') return InventoryCategory.INVENTORY_CATEGORY_ENTITY;
  if (category === 'colorset') return InventoryCategory.INVENTORY_CATEGORY_COLOR_SET;
  return InventoryCategory.INVENTORY_CATEGORY_BLOCK_SET;
}

function categoryName(category: InventoryCategory): InventoryKind {
  if (category === InventoryCategory.INVENTORY_CATEGORY_ENTITY) return 'entity';
  if (category === InventoryCategory.INVENTORY_CATEGORY_COLOR_SET) return 'colorset';
  if (category === InventoryCategory.INVENTORY_CATEGORY_BLOCK_SET) return 'blockset';
  throw new Error(`Unknown backpack category enum value ${category}.`);
}

export function encodeBackpack(backpack: PortableBackpack): Uint8Array {
  const group = (category: InventoryKind) => ({
    selected: backpack.categories[category].selected,
    slots: backpack.categories[category].items.flatMap((portable, index) => (
      portable ? [{ index, resource: resourceMessage(category, portable) }] : []
    )),
  });
  return Backpack.encode({
    schemaVersion: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    activeCategory: categoryEnum(backpack.activeCategory),
    blockSets: group('blockset'),
    entities: group('entity'),
    colorSets: group('colorset'),
  }).finish();
}

export function decodeBackpack(encoded: Uint8Array): PortableBackpack {
  const backpack = Backpack.decode(encoded);
  if (Number(backpack.schemaVersion) !== INVENTORY_PROTOBUF_SCHEMA_VERSION) {
    throw new Error(`Expected backpack Protobuf v${INVENTORY_PROTOBUF_SCHEMA_VERSION}.`);
  }
  const decodeGroup = (category: InventoryKind, group: any) => {
    const items: Array<any | null> = [];
    const occupied = new Set<number>();
    for (const slot of group?.slots || []) {
      const index = Number(slot.index);
      if (
        !Number.isSafeInteger(index)
        || index < 0
        || index >= MAX_BACKPACK_SLOTS_PER_CATEGORY
        || occupied.has(index)
        || !slot.resource
      ) {
        throw new Error('Backpack contains an invalid slot.');
      }
      const decoded = portableResource(slot.resource);
      if (decoded.category !== category) {
        throw new Error(`Backpack ${category} group contains a ${decoded.category} resource.`);
      }
      occupied.add(index);
      items[index] = decoded.portable;
    }
    return { selected: Number(group?.selected || 0), items };
  };
  return {
    activeCategory: categoryName(backpack.activeCategory!),
    categories: {
      blockset: decodeGroup('blockset', backpack.blockSets),
      entity: decodeGroup('entity', backpack.entities),
      colorset: decodeGroup('colorset', backpack.colorSets),
    },
  };
}

export function protobufToBase64(encoded: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < encoded.length; index += 0x8000) {
    binary += String.fromCharCode(...encoded.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function protobufFromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
  return result;
}
