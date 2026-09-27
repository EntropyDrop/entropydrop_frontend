import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PageContainer } from '../components/PageContainer'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { useAuthSession } from '../hooks/useAuthSession'
import { apiFetch } from '../utils/api'
import { isSpaceTokenValid } from '../utils/spaceLogin'
import type { LangData } from '../constants/lang'

const base = '/space/api/v2/agent-authorizations'
const button = 'inline-flex items-center justify-center border border-white/20 px-5 py-2.5 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
type Grant = {
    name: string
    status: 'pending' | 'approved' | 'claimed' | 'denied'
    expires_at: string
    account: { id: string; email: string }
}

export function SpaceAuthorizePage({ current }: { current: LangData }) {
    const session = useAuthSession()
    const location = useLocation()
    // The pairing code is public; private device codes and API keys never enter this page.
    const suppliedCode = new URLSearchParams(location.hash.slice(1)).get('code') || ''
    const [enteredCode, setEnteredCode] = useState('')
    const [manualCode, setManualCode] = useState('')
    const [loginError, setLoginError] = useState('')
    const [signingIn, setSigningIn] = useState(false)
    const text = current.space_authorize
    const code = suppliedCode || manualCode

    const login = async ({ credential }: { credential?: string }) => {
        if (!credential || signingIn) return
        setSigningIn(true)
        setLoginError('')
        try {
            const response = await apiFetch('/api/auth/google', {
                method: 'POST', body: JSON.stringify({ token: credential }), skipGlobalError: true,
            })
            if (!response.ok) throw new Error('Login failed')
            const data = await response.json()
            if (!isSpaceTokenValid(data.access_token)) throw new Error('Invalid login response')
            localStorage.setItem('token', data.access_token)
            window.dispatchEvent(new Event('auth-token-updated'))
        } catch { setLoginError(text.loginFailed) }
        finally { setSigningIn(false) }
    }

    return <PageContainer maxWidth="max-w-xl" alignItems="items-stretch" className={current.fontClass}>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
        <header className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-widest text-green-300">EntropyDrop Space / Agent Build</span>
            <h1 className="m-0 text-2xl sm:text-3xl font-bold">{text.title}</h1>
            <p className="m-0 text-sm leading-relaxed text-white/65">{text.intro}</p>
        </header>
        {!code && <form className="flex flex-col gap-3" onSubmit={(event: FormEvent) => {
            event.preventDefault()
            setManualCode(enteredCode.trim().toUpperCase())
        }}>
            <label htmlFor="agent-pairing-code" className="text-sm">{text.codeLabel}</label>
            <input id="agent-pairing-code" value={enteredCode} onChange={event => setEnteredCode(event.target.value)}
                required minLength={8} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                placeholder="XXXX-XXXX-XXXX" className="border border-white/20 bg-black/40 px-4 py-3 font-mono" />
            <p className="m-0 text-xs text-white/50">{text.manual}</p>
            <button type="submit" className={button}>{text.review}</button>
        </form>}
        {code && <div className="border border-green-400/30 bg-green-950/20 p-5 text-center">
            <div className="mb-2 text-xs text-green-300">{text.codeLabel}</div>
            <code className="text-xl sm:text-2xl tracking-widest break-all">{code}</code>
        </div>}
        {!session ? <section className="flex flex-col items-center gap-4 border border-white/15 p-6">
            <h2 className="m-0 text-lg">{text.signIn}</h2>
            <p className="m-0 text-sm text-white/60">{text.signInHelp}</p>
            {signingIn ? <p role="status">{text.loading}</p> : <GoogleSignInButton onSuccess={login}
                onError={() => setLoginError(text.loginFailed)} configErrorText={text.loginUnavailable} loadingText={text.loginLoading} />}
            {loginError && <p role="alert" className="text-sm text-red-300">{loginError}</p>}
        </section> : code ? <Consent key={`${session}:${code}`} code={code} current={current} /> : null}
        <nav className="flex flex-wrap gap-5 text-sm">
            <Link to="/space/apikeys" className="text-green-300 underline underline-offset-4">{text.manage}</Link>
            <Link to="/space/intro" className="text-white/60 underline underline-offset-4">{text.back}</Link>
        </nav>
    </PageContainer>
}

