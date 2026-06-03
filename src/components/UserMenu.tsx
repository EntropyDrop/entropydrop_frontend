import { Icon } from '@iconify/react'
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LangData, type LangKey, SUPPORTED_LANGUAGES } from '../constants/lang'
import { apiFetch } from '../utils/api'
import { NAV_ITEMS } from "../constants/nav"

const GoogleSignInButton = lazy(() => import('./GoogleSignInButton').then(m => ({ default: m.GoogleSignInButton })))

interface UserMenuProps {
    current: LangData
    lang: LangKey
    setLang: (l: LangKey) => void
    isAuto: boolean
    setIsAuto: (a: boolean) => void
}

interface UserInfo {
    username: string
    picture: string
    google_id: string
    is_pro: boolean
    is_admin: boolean
    pro_expires_at: string
    email: string
    terms_agreed: boolean
    pro_level: string
    paypal_subscription_status?: string
}

interface GoogleCredentialResponse {
    credential?: string
}

export function UserMenu({ current, lang, setLang, isAuto, setIsAuto }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false)

    const [user, setUser] = useState<UserInfo | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()

    // Load user on mount
    useEffect(() => {
        const token = localStorage.getItem('token')
        if (token) {
            fetchUser()
        }

        const handleUserUpdate = () => {
            fetchUser()
        }
        window.addEventListener('user-updated', handleUserUpdate)

        return () => {
            window.removeEventListener('user-updated', handleUserUpdate)
        }
    }, [])

    const fetchUser = async () => {
        try {
            const res = await apiFetch('/api/users/me');
            if (res.ok) {
                const data = await res.json()
                setUser(data)
            } else {
                localStorage.removeItem('token')
                setUser(null)
            }
        } catch (e) {
            console.error('Failed to fetch user', e)
        }
    }

    const handleGoogleSuccess = async (credentialResponse: GoogleCredentialResponse) => {
        try {
            const res = await apiFetch('/api/auth/google', {
                method: 'POST',
                body: JSON.stringify({ token: credentialResponse.credential })
            })
            if (res.ok) {
                const data = await res.json()
                localStorage.setItem('token', data.access_token)
                setUser(data.user)
            } else {
                console.error('Login failed')
            }
        } catch (err) {
            console.error(err)
        }
    }

    const handleLogout = () => {
        import('@react-oauth/google')
            .then(({ googleLogout }) => googleLogout())
            .catch(() => undefined)
        localStorage.removeItem('token')
        setUser(null)
        setIsOpen(false)
        navigate('/skin/') // Redirect to / (Discovery) on logout
    }

    const handleAgreeTerms = async () => {
        try {
            const res = await apiFetch('/api/users/agree_terms', {
                method: 'POST'
            })
            if (res.ok) {
                const data = await res.json()
                setUser(data)
            } else {
                console.error('Failed to agree terms')
            }
        } catch (err) {
            console.error(err)
        }
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative pointer-events-auto flex items-center gap-2" ref={menuRef}>
            {/* Mobile Nav Toggle when not logged in */}
            {!user && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="sm:hidden flex items-center justify-center bg-black/40 border-2 border-white/10 w-10 h-10 transition-all cursor-pointer"
                >
                    <Icon icon={isOpen ? "pixelarticons:close" : "pixelarticons:menu"} className="text-white text-xl" />
                </button>
            )}

            {user ?
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-3 bg-black/40 hover:bg-black/60 border-2 border-white/10 p-1.5 sm:p-2 transition-all cursor-pointer group"
                >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#555] border-2 border-black overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                            src={user.picture}
                            alt="avatar"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: user.picture ? 'auto' : 'pixelated' }}
                        />
                    </div>
                    <div className="hidden sm:flex flex-col items-start pr-2">
                        <>
                            <div className="flex items-center gap-1">
                                <span className={`text-white text-xs ${current.fontClass} max-w-[80px] truncate`}>{user.username}</span>
                                {user.is_pro && <span className="text-[9px] bg-yellow-400 text-black px-1 border border-black shadow">PRO</span>}
                            </div>
                        </>
                    </div>
                    <Icon icon="pixelarticons:chevron-down" className={`text-white/20 group-hover:text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                : (
                    <Suspense fallback={<LoginTrigger current={current} disabled />}>
                        <GoogleSignInButton
                            onSuccess={handleGoogleSuccess}
                            onError={() => console.error('Google login error')}
                        />
                    </Suspense>
                )}

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 sm:w-52 max-h-[50vh] sm:max-h-[85vh] overflow-y-auto custom-scrollbar bg-[#333] border-2 border-black shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Mobile Navigation Links */}
                    <div className="sm:hidden border-b border-black/10 pb-1 pt-1 bg-black/10">
                        <span className={`text-white/40 text-[9px] uppercase px-4 py-2 block ${current.fontClass}`}>{current.common?.navigation || 'NAVIGATE'}</span>
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => { setIsOpen(false); navigate(item.path); }}
                                className={`w-full px-4 py-3 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                            >
                                <Icon icon={item.icon} /> {current.nav[item.key]}
                            </button>
                        ))}
                    </div>

                    {user && (
                        <>
                            <div className="p-3 border-b border-black/20 bg-black/20">
                                <span className={`text-white text-xs ${current.fontClass} block truncate mb-2`}>{user.email}</span>
                                {user.is_pro && user.pro_expires_at && (
                                    <div className={`bg-black/40 p-2 border border-white/5 flex flex-col gap-1 text-[10px] sm:text-xs ${current.fontClass}`}>
                                        <div className="flex flex-col gap-1 text-white/60">
                                            <div className="flex items-center gap-1 text-[10px] sm:text-xs uppercase">
                                                <span className="font-bold text-white">{user.pro_level}</span>
                                                <span>{current.user.proExpires}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white flex-1 text-[10px]">{new Date(user.pro_expires_at).toLocaleDateString()}</span>
                                                {user.paypal_subscription_status === 'ACTIVE' && (
                                                    <span className="bg-green-500/20 text-green-400 text-[8px] px-1 border border-green-500/30 flex items-center gap-0.5">
                                                        Auto renew
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => { setIsOpen(false); navigate('/skin/pro'); }}
                                className={`w-full px-4 py-3 text-left text-yellow-400 hover:bg-white/10 hover:text-yellow-300 transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:zap" /> {user.is_pro ? current.user.renewViewPro : current.user.activatePro}
                            </button>
                            <button
                                onClick={() => { setIsOpen(false); navigate('/skin/orders'); }}
                                className={`w-full px-4 py-3 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:book-open" /> {current.user.orders}
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => { setIsOpen(false); window.open('/skin/tos', '_blank'); }}
                        className={`w-full px-4 py-3 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:notes" /> {current.terms.tos}
                    </button>
                    <button
                        onClick={() => { setIsOpen(false); window.open('/skin/privacy', '_blank'); }}
                        className={`w-full px-4 py-3 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:notes" /> {current.terms.privacy}
                    </button>

                    <div className="h-0.5 bg-black/20" />
                    <div className="p-3 bg-black/10">
                        <span className={`text-white/40 text-[9px] uppercase ${current.fontClass} mb-2 block`}>{current.user.language}</span>
                        <select
                            value={isAuto ? 'auto' : lang}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'auto') {
                                    setIsAuto(true);
                                } else {
                                    setIsAuto(false);
                                    setLang(val as LangKey); // cast to LangKey
                                }
                                setIsOpen(false);
                            }}
                            className={`w-full bg-[#222] border border-white/10 p-2 text-white/80 text-[10px] focus:outline-none focus:border-green-500/30 cursor-pointer ${current.fontClass}`}
                        >
                            <option value="auto" className="bg-[#1a1a1a] text-white"> {current.common.auto}</option>
                            {SUPPORTED_LANGUAGES.map(lk => (
                                <option key={lk} value={lk} className="bg-[#1a1a1a] text-white">
                                    {lk === 'zh-hans' ? '简体中文' : lk === 'en' ? 'English' : lk === 'ja' ? '日本語' : '한국어'}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="h-0.5 bg-black/20" />
                    {user && user.is_admin && (
                        <>
                            <button
                                onClick={() => { setIsOpen(false); navigate('/skin/monitor'); }}
                                className={`w-full px-4 py-3 text-left text-green-400 hover:bg-green-500/10 hover:text-green-300 transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:device-tv" /> {current.nav.monitor}
                            </button>
                            <div className="h-0.5 bg-black/20" />
                        </>
                    )}
                    {user && (
                        <button onClick={handleLogout} className={`w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/20 transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}>
                            <Icon icon="pixelarticons:logout" /> {current.user.logout}
                        </button>
                    )}
                </div>
            )}

            {user && user.terms_agreed === false && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border-2 border-white/10 p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className={`text-white text-base font-bold mb-3 ${current.fontClass}`}>
                            {current.terms.title}
                        </h3>
                        <p className={`text-white/60 text-xs mb-3 leading-relaxed ${current.fontClass}`}>
                            {current.terms.intro}
                        </p>

                        <div className={`flex flex-col gap-3 mb-6 ${current.fontClass}`}>
                            <button
                                onClick={() => window.open('/skin/tos', '_blank')}
                                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-all group cursor-pointer"
                            >
                                <span className="text-white/80 text-xs">{current.terms.tos}</span>
                                <Icon icon="pixelarticons:chevron-right" className="text-white/20 group-hover:text-white/60 transition-colors" />
                            </button>
                            <button
                                onClick={() => window.open('/skin/privacy', '_blank')}
                                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-all group cursor-pointer"
                            >
                                <span className="text-white/80 text-xs">{current.terms.privacy}</span>
                                <Icon icon="pixelarticons:chevron-right" className="text-white/20 group-hover:text-white/60 transition-colors" />
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleLogout}
                                className={`flex-1 py-2 bg-transparent border border-white/10 hover:bg-white/5 text-white/50 hover:text-white text-xs transition-colors cursor-pointer border-none ${current.fontClass}`}
                            >
                                {current.terms.decline}
                            </button>
                            <button
                                onClick={handleAgreeTerms}
                                className={`flex-1 py-2 bg-[#5cff5c] hover:bg-[#4ae04a] text-black font-bold text-xs transition-colors cursor-pointer border-none ${current.fontClass}`}
                            >
                                {current.terms.agree}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

function LoginTrigger({
    current,
    disabled = false
}: {
    current: LangData
    disabled?: boolean
}) {
    return (
        <button
            disabled={disabled}
            className={`flex items-center justify-center gap-2 bg-black/40 hover:bg-black/60 border-2 border-white/10 h-10 px-3 text-white/80 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-60 ${current.fontClass}`}
        >
            <Icon icon="pixelarticons:user" className="text-lg" />
            <span className="hidden sm:inline text-xs">{current.user.login}</span>
        </button>
    )
}
