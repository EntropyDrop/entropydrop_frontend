export const paypalCategories = ['payment', 'refund_reversal', 'fee', 'transfer', 'currency_conversion', 'other'] as const
export type PayPalCategory = typeof paypalCategories[number]

export interface LedgerEntry {
    id: string
    date: string
    type: 'revenue' | 'expense'
    provider: string
    category?: string
    aggregation?: 'monthly'
    source?: string
    desc: string
    amount: string
    amount_value: number
    revenue_value?: number
    expense_value?: number
    currency: string
    status?: string
}

export interface LedgerSync {
    generated_at?: string
    paypal?: { last_synced_at?: string | null }
    aws?: { last_synced_at?: string | null }
}

function parseAmount(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    const amount = Number(String(value ?? '').replace(/[^\d.+-]/g, ''))
    return Number.isFinite(amount) ? amount : 0
}

export function formatLedgerMoney(value: number, currency: string, signed = true): string {
    const sign = value < 0 ? '-' : signed ? '+' : ''
    return `${sign}${currency} ${Math.abs(value).toFixed(2)}`
}

export function ledgerFlows(entry: LedgerEntry) {
    return {
        revenue: entry.revenue_value ?? Math.max(entry.amount_value, 0),
        expense: entry.expense_value ?? Math.min(entry.amount_value, 0),
    }
}

/** Hide legacy PayPal details during staggered deployments or stale responses. */
export function normalizePublicLedger(payload: unknown): { entries: LedgerEntry[]; sync?: LedgerSync } {
    const data = payload && typeof payload === 'object' ? payload as { entries?: unknown; sync?: LedgerSync } : {}
    const rawEntries = Array.isArray(payload) ? payload : Array.isArray(data.entries) ? data.entries : []
    const entries: LedgerEntry[] = []
    for (const value of rawEntries) {
        if (!value || typeof value !== 'object') continue
        const row = value as Partial<LedgerEntry>
        if (!['paypal', 'aws', 'bank'].includes(row.provider ?? '')) continue
        const currency = /^[A-Z]{3}$/.test(row.currency ?? '') ? row.currency! : 'USD'
        const amount = parseAmount(row.amount_value ?? row.amount)
        if (row.provider === 'paypal') {
            if (row.aggregation !== 'monthly' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.date ?? '')
                || !/^[A-Z]{3}$/.test(row.currency ?? '') || !Number.isFinite(row.amount_value)) continue
            const category = paypalCategories.includes(row.category as PayPalCategory) ? row.category as PayPalCategory : 'other'
            // Never reuse free text or identifiers supplied by a payment record.
            entries.push({
                id: `paypal-monthly:${row.date}:${currency}:${category}`,
                date: row.date!, aggregation: 'monthly', provider: 'paypal', category,
                type: amount < 0 ? 'expense' : 'revenue', currency,
                amount_value: amount, amount: formatLedgerMoney(amount, currency),
                revenue_value: Math.max(parseAmount(row.revenue_value ?? Math.max(amount, 0)), 0),
                expense_value: Math.min(parseAmount(row.expense_value ?? Math.min(amount, 0)), 0),
                desc: '', source: 'PayPal', status: 'posted',
            })
        } else {
            entries.push({ ...row, id: String(row.id ?? ''), date: String(row.date ?? ''),
                provider: row.provider!, type: amount < 0 ? 'expense' : 'revenue',
                desc: String(row.desc ?? ''), currency, amount_value: amount,
                amount: formatLedgerMoney(amount, currency) })
        }
    }
    return { entries, sync: data.sync }
}

export function summarizeLedger(entries: LedgerEntry[], provider?: string) {
    const scoped = entries.filter(entry => !provider || entry.provider === provider)
    const totals = new Map<string, number>()
    for (const entry of scoped) {
        totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + Math.round(entry.amount_value * 100))
    }
    return { count: scoped.length, totals: Array.from(totals, ([currency, cents]) => ({ currency, value: cents / 100 }))
        .sort((a, b) => a.currency.localeCompare(b.currency)) }
}
