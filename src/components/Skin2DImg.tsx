import { useEffect, useState } from "react"
import { Skin2D } from "./utils"

export function Skin2DImg({
    src,
    className,
    style,
    scale = 8,
    showRawFallback = false
}: {
    className?: string
    src: string
    style?: React.CSSProperties
    scale?: number
    showRawFallback?: boolean
}) {
    const renderKey = `${src}|${scale}`
    const [renderState, setRenderState] = useState<{ key: string; base64: string | null; error: boolean }>({
        key: '',
        base64: null,
        error: false
    })

    useEffect(() => {
        let active = true

        if (!src) {
            return () => {
                active = false
            }
        }

        Skin2D(src, { scale }).then(result => {
            if (!active) return
            setRenderState({
                key: renderKey,
                base64: result.toDataURL('image/png'),
                error: false
            })
        }).catch(err => {
            if (!active) return
            console.error("Skin2D render failed", err)
            setRenderState({
                key: renderKey,
                base64: null,
                error: true
            })
        })

        return () => {
            active = false
        }
    }, [src, scale, renderKey]);

    const isCurrentRender = renderState.key === renderKey
    const base64 = isCurrentRender ? renderState.base64 : null
    const error = isCurrentRender ? renderState.error : false

    if (!src) return null
    if (!base64 && !error && !showRawFallback) return null

    if (error) {
        return <img src={src} crossOrigin="anonymous" alt="" className={className} style={style} />
    }

    return <img src={base64 || (showRawFallback ? src : undefined)} crossOrigin={base64 ? undefined : "anonymous"} alt="" className={className} style={style} />
}
