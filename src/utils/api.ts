export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface RequestOptions extends RequestInit {
    // Add any custom options here
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

    const response = await fetch(url, {
        ...options,
        headers
    });

    return response;
};
