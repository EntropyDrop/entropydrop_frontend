import { wrapX, wrapZ } from '../torus/TorusWorld.ts';

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
  heartbeatIntervalMs?: number;
  onPlayersUpdate?: (players: RemotePlayerInfo[]) => void;
  onTerrainUpdate?: (chunks: TerrainChunkUpdate[]) => void;
}

export class MultiplayerSync {
  private apiOrigin: string;
  private token: string;
  private worldId: string;
  private currentUserId: string;
  private heartbeatIntervalMs: number;
  private timer: any = null;
  private inFlight = false;
  private isRunning = false;
  private sinceTerrainRevision = 0;
  private lastErrorLogAt = 0;

  public getPlayerPosition: (() => { x: number; y: number; z: number; yaw: number }) | null = null;
  public onPlayersUpdate: ((players: RemotePlayerInfo[]) => void) | null = null;
  public onTerrainUpdate: ((chunks: TerrainChunkUpdate[]) => void) | null = null;

  constructor(options: MultiplayerSyncOptions) {
    this.apiOrigin = options.apiOrigin.replace(/\/+$/, '');
    this.token = options.token;
    this.worldId = options.worldId;
    this.currentUserId = options.currentUserId;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 300;
    this.onPlayersUpdate = options.onPlayersUpdate || null;
    this.onTerrainUpdate = options.onTerrainUpdate || null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextHeartbeat(50);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setSinceTerrainRevision(rev: number) {
    const numericRevision = Number(rev);
    if (Number.isFinite(numericRevision) && numericRevision >= 0) {
      this.sinceTerrainRevision = Math.max(this.sinceTerrainRevision, Math.floor(numericRevision));
    }
  }

  private scheduleNextHeartbeat(delayMs = this.heartbeatIntervalMs) {
    if (!this.isRunning) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.performHeartbeat();
    }, delayMs);
  }

  private async performHeartbeat() {
    if (!this.isRunning) return;
    if (this.inFlight) {
      this.scheduleNextHeartbeat(this.heartbeatIntervalMs);
      return;
    }

    this.inFlight = true;
    try {
      const pose = this.getPlayerPosition?.();
      const body: any = {
        since_terrain_revision: this.sinceTerrainRevision
      };

      if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z)) {
        body.x_cm = Math.round(wrapX(pose.x) * 100);
        body.y_cm = Math.round(pose.y * 100);
        body.z_cm = Math.round(wrapZ(pose.z) * 100);
        body.yaw_q15 = Math.max(-32767, Math.min(32767, Math.round((pose.yaw / Math.PI) * 32767)));
      }

      const url = `${this.apiOrigin}/space/api/v2/worlds/${encodeURIComponent(this.worldId)}/heartbeat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Space multiplayer heartbeat failed with HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data) {
        if (Array.isArray(data.players)) {
          this.onPlayersUpdate?.(data.players);
        }
        if (Array.isArray(data.terrain_chunks) && data.terrain_chunks.length > 0) {
          this.onTerrainUpdate?.(data.terrain_chunks);
        }
        if (Number.isFinite(data.max_terrain_revision)) {
          this.sinceTerrainRevision = Math.max(this.sinceTerrainRevision, Number(data.max_terrain_revision));
        }
      }
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorLogAt >= 10_000) {
        this.lastErrorLogAt = now;
        console.warn('Space multiplayer sync is temporarily unavailable.', err);
      }
    } finally {
      this.inFlight = false;
      if (this.isRunning) {
        this.scheduleNextHeartbeat(this.heartbeatIntervalMs);
      }
    }
  }
}
