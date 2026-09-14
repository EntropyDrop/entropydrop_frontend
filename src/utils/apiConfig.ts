// Standard API base origin/prefix for EntropyDrop services.
export function normalizeApiBase(value?: string): string {
    const base = (value?.trim() || 'http://localhost:8000').replace(/\/+$/, '');
    return base.replace(/\/skin$/, '');
}

export const API_BASE_URL = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
