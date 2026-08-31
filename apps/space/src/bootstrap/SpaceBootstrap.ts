import type {
  TerrainEditChunk,
  TerrainMutation,
  WorldEditRemote,
} from '../engine/voxel/WorldEditPersistence.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../engine/voxel/Chunk.ts';
import {
  TORUS_GREF,
  TORUS_SIZE_X,
  TORUS_SIZE_Z,
  TORUS_SPAWN_X,
  TORUS_SPAWN_Z,
  wrapX,
  wrapZ,
} from '../engine/torus/TorusWorld.ts';

import {
  LatencyMonitor,
  type LatencyMonitorOptions,
} from './LatencyMonitor.ts';

export { LatencyMonitor, type LatencyMonitorOptions };

export const TERRAIN_STREAM_RADIUS_CHUNKS = 32;
export const TERRAIN_STREAM_TILE_CHUNKS = 8;
export const TERRAIN_STREAM_PAGE_SIZE = 64;
export const TERRAIN_STREAM_HYSTERESIS_CHUNKS = 1.5;
export const TERRAIN_STREAM_SWITCH_DEBOUNCE_MS = 500;

export interface TerrainStreamArea {
  centerChunkX: number;
  centerChunkZ: number;
  radiusChunks: number;
  key: string;
}

export type SkinType = 'strong' | 'slim';

export interface SpaceBootstrapPayload {
  protocol_version: 2;
  max_online_players: 32;
  queue_enabled: true;
  websocket_url: string;
  world: {
    id: string;
    name: string;
    seed: number;
    terrain_generator_version: number;
    terrain_revision: number;
  };
  player: {
    user_id: string;
    username: string | null;
    is_admin?: boolean;
    player_entity_id: string;
    skin_url: string;
    skin_type: SkinType;
    start_x_cm: number | null;
    start_y_cm: number | null;
    start_z_cm: number | null;
    start_yaw_q15: number | null;
    resumed: boolean;
  };
}

export interface PlayerPositionPayload {
  x_cm: number;
  y_cm: number;
  z_cm: number;
  yaw_q15: number;
  pitch_q15?: number;
}

export interface PlayerPositionRemote {
  save(position: PlayerPositionPayload, keepalive?: boolean): Promise<void>;
}

export interface ReadySpaceSession extends SpaceBootstrapPayload {
  api_origin: string;
  token: string;
  skin_object_url: string;
  terrain_edit_remote: WorldEditRemote;
  player_position_remote: PlayerPositionRemote;
  latency_monitor: LatencyMonitor;
}

export type SpaceEntryErrorCode =
  | 'LOGIN_REQUIRED'
  | 'SKIN_REQUIRED'
  | 'SKIN_DOWNLOAD_FAILED'
  | 'BOOTSTRAP_FAILED';

export class SpaceEntryError extends Error {
  readonly code: SpaceEntryErrorCode;
  readonly actionUrl: string;
  readonly actionLabel: string;

  constructor(
    code: SpaceEntryErrorCode,
    message: string,
    actionUrl: string,
    actionLabel: string
  ) {
    super(message);
    this.name = 'SpaceEntryError';
    this.code = code;
    this.actionUrl = actionUrl;
    this.actionLabel = actionLabel;
  }
}

export function resolveApiOrigin(configuredBase: string | undefined, pageOrigin: string) {
  const normalized = (configuredBase || '').trim().replace(/\/+$/, '');
  if (!normalized) return pageOrigin.includes('localhost') ? 'http://localhost:8000' : pageOrigin;
  return normalized.replace(/\/skin$/, '');
}

export function hasPngSignature(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((value, index) => bytes[index] === value);
}

