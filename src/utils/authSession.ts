/** Stable across access-token refresh, different across account changes. */
export function getAuthSessionKey(): string | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')));
        if (typeof payload.sub === 'string') return payload.sub;
    } catch {
        // Older opaque tokens still notify subscribers when changed.
    }
    return token;
}

export function subscribeAuthSession(listener: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === 'token' || event.key === null) listener();
    };
    window.addEventListener('auth-token-updated', listener);
    window.addEventListener('logout', listener);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener('auth-token-updated', listener);
        window.removeEventListener('logout', listener);
        window.removeEventListener('storage', onStorage);
    };
}
