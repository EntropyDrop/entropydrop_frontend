import { useLayoutEffect, useRef, type CSSProperties } from 'react'

/** Copy cached pixels directly, without PNG encoding, Base64 or a second decode. */
export function CanvasImage({ source, alt = '', className, style }: {
    source: HTMLCanvasElement
    alt?: string
    className?: string
    style?: CSSProperties
}) {
    const ref = useRef<HTMLCanvasElement>(null)
    useLayoutEffect(() => {
        const canvas = ref.current
        if (!canvas) return
        canvas.width = source.width
        canvas.height = source.height
        const context = canvas.getContext('2d')
        if (!context) return
        context.imageSmoothingEnabled = false
        context.drawImage(source, 0, 0)
        return () => { canvas.width = canvas.height = 1 }
    }, [source])
    return <canvas ref={ref} role={alt ? 'img' : undefined} aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true} className={className} style={style} />
}