function Consent({ code, current }: { code: string; current: LangData }) {
    const text = current.space_authorize
    const [grant, setGrant] = useState<Grant | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [reload, setReload] = useState(0)
    const [clock, setClock] = useState(Date.now())

    useEffect(() => {
        const timer = window.setInterval(() => setClock(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    const failureText = (status: number, body: { detail?: { code?: string }; error?: string }) => {
        const code = body.detail?.code || body.error
        if (status === 410) return text.expired
        if (code === 'AGENT_AUTHORIZATION_ACCOUNT_MISMATCH') return text.mismatch
        if (status === 401 || status === 403) return text.signInHelp
        if (code === 'authorization_already_decided') return text.decided
        return text.failed
    }

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        setGrant(null)
        void (async () => {
            try {
                const response = await apiFetch(`${base}/inspect`, {
                    method: 'POST', body: JSON.stringify({ user_code: code }),
                    signal: controller.signal, skipGlobalError: true,
                })
                const body = await response.json()
                if (!response.ok) throw new Error(failureText(response.status, body))
                if (!['pending', 'approved', 'claimed', 'denied'].includes(body.status)
                    || typeof body.name !== 'string' || typeof body.account?.email !== 'string'
                    || !Number.isFinite(Date.parse(body.expires_at))) throw new Error(text.failed)
                if (!controller.signal.aborted) setGrant(body)
            } catch (failure) {
                if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : text.failed)
            } finally { if (!controller.signal.aborted) setLoading(false) }
        })()
        return () => controller.abort()
        // Locale changes refresh the translated failure state along with the request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, reload, text])

    const expired = grant !== null && Date.parse(grant.expires_at) <= clock
    const decide = async (approve: boolean) => {
        if (!grant || busy || expired || grant.status !== 'pending') return
        setBusy(true)
        setError('')
        try {
            const response = await apiFetch(`${base}/decision`, {
                method: 'POST', body: JSON.stringify({ user_code: code, approve }), skipGlobalError: true,
            })
            const body = await response.json()
            if (!response.ok) throw new Error(failureText(response.status, body))
            if (!['approved', 'claimed', 'denied'].includes(body.status)) throw new Error(text.failed)
            setGrant(previous => previous && { ...previous, status: body.status })
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : text.failed)
            setGrant(null)
        } finally { setBusy(false) }
    }

    if (loading) return <p role="status" className="text-sm text-white/60">{text.loading}</p>
    return <section className="flex flex-col gap-5" aria-busy={busy}>
        {error && <div role="alert" className="border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-200">
            {error} <button className={`${button} mt-3`} onClick={() => setReload(value => value + 1)}>{text.retry}</button>
        </div>}
        {grant && <>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-white/50">{text.account}</dt><dd className="m-0 break-all">{grant.account.email}</dd>
                <dt className="text-white/50">{text.agent}</dt><dd className="m-0 break-words">{grant.name}</dd>
            </dl>
            {grant.status === 'pending' ? <>
                <p className="m-0 text-xs text-white/50 leading-relaxed">{text.nameHelp}</p>
                <div className="border border-white/15 bg-white/[0.03] p-5 flex flex-col gap-3">
                    <h2 className="m-0 text-lg text-green-200">{text.permissions}</h2>
                    <p className="m-0 text-sm text-white/70 leading-relaxed">{text.permissionHelp}</p>
                    <p className="m-0 text-sm text-white/55 leading-relaxed">{text.keyHelp}</p>
                </div>
                <p role={expired ? 'alert' : undefined} className="m-0 text-xs text-white/55">
                    {expired ? text.expired : `${text.expires}: ${new Date(grant.expires_at).toLocaleTimeString()}`}
                </p>
                <div className="flex gap-3">
                    <button type="button" className={`${button} flex-1 bg-[#3c8527] hover:bg-[#489c30] border-green-500/40`}
                        disabled={busy || expired} onClick={() => { void decide(true) }}>{busy ? text.working : text.approve}</button>
                    <button type="button" className={button} disabled={busy || expired} onClick={() => { void decide(false) }}>{text.deny}</button>
                </div>
            </> : <div role="status" className="border border-green-400/30 bg-green-950/20 p-5">
                <h2 className="m-0 mb-3 text-lg">{grant.status === 'denied' ? text.denied : text.approved}</h2>
                <p className="m-0 text-sm text-white/70 leading-relaxed">{grant.status === 'denied' ? text.deniedHelp : text.approvedHelp}</p>
            </div>}
        </>}
    </section>
}
