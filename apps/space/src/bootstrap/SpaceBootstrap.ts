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
import {
  ensureSpaceAccessToken,
  installSpaceAuthFetchInterceptor,
} from './SpaceAuthSession.ts';
import {
  readJsonResponse,
  readResponseBytes,
  resolveSafeHttpUrl,
} from './NetworkSafety.ts';

export { LatencyMonitor, type LatencyMonitorOptions };

export const TERRAIN_STREAM_RADIUS_CHUNKS = 32;
export const TERRAIN_STREAM_TILE_CHUNKS = 8;
export const TERRAIN_STREAM_PAGE_SIZE = 64;
export const TERRAIN_STREAM_HYSTERESIS_CHUNKS = 1.5;
export const TERRAIN_STREAM_SWITCH_DEBOUNCE_MS = 500;
export const MAX_SKIN_PNG_BYTES = 256 * 1024;
const MAX_SPACE_API_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TERRAIN_PAGE_BYTES = 16 * 1024 * 1024;

export interface TerrainStreamArea {
  centerChunkX: number;
  centerChunkZ: number;
  radiusChunks: number;
  key: string;
}

export type SkinType = 'strong' | 'slim';
export type SpaceSessionMode = 'online' | 'offline';

export const OFFLINE_WORLD_ID = 'offline-sandbox-v1';
export const OFFLINE_PLAYER_POSITION_KEY = 'space.offline.player-position.v1';
const OFFLINE_WORLD_SEED = 20260827;
const OFFLINE_SKIN_URL = new URL('../../skin_D2A9EB7A.png', import.meta.url).href;

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

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isBoundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

/** Runtime boundary for the versioned bootstrap contract; TypeScript types alone do not validate JSON. */
export function parseSpaceBootstrapPayload(value: unknown): SpaceBootstrapPayload {
  const payload = value as any;
  const world = payload?.world;
  const player = payload?.player;
  const positions = [
    player?.start_x_cm,
    player?.start_y_cm,
    player?.start_z_cm,
    player?.start_yaw_q15,
  ];
  const nullablePositionsValid = positions.every(position => (
    position === null || isBoundedInteger(position, -10_000_000, 10_000_000)
  ));
  const resumePositionComplete = player?.resumed !== true || positions.every(position => typeof position === 'number');

  if (
    payload?.protocol_version !== 2
    || !isBoundedInteger(payload?.max_online_players, 1, 32)
    || payload?.queue_enabled !== true
    || !isBoundedString(payload?.websocket_url, 2048)
    || !isBoundedString(world?.id, 128)
    || !isBoundedString(world?.name, 128)
    || !isBoundedInteger(world?.seed, -2_147_483_648, 2_147_483_647)
    || !isBoundedInteger(world?.terrain_generator_version, 1, 1_000_000)
    || !isBoundedInteger(world?.terrain_revision, 0, Number.MAX_SAFE_INTEGER)
    || !isBoundedString(player?.user_id, 128)
    || !(player?.username === null || typeof player?.username === 'string')
    || !isBoundedString(player?.player_entity_id, 128)
    || !isBoundedString(player?.skin_url, 4096)
    || !['strong', 'slim'].includes(player?.skin_type)
    || typeof player?.resumed !== 'boolean'
    || !nullablePositionsValid
    || !resumePositionComplete
  ) {
    throw new Error('Invalid Space bootstrap API V2 response.');
  }
  return payload as SpaceBootstrapPayload;
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
  mode: SpaceSessionMode;
  api_origin: string;
  token: string;
  skin_object_url: string;
  terrain_edit_remote: WorldEditRemote | null;
  player_position_remote: PlayerPositionRemote;
  latency_monitor: LatencyMonitor | null;
}

export interface SpaceAdmissionStatus {
  state: 'admitted' | 'queued' | 'cancelled';
  position: number | null;
  poll_after_ms: number;
}

export interface SpaceEntryState {
  mode: SpaceSessionMode;
  queuePosition: number | null;
  onlineReady: boolean;
  cancelQueue: (() => Promise<void>) | null;
  enterOnline: (() => void) | null;
}

export interface SpaceEntryHooks {
  onStateChange?: (state: SpaceEntryState) => void;
}

