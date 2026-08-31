import { BlockTypes } from '../voxel/BlockTypes.ts';
import { BodyType, ContraptionMode } from './Contraption.ts';
import { SCRIPT_TEMPLATES } from './ScriptTemplates.ts';
import { ActionDomain, executeBasicAction } from '../actions/BasicActions.ts';

const C = {
  cyan: 0x48dbfb,
  brass: 0xf2a93b,
  dark: 0x354052,
  white: 0xf5f6fa,
  red: 0xeb4d4b,
  green: 0x2ed573,
  purple: 0xa55eea
};

const block = (dx, dy, dz, color) => ({ dx, dy, dz, color, block: BlockTypes.COLOR_BLOCK });
const micro = (dx, dy, dz, color) => ({
  dx,
  dy,
  dz,
  size: 0.2,
  color,
  block: BlockTypes.COLOR_BLOCK
});

// A two-blade propeller carved from a subdivided 1x1x1 voxel. The blade is
// only one micro-voxel thick, with a three-cell hub reaching down to the arm.
// Propellers are ordinary microblocks. Blueprint childEntities assign them to
// components such as rotor_nw through blockKeys; setLocalSpin provides rotation
// and applyThrust provides lift. No special block type is involved.
const PROPELLER_PROFILE = [
  [0, 1], [0, 2],
  [1, 1], [1, 2],
  [2, 2],
  [3, 2], [3, 3],
  [4, 2], [4, 3]
];

function propeller(cellX, cellY, cellZ) {
  const blade = PROPELLER_PROFILE.map(([mx, mz], index) => micro(
    cellX + mx / 5,
    cellY + 2 / 5,
    cellZ + mz / 5,
    index === 4 ? C.brass : C.white
  ));
  return [
    micro(cellX + 2 / 5, cellY, cellZ + 2 / 5, C.dark),
    micro(cellX + 2 / 5, cellY + 1 / 5, cellZ + 2 / 5, C.dark),
    ...blade
  ];
}

const QUADCOPTER_BLOCKS = [
  block(0, 0, 0, C.dark),
  block(0, 1, 0, C.brass),
  ...[-1, -2, -3].map(n => block(n, 0, n, n === -3 ? C.cyan : C.dark)),
  ...[1, 2, 3].map(n => block(n, 0, n, n === 3 ? C.cyan : C.dark)),
  ...[-1, -2, -3].map(n => block(n, 0, -n, n === -3 ? C.cyan : C.dark)),
  ...[1, 2, 3].map(n => block(n, 0, -n, n === 3 ? C.cyan : C.dark)),
  ...propeller(-3, 1, -3),
  ...propeller(3, 1, -3),
  ...propeller(-3, 1, 3),
  ...propeller(3, 1, 3)
];

// Off-road rover: one dynamic chassis plus four visual-only wheel components.
// The wheel disks are micro-carved in the YZ plane and move with the scripted
// struts; collisionEnabled=false is deliberate because raycasts, not rigid
// wheel voxels, provide the tire contacts.
const ROVER_WHEELS = [
  { id: 'wheel_fl', x: -1.6, z: -2.2 },
  { id: 'wheel_fr', x: 1.4, z: -2.2 },
  { id: 'wheel_rl', x: -1.6, z: 2.2 },
  { id: 'wheel_rr', x: 1.4, z: 2.2 }
];

function roverWheel(spec) {
  const cells = [];
  for (let iy = -4; iy <= 3; iy++) {
    for (let iz = -4; iz <= 3; iz++) {
      const dy = (iy + 0.5) * 0.2;
      const dz = (iz + 0.5) * 0.2;
      const radius = Math.sqrt(dy * dy + dz * dz);
      if (radius > 0.8) continue;
      const color = radius > 0.56 ? C.dark : radius < 0.25 ? C.brass : C.white;
      cells.push(micro(
        spec.x,
        1.0 + iy * 0.2,
        spec.z + iz * 0.2,
        color
      ));
    }
  }
  return cells;
}

