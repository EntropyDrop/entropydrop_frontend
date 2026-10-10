import type { KitSpecificationRecord } from './kitSpecifications'
import type { OrderStickerRecord } from './orderSticker'

export interface FigureOrderItem extends KitSpecificationRecord, OrderStickerRecord {
    id: string
    skin_url?: string | null
    refer_log_id?: string | null
    model_type: string
    price: number
}

/** The API stores one item (and a skin snapshot) per kit, including older orders. */
export function groupOrderItems<T extends FigureOrderItem>(items: T[]) {
    const groups = new Map<string, { item: T; ids: string[]; quantity: number; subtotal: number }>()
    for (const item of items) {
        // Keep different purchase specifications and legacy/current data separate.
        const key = JSON.stringify([item.refer_log_id || item.id, item.model_type, item.price,
            item.kit_specifications_snapshot ?? null, item.kit_specifications_current ?? null, item.sticker_snapshot ?? null])
        const group = groups.get(key)
        if (group) {
            group.ids.push(item.id)
            group.quantity++
            group.subtotal = group.quantity * item.price
        } else {
            groups.set(key, { item, ids: [item.id], quantity: 1, subtotal: item.price })
        }
    }
    return [...groups.values()]
}
