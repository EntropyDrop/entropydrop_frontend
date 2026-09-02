export class NetworkPayloadTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Network response exceeds the ${maxBytes} byte safety limit.`);
    this.name = 'NetworkPayloadTooLargeError';
    this.maxBytes = maxBytes;
  }
}

export function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(normalized)) return true;
  if (normalized.endsWith('.local')) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(normalized)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(normalized)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(normalized);
}

/** Resolve an external browser fetch target without allowing cleartext Internet URLs. */
export function resolveSafeHttpUrl(input: string, baseUrl?: string): URL {
  const url = new URL(input, baseUrl);
  const secure = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && isLocalDevelopmentHost(url.hostname);
  if (!secure && !localHttp) {
    throw new Error('Remote resources must use HTTPS (HTTP is allowed only for local development).');
  }
  return url;
}

/** Read a response incrementally so a corrupt CDN/API cannot force a huge allocation. */
export async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive integer');
  const declaredLength = Number(response.headers?.get?.('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new NetworkPayloadTooLargeError(maxBytes);
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new NetworkPayloadTooLargeError(maxBytes);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new NetworkPayloadTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function readJsonResponse<T = unknown>(response: Response, maxBytes: number): Promise<T | null> {
  const bytes = await readResponseBytes(response, maxBytes);
  if (bytes.byteLength === 0) return null;
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is unavailable; resource integrity cannot be verified.');
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', input));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}