const ROVER_WHEEL_BLOCKS = new Map(
  ROVER_WHEELS.map(spec => [spec.id, roverWheel(spec)])
);
const ROVER_CHASSIS_BLOCKS = [
  // Ladder frame and bumpers; nose points toward -Z.
  ...[-2, -1, 0, 1, 2].flatMap(z => [
    block(-1, 2, z, z === -2 ? C.cyan : C.dark),
    block(0, 2, z, z === -2 ? C.cyan : C.dark)
  ]),
  // Cabin, hood and rear deck.
  ...[-1, 0, 1].flatMap(z => [
    block(-1, 3, z, z === -1 ? C.cyan : C.white),
    block(0, 3, z, z === -1 ? C.cyan : C.white)
  ]),
  block(-1, 3, -2, C.brass),
  block(0, 3, -2, C.brass),
  block(-1, 3, 2, C.red),
  block(0, 3, 2, C.red)
];
const ROVER_BLOCKS = [
  ...ROVER_CHASSIS_BLOCKS,
  ...ROVER_WHEELS.flatMap(spec => ROVER_WHEEL_BLOCKS.get(spec.id))
];
const ROVER_LOCAL_OFFSET = [2, 0, 3];
const roverWheelChild = spec => {
  const blocks = ROVER_WHEEL_BLOCKS.get(spec.id) || [];
  const ownedCells = new Map();
  for (const wheelBlock of blocks) {
    const cell = [
      Math.floor(wheelBlock.dx) + ROVER_LOCAL_OFFSET[0],
      Math.floor(wheelBlock.dy) + ROVER_LOCAL_OFFSET[1],
      Math.floor(wheelBlock.dz) + ROVER_LOCAL_OFFSET[2]
    ];
    ownedCells.set(cell.join(','), cell);
  }
  return {
    id: spec.id,
    parentId: 'root',
    collisionEnabled: false,
    pivot: [
      spec.x + 0.1 + ROVER_LOCAL_OFFSET[0],
      1.0 + ROVER_LOCAL_OFFSET[1],
      spec.z + ROVER_LOCAL_OFFSET[2]
    ],
    blockKeys: [...ownedCells.values()]
  };
};
const ROVER_WHEEL_CHILDREN = ROVER_WHEELS.map(roverWheelChild);

// Ferris wheel coordinates are authored around an axle at (0.5, 7.5, 0.5).
// The assembled entity starts at the minimum blueprint cell (-6, 0, -1), so
// hierarchy pivots and blockKeys below are translated into entity-local space.
const FERRIS_LOCAL_OFFSET = [6, 0, 1];
const ferrisLocalCell = (x, y, z) => [
  x + FERRIS_LOCAL_OFFSET[0],
  y + FERRIS_LOCAL_OFFSET[1],
  z + FERRIS_LOCAL_OFFSET[2]
];

const FERRIS_RIM_CELLS = [
  [-2, 12], [-1, 12], [0, 12], [1, 12], [2, 12],
  [-4, 11], [-3, 11], [3, 11], [4, 11],
  [-5, 10], [-4, 10], [4, 10], [5, 10],
  [-5, 9], [5, 9], [-5, 8], [5, 8], [-5, 7], [5, 7],
  [-5, 6], [5, 6], [-5, 5], [5, 5],
  [-4, 4], [4, 4], [-4, 3], [-3, 3], [3, 3], [4, 3],
  [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]
];

const ferrisWheelCells = new Map();
for (const [x, y] of FERRIS_RIM_CELLS) {
  ferrisWheelCells.set(`${x},${y}`, { x, y, color: C.cyan });
}
for (let offset = -4; offset <= 4; offset++) {
  ferrisWheelCells.set(`${offset},7`, { x: offset, y: 7, color: C.white });
  ferrisWheelCells.set(`0,${7 + offset}`, { x: 0, y: 7 + offset, color: C.white });
}
for (let offset = 1; offset <= 4; offset++) {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * offset;
      const y = 7 + sy * offset;
      ferrisWheelCells.set(`${x},${y}`, { x, y, color: C.white });
    }
  }
}
ferrisWheelCells.set('0,7', { x: 0, y: 7, color: C.brass });

