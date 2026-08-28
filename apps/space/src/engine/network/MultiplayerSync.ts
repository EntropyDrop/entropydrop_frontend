import { decode, encode } from '@msgpack/msgpack';
import { encodePlayerPosition } from '../../bootstrap/SpaceBootstrap.ts';

export interface RemotePlayerInfo {
  user_id: string;
  username: string;
  player_entity_id: string;
  minecraft_skin_url: string;
  minecraft_skin_model: 'strong' | 'slim';
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  is_self: boolean;
  updated_at: string | null;
}

export interface TerrainChunkUpdate {
  chunk_x: number;
  chunk_z: number;
  revision: number;
  standard: Array<[number, number, number, number, number]>;
  micro: Array<[number, number, number, number, string?]>;
}

export interface MultiplayerSyncOptions {
  apiOrigin: string;
  token: string;
  worldId: string;
  currentUserId: string;
  websocketUrl?: string;
  poseIntervalMs?: number;
  terrainPollIntervalMs?: number;
  // Transitional alias retained for callers/tests made before WebSocket sync.
  heartbeatIntervalMs?: number;
  onPlayersUpdate?: (players: RemotePlayerInfo[]) => void;
  onTerrainUpdate?: (chunks: TerrainChunkUpdate[]) => void;
}

const SPACE_REALTIME_PROTOCOL = 'space-relay-v1';
const DEFAULT_POSE_INTERVAL_MS = 50;
const DEFAULT_TERRAIN_POLL_INTERVAL_MS = 1000;
const IDLE_POSE_INTERVAL_MS = 1000;
const MAX_WEBSOCKET_BUFFERED_BYTES = 64 * 1024;

export function resolveWebSocketUrl(configuredUrl: string, apiOrigin: string) {
  const resolved = new URL(configuredUrl, `${apiOrigin.replace(/\/+$/, '')}/`);
  if (resolved.protocol === 'http:') resolved.protocol = 'ws:';
  if (resolved.protocol === 'https:') resolved.protocol = 'wss:';
  if (resolved.protocol !== 'ws:' && resolved.protocol !== 'wss:') {
    throw new Error(`Unsupported Space WebSocket protocol: ${resolved.protocol}`);
  }
  return resolved.toString();
}

export class MultiplayerSync {
  private apiOrigin: string;
  private token: string;
  private worldId: string;
  private currentUserId: string;
  private websocketUrl: string | null;
  private poseIntervalMs: number;
  private terrainPollIntervalMs: number;
  private terrainTimer: ReturnType<typeof setTimeout> | null = null;
  private poseTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private websocket: WebSocket | null = null;
  private websocketReady = false;
  private terrainInFlight = false;
  private terrainPollRequested = false;
  private isRunning = false;
  private sinceTerrainRevision = 0;
  private poseSequence = 0;
  private lastPoseKey = '';
  private lastPoseSentAt = 0;
  private reconnectDelayMs = 500;
  private lastErrorLogAt = 0;

  public getPlayerPosition: (() => { x: number; y: number; z: number; yaw: number; pitch?: number }) | null = null;
  public onPlayersUpdate: ((players: RemotePlayerInfo[]) => void) | null = null;
  public onTerrainUpdate: ((chunks: TerrainChunkUpdate[]) => void) | null = null;

  constructor(options: MultiplayerSyncOptions) {
    this.apiOrigin = options.apiOrigin.replace(/\/+$/, '');
    this.token = options.token;
    this.worldId = options.worldId;
    this.currentUserId = options.currentUserId;
    this.websocketUrl = options.websocketUrl || null;
    this.poseIntervalMs = options.poseIntervalMs ?? DEFAULT_POSE_INTERVAL_MS;
    this.terrainPollIntervalMs = options.terrainPollIntervalMs
      ?? options.heartbeatIntervalMs
      ?? DEFAULT_TERRAIN_POLL_INTERVAL_MS;
    this.onPlayersUpdate = options.onPlayersUpdate || null;
    this.onTerrainUpdate = options.onTerrainUpdate || null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleTerrainPoll(50);
    if (this.websocketUrl && typeof WebSocket !== 'undefined') {
      void this.connectWebSocket();
      this.poseTimer = setInterval(() => this.sendLatestPose(), this.poseIntervalMs);
    }
  }