export function resolveInitialPlayerPose(
  player: SpaceBootstrapPayload['player'],
  randomFn: () => number = Math.random
) {
  if (
    player.resumed &&
    typeof player.start_x_cm === 'number' &&
    typeof player.start_y_cm === 'number' &&
    typeof player.start_z_cm === 'number' &&
    typeof player.start_yaw_q15 === 'number'
  ) {
    return {
      x: player.start_x_cm / 100,
      y: player.start_y_cm / 100,
      z: player.start_z_cm / 100,
      yaw: (player.start_yaw_q15 / 32767) * Math.PI,
      resumed: true,
    };
  }

  // Sample a random spawn point on the safe inner-ring spawn plain
  const offsetX = (randomFn() * 20 - 10);
  const offsetZ = (randomFn() * 20 - 10);
  const randomYaw = (randomFn() * 2 - 1) * Math.PI;

  return {
    x: wrapX(TORUS_SPAWN_X + offsetX),
    y: TORUS_GREF + 2,
    z: wrapZ(TORUS_SPAWN_Z + offsetZ),
    yaw: randomYaw,
    resumed: false,
  };
}

/**
 * Coarsen player movement into overlapping terrain snapshot windows. A 32-chunk
 * radius covers the maximum 24-chunk render distance plus movement within one
 * eight-chunk tile, avoiding a snapshot request on every chunk boundary.
 */
export function terrainStreamAreaForPosition(
  xMeters: number,
  zMeters: number,
  radiusChunks = TERRAIN_STREAM_RADIUS_CHUNKS
): TerrainStreamArea {
  const chunkCountX = TORUS_SIZE_X / CHUNK_SIZE_X;
  const chunkCountZ = TORUS_SIZE_Z / CHUNK_SIZE_Z;
  const chunkX = Math.floor(wrapX(xMeters) / CHUNK_SIZE_X);
  const chunkZ = Math.floor(wrapZ(zMeters) / CHUNK_SIZE_Z);
  const tileX = Math.floor(chunkX / TERRAIN_STREAM_TILE_CHUNKS);
  const tileZ = Math.floor(chunkZ / TERRAIN_STREAM_TILE_CHUNKS);
  const centerChunkX = (
    tileX * TERRAIN_STREAM_TILE_CHUNKS + Math.floor(TERRAIN_STREAM_TILE_CHUNKS / 2)
  ) % chunkCountX;
  const centerChunkZ = (
    tileZ * TERRAIN_STREAM_TILE_CHUNKS + Math.floor(TERRAIN_STREAM_TILE_CHUNKS / 2)
  ) % chunkCountZ;
  const normalizedRadius = Math.max(1, Math.floor(radiusChunks));
  return {
    centerChunkX,
    centerChunkZ,
    radiusChunks: normalizedRadius,
    key: `${centerChunkX},${centerChunkZ},${normalizedRadius}`,
  };
}

function wrappedChunkDelta(position: number, center: number, chunkCount: number) {
  let delta = position - center;
  if (delta > chunkCount / 2) delta -= chunkCount;
  if (delta < -chunkCount / 2) delta += chunkCount;
  return delta;
}

/**
 * Keep the current snapshot window while the player is close to a tile edge.
 * The overlap prevents tiny back-and-forth movements from repeatedly loading
 * two otherwise equivalent 65x65-chunk AOIs.
 */
export function terrainStreamAreaForPositionWithHysteresis(
  xMeters: number,
  zMeters: number,
  currentArea: TerrainStreamArea,
  hysteresisChunks = TERRAIN_STREAM_HYSTERESIS_CHUNKS
): TerrainStreamArea {
  const nextArea = terrainStreamAreaForPosition(
    xMeters,
    zMeters,
    currentArea.radiusChunks
  );
  if (nextArea.key === currentArea.key) return currentArea;

  const chunkCountX = TORUS_SIZE_X / CHUNK_SIZE_X;
  const chunkCountZ = TORUS_SIZE_Z / CHUNK_SIZE_Z;
  const chunkX = wrapX(xMeters) / CHUNK_SIZE_X;
  const chunkZ = wrapZ(zMeters) / CHUNK_SIZE_Z;
  const keepDistance = TERRAIN_STREAM_TILE_CHUNKS / 2
    + Math.max(0, hysteresisChunks);
  const deltaX = wrappedChunkDelta(chunkX, currentArea.centerChunkX, chunkCountX);
  const deltaZ = wrappedChunkDelta(chunkZ, currentArea.centerChunkZ, chunkCountZ);

  return Math.abs(deltaX) < keepDistance && Math.abs(deltaZ) < keepDistance
    ? currentArea
    : nextArea;
}

