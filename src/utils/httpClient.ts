import { API_BASE_URL } from './apiConfig';
import { getAuthSessionKey } from './authSession';
import { refreshAuthSession, expireLocalSession, waitForAuthReady, getCurrentLocale } from './authClient';
const originalFetch: typeof fetch = (...args) => fetch(...args);

export interface RequestOptions extends RequestInit {
    skipGlobalError?: boolean;
    /** Public requests skip authorization, refresh and account-change cancellation. */
    auth?: 'optional' | 'required' | 'none';
}

function absoluteUrl(input: RequestInfo | URL): URL | null {
    try {
        const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
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
    return !!url && /\/api\/auth\/(?:google|refresh|logout|config)\/?$/.test(url.pathname);
}

function prepareRequest(
    input: RequestInfo | URL,
    init: RequestOptions | undefined,
    token: string | null
): { input: RequestInfo | URL; init?: RequestInit; retryInput: RequestInfo | URL; retryInit?: RequestInit } {
    const cleanInit: RequestOptions = { ...init };
    delete cleanInit.skipGlobalError;
    delete cleanInit.auth;
    const url = absoluteUrl(input);
    const isApi = isBackendApiRequest(url);
    const shouldAuthorize = isApi && !isSessionControlRequest(url) && init?.auth !== 'none';

    if (typeof Request !== 'undefined' && input instanceof Request) {
        const headers = new Headers(cleanInit.headers || input.headers);
        if (shouldAuthorize && token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        const request = new Request(input, {
            ...cleanInit,
            headers,
            credentials: cleanInit.credentials || (isApi ? 'include' : input.credentials)
        });
        return { input: request, retryInput: request.clone() };
    }

    const headers = new Headers(cleanInit.headers || {});
    if (shouldAuthorize && token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const preparedInit: RequestInit = {
        ...cleanInit,
        headers,
        credentials: cleanInit.credentials || (isBackendApiRequest(url) ? 'include' : cleanInit.credentials)
    };
    return { input, init: preparedInit, retryInput: input, retryInit: preparedInit };
}

export const request = async (input: RequestInfo | URL, init?: RequestOptions) => {
    const url = absoluteUrl(input);
    const isApiRequest = isBackendApiRequest(url);
    const skipGlobalError = !!init?.skipGlobalError;
    const requestSignal = init?.signal || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
    if (isApiRequest && init?.auth === 'required') await waitForAuthReady();
    let session = getAuthSessionKey();
    const checkCurrent = () => {
        requestSignal?.throwIfAborted();
        if (isApiRequest && init?.auth !== 'none' && !isSessionControlRequest(url) && session !== getAuthSessionKey()) {
            throw new DOMException('Session changed while loading data', 'AbortError');
        }
    };
    checkCurrent();
    const prepared = prepareRequest(input, init, localStorage.getItem('token'));

    try {
        let response = await originalFetch(prepared.input, prepared.init);
        checkCurrent();
        if (response.status === 401 && isApiRequest && !isSessionControlRequest(url) && init?.auth !== 'none') {
            const refreshed = await refreshAuthSession();
            requestSignal?.throwIfAborted();
            if (refreshed.token) {
                if (localStorage.getItem('token') !== refreshed.token) throw new DOMException('Session changed during refresh', 'AbortError');
                session = getAuthSessionKey();
                const retryHeaders = new Headers(typeof Request !== 'undefined' && prepared.retryInput instanceof Request ? prepared.retryInput.headers : prepared.retryInit?.headers);
                retryHeaders.set('Authorization', `Bearer ${refreshed.token}`);
                const retry = prepareRequest(prepared.retryInput, { ...prepared.retryInit, headers: retryHeaders }, refreshed.token);
                response = await originalFetch(retry.input, retry.init);
                checkCurrent();
                if (response.status === 401) { await expireLocalSession(); session = getAuthSessionKey(); }
            } else if (refreshed.terminal) {
                checkCurrent();
                await expireLocalSession();
                session = getAuthSessionKey();
            } else {
                checkCurrent();
                // A temporary refresh outage is not evidence of revocation.
                // Return a retryable status so callers also retain session data.
                response = new Response(JSON.stringify({ detail: 'Session refresh temporarily unavailable. Please retry.' }), {
                    status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' }
                });
            }
        }

        checkCurrent();
        if (!response.ok && isApiRequest && !skipGlobalError) {
            if (response.status !== 401) {
                const locale = await getCurrentLocale();
                checkCurrent();
                let data: { detail?: string | { message?: string; code?: string } } | null = null;
                try {
                    data = await response.clone().json();
                } catch { /* Responses without JSON still get a localized status message. */ }
                checkCurrent();
                const detail = data?.detail;
                const message = typeof detail === 'string' ? detail
                    : detail?.message || detail?.code || `${locale.common.requestFailed} (${response.status})`;
                window.dispatchEvent(new CustomEvent('global-error', {
                    detail: { message, title: locale.common.requestError }
                }));
            }
        }
        return response;
    } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : '';
        const errorMessage = error instanceof Error ? error.message : '';
        const requestWasAborted = requestSignal?.aborted || errorName === 'AbortError';
        if (isApiRequest && !skipGlobalError && !requestWasAborted) {
            const locale = await getCurrentLocale();
            checkCurrent();
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
