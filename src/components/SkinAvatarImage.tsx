import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { SkinAvatar } from './utils'

interface SkinAvatarImageProps {
    textureUrl?: string | null
    fallbackSrc?: string | null
    alt?: string
    className?: string
    framed?: boolean
}

interface RenderedAvatarState {
    textureUrl: string
    src: string
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
                        src: canvas.toDataURL('image/png'),
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
    const avatarSrc = currentRenderedAvatar && currentRenderedAvatar.textureUrl === textureUrl
        ? currentRenderedAvatar.src
        : null
    const src = avatarSrc || fallbackSrc

    return (
        <div className={`${framed ? 'bg-[#555] border border-black' : 'bg-transparent'} overflow-hidden shrink-0 flex items-center justify-center ${className}`}>
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: avatarSrc ? 'pixelated' : 'auto' }}
                />
            ) : (
                <Icon icon="pixelarticons:user" className="text-white/40 text-lg" />
            )}
        </div>
    )
}
