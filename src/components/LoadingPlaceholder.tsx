import { type LangData } from '../constants/lang'

interface LoadingPlaceholderProps {
    text?: string
    current?: LangData
    className?: string
}

interface LoadingSpinnerProps {
    className?: string
}

export function LoadingSpinner({ className = "w-8 h-8 border-2" }: LoadingSpinnerProps) {
    return (
        <div
            className={`${className} border-green-500 animate-spin`}
            aria-hidden="true"
        />
    )
}

export function LoadingPlaceholder({ text, current, className = "" }: LoadingPlaceholderProps) {
    const loadingText = text || current?.mcmodal?.loading || (navigator.language.toLowerCase().startsWith('zh') ? '加载中...' : 'Loading...')
    const fontClass = current?.fontClass || ""

    return (
        <div className={`absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 ${className}`}>
            <div className="flex flex-col items-center justify-center gap-4 p-8 border border-white/10 bg-black/40 shadow-2xl scale-95 animate-in zoom-in-95 duration-300">
                <LoadingSpinner />
                <p className={`text-white/80 text-lg m-0 ${fontClass} animate-pulse`}>
                    {loadingText}
                </p>
            </div>
        </div>
    )
}
