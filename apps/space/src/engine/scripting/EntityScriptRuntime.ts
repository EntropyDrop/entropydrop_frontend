import { parse } from 'acorn';

const SYNC_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

type WorkerResponse = {
  requestId: number;
  ok: boolean;
  [key: string]: any;
};

type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/** Parse only; user source is never evaluated in the page realm. */
export function validateEntityScriptSyntax(code: string): string | null {
  try {
    parse(`function __spaceEntityScript(self, ctx) {\n${code || ''}\n}`, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowHashBang: false
    });
    return null;
  } catch (error: any) {
    return error?.message || String(error);
  }
}

function isSynchronousTestRuntime(): boolean {
  return globalThis['__SPACE_SCRIPT_SYNC__'] === true;
}

class EntityScriptWorkerBroker {
  worker: Worker | null = null;
  nextRequestId = 1;
  pending = new Map<number, PendingRequest>();

  ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./EntityScriptWorker.ts', import.meta.url), {
      type: 'module',
      name: 'space-entity-quickjs'
    });
    worker.onmessage = event => this.handleMessage(event.data);
    worker.onerror = event => {
      const message = event?.message || 'Entity script Worker crashed';
      this.failAll(new Error(message));
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  handleMessage(message: WorkerResponse) {
    const pending = this.pending.get(message?.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.requestId);
    pending.resolve(message);
  }

  failAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(message: Record<string, any>): WorkerResponse | Promise<WorkerResponse> {
    const requestId = this.nextRequestId++;
    const worker = this.ensureWorker();
    if (isSynchronousTestRuntime()) {
      const shared = new SharedArrayBuffer(SYNC_RESPONSE_BYTES);
      const header = new Int32Array(shared, 0, 2);
      worker.postMessage({ ...message, requestId, syncResponse: shared });
      const waitResult = Atomics.wait(header, 0, 0, DEFAULT_REQUEST_TIMEOUT_MS);
      if (waitResult === 'timed-out') {
        throw new Error(`Entity script Worker timed out handling ${message.type}`);
      }
      const byteLength = Atomics.load(header, 1);
      if (byteLength < 0 || byteLength > SYNC_RESPONSE_BYTES - 8) {
        throw new Error('Entity script Worker returned an invalid synchronized response');
      }
      const bytes = new Uint8Array(shared, 8, byteLength);
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Entity script Worker timed out handling ${message.type}`));
      }, DEFAULT_REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout });
      worker.postMessage({ ...message, requestId });
    });
  }
}

const broker = new EntityScriptWorkerBroker();
let nextEntityRuntimeId = 1;

/**
 * Page-side handle for one QuickJS Runtime. In browsers ticks are pipelined;
 * the Node test adapter uses a SharedArrayBuffer response to preserve the
 * engine's synchronous unit-test contract without ever evaluating guest code
 * on the main thread.
 */
export class EntityScriptRuntimeClient {
  readonly runtimeId: string;
  inFlight = false;
  pendingResult: any = null;
  disposed = false;
  initialized = false;
  onCompileResult: ((result: any) => void) | null = null;

  constructor() {
    this.runtimeId = `entity-runtime-${nextEntityRuntimeId++}`;
  }

  setScript(nodeId: string, code: string) {
    if (this.disposed) return { ok: false, error: 'Runtime disposed' };
    if (!this.initialized && !code.trim()) return { ok: true, nodeId };
    this.initialized = true;
    const response = broker.request({
      type: 'set-script',
      entityRuntimeId: this.runtimeId,
      nodeId,
      code
    });
    if (response instanceof Promise) {
      response.then(result => this.onCompileResult?.(result)).catch(error => {
        this.onCompileResult?.({ ok: false, nodeId, error: error.message || String(error) });
      });
      return { ok: true, pending: true };
    }
    return response;
  }

  tick(snapshot: any): { submitted: boolean; result: any | null } {
    if (this.disposed || this.inFlight) return { submitted: false, result: null };
    this.initialized = true;
    const response = broker.request({
      type: 'tick',
      entityRuntimeId: this.runtimeId,
      snapshot
    });
    if (response instanceof Promise) {
      this.inFlight = true;
      response.then(result => {
        this.pendingResult = result;
        this.inFlight = false;
      }).catch(error => {
        this.pendingResult = { ok: false, fatal: true, error: error.message || String(error) };
        this.inFlight = false;
      });
      return { submitted: true, result: null };
    }
    return { submitted: true, result: response };
  }

  takePendingResult() {
    const result = this.pendingResult;
    this.pendingResult = null;
    return result;
  }

  reset(states: Record<string, any> = {}) {
    if (this.disposed || !this.initialized) return;
    const response = broker.request({
      type: 'reset',
      entityRuntimeId: this.runtimeId,
      states
    });
    if (response instanceof Promise) response.catch(() => {});
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.initialized) return;
    const response = broker.request({ type: 'dispose', entityRuntimeId: this.runtimeId });
    if (response instanceof Promise) response.catch(() => {});
  }
}