export interface PreparedOnlineSpace {
  payload: SpaceBootstrapPayload;
  apiOrigin: string;
  token: string;
  skinObjectUrl: string;
  latencyMonitor: LatencyMonitor;
}

export type SpaceEntryErrorCode =
  | 'LOGIN_REQUIRED'
  | 'SKIN_REQUIRED'
  | 'SKIN_DOWNLOAD_FAILED'
  | 'BOOTSTRAP_FAILED';

export interface SpaceEntryAction {
  label: string;
  url: string;
  secondary?: boolean;
}

export class SpaceEntryError extends Error {
  readonly code: SpaceEntryErrorCode;
  readonly actionUrl: string;
  readonly actionLabel: string;
  readonly actions: SpaceEntryAction[];

  constructor(
    code: SpaceEntryErrorCode,
    message: string,
    actionUrl: string,
    actionLabel: string,
    actions?: SpaceEntryAction[]
  ) {
    super(message);
    this.name = 'SpaceEntryError';
    this.code = code;
    this.actionUrl = actionUrl;
    this.actionLabel = actionLabel;
    this.actions = actions && actions.length > 0
      ? actions
      : [{ label: actionLabel, url: actionUrl }];
  }
}

export function isZhLang(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('lang');
      if (stored) return stored.startsWith('zh');
    } catch {}
  }
  return typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('zh');
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

function createSkinRequiredActions(zh: boolean): SpaceEntryAction[] {
  return [
    { label: zh ? '选择已创建的皮肤' : 'Choose Created Skin', url: '/skin/collection' },
    { label: zh ? '上传自己的皮肤' : 'Upload Skin', url: '/skin/collection' },
    { label: zh ? '生成皮肤' : 'Generate Skin', url: '/skin/generate' },
    { label: zh ? '进入离线模式' : 'Enter Offline Mode', url: '?mode=offline', secondary: true }
  ];
}

