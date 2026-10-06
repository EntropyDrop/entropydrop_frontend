import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { fetchDiscoveryItems } from '../utils/discovery'
import type { GenerationLogItemBrief } from '../types/log'

const DiscoveryScene = lazy(() => import('./DiscoveryScene').then(module => ({ default: module.DiscoveryScene })))

interface DiscoveryBackgroundProps {
    selected: GenerationLogItemBrief | null
    onSelect: (item: GenerationLogItemBrief | null) => void
    onLoading: (isLoading: boolean) => void
    paused?: boolean
    fallback: ReactNode
}

/** The request starts when the lightweight shell commits, even if the scene suspends. */
export function DiscoveryBackground({ fallback, ...sceneProps }: DiscoveryBackgroundProps) {
    const [items, setItems] = useState<GenerationLogItemBrief[] | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        void fetchDiscoveryItems(controller.signal)
            .then(data => {
                if (!controller.signal.aborted) setItems(data)
            })
            .catch(error => {
                if (controller.signal.aborted) return
                console.error('Discovery fetch failed:', error)
                setItems([])
            })
        return () => controller.abort()
    }, [])

    return (
        <Suspense fallback={fallback}>
            <DiscoveryScene {...sceneProps} items={items} />
        </Suspense>
    )
}
