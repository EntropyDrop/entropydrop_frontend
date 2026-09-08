import { API_BASE_URL } from './apiConfig';
import { getAuthSessionKey } from './authSession';
export { API_BASE_URL } from './apiConfig';

interface RequestOptions extends RequestInit {
    // Add any custom options here
    skipGlobalError?: boolean;
}

export const apiFetch = async (path: string, options: RequestOptions = {}) => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    
    const headers = new Headers(options.headers || {});
    
    const token = localStorage.getItem('token');
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Default Content-Type to application/json if body is present and not FormData
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const session = getAuthSessionKey();
    const response = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials || 'include'
    });

    if (!/\/api\/auth\/(google|refresh|logout)/.test(url) && session !== getAuthSessionKey()) {
        throw new DOMException('Session changed while loading data', 'AbortError');
    }
    return response;
};
