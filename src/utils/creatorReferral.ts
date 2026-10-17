const storageKey = 'creator_referral'
export const referralEvent = 'creator-referral-updated'
export interface ReferralReceipt { token: string; code: string; expires_at: string }

export function referralCode(search: string): string | null {
    const values = new URLSearchParams(search).getAll('ref')
    const code = values.length === 1 ? values[0].trim().toUpperCase() : ''
    return /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code) ? code : null
}

export function readReferralReceipt(): ReferralReceipt | null {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) || 'null')
        return value && typeof value.token === 'string' && typeof value.code === 'string'
            && Date.parse(value.expires_at) > Date.now() ? value : null
    } catch { return null }
}

export function saveReferralReceipt(receipt: ReferralReceipt) {
    try { localStorage.setItem(storageKey, JSON.stringify(receipt)) } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event(referralEvent))
}

export function clearReferralReceipt(token: string) {
    try { if (readReferralReceipt()?.token === token) localStorage.removeItem(storageKey) } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event(referralEvent))
}

export function googleLoginPayload(token: string | undefined) {
    const receipt = readReferralReceipt()
    return { token, ...(receipt ? { referral_token: receipt.token } : {}) }
}
