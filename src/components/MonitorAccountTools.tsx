import { useState, type FormEvent } from 'react'
import { Icon } from '@iconify/react'
import type { LangData } from '../constants/lang'
import { apiFetch, apiResponseJson } from '../utils/api'

type Account = { email: string; username: string | null }
type GiftResult = { email: string; expires_at: string }
type Feedback = { type: 'error' | 'success'; text: string }

const inputClass = 'min-h-12 w-full min-w-0 border border-white/20 bg-black/40 px-3 text-base text-white focus-visible:outline-2 focus-visible:outline-purple-400 disabled:opacity-50'
const buttonClass = 'min-h-12 shrink-0 border border-purple-500/40 bg-purple-500/20 px-4 text-sm font-bold text-purple-300 hover:bg-purple-500/30 focus-visible:outline-2 focus-visible:outline-purple-400 disabled:opacity-50'

export function MonitorAccountTools({ current, onGift }: {
  current: LangData
  onGift: () => void
}) {
  const copy = current.monitor.accountTools
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [account, setAccount] = useState<Account | null>(null)
  const [pending, setPending] = useState<'lookup' | 'gift' | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [giftFeedback, setGiftFeedback] = useState<Feedback | null>(null)

  async function responseError(response: Response) {
    if (response.status === 404) return copy.accountNotFound
    if (response.status === 401 || response.status === 403) return current.monitor.adminAccessRequired
    const body = await response.json().catch(() => null)
    switch (body?.detail?.code) {
      case 'ambiguous_email': return copy.ambiguousEmail
      case 'active_pro_max': return copy.activeProMax
      case 'expiry_before_current': return copy.expiryBeforeCurrent
      case 'expiry_in_past': return copy.invalidExpiry
      default: return current.monitor.operationFailed
    }
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const email = String(new FormData(event.currentTarget).get('email')).trim()
    setPending('lookup')
    setAccount(null)
    setLookupError('')
    setGiftFeedback(null)
    try {
      const response = await apiFetch('/api/monitor/users/lookup', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipGlobalError: true,
      })
      if (response.ok) setAccount(await apiResponseJson(response) as Account)
      else setLookupError(await responseError(response))
    } catch {
      setLookupError(current.monitor.networkError)
    } finally {
      setPending(null)
    }
  }

  async function gift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || pending) return

    const form = event.currentTarget
    const input = form.elements.namedItem('expires_at') as HTMLInputElement
    const expiresAt = new Date(input.value)
    // A datetime-local control permits wall times skipped by a change in the local offset.
    const wallTime = expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60_000
    if (wallTime !== input.valueAsNumber || expiresAt.getTime() <= Date.now()) {
      input.setCustomValidity(copy.invalidExpiry)
      input.reportValidity()
      return
    }

    setPending('gift')
    setGiftFeedback(null)
    try {
      const response = await apiFetch('/api/monitor/users/gift-pro-plus', {
        method: 'POST',
        body: JSON.stringify({ email: account.email, expires_at: expiresAt.toISOString() }),
        skipGlobalError: true,
      })
      if (!response.ok) {
        const message = await responseError(response)
        if (response.status === 404) {
          setAccount(null)
          setLookupError(message)
        } else {
          setGiftFeedback({ type: 'error', text: message })
        }
        return
      }

      const result = await apiResponseJson(response) as GiftResult
      const expiry = new Intl.DateTimeFormat(current.lang, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(result.expires_at))
      setGiftFeedback({
        type: 'success',
        text: copy.giftSuccess.replace('{expiry}', () => expiry).replace('{email}', () => result.email),
      })
      form.reset()
      onGift()
    } catch {
      setGiftFeedback({ type: 'error', text: current.monitor.networkError })
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="flex items-start gap-3.5 border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-purple-500/30 bg-purple-500/10 text-xl text-purple-400">
        <Icon icon="pixelarticons:gift" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 id="monitor-account-tools" className={`m-0 text-sm text-white sm:text-base ${current.fontClass}`}>
          {copy.title}
        </h3>
        <form onSubmit={lookup} method="post" role="search" aria-labelledby="monitor-account-tools" className="mt-3">
          <label htmlFor="monitor-account-email" className="mb-1 block text-xs text-white/70">
            {copy.emailLabel}
          </label>
          <div className="flex max-w-xl flex-col items-start gap-2 sm:flex-row">
            <input
              id="monitor-account-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending !== null}
              className={inputClass}
              onInput={() => {
                setAccount(null)
                setLookupError('')
                setGiftFeedback(null)
              }}
            />
            <button type="submit" disabled={pending !== null} className={buttonClass}>
              {pending === 'lookup' ? copy.lookingUp : copy.lookup}
            </button>
          </div>
        </form>
        <div role="status" className="break-words text-sm">
          {lookupError && <p className="mt-2 text-red-300">{lookupError}</p>}
          {account && (
            <p className="mt-2 text-white">
              {copy.usernameLabel} <strong>{account.username?.trim() || copy.noUsername}</strong>
              {' · '}<span className="text-white/65">{account.email}</span>
            </p>
          )}
        </div>

        {account && (
          <form onSubmit={gift} method="post" aria-label={copy.giftTitle} className="mt-4 border-t border-white/10 pt-4">
            <label htmlFor="monitor-gift-expiry" className="mb-1 block text-xs text-white/70">
              {copy.expiryLabel}
            </label>
            <div className="flex max-w-xl flex-col items-start gap-2 sm:flex-row">
              <input
                id="monitor-gift-expiry"
                name="expires_at"
                type="datetime-local"
                required
                aria-describedby="monitor-gift-time-zone"
                disabled={pending !== null}
                className={`${inputClass} scheme-dark`}
                onInput={event => {
                  event.currentTarget.setCustomValidity('')
                  setGiftFeedback(null)
                }}
              />
              <button type="submit" disabled={pending !== null} className={buttonClass}>
                {pending === 'gift' ? copy.gifting : copy.giftTitle}
              </button>
            </div>
            <p id="monitor-gift-time-zone" className="mt-1 text-xs text-white/65">
              {copy.localTime.replace('{zone}', () => timeZone)}
            </p>
            <div role="status" className="break-words text-sm">
              {giftFeedback && (
                <p className={`mt-2 ${giftFeedback.type === 'error' ? 'text-red-300' : 'text-green-400'}`}>
                  {giftFeedback.text}
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
