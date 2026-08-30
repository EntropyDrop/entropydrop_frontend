import { parse } from 'acorn';
import {
  createQuickJSScriptRuntimeService,
  isQuickJSScriptRuntimeReady,
  preloadQuickJSScriptRuntime
} from './QuickJSScriptWorkerCore.ts';

type WorkerResponse = {
  requestId: number;
  ok: boolean;
  [key: string]: any;
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

class EntityScriptMainThreadBroker {
  service: ReturnType<typeof createQuickJSScriptRuntimeService> | null = null;
  ready: Promise<ReturnType<typeof createQuickJSScriptRuntimeService>> | null = null;
  nextRequestId = 1;

  request(message: Record<string, any>): WorkerResponse | Promise<WorkerResponse> {
    const requestId = this.nextRequestId++;
    const request = { ...message, requestId };
    if (!this.service && isQuickJSScriptRuntimeReady()) {
      this.service = createQuickJSScriptRuntimeService();
    }
    if (this.service) return this.service.handle(request);
    if (!this.ready) {
      this.ready = preloadQuickJSScriptRuntime().then(() => {
        this.service ||= createQuickJSScriptRuntimeService();
        return this.service;
      });
    }
    return this.ready.then(service => service.handle(request));
  }
}

const broker = new EntityScriptMainThreadBroker();
let nextEntityRuntimeId = 1;

/**
 * Page-side handle for one sandboxed QuickJS Runtime. Guest code executes
 * synchronously inside QuickJS/WASM on the page thread; it never evaluates in
 * the page's JavaScript realm and only sees explicitly registered host APIs.
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

  tick(snapshot: any, hostApi: any = null): { submitted: boolean; result: any | null } {
    if (this.disposed || this.inFlight) return { submitted: false, result: null };
    this.initialized = true;
    const response = broker.request({
      type: 'tick',
      entityRuntimeId: this.runtimeId,
      snapshot,
      hostApi
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
