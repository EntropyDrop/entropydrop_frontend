import { useEffect, useMemo, useRef } from 'react'
import type { RootState } from '@react-three/fiber'

interface CanvasContextHandlerOptions {
    onContextLost?: () => void
    onContextRestored?: () => void
}

/**
 * Attaches WebGL context loss/restore listeners to an R3F canvas and detaches
 * them on unmount before R3F's deferred forceContextLoss cleanup runs.
 */
export function useCanvasContextHandlers({
    onContextLost,
    onContextRestored,
}: CanvasContextHandlerOptions = {}) {
    const callbacksRef = useRef({ onContextLost, onContextRestored })
    const cleanupRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        callbacksRef.current = { onContextLost, onContextRestored }
    }, [onContextLost, onContextRestored])

    useEffect(() => () => {
        cleanupRef.current?.()
    }, [])

    return useMemo(() => ({ gl, invalidate }: Pick<RootState, 'gl' | 'invalidate'>) => {
        cleanupRef.current?.()
        const canvas = gl?.domElement
        if (!canvas) return

        const handleContextLost = (event: Event) => {
            event.preventDefault()
            callbacksRef.current.onContextLost?.()
        }
        const handleContextRestored = () => {
            callbacksRef.current.onContextRestored?.()
            invalidate()
        }

        canvas.addEventListener('webglcontextlost', handleContextLost, false)
        canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
        cleanupRef.current = () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost, false)
            canvas.removeEventListener('webglcontextrestored', handleContextRestored, false)
            cleanupRef.current = null
        }
    }, [])
}
