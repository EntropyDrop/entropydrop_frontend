import { useEffect, useState } from 'react'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import { useAuthSession } from '../../../hooks/useAuthSession'
import type { GenerationLogItem } from '../../../types/log'
import { createFigureSource, readFigureSource, type FigureSkinSource } from './figureSource'

interface LinkedSource {
    textureUrl: string
    source: FigureSkinSource
}
type SourceError = 'unavailable' | 'loadFailed'

/**
 * Resolves `?id=` print links and never falls back to router state. Public skins load anonymously;
 * a private skin loads only for its signed-in owner, because the API returns it to no one else.
 */
export function useFigureSourceById(search: string) {
    const ids = new URLSearchParams(search).getAll('id')
    const active = ids.length > 0
    const id = ids.length === 1 && /^[a-zA-Z0-9_-]{1,80}$/.test(ids[0]) ? ids[0] : ''
    const session = useAuthSession()
    const key = JSON.stringify([ids, session])
    const [retry, setRetry] = useState(0)
    const [result, setResult] = useState<{ key: string; data?: LinkedSource; error?: SourceError } | null>(null)

    useEffect(() => {
        if (!active || !id) return
        const controller = new AbortController()
        const lookup = (signedIn: boolean) => apiFetch(`/api/logs/${encodeURIComponent(id)}`, signedIn
            ? { signal: controller.signal, auth: 'required', cache: 'no-store', skipGlobalError: true }
            : { signal: controller.signal, auth: 'none', credentials: 'omit', cache: 'no-store', skipGlobalError: true })
        void (async () => {
            try {
                let signedIn = false
                let response = await lookup(false)
                let item: GenerationLogItem | null = response.ok ? await apiResponseJson(response) : null
                // Anonymous requests cannot see a private skin, so ask again as the signed-in account.
                if (session && (response.status === 401 || response.status === 403 || (response.ok && item?.is_public === false))) {
                    signedIn = true
                    response = await lookup(true)
                    item = response.ok ? await apiResponseJson(response) : null
                }
                if (controller.signal.aborted) return
                if (!response.ok) {
                    setResult({ key, error: [401, 403, 404, 410].includes(response.status) ? 'unavailable' : 'loadFailed' })
                    return
                }
                const visible = item?.is_public === true || (signedIn && item?.is_public === false)
                if (item?.id !== id || !visible || typeof item.result !== 'string' || !item.result.trim()) {
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
    }, [active, id, key, retry, session])

    const current = active && result?.key === key ? result : null
    return { active, data: current?.data, error: active && !id ? 'unavailable' : current?.error,
        retry: () => { setResult(null); setRetry(value => value + 1) } }
}
