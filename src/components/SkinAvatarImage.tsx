import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { SkinAvatar } from './utils'
import { CanvasImage } from './CanvasImage'

interface SkinAvatarImageProps {
    textureUrl?: string | null
    fallbackSrc?: string | null
    alt?: string
    className?: string
    framed?: boolean
}

interface RenderedAvatarState {
    textureUrl: string
    canvas: HTMLCanvasElement
}

export function SkinAvatarImage({
    textureUrl,
    fallbackSrc,
    alt = 'avatar',
    className = '',
    framed = true,
}: SkinAvatarImageProps) {
    const [renderedAvatar, setRenderedAvatar] = useState<RenderedAvatarState | null>(null)

    useEffect(() => {
        let cancelled = false

        if (!textureUrl) return

        SkinAvatar(textureUrl, { scale: 10, showOverlay: true, overlayInflated: true })
            .then(canvas => {
                if (!cancelled) {
                    setRenderedAvatar({
                        textureUrl,
                        canvas,
                    })
                }
            })
            .catch(err => {
                console.warn('Failed to render Minecraft avatar:', err)
            })

        return () => {
            cancelled = true
        }
    }, [textureUrl])

    const currentRenderedAvatar = renderedAvatar
    const avatar = currentRenderedAvatar && currentRenderedAvatar.textureUrl === textureUrl
        ? currentRenderedAvatar.canvas
        : null

    return (
        <div className={`${framed ? 'bg-[#555] border border-black' : 'bg-transparent'} overflow-hidden shrink-0 flex items-center justify-center ${className}`}>
            {avatar ? <CanvasImage source={avatar} alt={alt} className="w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }} /> : fallbackSrc ? (
                <img
                    src={fallbackSrc}
                    alt={alt}
                    className="w-full h-full object-cover"
                />
            ) : (
                <Icon icon="pixelarticons:user" className="text-white/40 text-lg" />
            )}
        </div>
    )
}
