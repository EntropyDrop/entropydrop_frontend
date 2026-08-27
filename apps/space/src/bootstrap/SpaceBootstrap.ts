import type {
  TerrainEditChunk,
  TerrainMutation,
  WorldEditRemote,
} from '../engine/voxel/WorldEditPersistence.ts';

export type MinecraftSkinModel = 'strong' | 'slim';

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
  };
  player: {
    user_id: string;
    username: string | null;
    player_entity_id: string;
    minecraft_skin_url: string;
    minecraft_skin_model: MinecraftSkinModel;
    spawn_x_cm: number;
    spawn_y_cm: number;
    spawn_z_cm: number;
    spawn_yaw_q15: number;
  };
}

export interface ReadySpaceSession extends SpaceBootstrapPayload {
  skin_object_url: string;
  terrain_edit_remote: WorldEditRemote;
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
  fetchImpl: typeof fetch = fetch
): Promise<WorldEditRemote> {
  const baseUrl = `${apiOrigin}/space/api/v2/worlds/${encodeURIComponent(worldId)}/terrain-edits`;
  const retryUrl = typeof window === 'undefined' ? '/' : window.location.href;
  const chunks: TerrainEditChunk[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const url = new URL(
      baseUrl,
      typeof window === 'undefined' ? 'http://localhost' : window.location.href
    );
    url.searchParams.set('limit', '256');
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
    chunks.push(...body.chunks);
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

  return {
    chunks,
    async sendBatch(batchId: string, mutations: TerrainMutation[]) {
      if (mutations.length < 1 || mutations.length > 256) {
        throw new Error('Space terrain mutation batches must contain 1-256 operations.');
      }
      const response = await fetchImpl(`${baseUrl}/batches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batch_id: batchId, mutations })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.detail?.code || `HTTP_${response.status}`;
        throw new Error(`Space terrain batch was not accepted: ${code}`);
      }
      return response.json();
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
  if (!payload?.player?.minecraft_skin_url) {
    throw new SpaceEntryError(
      'SKIN_REQUIRED',
      '进入 Space 前需要先设置角色皮肤。',
      '/skin/edit',
      '去设置角色皮肤'
    );
  }

  const [skinObjectUrl, terrainEditRemote] = await Promise.all([
    downloadSkinPng(payload.player.minecraft_skin_url),
    loadTerrainEditRemote(apiOrigin, token, payload.world.id)
  ]);
  return {
    ...payload,
    skin_object_url: skinObjectUrl,
    terrain_edit_remote: terrainEditRemote
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
