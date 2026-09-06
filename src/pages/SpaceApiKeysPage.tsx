import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { ConfirmModal } from '../components/ConfirmModal'
import { type LangData } from '../constants/lang'
import { API_BASE_URL, apiFetch } from '../utils/api'
import { SpaceApiKeyClient, SpaceApiKeyError, type SpaceApiKeyRecord } from '../../apps/space/src/bootstrap/SpaceApiKeyClient'
import { spaceAgentConnection, spaceAgentPrompt } from '../../apps/space/src/bootstrap/SpaceAgentGuide'

// Used only to isolate UI state between accounts. The API validates credentials.
function currentAccountId(): string | null {
    const token = localStorage.getItem('token')
    if (!token) return null
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return typeof payload.sub === 'string' ? payload.sub : null
    } catch {
        return null
    }
}

const buttonClass = 'inline-flex items-center justify-center gap-2 border border-white/20 px-4 py-2 text-sm text-white/85 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
const linkClass = 'inline-flex items-center gap-2 text-sm text-green-300 underline underline-offset-4 hover:text-green-200'

export function SpaceApiKeysPage({ current }: { current: LangData }) {
    const text = current.space_api_keys
    const [accountId, setAccountId] = useState(currentAccountId)
    const [copyMessage, setCopyMessage] = useState('')
    const connection = spaceAgentConnection(new URL(import.meta.env.VITE_SPACE_API_BASE_URL || API_BASE_URL, window.location.href).href)

    useEffect(() => {
        const update = () => setAccountId(currentAccountId())
        const logout = () => setAccountId(null)
        window.addEventListener('auth-token-updated', update)
        window.addEventListener('user-updated', update)
        window.addEventListener('storage', update)
        window.addEventListener('logout', logout)
        return () => {
            window.removeEventListener('auth-token-updated', update)
            window.removeEventListener('user-updated', update)
            window.removeEventListener('storage', update)
            window.removeEventListener('logout', logout)
        }
    }, [])

    return <PageContainer maxWidth="max-w-5xl" alignItems="items-start" className={current.fontClass}>
        <SEO title={text.title} description={text.description} />
        <meta name="robots" content="noindex, nofollow" />
        <header className="flex flex-col gap-3 border-b border-white/10 pb-6">
            <div className="text-xs uppercase tracking-widest text-green-300">Space / API Keys</div>
            <h1 className="m-0 text-2xl sm:text-3xl font-bold">{text.title}</h1>
            <p className="m-0 text-sm text-white/65 leading-relaxed">{text.description}</p>
        </header>

        {accountId
            ? <KeyManager key={accountId} current={current} />
            : <section className="border border-white/15 bg-white/[0.03] p-6 flex flex-col gap-3" aria-labelledby="space-keys-login">
                <Icon icon="pixelarticons:lock" className="text-2xl text-green-300" />
                <h2 id="space-keys-login" className="m-0 text-lg">{text.signInTitle}</h2>
                <p className="m-0 text-sm text-white/65 leading-relaxed">{text.signInHelp}</p>
            </section>}

        <section aria-labelledby="space-keys-guide" className="flex flex-col gap-4 border-t border-white/10 pt-6 pb-3">
            <h2 id="space-keys-guide" className="m-0 text-lg">{text.guideTitle}</h2>
            <p className="m-0 text-sm text-white/65 leading-relaxed">{text.guideHelp}</p>
            <div className="text-sm break-all"><span className="text-white/50">{text.backend}: </span><code>{connection.origin}</code></div>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
                <a className={linkClass} href={connection.spaceApiUrl} target="_blank" rel="noopener noreferrer">spaceAPI</a>
                <a className={linkClass} href={connection.entityApiUrl} target="_blank" rel="noopener noreferrer">entityAPI</a>
                <a className={linkClass} href={connection.skillUrl} target="_blank" rel="noopener noreferrer">Agent Skill</a>
                <Link className={linkClass} to="/space/intro">{current.nav.spaceIntro}</Link>
            </div>
            <p className="m-0 text-sm text-white/50 leading-relaxed">{text.runtimeHelp}</p>
            <div className="flex flex-wrap items-center gap-3">
                <button className={buttonClass} type="button" onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(spaceAgentPrompt(connection.origin, current.lang === 'zh-hans'))
                        setCopyMessage(text.instructionsCopied)
                    } catch {
                        setCopyMessage(text.copyFailed)
                    }
                }}>{text.copyInstructions}</button>
                {copyMessage && <span role="status" className="text-sm text-green-300">{copyMessage}</span>}
            </div>
        </section>
    </PageContainer>
}