export function initialTerrainStreamArea(player: SpaceBootstrapPayload['player']) {
  const resumed = player.resumed
    && typeof player.start_x_cm === 'number'
    && typeof player.start_z_cm === 'number';
  return terrainStreamAreaForPosition(
    resumed ? player.start_x_cm! / 100 : TORUS_SPAWN_X,
    resumed ? player.start_z_cm! / 100 : TORUS_SPAWN_Z
  );
}

function wrapCentimeters(valueMeters: number, sizeMeters: number) {
  const sizeCm = sizeMeters * 100;
  const valueCm = Math.round(valueMeters * 100);
  return ((valueCm % sizeCm) + sizeCm) % sizeCm;
}

export function encodePlayerPosition(
  position: { x: number; y: number; z: number },
  yaw: number,
  pitch = 0
): PlayerPositionPayload {
  const normalizedYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const maxPitch = Math.PI / 2 - 0.01;
  const clampedPitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  return {
    x_cm: wrapCentimeters(position.x, TORUS_SIZE_X),
    y_cm: Math.round(position.y * 100),
    z_cm: wrapCentimeters(position.z, TORUS_SIZE_Z),
    yaw_q15: Math.max(-32767, Math.min(32767, Math.round((normalizedYaw / Math.PI) * 32767))),
    pitch_q15: Math.max(-32767, Math.min(32767, Math.round((clampedPitch / Math.PI) * 32767))),
  };
}

function entryErrorFromResponse(status: number, body: any) {
  const detail = body?.detail;
  if (status === 401 || status === 403) {
    return new SpaceEntryError(
      'LOGIN_REQUIRED',
      '请先登录 EntropyDrop，再进入 Space。',
      '/skin/',
      '返回主站登录'
    );
  }
  if (status === 409 && detail?.code === 'SKIN_REQUIRED') {
    return new SpaceEntryError(
      'SKIN_REQUIRED',
      detail.message || '进入 Space 前需要先设置角色皮肤。',
      detail.action_url || '/skin/edit',
      '去设置角色皮肤'
    );
  }
  return new SpaceEntryError(
    'BOOTSTRAP_FAILED',
    typeof detail === 'string' ? detail : '无法读取 Space 玩家资料，请稍后重试。',
    window.location.href,
    '重试'
  );
}

async function downloadSkinPng(url: string) {
  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  } catch {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      '角色皮肤 PNG 下载失败，请重新设置皮肤后再试。',
      '/skin/edit',
      '去设置角色皮肤'
    );
  }

  if (!response.ok) {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      `角色皮肤 PNG 下载失败（${response.status}）。`,
      '/skin/edit',
      '去设置角色皮肤'
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!hasPngSignature(bytes)) {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      '角色皮肤不是有效的 PNG 文件，请重新设置。',
      '/skin/edit',
      '去设置角色皮肤'
    );
  }

  const blob = new Blob([bytes], { type: 'image/png' });
  try {
    const bitmap = await createImageBitmap(blob);
    const validSize = bitmap.width === 64 && bitmap.height === 64;
    bitmap.close();
    if (!validSize) throw new Error('invalid dimensions');
  } catch {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      '角色皮肤必须是可解码的 64×64 PNG，请重新设置。',
      '/skin/edit',
      '去设置角色皮肤'
    );
  }
  return URL.createObjectURL(blob);
}

