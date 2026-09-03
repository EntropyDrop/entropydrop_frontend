# EntropyDrop Space

This app lives in the `entropydrop_frontend` npm workspace and is built as the
independent `/space/app/` document. The main `/space` route is the product
introduction page. The app shares the repository's Three.js version and
the main site's `localStorage` login token. It does not own an account system.

Before constructing the Three.js scene it calls `POST /space/api/v2/bootstrap`,
loads the existing EntropyDrop user's latest backend state, or receives an
ephemeral world-wide random position when no snapshot exists, and downloads
that user's immutable `skin_url` PNG. The first random position is checkpointed
immediately; later wrapped position/yaw updates are saved every five seconds,
on realtime disconnect, and before page suspension. A user without a configured
skin is blocked and sent to `/skin/edit`. Backpack data remains browser-local under
`space.backpack.v3.pb` and is never uploaded by this app. Player-authored standard
and micro-voxel terrain overlays are loaded from the authenticated Space API and
sent back in idempotent batches of at most 256 mutations. A durable browser
outbox under `space.world-edits.v2.*` preserves unacknowledged batches across a
refresh; the earlier `space.world-edits.v1.*` local-only overlay is migrated and
uploaded on first entry after this version.

The default world's distant torus uses a build-time, versioned binary cache.
Its `512x64` height lattice and `1024x256` RGBA albedo are fetched once through
the normal content-hashed Vite asset URL, so the browser/CDN HTTP cache can
reuse them for later entrants. The albedo base level is exactly 1 MiB. The
client validates the cache schema, seed, terrain-generator version, dimensions,
and expanded size before use; a miss or mismatch falls back to deterministic
local generation. Server-authored edits currently arrive as paginated chunk
overlays over REST and update the existing deferred distant shell after their
affected chunks load. The multiplayer worker can later deliver the same chunk
revisions and reliable deltas over WebSocket without changing the local world
overlay model.

An AI-native programmable voxel physics prototype:

> Build anything. Tell it what to do.

## Player spawn and reconnect

- A valid backend `player_snapshots` record always wins: its latest X/Y/Z and
  yaw become the player's initial pose.
- Without a valid snapshot, the backend samples X uniformly across
  `[0, 16384)` and Z uniformly across `[0, 2048)`, covering the complete
  wrapped torus rather than a central spawn area. It starts the player at
  `y = 32` above the procedural terrain ceiling and gives them a random yaw.
- Bootstrap always returns a complete start pose. `resumed=true` means the
  pose came from a durable snapshot; `resumed=false` means it is the new
  ephemeral random candidate. The client uses either pose to load the correct
  initial terrain AOI before constructing the world.
- The random pose is ephemeral until the admitted client starts successfully
  and checkpoints it. It is not stored as a permanent birth point in the
  player profile; another bootstrap may receive another random pose if no
  checkpoint was committed.
- Offline mode restores `space.offline.player-position.v1` when present and
  otherwise applies the same full-world random fallback locally.

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

Open <http://localhost:5173/space/> for the introduction, then enter the app at
<http://localhost:5173/space/app/>. The main Vite process mounts Space directly
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

Entity backpack items can also be reused as modules with the Hammer: left-clicking
terrain spawns an independent entity and immediately puts it in **Play** (physics
active and all runnable component scripts enabled). Placing on a stopped entity
installs the item as a rigid child component under the crosshair; `Shift` + left-click
requests this installation mode explicitly, and the combined entity stays stopped.

The bundled local Agent prototype currently understands English hover, follow,
orbit, launch, spin, attitude-stabilization, and stop intents.
Its result contract is intentionally small so it can later be replaced by a
remote LLM without changing the controller runtime.

Detailed component script and controller API documentation is available directly in-game via the Code Editor terminal (press `C` → API Reference) and in the generated [Script API V2 reference](docs/generated/api-v2.md). The [Agent API reference](docs/generated/agent-api-v2.md), in-game reference, and runtime Agent prompt are all rendered from `src/engine/contraption/ScriptApiContract.ts`; edit that contract instead of these generated views.

The Entity Editor inspector separates authored values from live simulation data. **Defaults**
shows the pivot (`XYZ`), saved mounting-frame quaternion (`XYZW`), and, for child
components, the parent-relative position/quaternion restored by **Stop**. **Runtime** shows
the current local and composed world transforms, Euler angles for readability, plus the
physics center of mass, body quaternion, velocity, angular velocity, grounded state, and
simulation state. The root has no parent: its script-local position is `[0,0,0]`, while its
live local quaternion is also its world quaternion. The Authority panel identifies backend
versus offline persistence, edit/control permission, execution lease location, and
backend revisions.

## Multiplayer backend

The running browser client currently uses the transitional `space-relay-v1`
MessagePack WebSocket channel for player poses: changed poses are sampled at 20 Hz,
nearby-player snapshots arrive at 10 Hz, terrain is invalidated immediately and loaded
through its durable REST cursor, and reconnect positions are checkpointed every five
seconds. This relay is a compatibility stage, not the authoritative simulation protocol
described below.

Every world entity in online mode comes from the backend. The browser neither reads nor
writes `entropydrop_space_entities.*`; entering an online world removes that world's legacy
browser entity value. Creating or editing an entity uploads its canonical Protobuf definition
and a bounded runtime snapshot, and active owned entities checkpoint changed
state every six seconds. Removing one performs a backend hard delete. Offline mode keeps the
existing browser persistence and never calls these entity endpoints. This boundary applies
only to world entities: the backpack deliberately remains local.

External agents can submit canonical entity definitions directly with an account-level,
long-lived Space API key; market publication is not required. The browser polls the nearby
wrapped AOI, verifies the canonical Protobuf definition and optional
snapshot, then restores the exact construction/runtime pose, including its quaternion. Only
the owner's browser holding the current eight-second execution lease advances physics/scripts;
observers retain a stopped collision pose. Wrench Start/Stop is accepted only for the owner
or an administrator, so another ordinary player cannot stop the entity. Every instance may be
edited or deleted only by its owner or an administrator; its updated definition and state return to the
backend instead of browser storage. Entity `self.*` actions continue to run only on the lease
holder.

The Multiplayer V2 target is server-authoritative: zone workers own the 60 Hz
simulation and active chunks, binary WebSocket messages carry inputs and AOI
deltas, and PostgreSQL stores compressed chunk/entity checkpoints plus ordered
durable events. The database never participates in the per-frame physics path.
The V2 contract caps each world at 32 occupied sessions with FIFO queueing,
uses reliable AOI presence plus wake/sleep entity activation, and keeps the
three-category backpack in browser IndexedDB with automatic localStorage migration.

- Architecture and consistency contract: [`docs/backend-storage.md`](docs/backend-storage.md)
- PostgreSQL 15+ schema: [`backend/schema.sql`](backend/schema.sql)
- Protobuf realtime protocol: [`backend/protocol.proto`](backend/protocol.proto)

## Verification

The latest gameplay, API, security, performance, and maintainability review is
recorded in [the 2026-09-02 audit and remediation report](docs/audit-remediation-2026-09-02.md).

```bash
npm run check
npm run audit:deps
```

`npm run check` performs TypeScript validation, the complete Node test suite,
and a production Vite build. Pull requests run the same commands in CI.