const FERRIS_WHEEL_BLOCKS = [...ferrisWheelCells.values()]
  .map(({ x, y, color }) => block(x, y, 0, color));

const FERRIS_CABINS = [
  { id: 'cabin_top', anchor: [0, 12], color: C.red },
  { id: 'cabin_upper_right', anchor: [4, 11], color: C.purple },
  { id: 'cabin_right', anchor: [5, 7], color: C.green },
  { id: 'cabin_lower_right', anchor: [4, 3], color: C.brass },
  { id: 'cabin_bottom', anchor: [0, 2], color: C.red },
  { id: 'cabin_lower_left', anchor: [-4, 3], color: C.purple },
  { id: 'cabin_left', anchor: [-5, 7], color: C.green },
  { id: 'cabin_upper_left', anchor: [-4, 11], color: C.brass }
];

const ferrisCabinCells = cabin => {
  const [anchorX, anchorY] = cabin.anchor;
  const cells = [];
  for (let y = anchorY - 2; y <= anchorY - 1; y++) {
    for (let x = anchorX - 1; x <= anchorX + 1; x++) {
      cells.push([x, y, -1]);
    }
  }
  return cells;
};

const FERRIS_CABIN_BLOCKS = FERRIS_CABINS.flatMap(cabin =>
  ferrisCabinCells(cabin).map(([x, y, z]) =>
    block(x, y, z, y === cabin.anchor[1] - 1 ? C.dark : cabin.color)
  )
);

const FERRIS_FRAME_BLOCKS = [
  ...Array.from({ length: 11 }, (_, index) => block(index - 5, 0, 1, index % 2 ? C.dark : C.brass)),
  ...[
    [-4, 1], [-4, 2], [-3, 3], [-3, 4], [-2, 5], [-2, 6], [-1, 7],
    [4, 1], [4, 2], [3, 3], [3, 4], [2, 5], [2, 6], [1, 7]
  ].map(([x, y]) => block(x, y, 1, C.brass)),
  block(0, 7, 1, C.dark)
];

const FERRIS_WHEEL_CHILDREN = [
  {
    id: 'wheel',
    parentId: 'root',
    bodyType: BodyType.KINEMATIC,
    pivot: [6.5, 7.5, 1.5],
    blockKeys: [...ferrisWheelCells.values()].map(({ x, y }) => ferrisLocalCell(x, y, 0))
  },
  ...FERRIS_CABINS.map(cabin => {
    const [anchorX, anchorY] = cabin.anchor;
    return {
      id: cabin.id,
      parentId: 'wheel',
      bodyType: BodyType.DYNAMIC,
      restitution: 0.08,
      friction: 0.55,
      pivot: [anchorX + 6.5, anchorY + 0.5, 0.5],
      blockKeys: ferrisCabinCells(cabin).map(([x, y, z]) => ferrisLocalCell(x, y, z))
    };
  })
];

const FERRIS_WHEEL_CONSTRAINTS = FERRIS_CABINS.map(cabin => ({
  id: `${cabin.id}_hinge`,
  type: 'hinge',
  bodyA: 'wheel',
  bodyB: cabin.id,
  axisA: [0, 0, 1],
  axisB: [0, 0, 1],
  collideConnected: false,
  stiffness: 0.92
}));

// Helicopter: dynamic hull on skids with a single main rotor. The hull faces -Z;
// the lowest block is (-1, -1, -1), so entity-local space is blueprint + (1, 1, 1).
// The main rotor (mast + four-blade cross) and the tail rotor (hub + vertical
// blade) are micro-carved inside hull cells and assigned to kinematic children.
function helicopterMainRotor(cellX, cellY, cellZ) {
  return [
    // Mast drops from the hub into the hull roof.
    micro(cellX + 2 / 5, cellY, cellZ + 2 / 5, C.dark),
    micro(cellX + 2 / 5, cellY + 1 / 5, cellZ + 2 / 5, C.dark),
    // Four two-micro blades crossing over the hub.
    ...[0, 1, 3, 4].map(mx => micro(cellX + mx / 5, cellY + 3 / 5, cellZ + 2 / 5, C.cyan)),
    ...[0, 1, 3, 4].map(mz => micro(cellX + 2 / 5, cellY + 3 / 5, cellZ + mz / 5, C.cyan))
  ];
}

