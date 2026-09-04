const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const originalFetch = window.fetch.bind(window);

type ExtendedRequestInit = RequestInit & {
    skipGlobalError?: boolean;
};

interface RefreshResult {
    token: string | null;
    terminal: boolean;
}

let isAlerting = false;
let refreshInFlight: Promise<RefreshResult> | null = null;

function absoluteUrl(input: RequestInfo | URL): URL | null {
    try {
        const raw = input instanceof Request ? input.url : String(input);
        return new URL(raw, window.location.href);
    } catch {
        return null;
    }
}

function apiBaseOrigin(): string {
    return new URL(API_BASE_URL, window.location.href).origin;
}

function isBackendApiRequest(url: URL | null): boolean {
    return !!url && url.origin === apiBaseOrigin() && /\/api\b/.test(url.pathname);
}

function isSessionControlRequest(url: URL | null): boolean {
    return !!url && /\/api\/auth\/(?:google|refresh|logout)\/?$/.test(url.pathname);
}

function jwtExpiresAt(token: string): number | null {
    try {
        const segment = token.split('.')[1];
        if (!segment) return null;
        const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
        return Number.isFinite(payload?.exp) ? Number(payload.exp) * 1000 : null;
    } catch {
        return null;
    }
}

async function requestSessionRefresh(timeoutMs = 5000): Promise<RefreshResult> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await originalFetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/auth/refresh`, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
        });
        if (!response.ok) {
            return { token: null, terminal: response.status === 401 || response.status === 403 };
        }
        const data = await response.json().catch(() => null);
        const token = typeof data?.access_token === 'string' ? data.access_token : null;
        if (!token) return { token: null, terminal: true };
        localStorage.setItem('token', token);
        window.dispatchEvent(new Event('auth-token-updated'));
        return { token, terminal: false };
    } catch {
        return { token: null, terminal: false };
    } finally {
        window.clearTimeout(timeout);
    }
}

export function refreshAuthSession(): Promise<RefreshResult> {
    if (!refreshInFlight) {
        refreshInFlight = requestSessionRefresh().finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
}

export async function bootstrapAuthSession(): Promise<void> {
    const existingToken = localStorage.getItem('token');
    const result = await refreshAuthSession();
    if (result.token || !existingToken) return;
    const expiresAt = jwtExpiresAt(existingToken);
    if (result.terminal && (expiresAt === null || expiresAt <= Date.now())) {
        localStorage.removeItem('token');
    }
}

export async function revokeAuthSession(): Promise<void> {
    try {
        await originalFetch(`${API_BASE_URL.replace(/\/+$/, '')}/api/auth/logout`, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            credentials: 'include',
            cache: 'no-store'
        });
    } catch {
        // Local logout must still complete if the backend is temporarily unavailable.
    } finally {
        localStorage.removeItem('token');
    }
}

const getCurrentLocale = async () => {
    const isAuto = localStorage.getItem('isAuto') !== 'false';
    let lang = 'en';
    if (isAuto) {
        const fullLang = navigator.language.toLowerCase();
        if (fullLang.startsWith('zh')) lang = 'zh-hans';
    } else {
        const stored = localStorage.getItem('lang');
        if (stored === 'zh-hans' || stored === 'en') lang = stored;
    }
    return lang === 'zh-hans'
        ? (await import('../constants/locales/zh-hans')).default
        : (await import('../constants/locales/en')).default;
};

async function expireLocalSession() {
    const token = localStorage.getItem('token');
    if (!token || isAlerting) return;
    isAlerting = true;
    localStorage.removeItem('token');
    const locale = await getCurrentLocale();
    alert(locale.common.sessionExpired);
    isAlerting = false;
    window.dispatchEvent(new Event('logout'));
}

function prepareRequest(
    input: RequestInfo | URL,
    init: ExtendedRequestInit | undefined,
    token: string | null
): { input: RequestInfo | URL; init?: RequestInit; retryInput: RequestInfo | URL; retryInit?: RequestInit } {
    const cleanInit: ExtendedRequestInit = { ...init };
    delete cleanInit.skipGlobalError;
    const url = absoluteUrl(input);
    const isApi = isBackendApiRequest(url);
    const shouldAuthorize = isApi && !isSessionControlRequest(url);

    if (input instanceof Request) {
        const headers = new Headers(cleanInit.headers || input.headers);
        if (shouldAuthorize && token) headers.set('Authorization', `Bearer ${token}`);
        else if (shouldAuthorize) headers.delete('Authorization');
        const request = new Request(input, {
            ...cleanInit,
            headers,
            credentials: cleanInit.credentials || (isApi ? 'include' : input.credentials)
        });
        return { input: request, retryInput: request.clone() };
    }

    const headers = new Headers(cleanInit.headers || {});
    if (shouldAuthorize && token) headers.set('Authorization', `Bearer ${token}`);
    else if (shouldAuthorize) headers.delete('Authorization');
    const preparedInit: RequestInit = {
        ...cleanInit,
        headers,
        credentials: cleanInit.credentials || (isBackendApiRequest(url) ? 'include' : cleanInit.credentials)
    };
    return { input, init: preparedInit, retryInput: input, retryInit: preparedInit };
}

window.fetch = async (input: RequestInfo | URL, init?: ExtendedRequestInit) => {
    const url = absoluteUrl(input);
    const isApiRequest = isBackendApiRequest(url);
    const skipGlobalError = !!init?.skipGlobalError;
    const requestSignal = init?.signal || (input instanceof Request ? input.signal : null);
    const prepared = prepareRequest(input, init, localStorage.getItem('token'));

    try {
        let response = await originalFetch(prepared.input, prepared.init);
        if (response.status === 401 && isApiRequest && !isSessionControlRequest(url)) {
            const refreshed = await refreshAuthSession();
            if (refreshed.token) {
                const retry = prepareRequest(prepared.retryInput, prepared.retryInit, refreshed.token);
                response = await originalFetch(retry.input, retry.init);
            } else if (refreshed.terminal) {
                await expireLocalSession();
            }
        }

        if (!response.ok && isApiRequest && !skipGlobalError) {
            if (response.status === 401) {
                await expireLocalSession();
            } else {
                const locale = await getCurrentLocale();
                try {
                    const data = await response.clone().json();
                    const detail = data?.detail;
                    const message = typeof detail === 'string'
                        ? detail
                        : detail?.message || detail?.code || `${locale.common.requestFailed} (${response.status})`;
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: { message, title: locale.common.requestError }
                    }));
                } catch {
                    window.dispatchEvent(new CustomEvent('global-error', {
                        detail: {
                            message: `${locale.common.requestFailed} (${response.status})`,
                            title: locale.common.requestError
                        }
                    }));
                }
            }
        }
        return response;
    } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : '';
        const errorMessage = error instanceof Error ? error.message : '';
        const requestWasAborted = requestSignal?.aborted || errorName === 'AbortError';
        if (isApiRequest && !skipGlobalError && !requestWasAborted) {
            const locale = await getCurrentLocale();
            window.dispatchEvent(new CustomEvent('global-error', {
                detail: {
                    message: errorMessage || locale.common.networkConnectFailed,
                    title: locale.common.networkError
                }
            }));
        }
        throw error;
    }
};
