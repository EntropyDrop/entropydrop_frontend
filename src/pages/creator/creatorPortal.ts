import { useEffect, useState } from 'react'
import type { LangData } from '../../constants/lang'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { getAuthSessionKey } from '../../utils/authSession'

export const creatorButton = 'border border-white/20 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
export const creatorInput = 'w-full min-w-0 border border-white/20 bg-black/20 px-3 py-2 text-sm text-white'
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
export interface PageResult<T> { items: T[]; total: number; page: number; page_size: number; total_pages: number; payouts_enabled?: boolean }
export interface PayoutRecord {
    id: string; amount_cents: number; currency: string; paypal_email: string; creator_email?: string; status: string
    created_at: string; updated_at: string; reviewed_at?: string; review_note?: string; last_error?: string
    paypal_batch_id?: string; paypal_transaction_id?: string; paypal_status?: string
    events: { status: string; event: string; created_at: string }[]
}
export interface CreatorBalance { available_cents: number; pending_cents: number; reserved_cents: number; paid_cents: number; adjustment_cents: number; earned_cents: number }
export interface CreatorSummary { balance: CreatorBalance; payouts_enabled: boolean; codes: { code: string; active: boolean; usable: boolean; expires_at?: string; discount_percent: number; commission_percent: number }[] }
export interface ReferredUser { reference: string; email: string; code: string; referred_at: string }
export interface ReferredOrder { reference: string; customer_reference: string; email: string; code: string; created_at: string; product_amount_cents: number; commission_cents: number; status: string }

export function creatorPortalError(detail: unknown, current: LangData) {
    const t = current.creatorPortal
    const messages: Record<string, string> = {
        creator_user_not_found: t.userNotFound, creator_owner_locked: t.ownerLocked,
        creator_required: t.restricted, creator_insufficient_balance: t.insufficient,
        creator_request_conflict: t.requestConflict, creator_payout_changed: t.changed,
        creator_payouts_disabled: t.disabled, creator_rejection_reason_required: t.reasonRequired,
    }
    return typeof detail === 'string' && messages[detail] || t.failed
}

export function useCreatorResource<T>(path: string, reload: number, current: LangData) {
    const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null)
    const key = `${getAuthSessionKey()}:${path}:${reload}`
    useEffect(() => {
        const controller = new AbortController()
        const session = getAuthSessionKey()
        void (async () => {
            try {
                const response = await apiFetch(path, { auth: 'required', signal: controller.signal, skipGlobalError: true, cache: 'no-store' })
                const data = await apiResponseJson(response)
                if (!response.ok) throw new Error(creatorPortalError(data.detail, current))
                if (!controller.signal.aborted && session === getAuthSessionKey()) setResult({ key, data })
            } catch (error) {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setResult({ key, error: error instanceof Error ? error.message : current.creatorPortal.failed })
            }
        })()
        return () => controller.abort()
    }, [path, reload, key, current])
    const value = result?.key === key ? result : null
    return { data: value?.data, error: value?.error, loading: !value }
}