  stop() {
    this.isRunning = false;
    this.websocketReady = false;
    if (this.terrainTimer) clearTimeout(this.terrainTimer);
    if (this.poseTimer) clearInterval(this.poseTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.terrainTimer = null;
    this.poseTimer = null;
    this.reconnectTimer = null;
    const socket = this.websocket;
    this.websocket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encode({ type: 'leave' }));
      }
      socket.close(1000, 'Space client stopped');
    }
  }

  setSinceTerrainRevision(rev: number) {
    const numericRevision = Number(rev);
    if (Number.isFinite(numericRevision) && numericRevision >= 0) {
      this.sinceTerrainRevision = Math.max(this.sinceTerrainRevision, Math.floor(numericRevision));
    }
  }

  private logTemporaryFailure(message: string, error: unknown) {
    const now = Date.now();
    if (now - this.lastErrorLogAt >= 10_000) {
      this.lastErrorLogAt = now;
      console.warn(message, error);
    }
  }

  private scheduleTerrainPoll(delayMs = this.terrainPollIntervalMs) {
    if (!this.isRunning) return;
    if (this.terrainTimer) clearTimeout(this.terrainTimer);
    this.terrainTimer = setTimeout(() => void this.performTerrainPoll(), delayMs);
  }

  private async performTerrainPoll() {
    if (!this.isRunning) return;
    if (this.terrainInFlight) {
      this.terrainPollRequested = true;
      return;
    }

    this.terrainInFlight = true;
    const includePlayers = !this.websocketReady;
    try {
      const body: Record<string, number | boolean> = {
        since_terrain_revision: this.sinceTerrainRevision,
        include_players: includePlayers
      };
      if (includePlayers) {
        const pose = this.getPlayerPosition?.();
        if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z)) {
          Object.assign(body, encodePlayerPosition(pose, pose.yaw || 0, pose.pitch || 0));
        }
      }

      const response = await fetch(
        `${this.apiOrigin}/space/api/v2/worlds/${encodeURIComponent(this.worldId)}/heartbeat`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        throw new Error(`Space terrain synchronization failed with HTTP ${response.status}`);
      }
      const data = await response.json();
      if (includePlayers && Array.isArray(data?.players)) {
        this.onPlayersUpdate?.(data.players);
      }
      if (Array.isArray(data?.terrain_chunks) && data.terrain_chunks.length > 0) {
        this.onTerrainUpdate?.(data.terrain_chunks);
      }
      if (Number.isFinite(data?.max_terrain_revision)) {
        this.sinceTerrainRevision = Math.max(
          this.sinceTerrainRevision,
          Number(data.max_terrain_revision)
        );
      }
    } catch (error) {
      this.logTemporaryFailure('Space terrain synchronization is temporarily unavailable.', error);
    } finally {
      this.terrainInFlight = false;
      const requested = this.terrainPollRequested;
      this.terrainPollRequested = false;
      if (this.isRunning) this.scheduleTerrainPoll(requested ? 0 : this.terrainPollIntervalMs);
    }
  }

  private async connectWebSocket() {
    if (!this.isRunning || !this.websocketUrl || this.websocket) return;
    try {
      const ticketResponse = await fetch(
        `${this.apiOrigin}/space/api/v2/worlds/${encodeURIComponent(this.worldId)}/join-ticket`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json'
          }
        }
      );
      if (!ticketResponse.ok) {
        throw new Error(`Space join ticket failed with HTTP ${ticketResponse.status}`);
      }
      const ticketData = await ticketResponse.json();
      if (!this.isRunning) return;
      const ticket = String(ticketData?.ticket || '');
      if (!ticket) throw new Error('Space join ticket response did not include a ticket');
      const url = resolveWebSocketUrl(
        String(ticketData?.websocket_url || this.websocketUrl),
        this.apiOrigin
      );
      const socket = new WebSocket(url, SPACE_REALTIME_PROTOCOL);
      socket.binaryType = 'arraybuffer';
      this.websocket = socket;

      socket.onopen = () => {
        if (this.websocket !== socket) return;
        socket.send(encode({ type: 'hello', ticket }));
      };
      socket.onmessage = event => {
        if (this.websocket !== socket || !(event.data instanceof ArrayBuffer)) return;
        this.handleRealtimeMessage(decode(new Uint8Array(event.data)));
      };
      socket.onerror = () => {
        if (this.websocket === socket) socket.close();
      };
      socket.onclose = () => {
        if (this.websocket !== socket) return;
        this.websocket = null;
        this.websocketReady = false;
        if (this.isRunning) this.scheduleReconnect();
      };
    } catch (error) {
      this.websocket = null;
      this.websocketReady = false;
      this.logTemporaryFailure('Space realtime connection is temporarily unavailable.', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.isRunning || this.reconnectTimer) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(10_000, this.reconnectDelayMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectWebSocket();
    }, delay);
  }

  private handleRealtimeMessage(decoded: unknown) {
    if (!decoded || typeof decoded !== 'object') return;
    const message = decoded as Record<string, any>;
    if (message.type === 'hello') {
      this.websocketReady = true;
      this.reconnectDelayMs = 500;
      this.lastPoseKey = '';
      this.sendLatestPose(true);
      return;
    }
    if (message.type === 'terrain') {
      const revision = Number(message.terrain_revision);
      if (Number.isFinite(revision) && revision > this.sinceTerrainRevision) {
        this.terrainPollRequested = true;
        void this.performTerrainPoll();
      }
      return;
    }
    if (message.type !== 'state' || !Array.isArray(message.players)) return;
    const players = message.players.map((player: any): RemotePlayerInfo => ({
      user_id: String(player.user_id || ''),
      username: String(player.username || 'Player'),
      player_entity_id: String(player.player_entity_id || player.user_id || ''),
      minecraft_skin_url: String(player.minecraft_skin_url || '/skin/default.png'),
      minecraft_skin_model: player.minecraft_skin_model === 'slim' ? 'slim' : 'strong',
      x: Number(player.x_cm) / 100,
      y: Number(player.y_cm) / 100,
      z: Number(player.z_cm) / 100,
      yaw: (Number(player.yaw_q15) / 32767) * Math.PI,
      pitch: (Number(player.pitch_q15 || 0) / 32767) * Math.PI,
      is_self: player.is_self === true || player.user_id === this.currentUserId,
      updated_at: typeof player.updated_at === 'string' ? player.updated_at : null
    }));
    this.onPlayersUpdate?.(players);
  }

  private sendLatestPose(force = false) {
    const socket = this.websocket;
    if (!this.websocketReady || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_WEBSOCKET_BUFFERED_BYTES) return;
    const pose = this.getPlayerPosition?.();
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z)) return;
    const encoded = encodePlayerPosition(pose, pose.yaw || 0, pose.pitch || 0);
    const poseKey = [
      encoded.x_cm,
      encoded.y_cm,
      encoded.z_cm,
      encoded.yaw_q15,
      encoded.pitch_q15 || 0
    ].join(',');
    const now = performance.now();
    if (!force && poseKey === this.lastPoseKey && now - this.lastPoseSentAt < IDLE_POSE_INTERVAL_MS) {
      return;
    }
    this.lastPoseKey = poseKey;
    this.lastPoseSentAt = now;
    this.poseSequence += 1;
    socket.send(encode({
      type: 'pose',
      sequence: this.poseSequence,
      ...encoded
    }));
  }
}