export async function loadTerrainEditRemote(
  apiOrigin: string,
  token: string,
  worldId: string,
  fetchImpl: typeof fetch = fetch,
  _latencyMonitor?: LatencyMonitor,
  initialArea?: TerrainStreamArea
): Promise<WorldEditRemote> {
  const baseUrl = `${apiOrigin}/space/api/v2/worlds/${encodeURIComponent(worldId)}/terrain-edits`;
  const retryUrl = typeof window === 'undefined' ? '/' : window.location.href;
  const areaRequests = new Map<string, Promise<TerrainEditChunk[]>>();

  const fetchPages = async (
    area?: TerrainStreamArea,
    onPage?: (chunks: TerrainEditChunk[]) => void
  ) => {
    const chunks: TerrainEditChunk[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    do {
      const url = new URL(
        baseUrl,
        typeof window === 'undefined' ? 'http://localhost' : window.location.href
      );
      // Keep JSON decoding and validation below a long-task-sized response;
      // subsequent pages yield back to the browser between network awaits.
      url.searchParams.set('limit', String(TERRAIN_STREAM_PAGE_SIZE));
      if (area) {
        url.searchParams.set('center_chunk_x', String(area.centerChunkX));
        url.searchParams.set('center_chunk_z', String(area.centerChunkZ));
        url.searchParams.set('radius_chunks', String(area.radiusChunks));
      }
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new SpaceEntryError(
          response.status === 401 || response.status === 403 ? 'LOGIN_REQUIRED' : 'BOOTSTRAP_FAILED',
          '无法加载 Space 世界修改，请检查后端版本和网络连接。',
          response.status === 401 || response.status === 403 ? '/skin/' : retryUrl,
          response.status === 401 || response.status === 403 ? '返回主站登录' : '重试'
        );
      }
      if (!Array.isArray(body?.chunks)) {
        throw new SpaceEntryError(
          'BOOTSTRAP_FAILED',
          'Space 世界修改响应格式无效。',
          retryUrl,
          '重试'
        );
      }
      const pageChunks = body.chunks as TerrainEditChunk[];
      chunks.push(...pageChunks);
      onPage?.(pageChunks);
      const nextCursor = typeof body.next_cursor === 'string' ? body.next_cursor : null;
      if (nextCursor && seenCursors.has(nextCursor)) {
        throw new SpaceEntryError(
          'BOOTSTRAP_FAILED',
          'Space 世界修改分页游标重复。',
          retryUrl,
          '重试'
        );
      }
      if (nextCursor) seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    return chunks;
  };

  const loadArea = (
    centerChunkX: number,
    centerChunkZ: number,
    radiusChunks: number,
    onPage?: (chunks: TerrainEditChunk[]) => void
  ) => {
    const area = {
      centerChunkX: Math.floor(centerChunkX),
      centerChunkZ: Math.floor(centerChunkZ),
      radiusChunks: Math.max(1, Math.floor(radiusChunks)),
      key: `${Math.floor(centerChunkX)},${Math.floor(centerChunkZ)},${Math.max(1, Math.floor(radiusChunks))}`,
    };
    const existing = areaRequests.get(area.key);
    if (existing) return existing;
    // Coalesce only concurrent requests. A completed area must be fetched again
    // when the player later returns, because other players may have edited it
    // while the global terrain cursor advanced in another AOI.
    const request = fetchPages(area, onPage).finally(() => areaRequests.delete(area.key));
    areaRequests.set(area.key, request);
    return request;
  };

  const chunks = initialArea
    ? await loadArea(initialArea.centerChunkX, initialArea.centerChunkZ, initialArea.radiusChunks)
    : await fetchPages();

  return {
    chunks,
    loadArea,
    async sendBatch(batchId: string, mutations: TerrainMutation[], metadata) {
      if (mutations.length < 1 || mutations.length > 256) {
        throw new Error('Space terrain mutation batches must contain 1-256 operations.');
      }
      const requestBody: Record<string, unknown> = { batch_id: batchId, mutations };
      if (metadata?.dedupeEpoch === 1 && Number.isFinite(Number(metadata.createdAtMs))) {
        requestBody.dedupe_epoch = 1;
        requestBody.created_at_ms = Math.floor(Number(metadata.createdAtMs));
      }
      const response = await fetchImpl(`${baseUrl}/batches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.detail?.code || `HTTP_${response.status}`;
        const error: Error & { retryAfterMs?: number; permanent?: boolean } = new Error(
          `Space terrain batch was not accepted: ${code}`
        );
        if (code === 'TERRAIN_BATCH_EXPIRED') error.permanent = true;
        const retryAfter = response.headers?.get?.('Retry-After');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const retryAt = Date.parse(retryAfter);
          const retryAfterMs = Number.isFinite(seconds)
            ? seconds * 1_000
            : Number.isFinite(retryAt)
              ? Math.max(0, retryAt - Date.now())
              : NaN;
          if (Number.isFinite(retryAfterMs)) error.retryAfterMs = retryAfterMs;
        }
        throw error;
      }
      return response.json();
    }
  };
}

export function createPlayerPositionRemote(
  apiOrigin: string,
  token: string,
  worldId: string,
  fetchImpl: typeof fetch = fetch,
  _latencyMonitor?: LatencyMonitor
): PlayerPositionRemote {
  const url = `${apiOrigin}/space/api/v2/worlds/${encodeURIComponent(worldId)}/players/me/position`;
  return {
    async save(position: PlayerPositionPayload, keepalive = false) {
      const response = await fetchImpl(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(position),
        keepalive
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.detail?.code || `HTTP_${response.status}`;
        throw new Error(`Space player position was not saved: ${code}`);
      }
    }
  };
}

export async function bootstrapSpace(): Promise<ReadySpaceSession> {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new SpaceEntryError(
      'LOGIN_REQUIRED',
      '请先登录 EntropyDrop，再进入 Space。',
      '/skin/',
      '返回主站登录'
    );
  }

  const apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_BASE_URL, window.location.origin);
  const latencyMonitor = new LatencyMonitor({ apiOrigin });
  latencyMonitor.start();

  const response = await fetch(`${apiOrigin}/space/api/v2/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw entryErrorFromResponse(response.status, body);

  const payload = body as SpaceBootstrapPayload;
  if (!payload?.player?.skin_url) {
    throw new SpaceEntryError(
      'SKIN_REQUIRED',
      '进入 Space 前需要先设置角色皮肤。',
      '/skin/edit',
      '去设置角色皮肤'
    );
  }

  const [skinObjectUrl, terrainEditRemote] = await Promise.all([
    downloadSkinPng(payload.player.skin_url),
    loadTerrainEditRemote(
      apiOrigin,
      token,
      payload.world.id,
      fetch,
      latencyMonitor,
      initialTerrainStreamArea(payload.player)
    )
  ]);
  return {
    ...payload,
    api_origin: apiOrigin,
    token,
    skin_object_url: skinObjectUrl,
    terrain_edit_remote: terrainEditRemote,
    player_position_remote: createPlayerPositionRemote(apiOrigin, token, payload.world.id, fetch, latencyMonitor),
    latency_monitor: latencyMonitor
  };
}

function renderEntryError(error: unknown) {
  const entryError = error instanceof SpaceEntryError
    ? error
    : new SpaceEntryError(
        'BOOTSTRAP_FAILED',
        'Space 初始化失败，请检查网络后重试。',
        window.location.href,
        '重试'
      );
  const gate = document.getElementById('space-entry-gate');
  const status = document.getElementById('space-entry-status');
  const action = document.getElementById('space-entry-action') as HTMLAnchorElement | null;
  if (gate) gate.hidden = false;
  if (status) status.textContent = entryError.message;
  if (action) {
    action.href = entryError.actionUrl;
    action.textContent = entryError.actionLabel;
    action.hidden = false;
  }
}

export async function enterSpace(startGame: (session: ReadySpaceSession) => void | Promise<void>) {
  const gate = document.getElementById('space-entry-gate');
  const status = document.getElementById('space-entry-status');
  const action = document.getElementById('space-entry-action') as HTMLAnchorElement | null;
  if (gate) gate.hidden = false;
  if (status) status.textContent = '正在验证 EntropyDrop 账号并下载角色皮肤…';
  if (action) action.hidden = true;

  try {
    const session = await bootstrapSpace();
    if (status) status.textContent = '正在加载共享远景缓存…';
    await startGame(session);
    if (gate) gate.hidden = true;
  } catch (error) {
    renderEntryError(error);
  }
}
