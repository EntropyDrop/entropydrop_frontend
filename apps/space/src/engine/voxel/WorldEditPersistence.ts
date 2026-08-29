import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from './Chunk.ts';
import { MICRO_DIVISIONS } from './MicroVoxelLayer.ts';
import {
  TORUS_SIZE_X,
  TORUS_SIZE_Z,
  wrapMicroX,
  wrapMicroZ,
  wrapX,
  wrapZ,
} from '../torus/TorusWorld.ts';
import type { SpaceStorage } from '../storage/BrowserStorage.ts';

const STORAGE_SCHEMA_VERSION = 2;
const STORAGE_PREFIX = 'space.world-edits.v2';
const LEGACY_STORAGE_PREFIX = 'space.world-edits.v1';
const DEFAULT_SAVE_DELAY_MS = 75;
const REMOTE_RETRY_DELAY_MS = 2_000;
const MAX_MUTATIONS_PER_BATCH = 256;
const MAX_STORED_STANDARD_EDITS = 250_000;
const MAX_STORED_MICRO_EDITS = 500_000;

export interface WorldEditStorage extends SpaceStorage {}

export type TerrainMutation =
  | { kind: 'set_standard'; x: number; y: number; z: number; block: number; color: number }
  | { kind: 'set_micro'; mx: number; my: number; mz: number; color: number; part?: string | null }
  | { kind: 'remove_micro'; mx: number; my: number; mz: number }
  | { kind: 'clear_micro_cell'; x: number; y: number; z: number };

export interface TerrainEditChunk {
  chunk_x: number;
  chunk_z: number;
  revision: number;
  standard: unknown[];
  micro: unknown[];
}

export interface WorldEditRemote {
  chunks: TerrainEditChunk[];
  sendBatch(batchId: string, mutations: TerrainMutation[]): Promise<unknown>;
}

export interface WorldEditPersistenceOptions {
  worldId: string;
  storage?: WorldEditStorage | null;
  saveDelayMs?: number;
  remote?: WorldEditRemote | null;
}

export interface PersistedStandardEdit {
  x: number;
  y: number;
  z: number;
  block: number;
  color: number;
}

export interface PersistedMicroEdit {
  mx: number;
  my: number;
  mz: number;
  color: number;
  part: string | null;
}

interface PersistedMutationBatch {
  batchId: string;
  mutations: TerrainMutation[];
}

function standardKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function microKey(mx: number, my: number, mz: number) {
  return `${mx},${my},${mz}`;
}

function chunkKeyForWorldCell(x: number, z: number) {
  return `${Math.floor(x / CHUNK_SIZE_X)},${Math.floor(z / CHUNK_SIZE_Z)}`;
}

function finiteInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

