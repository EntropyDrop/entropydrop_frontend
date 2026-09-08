// The main site's FastAPI router is mounted below /skin.
export function normalizeApiBase(value?: string): string {
    const base = (value?.trim() || 'http://localhost:8000/skin').replace(/\/+$/, '');
    return base.endsWith('/skin') ? base : `${base}/skin`;
}

export const API_BASE_URL = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
