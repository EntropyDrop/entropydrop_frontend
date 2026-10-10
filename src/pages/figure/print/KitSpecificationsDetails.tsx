import type { OrderStickerRecord } from './orderSticker'
import type { LangData } from '../../../constants/lang'
import type { KitSpecifications, KitSpecificationRecord } from './kitSpecifications'

export function KitSpecificationsDetails({ specifications, skinId, current }: {
    specifications: KitSpecifications
    skinId?: string | null
    current: LangData
}) {
    const t = current.figurePrint.commissionOrder
    return <div className="flex flex-col gap-5 text-xs leading-relaxed">
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3">
            <dt className="text-white/50">{t.productName}</dt><dd className="m-0 break-words text-right text-[#84c96b]">{specifications.product_name}</dd>
            {skinId && <><dt className="text-white/50">{t.customSkinId}</dt><dd className="m-0 break-all text-right select-all">{skinId}</dd></>}
            <dt className="text-white/50">{t.dimensions}</dt><dd className="m-0 text-right">{specifications.dimensions}</dd>
        </dl>
        <div className="border-t border-white/10 pt-4">
            <h3 className="m-0 mb-3 text-xs text-white/80">{t.contentsTitle}</h3>
            <ul className="m-0 list-disc pl-4 space-y-2 text-white/80">
                {specifications.materials.map((material, index) => <li key={index}>{material.name} ×{material.quantity}{material.description && <> — {material.description}</>}</li>)}
            </ul>
        </div>
        <p className="m-0 text-white/65">{specifications.assembly_note}</p>
    </div>
}

export function OrderKitDetails({ item, current }: {
    item: KitSpecificationRecord & OrderStickerRecord & { refer_log_id?: string | null }
    current: LangData
}) {
    const specifications = item.kit_specifications_snapshot || item.kit_specifications_current
    return <details className="mt-2 border-t border-white/10 pt-2 text-xs">
        <summary className="cursor-pointer text-[#a6df7a]">{current.orders.kitDetails}</summary>
        <div className="pt-3">
            {!item.kit_specifications_snapshot && <p className="mt-0 text-[10px] leading-relaxed text-white/50">{specifications ? current.orders.currentKitSpecifications : current.orders.kitSpecificationsUnavailable}</p>}
            {specifications && <KitSpecificationsDetails specifications={specifications} skinId={item.sticker_snapshot?.skin_id || item.refer_log_id} current={current} />}
            {item.sticker_snapshot && <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/65 space-y-2">
                <p className="m-0">{current.orders.stickerSkinName}: {item.sticker_snapshot.skin_name || '—'}</p>
                <p className="m-0 break-words">{current.figurePrint.publisher}: {item.sticker_snapshot.publisher_name || '—'}</p>
                <p className="m-0 break-all">{current.figurePrint.stickerInfo.userId}: {item.sticker_snapshot.publisher_id || '—'}</p>
                {item.sticker_snapshot.origin === 'legacy_backfill' && <p className="m-0 text-[10px] text-amber-200/70">{current.orders.legacyStickerSnapshot}</p>}
            </div>}
        </div>
    </details>
}