function helicopterTailRotor(cellX, cellY, cellZ) {
  return [
    micro(cellX + 1 / 5, cellY + 2 / 5, cellZ + 2 / 5, C.brass),
    ...[0, 1, 3, 4].map(mz => micro(cellX + 1 / 5, cellY + 3 / 5, cellZ + mz / 5, C.white))
  ];
}

const HELICOPTER_BLOCKS = [
  // Hull: cockpit, cabin, tail boom, tail tip.
  block(0, 0, -1, C.cyan),
  block(0, 0, 0, C.white),
  block(0, 0, 1, C.white),
  block(0, 0, 2, C.dark),
  block(0, 0, 3, C.dark),
  block(0, 0, 4, C.dark),
  block(0, 0, 5, C.brass),
  // Fin on top of the tail boom; the tail rotor cell sits above it.
  block(0, 1, 5, C.cyan),
  // Skid rails along both sides of the hull.
  ...[-1, 0, 1, 2].map(z => block(-1, 0, z, C.brass)),
  ...[-1, 0, 1, 2].map(z => block(1, 0, z, C.brass)),
  // Skid legs.
  ...[0, 1].map(z => block(-1, -1, z, C.dark)),
  ...[0, 1].map(z => block(1, -1, z, C.dark)),
  // Main rotor in hull cell (0, 1, 0) → entity-local cell (1, 2, 1),
  // spin axis through entity-local (1.4, *, 1.4).
  ...helicopterMainRotor(0, 1, 0),
  // Tail rotor in fin cell (0, 2, 5) → entity-local cell (1, 3, 6),
  // spin axis through entity-local (1.2, *, 6.4).
  ...helicopterTailRotor(0, 2, 5)
];

