import type { LangData } from '../../../constants/lang'
import { useFigureOffer } from '../../../hooks/useFigureOffer'
import { FigureDiscountBadge } from '../../../components/FigureDiscountBadge'

export function FigureKitPrice({ modelType, current }: { modelType: string; current: LangData }) {
    const offer = useFigureOffer(modelType)
    if (!offer) return null
    const discounted = (offer.global_discount_bps ?? 0) > 0 && Number.isFinite(offer.discounted_price)
    const format = (price: number) => `$${price.toFixed(2).replace(/\.00$/, '')}`
    return <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
        <span className="whitespace-nowrap">· {discounted ? <><del className="text-white/60">{format(offer.price)}</del> <strong>{format(offer.discounted_price!)}</strong></> : format(offer.price)}</span>
        {discounted && <FigureDiscountBadge current={current} bps={offer.global_discount_bps} />}
    </span>
}
