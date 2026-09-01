import {
  Backpack,
  BodyType,
  type Component,
  ConstraintType,
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

function voxelMessage(block: any): Voxel {
  const micro = block.mx !== undefined && block.mx !== null;
  return {
    dx: Number(block.dx),
    dy: Number(block.dy),
    dz: Number(block.dz),
    microIndex: micro
      ? 1 + Number(block.mx) + 5 * Number(block.my) + 25 * Number(block.mz)
      : undefined,
    color: Number(block.color) >>> 0,
  };
}

function portableVoxel(block: Voxel): any {
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
  return portable;
}

function enumName<T extends string>(values: readonly T[], value: number, label: string): T {
  const result = values[value];
  if (result === undefined) throw new Error(`Unknown ${label} enum value ${value}.`);
  return result;
}

function componentMessage(component: any): Component {
  const body = component?.body || {};
  return {
    id: String(component?.id || ''),
    pivot: vector3(component?.pivot),
    body: {
      type: BODY_TYPE_TO_PROTO[body.type || 'dynamic'],
      mass: body.mass === undefined ? undefined : Number(body.mass),
      restitution: body.restitution === undefined ? undefined : Number(body.restitution),
      friction: body.friction === undefined ? undefined : Number(body.friction),
      useGravity: body.useGravity === undefined ? undefined : body.useGravity === true,
      collisionEnabled: body.collisionEnabled === undefined ? undefined : body.collisionEnabled === true,
    },
    blocks: (component?.blocks || []).map((block: any) => voxelMessage(block)),
    script: component?.script === undefined ? undefined : String(component.script),
    scriptDisabled: component?.scriptDisabled === true,
    seats: (component?.seats || []).map((seat: any) => ({ position: vector3(seat.position) })),
    children: (component?.children || []).map((child: any) => componentMessage(child)),
  };
}

function portableComponent(component: Component): any {
  if (!component.body) throw new Error(`Component ${String(component.id || '')} has no body config.`);
  return {
    id: String(component.id || ''),
    ...(component.pivot === undefined ? {} : { pivot: vectorArray(component.pivot) }),
    body: {
      type: enumName(BODY_TYPE_FROM_PROTO, Number(component.body.type), 'body type'),
      ...(component.body.mass === undefined ? {} : { mass: Number(component.body.mass) }),
      ...(component.body.restitution === undefined ? {} : { restitution: Number(component.body.restitution) }),
      ...(component.body.friction === undefined ? {} : { friction: Number(component.body.friction) }),
      ...(component.body.useGravity === undefined ? {} : { useGravity: component.body.useGravity }),
      ...(component.body.collisionEnabled === undefined ? {} : { collisionEnabled: component.body.collisionEnabled }),
    },
    blocks: (component.blocks || []).map(block => portableVoxel(block)),
    ...(component.script === undefined ? {} : { script: String(component.script) }),
    ...(component.scriptDisabled === true ? { scriptDisabled: true } : {}),
    seats: (component.seats || []).map(seat => ({ position: vectorArray(seat.position) })),
    children: (component.children || []).map(child => portableComponent(child)),
  };
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

  base.entity = {
    name: String(portable.name || ''),
    root: componentMessage(portable.root),
    constraints: (portable.constraints || []).map((constraint: any) => ({
      id: String(constraint.id || ''),
      type: CONSTRAINT_TO_PROTO[constraint.type || 'point'],
      bodyAIsWorld: constraint.bodyA === 'world',
      bodyA: constraint.bodyA === 'world' ? '' : String(constraint.bodyA || ''),
      bodyB: String(constraint.bodyB || ''),
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
  if (!entity.root) throw new Error('Entity Protobuf does not contain a root component.');
  const portable: any = {
    type: 'space-entity',
    version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    name: entity.name,
    root: portableComponent(entity.root),
    constraints: (entity.constraints || []).map(constraint => ({
      id: String(constraint.id || ''),
      type: enumName(CONSTRAINT_FROM_PROTO, Number(constraint.type), 'constraint type'),
      bodyA: constraint.bodyAIsWorld
        ? 'world'
        : String(constraint.bodyA || ''),
      bodyB: String(constraint.bodyB || ''),
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
  };
  return { category: 'entity', portable };
}

function bodyFromRuntime(source: any, fallbackType: 'dynamic' | 'kinematic'): any {
  return {
    type: source?.bodyType || fallbackType,
    ...(source?.mass === undefined ? {} : { mass: Number(source.mass) }),
    ...(source?.restitution === undefined ? {} : { restitution: Number(source.restitution) }),
    ...(source?.friction === undefined ? {} : { friction: Number(source.friction) }),
    ...(source?.useGravity === undefined ? {} : { useGravity: source.useGravity === true }),
    ...(source?.collisionEnabled === undefined ? {} : { collisionEnabled: source.collisionEnabled === true }),
  };
}

/** Convert the engine's indexed runtime representation into the recursive wire shape. */
export function runtimeEntityToPortable(runtime: any): any {
  const definitions = Array.isArray(runtime?.childEntities) ? runtime.childEntities : [];
  const scripts = new Map((runtime?.scripts || []).map((entry: any) => [String(entry.id), String(entry.code || '')]));
  const enabled = new Map((runtime?.enabled || []).map((entry: any) => [String(entry.id), entry.enabled === true]));
  const nodes = new Map<string, any>();
  const makeNode = (source: any, id: string, fallbackType: 'dynamic' | 'kinematic') => ({
    id,
    ...(source?.pivot === undefined ? {} : { pivot: source.pivot.map(Number) }),
    body: bodyFromRuntime(source, fallbackType),
    blocks: [],
    ...(scripts.has(id) ? { script: scripts.get(id) } : {}),
    ...(scripts.has(id) && enabled.get(id) === false ? { scriptDisabled: true } : {}),
    seats: (source?.seats || []).map((seat: any) => ({
      position: (Array.isArray(seat) ? seat : seat.position).map(Number),
    })),
    children: [],
  });
  const root = makeNode(runtime, 'root', 'dynamic');
  nodes.set('root', root);
  for (const definition of definitions) {
    const id = String(definition.id || '');
    if (!id || nodes.has(id)) throw new Error(`Duplicate or empty component ${id}.`);
    nodes.set(id, makeNode(definition, id, 'kinematic'));
  }
  for (const definition of definitions) {
    const parent = nodes.get(String(definition.parentId || 'root'));
    if (!parent) throw new Error(`Unknown parent ${String(definition.parentId)}.`);
    parent.children.push(nodes.get(String(definition.id)));
  }
  for (const block of runtime?.blocks || []) {
    const owner = nodes.get(String(block.entityId || 'root'));
    if (!owner) throw new Error(`Unknown component ${String(block.entityId)}.`);
    const { entityId: _entityId, part: _part, ...voxel } = block;
    owner.blocks.push(voxel);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const sortTree = (component: any) => {
    if (visiting.has(component.id)) throw new Error('Component hierarchy contains a cycle.');
    if (visited.has(component.id)) return;
    visiting.add(component.id);
    component.blocks.sort((a: any, b: any) => (
      Number(a.dx) - Number(b.dx)
      || Number(a.dy) - Number(b.dy)
      || Number(a.dz) - Number(b.dz)
      || Number(a.mx ?? -1) - Number(b.mx ?? -1)
      || Number(a.my ?? -1) - Number(b.my ?? -1)
      || Number(a.mz ?? -1) - Number(b.mz ?? -1)
      || Number(a.color) - Number(b.color)
    ));
    component.children.sort((a: any, b: any) => a.id.localeCompare(b.id));
    component.children.forEach(sortTree);
    visiting.delete(component.id);
    visited.add(component.id);
  };
  sortTree(root);
  if (visited.size !== nodes.size) throw new Error('Every component must descend from root.');
  return {
    type: 'space-entity',
    version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    name: String(runtime?.name || ''),
    root,
    constraints: (runtime?.constraints || []).map((constraint: any) => ({
      id: String(constraint.id || ''),
      type: constraint.type || 'point',
      bodyA: String(constraint.bodyA || ''),
      bodyB: String(constraint.bodyB || ''),
      ...(constraint.anchorA === undefined ? {} : { anchorA: constraint.anchorA.map(Number) }),
      ...(constraint.anchorB === undefined ? {} : { anchorB: constraint.anchorB.map(Number) }),
      ...(constraint.axisA === undefined ? {} : { axisA: constraint.axisA.map(Number) }),
      ...(constraint.axisB === undefined ? {} : { axisB: constraint.axisB.map(Number) }),
      ...(constraint.referenceA === undefined ? {} : { referenceA: constraint.referenceA.map(Number) }),
      ...(constraint.referenceB === undefined ? {} : { referenceB: constraint.referenceB.map(Number) }),
      ...(constraint.limits === undefined ? {} : {
        limits: { min: Number(constraint.limits.min), max: Number(constraint.limits.max) },
      }),
      stiffness: Number(constraint.stiffness ?? 0.9),
      collideConnected: constraint.collideConnected === true,
    })),
  };
}

/** Flatten a recursive portable entity only for the current in-memory engine. */
export function portableEntityToRuntime(portable: any): any {
  const blocks: any[] = [];
  const childEntities: any[] = [];
  const scripts: any[] = [];
  const enabled: any[] = [];
  let nodeCount = 0;
  const visit = (component: any, parentId: string | null) => {
    nodeCount += 1;
    const id = String(component.id || '');
    for (const block of component.blocks || []) blocks.push({ ...block, entityId: id });
    if (component.script !== undefined) {
      scripts.push({ id, code: String(component.script) });
      enabled.push({ id, enabled: component.scriptDisabled !== true });
    }
    if (parentId !== null) {
      const body = component.body || {};
      childEntities.push({
        id,
        parentId,
        kind: 'child',
        ...(component.pivot === undefined ? {} : { pivot: component.pivot.map(Number) }),
        bodyType: body.type || 'kinematic',
        ...(body.mass === undefined ? {} : { mass: Number(body.mass) }),
        ...(body.restitution === undefined ? {} : { restitution: Number(body.restitution) }),
        ...(body.friction === undefined ? {} : { friction: Number(body.friction) }),
        ...(body.useGravity === undefined ? {} : { useGravity: body.useGravity === true }),
        ...(body.collisionEnabled === undefined ? {} : { collisionEnabled: body.collisionEnabled === true }),
        seats: (component.seats || []).map((seat: any) => ({ position: seat.position.map(Number) })),
      });
    }
    for (const child of component.children || []) visit(child, id);
  };
  visit(portable.root, null);
  const rootBody = portable.root?.body || {};
  return {
    type: 'space-entity',
    version: INVENTORY_PROTOBUF_SCHEMA_VERSION,
    name: portable.name,
    rootId: 'root',
    nodeCount,
    blockCount: blocks.length,
    blocks,
    childEntities,
    scripts,
    enabled,
    constraints: portable.constraints || [],
    mode: 'free_physics',
    bodyType: rootBody.type || 'dynamic',
    ...(rootBody.mass === undefined ? {} : { mass: Number(rootBody.mass) }),
    ...(rootBody.restitution === undefined ? {} : { restitution: Number(rootBody.restitution) }),
    ...(rootBody.friction === undefined ? {} : { friction: Number(rootBody.friction) }),
    ...(rootBody.useGravity === undefined ? {} : { useGravity: rootBody.useGravity === true }),
    ...(rootBody.collisionEnabled === undefined ? {} : { collisionEnabled: rootBody.collisionEnabled === true }),
    seats: (portable.root?.seats || []).map((seat: any) => ({ position: seat.position.map(Number) })),
  };
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
  const source = category === 'entity' ? portableEntityToRuntime(portable) : portable;
  const blocks = (source?.blocks || []).map((block: any) => {
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
    ...source,
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
