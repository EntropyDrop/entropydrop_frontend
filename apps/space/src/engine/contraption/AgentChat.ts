import { compileBehaviorPrompt } from './BehaviorAgent.ts';

/**
 * Agent chat module
 *
 * - With an API key configured: calls the OpenAI-compatible Chat Completions
 *   endpoint to generate controller code; the in-game user reference is the
 *   canonical contract, mirrored by docs/agent-skill.md and this prompt.
 * - Without a key: falls back to the built-in local rule compiler
 *   (compileBehaviorPrompt).
 */

/** System prompt injected into the model, derived from docs/agent-skill.md. */
export const AGENT_SYSTEM_PROMPT = `You are the component programming assistant for the "Space" voxel-physics world. Generate an API V2 controller from the player's natural-language request.

## Model and lifecycle
- Every world entity has a stable random ctx.entityId (ent_<UUID>) and is a component tree. Every component script has the same signature (self, ctx), executes once per physics frame (~60 Hz), and owns persistent self.state. Commands are collected during the synchronous QuickJS tick and committed immediately afterward in the same entity update. self is the component named in the current Target component note; ctx.position/velocity/rotation/mass/bodyType always describe the root entity.
- ctx.root is the root component. node.children() returns direct child APIs; recurse from ctx.root to traverse. node.child(id) looks up a known direct child; child('root') returns the root API.
- Execution: sandboxed QuickJS/WASM runs synchronously on the page thread and every entity owns a separate 4 MiB Runtime. The root script runs before child scripts; all components of the entity share one frozen ctx snapshot per fixed entity update. Each entity tick has wall-clock and VM-checkpoint hard limits; exceeding either immediately interrupts and disables the whole entity. Admitted mutations return provisional reason 'queued', then are revalidated and committed after script execution; a full 256-command entity buffer returns ok:false with reason 'command_limit'. Standard-world writes have an in-tick overlay; world.entities filters a nearby 64 m snapshot. Full synchronous world voxel/micro getters remain unavailable, but world.raycast is a bounded synchronous host query.
- An entity whose root falls below y = -30 is removed together with all component scripts and self.state.
- Entity chunk streaming: an entity exists and runs only while its wrapped root chunk is in the active window. Leaving the window serializes identity, hierarchy, physics, scripts, and self.state, then destroys the scene instance and QuickJS Runtime. Reloading that chunk creates a fresh instance and resumes saved state; ctx.time/tick stay frozen while dormant.
- ctx.apiVersion and self.apiVersion are 2.
- Coordinates are right-handed and Y-up: +X right, +Y up, -Z forward. Micro offsets are integer [x,y,z] values from 0 through 4 (0.2 m each).
- World topology: torus. X ∈ [0,16384) and Z ∈ [0,2048) wrap on world voxel ops and raycast, but ctx.position does NOT wrap — for follow/orbit compute X/Z deltas as the shortest wrapped distance ((to-from)%size+size+size/2)%size-size/2, size = 16384 (X) or 2048 (Z). Y is not wrapped; world voxel edits require y in [0,128).

## Component API (self)
- Identity/tree/state: self.id, self.parentId, self.state, self.child(id), self.children(). Child definitions may set collisionEnabled:false for visual-only parts such as raycast wheels; entity copy/export/import preserves this flag.
- Queries: getWorldPosition(), getWorldRotation(), getLocalPosition(), getLocalRotation(), localToWorldDirection(dir), getPivot(), getBounds(). Pivot/bounds/setPivot use entity-local coordinates. Kinematic child transforms are parent-relative; a kinematic root's setters use world position/orientation.
- Voxels: self.voxels.set/clear/paint/clearCell/subdivide and self.microVoxels.set/clear/paint enqueue commands. Immediate Worker results preserve the shapes set {ok,placed,reason}, clear/clearCell {ok,removed,reason}, paint {ok,painted,reason}, subdivide {ok,subdivided,removed,reason}, but use reason 'queued' and only confirm command-buffer admission. Voxel cells are relative to the component pivot (root pivot = AABB centroid), not the entity corner, and fractional coordinates floor after applying the pivot; omitting color inherits the component's first block color. Removing the final voxel deletes the entity and all scripts/state.
- Kinematics: setLocalPosition, setLocalRotation, setLocalEuler, setLocalSpin(axis,rpm), setPivot. Only kinematic component bodies accept direct pose commands; dynamic bodies are solver-driven.
- Bodies: self.body.getType/setType ('kinematic'|'dynamic'), getMass/setMass(kg), getMaterial/setMaterial({restitution?,friction?}), getVelocity/getAngularVelocity, applyForce/applyLocalForce/applyTorque. setType returns {ok,type,reason}; setMass returns {ok,mass,reason}; setMaterial returns {ok,material,reason}; apply methods target the calling component body's independent accumulator, return boolean, and are false/no-op for kinematic bodies, invalid vectors, or a full command buffer. self.body.apply* is not clamped by ctx.limits or included in the HUD Power Budget, even when self is the root, but all force/torque APIs reject non-finite components and components above the independent 1e12 safety ceiling. Default mass is owned block count * 10 kg; minimum mass is 0.1 kg (smaller positive values clamp, non-positive/non-finite values return invalid_mass), and a manual mass survives hierarchy rebuilds. Restitution defaults to 0.1 and friction to 0.7. World voxels are the static collision layer; entity bodies have no static type.
- Constraints: self.constraints.all/create/remove. create({id?,type:'point'|'hinge'|'weld',other,anchorA?,anchorB?,axisA?,axisB?,limits?,stiffness?,collideConnected?}) enqueues creation and returns provisional {ok:true,id:null,reason:'queued'}; supply an explicit id when later script logic needs a stable name. other is a component id or 'world' for a static world anchor. Without id, the main-thread name is type + '_' + other + '_' + self.id; stiffness defaults to 0.9 and clamps to [0,1], collideConnected defaults false, and omitted anchors use the target component pivot. Hinge limits are radians. all() returns the frame snapshot; remove(id) enqueues removal.
- Legacy root-body forces: applyForce(worldForce), applyLocalForce(localForce), applyThrust(rootLocalForceAtThisComponent), applyForceAt(worldForce, componentLocalPoint), applyTorque(worldTorque). They have no effect on a kinematic root. Commands are per-update and clamped by ctx.limits (maxForce = max(80, mass*65); maxTorque = max(40, maxForce*max(0.75, boundingRadius))). The ctx.limits clamp and HUD Power Budget cover only this legacy root-body force surface; self.body.apply* is not clamped or included in that meter.
- Every component can use setSeats([[x,y,z], ...]) and getSeats(); seat positions are relative to that component's pivot. An entity is mountable only when it owns at least one explicit seat. self.stop() remains root-only and resets every component script; a child must call ctx.root.stop().

## Frame context (read-only)
ctx.entityId, ctx.root, time, deltaTime, tick, position, velocity, rotation[pitch,yaw,roll], angularVelocity, groundDistance, mass, bodyType, gravity, limits{maxForce,maxTorque} for the legacy root-body force surface, input, blocks, players, world, selection, log(msg). Entity code runs at the engine-owned fixed 20 Hz cadence, so deltaTime is always 0.05 seconds and the rate cannot be changed by code.
- input.down(code), pressed(code), released(code); codes include KeyW/A/S/D, Space and ShiftLeft; Shift/Control/Alt match either side. Only the mounted entity receives player input. Reserved keys never reach scripts: Escape, Backspace, Delete, F3, F5, KeyC, KeyE, KeyF, KeyG, KeyR, KeyV, Digit0, Digit1, Digit2, Digit3, Digit4, Digit5, Digit6, Digit7, Digit8, Digit9.
- blocks.pressed(type?) and blocks.event(); types: place, remove, color, subdivide.
- players[i].position is the eye position (feet + 1.62 m standing or +1.3 m crouched), not the feet.
- World voxels: ctx.world.apiVersion is 2. world.voxels.set/world.voxels.clear/world.voxels.paint/world.voxels.clearCell/world.voxels.subdivide and world.microVoxels.set/world.microVoxels.clear/world.microVoxels.paint enqueue actions and immediately return provisional {ok:true,...,reason:'queued'} results. The host revalidates bounds, occupancy, bounds_exceeded, and action permissions before commit. world.voxels.get sees only the current frame's standard-write overlay and otherwise returns air; world.microVoxels.get returns air. world.entities(origin, radius=16), get, list, and inChunk use the nearby-entity frame snapshot. world.raycast(origin, direction, maxDistance=24) synchronously queries standard world voxels through a bounded host callback and returns {block,color,normal,position,distance} or null; at most 64 host raycasts are served per entity tick.
- Selection: ctx.selection.get() returns the frozen frame snapshot. Mutations update an optimistic in-tick copy, enqueue the real main-thread action, and immediately return provisional {ok:true,...,reason:'queued'} shapes: clear {cleared}; cornerA/cornerB/box/cells/toggle/entity {selected}; ctx.selection.entityBox {selected,components}; delete {removed,standard,micro,entities,components,entityId,nodeId}; createChild {childId}; assemble {assembled,entityId,runtimeId}. The main thread can still reject child/entityBox/internal delete/createChild with entity_not_stopped. Selections are capped at a 64×64×64 AABB and may fail with bounds_exceeded. Assembly modes are auto, free_physics, projectile, programmable; bearing and piston behavior should be written as component scripts or constraints. Options are bodyType, restitution, friction, useGravity, mass; invalid modes fail with invalid_mode. Script and mouse adapters share the engine action layer but keep separate active selection hosts. Corner and box commands accept optional {micro:true}. Gate destructive calls so they run once.

## Generation rules
1. Output exactly one JavaScript code block wrapped in \`\`\`js and no prose outside it.
2. Use only the APIs above. Use self.state for cross-tick values. Use ctx.deltaTime only when explicitly integrating a rate; forces and torques are already per-update commands and must not be multiplied by deltaTime.
3. Never use unbounded loops: every component invocation has a 5 ms QuickJS interrupt deadline and every entity frame has a 64-checkpoint VM budget. Exceeding either immediately interrupts and disables the whole entity to protect the page thread. Avoid expensive full-tree traversal and cache known ids when appropriate.
4. Hover: lift = mass*abs(gravityY) + heightError*Kp - verticalVelocity*Kd, plus attitude torque.
5. Stabilize with torque from attitude error and angular-velocity damping.
6. Quadcopter children use setLocalSpin for visuals and applyThrust([0,thrust,0]) for differential lift; yaw uses root torque.
7. Check ctx.players.length before following a player.
8. Throttle logs, e.g. if (ctx.tick % 60 === 0) ctx.log(...).
9. For queued mutations, result.ok confirms command-buffer admission rather than final main-thread commit. On command_limit, do not update optimistic script state as if the mutation succeeded.
10. Follow/orbit/seek across the torus seam must use the wrapped shortest-distance delta for X/Z from the topology note above, never raw position differences; Y is not wrapped.
11. Vertical offsets relative to the player start from the eye position (+1.62 m standing or +1.3 m crouched).
12. Gate destructive selection commands with self.state or an input edge; never call delete/assemble/createChild unconditionally every tick.

`;

