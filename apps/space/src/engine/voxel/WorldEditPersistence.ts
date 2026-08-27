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

const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'space.world-edits.v1';
const DEFAULT_SAVE_DELAY_MS = 75;
const MAX_STORED_STANDARD_EDITS = 250_000;
const MAX_STORED_MICRO_EDITS = 500_000;

export interface WorldEditStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WorldEditPersistenceOptions {
  worldId: string;
  storage?: WorldEditStorage | null;
  saveDelayMs?: number;
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

export function worldEditStorageKey(worldId: string) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(worldId)}`;
}

/**
 * A compact browser-local overlay for player-authored terrain changes.
 *
 * Standard AIR entries are deliberately retained: they are tombstones over the
 * deterministic generated terrain and prevent mined blocks from reappearing on
 * the next page load. Micro voxels need no tombstones because the base generator
 * never creates them.
 */
export class WorldEditPersistence {
  readonly worldId: string;
  readonly storageKey: string;
  private readonly storage: WorldEditStorage | null;
  private readonly saveDelayMs: number;
  private readonly standardEdits = new Map<string, PersistedStandardEdit>();
  private readonly standardEditsByChunk = new Map<string, Map<string, PersistedStandardEdit>>();
  private readonly microEdits = new Map<string, PersistedMicroEdit>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(options: WorldEditPersistenceOptions) {
    this.worldId = String(options.worldId || '').trim();
    this.storageKey = worldEditStorageKey(this.worldId);
    this.storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
    const configuredSaveDelay = Number(options.saveDelayMs);
    this.saveDelayMs = Number.isFinite(configuredSaveDelay)
      ? Math.max(0, configuredSaveDelay)
      : DEFAULT_SAVE_DELAY_MS;
    this.load();
    this.installLifecycleFlush();
  }

  getStandardEditsForChunk(cx: number, cz: number) {
    return this.standardEditsByChunk.get(`${cx},${cz}`)?.values() ?? [][Symbol.iterator]();
  }

  getMicroEdits() {
    return this.microEdits.values();
  }

  recordStandard(x: number, y: number, z: number, block: number, color: number) {
    const normalizedX = Math.floor(wrapX(x));
    const normalizedY = Math.floor(y);
    const normalizedZ = Math.floor(wrapZ(z));
    if (normalizedY < 0 || normalizedY >= CHUNK_SIZE_Y) return;
    const edit = {
      x: normalizedX,
      y: normalizedY,
      z: normalizedZ,
      block: Math.max(0, Math.min(255, Math.floor(Number(block) || 0))),
      color: Number(color) & 0xffffff,
    };
    this.addStandardEdit(edit);
    if (edit.block !== 0) this.removeMicroStandardCell(normalizedX, normalizedY, normalizedZ, false);
    this.scheduleSave();
  }

  recordMicro(mx: number, my: number, mz: number, color: number, part: unknown = null) {
    const normalizedX = Math.floor(wrapMicroX(mx));
    const normalizedY = Math.floor(my);
    const normalizedZ = Math.floor(wrapMicroZ(mz));
    if (normalizedY < 0 || normalizedY >= CHUNK_SIZE_Y * MICRO_DIVISIONS) return;
    const edit = {
      mx: normalizedX,
      my: normalizedY,
      mz: normalizedZ,
      color: Number(color) & 0xffffff,
      part: typeof part === 'string' ? part : null,
    };
    this.microEdits.set(microKey(normalizedX, normalizedY, normalizedZ), edit);
    this.scheduleSave();
  }

  removeMicro(mx: number, my: number, mz: number) {
    const removed = this.microEdits.delete(microKey(
      Math.floor(wrapMicroX(mx)),
      Math.floor(my),
      Math.floor(wrapMicroZ(mz))
    ));
    if (removed) this.scheduleSave();
    return removed;
  }

  removeMicroStandardCell(wx: number, wy: number, wz: number, schedule = true) {
    const baseX = Math.floor(wrapX(wx)) * MICRO_DIVISIONS;
    const baseY = Math.floor(wy) * MICRO_DIVISIONS;
    const baseZ = Math.floor(wrapZ(wz)) * MICRO_DIVISIONS;
    let removed = 0;
    for (let dx = 0; dx < MICRO_DIVISIONS; dx++) {
      for (let dy = 0; dy < MICRO_DIVISIONS; dy++) {
        for (let dz = 0; dz < MICRO_DIVISIONS; dz++) {
          if (this.microEdits.delete(microKey(baseX + dx, baseY + dy, baseZ + dz))) removed++;
        }
      }
    }
    if (removed > 0 && schedule) this.scheduleSave();
    return removed;
  }

  flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty || !this.storage || !this.worldId) return false;

    try {
      if (this.standardEdits.size === 0 && this.microEdits.size === 0) {
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
          savedAt: Date.now(),
        };
        this.storage.setItem(this.storageKey, JSON.stringify(payload));
      }
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn('Space could not persist world edits in browser storage.', error);
      return false;
    }
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

  private scheduleSave() {
    this.dirty = true;
    if (!this.storage || !this.worldId || this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, this.saveDelayMs);
  }

  private load() {
    if (!this.storage || !this.worldId) return;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload?.version !== STORAGE_SCHEMA_VERSION || payload?.worldId !== this.worldId) return;

      const standard = Array.isArray(payload.standard)
        ? payload.standard.slice(0, MAX_STORED_STANDARD_EDITS)
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

      const micro = Array.isArray(payload.micro)
        ? payload.micro.slice(0, MAX_STORED_MICRO_EDITS)
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
          part: typeof packed[4] === 'string' ? packed[4] : null,
        });
      }

      // A solid standard edit is authoritative over any stale micro entries in
      // the same 1 m cell, matching World.setBlock's standard/micro exclusion.
      for (const edit of this.standardEdits.values()) {
        if (edit.block !== 0) this.removeMicroStandardCell(edit.x, edit.y, edit.z, false);
      }
    } catch (error) {
      console.warn('Space ignored an invalid persisted world-edit payload.', error);
      this.standardEdits.clear();
      this.standardEditsByChunk.clear();
      this.microEdits.clear();
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
