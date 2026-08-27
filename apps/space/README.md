# EntropyDrop Space

This app lives in the `entropydrop_frontend` npm workspace and is built as the
independent `/space/` document. It shares the repository's Three.js version and
the main site's `localStorage` login token. It does not own an account system.

Before constructing the Three.js scene it calls `POST /space/api/v2/bootstrap`,
loads the existing EntropyDrop user's durable birth point, and downloads that
user's immutable `minecraft_skin_url` PNG. A user without a configured skin is
blocked and sent to `/skin/edit`. Backpack data remains browser-local under
`space.backpack.v2` and is never uploaded by this app. Player-authored standard
and micro-voxel terrain overlays are also browser-local, keyed by `world.id`
under `space.world-edits.v1.*`; additions, colors, subdivisions, and AIR
tombstones over generated terrain are restored after a same-browser refresh.
They are not yet synchronized between browsers or players.

The default world's distant torus uses a build-time, versioned binary cache.
Its `512x64` height lattice and `1024x256` RGBA albedo are fetched once through
the normal content-hashed Vite asset URL, so the browser/CDN HTTP cache can
reuse them for later entrants. The albedo base level is exactly 1 MiB. The
client validates the cache schema, seed, terrain-generator version, dimensions,
and expanded size before use; a miss or mismatch falls back to deterministic
local generation. Shared server-authored distant edits will be layered on later
as revisioned zone-tile deltas rather than rebuilding the whole torus per join.
The current browser-local overlays update the existing deferred distant shell
in the same way as live edits after their affected chunks load.

An AI-native programmable voxel physics prototype:

> Build anything. Tell it what to do.

Players build with one freely colorable voxel material at two geometric scales,
select a region, and entityize it into a programmable component tree. Components
may be kinematic or dynamic rigid bodies connected by physical constraints. A natural-language
behavior is compiled into a controller that can read entity/world state and can
drive dynamic bodies through force/torque or kinematic bodies through direct pose commands.

## Geometry model

- There is one buildable block type. RGB color is stored per voxel instance.
- The shovel creates and removes standard `1 × 1 × 1` voxels.
- Clicking a standard voxel with the spoon replaces it losslessly with
  `5 × 5 × 5 = 125` micro voxels.
- The spoon can then create or remove individual `0.2 × 0.2 × 0.2` cells.
- Micro voxels live in a sparse grid and are merged into dirty-region render
  meshes per 16×16 standard-cell chunk; they are not 125 independent rigid bodies.
- Standard and micro voxels can be entityized together and are restored at the
  correct scale when the entity is solidified.

## Run locally

Requirements:

- Node.js 20.19 or newer and npm 10 or newer
- A current desktop browser with WebGL 2, ES modules, Web Workers, and WebAssembly
- No API key is required for the bundled local behavior compiler; remote Agent
  endpoints require HTTPS, except for localhost development

From the frontend repository root:

```bash
npm ci
npm run dev
```

Open <http://localhost:5173/space/>. The main Vite process mounts Space directly
at that path, preserving the main site's origin and login token without a second
frontend server or proxy. API requests are sent by the browser directly to the
backend configured by `VITE_API_BASE_URL` (default: `http://localhost:8000`).

## Core loop

1. Choose any color, then use the shovel for standard construction or the spoon
   for micro-voxel sculpting.
2. Use the Selector to set selection corners A and B or select a connected structure.
3. Press `G` to entityize the selected blocks.
4. Aim at the entity and press `C`.
5. Describe the behavior, inspect the generated controller, and run it.

The bundled local Agent prototype currently understands English hover, follow,
orbit, launch, spin, attitude-stabilization, and stop intents.
Its result contract is intentionally small so it can later be replaced by a
remote LLM without changing the controller runtime.

## Controller API V2

Every component script receives `(self, ctx)`. `self` is the current component;
`ctx` is the read-only frame snapshot whose body fields always describe the root entity. The entity is a real component tree rooted
at `ctx.root`, and each component owns a separate persistent `self.state` object.