/**
 * Approximate token count for text. Roughly ~3.5 chars per token for code/English text.
 */
export function estimateTokens(text = ''): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

export const AGENT_CONFIG_STORAGE_KEY = 'space.agent.config.v1';

/**
 * Read/write non-secret agent preferences. API keys are deliberately kept in
 * the current UI session only and are never restored from localStorage.
 */
export function loadAgentConfig() {
  try {
    const raw = localStorage.getItem(AGENT_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const contextK = Number.isFinite(parsed.contextKTokens)
        ? Number(parsed.contextKTokens)
        : (Number.isFinite(parsed.contextLength) ? Number(parsed.contextLength) : 32);
      const maxOutputK = Number.isFinite(parsed.maxOutputKTokens)
        ? Number(parsed.maxOutputKTokens)
        : (Number.isFinite(parsed.maxTokens) ? Math.round(Number(parsed.maxTokens) / 1024) : 4);

      const config = {
        baseUrl: String(parsed.baseUrl || 'https://api.openai.com/v1'),
        apiKey: '',
        model: String(parsed.model || 'gpt-4o-mini'),
        contextKTokens: Math.max(1, Math.min(2048, contextK || 32)),
        maxOutputKTokens: Math.max(0.1, Math.min(128, maxOutputK || 4))
      };
      if (Object.prototype.hasOwnProperty.call(parsed, 'apiKey')) {
        localStorage.setItem(AGENT_CONFIG_STORAGE_KEY, JSON.stringify({
          baseUrl: config.baseUrl,
          model: config.model,
          contextKTokens: config.contextKTokens,
          maxOutputKTokens: config.maxOutputKTokens
        }));
      }
      return config;
    }
  } catch { /* ignore */ }
  return { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', contextKTokens: 32, maxOutputKTokens: 4 };
}

export function saveAgentConfig(config) {
  try {
    const persisted = {
      baseUrl: String(config?.baseUrl || 'https://api.openai.com/v1'),
      model: String(config?.model || 'gpt-4o-mini'),
      contextKTokens: Math.max(1, Math.min(2048, Number(config?.contextKTokens) || 32)),
      maxOutputKTokens: Math.max(0.1, Math.min(128, Number(config?.maxOutputKTokens) || 4))
    };
    localStorage.setItem(AGENT_CONFIG_STORAGE_KEY, JSON.stringify(persisted));
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the first ```js code block from a model reply; returns null when no
 * code block is present.
 */
export function extractCodeBlock(content, options: any = {}) {
  if (!content) return null;
  const match = content.match(/```(?:js|javascript)?\s*\n([\s\S]*?)\n```/i);
  if (match) return match[1].trim();
  if (options.allowUnfenced === false) return null;
  // Fallback: when there are no fences, return the whole content if it looks
  // like JS (mentions the V2 self/ctx APIs) and is not a plain-text answer.
  if (/(self\.|ctx\.)/.test(content) && !/^\s*[\[#]/.test(content)) {
    return content.trim();
  }
  return null;
}

/**
 * Extract reasoning / thought chain and final answer content from raw output,
 * supporting both explicit API reasoning and inline <think> tags.
 */
export function parseThoughtAndContent(rawContent = '', explicitReasoning = '') {
  let reasoning = explicitReasoning || '';
  let content = rawContent || '';

  if (content.includes('<think>')) {
    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)([\s\S]*)$/i);
    if (thinkMatch) {
      const embeddedThought = thinkMatch[1].trim();
      if (!reasoning) {
        reasoning = embeddedThought;
      } else if (embeddedThought && !reasoning.includes(embeddedThought)) {
        reasoning = `${reasoning}\n${embeddedThought}`.trim();
      }
      content = thinkMatch[2] ? thinkMatch[2].trimStart() : '';
    }
  }
  return { reasoning: reasoning.trim(), content };
}

/**
 * Call an OpenAI-compatible Chat Completions endpoint with optional SSE streaming.
 * @returns {Promise<{ok: boolean, content?: string, reasoning?: string, error?: string}>}
 */
export async function callChatAgent(messages, config, fetchImpl = null, onChunk = null) {
  const fetcher = fetchImpl || ((url, opts) => fetch(url, opts));
  const endpoint = `${String(config.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch (_) {
    return { ok: false, error: 'Agent API base URL is invalid.' };
  }
  const localDevelopmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(endpointUrl.hostname);
  if (endpointUrl.protocol !== 'https:' && !(endpointUrl.protocol === 'http:' && localDevelopmentHost)) {
    return { ok: false, error: 'Agent API keys may only be sent to HTTPS endpoints (HTTP is allowed only on localhost).' };
  }
  const stream = typeof onChunk === 'function';
  const maxTokensK = Number.isFinite(config?.maxOutputKTokens) && config.maxOutputKTokens > 0
    ? config.maxOutputKTokens
    : (Number.isFinite(config?.maxTokens) && config.maxTokens > 0 ? config.maxTokens / 1024 : 4);
  const maxTokens = Math.max(64, Math.round(maxTokensK * 1024));
  const timeoutMs = Math.max(1000, Math.min(300000, Number(config?.timeoutMs) || 60000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.4,
        max_tokens: maxTokens,
        ...(stream ? { stream: true } : {})
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        error: `API request failed (HTTP ${response.status}): ${detail.slice(0, 200)}`
      };
    }

    // Stream reader if the response body supports SSE streaming
    if (stream && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let rawContent = '';
      let rawReasoning = '';
      let finishReason = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const choice = data?.choices?.[0];
              if (choice?.finish_reason) finishReason = choice.finish_reason;
              const delta = choice?.delta;
              if (delta) {
                const cDelta = delta.content || '';
                const rDelta = delta.reasoning_content || delta.reasoning || delta.thought || '';
                if (cDelta) rawContent += cDelta;
                if (rDelta) rawReasoning += rDelta;

                const parsed = parseThoughtAndContent(rawContent, rawReasoning);
                onChunk({
                  content: parsed.content,
                  reasoning: parsed.reasoning,
                  contentDelta: cDelta,
                  reasoningDelta: rDelta,
                  isStreaming: true
                });
              }
            } catch {
              // Ignore partial JSON parse errors
            }
          }
        }
      }

      if (finishReason === 'length') {
        return { ok: false, error: 'The model response was truncated. Shorten the request or try again; no code was applied.' };
      }

      const parsed = parseThoughtAndContent(rawContent, rawReasoning);
      return { ok: true, content: parsed.content, reasoning: parsed.reasoning };
    }

    // Fallback for non-streaming response or mocked responses
    const data = await response.json();
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      return { ok: false, error: 'The model response was truncated. Shorten the request or try again; no code was applied.' };
    }
    const rawContent = choice?.message?.content;
    if (typeof rawContent !== 'string') {
      return { ok: false, error: 'API response is missing choices[0].message.content' };
    }
    const rawReasoning = choice?.message?.reasoning_content || choice?.message?.reasoning || choice?.message?.thought || '';
    const parsed = parseThoughtAndContent(rawContent, rawReasoning);
    if (typeof onChunk === 'function') {
      onChunk({
        content: parsed.content,
        reasoning: parsed.reasoning,
        contentDelta: parsed.content,
        reasoningDelta: parsed.reasoning,
        isStreaming: false
      });
    }
    return { ok: true, content: parsed.content, reasoning: parsed.reasoning };
  } catch (err) {
    return {
      ok: false,
      error: controller.signal.aborted
        ? `Agent request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
        : `Network request failed: ${err?.message || String(err)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run one agent chat turn.
 * With an API key → remote model (system prompt + message history);
 * without a key → local rule compiler.
 * @param {string} userPrompt player input
 * @param {{baseUrl:string, apiKey:string, model:string}} config
 * @param {Array<{role:string, content:string}>} history existing chat history (without the current input)
 * @returns {Promise<{ok: boolean, content?: string, reasoning?: string, code?: string|null, error?: string, local?: boolean}>}
 */
export async function runAgentTurn(
  userPrompt,
  config,
  history = [],
  fetchImpl = null,
  targetContext: any = null,
  onChunk: any = null
) {
  const prompt = String(userPrompt || '').trim();
  if (!prompt) return { ok: false, error: 'Please describe the behavior first, e.g. "hover 5 meters above the ground".' };

  // Local fallback: single-turn rule compilation
  if (!config || !config.apiKey) {
    const result = compileBehaviorPrompt(prompt);
    if (!result.ok) {
      return { ok: false, error: result.error, local: true };
    }
    const content = result.intent === 'stop'
      ? 'Active control stopped: the controller no longer applies forces or torques.'
      : `(local compiler) ${result.summary}`;
    const code = result.code || null;
    if (typeof onChunk === 'function') {
      onChunk({ content, reasoning: '', contentDelta: content, reasoningDelta: '', isStreaming: false });
    }
    return {
      ok: true,
      local: true,
      content,
      reasoning: '',
      code
    };
  }

  let targetNote = '';
  if (targetContext) {
    const entId = targetContext.entityId ?? (targetContext.runtimeId !== null ? `Entity #${targetContext.runtimeId}` : 'unknown');
    const compId = String(targetContext.id || 'root');
    const parentComp = targetContext.parentId ?? 'none';
    const compBlocks = Number(targetContext.blockCount) || 0;
    const totalBlocks = Number(targetContext.totalBlockCount) || compBlocks;
    const compList = Array.isArray(targetContext.allComponents) && targetContext.allComponents.length > 0
      ? targetContext.allComponents.join(', ')
      : compId;

    targetNote = `\n\nTarget component:\n- id: ${compId}\n- parent: ${parentComp}\n- entity: ${entId}\n- owned blocks: ${compBlocks}\n- entity components: [${compList}]\n- total entity blocks: ${totalBlocks}`;
  }

  const contextK = config && Number.isFinite(config.contextKTokens) && config.contextKTokens > 0
    ? config.contextKTokens
    : (config && Number.isFinite(config.contextLength) && config.contextLength > 0 ? config.contextLength : 32);
  const totalContextTokens = Math.round(contextK * 1024);
  const systemTokens = estimateTokens(AGENT_SYSTEM_PROMPT);
  const userPromptTokens = estimateTokens(`${prompt}${targetNote}`);
  const baseOverhead = systemTokens + userPromptTokens + 64;
  const availableHistoryTokens = Math.max(0, totalContextTokens - baseOverhead);

  const historySlice: any[] = [];
  let accumulatedTokens = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    const itemTokens = estimateTokens(item.content) + 4;
    if (accumulatedTokens + itemTokens <= availableHistoryTokens) {
      historySlice.unshift(item);
      accumulatedTokens += itemTokens;
    } else {
      break;
    }
  }

  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...historySlice.map(item => ({ role: item.role, content: item.content })),
    { role: 'user', content: `${prompt}${targetNote}` }
  ];
  const response = await callChatAgent(messages, config, fetchImpl, onChunk);
  if (!response.ok) return response;
  return {
    ok: true,
    content: response.content,
    reasoning: response.reasoning || '',
    // Remote prose or unfenced snippets remain visible in chat but are never
    // auto-applied. The local deterministic compiler does not use this path.
    code: extractCodeBlock(response.content, { allowUnfenced: false })
  };
}
