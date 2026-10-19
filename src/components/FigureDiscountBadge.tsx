import type { LangData } from '../constants/lang'
import { useFigureOffer } from '../hooks/useFigureOffer'

export function FigureDiscountBadge({ current, bps = 0 }: { current: LangData; bps?: number }) {
    if (bps <= 0) return null
    return <span className="shrink-0 whitespace-nowrap bg-amber-400 px-1 py-0.5 text-[10px] font-bold leading-none text-[#1a1200] select-none group-hover:bg-amber-300">
        {current.figureDiscount.badge.replace('{percent}', String(bps / 100))}
    </span>
}

export function FigurePrintOfferBadge({ current }: { current: LangData }) {
    const offer = useFigureOffer('Cute DIY Kit')
    return <FigureDiscountBadge current={current} bps={offer?.global_discount_bps} />
}