```js
self.apiVersion; // 2 (ctx.apiVersion is also 2)
self.body.getType(); // same root value as ctx.bodyType on the root component
self.state.frames = (self.state.frames || 0) + 1;
self.applyForce([0, ctx.mass * Math.abs(ctx.gravity[1]), 0]);
self.applyLocalForce([0, 0, -20]); // -Z is forward
self.applyTorque([0, 4, 0]);

self.body.setType('dynamic');
self.body.setMass(80); // kg; default is owned block count × 10, minimum 0.1 kg
self.body.setMaterial({ restitution: 0.6, friction: 0.5 });
if (!self.state.worldHingeId) {
  const created = self.constraints.create({
    type: 'hinge', other: 'world',
    axisA: [0, 0, 1], axisB: [0, 0, 1], stiffness: 0.9
  });
  if (created.ok) self.state.worldHingeId = created.id;
}
if (self.state.worldHingeId && ctx.input.pressed('KeyQ')) {
  self.constraints.remove(self.state.worldHingeId);
  self.state.worldHingeId = null;
}

function visit(node) {
  ctx.log(node.id);
  for (const child of node.children()) visit(child);
}
visit(ctx.root);

const placed = self.voxels.set([1, 0, 0], { color: 0x48dbfb });
if (!placed.ok) ctx.log(placed.reason);
self.microVoxels.clear([2, 0, 0], [1, 2, 3]);
self.voxels.paint([1, 0, 0], { color: 0xffffff });
self.voxels.subdivide([1, 0, 0], [2, 2, 2]);

ctx.input.down('KeyW');
ctx.input.pressed('Space');
ctx.input.released('KeyW');
ctx.players;
ctx.world.apiVersion; // 2
ctx.world.voxels.get([10, 4, 10]);
ctx.world.voxels.clear([10, 4, 10]);
ctx.world.microVoxels.set([10, 4, 10], [1, 2, 3], { color: 0xf2a93b });
ctx.world.microVoxels.clear([10, 4, 10], [1, 2, 3]);
ctx.world.raycast(ctx.position, [0, -1, 0], 24);

// The selector tool and programs share these commands.
ctx.selection.box([10, 4, 10], [14, 8, 14]);
ctx.selection.entityBox(ctx.entityId, 'root', [-1, -1, -1], [1, 1, 1]);
ctx.selection.get();
// Gate destructive commands with self.state or ctx.input.pressed(...):
// ctx.selection.assemble();
```

Whole entities can be selected in any runtime state. Component and block-level
selection is available only after the entity is stopped; shared selection
commands return `entity_not_stopped` for running, paused, or errored entities.
Script-created selections are consumed through `ctx.selection`; mouse R/T/Delete
operate on the Selector tool's current local selection even though both paths
dispatch through the same engine action layer.

`ctx.selection.assemble(mode = 'programmable', options = {})` accepts `auto`,
`free_physics`, `bearing`, `piston`, `drivable`, `projectile`, and
`programmable`; `auto` is an alias for `programmable`. Public options are
`bodyType`, `restitution`, `friction`, `useGravity`, and `mass`. Defaults are a
dynamic body, restitution `0.01`, friction `0.7`, gravity on for dynamic bodies
and off for kinematic bodies, and owned block count × 10 kg (minimum 0.1 kg).
It returns `{ok, assembled, entityId, runtimeId, reason}`; failure IDs are
`null`, and `reason` is `no_selection`, `empty`, or `invalid_mode`. Invalid modes
are rejected before any selected voxel is removed. `ctx.selection.delete()`
returns `{ok, removed, standard, micro, entities, components, entityId, nodeId,
reason}`, including explicit entity and component removal counts.

All other mutating selection commands also return `{ok, ..., reason}`:
`clear()` adds `cleared`; corner/box/cells/toggle/entity add `selected`;
`entityBox()` adds `selected` and `components`; and `createChild()` returns
`{ok, childId, reason}` with `childId: null` on failure. `get()` returns a
selection snapshot rather than a mutation result. Selections are capped at a
64×64×64 AABB: box corners clamp to the cap (the result reports `clamped`),
and out-of-limit single-cell toggles or `cells` batches fail with
`bounds_exceeded`.

