import { useEffect, useState } from 'react'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import type { GenerationLogItem } from '../../../types/log'
import { createFigureSource, readFigureSource, type FigureSkinSource } from './figureSource'

interface PublicSource {
    textureUrl: string
    source: FigureSkinSource
}
type SourceError = 'unavailable' | 'loadFailed'

/** Shared links resolve anonymously and never fall back to private router state. */
export function usePublicFigureSource(search: string) {
    const ids = new URLSearchParams(search).getAll('id')
    const active = ids.length > 0
    const id = ids.length === 1 && /^[a-zA-Z0-9_-]{1,80}$/.test(ids[0]) ? ids[0] : ''
    const key = JSON.stringify(ids)
    const [retry, setRetry] = useState(0)
    const [result, setResult] = useState<{ key: string; data?: PublicSource; error?: SourceError } | null>(null)

    useEffect(() => {
        if (!active || !id) return
        const controller = new AbortController()
        void (async () => {
            try {
                const response = await apiFetch(`/api/logs/${encodeURIComponent(id)}`, {
                    signal: controller.signal, auth: 'none', credentials: 'omit', cache: 'no-store', skipGlobalError: true,
                })
                if (!response.ok) {
                    if (!controller.signal.aborted) setResult({ key, error: [401, 403, 404, 410].includes(response.status) ? 'unavailable' : 'loadFailed' })
                    return
                }
                const item: GenerationLogItem | null = await apiResponseJson(response)
                if (controller.signal.aborted) return
                if (item?.id !== id || item.is_public !== true || typeof item.result !== 'string' || !item.result.trim()) {
                    setResult({ key, error: 'unavailable' })
                    return
                }
                const source = readFigureSource(createFigureSource(item))
                if (!source) { setResult({ key, error: 'unavailable' }); return }
                setResult({ key, data: { textureUrl: item.result, source } })
            } catch {
                if (!controller.signal.aborted) setResult({ key, error: 'loadFailed' })
            }
        })()
        return () => controller.abort()
    }, [active, id, key, retry])

    const current = active && result?.key === key ? result : null
    return { active, data: current?.data, error: active && !id ? 'unavailable' : current?.error,
        retry: () => { setResult(null); setRetry(value => value + 1) } }
}