function entryErrorFromResponse(status: number, body: any) {
  const detail = body?.detail;
  const zh = isZhLang();
  if (status === 401 || status === 403) {
    return new SpaceEntryError(
      'LOGIN_REQUIRED',
      zh ? '进入 Space 前请先登录 EntropyDrop 账号。' : 'Please log in to EntropyDrop before entering Space.',
      '/skin/',
      zh ? '前往登录' : 'Log In',
      [
        { label: zh ? '前往登录' : 'Log In', url: '/skin/' },
        { label: zh ? '进入离线模式' : 'Enter Offline Mode', url: '?mode=offline', secondary: true }
      ]
    );
  }
  if (status === 409 && detail?.code === 'SKIN_REQUIRED') {
    return new SpaceEntryError(
      'SKIN_REQUIRED',
      detail.message || (zh
        ? '进入 Space 前需要先设置角色皮肤。您可以选择已创建的皮肤、上传自己的皮肤，或直接生成新皮肤：'
        : 'You must set a character skin before entering Space. You can choose from your created skins, upload your own skin, or generate a new skin:'),
      detail.action_url || '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }
  return new SpaceEntryError(
    'BOOTSTRAP_FAILED',
    typeof detail === 'string'
      ? detail
      : (zh ? '无法加载 Space 玩家资料，请稍后重试。' : 'Could not load Space player profile. Please try again later.'),
    window.location.href,
    zh ? '重试' : 'Retry',
    [
      { label: zh ? '重试' : 'Retry', url: window.location.href },
      { label: zh ? '进入离线模式' : 'Enter Offline Mode', url: '?mode=offline', secondary: true }
    ]
  );
}

async function downloadSkinPng(url: string) {
  const zh = isZhLang();
  let response: Response;
  try {
    const safeUrl = resolveSafeHttpUrl(url, window.location.href);
    response = await fetch(safeUrl.toString(), {
      mode: 'cors',
      cache: 'force-cache',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      zh ? '下载角色皮肤失败，请重新配置您的皮肤。' : 'Failed to download character skin PNG. Please reconfigure your skin.',
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }

  if (!response.ok) {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      zh ? `下载角色皮肤失败 (${response.status})，请重新配置您的皮肤。` : `Failed to download character skin PNG (${response.status}).`,
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await readResponseBytes(response, MAX_SKIN_PNG_BYTES);
  } catch {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      zh ? '角色皮肤文件无效或超过 256 KiB，请重新配置。' : 'Character skin is invalid or exceeds the 256 KiB safety limit.',
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }
  if (!hasPngSignature(bytes)) {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      zh ? '角色皮肤不是有效的 PNG 格式图片，请重新配置。' : 'Character skin is not a valid PNG file. Please reconfigure your skin.',
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }

  const pngBuffer = new Uint8Array(bytes.byteLength);
  pngBuffer.set(bytes);
  const blob = new Blob([pngBuffer.buffer], { type: 'image/png' });
  try {
    const bitmap = await createImageBitmap(blob);
    const validSize = bitmap.width === 64 && bitmap.height === 64;
    bitmap.close();
    if (!validSize) throw new Error('invalid dimensions');
  } catch {
    throw new SpaceEntryError(
      'SKIN_DOWNLOAD_FAILED',
      zh ? '角色皮肤必须是可解析的 64×64 PNG 图片，请重新配置。' : 'Character skin must be a decodable 64×64 PNG. Please reconfigure your skin.',
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
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
      const body = await readJsonResponse<any>(response, MAX_TERRAIN_PAGE_BYTES).catch(() => null);
      if (!response.ok) {
        throw new SpaceEntryError(
          response.status === 401 || response.status === 403 ? 'LOGIN_REQUIRED' : 'BOOTSTRAP_FAILED',
          'Could not load Space world edits. Please check your network connection.',
          response.status === 401 || response.status === 403 ? '/skin/' : retryUrl,
          response.status === 401 || response.status === 403 ? 'Log In' : 'Retry'
        );
      }
      if (!Array.isArray(body?.chunks)) {
        throw new SpaceEntryError(
          'BOOTSTRAP_FAILED',
          'Invalid Space world edits response format.',
          retryUrl,
          'Retry'
        );
      }
      const pageChunks = body.chunks as TerrainEditChunk[];
      chunks.push(...pageChunks);
      onPage?.(pageChunks);
      const nextCursor = typeof body.next_cursor === 'string' ? body.next_cursor : null;
      if (nextCursor && seenCursors.has(nextCursor)) {
        throw new SpaceEntryError(
          'BOOTSTRAP_FAILED',
          'Duplicate cursor in Space world edits pagination.',
          retryUrl,
          'Retry'
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
        const body = await readJsonResponse<any>(response, MAX_SPACE_API_RESPONSE_BYTES).catch(() => null);
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
      return readJsonResponse(response, MAX_SPACE_API_RESPONSE_BYTES);
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
        const body = await readJsonResponse<any>(response, MAX_SPACE_API_RESPONSE_BYTES).catch(() => null);
        const code = body?.detail?.code || `HTTP_${response.status}`;
        throw new Error(`Space player position was not saved: ${code}`);
      }
    }
  };
}

async function prepareOnlineSpace(): Promise<PreparedOnlineSpace> {
  const apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_BASE_URL, window.location.origin);
  installSpaceAuthFetchInterceptor(apiOrigin);
  const token = await ensureSpaceAccessToken(apiOrigin);
  if (!token) {
    throw new SpaceEntryError(
      'LOGIN_REQUIRED',
      'Please log in to EntropyDrop before entering Space.',
      '/skin/',
      'Log In'
    );
  }

  const latencyMonitor = new LatencyMonitor({ apiOrigin });

  const response = await fetch(`${apiOrigin}/space/api/v2/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  const body = await readJsonResponse<any>(response, MAX_SPACE_API_RESPONSE_BYTES).catch(() => null);
  if (!response.ok) throw entryErrorFromResponse(response.status, body);

  const payload = parseSpaceBootstrapPayload(body);
  if (!payload?.player?.skin_url) {
    const zh = isZhLang();
    throw new SpaceEntryError(
      'SKIN_REQUIRED',
      zh
        ? '进入 Space 前需要先设置角色皮肤。您可以选择已创建的皮肤、上传自己的皮肤，或直接生成新皮肤：'
        : 'You must set a character skin before entering Space. You can choose from your created skins, upload your own skin, or generate a new skin:',
      '/skin/collection',
      zh ? '选择已创建的皮肤' : 'Choose Created Skin',
      createSkinRequiredActions(zh)
    );
  }

  const skinObjectUrl = await downloadSkinPng(payload.player.skin_url);
  return { payload, apiOrigin, token, skinObjectUrl, latencyMonitor };
}

export async function requestSpaceAdmission(
  apiOrigin: string,
  token: string,
  worldId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SpaceAdmissionStatus> {
  const response = await fetchImpl(
    `${apiOrigin}/space/api/v2/worlds/${encodeURIComponent(worldId)}/admission`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal
    }
  );
  const body = await readJsonResponse<any>(response, MAX_SPACE_API_RESPONSE_BYTES).catch(() => null);
  if (!response.ok) throw entryErrorFromResponse(response.status, body);
  if (!body || !['admitted', 'queued'].includes(body.state)) {
    throw new SpaceEntryError(
      'BOOTSTRAP_FAILED',
      'Invalid Space queue status. Please try again later.',
      window.location.href,
      'Retry'
    );
  }
  return {
    state: body.state,
    position: body.state === 'queued' ? Math.max(1, Number(body.position) || 1) : null,
    poll_after_ms: Math.max(500, Math.min(5_000, Number(body.poll_after_ms) || 2_000))
  };
}

export async function cancelSpaceAdmission(
  apiOrigin: string,
  token: string,
  worldId: string,
  fetchImpl: typeof fetch = fetch,
  keepalive = false
): Promise<void> {
  const response = await fetchImpl(
    `${apiOrigin}/space/api/v2/worlds/${encodeURIComponent(worldId)}/admission`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      keepalive
    }
  );
  if (!response.ok) {
    throw new Error(`Space queue cancellation failed with HTTP ${response.status}`);
  }
}

async function completeOnlineSpace(prepared: PreparedOnlineSpace): Promise<ReadySpaceSession> {
  const { payload, apiOrigin, token, skinObjectUrl, latencyMonitor } = prepared;
  latencyMonitor.start();
  let terrainEditRemote: WorldEditRemote;
  try {
    terrainEditRemote = await loadTerrainEditRemote(
      apiOrigin,
      token,
      payload.world.id,
      fetch,
      latencyMonitor,
      initialTerrainStreamArea(payload.player)
    );
  } catch (error) {
    latencyMonitor.stop();
    throw error;
  }
  return {
    ...payload,
    mode: 'online',
    api_origin: apiOrigin,
    token,
    skin_object_url: skinObjectUrl,
    terrain_edit_remote: terrainEditRemote,
    player_position_remote: createPlayerPositionRemote(apiOrigin, token, payload.world.id, fetch, latencyMonitor),
    latency_monitor: latencyMonitor
  };
}

function readOfflinePlayerPosition(): PlayerPositionPayload | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_PLAYER_POSITION_KEY) || 'null');
    if (
      Number.isFinite(parsed?.x_cm)
      && Number.isFinite(parsed?.y_cm)
      && Number.isFinite(parsed?.z_cm)
      && Number.isFinite(parsed?.yaw_q15)
    ) {
      return {
        x_cm: Number(parsed.x_cm),
        y_cm: Number(parsed.y_cm),
        z_cm: Number(parsed.z_cm),
        yaw_q15: Number(parsed.yaw_q15),
        pitch_q15: Number(parsed.pitch_q15) || 0
      };
    }
  } catch {
    // A corrupt offline checkpoint is isolated and safe to replace.
  }
  return null;
}

function createOfflinePlayerPositionRemote(): PlayerPositionRemote {
  return {
    async save(position: PlayerPositionPayload): Promise<void> {
      try {
        localStorage.setItem(OFFLINE_PLAYER_POSITION_KEY, JSON.stringify(position));
      } catch {
        // Private browsing may make storage unavailable; offline play still works.
      }
    }
  };
}

export function createOfflineSpaceSession(
  prepared: PreparedOnlineSpace | null = null
): ReadySpaceSession {
  const savedPosition = readOfflinePlayerPosition();
  const sourcePlayer = prepared?.payload.player;
  const pageOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const configuredApiBase = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  const apiOrigin = prepared?.apiOrigin
    || resolveApiOrigin(configuredApiBase, pageOrigin);
  return {
    protocol_version: 2,
    max_online_players: 32,
    queue_enabled: true,
    websocket_url: '',
    world: {
      id: OFFLINE_WORLD_ID,
      name: 'Offline Sandbox',
      seed: OFFLINE_WORLD_SEED,
      terrain_generator_version: 1,
      terrain_revision: 0
    },
    player: {
      user_id: sourcePlayer?.user_id || 'offline-player',
      username: sourcePlayer?.username || 'Offline Player',
      is_admin: false,
      player_entity_id: 'offline-player',
      skin_url: sourcePlayer?.skin_url || OFFLINE_SKIN_URL,
      skin_type: sourcePlayer?.skin_type || 'strong',
      start_x_cm: savedPosition?.x_cm ?? null,
      start_y_cm: savedPosition?.y_cm ?? null,
      start_z_cm: savedPosition?.z_cm ?? null,
      start_yaw_q15: savedPosition?.yaw_q15 ?? null,
      resumed: savedPosition !== null
    },
    mode: 'offline',
    api_origin: apiOrigin,
    token: prepared?.token || '',
    skin_object_url: prepared?.skinObjectUrl || OFFLINE_SKIN_URL,
    terrain_edit_remote: null,
    player_position_remote: createOfflinePlayerPositionRemote(),
    latency_monitor: null
  };
}

export async function bootstrapSpace(): Promise<ReadySpaceSession> {
  const prepared = await prepareOnlineSpace();
  const admission = await requestSpaceAdmission(
    prepared.apiOrigin,
    prepared.token,
    prepared.payload.world.id
  );
  if (admission.state !== 'admitted') {
    throw new SpaceEntryError(
      'BOOTSTRAP_FAILED',
      `Space Queue #${admission.position}`,
      `${window.location.pathname}?mode=offline`,
      'Enter Offline Mode'
    );
  }
  return completeOnlineSpace(prepared);
}

function renderEntryError(error: unknown) {
  const zh = isZhLang();
  const entryError = error instanceof SpaceEntryError
    ? error
    : new SpaceEntryError(
        'BOOTSTRAP_FAILED',
        zh ? 'Space 初始化失败，请检查网络后重试。' : 'Space initialization failed. Please check your network and try again.',
        window.location.href,
        zh ? '重试' : 'Retry',
        [
          { label: zh ? '重试' : 'Retry', url: window.location.href },
          { label: zh ? '进入离线模式' : 'Enter Offline Mode', url: '?mode=offline', secondary: true }
        ]
      );
  const gate = document.getElementById('space-entry-gate');
  const status = document.getElementById('space-entry-status');
  const actionContainer = document.getElementById('space-entry-actions');
  const action = document.getElementById('space-entry-action') as HTMLAnchorElement | null;
  if (gate) gate.hidden = false;
  if (status) status.textContent = entryError.message;
  if (actionContainer) {
    actionContainer.innerHTML = '';
    for (const act of entryError.actions) {
      const a = document.createElement('a');
      a.className = `space-entry-action ${act.secondary ? 'secondary' : ''}`.trim();
      a.href = act.url;
      a.textContent = act.label;
      actionContainer.appendChild(a);
    }
  } else if (action) {
    action.href = entryError.actionUrl;
    action.textContent = entryError.actionLabel;
    action.hidden = false;
  }
}

export async function enterSpace(
  startGame: (session: ReadySpaceSession) => void | Promise<void>,
  hooks: SpaceEntryHooks = {}
) {
  const gate = document.getElementById('space-entry-gate');
  const status = document.getElementById('space-entry-status');
  const action = document.getElementById('space-entry-action') as HTMLAnchorElement | null;
  if (gate) gate.hidden = false;
  if (status) status.textContent = 'Verifying EntropyDrop account and downloading character skin…';
  if (action) action.hidden = true;

  try {
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    if (requestedMode === 'offline') {
      const session = createOfflineSpaceSession();
      hooks.onStateChange?.({
        mode: 'offline',
        queuePosition: null,
        onlineReady: false,
        cancelQueue: null,
        enterOnline: null
      });
      if (status) status.textContent = 'Loading offline world…';
      await startGame(session);
      if (gate) gate.hidden = true;
      return;
    }

    const prepared = await prepareOnlineSpace();
    const admission = await requestSpaceAdmission(
      prepared.apiOrigin,
      prepared.token,
      prepared.payload.world.id
    );
    if (admission.state === 'admitted') {
      const session = await completeOnlineSpace(prepared);
      hooks.onStateChange?.({
        mode: 'online',
        queuePosition: null,
        onlineReady: false,
        cancelQueue: null,
        enterOnline: null
      });
      if (status) status.textContent = 'Loading shared distant terrain cache…';
      await startGame(session);
      if (gate) gate.hidden = true;
      return;
    }

    let queueActive = true;
    let queueCancelling = false;
    let onlineReady = false;
    let pollAfterMs = admission.poll_after_ms;
    let pollController: AbortController | null = null;
    let currentPoll: Promise<SpaceAdmissionStatus> | null = null;
    let cancelBeforeUnload: (() => void) | null = null;
    const worldId = prepared.payload.world.id;
    const cancelQueue = async () => {
      if (!queueActive || queueCancelling) return;
      queueCancelling = true;
      pollController?.abort();
      await currentPoll?.catch(() => undefined);
      try {
        await cancelSpaceAdmission(prepared.apiOrigin, prepared.token, worldId);
      } catch (error) {
        queueCancelling = false;
        throw error;
      }
      queueActive = false;
      onlineReady = false;
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'offline');
      window.history.replaceState(null, '', url);
      hooks.onStateChange?.({
        mode: 'offline',
        queuePosition: null,
        onlineReady: false,
        cancelQueue: null,
        enterOnline: null
      });
    };
    const enterOnline = () => {
      if (!queueActive || queueCancelling || !onlineReady) return;
      queueActive = false;
      if (cancelBeforeUnload) {
        window.removeEventListener('pagehide', cancelBeforeUnload);
      }
      window.location.reload();
    };
    hooks.onStateChange?.({
      mode: 'offline',
      queuePosition: admission.position,
      onlineReady: false,
      cancelQueue,
      enterOnline: null
    });
    if (status) status.textContent = `Space Queue #${admission.position}, entering offline world…`;
    await startGame(createOfflineSpaceSession(prepared));
    if (gate) gate.hidden = true;

    cancelBeforeUnload = () => {
      if (!queueActive) return;
      queueActive = false;
      void cancelSpaceAdmission(
        prepared.apiOrigin,
        prepared.token,
        worldId,
        fetch,
        true
      ).catch(() => undefined);
    };
    window.addEventListener('pagehide', cancelBeforeUnload, { once: true });

    void (async () => {
      while (queueActive) {
        await new Promise(resolve => setTimeout(resolve, pollAfterMs));
        if (!queueActive) break;
        if (queueCancelling) continue;
        let poll: Promise<SpaceAdmissionStatus> | null = null;
        try {
          pollController = new AbortController();
          poll = requestSpaceAdmission(
            prepared.apiOrigin,
            prepared.token,
            worldId,
            fetch,
            pollController.signal
          );
          currentPoll = poll;
          const next = await poll;
          if (!queueActive || queueCancelling) continue;
          pollAfterMs = next.poll_after_ms;
          if (next.state === 'admitted') {
            onlineReady = true;
            hooks.onStateChange?.({
              mode: 'offline',
              queuePosition: null,
              onlineReady: true,
              cancelQueue,
              enterOnline
            });
            continue;
          }
          onlineReady = false;
          hooks.onStateChange?.({
            mode: 'offline',
            queuePosition: next.position,
            onlineReady: false,
            cancelQueue,
            enterOnline: null
          });
        } catch {
          // Stay in the isolated offline world and retry without disrupting play.
        } finally {
          if (currentPoll === poll) currentPoll = null;
          pollController = null;
        }
      }
    })();
  } catch (error) {
    renderEntryError(error);
  }
}
