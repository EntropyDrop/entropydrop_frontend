import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { LangData } from '../../../constants/lang'
import { FIGURE_PRINT_TERMS } from '../../../constants/figurePrintTerms'
import { useAuthSession } from '../../../hooks/useAuthSession'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import { getAuthSessionKey } from '../../../utils/authSession'
import { waitForAuthReady } from '../../../utils/authClient'

const GoogleSignInButton = lazy(() => import('../../../components/GoogleSignInButton').then(m => ({ default: m.GoogleSignInButton })))
const endpoint = '/api/users/me/figure_print_terms'
const buttonClass = 'border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

interface Props { current: LangData; onClose: () => void; onDownload: () => void }
interface Acceptance { required_version: string; accepted_version: string | null; accepted_at: string | null }
type Phase = 'checking' | 'guest' | 'confirm' | 'saving' | 'loggingIn' | 'loadFailed' | 'saveFailed' | 'versionMismatch' | 'loginFailed'

export function FigureDownloadDialog(props: Props) {
    const session = useAuthSession()
    const [initialSession] = useState(session)
    const { onClose } = props
    useEffect(() => {
        if (initialSession !== session) onClose()
    }, [initialSession, session, onClose])
    // Account changes cancel this download, including an in-flight acceptance.
    if (initialSession !== session) return null
    return <DownloadSession {...props} session={session} />
}