Voxel results are action-specific: set returns `{ok, placed, reason}`, clear and
clearCell return `{ok, removed, reason}`, paint returns `{ok, painted, reason}`,
and subdivide returns `{ok, subdivided, removed, reason}`. Always inspect
`result.ok` and `result.reason`. Component-local voxel positions are floored to
integer cells after applying the component pivot. Entity bounding boxes are
capped at 64×64×64; a placement that would extend the entity AABB past the cap
fails with `bounds_exceeded`. Removing an entity's final
voxel deletes that entity and all of its scripts/state. Standard and micro
namespaces never overwrite one another implicitly. World voxels are the static collision layer. Entity bodies
have only two types: kinematic bodies accept direct pose/spin commands and
dynamic bodies respond to forces, collisions, gravity, and constraints.
Force APIs have no effect on kinematic bodies; `self.body.apply*` returns a
boolean. The `ctx.limits` clamp and HUD **Power Budget** cover only the legacy
root-body force surface (`self.applyForce`, `applyLocalForce`, `applyThrust`,
`applyForceAt`, and `applyTorque`); `self.body.apply*` targets the calling
component body and is not clamped or included in that meter. `setType()` returns `{ok,type,reason}`, `setMass()` returns
`{ok,mass,reason}`, and `setMaterial()` returns `{ok,material,reason}`.
All force/torque vectors must contain finite components whose absolute values do
not exceed `1e12`; this safety ceiling is separate from the gameplay power
budget. Worker mutations return `reason: 'command_limit'` with `ok: false` when
the entity's 256-command frame buffer is full.

`self.constraints.create()` accepts `other: 'world'` for a static anchor and
returns `{ok,id,reason}`; omitted ids use `type_other_selfId` plus a numeric
suffix when needed. `stiffness` defaults to 0.9 and clamps to `[0,1]`, while
`collideConnected` defaults to false. `all()` returns
`[{id,type,bodyA,bodyB,anchorA,anchorB,axisA,axisB,referenceA,referenceB,limits,
stiffness,collideConnected}]` and `remove(id)` returns boolean.

`ctx.world.entities(origin, radius = 16)` measures shortest wrapped X/Z distance.
Full synchronous raycasts over standard world voxels are unavailable across the
Worker boundary; `ctx.world.raycast()` currently returns `null` in entity scripts.
Entity scripts run in a shared Worker with one memory-limited QuickJS Runtime
per loaded scripted entity. Each component invocation has a 5 ms interrupt
deadline, so an infinite loop disables that component without freezing the tab.
Entities are instantiated and simulated only in active streamed chunks; leaving
the window serializes their identity, physics, scripts, and state, then destroys
their scene resources and Runtime. Reloading the chunk creates a fresh instance
and resumes its frozen state. Entities whose root falls below `y = -30` are
permanently removed with their scripts/state. `ctx.players[i].position` is the eye position:
feet + 1.62 m standing or + 1.3 m crouched.
Mouse edits and entity programs are adapters over the same canonical action
dispatcher, including voxel edits, subdivision, selection deletion, assembly,
child creation, body material changes, and constraint editing.
Calling the root's `self.stop()` (or `ctx.root.stop()` from child code) is
identical to clicking the global Stop button: it disables all component scripts
and resets their state, script clock, child transforms/spins, and pending
forces/torques. The in-game API reference is canonical; the Agent-facing mirror is
[`docs/agent-skill.md`](docs/agent-skill.md).

Keyboard state is captured once by the engine and delivered only to the
currently mounted entity. Controllers do not subscribe to DOM events, so
stopping or deleting controller code removes its keyboard behavior immediately.
Reserved editor keys never reach scripts: `Escape`, `Backspace`, `Delete`, `F3`, `F5`,
`KeyB`, `KeyC`, `KeyE`, `KeyF`, `KeyG`, `KeyR`, `KeyT`, `KeyV`,
`Digit0`, `Digit1`, `Digit2`, `Digit3`, `Digit4`, `Digit5`, `Digit6`,
`Digit7`, `Digit8`, and `Digit9`.

## Multiplayer backend

The Multiplayer V2 target is server-authoritative: zone workers own the 60 Hz
simulation and active chunks, binary WebSocket messages carry inputs and AOI
deltas, and PostgreSQL stores compressed chunk/entity checkpoints plus ordered
durable events. The database never participates in the per-frame physics path.
The V2 contract caps each world at 32 occupied sessions with FIFO queueing,
uses reliable AOI presence plus wake/sleep entity activation, and keeps the
three-category backpack only in browser local storage.

- Architecture and consistency contract: [`docs/backend-storage.md`](docs/backend-storage.md)
- PostgreSQL 15+ schema: [`backend/schema.sql`](backend/schema.sql)
- Protobuf realtime protocol: [`backend/protocol.proto`](backend/protocol.proto)

## Verification

```bash
npm run check
npm run audit:deps
```

`npm run check` performs TypeScript validation, the complete Node test suite,
and a production Vite build. Pull requests run the same commands in CI.