export const BLUEPRINTS = [
  {
    id: 'ferris_wheel',
    name: 'Ferris Wheel',
    description: 'A kinematic support drives the wheel while eight dynamic cabins hang from physical hinge constraints and stay upright under gravity.',
    defaultMode: ContraptionMode.PROGRAMMABLE,
    defaultOptions: {
      bodyType: BodyType.KINEMATIC,
      scriptCode: SCRIPT_TEMPLATES.find(t => t.id === 'ferris_wheel')?.code || '',
      childEntities: FERRIS_WHEEL_CHILDREN,
      constraints: FERRIS_WHEEL_CONSTRAINTS
    },
    blocks: [
      ...FERRIS_FRAME_BLOCKS,
      ...FERRIS_WHEEL_BLOCKS,
      ...FERRIS_CABIN_BLOCKS
    ]
  },
  {
    id: 'smart_drone',
    name: 'Micro-carved Quadcopter',
    description: 'Four micro-carved propellers each provide spin + per-component thrust along the body axis; differential thrust mixing balances, holds altitude, and tilts.',
    defaultMode: ContraptionMode.PROGRAMMABLE,
    defaultOptions: {
      scriptCode: SCRIPT_TEMPLATES.find(t => t.id === 'quadrotor_flight_controller')?.code || '',
      // blockKeys and pivot use entity-local coordinates (blueprint coordinates minus bounds.min).
      childEntities: [
        { id: 'rotor_nw', parentId: 'root', pivot: [0.5, 1.5, 0.5], blockKeys: [['0', '1', '0']] },
        { id: 'rotor_ne', parentId: 'root', pivot: [6.5, 1.5, 0.5], blockKeys: [['6', '1', '0']] },
        { id: 'rotor_sw', parentId: 'root', pivot: [0.5, 1.5, 6.5], blockKeys: [['0', '1', '6']] },
        { id: 'rotor_se', parentId: 'root', pivot: [6.5, 1.5, 6.5], blockKeys: [['6', '1', '6']] }
      ]
    },
    blocks: QUADCOPTER_BLOCKS
  },
  {
    id: 'suspension_rover',
    name: 'Raycast Suspension Off-Road Rover',
    description: 'A dynamic chassis on four independent spring-damper raycast struts. W/S drive, A/D steer, Space brakes; the visible front wheels steer and self-center while tire forces create real pitch, roll, grip, and wheel travel over voxel terrain.',
    defaultMode: ContraptionMode.PROGRAMMABLE,
    defaultOptions: {
      bodyType: BodyType.DYNAMIC,
      restitution: 0.05,
      friction: 0.35,
      scriptCode: SCRIPT_TEMPLATES.find(t => t.id === 'raycast_offroad_rover')?.code || '',
      childEntities: ROVER_WHEEL_CHILDREN
    },
    blocks: ROVER_BLOCKS
  },
  {
    id: 'helicopter',
    name: 'Main-Rotor Helicopter',
    description: 'A dynamic skid hull driven by a virtual main rotor: altitude PD lift along the body axis (tilt to fly), cyclic pitch/roll/yaw torques, and kinematic main/tail rotor children that spin with throttle. Space/Shift climb, W/S pitch, A/D roll, arrow keys yaw.',
    defaultMode: ContraptionMode.PROGRAMMABLE,
    defaultOptions: {
      scriptCode: SCRIPT_TEMPLATES.find(t => t.id === 'helicopter_flight_controller')?.code || '',
      // blockKeys and pivot use entity-local coordinates (blueprint coordinates minus bounds.min (-1, -1, -1)).
      childEntities: [
        { id: 'main_rotor', parentId: 'root', pivot: [1.4, 2.5, 1.4], blockKeys: [['1', '2', '1']] },
        { id: 'tail_rotor', parentId: 'root', pivot: [1.2, 3.5, 6.4], blockKeys: [['1', '3', '6']] }
      ]
    },
    blocks: HELICOPTER_BLOCKS
  },
  {
    id: 'giant_windmill',
    name: 'Kinetic Color Cross',
    description: 'The root building is kinematic; the blades are a child entity whose relative spin is controlled by code.',
    defaultMode: ContraptionMode.PROGRAMMABLE,
    defaultOptions: {
      bodyType: BodyType.KINEMATIC,
      scriptCode: SCRIPT_TEMPLATES.find(t => t.id === 'kinetic_windmill')?.code || '',
      childEntities: [{
        id: 'blades',
        parentId: 'root',
        pivot: [3.5, 3.5, 0.5],
        blockKeys: [
          [0, 3, 0], [1, 3, 0], [2, 3, 0],
          [4, 3, 0], [5, 3, 0], [6, 3, 0],
          [3, 0, 0], [3, 1, 0], [3, 2, 0],
          [3, 4, 0], [3, 5, 0], [3, 6, 0]
        ]
      }]
    },
    blocks: [
      block(0,0,0,C.brass),
      ...[-3,-2,-1,1,2,3].map(x => block(x,0,0,x > 0 ? C.cyan : C.purple)),
      ...[-3,-2,-1,1,2,3].map(y => block(0,y,0,y > 0 ? C.green : C.red))
    ]
  }
];

export function spawnBlueprintInWorld(blueprint, world, originX, originY, originZ) {
  for (const b of blueprint.blocks) {
    if ((b.size || 1) < 1) {
      executeBasicAction({ world }, {
        domain: ActionDomain.WORLD,
        action: 'place-micro',
        micro: [
          Math.round((originX + b.dx) * 5),
          Math.round((originY + b.dy) * 5),
          Math.round((originZ + b.dz) * 5)
        ],
        color: b.color,
        replace: true,
        actor: { source: 'system' }
      });
      continue;
    }
    executeBasicAction({ world }, {
      domain: ActionDomain.WORLD,
      action: 'place-standard',
      cell: [originX + b.dx, originY + b.dy, originZ + b.dz],
      block: BlockTypes.COLOR_BLOCK,
      color: b.color,
      replace: true,
      actor: { source: 'system' }
    });
  }
}
