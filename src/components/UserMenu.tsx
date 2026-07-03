import { Icon } from '@iconify/react'
import { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { type LangData, type LangKey, SUPPORTED_LANGUAGES } from '../constants/lang'
import { apiFetch } from '../utils/api'
import { SKIN_NAV_ITEMS, FIGURE_NAV_ITEMS } from "../constants/nav"
import { SkinAvatarImage } from './SkinAvatarImage'

const GoogleSignInButton = lazy(() => import('./GoogleSignInButton').then(m => ({ default: m.GoogleSignInButton })))
const ProfileSkinPreview = lazy(() => import('./ProfileSkinPreview').then(m => ({ default: m.ProfileSkinPreview })))

interface UserMenuProps {
    current: LangData
    lang: LangKey
    setLang: (l: LangKey) => void
    isAuto: boolean
    setIsAuto: (a: boolean) => void
}

const LANGUAGE_LABELS: Record<LangKey, string> = {
    'zh-hans': '简体中文',
    en: 'English',
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
    minecraft_skin_url?: string | null
}

interface GoogleCredentialResponse {
    credential?: string
}

interface NotificationInfo {
    id: string | number
    senderAvatar?: string
    senderMinecraftSkinUrl?: string
    senderName: string
    type: string
    postId?: string | number
    postTitle?: string
    createdAt: string
    isRead: boolean
}

interface NotificationsResponse {
    notifications: NotificationInfo[]
    unread_count: number
    total: number
}

function formatLocaleText(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, String(value)),
        template
    )
}

function getNotificationActionLabel(current: LangData, type: string) {
    if (type === 'like') return current.user.notifications.like
    if (type === 'comment') return current.user.notifications.comment
    if (type === 'reply') return current.user.notifications.reply
    return ''
}

