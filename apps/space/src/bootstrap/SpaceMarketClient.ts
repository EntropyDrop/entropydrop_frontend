export type SpaceMarketCategory = 'blockset' | 'entity' | 'colorset';
export type SpaceMarketSort = 'downloads' | 'likes' | 'latest';

export interface SpaceMarketQuota {
  daily_limit: number;
  published_today: number;
  remaining_today: number;
}

export interface SpaceMarketResource {
  id: string;
  kind: SpaceMarketCategory;
  schema_version: 3;
  name: string;
  license: 'AGPL-3.0-only';
  digest: string;
  publisher: { id: string | null; username: string | null };
  size_bytes: number;
  block_count: number;
  node_count: number;
  script_count: number;
  downloads_count: number;
  likes_count: number;
  is_liked: boolean;
  content_url: string;
  created_at: string;
}

export interface SpaceMarketListResponse {
  items: SpaceMarketResource[];
  total: number;
  limit: number;
  offset: number;
  quota: SpaceMarketQuota;
}

export interface SpaceMarketDownload {
  id: string;
  kind: SpaceMarketCategory;
  name: string;
  license: 'AGPL-3.0-only';
  digest: string;
  downloads_count: number;
  download_url: string;
  payload: Uint8Array;
}

type SpaceMarketDownloadDescriptor = Omit<SpaceMarketDownload, 'payload'>;

export class SpaceMarketError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: any;

  constructor(status: number, code: string, message: string, detail: any) {
    super(message);
    this.name = 'SpaceMarketError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class SpaceMarketClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiOrigin: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = `${apiOrigin.replace(/\/+$/, '')}/space/api/v2/market`;
    this.token = token;
    // Window.fetch is a Web IDL method in some browsers and throws
    // "Illegal invocation" when it is detached from Window. Keep injected
    // test fetches working while always calling the function with its native
    // global receiver.
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.detail;
      throw new SpaceMarketError(
        response.status,
        detail?.code || `HTTP_${response.status}`,
        detail?.message || 'Space market request failed.',
        detail
      );
    }
    return body as T;
  }

  listResources(
    kind: SpaceMarketCategory,
    sort: SpaceMarketSort = 'latest',
    limit = 24,
    offset = 0
  ): Promise<SpaceMarketListResponse> {
    const query = new URLSearchParams({
      kind,
      sort,
      limit: String(limit),
      offset: String(offset)
    });
    return this.request<SpaceMarketListResponse>(`/resources?${query}`);
  }

  publishResource(_kind: SpaceMarketCategory, payload: Uint8Array) {
    const body = new Uint8Array(payload.byteLength);
    body.set(payload);
    return this.request<{ resource: SpaceMarketResource; quota: SpaceMarketQuota }>('/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf' },
      body: body.buffer
    });
  }

  async loadResourceContent(contentUrl: string, signal?: AbortSignal): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetchImpl(contentUrl, {
        headers: { Accept: 'application/x-protobuf' },
        signal
      });
    } catch (error) {
      throw new SpaceMarketError(
        0,
        'MARKET_CDN_DOWNLOAD_FAILED',
        'Could not download the market resource from the CDN.',
        error
      );
    }
    const payload = response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    if (!response.ok || !payload || payload.byteLength === 0) {
      throw new SpaceMarketError(
        response.status,
        'MARKET_CDN_DOWNLOAD_FAILED',
        'The CDN returned an invalid market resource.',
        payload
      );
    }
    return payload;
  }

  async downloadResource(resourceId: string): Promise<SpaceMarketDownload> {
    const descriptor = await this.request<SpaceMarketDownloadDescriptor>(
      `/resources/${encodeURIComponent(resourceId)}/download`
    );
    const payload = await this.loadResourceContent(descriptor.download_url);
    return { ...descriptor, payload };
  }

  toggleLike(resourceId: string) {
    return this.request<{ is_liked: boolean; likes_count: number }>(
      `/resources/${encodeURIComponent(resourceId)}/like`,
      { method: 'POST' }
    );
  }

  deleteResource(resourceId: string) {
    return this.request<{
      deleted: boolean;
      resource_id: string;
      cdn_object_deleted: boolean;
      cdn_invalidation_requested: boolean;
    }>(
      `/resources/${encodeURIComponent(resourceId)}`,
      { method: 'DELETE' }
    );
  }
}