function resolveDefaultStorage(): WorldEditStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function createBatchId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker => {
    const random = Math.floor(Math.random() * 16);
    const value = marker === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function worldEditStorageKey(worldId: string) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(worldId)}`;
}

function legacyWorldEditStorageKey(worldId: string) {
  return `${LEGACY_STORAGE_PREFIX}.${encodeURIComponent(worldId)}`;
}

/**
 * Sparse local cache plus durable remote outbox for player-authored terrain.
 *
 * Standard AIR entries are tombstones over deterministic generated terrain.
 * Remote mutations are grouped into stable, idempotent batches of at most 256;
 * a batch is committed to browser storage before transmission and removed only
 * after the server acknowledges it.
 */
export class WorldEditPersistence {
  readonly worldId: string;
  readonly storageKey: string;
  private readonly legacyStorageKey: string;
  private readonly storage: WorldEditStorage | null;
  private readonly saveDelayMs: number;
  private readonly remote: WorldEditRemote | null;
  private readonly standardEdits = new Map<string, PersistedStandardEdit>();
  private readonly standardEditsByChunk = new Map<string, Map<string, PersistedStandardEdit>>();
  private readonly microEdits = new Map<string, PersistedMicroEdit>();
  private readonly pendingBatches: PersistedMutationBatch[] = [];
  /** A transmitted (or reload-restored) batch id must never gain new mutations. */
  private readonly sealedBatchIds = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private sendingBatchId: string | null = null;
  private dirty = false;

  constructor(options: WorldEditPersistenceOptions) {
    this.worldId = String(options.worldId || '').trim();
    this.storageKey = worldEditStorageKey(this.worldId);
    this.legacyStorageKey = legacyWorldEditStorageKey(this.worldId);
    this.storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
    this.remote = options.remote ?? null;
    const configuredSaveDelay = Number(options.saveDelayMs);
    this.saveDelayMs = Number.isFinite(configuredSaveDelay)
      ? Math.max(0, configuredSaveDelay)
      : DEFAULT_SAVE_DELAY_MS;

    if (this.remote) this.loadRemoteChunks(this.remote.chunks);
    this.loadLocalState();
    this.reconcileStandardMicroExclusion();
    this.installLifecycleFlush();

    if (this.remote) {
      this.dirty = true;
      this.scheduleSave();
      this.scheduleRemoteFlush();
    }
  }

  getStandardEditsForChunk(cx: number, cz: number) {
    return this.standardEditsByChunk.get(`${cx},${cz}`)?.values() ?? [][Symbol.iterator]();
  }

  getMicroEdits() {
    return this.microEdits.values();
  }

  *getMicroEditsForChunk(cx: number, cz: number) {
    const minMx = cx * CHUNK_SIZE_X * MICRO_DIVISIONS;
    const maxMx = minMx + CHUNK_SIZE_X * MICRO_DIVISIONS;
    const minMz = cz * CHUNK_SIZE_Z * MICRO_DIVISIONS;
    const maxMz = minMz + CHUNK_SIZE_Z * MICRO_DIVISIONS;
    for (const edit of this.microEdits.values()) {
      if (edit.mx >= minMx && edit.mx < maxMx && edit.mz >= minMz && edit.mz < maxMz) {
        yield edit;
      }
    }
  }

  /** Replace one server-authored chunk snapshot without creating an outgoing echo batch. */
  replaceRemoteChunk(chunk: TerrainEditChunk) {
    const chunkCountX = TORUS_SIZE_X / CHUNK_SIZE_X;
    const chunkCountZ = TORUS_SIZE_Z / CHUNK_SIZE_Z;
    const cx = ((Math.floor(chunk.chunk_x) % chunkCountX) + chunkCountX) % chunkCountX;
    const cz = ((Math.floor(chunk.chunk_z) % chunkCountZ) + chunkCountZ) % chunkCountZ;
    const chunkKey = `${cx},${cz}`;
    const previousStandard = this.standardEditsByChunk.get(chunkKey);
    if (previousStandard) {
      for (const key of previousStandard.keys()) this.standardEdits.delete(key);
      this.standardEditsByChunk.delete(chunkKey);
    }

    const minMx = cx * CHUNK_SIZE_X * MICRO_DIVISIONS;
    const maxMx = minMx + CHUNK_SIZE_X * MICRO_DIVISIONS;
    const minMz = cz * CHUNK_SIZE_Z * MICRO_DIVISIONS;
    const maxMz = minMz + CHUNK_SIZE_Z * MICRO_DIVISIONS;
    for (const [key, edit] of this.microEdits) {
      if (edit.mx >= minMx && edit.mx < maxMx && edit.mz >= minMz && edit.mz < maxMz) {
        this.microEdits.delete(key);
      }
    }

    this.loadPackedEdits(chunk.standard, chunk.micro);
    // A remote snapshot can race a still-unacknowledged local batch. Reapply
    // the durable outbox so local intent stays visible and is not discarded.
    this.replayPendingBatches();
    this.reconcileStandardMicroExclusion();
  }

  recordStandard(x: number, y: number, z: number, block: number, color: number) {
    const edit = this.normalizeStandardEdit(x, y, z, block, color);
    if (!edit) return;
    this.addStandardEdit(edit);
    if (edit.block !== 0) this.removeMicroStandardCell(edit.x, edit.y, edit.z, false);
    this.enqueueMutation({
      kind: 'set_standard',
      x: edit.x,
      y: edit.y,
      z: edit.z,
      block: edit.block,
      color: edit.color,
    });
  }

  recordMicro(mx: number, my: number, mz: number, color: number, part: unknown = null) {
    const edit = this.normalizeMicroEdit(mx, my, mz, color, part);
    if (!edit) return;
    this.microEdits.set(microKey(edit.mx, edit.my, edit.mz), edit);
    this.enqueueMutation({
      kind: 'set_micro',
      mx: edit.mx,
      my: edit.my,
      mz: edit.mz,
      color: edit.color,
      ...(edit.part ? { part: edit.part } : {}),
    });
  }

  removeMicro(mx: number, my: number, mz: number) {
    const normalizedX = Math.floor(wrapMicroX(mx));
    const normalizedY = Math.floor(my);
    const normalizedZ = Math.floor(wrapMicroZ(mz));
    const removed = this.microEdits.delete(microKey(normalizedX, normalizedY, normalizedZ));
    if (removed) {
      this.enqueueMutation({ kind: 'remove_micro', mx: normalizedX, my: normalizedY, mz: normalizedZ });
    }
    return removed;
  }

  removeMicroStandardCell(wx: number, wy: number, wz: number, enqueue = true) {
    const normalizedX = Math.floor(wrapX(wx));
    const normalizedY = Math.floor(wy);
    const normalizedZ = Math.floor(wrapZ(wz));
    const removed = this.removeMicroStandardCellLocal(normalizedX, normalizedY, normalizedZ);
    if (removed > 0 && enqueue) {
      this.enqueueMutation({
        kind: 'clear_micro_cell',
        x: normalizedX,
        y: normalizedY,
        z: normalizedZ,
      });
    }
    return removed;
  }

  flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty || !this.storage || !this.worldId) return false;

    try {
      if (
        this.standardEdits.size === 0
        && this.microEdits.size === 0
        && this.pendingBatches.length === 0
      ) {
        this.storage.removeItem(this.storageKey);
      } else {
        const payload = {
          version: STORAGE_SCHEMA_VERSION,
          worldId: this.worldId,
          standard: [...this.standardEdits.values()].map(edit => (
            [edit.x, edit.y, edit.z, edit.block, edit.color]
          )),
          micro: [...this.microEdits.values()].map(edit => (
            edit.part
              ? [edit.mx, edit.my, edit.mz, edit.color, edit.part]
              : [edit.mx, edit.my, edit.mz, edit.color]
          )),
          pendingBatches: this.pendingBatches,
          savedAt: Date.now(),
        };
        this.storage.setItem(this.storageKey, JSON.stringify(payload));
        this.storage.removeItem(this.legacyStorageKey);
      }
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn('Space could not persist world edits in browser storage.', error);
      return false;
    }
  }

  private normalizeStandardEdit(x: number, y: number, z: number, block: number, color: number) {
    if (![x, y, z, block, color].every(value => Number.isFinite(Number(value)))) return null;
    const normalizedX = Math.floor(wrapX(x));
    const normalizedY = Math.floor(y);
    const normalizedZ = Math.floor(wrapZ(z));
    if (normalizedY < 0 || normalizedY >= CHUNK_SIZE_Y) return null;
    return {
      x: normalizedX,
      y: normalizedY,
      z: normalizedZ,
      block: Math.max(0, Math.min(255, Math.floor(Number(block) || 0))),
      color: Number(color) & 0xffffff,
    };
  }

  private normalizeMicroEdit(mx: number, my: number, mz: number, color: number, part: unknown = null) {
    if (![mx, my, mz, color].every(value => Number.isFinite(Number(value)))) return null;
    const normalizedX = Math.floor(wrapMicroX(mx));
    const normalizedY = Math.floor(my);
    const normalizedZ = Math.floor(wrapMicroZ(mz));
    if (normalizedY < 0 || normalizedY >= CHUNK_SIZE_Y * MICRO_DIVISIONS) return null;
    return {
      mx: normalizedX,
      my: normalizedY,
      mz: normalizedZ,
      color: Number(color) & 0xffffff,
      part: typeof part === 'string' ? part.slice(0, 64) : null,
    };
  }

  private addStandardEdit(edit: PersistedStandardEdit) {
    const key = standardKey(edit.x, edit.y, edit.z);
    this.standardEdits.set(key, edit);
    const chunkKey = chunkKeyForWorldCell(edit.x, edit.z);
    let chunkEdits = this.standardEditsByChunk.get(chunkKey);
    if (!chunkEdits) {
      chunkEdits = new Map();
      this.standardEditsByChunk.set(chunkKey, chunkEdits);
    }
    chunkEdits.set(key, edit);
  }

  private removeMicroStandardCellLocal(wx: number, wy: number, wz: number) {
    const baseX = wx * MICRO_DIVISIONS;
    const baseY = wy * MICRO_DIVISIONS;
    const baseZ = wz * MICRO_DIVISIONS;
    let removed = 0;
    for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
      for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
        for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
          if (this.microEdits.delete(microKey(baseX + dx, baseY + dy, baseZ + dz))) removed++;
        }
      }
    }
    return removed;
  }

  private reconcileStandardMicroExclusion() {
    for (const edit of this.standardEdits.values()) {
      if (edit.block !== 0) this.removeMicroStandardCellLocal(edit.x, edit.y, edit.z);
    }
  }

  private enqueueMutation(mutation: TerrainMutation) {
    if (this.remote) {
      let batch = this.pendingBatches[this.pendingBatches.length - 1];
      if (
        !batch
        || batch.mutations.length >= MAX_MUTATIONS_PER_BATCH
        || this.sealedBatchIds.has(batch.batchId)
      ) {
        batch = { batchId: createBatchId(), mutations: [] };
        this.pendingBatches.push(batch);
      }
      batch.mutations.push(mutation);
      this.scheduleRemoteFlush();
    }
    this.scheduleSave();
  }

  private scheduleSave() {
    this.dirty = true;
    if (!this.storage || !this.worldId || this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, this.saveDelayMs);
  }

  private scheduleRemoteFlush(delay = this.saveDelayMs) {
    if (!this.remote || this.sendingBatchId || this.pendingBatches.length === 0) return;
    if (this.remoteRetryTimer !== null) return;
    this.remoteRetryTimer = setTimeout(() => {
      this.remoteRetryTimer = null;
      void this.flushNextRemoteBatch();
    }, delay);
  }

  private async flushNextRemoteBatch() {
    if (!this.remote || this.sendingBatchId || this.pendingBatches.length === 0) return;
    const batch = this.pendingBatches[0];
    this.sealedBatchIds.add(batch.batchId);
    // Reserve the batch while its IndexedDB transaction commits so another
    // zero-delay mutation timer cannot start a concurrent send of the same id.
    this.sendingBatchId = batch.batchId;
    this.flush();
    try {
      await this.storage?.whenIdle?.();
    } catch (error) {
      // Never transmit an outbox batch that did not become durable. Keep its
      // stable id sealed and retry the same persistence operation later.
      this.dirty = true;
      this.sendingBatchId = null;
      console.warn('Space terrain batch is waiting for durable browser storage.', error);
      this.scheduleRemoteFlush(REMOTE_RETRY_DELAY_MS);
      return;
    }
    try {
      await this.remote.sendBatch(batch.batchId, batch.mutations);
      const index = this.pendingBatches.findIndex(item => item.batchId === batch.batchId);
      if (index >= 0) this.pendingBatches.splice(index, 1);
      this.sealedBatchIds.delete(batch.batchId);
      this.dirty = true;
      this.flush();
      this.sendingBatchId = null;
      this.scheduleRemoteFlush(0);
    } catch (error) {
      this.sendingBatchId = null;
      console.warn('Space terrain batch remains queued for retry.', error);
      this.scheduleRemoteFlush(REMOTE_RETRY_DELAY_MS);
    }
  }

  private loadRemoteChunks(chunks: TerrainEditChunk[]) {
    for (const chunk of Array.isArray(chunks) ? chunks : []) {
      this.loadPackedEdits(chunk.standard, chunk.micro);
    }
  }

  private loadPackedEdits(standardInput: unknown, microInput: unknown) {
    const standard = Array.isArray(standardInput)
      ? standardInput.slice(0, MAX_STORED_STANDARD_EDITS)
      : [];
    for (const packed of standard) {
      if (!Array.isArray(packed) || packed.length < 5) continue;
      const x = finiteInteger(packed[0]);
      const y = finiteInteger(packed[1]);
      const z = finiteInteger(packed[2]);
      const block = finiteInteger(packed[3]);
      const color = finiteInteger(packed[4]);
      if (x === null || y === null || z === null || block === null || color === null) continue;
      if (x < 0 || x >= TORUS_SIZE_X || y < 0 || y >= CHUNK_SIZE_Y || z < 0 || z >= TORUS_SIZE_Z) continue;
      this.addStandardEdit({ x, y, z, block: Math.max(0, Math.min(255, block)), color: color & 0xffffff });
    }

    const micro = Array.isArray(microInput)
      ? microInput.slice(0, MAX_STORED_MICRO_EDITS)
      : [];
    for (const packed of micro) {
      if (!Array.isArray(packed) || packed.length < 4) continue;
      const mx = finiteInteger(packed[0]);
      const my = finiteInteger(packed[1]);
      const mz = finiteInteger(packed[2]);
      const color = finiteInteger(packed[3]);
      if (mx === null || my === null || mz === null || color === null) continue;
      if (
        mx < 0 || mx >= TORUS_SIZE_X * MICRO_DIVISIONS
        || my < 0 || my >= CHUNK_SIZE_Y * MICRO_DIVISIONS
        || mz < 0 || mz >= TORUS_SIZE_Z * MICRO_DIVISIONS
      ) continue;
      this.microEdits.set(microKey(mx, my, mz), {
        mx,
        my,
        mz,
        color: color & 0xffffff,
        part: typeof packed[4] === 'string' ? packed[4].slice(0, 64) : null,
      });
    }
  }

  private loadLocalState() {
    if (!this.storage || !this.worldId) return;
    try {
      const currentRaw = this.storage.getItem(this.storageKey);
      if (currentRaw) {
        const payload = JSON.parse(currentRaw);
        if (payload?.version !== STORAGE_SCHEMA_VERSION || payload?.worldId !== this.worldId) return;
        if (!this.remote) this.loadPackedEdits(payload.standard, payload.micro);
        this.loadPendingBatches(payload.pendingBatches);
        this.replayPendingBatches();
        return;
      }

      const legacyRaw = this.storage.getItem(this.legacyStorageKey);
      if (!legacyRaw) return;
      const legacy = JSON.parse(legacyRaw);
      if (legacy?.version !== 1 || legacy?.worldId !== this.worldId) return;
      this.loadPackedEdits(legacy.standard, legacy.micro);
      if (this.remote) this.queueLegacyOverlay(legacy.standard, legacy.micro);
    } catch (error) {
      console.warn('Space ignored an invalid persisted world-edit payload.', error);
      if (!this.remote) {
        this.standardEdits.clear();
        this.standardEditsByChunk.clear();
        this.microEdits.clear();
      }
      this.pendingBatches.length = 0;
    }
  }

  private loadPendingBatches(input: unknown) {
    if (!Array.isArray(input)) return;
    for (const item of input) {
      if (
        !item
        || typeof item.batchId !== 'string'
        || !Array.isArray(item.mutations)
        || item.mutations.length < 1
        || item.mutations.length > MAX_MUTATIONS_PER_BATCH
      ) continue;
      const mutations = item.mutations
        .map((mutation: any) => this.sanitizeMutation(mutation))
        .filter(Boolean) as TerrainMutation[];
      if (mutations.length > 0) {
        this.pendingBatches.push({ batchId: item.batchId, mutations });
        this.sealedBatchIds.add(item.batchId);
      }
    }
  }

  private sanitizeMutation(mutation: any): TerrainMutation | null {
    if (mutation?.kind === 'set_standard') {
      const edit = this.normalizeStandardEdit(
        mutation.x, mutation.y, mutation.z, mutation.block, mutation.color
      );
      return edit ? { kind: 'set_standard', ...edit } : null;
    }
    if (mutation?.kind === 'set_micro') {
      const edit = this.normalizeMicroEdit(
        mutation.mx, mutation.my, mutation.mz, mutation.color, mutation.part
      );
      return edit ? {
        kind: 'set_micro',
        mx: edit.mx,
        my: edit.my,
        mz: edit.mz,
        color: edit.color,
        ...(edit.part ? { part: edit.part } : {}),
      } : null;
    }
    if (mutation?.kind === 'remove_micro') {
      if (![mutation.mx, mutation.my, mutation.mz].every(value => Number.isFinite(Number(value)))) return null;
      const my = Math.floor(Number(mutation.my));
      if (my < 0 || my >= CHUNK_SIZE_Y * MICRO_DIVISIONS) return null;
      return {
        kind: 'remove_micro',
        mx: Math.floor(wrapMicroX(Number(mutation.mx))),
        my,
        mz: Math.floor(wrapMicroZ(Number(mutation.mz))),
      };
    }
    if (mutation?.kind === 'clear_micro_cell') {
      if (![mutation.x, mutation.y, mutation.z].every(value => Number.isFinite(Number(value)))) return null;
      const y = Math.floor(Number(mutation.y));
      if (y < 0 || y >= CHUNK_SIZE_Y) return null;
      return {
        kind: 'clear_micro_cell',
        x: Math.floor(wrapX(Number(mutation.x))),
        y,
        z: Math.floor(wrapZ(Number(mutation.z))),
      };
    }
    return null;
  }

  private replayPendingBatches() {
    for (const batch of this.pendingBatches) {
      for (const mutation of batch.mutations) this.applyMutationLocally(mutation);
    }
  }

  private applyMutationLocally(mutation: TerrainMutation) {
    if (mutation.kind === 'set_standard') {
      const edit = this.normalizeStandardEdit(
        mutation.x, mutation.y, mutation.z, mutation.block, mutation.color
      );
      if (!edit) return;
      this.addStandardEdit(edit);
      if (edit.block !== 0) this.removeMicroStandardCellLocal(edit.x, edit.y, edit.z);
      return;
    }
    if (mutation.kind === 'set_micro') {
      const edit = this.normalizeMicroEdit(
        mutation.mx, mutation.my, mutation.mz, mutation.color, mutation.part
      );
      if (edit) this.microEdits.set(microKey(edit.mx, edit.my, edit.mz), edit);
      return;
    }
    if (mutation.kind === 'remove_micro') {
      this.microEdits.delete(microKey(
        Math.floor(wrapMicroX(mutation.mx)),
        Math.floor(mutation.my),
        Math.floor(wrapMicroZ(mutation.mz))
      ));
      return;
    }
    this.removeMicroStandardCellLocal(
      Math.floor(wrapX(mutation.x)),
      Math.floor(mutation.y),
      Math.floor(wrapZ(mutation.z))
    );
  }

  private queueLegacyOverlay(standardInput: unknown, microInput: unknown) {
    const mutations: TerrainMutation[] = [];
    for (const packed of Array.isArray(standardInput) ? standardInput : []) {
      if (!Array.isArray(packed) || packed.length < 5) continue;
      const edit = this.normalizeStandardEdit(
        Number(packed[0]), Number(packed[1]), Number(packed[2]), Number(packed[3]), Number(packed[4])
      );
      if (edit) mutations.push({ kind: 'set_standard', ...edit });
    }
    for (const packed of Array.isArray(microInput) ? microInput : []) {
      if (!Array.isArray(packed) || packed.length < 4) continue;
      const edit = this.normalizeMicroEdit(
        Number(packed[0]), Number(packed[1]), Number(packed[2]), Number(packed[3]), packed[4]
      );
      if (!edit) continue;
      mutations.push({
        kind: 'set_micro',
        mx: edit.mx,
        my: edit.my,
        mz: edit.mz,
        color: edit.color,
        ...(edit.part ? { part: edit.part } : {}),
      });
    }
    for (let start = 0; start < mutations.length; start += MAX_MUTATIONS_PER_BATCH) {
      this.pendingBatches.push({
        batchId: createBatchId(),
        mutations: mutations.slice(start, start + MAX_MUTATIONS_PER_BATCH),
      });
      this.sealedBatchIds.add(this.pendingBatches[this.pendingBatches.length - 1].batchId);
    }
  }

  private installLifecycleFlush() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pagehide', () => this.flush());
    window.addEventListener('beforeunload', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }
}
