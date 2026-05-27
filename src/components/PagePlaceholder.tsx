import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'

interface PagePlaceholderProps {
    titleKey: keyof LangData['nav']
    current: LangData
}

export function PagePlaceholder({ titleKey, current }: PagePlaceholderProps) {
    const title = (current.nav as any)[titleKey]
    const buildingText = current.placeholder.building
    const soonText = current.placeholder.soon

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-12 pt-32 box-border pointer-events-none">
            <div className="w-full max-w-7xl h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-md p-8 border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
                <Icon icon="pixelarticons:construction" className="text-9xl text-white/10 mb-8" />
                <h2 className={`text-white text-3xl m-0 ${current.fontClass}`}>{title} {buildingText}</h2>
                <p className={`text-white/40 mt-4 ${current.fontClass}`}>{soonText}</p>
            </div>
        </div>
    )
}
