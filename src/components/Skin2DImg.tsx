import { useEffect, useRef, useState } from "react"
import { Skin2D } from "./utils"
import { CanvasImage } from './CanvasImage'

export function Skin2DImg({
    src,
    className,
    style,
    scale = 8,
    cuteMode = false,
    showRawFallback = false
}: {
    className?: string
    src: string
    style?: React.CSSProperties
    scale?: number
    cuteMode?: boolean
    showRawFallback?: boolean
}) {
    const renderKey = `${src}|${scale}|${cuteMode}`
    const placeholder = useRef<HTMLCanvasElement>(null)
    const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
    const [renderState, setRenderState] = useState<{ key: string; canvas: HTMLCanvasElement | null; error: boolean }>({
        key: '',
        canvas: null,
        error: false
    })

    useEffect(() => {
        if (visible || !placeholder.current) return
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setVisible(true)
                observer.disconnect()
            }
        }, { rootMargin: '200px' })
        observer.observe(placeholder.current)
        return () => observer.disconnect()
    }, [visible, src])

    useEffect(() => {
        let active = true

        if (!src || !visible) {
            return () => {
                active = false
            }
        }

        Skin2D(src, { scale, cuteMode }).then(result => {
            if (!active) return
            setRenderState({
                key: renderKey,
                canvas: result,
                error: false
            })
        }).catch(err => {
            if (!active) return
            console.error("Skin2D render failed", err)
            setRenderState({
                key: renderKey,
                canvas: null,
                error: true
            })
        })

        return () => {
            active = false
        }
    }, [src, scale, cuteMode, renderKey, visible]);

    const isCurrentRender = renderState.key === renderKey
    const canvas = isCurrentRender ? renderState.canvas : null
    const error = isCurrentRender ? renderState.error : false

    if (!src) return null
    if (!visible) return <canvas ref={placeholder} width={1} height={1} aria-hidden
        className={className} style={{ ...style, opacity: 0 }} />
    if (canvas) return <CanvasImage source={canvas} className={className} style={style} />
    if (!error && !showRawFallback) return null
    return <img src={src} crossOrigin="anonymous" alt="" className={className} style={style} decoding="async" loading="lazy" />
}
