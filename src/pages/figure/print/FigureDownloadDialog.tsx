import { googleLoginPayload } from '../../../utils/creatorReferral'
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
const buttonClass = 'border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

interface Props { current: LangData; onClose: () => void; onDownload: () => void }
type Phase = 'checking' | 'guest' | 'loggingIn' | 'loginFailed'

export function FigureDownloadDialog(props: Props) {
    const session = useAuthSession()
    const [initialSession] = useState(session)
    const { onClose } = props
    useEffect(() => {
        if (initialSession !== session) onClose()
    }, [initialSession, session, onClose])
    // Account changes cancel this download.
    if (initialSession !== session) return null
    return <DownloadSession {...props} session={session} />
}

// Signed-in accounts download straight away (Section 18 of the Terms of Service applies);
// guests see the non-commercial notice and must sign in first.
function DownloadSession({ current, onClose, onDownload, session }: Props & { session: string | null }) {
    const t = current.figurePrint
    const dialog = useRef<HTMLDialogElement>(null)
    const pending = useRef<AbortController | null>(null)
    const [phase, setPhase] = useState<Phase>('checking')
    const open = phase !== 'checking'

    useEffect(() => {
        const element = dialog.current
        if (!open || !element) return
        element.showModal()
        return () => element.close()
    }, [open])

    useEffect(() => {
        const controller = new AbortController()
        pending.current = controller
        async function start() {
            await waitForAuthReady()
            if (controller.signal.aborted || getAuthSessionKey() !== session) return
            if (session) onDownload()
            else setPhase('guest')
        }
        void start()
        return () => { controller.abort(); pending.current?.abort() }
    }, [session, onDownload])

    async function login({ credential }: { credential?: string }) {
        if (!credential || phase === 'loggingIn') return
        const controller = new AbortController()
        pending.current?.abort()
        pending.current = controller
        setPhase('loggingIn')
        try {
            const response = await apiFetch('/api/auth/google', { method: 'POST', signal: controller.signal, skipGlobalError: true, body: JSON.stringify(googleLoginPayload(credential)) })
            if (!response.ok) throw new Error('Login failed')
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || getAuthSessionKey() !== session) return
            if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Invalid login response')
            localStorage.setItem('token', data.access_token)
            window.dispatchEvent(new Event('auth-token-updated'))
            // Let the existing account UI handle the Terms of Service confirmation.
            // The user can then click the desired file again with this account.
            onClose()
        } catch {
            if (!controller.signal.aborted) setPhase('loginFailed')
        }
    }

    if (!open) return null
    return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="print-download-title" aria-describedby="print-download-summary"
        className={`m-auto w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto border-2 border-white/20 bg-[#181b17] p-5 sm:p-6 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm ${current.fontClass}`}>
        <h2 id="print-download-title" className="mt-0 mb-3 text-lg">{t.downloadSignInTitle}</h2>
        <h3 className="mt-0 mb-2 text-sm text-amber-200">{t.nonCommercialTitle}</h3>
        <p id="print-download-summary" className="border-l-2 border-amber-300 pl-3 text-sm leading-relaxed text-amber-100">{current.figurePrintTerms.summary}</p>
        <p className="text-xs leading-relaxed text-white/65">{t.existingRights}</p>
        <Link to={FIGURE_PRINT_TERMS.path} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-200 underline underline-offset-4">{current.figurePrintTerms.sectionTitle}</Link>
        <div className="my-4 flex flex-col items-start gap-3">
            <p className="m-0 text-sm text-white/75">{t.loginForDownload}</p>
            {phase === 'loggingIn' ? <p role="status">{t.loggingIn}</p> : <Suspense fallback={<span>{t.loggingIn}</span>}><GoogleSignInButton onSuccess={login} onError={() => setPhase('loginFailed')} /></Suspense>}
            {phase === 'loginFailed' && <p role="alert" className="text-sm text-red-300">{t.downloadLoginFailed}</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className={buttonClass}>{current.modal.cancel}</button>
        </div>
    </dialog>, document.body)
}
