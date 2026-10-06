import { API_BASE_URL } from './apiConfig';
import { getAuthSessionKey } from './authSession';
const originalFetch: typeof fetch = (...args) => fetch(...args);

interface RefreshResult { token: string | null; terminal: boolean }
let isAlerting = false;
let refreshInFlight: Promise<RefreshResult> | null = null;
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
    const expectedSession = getAuthSessionKey();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const options: RequestInit = {
            method: 'POST',
            headers: { Accept: 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
        };
        let response = await originalFetch(`${API_BASE_URL}/api/auth/refresh`, options);
        if (response.status === 401 || response.status === 404) {
            const fallback = await originalFetch(`${API_BASE_URL}/skin/api/auth/refresh`, options);
            // An unavailable legacy endpoint must not turn an outage into logout.
            if (fallback.status !== 404) response = fallback;
        }
        if (!response.ok) {
            if (expectedSession !== getAuthSessionKey()) return { token: null, terminal: false };
            return { token: null, terminal: response.status === 401 || response.status === 403 };
        }
        const data = await response.json().catch(() => null);
        const token = typeof data?.access_token === 'string' ? data.access_token : null;
        if (!token) return { token: null, terminal: false };
        if (expectedSession !== getAuthSessionKey()) return { token: null, terminal: false };
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

async function restoreAuthSession(): Promise<void> {
    const expectedSession = getAuthSessionKey();
    const existingToken = localStorage.getItem('token');
    const result = await refreshAuthSession();
    if (result.token || !existingToken || expectedSession !== getAuthSessionKey()) return;
    const expiresAt = jwtExpiresAt(existingToken);
    if (result.terminal && (expiresAt === null || expiresAt <= Date.now())) {
        localStorage.removeItem('token');
        window.dispatchEvent(new Event('auth-token-updated'));
    }
}

export async function revokeAuthSession(): Promise<void> {
    const expectedSession = getAuthSessionKey();
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
        if (expectedSession === getAuthSessionKey()) {
            localStorage.removeItem('token');
            window.dispatchEvent(new Event('auth-token-updated'));
        }
    }
}

export const getCurrentLocale = async () => {
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

export async function expireLocalSession() {
    const token = localStorage.getItem('token');
    if (!token || isAlerting) return;
    isAlerting = true;
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-token-updated'));
    try {
        const locale = await getCurrentLocale();
        if (getAuthSessionKey() !== null) return;
        alert(locale.common.sessionExpired);
        window.dispatchEvent(new Event('logout'));
    } finally { isAlerting = false; }
}


let bootstrap: Promise<void> | null = null;
let ready = false;
const readyListeners = new Set<() => void>();
export const isAuthReady = () => ready;
export function subscribeAuthReady(listener: () => void) {
    readyListeners.add(listener);
    return () => { readyListeners.delete(listener); };
}
export function bootstrapAuthSession(): Promise<void> {
    bootstrap ??= restoreAuthSession().finally(() => {
        ready = true;
        readyListeners.forEach(listener => listener());
    });
    return bootstrap;
}
export function waitForAuthReady(): Promise<void> { return bootstrap ?? Promise.resolve(); }