function KeyManager({ current }: { current: LangData }) {
    const text = current.space_api_keys
    const [keys, setKeys] = useState<SpaceApiKeyRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [name, setName] = useState('')
    const [secret, setSecret] = useState<{ id: string; value: string } | null>(null)
    const [revokeTarget, setRevokeTarget] = useState<SpaceApiKeyRecord | null>(null)
    const client = useMemo(() => new SpaceApiKeyClient(
        new URL(API_BASE_URL, window.location.href).origin,
        '',
        // Use the site's session refresh/error handling and read the current token
        // per request, so a normal token refresh cannot discard a newly shown key.
        (input, init) => apiFetch(String(input), {
            ...init, headers: { ...init?.headers, Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
            skipGlobalError: true,
        }),
    ), [])

    const errorText = useCallback((failure: unknown) => {
        if (failure instanceof SpaceApiKeyError) {
            if (failure.status === 401) return text.signInHelp
            if (failure.code === 'SPACE_API_KEY_LIMIT_REACHED') return text.keyLimit
        }
        return text.requestFailed
    }, [text])

    useEffect(() => {
        let active = true
        client.list().then(
            records => { if (active) setKeys(records) },
            failure => { if (active) setError(errorText(failure)) },
        ).finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [client, errorText])

    const refresh = async () => {
        setLoading(true)
        setError('')
        try { setKeys(await client.list()) }
        catch (failure) { setError(errorText(failure)) }
        finally { setLoading(false) }
    }

    const create = async (event: FormEvent) => {
        event.preventDefault()
        if (!name.trim() || busy || loading) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const { api_key, ...record } = await client.create(name.trim())
            setSecret({ id: record.id, value: api_key })
            setKeys(previous => [record, ...previous])
            setName('')
        } catch (failure) { setError(errorText(failure)) }
        finally { setBusy(false) }
    }

    const revoke = async () => {
        if (!revokeTarget || busy) return
        const id = revokeTarget.id
        setRevokeTarget(null)
        setBusy(true)
        setError('')
        setMessage('')
        try {
            await client.revoke(id)
            setKeys(previous => previous.filter(record => record.id !== id))
            setSecret(previous => previous?.id === id ? null : previous)
            setMessage(text.revoked)
        } catch (failure) { setError(errorText(failure)) }
        finally { setBusy(false) }
    }

    const date = (value: string | null) => value ? new Date(value).toLocaleString(current.lang === 'zh-hans' ? 'zh-CN' : 'en') : text.never

    return <>
        <form onSubmit={event => { void create(event) }} className="flex flex-col gap-4 border border-green-500/20 bg-green-950/10 p-4 sm:p-6">
            <h2 className="m-0 text-lg">{text.createTitle}</h2>
            <label htmlFor="space-key-name" className="flex flex-col gap-2 text-sm">
                {text.nameLabel}
                <input id="space-key-name" required maxLength={80} value={name} disabled={busy} autoComplete="off"
                    onChange={event => setName(event.target.value)} placeholder={text.namePlaceholder}
                    className="min-w-0 w-full border border-white/20 bg-black/40 px-3 py-2.5 text-white outline-none focus:border-green-400 disabled:opacity-50" />
            </label>
            <div className="text-sm text-green-200">{text.fullPermissions}</div>
            <p className="m-0 text-xs text-white/50 leading-relaxed">{text.permissionHelp}</p>
            <button type="submit" disabled={busy || loading || !name.trim()} className={`${buttonClass} self-start bg-[#3c8527] border-green-500/30 hover:bg-[#489c30] text-white`}>
                {busy ? text.working : text.create}
            </button>
        </form>

        {secret && <section aria-labelledby="space-key-secret-title" className="border border-green-400/40 bg-green-500/10 p-4 flex flex-col gap-3">
            <h2 id="space-key-secret-title" className="m-0 text-base text-green-200">{text.secretTitle}</h2>
            <p className="m-0 text-sm text-white/65">{text.secretHelp}</p>
            <div className="flex flex-col sm:flex-row gap-2">
                <input aria-label={text.secretLabel} readOnly value={secret.value} autoComplete="off" spellCheck={false}
                    onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 bg-black/40 border border-white/20 px-3 py-2 font-mono text-sm" />
                <button type="button" className={buttonClass} onClick={async () => {
                    try { await navigator.clipboard.writeText(secret.value); setMessage(text.copied) }
                    catch { setMessage(text.copyFailed) }
                }}>{text.copy}</button>
                <button type="button" className={buttonClass} onClick={() => setSecret(null)}>{text.dismiss}</button>
            </div>
        </section>}

        {error && <div role="alert" className="border border-red-400/30 bg-red-950/20 p-3 text-sm text-red-200">{error}</div>}
        {message && <div role="status" className="text-sm text-green-300">{message}</div>}
        <section className="flex flex-col gap-4" aria-labelledby="space-keys-list-title" aria-busy={loading}>
            <div className="flex items-center justify-between gap-3">
                <h2 id="space-keys-list-title" className="m-0 text-lg">{text.listTitle} {!loading && <span className="text-white/40">({keys.length})</span>}</h2>
                <button type="button" className={buttonClass} disabled={loading || busy} onClick={() => { void refresh() }}>{text.refresh}</button>
            </div>
            {loading ? <p role="status" className="text-sm text-white/60">{text.loading}</p> : !keys.length && !error ? <p className="text-sm text-white/60">{text.empty}</p> : null}
            {keys.map(record => <article key={record.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10 bg-black/20 p-4">
                <div className="min-w-0 flex flex-col gap-2">
                    <h3 className="m-0 text-base break-words">{record.name}</h3>
                    <code className="text-sm text-white/50 break-all">{record.key_prefix}…</code>
                    <div className="flex flex-wrap gap-2"><span className="border border-green-500/20 px-2 py-1 text-xs text-green-200/80">{text.fullPermissions}</span></div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45"><span>{text.created}: {date(record.created_at)}</span><span>{text.lastUsed}: {date(record.last_used_at)}</span></div>
                </div>
                <button type="button" disabled={busy || loading} className={`${buttonClass} self-start text-red-300 border-red-400/30`} onClick={() => setRevokeTarget(record)}>{text.revoke}</button>
            </article>)}
        </section>
        <ConfirmModal current={current} isOpen={revokeTarget !== null} title={text.revokeTitle}
            message={text.revokeHelp.replace('{name}', revokeTarget?.name || '')} type="warning"
            confirmText={text.revoke} onClose={() => setRevokeTarget(null)} onConfirm={() => { void revoke() }} />
    </>
}
