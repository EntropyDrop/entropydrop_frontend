export function resolveSpaceDestination(candidate: string | null, fallback: string, pageUrl: string): URL {
    const defaultUrl = new URL(fallback, pageUrl);
    try {
        const url = new URL(candidate || fallback, pageUrl);
        const page = new URL(pageUrl);
        const allowedOrigin = url.origin === defaultUrl.origin || url.origin === 'https://space.entropydrop.com';
        const localMount = url.origin === page.origin && /^\/space\/app(?:\/|$)/.test(url.pathname);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || (!allowedOrigin && !localMount)
            || (url.origin === page.origin && !localMount)) return defaultUrl;
        url.searchParams.delete('token');
        return url;
    } catch {
        return defaultUrl;
    }
}

export function spaceDestinationWithToken(target: URL, token: string | null, pageOrigin: string): string {
    const url = new URL(target);
    const hash = new URLSearchParams(url.hash.slice(1));
    hash.delete('token');
    if (token && url.origin !== pageOrigin) hash.set('token', token);
    url.hash = hash.toString();
    return url.href;
}

export function isSpaceTokenValid(token: string | null): boolean {
    if (!token) return false;
    try {
        const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')));
        return Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now() + 10_000;
    } catch {
        return false;
    }
}
