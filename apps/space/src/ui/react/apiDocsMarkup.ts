// Trusted static documentation content. React owns the modal lifecycle and surrounding UI.
export const apiDocsBodyMarkup = `

        <!-- ================= Defaults & Conventions ================= -->
        <div class="api-section">
          <div class="api-h2">Defaults &amp; coordinate conventions</div>
          <table class="api-table">
            <thead><tr><th>Property</th><th>Default</th><th>Notes</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Pivot (rotation center)</b></td>
                <td>Geometric center of the component's own blocks (AABB centroid)</td>
                <td>
                  <code>setLocalSpin</code> and <code>setLocalEuler</code> always rotate around this point.
                  The pivot is captured when the component is created and <b>never updates automatically</b>
                  when blocks change (placing/removing blocks, repainting, or subdividing 1x1x1 → 5x5x5
                  does not move the rotation axis). To update it at runtime read the new bounds with
                  <code>self.getBounds()</code> and apply them with <code>self.setPivot(...)</code>
                  (blocks stay in place — only the rotation axis moves). See the
                  <em>Blocks-changed events</em> section below for reacting to edits automatically.
                  To reposition the pivot at build time, select the component in the Selector tool and use
                  <b>G</b> to re-assemble with a different block layout — the pivot recalculates on each assembly.
                </td>
              </tr>
              <tr>
                <td><b>Component id</b></td>
                <td>Unique across the whole entity</td>
                <td>
                  Every component is addressed by its <code>id</code> string (<code>self.child('arm')</code>,
                  <code>node.children()</code>, code tabs). Ids are unique across the entire entity,
                  so siblings can never share one; <code>root</code> is reserved. Rename via the component
                  inspector (Rename button).
                </td>
              </tr>
              <tr>
                <td><b>Local position origin</b></td>
                <td>Pivot offset relative to the parent's pivot</td>
                <td>
                  When a child is first created its <code>localPosition</code> is <code>[0,0,0]</code> in the
                  parent's pivot frame, meaning the two pivots coincide. Calling
                  <code>setLocalPosition</code> moves the child pivot away from the parent pivot. The
                  root has no parent, so a kinematic root's transform setters use world space.
                </td>
              </tr>
              <tr>
                <td><b>Local rotation</b></td>
                <td>Identity (no rotation)</td>
                <td>
                  Child components start aligned with their parent. All Euler angles use
                  <b>YXZ order</b> (yaw → pitch → roll); quaternions follow the Three.js convention
                  (<code>[x, y, z, w]</code>).
                </td>
              </tr>
              <tr>
                <td><b>Coordinate system</b></td>
                <td>Right-handed, Y-up</td>
                <td>
                  +X right, +Y up, +Z toward the viewer (same as Three.js world space).
                  <code>applyLocalForce([0, 0, -1])</code> pushes the entity <em>forward</em>
                  along its own nose.
                </td>
              </tr>
              <tr>
                <td><b>Script state on start</b></td>
                <td>All components enabled</td>
                <td>
                  Toggle individual component scripts with the <b>ON/OFF</b> switch in the code
                  editor tab. The state persists when you exit the editor. Global <b>Pause</b>
                  disables every script without clearing state; global <b>Stop</b> additionally
                  resets state, script time/tick, child transforms/spins, pending forces, and
                  restores every PB BodyConfig default (see <em>BodyConfig: defaults vs runtime</em>).
                </td>
              </tr>
              <tr>
                <td><b>BodyConfig: defaults vs runtime</b></td>
                <td>Persisted PB values: type, mass, restitution, friction, gravity, collision</td>
                <td>
                  The protobuf definition stores <b>defaults</b>, never live values. The Entity Editor
                  splits them into two tabs: <b>PB Defaults</b> (editable in the panel; edits apply
                  immediately and are written into inventory copies) and <b>Runtime</b> (live values,
                  read-only). Scripts change runtime values through the <code>self.body.*</code> setters
                  without touching the defaults — the value in effect when the first setter runs is
                  captured. <b>Pause</b> keeps runtime values; <b>Stop</b> restores every default and
                  resets state, script time/tick, child transforms/spins, and pending forces.
                  Serializing the entity (inventory copy, market upload, chunk streaming) always
                  writes the defaults, so a script can never leak runtime values into the PB.
                </td>
              </tr>
              <tr>
                <td><b>Legacy root force budget (initial)</b></td>
                <td><code>maxForce = max(80, mass × 65)</code></td>
                <td>
                  Applies only to the legacy root-body force surface and is recalculated whenever root blocks are added or removed. Check
                  <code>ctx.limits.maxForce</code> / <code>ctx.limits.maxTorque</code> at runtime.
                </td>
              </tr>
              <tr>
                <td><b>Collision default</b></td>
                <td><code>collisionEnabled = true</code></td>
                <td>
                  Root and child components carry a persisted <code>collisionEnabled</code> default. A disabled component still renders and
                  stays editable but produces no collision shapes against terrain, players, other entities, or raycasts. Scripts may change
                  the runtime value through <code>self.body.setCollisionEnabled()</code>; <b>Stop</b> restores the persisted default.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ================= World Topology ================= -->
        <div class="api-section">
          <div class="api-h2">World topology (torus)</div>
          <ul class="api-ul">
            <li>The world is a <b>torus</b>: flat coordinates wrap. <code>X ∈ [0, 16384)</code> and <code>Z ∈ [0, 2048)</code> are cyclic; <code>Y ∈ [0, 128)</code> is the only vertical range accepted by world voxel edits (out of range → <code>invalid_position</code>). The nominal donut surface (ground) sits at <code>y = 16</code>.</li>
            <li>Queued world mutations wrap X/Z automatically. The entity's <code>ctx.position</code> does <b>not</b> wrap — it can run past the seam while flying, so raw position differences are only valid on one side of the seam.</li>
            <li>For follow / orbit / seek behaviour that must survive the seam, compute each X/Z delta as the shortest wrapped distance (Y is never wrapped):</li>
          </ul>
          <pre class="api-code"><code>// torus sizes: X = 16384, Z = 2048
function wrappedDelta(from, to, size) {
  return ((to - from) % size + size + size / 2) % size - size / 2;
}

// Keep the entity ~1 m behind the player, correct even across the seam:
const dx = wrappedDelta(ctx.position[0], playerPos[0], 16384) - 1;
const dz = wrappedDelta(ctx.position[2], playerPos[2], 2048);
const dy = playerPos[1] - ctx.position[1]; // no wrap on Y</code></pre>
        </div>

        <!-- ================= Execution Model ================= -->
        <div class="api-section">
          <div class="api-h2">Execution model</div>
          <ul class="api-ul">
            <li><b>Every script</b> receives <code>(self, ctx)</code>: <code>self</code> is that component's action API; <code>ctx</code> is a read-only sensor snapshot whose body fields (<code>position</code>, <code>velocity</code>, <code>rotation</code>, <code>mass</code>, <code>bodyType</code>) always describe the root entity.</li>
            <li><code>ctx.root</code> is the root component. Traverse the real hierarchy recursively with <code>node.children()</code>; there is no flat component snapshot.</li>
            <li>Store cross-frame values in <code>self.state</code>. State is isolated by component, so sibling scripts cannot accidentally reuse the same variable name. Global Stop clears all component state.</li>
            <li>Scripts execute synchronously once per physics frame in isolated QuickJS/WASM Runtimes on the page thread. Memory, stack, wall-time, VM-checkpoint and command-count limits protect the host; completed command buffers commit immediately after the entity tick.</li>
            <li><b>Per-entity hard limits</b>: each entity runs in its own isolated QuickJS/WASM runtime capped at <code>4 MiB</code> memory and <code>512 KiB</code> stack (a failure surfaces as that component script's error); an entity holds at most <b>64 components</b> including the root — <code>ctx.selection.createChild</code> fails once the cap is reached, and importing a portable entity definition with more components is rejected; a command buffer holds at most 256 commands per entity tick.</li>
            <li>Read state from <code>ctx</code>. Dynamic bodies move through force/torque APIs and cannot accept direct pose writes; kinematic bodies additionally accept the documented <code>setLocalPosition</code>/<code>setLocalRotation</code>/<code>setLocalEuler</code> commands. No public API directly sets velocity.</li>
            <li><b>Ordering</b>: the root script runs first, then child scripts in the order their code was first set. All components of one entity share a single frozen <code>ctx</code> snapshot: rigid-body fields (<code>position</code>, <code>velocity</code>, <code>rotation</code>, …) are sampled at frame start, so siblings cannot read each other's motion within the same frame.</li>
            <li>Mutations are queued and revalidated on the main thread. An admitted immediate result is provisional with <code>reason: 'queued'</code>; a full 256-command entity buffer returns <code>ok: false</code> with <code>reason: 'command_limit'</code>. Standard-world writes are visible to later sibling scripts through the current frame's overlay.</li>
            <li>Thrown script exceptions are caught: only the failing component script is disabled and marked <b>ERROR</b>; sibling scripts continue. Every component invocation has a <code>5 ms</code> interrupt deadline, so an infinite loop cannot freeze the page. Whole-entity budgets additionally disable the <b>entire entity's</b> scripts (every component, logged as <code>[ERR] [runtime] …</code>) when all component scripts together exceed <code>25 ms</code> in one entity tick or the VM reaches its <code>64</code>-interrupt-checkpoint budget in a single frame. <code>self.state</code> stays at the value of the last <i>completed</i> tick — commands emitted during the interrupted tick are discarded. Keep total per-tick work across all components well under both budgets.</li>
            <li>An entity is loaded and simulated only while its wrapped root chunk is active. Leaving the streaming window serializes its identity, hierarchy, physics, scripts, and <code>self.state</code>, then destroys its scene object and QuickJS Runtime. Reloading the chunk creates a fresh instance and resumes the frozen state.</li>
            <li>An entity whose root falls below <code>y = -30</code> is removed together with all component scripts and <code>self.state</code>.</li>
          </ul>
        </div>

        <!-- ================= ctx ================= -->
        <div class="api-section">
          <div class="api-h2">ctx — sensor snapshot (read-only)</div>
          <table class="api-table">
            <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>apiVersion</code></td><td>number</td><td>Current script API version: <code>2</code></td></tr>
              <tr><td><code>entityId</code></td><td>string</td><td>Stable random ID of the current entity, also shown in the Behavior Terminal header</td></tr>
              <tr><td><code>root</code></td><td>ComponentAPI</td><td>Root component and entry point for recursive tree traversal</td></tr>
              <tr><td><code>time</code></td><td>number</td><td>Seconds with at least one component script enabled; Pause freezes it and Stop resets it</td></tr>
              <tr><td><code>deltaTime</code></td><td>number</td><td>Fixed entity simulation step: always <code>0.05</code> seconds (20 Hz). The engine owns this rate and code cannot change it</td></tr>
              <tr><td><code>tick</code></td><td>number</td><td>Executed script-frame count; Pause freezes it and Stop resets it</td></tr>
              <tr><td><code>position</code></td><td>[x,y,z]</td><td>Root entity world position</td></tr>
              <tr><td><code>velocity</code></td><td>[x,y,z]</td><td>World-space velocity (m/s)</td></tr>
              <tr><td><code>rotation</code></td><td>[x,y,z]</td><td>Euler angles in radians, YXZ order</td></tr>
              <tr><td><code>angularVelocity</code></td><td>[x,y,z]</td><td>Angular velocity (rad/s)</td></tr>
              <tr><td><code>groundDistance</code></td><td>number</td><td>Distance to the ground below (metres)</td></tr>
              <tr><td><code>mass</code></td><td>number</td><td>Entity mass (kg)</td></tr>
              <tr><td><code>bodyType</code></td><td>string</td><td>Root body type: <code>'kinematic'</code> or <code>'dynamic'</code></td></tr>
              <tr><td><code>gravity</code></td><td>[x,y,z]</td><td>Current gravity vector (default <code>[0,-18,0]</code>)</td></tr>
              <tr><td><code>limits</code></td><td>object</td><td><code>{maxForce, maxTorque}</code> — ceiling for the legacy root-body force surface only</td></tr>
              <tr><td><code>input</code></td><td>object</td><td>Keyboard input queries — see the <code>ctx.input</code> section below</td></tr>
              <tr><td><code>blocks</code></td><td>object</td><td>Block-edit queries (same frame-snapshot style as <code>ctx.input</code>): <code>pressed(type?)</code> — true when blocks were edited since the last frame (optionally filter by <code>'place'|'remove'|'color'|'subdivide'</code>); <code>event()</code> — the latest edit <code>{type, nodeId, blockCount}</code> or <code>null</code>. Fires even when the bounding box did not change (e.g. repainting only)</td></tr>
              <tr><td><code>players</code></td><td>array</td><td>Player list (multiplayer-ready): <code>[{id: string, position:[x,y,z], mass:number}]</code>; empty array when no player context is available. <code>position</code> is the player's <b>eye</b> (feet + 1.62 m, + 1.3 m crouched), not the feet; <code>mass</code> is the player's mass in kg (fixed at 50)</td></tr>
              <tr><td><code>world</code></td><td>object</td><td>World query API — see the <code>ctx.world</code> section below</td></tr>
              <tr><td><code>selection</code></td><td>object</td><td>Shared engine selection command API — see the <code>ctx.selection</code> section below</td></tr>
              <tr><td><code>log(msg)</code></td><td>fn</td><td>Append a line to CONSOLE LOGS</td></tr>
            </tbody>
          </table>
        </div>

        <!-- ================= self ================= -->
        <div class="api-section">
          <div class="api-h2">Component API (self) — one object for every component</div>
          <p class="api-sub">Everything is a component: the root body is the <b>root component</b>, everything else is a child component. Every script uses the unified signature <code>(self, ctx)</code>.</p>

          <div class="api-h3">Universal (same on root and children)</div>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>self.apiVersion</code></td><td>Current component API version: <code>2</code></td></tr>
              <tr><td><code>self.id</code> / <code>self.parentId</code></td><td>Component id and direct parent id; the root is <code>{id:'root', parentId:null}</code></td></tr>
              <tr><td><code>self.state</code></td><td>Mutable persistent state scoped to this component and retained across frames</td></tr>
              <tr><td><code>self.child(id)</code></td><td>Look up a known <b>direct child</b> by id; returns <code>null</code> when missing. <code>child('root')</code> returns the root component itself</td></tr>
              <tr><td><code>self.children()</code></td><td>Return a frozen array of direct child component APIs. Start at <code>ctx.root</code> and recurse to visit the whole tree</td></tr>
              <tr><td><code>self.applyThrust([x,y,z])</code></td><td><b>General-purpose thrust</b>: root-body-local force (N) applied at this component — on the root component it acts at the center of mass (= <code>applyLocalForce</code>); on a child it acts at its mounting point (off-center placement generates torque). Direction is independent of the spin axis; dynamic root only, subject to the force budget</td></tr>
              <tr><td><code>self.applyForce([x,y,z])</code></td><td>World-space force (N) at the center of mass — same on every component; no effect on a kinematic root</td></tr>
              <tr><td><code>self.applyLocalForce([x,y,z])</code></td><td>Body-space force (rotates with the entity). On a child the direction is interpreted in that component's own local frame and converted to the entity frame (component +Z maps through its rotation)</td></tr>
              <tr><td><code>self.applyForceAt([x,y,z], [lx,ly,lz])</code></td><td>World-space force at a local offset point — produces both translation and torque. On a child the offset point is in that component's local frame (relative to its pivot) and converted to entity-local coordinates</td></tr>
              <tr><td><code>self.applyTorque([x,y,z])</code></td><td>World-space torque — same on every component</td></tr>
              <tr><td><code>self.getWorldPosition()</code></td><td>Returns this component's world position as <code>[x,y,z]</code></td></tr>
              <tr><td><code>self.getWorldRotation()</code></td><td>Returns the world-space quaternion <code>[x,y,z,w]</code> (includes all parent rotations)</td></tr>
              <tr><td><code>self.getPivot()</code></td><td>Returns the current rotation center (pivot) as <code>[x,y,z]</code> in entity-local coordinates, matching <code>getBounds()</code> and <code>setPivot()</code></td></tr>
              <tr><td><code>self.getBounds()</code></td><td>Returns this component's block bounding box in entity-local coordinates: <code>{min, max, size, center}</code> (each <code>[x,y,z]</code>); <code>null</code> if it has no blocks</td></tr>
              <tr><td><code>self.setSeats([[x,y,z], ...])</code></td><td>Replace this component's driver-seat positions, relative to this component's pivot. Available on root and child components alike; an entity is mountable only when at least one of its components has a seat</td></tr>
              <tr><td><code>self.getSeats()</code></td><td>Read this component's seat positions as <code>[x,y,z]</code> points relative to its pivot. Pressing <b>V</b> mounts the entity and selects the seat nearest the aimed entity block, searching every component</td></tr>
              <tr><td><code>self.voxels.set(position, options?)</code></td><td>Place one standard voxel at a component-local cell. <b>Cells are measured from this component's pivot</b> (the root pivot is the AABB centroid of its blocks), not from the entity corner; fractional coordinates are floored after applying the pivot. <code>options</code> accepts <code>{color:0xRRGGBB}</code> or <code>{r,g,b}</code>; when omitted the color inherits the component's first block (default <code>0xf2a93b</code> when it has no blocks yet). Returns <code>{ok,placed,reason}</code></td></tr>
              <tr><td><code>self.voxels.clear(position)</code></td><td>Remove this component's standard voxel only; returns <code>{ok,removed,reason}</code></td></tr>
              <tr><td><code>self.voxels.paint(position, options?)</code></td><td>Repaint one existing standard voxel through the same command used by the Brush; returns <code>{ok,painted,reason}</code></td></tr>
              <tr><td><code>self.voxels.clearCell(position)</code></td><td>Remove this component's standard or micro voxels in one 1 m cell through the same command used by the Shovel; returns <code>{ok,removed,reason}</code></td></tr>
              <tr><td><code>self.voxels.subdivide(position, clearOffset?)</code></td><td>Convert one standard voxel into 125 micro voxels; optionally remove one offset atomically, matching the Spoon's direct carve. Returns <code>{ok,subdivided,removed,reason}</code></td></tr>
              <tr><td><code>self.microVoxels.set(cell, offset, options?)</code></td><td>Place one 0.2 m voxel. Each offset value is an integer from 0 through 4. Same pivot-relative cell origin and inherited-default-color rules as <code>self.voxels</code>; returns <code>{ok,placed,reason}</code></td></tr>
              <tr><td><code>self.microVoxels.clear(cell, offset)</code></td><td>Remove this component's exact micro voxel; returns <code>{ok,removed,reason}</code></td></tr>
              <tr><td><code>self.microVoxels.paint(cell, offset, options?)</code></td><td>Repaint one existing micro voxel; returns <code>{ok,painted,reason}</code></td></tr>
              <tr><td><code>self.localToWorldDirection([x,y,z])</code></td><td>Convert a local-space direction to world space (includes all parent rotations)</td></tr>
            </tbody>
          </table>
          <p class="api-sub">All voxel edit results are action-specific: check <code>result.ok</code> and read <code>result.reason</code> on failure. Entity bounding boxes are capped at <b>64×64×64</b>: a placement that would extend the entity AABB beyond the cap fails with <code>bounds_exceeded</code>. Removing the entity's final voxel deletes the entity together with all scripts and <code>self.state</code>.</p>

          <div class="api-h3">Kinematics (only <code>kinematic</code> component bodies accept direct pose commands; dynamic bodies are physics-driven)</div>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>self.setLocalPosition([x,y,z])</code></td><td>Set kinematic-child position relative to the parent, or kinematic-root world position</td></tr>
              <tr><td><code>self.setLocalEuler([x,y,z])</code></td><td>Set kinematic-child relative orientation, or kinematic-root world orientation, as Euler angles (radians, YXZ order)</td></tr>
              <tr><td><code>self.setLocalRotation([x,y,z,w])</code></td><td>Set kinematic-child relative orientation, or kinematic-root world orientation, as a quaternion</td></tr>
              <tr><td><code>self.setLocalSpin([ax,ay,az], rpm)</code></td><td>Spin continuously around a local axis at the given RPM; call every entity tick to sustain the speed</td></tr>
              <tr><td><code>self.getLocalPosition()</code></td><td>Returns current local position as <code>[x,y,z]</code></td></tr>
              <tr><td><code>self.getLocalRotation()</code></td><td>Returns current local quaternion as <code>[x,y,z,w]</code></td></tr>
              <tr><td><code>self.setPivot([x,y,z])</code></td><td>Update a kinematic body's rotation center explicitly (entity-local coordinates, same frame as <code>getBounds()</code>). The pivot does <b>not</b> auto-update when blocks change. Dynamic bodies use their physical center of mass. Rebuilding the hierarchy invalidates previously obtained component APIs — re-fetch with <code>self.child(id)</code></td></tr>
            </tbody>
          </table>

          <div class="api-h3">Rigid body and constraints (available on every component)</div>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>self.body.getType()</code> / <code>self.body.setType(type)</code></td><td>Read <code>'kinematic'|'dynamic'</code>; setter returns <code>{ok,type,reason}</code>. World voxels are the static collision layer; entity bodies have no static type</td></tr>
              <tr><td><code>self.body.getMass()</code> / <code>self.body.setMass(kg)</code></td><td>Read mass; setter returns <code>{ok,mass,reason}</code>. Automatic mass defaults to owned block count × <code>10 kg</code>; a manual value survives hierarchy rebuilds. Non-positive/non-finite input returns <code>invalid_mass</code>; positive values below <code>0.1 kg</code> clamp to <code>0.1 kg</code></td></tr>
              <tr><td><code>self.body.getMaterial()</code> / <code>self.body.setMaterial({...})</code></td><td>Read <code>{restitution,friction}</code>; setter returns <code>{ok,material,reason}</code>. Both coefficients clamp to <code>[0,1]</code>. Restitution defaults to <code>0.1</code> and friction to <code>0.7</code></td></tr>
              <tr><td><code>self.body.getGravityEnabled()</code> / <code>self.body.setGravityEnabled(enabled)</code></td><td>Read or change this body&apos;s runtime gravity switch. The setter returns <code>{ok,enabled,reason}</code>; kinematic bodies retain the value but gravity only affects dynamic bodies</td></tr>
              <tr><td><code>self.body.getCollisionEnabled()</code> / <code>self.body.setCollisionEnabled(enabled)</code></td><td>Read or change this component&apos;s runtime collision participation, including root components. The setter returns <code>{ok,enabled,reason}</code></td></tr>
              <tr><td><code>self.body.getVelocity()</code> / <code>self.body.getAngularVelocity()</code></td><td>Read this component body's world-space velocities</td></tr>
              <tr><td><code>self.body.applyForce(force)</code> / <code>self.body.applyLocalForce(force)</code> / <code>self.body.applyTorque(torque)</code></td><td>Apply force or torque to this component body's independent accumulator; returns <code>true</code> only for a dynamic body with a valid vector and available command slot. Kinematic bodies ignore forces. These methods are not clamped by <code>ctx.limits</code> or included in the HUD meter, even when <code>self</code> is the root; all components must nevertheless be finite and at most <code>1e12</code> in magnitude</td></tr>
              <tr><td><code>self.constraints.all()</code></td><td>Frozen array of complete definitions: <code>{id,type,bodyA,bodyB,anchorA,anchorB,axisA,axisB,referenceA,referenceB,limits,stiffness,collideConnected}</code></td></tr>
              <tr><td><code>self.constraints.create(options)</code></td><td>Create a point/hinge/weld from <code>options.other</code> (component id or <code>'world'</code> static anchor) to this body; returns <code>{ok,id,reason}</code>. Optional <code>stiffness</code> defaults to 0.9 and clamps to [0,1]; <code>collideConnected</code> defaults false. Without <code>id</code>, the base name is <code>\${type}_\${other}_\${self.id}</code> with numeric suffixes for duplicates</td></tr>
              <tr><td><code>self.constraints.remove(id)</code></td><td>Remove one constraint; returns boolean</td></tr>
            </tbody>
          </table>
          <p class="api-sub">Body setters change <b>runtime values only</b> — visible in the Entity Editor's <b>Runtime</b> tab (read-only, a Δ badge appears while they deviate from the defaults). The <b>PB Defaults</b> tab of the same panel edits the persisted defaults, and global <b>Stop</b> restores type, mass, material, gravity, and collision from those defaults. Pause preserves runtime values.</p>
          <pre class="api-code"><code>// Create a world-anchored hinge once, retain its generated id, then remove it.
if (!self.state.anchorId) {
  const created = self.constraints.create({
    type: 'hinge', other: 'world',
    axisA: [0, 0, 1], axisB: [0, 0, 1],
    stiffness: 0.9, collideConnected: false
  });
  if (created.ok) self.state.anchorId = created.id;
  else ctx.log(created.reason);
}
if (self.state.anchorId && ctx.input.pressed('KeyQ')) {
  self.constraints.remove(self.state.anchorId);
  self.state.anchorId = null;
}</code></pre>

          <div class="api-h3">Root-only (no-op on children)</div>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>self.stop()</code></td><td>Exactly the global Stop action: disable every component script, reset every <code>self.state</code>, script time/tick, child transforms/spins, and pending forces/torques, and restore the PB BodyConfig defaults (type, mass, material, gravity, collision — the values the Entity Editor's <b>PB Defaults</b> tab shows and edits). Root-only; child calls are no-ops, so child code should use <code>ctx.root.stop()</code>. It immediately ends the current script invocation</td></tr>
            </tbody>
          </table>

          <div class="api-code-title">Spin vs. thrust — which to use?</div>
          <ul class="api-ul">
            <li><b>① Pure rotation (mechanism / decoration)</b>: <code>setLocalSpin(axis, rpm)</code> — works on any child component, produces no force. Use for turbine blades, rolling wheels, decorative rotors.</li>
            <li><b>② Directed thrust (any direction)</b>: <code>applyThrust([x,y,z])</code> — completely decoupled from the spin axis. A quadrotor uses <code>setLocalSpin</code> for each rotor's visual motion plus <code>applyThrust([0, thrust, 0])</code> for lift; differential lift creates pitch/roll and <code>self.applyTorque</code> controls yaw.</li>
          </ul>

          <div class="api-code-title">Traverse the component tree</div>
          <pre class="api-code"><code>function visit(node) {
  ctx.log(node.id);
  for (const child of node.children()) visit(child);
}
visit(ctx.root);</code></pre>

          <div class="api-code-title">Block edits &amp; pivot updates</div>
          <ul class="api-ul">
            <li><code>ctx.blocks.pressed(type?)</code> — true when blocks were edited since the last frame, in the same query style as <code>ctx.input</code>. Edits are <b>place</b>, <b>remove</b>, <b>color</b>, or <b>subdivide</b> (1x1x1 → 5x5x5); pass a type to filter. It is a one-frame edge: the next frame returns false. <code>ctx.blocks.event()</code> returns the latest edit as <code>{type, nodeId, blockCount}</code> (or <code>null</code>).</li>
            <li>Edits are reported <b>even when the bounding box does not change</b> (e.g. repainting only).</li>
            <li>The <b>pivot is never updated automatically</b>: adding, removing, repainting or subdividing blocks keeps the old rotation center. Update it explicitly with <code>self.getBounds()</code> → <code>self.setPivot(bounds.center)</code> (blocks stay in place; only the axis moves).</li>
          </ul>
          <pre class="api-code"><code>// Root script: keep a component's pivot centered on its current block layout.
// No registration needed — just query every entity tick (like ctx.input).
if (ctx.blocks.pressed()) {
  const arm = self.child('arm');
  if (arm) {
    const bounds = arm.getBounds();
    if (bounds) arm.setPivot(bounds.center); // re-center after any edit
  }
}

// Filter by edit type if needed:
// if (ctx.blocks.pressed('color')) { ... }   // repaint only
// if (ctx.blocks.pressed('subdivide')) { ... } // 1x1x1 → 5x5x5 carving</code></pre>
        </div>

        <!-- ================= world ================= -->
        <div class="api-section">
          <div class="api-h2">ctx.world — world query API</div>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>ctx.world.apiVersion</code></td><td>Current world API version: <code>2</code></td></tr>
              <tr><td><code>ctx.world.voxels.get([x,y,z])</code></td><td>Read the current entity tick's standard-write overlay; cells not written this tick currently return air</td></tr>
              <tr><td><code>ctx.world.voxels.set([x,y,z], options?)</code></td><td>Queue one standard voxel placement. An admitted result is provisional <code>{ok:true,placed:1,reason:'queued'}</code>; a full buffer returns <code>{ok:false,placed:0,reason:'command_limit'}</code>. The main thread validates occupancy and bounds before commit</td></tr>
              <tr><td><code>ctx.world.voxels.clear([x,y,z])</code></td><td>Queue removal of one standard voxel without deleting micro voxels in that cell</td></tr>
              <tr><td><code>ctx.world.voxels.paint([x,y,z], options?)</code></td><td>Queue repainting one existing standard world voxel</td></tr>
              <tr><td><code>ctx.world.voxels.clearCell([x,y,z])</code></td><td>Queue removal of all standard and micro voxels in one world cell</td></tr>
              <tr><td><code>ctx.world.voxels.subdivide([x,y,z], clearOffset?)</code></td><td>Queue conversion of one standard voxel into 125 micro voxels with optional offset removal</td></tr>
              <tr><td><code>ctx.world.microVoxels.get(cell, offset)</code></td><td>Full synchronous micro-world reads are not exposed; currently returns air</td></tr>
              <tr><td><code>ctx.world.microVoxels.set(cell, offset, options?)</code></td><td>Queue placement of one 0.2 m world voxel</td></tr>
              <tr><td><code>ctx.world.microVoxels.clear(cell, offset)</code></td><td>Queue removal of one exact 0.2 m world voxel</td></tr>
              <tr><td><code>ctx.world.microVoxels.paint(cell, offset, options?)</code></td><td>Queue repainting one existing micro world voxel</td></tr>
              <tr><td><code>ctx.world.entities(origin, radius?)</code></td><td>Filter the frame's nearby-entity snapshot, prefetched to 64 m, by shortest wrapped X/Z distance; default <code>radius</code> is 16 m</td></tr>
              <tr><td><code>ctx.world.entities.get(id, chunkId?)</code></td><td>Look up one entity in the frame's nearby-entity snapshot</td></tr>
              <tr><td><code>ctx.world.entities.list(chunkId)</code> / <code>ctx.world.entities.inChunk(chunkId)</code></td><td>Filter the nearby-entity snapshot by wrapped chunk id <code>"cx,cz"</code></td></tr>
              <tr><td><code>ctx.world.raycast(origin, direction, maxDistance?)</code></td><td>Bounded synchronous raycast over standard world voxels; returns <code>{block,color,normal,position,distance}</code> or <code>null</code>. Default <code>maxDistance</code> is 24 m; maximum 64 calls per entity tick.</td></tr>
            </tbody>
          </table>
          <p class="api-sub">The API never overwrites occupied cells and never converts between standard and micro voxels implicitly. World X/Z wrap on the torus — see <b>World topology</b> above.</p>
        </div>

        <!-- ================= selection ================= -->
        <div class="api-section">
          <div class="api-h2">ctx.selection — shared selector command API</div>
          <p class="api-sub">Every mutating command returns <code>{ok,...,reason}</code>. When <code>ok === false</code>, inspect <code>reason</code>; <code>get()</code> is a query and returns the current selection snapshot instead. Selections are capped at a <b>64×64×64</b> AABB: box corners clamp to the cap (the result reports <code>clamped</code>), and single-cell toggles or <code>cells</code> batches that would exceed it are rejected with <code>bounds_exceeded</code>.</p>
          <table class="api-table">
            <thead><tr><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>ctx.selection.get()</code></td><td>Read the shared Manager-owned world/entity selection snapshot</td></tr>
              <tr><td><code>ctx.selection.clear()</code></td><td>Returns <code>{ok,cleared,reason}</code>. Does not forcibly cancel the player's separate current Selector-tool interaction state</td></tr>
              <tr><td><code>ctx.selection.cornerA(point)</code> / <code>ctx.selection.cornerB(point)</code></td><td>Set progressive world-box corners; returns <code>{ok,selected,reason}</code>. Pass <code>{micro:true}</code> to work in 0.2 m units — the confirmed micro box materializes into the existing micro voxels it contains</td></tr>
              <tr><td><code>ctx.selection.box(a,b)</code></td><td>Set an atomic two-point world box; returns <code>{ok,selected,reason}</code>. Accepts <code>{micro:true}</code> for 0.2 m corners</td></tr>
              <tr><td><code>ctx.selection.cells(list)</code> / <code>ctx.selection.toggle(cell)</code></td><td>Replace or toggle sparse world cells; returns <code>{ok,selected,reason}</code>. <code>toggle</code> accepts <code>{micro:true}</code> to target 0.2 m cells instead of 1 m cells</td></tr>
              <tr><td><code>ctx.selection.entity(entityId,nodeId?)</code></td><td>Select a component subtree and return <code>{ok,selected,reason}</code>. <code>nodeId</code> defaults to <code>root</code>; child selection requires stopped, whole-root works in every state</td></tr>
              <tr><td><code>ctx.selection.entityBox(entityId,nodeId,a,b,space?)</code></td><td>Returns <code>{ok,selected,components,reason}</code> for direct owned voxels intersecting a box; default space is <code>node-local</code>, or pass <code>world</code>. Requires stopped. Pass <code>{micro:true}</code> to keep only 0.2 m blocks</td></tr>
              <tr><td><code>ctx.selection.delete()</code></td><td>Delete the shared selection: root subtree removes its entity in any state; child subtree/entity-block selections require a stopped entity; world selections remove voxels. Returns <code>{ok,removed,standard,micro,entities,components,entityId,nodeId,reason}</code>; <code>entities</code> and <code>components</code> are removal counts. Returns <code>entity_not_stopped</code> when an internal selection is no longer editable</td></tr>
              <tr><td><code>ctx.selection.assemble(mode='programmable',options={})</code></td><td>Modes: <code>auto</code>, <code>free_physics</code>, <code>projectile</code>, <code>programmable</code>; <code>auto</code> aliases <code>programmable</code>. Bearing and piston motion is implemented with component scripts or constraints. Options: <code>bodyType</code>, <code>restitution</code>, <code>friction</code>, <code>useGravity</code>, <code>mass</code>. Returns <code>{ok,assembled,entityId,runtimeId,reason}</code></td></tr>
              <tr><td><code>ctx.selection.createChild(id?)</code></td><td>Create a child from the current entity-block selection; returns <code>{ok,childId,reason}</code>, with null <code>childId</code> on failure. The entity must be stopped</td></tr>
            </tbody>
          </table>
          <p class="api-sub">Assembly defaults: <code>bodyType: 'dynamic'</code>, <code>restitution: 0.1</code>, <code>friction: 0.7</code>, gravity enabled for dynamic bodies and disabled for kinematic bodies, and mass equal to owned block count × 10 kg (minimum 0.1 kg). Restitution/friction clamp to [0,1]; invalid mass falls back to the block-count default. Reasons are <code>assembled</code>, <code>no_selection</code>, <code>empty</code>, and <code>invalid_mode</code>; failures return null IDs, and an invalid mode is rejected before changing the selection or world.</p>
          <p class="api-sub">Mouse selector input and entity code dispatch through the same engine action layer, but the mouse adapter retains its own active interaction selection for R/T/Delete. Script-created selections should therefore be read and consumed through <code>ctx.selection</code>. Gate destructive operations with <code>self.state</code> or an input edge so they run once, not on every entity tick.</p>
        </div>

        <!-- ================= input ================= -->
        <div class="api-section">
          <div class="api-h2">ctx.input — keyboard input</div>
          <ul class="api-ul">
            <li><code>ctx.input.down(code)</code> — true while the key is held</li>
            <li><code>ctx.input.pressed(code)</code> — true only on the frame the key was first pressed (leading edge)</li>
            <li><code>ctx.input.released(code)</code> — true only on the frame the key was released (trailing edge)</li>
            <li><code>code</code> uses <code>KeyboardEvent.code</code> values: <code>KeyW</code> <code>KeyA</code> <code>KeyS</code> <code>KeyD</code> <code>Space</code> <code>ShiftLeft</code> …; the generic modifiers <code>Shift</code>, <code>Control</code> and <code>Alt</code> are accepted and match either side.</li>
            <li>Only the entity currently <b>mounted</b> (press V to mount/leave) receives player input; autonomous entities always see empty input.</li>
            <li>Editor-reserved keys are never forwarded to scripts: <code>Escape</code>, <code>Backspace</code>, <code>Delete</code>, <code>F3</code>, <code>F5</code>, <code>KeyC</code>, <code>KeyE</code>, <code>KeyF</code>, <code>KeyG</code>, <code>KeyR</code>, <code>KeyV</code>, <code>Digit0</code>, <code>Digit1</code>, <code>Digit2</code>, <code>Digit3</code>, <code>Digit4</code>, <code>Digit5</code>, <code>Digit6</code>, <code>Digit7</code>, <code>Digit8</code>, <code>Digit9</code>. Scripts therefore <b>cannot use number keys</b>.</li>
          </ul>
        </div>

        <!-- ================= Force budget ================= -->
        <div class="api-section">
          <div class="api-h2">Legacy root force budget</div>
          <ul class="api-ul">
            <li>The legacy top-level methods <code>self.applyForce</code>, <code>applyLocalForce</code>, <code>applyThrust</code>, <code>applyForceAt</code>, and <code>applyTorque</code> all target the root body and share a shape-aware ceiling: <code>maxForce = max(80, mass × 65)</code>, <code>maxTorque = max(40, maxForce × max(0.75, boundingRadius))</code>.</li>
            <li>Requests through that legacy surface are clamped, and its real-time utilisation is shown in the HUD's <b>Root Power Budget</b> meter.</li>
            <li>The <code>ctx.limits</code> clamp and HUD <b>Power Budget</b> cover only the legacy root-body force surface; <code>self.body.apply*</code> is not clamped to that gameplay budget or included in the meter. Both surfaces reject non-finite vectors and components above the separate <code>1e12</code> physics-safety ceiling.</li>
            <li>Typical hover pattern: offset gravity with <code>ctx.mass × |gravity|</code>, then use a PD controller on the altitude error for stability.</li>
          </ul>
        </div>

        <!-- ================= Tips ================= -->
        <div class="api-section">
          <div class="api-h2">Tips</div>
          <ul class="api-ul">
            <li><b>Ctrl/Cmd + Enter</b>: save script and return to game; <b>ESC</b>: close the panel.</li>
            <li>Press <b>V</b> to mount an entity <em>before</em> writing a driving script — only mounted entities receive keyboard input. Press C while mounted to open the editor directly.</li>
            <li><code>self.state</code> is the right place for persistent state: target altitude, phase counters, timers, etc. Each component owns a separate state object.</li>
            <li>Use <code>ctx.deltaTime</code> only when integrating an explicit rate. Force and torque commands are already in N/N·m; do not multiply them by <code>deltaTime</code>.</li>
            <li>Use the Selector to select an entity and press <b>R</b> to copy it. Copying automatically switches to Hammer, which previews and builds the inventory item with left-click. Hold Wrench left-click on a dynamic entity to grab its exact hit point; release to drop it. Wrench right-click toggles its runtime.</li>
          </ul>
        </div>

`;