function DownloadSession({ current, onClose, onDownload, session }: Props & { session: string | null }) {
    const t = current.figurePrint
    const dialog = useRef<HTMLDialogElement>(null)
    const pending = useRef<AbortController | null>(null)
    const submitting = useRef(false)
    const [phase, setPhase] = useState<Phase>('checking')
    const [accepted, setAccepted] = useState(false)
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        const element = dialog.current!
        element.showModal()
        return () => element.close()
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        pending.current = controller
        async function check() {
            await waitForAuthReady()
            if (controller.signal.aborted || getAuthSessionKey() !== session) return
            setPhase('checking')
            if (!session) { setPhase('guest'); return }
            try {
                const response = await apiFetch(endpoint, { auth: 'required', cache: 'no-store', signal: controller.signal, skipGlobalError: true })
                if (response.status === 401) { setPhase('guest'); return }
                if (!response.ok) throw new Error('Acceptance lookup failed')
                const status: Acceptance = await apiResponseJson(response)
                if (controller.signal.aborted || session !== getAuthSessionKey()) return
                if (status.required_version !== FIGURE_PRINT_TERMS.version) { setPhase('versionMismatch'); return }
                if (status.accepted_version === FIGURE_PRINT_TERMS.version && status.accepted_at) onDownload()
                else setPhase('confirm')
            } catch {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setPhase('loadFailed')
            }
        }
        void check()
        return () => { controller.abort(); pending.current?.abort() }
    }, [session, retry, onDownload])

    async function confirm() {
        if (submitting.current || !accepted || !session || session !== getAuthSessionKey() || !['confirm', 'saveFailed'].includes(phase)) return
        // Reject duplicate clicks even before React renders the saving state.
        submitting.current = true
        pending.current?.abort()
        const controller = new AbortController()
        pending.current = controller
        setPhase('saving')
        try {
            const response = await apiFetch(endpoint, {
                method: 'POST', auth: 'required', skipGlobalError: true, signal: controller.signal,
                body: JSON.stringify({ version: FIGURE_PRINT_TERMS.version, accepted: true }),
            })
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (response.status === 409) { setAccepted(false); setPhase('versionMismatch'); return }
            if (response.status === 401) { setAccepted(false); setPhase('guest'); return }
            if (!response.ok) throw new Error('Acceptance save failed')
            const status: Acceptance = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (status.required_version !== FIGURE_PRINT_TERMS.version || status.accepted_version !== FIGURE_PRINT_TERMS.version || !status.accepted_at) {
                throw new Error('Acceptance was not recorded')
            }
            window.dispatchEvent(new Event('user-updated'))
            onDownload()
        } catch {
            if (!controller.signal.aborted && session === getAuthSessionKey()) setPhase('saveFailed')
        } finally {
            submitting.current = false
        }
    }

    async function login({ credential }: { credential?: string }) {
        if (!credential || phase === 'loggingIn') return
        const controller = new AbortController()
        pending.current?.abort()
        pending.current = controller
        setPhase('loggingIn')
        try {
            const response = await apiFetch('/api/auth/google', { method: 'POST', signal: controller.signal, skipGlobalError: true, body: JSON.stringify({ token: credential }) })
            if (!response.ok) throw new Error('Login failed')
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || getAuthSessionKey() !== session) return
            if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Invalid login response')
            localStorage.setItem('token', data.access_token)
            window.dispatchEvent(new Event('auth-token-updated'))
            // Let the existing account UI handle any general-terms confirmation.
            // The user can then click the desired file again with this account.
            onClose()
        } catch {
            if (!controller.signal.aborted) setPhase('loginFailed')
        }
    }

    const confirming = ['confirm', 'saving', 'saveFailed'].includes(phase)
    const guest = ['guest', 'loggingIn', 'loginFailed'].includes(phase)
    return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="print-download-title" aria-describedby="print-download-summary"
        className={`m-auto w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto border-2 border-white/20 bg-[#181b17] p-5 sm:p-6 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm ${current.fontClass}`}>
        <h2 id="print-download-title" className="mt-0 mb-3 text-lg">{t.downloadConfirmTitle}</h2>
        <h3 className="mt-0 mb-2 text-sm text-amber-200">{t.nonCommercialTitle}</h3>
        <p id="print-download-summary" className="border-l-2 border-amber-300 pl-3 text-sm leading-relaxed text-amber-100">{current.figurePrintTerms.summary}</p>
        <p className="text-xs leading-relaxed text-white/65">{t.existingRights}</p>
        <Link to={FIGURE_PRINT_TERMS.path} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-200 underline underline-offset-4">{current.figurePrintTerms.title}</Link>
        <p className="text-xs text-white/50">{current.figurePrintTerms.versionLabel} {FIGURE_PRINT_TERMS.version} · {current.figurePrintTerms.effectiveDateLabel} {FIGURE_PRINT_TERMS.effectiveDate}</p>
        <p className="text-xs leading-relaxed text-white/65">{t.downloadConsentHint}</p>
        {phase === 'checking' && <p role="status" className="text-sm">{t.checkingConsent}</p>}
        {guest && <div className="my-4 flex flex-col items-start gap-3">
            <p className="m-0 text-sm text-white/75">{t.loginForDownload}</p>
            {phase === 'loggingIn' ? <p role="status">{t.loggingIn}</p> : <Suspense fallback={<span>{t.loggingIn}</span>}><GoogleSignInButton onSuccess={login} onError={() => setPhase('loginFailed')} /></Suspense>}
            {phase === 'loginFailed' && <p role="alert" className="text-sm text-red-300">{t.downloadLoginFailed}</p>}
        </div>}
        {confirming && <>
            <p className="text-xs leading-relaxed text-white/60">{t.consentRecordNotice}</p>
            <label className="my-4 flex items-start gap-2 text-sm leading-relaxed cursor-pointer">
                <input autoFocus type="checkbox" checked={accepted} disabled={phase === 'saving'} onChange={event => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#71bc56]" />
                <span>{t.acceptTerms}</span>
            </label>
        </>}
        {['loadFailed', 'saveFailed', 'versionMismatch'].includes(phase) && <p role="alert" className="text-sm text-red-300">{phase === 'loadFailed' ? t.consentLoadFailed : phase === 'saveFailed' ? t.consentSaveFailed : t.consentVersionMismatch}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className={buttonClass}>{current.modal.cancel}</button>
            {phase === 'loadFailed' && <button type="button" onClick={() => setRetry(value => value + 1)} className={buttonClass}>{t.retry}</button>}
            {phase === 'versionMismatch' && <button type="button" onClick={() => window.location.reload()} className={buttonClass}>{t.reloadTerms}</button>}
            {confirming && <button type="button" disabled={!accepted || phase === 'saving'} onClick={confirm} className={`${buttonClass} bg-[#3c8527] hover:bg-[#4ea632]`}>{phase === 'saving' ? t.savingConsent : t.agreeAndDownload}</button>}
        </div>
    </dialog>, document.body)
}
