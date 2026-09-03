import { readJsonResponse } from './NetworkSafety.ts';


const MAX_API_KEY_RESPONSE_BYTES = 256 * 1024;

export type SpaceApiKeyScope = 'space:entity:create' | 'space:entity:run';

export interface SpaceApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  scopes: SpaceApiKeyScope[];
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedSpaceApiKey extends SpaceApiKeyRecord {
  api_key: string;
}

export class SpaceApiKeyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: any;

  constructor(status: number, code: string, message: string, detail: any) {
    super(message);
    this.name = 'SpaceApiKeyError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function parseApiKey(value: any): SpaceApiKeyRecord {
  if (
    typeof value?.id !== 'string'
    || typeof value?.name !== 'string'
    || typeof value?.key_prefix !== 'string'
    || !value.key_prefix.startsWith('edapi_')
    || !Array.isArray(value?.scopes)
    || value.scopes.some((scope: unknown) => ![
      'space:entity:create',
      'space:entity:run',
    ].includes(String(scope)))
    || !value.scopes.includes('space:entity:create')
    || typeof value?.created_at !== 'string'
    || !(value?.last_used_at === null || typeof value?.last_used_at === 'string')
  ) {
    throw new SpaceApiKeyError(
      0,
      'SPACE_API_KEY_INVALID_RESPONSE',
      'The Space API key service returned an invalid response.',
      value,
    );
  }
  return value as SpaceApiKeyRecord;
}

export class SpaceApiKeyClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiOrigin: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = `${apiOrigin.replace(/\/+$/, '')}/space/api/v2/api-keys`;
    this.token = token;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    let body: any;
    try {
      body = await readJsonResponse(response, MAX_API_KEY_RESPONSE_BYTES);
    } catch (error) {
      throw new SpaceApiKeyError(
        response.status,
        'SPACE_API_KEY_INVALID_RESPONSE',
        'The Space API key service returned an invalid response.',
        error,
      );
    }
    if (!response.ok) {
      const detail = body?.detail;
      throw new SpaceApiKeyError(
        response.status,
        detail?.code || `HTTP_${response.status}`,
        detail?.message || 'Space API key request failed.',
        detail,
      );
    }
    return body;
  }

  async list(): Promise<SpaceApiKeyRecord[]> {
    const body = await this.request('');
    if (!Array.isArray(body?.items)) {
      throw new SpaceApiKeyError(
        0,
        'SPACE_API_KEY_INVALID_RESPONSE',
        'The Space API key list is invalid.',
        body,
      );
    }
    return body.items.map(parseApiKey);
  }

  async create(name: string, allowRun: boolean): Promise<CreatedSpaceApiKey> {
    const body = await this.request('', {
      method: 'POST',
      body: JSON.stringify({
        name,
        scopes: [
          'space:entity:create',
          ...(allowRun ? ['space:entity:run'] : []),
        ],
      }),
    });
    const record = parseApiKey(body);
    if (typeof body?.api_key !== 'string' || !body.api_key.startsWith(record.key_prefix)) {
      throw new SpaceApiKeyError(
        0,
        'SPACE_API_KEY_INVALID_RESPONSE',
        'The new Space API key is missing from the response.',
        body,
      );
    }
    return { ...record, api_key: body.api_key };
  }

  async revoke(apiKeyId: string): Promise<void> {
    const body = await this.request(`/${encodeURIComponent(apiKeyId)}`, { method: 'DELETE' });
    if (body?.revoked !== true || body?.api_key_id !== apiKeyId) {
      throw new SpaceApiKeyError(
        0,
        'SPACE_API_KEY_INVALID_RESPONSE',
        'The Space API key revoke response is invalid.',
        body,
      );
    }
  }
}