export function UserMenu({ current, lang, setLang, isAuto, setIsAuto }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false)

    const [user, setUser] = useState<UserInfo | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()

    const [isNotifOpen, setIsNotifOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationInfo[]>([])
    const notifRef = useRef<HTMLDivElement>(null)

    const [unreadCount, setUnreadCount] = useState(0)
    const [notifPage, setNotifPage] = useState(1)
    const [totalNotifs, setTotalNotifs] = useState(0)
    const [notifPageSize] = useState(10)

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
    const [tempNickname, setTempNickname] = useState('')
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [isResettingCharacter, setIsResettingCharacter] = useState(false)
    const [profileError, setProfileError] = useState('')
    const [profileSuccess, setProfileSuccess] = useState('')

    const handleOpenProfileModal = () => {
        if (user) {
            setTempNickname(user.username || '')
            setProfileError('')
            setProfileSuccess('')
            setIsProfileModalOpen(true)
        }
    }

    const handleSaveProfile = async () => {
        if (!tempNickname.trim()) return
        setIsSavingProfile(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const res = await apiFetch('/api/users/me/username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: tempNickname.trim() })
            })
            if (res.ok) {
                const updatedUser = await res.json()
                setUser(updatedUser)
                setProfileSuccess(current.user.profileDialog.nicknameUpdated)
                window.dispatchEvent(new Event('user-updated'))
            } else {
                const errData = await res.json()
                setProfileError(errData?.detail || current.user.profileDialog.saveFailed)
            }
        } catch (err) {
            console.error(err)
            setProfileError(current.user.profileDialog.networkError)
        } finally {
            setIsSavingProfile(false)
        }
    }

    const handleResetCharacter = async () => {
        setIsResettingCharacter(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const res = await apiFetch('/api/users/me/minecraft_skin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ minecraft_skin_url: null })
            })

            if (res.ok) {
                const updatedUser = await res.json()
                setUser(updatedUser)
                setProfileSuccess(current.user.profileDialog.characterReset)
                window.dispatchEvent(new Event('user-updated'))
            } else {
                const errData = await res.json()
                setProfileError(errData?.detail || current.user.profileDialog.resetFailed)
            }
        } catch (err) {
            console.error('Failed to reset Minecraft character', err)
            setProfileError(current.user.profileDialog.networkError)
        } finally {
            setIsResettingCharacter(false)
        }
    }

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

        const handleLogoutEvent = () => {
            import('@react-oauth/google')
                .then(({ googleLogout }) => googleLogout())
                .catch(() => undefined)
            setUser(null)
            setIsOpen(false)
            // Redirect to / (Discovery) on logout if we are on a protected page
            const protectedRoutes = ['/skin/orders', '/skin/collection', '/skin/monitor', '/skin/generate']
            const isProtected = protectedRoutes.some(route => 
                window.location.pathname === route || window.location.pathname.startsWith(route + '/')
            )
            if (isProtected) {
                navigate('/skin/')
            }
        }
        window.addEventListener('logout', handleLogoutEvent)

        return () => {
            window.removeEventListener('user-updated', handleUserUpdate)
            window.removeEventListener('logout', handleLogoutEvent)
        }
    }, [])

    const fetchNotifications = useCallback(async (page = notifPage) => {
        try {
            const res = await apiFetch(`/api/forum/notifications?page=${page}&page_size=${notifPageSize}`, {
                skipGlobalError: true
            })
            if (res.ok) {
                const data = await res.json() as NotificationsResponse
                setNotifications(data.notifications)
                setUnreadCount(data.unread_count)
                setTotalNotifs(data.total)
            }
        } catch (e) {
            console.error("Failed to fetch notifications", e)
        }
    }, [notifPage, notifPageSize])

    const handleToggleNotif = () => {
        const nextIsNotifOpen = !isNotifOpen
        setIsNotifOpen(nextIsNotifOpen)
        if (nextIsNotifOpen) {
            setIsOpen(false)
            setNotifPage(1)
            fetchNotifications(1)
        }
    }

    const handleMarkAllRead = async () => {
        try {
            const res = await apiFetch('/api/forum/notifications/read-all', {
                method: 'POST',
                skipGlobalError: true
            })
            if (res.ok) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
                setUnreadCount(0)
            }
        } catch (e) {
            console.error(e)
        }
    }

    // Load and poll notifications
    useEffect(() => {
        if (user) {
            fetchNotifications(notifPage)
            const timer = setInterval(() => fetchNotifications(notifPage), 30000)
            return () => clearInterval(timer)
        } else {
            setNotifications([])
            setUnreadCount(0)
            setTotalNotifs(0)
        }
    }, [user, notifPage, fetchNotifications])

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
        window.dispatchEvent(new Event('logout'))
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
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setIsNotifOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative pointer-events-auto flex items-center gap-2" ref={menuRef}>
            {user ? (
                <div className="flex items-center h-10 bg-black/40 border border-white/10 shrink-0">
                    <div className="relative shrink-0" ref={notifRef}>
                        <button
                            onClick={handleToggleNotif}
                            className="relative flex items-center justify-center hover:bg-black/30 w-10 h-10 transition-colors cursor-pointer text-white/70 hover:text-white"
                        >
                            <Icon icon="pixelarticons:mail" className="text-2xl" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-[#5cff5c] border border-black animate-pulse" />
                            )}
                        </button>
                        {isNotifOpen && (
                            <div className="absolute top-full right-0 mt-2 w-72 max-h-[350px] overflow-y-auto custom-scrollbar bg-zinc-950/95 backdrop-blur-md border border-white/10 shadow-2xl z-[99999] animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-3 border-b border-black/20 bg-black/20 flex justify-between items-center">
                                    <span className={`text-white text-xs font-bold ${current.fontClass}`}>
                                        {current.user.notifications.title}
                                    </span>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            className={`text-[10px] text-green-400 hover:text-green-300 border-none bg-transparent cursor-pointer ${current.fontClass}`}
                                        >
                                            {current.user.notifications.markAllRead}
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    {notifications.length === 0 ? (
                                        <div className={`p-4 text-center text-white/40 text-xs ${current.fontClass}`}>
                                            {current.user.notifications.empty}
                                        </div>
                                    ) : (
                                        notifications.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={async () => {
                                                    setIsNotifOpen(false);
                                                    if (n.postId) {
                                                        navigate(`/figure?postId=${n.postId}`);
                                                    }
                                                    // Optimistically mark as read
                                                    if (!n.isRead) {
                                                        setUnreadCount(prev => Math.max(0, prev - 1));
                                                    }
                                                    setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));

                                                    // Sync with backend
                                                    try {
                                                        await apiFetch(`/api/forum/notifications/${n.id}/read`, {
                                                            method: 'POST',
                                                            skipGlobalError: true
                                                        });
                                                    } catch (err) {
                                                        console.error("Failed to mark notification as read", err);
                                                    }
                                                }}
                                                className={`p-3 border-b border-white/5 hover:bg-white/5 flex gap-2.5 items-start cursor-pointer transition-colors ${!n.isRead ? 'bg-white/5' : ''} ${current.fontClass}`}
                                            >
                                                <SkinAvatarImage
                                                    textureUrl={n.senderMinecraftSkinUrl}
                                                    fallbackSrc={n.senderAvatar}
                                                    alt="avatar"
                                                    className="w-6 h-6"
                                                    framed={false}
                                                />
                                                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                                    <p className="text-[11px] text-white/90 leading-tight m-0 break-words">
                                                        <strong className="text-white">@{n.senderName}</strong>{' '}
                                                        {getNotificationActionLabel(current, n.type)}
                                                        {n.postId && (
                                                            <span className={`text-white/50 italic block truncate mt-0.5 text-[10px] ${current.fontClass}`}>
                                                                "{n.postTitle}"
                                                            </span>
                                                        )}
                                                    </p>
                                                    <span className={`text-[9px] text-white/30 mt-0.5 ${current.fontClass}`}>{n.createdAt}</span>
                                                </div>
                                                {!n.isRead && (
                                                    <span className="w-1.5 h-1.5 bg-[#5cff5c] shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Compact page selectors for notifications */}
                                {totalNotifs > notifPageSize && (
                                    <div className="p-2 border-t border-black/20 bg-black/10 flex justify-between items-center text-[10px] font-pixel-hans text-white/60">
                                        <button
                                            type="button"
                                            disabled={notifPage === 1}
                                            onClick={(e) => { e.stopPropagation(); setNotifPage(p => Math.max(1, p - 1)); }}
                                            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors"
                                        >
                                            &lt; {current.user.notifications.prev}
                                        </button>
                                        <span className="select-none">
                                            {formatLocaleText(current.user.notifications.pageLabel, {
                                                page: notifPage,
                                                total: Math.ceil(totalNotifs / notifPageSize),
                                            })}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={notifPage >= Math.ceil(totalNotifs / notifPageSize)}
                                            onClick={(e) => { e.stopPropagation(); setNotifPage(p => Math.min(Math.ceil(totalNotifs / notifPageSize), p + 1)); }}
                                            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors"
                                        >
                                            {current.user.notifications.next} &gt;
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="h-6 w-px bg-white/10 shrink-0" />

                    <button
                        onClick={() => {
                            const nextIsOpen = !isOpen
                            setIsOpen(nextIsOpen)
                            if (nextIsOpen) setIsNotifOpen(false)
                        }}
                        className="flex items-center hover:bg-black/30 h-10 w-10 sm:w-auto sm:px-2 sm:gap-2.5 transition-colors cursor-pointer group shrink-0 overflow-hidden justify-center sm:justify-start"
                    >
                        <SkinAvatarImage
                            textureUrl={user.minecraft_skin_url}
                            fallbackSrc={user.picture}
                            alt="avatar"
                            className="w-10 h-10 min-w-[2.5rem] max-w-[2.5rem] min-h-[2.5rem] max-h-[2.5rem] flex-none p-1"
                            framed={false}
                        />
                        <div className="hidden sm:flex flex-col items-start">
                            <div className="flex items-center gap-1">
                                <span className={`text-white text-xs ${current.fontClass} max-w-[80px] truncate`}>{user.username}</span>
                                {user.is_pro && <span className="text-[9px] bg-yellow-400 text-black px-1 border border-black shadow">PRO</span>}
                            </div>
                        </div>
                        <Icon
                            icon="pixelarticons:chevron-down"
                            className={`text-white/20 group-hover:text-white/60 transition-transform duration-200 hidden sm:block shrink-0 ${isOpen ? 'rotate-180 text-white/80' : ''}`}
                        />
                    </button>
                </div>
            ) : (
                <>
                    {/* Mobile Nav Toggle when not logged in */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="lg:hidden flex items-center justify-center bg-black/40 border border-white/10 w-10 h-10 transition-all cursor-pointer"
                    >
                        <Icon icon={isOpen ? "pixelarticons:close" : "pixelarticons:menu"} className="text-white text-xl" />
                    </button>
                    <Suspense fallback={<LoginTrigger current={current} disabled />}>
                        <GoogleSignInButton
                            onSuccess={handleGoogleSuccess}
                            onError={() => console.error('Google login error')}
                        />
                    </Suspense>
                </>
            )}

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 sm:w-52 max-h-[50vh] sm:max-h-[85vh] overflow-y-auto custom-scrollbar bg-zinc-950/95 backdrop-blur-md border border-white/10 shadow-2xl z-[99999] animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Mobile/Tablet Navigation Links */}
                    <div className="lg:hidden border-b border-black/10 pb-1 pt-1 bg-black/10 flex flex-col gap-1">
                        {/* Global Platform Links: Pro & Public */}
                        <button
                            onClick={() => { setIsOpen(false); navigate('/pro'); }}
                            className={`w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:zap" className="text-sm shrink-0" /> {current.nav.pro}
                        </button>
                        <button
                            onClick={() => { setIsOpen(false); navigate('/public/about'); }}
                            className={`w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:binary" className="text-sm shrink-0" /> {current.nav.public}
                        </button>

                        <div className="h-px bg-white/5 my-1 mx-4" />

                        {/* Skins Sub-Navigation */}
                        <span className={`text-white/40 text-[9px] uppercase px-4 pt-1 block ${current.fontClass}`}>{current.nav.skin}</span>
                        {SKIN_NAV_ITEMS.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => { setIsOpen(false); navigate(item.path); }}
                                className={`w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 pl-6 ${current.fontClass}`}
                            >
                                <Icon icon={item.icon} className="text-sm shrink-0" /> {current.nav[item.key as keyof typeof current.nav]}
                            </button>
                        ))}

                        <div className="h-px bg-white/5 my-1 mx-4" />

                        {/* Figures Sub-Navigation */}
                        <span className={`text-white/40 text-[9px] uppercase px-4 pt-1 block ${current.fontClass}`}>{current.nav.figure}</span>
                        {FIGURE_NAV_ITEMS.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => { setIsOpen(false); navigate(item.path); }}
                                className={`w-full px-4 py-2 text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors text-xs border-none cursor-pointer flex items-center gap-3 pl-6 ${current.fontClass}`}
                            >
                                <Icon icon={item.icon} className="text-sm shrink-0" /> {current.nav[item.key as keyof typeof current.nav]}
                            </button>
                        ))}
                    </div>

                    {user && (
                        <>
                            <div className="p-3 border-b border-black/20 bg-black/20">
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        handleOpenProfileModal();
                                    }}
                                    className={`w-full py-1.5 px-3 mb-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs cursor-pointer flex items-center justify-center gap-2 transition-all ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:user" className="text-sm" />
                                    {current.user.profile}
                                </button>
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
                                    {LANGUAGE_LABELS[lk]}
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

            {user && user.terms_agreed === false && createPortal(
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
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
                </div>,
                document.body
            )}

            {isProfileModalOpen && user && createPortal(
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border border-white/10 p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scrollbar mx-4 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                            <h3 className={`text-white text-sm font-bold ${current.fontClass}`}>
                                {current.user.profile}
                            </h3>
                            <button
                                onClick={() => setIsProfileModalOpen(false)}
                                className="text-white/40 hover:text-white transition-colors cursor-pointer"
                            >
                                <Icon icon="pixelarticons:close" className="text-sm" />
                            </button>
                        </div>

                        {/* Google Account Data */}
                        <div className="bg-black/25 border border-white/10 p-3 flex items-center gap-3">
                            <div className="w-14 h-14 bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                {user.picture ? (
                                    <img src={user.picture} alt="google avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <Icon icon="pixelarticons:user" className="text-white/40 text-lg" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col gap-1">
                                <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                    {current.user.profileDialog.googleAccount}
                                </span>
                                <span className={`text-[10px] text-white/50 truncate ${current.fontClass}`}>
                                    {user.email}
                                </span>
                                <span className={`text-[9px] text-[#4ea632]/80 flex items-center gap-1 ${current.fontClass}`}>
                                    <Icon icon="pixelarticons:lock" className="text-xs shrink-0" />
                                    {current.user.profileDialog.visibleOnlyToYou}
                                </span>
                            </div>
                        </div>

                        {/* Nickname (Editable) */}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                {current.user.profileDialog.nickname}
                            </span>
                            <div className="flex items-center bg-black/40 border border-white/10 focus-within:border-green-500/30">
                                <input
                                    type="text"
                                    value={tempNickname}
                                    onChange={(e) => setTempNickname(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveProfile()
                                        if (e.key === 'Escape') setTempNickname(user.username || '')
                                    }}
                                    className={`min-w-0 flex-1 bg-transparent px-2 py-2 text-white text-xs focus:outline-none ${current.fontClass}`}
                                    placeholder={current.user.profileDialog.nicknamePlaceholder}
                                    maxLength={50}
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveProfile}
                                    disabled={isSavingProfile || !tempNickname.trim()}
                                    className="m-1 w-7 h-7 bg-[#3c8527] hover:bg-[#4ea632] disabled:bg-zinc-800 disabled:text-white/30 disabled:cursor-not-allowed text-white border border-black shadow flex items-center justify-center cursor-pointer transition-colors"
                                    title={current.user.profileDialog.saveNickname}
                                >
                                    <Icon icon={isSavingProfile ? 'pixelarticons:reload' : 'pixelarticons:check'} className={`text-xs ${isSavingProfile ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* My Character Skin (Read-only) */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                    {current.user.profileDialog.myCharacter}
                                </span>
                                {user.minecraft_skin_url && (
                                    <button
                                        type="button"
                                        onClick={handleResetCharacter}
                                        disabled={isResettingCharacter}
                                        className={`px-2 py-1 bg-white/5 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-red-400/30 text-white/45 hover:text-red-300 text-[9px] transition-colors cursor-pointer ${current.fontClass}`}
                                    >
                                        {isResettingCharacter
                                            ? current.user.profileDialog.resettingCharacter
                                            : current.user.profileDialog.resetCharacter}
                                    </button>
                                )}
                            </div>
                            {user.minecraft_skin_url ? (
                                <div className="bg-black/25 border border-white/10 p-3 flex flex-col gap-2">
                                    <Suspense fallback={<ProfileSkinPreviewFallback textureUrl={user.minecraft_skin_url} />}>
                                        <ProfileSkinPreview
                                            textureUrl={user.minecraft_skin_url}
                                            current={current}
                                            className="w-full h-72 sm:h-80"
                                        />
                                    </Suspense>
                                    <span className={`text-[10px] text-white/50 ${current.fontClass}`}>
                                        {current.user.profileDialog.setFromFigureModel}
                                    </span>
                                </div>
                            ) : (
                                <div className={`bg-black/25 border border-white/10 p-4 text-center text-white/35 text-[10px] ${current.fontClass}`}>
                                    {current.user.profileDialog.noCharacterSet}
                                </div>
                            )}
                        </div>

                        {/* Current Avatar */}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                {current.user.profileDialog.currentAvatar}
                            </span>
                            <div className="flex items-center gap-3">
                                <SkinAvatarImage
                                    textureUrl={user.minecraft_skin_url}
                                    fallbackSrc={user.picture}
                                    alt="current avatar"
                                    className="w-12 h-12"
                                />
                                <div className="flex flex-col">
                                    <span className={`text-[10px] text-white/50 ${current.fontClass}`}>
                                        {user.minecraft_skin_url
                                            ? current.user.profileDialog.generatedFromMyCharacter
                                            : current.user.profileDialog.syncedFromGoogle}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Feedback messages */}
                        {profileError && (
                            <span className={`text-[10px] text-red-400 ${current.fontClass}`}>
                                {profileError}
                            </span>
                        )}
                        {profileSuccess && (
                            <span className={`text-[10px] text-green-400 ${current.fontClass}`}>
                                {profileSuccess}
                            </span>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3 mt-2">
                            <button
                                onClick={() => setIsProfileModalOpen(false)}
                                className={`flex-1 py-2 bg-transparent border border-white/10 hover:bg-white/5 text-white/50 hover:text-white text-xs transition-colors cursor-pointer ${current.fontClass}`}
                            >
                                {current.user.profileDialog.cancel}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    )
}

function ProfileSkinPreviewFallback({ textureUrl }: { textureUrl: string }) {
    return (
        <div className="w-full h-72 sm:h-80 bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
            <img
                src={textureUrl}
                alt="minecraft skin"
                className="w-16 h-16 object-contain"
                style={{ imageRendering: 'pixelated' }}
            />
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
            className={`flex items-center justify-center gap-2 bg-black/40 hover:bg-black/60 border border-white/10 h-10 px-3 text-white/80 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-60 ${current.fontClass}`}
        >
            <Icon icon="pixelarticons:user" className="text-lg" />
            <span className="hidden sm:inline text-xs">{current.user.login}</span>
        </button>
    )
}
