import type { StickerInfo } from './stickerInfo'

export interface OrderStickerSnapshot {
    schema_version: 1
    origin: 'order' | 'legacy_backfill'
    brand: string
    model_name: string
    skin_id: string
    skin_name: string
    publisher_id: string
    publisher_name: string
    source_url: string
    labels: { publisher: string; user_id: string; source: string }
    missing_fields: string[]
}

export interface OrderStickerRecord { sticker_snapshot?: OrderStickerSnapshot | null }

export function orderStickerInfo(snapshot: OrderStickerSnapshot): StickerInfo {
    return {
        brand: snapshot.brand, modelName: snapshot.model_name,
        name: snapshot.skin_name, publisher: snapshot.publisher_name, publisherId: snapshot.publisher_id,
        sourceId: snapshot.skin_id, sourceUrl: snapshot.source_url,
        labels: { publisher: snapshot.labels.publisher, userId: snapshot.labels.user_id, source: snapshot.labels.source },
    }
}
