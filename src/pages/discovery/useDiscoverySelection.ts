import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GenerationLogItemBrief } from '../../types/log'

/** Router state owns the selection, including deep links and browser back/forward. */
export function useDiscoverySelection() {
    const [params, setParams] = useSearchParams()
    const [preview, setPreview] = useState<GenerationLogItemBrief | null>(null)
    const view: 'list' | '3d' = params.get('view') === 'list' ? 'list' : '3d'
    const id = params.get('id')
    const selected = id ? (preview?.id === id ? preview : { id, result: '', prompt: '', is_public: true }) : null
    const select = (item: GenerationLogItemBrief | null) => {
        setPreview(item)
        setParams(previous => {
            const next = new URLSearchParams(previous)
            if (item) next.set('id', item.id)
            else next.delete('id')
            return next
        })
    }
    const setView = (mode: 'list' | '3d') => setParams(previous => {
        const next = new URLSearchParams(previous)
        if (mode === 'list') next.set('view', 'list')
        else next.delete('view')
        return next
    })
    return { view, selected, select, setView }
}
