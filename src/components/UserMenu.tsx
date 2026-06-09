import { Icon } from '@iconify/react'
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { type LangData, type LangKey, SUPPORTED_LANGUAGES } from '../constants/lang'
import { apiFetch } from '../utils/api'
import { SKIN_NAV_ITEMS, FIGURE_NAV_ITEMS } from "../constants/nav"

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

    const [isNotifOpen, setIsNotifOpen] = useState(false)
    const [notifications, setNotifications] = useState<any[]>([])
    const notifRef = useRef<HTMLDivElement>(null)

    const [unreadCount, setUnreadCount] = useState(0)
    const [notifPage, setNotifPage] = useState(1)
    const [totalNotifs, setTotalNotifs] = useState(0)
    const [notifPageSize] = useState(10)

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
    const [tempNickname, setTempNickname] = useState('')
    const [isSavingProfile, setIsSavingProfile] = useState(false)
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
                setProfileSuccess(lang === 'zh-hans' ? '昵称修改成功！' : 'Nickname updated successfully!')
                window.dispatchEvent(new Event('user-updated'))
                setTimeout(() => {
                    setIsProfileModalOpen(false)
                }, 1000)
            } else {
                const errData = await res.json()
                setProfileError(errData?.detail || (lang === 'zh-hans' ? '保存失败' : 'Failed to save'))
            }
        } catch (err) {
            console.error(err)
            setProfileError(lang === 'zh-hans' ? '网络错误，请稍后重试' : 'Network error, please try again')
        } finally {
            setIsSavingProfile(false)
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

        return () => {
            window.removeEventListener('user-updated', handleUserUpdate)
        }
    }, [])

    const fetchNotifications = async (page = notifPage) => {
        try {
            const res = await apiFetch(`/api/forum/notifications?page=${page}&page_size=${notifPageSize}`)
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications)
                setUnreadCount(data.unread_count)
                setTotalNotifs(data.total)
            }
        } catch (e) {
            console.error("Failed to fetch notifications", e)
        }
    }

    const handleToggleNotif = () => {
        setIsNotifOpen(!isNotifOpen)
        if (!isNotifOpen) {
            setNotifPage(1)
            fetchNotifications(1)
        }
    }

    const handleMarkAllRead = async () => {
        try {
            const res = await apiFetch('/api/forum/notifications/read-all', {
                method: 'POST'
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
    }, [user, notifPage])

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
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setIsNotifOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative pointer-events-auto flex items-center gap-2" ref={menuRef}>
            {user && (
                <div className="relative shrink-0" ref={notifRef}>
                    <button
                        onClick={handleToggleNotif}
                        className="relative flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/10 w-10 h-10 transition-all cursor-pointer text-white/70 hover:text-white"
                    >
                        <Icon icon="pixelarticons:mail" className="text-2xl" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-[#5cff5c] border border-black animate-pulse" />
                        )}
                    </button>
                    {isNotifOpen && (
                        <div className="absolute top-full right-0 mt-2 w-72 max-h-[350px] overflow-y-auto custom-scrollbar bg-zinc-950/95 backdrop-blur-md border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-3 border-b border-black/20 bg-black/20 flex justify-between items-center">
                                <span className={`text-white text-xs font-bold ${current.fontClass}`}>
                                    {lang === 'zh-hans' ? '消息通知' : 'Notifications'}
                                </span>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllRead}
                                        className={`text-[10px] text-green-400 hover:text-green-300 border-none bg-transparent cursor-pointer ${current.fontClass}`}
                                    >
                                        {lang === 'zh-hans' ? '全部已读' : 'Mark all as read'}
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col">
                                {notifications.length === 0 ? (
                                    <div className={`p-4 text-center text-white/40 text-xs ${current.fontClass}`}>
                                        {lang === 'zh-hans' ? '暂无消息' : 'No notifications'}
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
                                                        method: 'POST'
                                                    });
                                                } catch (err) {
                                                    console.error("Failed to mark notification as read", err);
                                                }
                                            }}
                                            className={`p-3 border-b border-white/5 hover:bg-white/5 flex gap-2.5 items-start cursor-pointer transition-colors ${!n.isRead ? 'bg-white/5' : ''} ${current.fontClass}`}
                                        >
                                            <div className="w-6 h-6 bg-zinc-800 overflow-hidden border border-white/10 flex items-center justify-center shrink-0">
                                                {n.senderAvatar ? (
                                                    <img src={n.senderAvatar} alt="avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Icon icon="pixelarticons:user" className="text-white/40 text-xs" />
                                                )}
                                            </div>
                                            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                                <p className="text-[11px] text-white/90 leading-tight m-0 break-words">
                                                    <strong className="text-white">@{n.senderName}</strong>{' '}
                                                    {n.type === 'like' && (lang === 'zh-hans' ? '点赞了你的帖子' : 'liked your post')}
                                                    {n.type === 'comment' && (lang === 'zh-hans' ? '评论了你的帖子' : 'commented on your post')}
                                                    {n.type === 'reply' && (lang === 'zh-hans' ? '回复了你的评论' : 'replied to your comment')}
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
                                        &lt; Prev
                                    </button>
                                    <span className="select-none">
                                        {lang === 'zh-hans' 
                                            ? `第 ${notifPage} / ${Math.ceil(totalNotifs / notifPageSize)} 页` 
                                            : `Page ${notifPage} of ${Math.ceil(totalNotifs / notifPageSize)}`}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={notifPage >= Math.ceil(totalNotifs / notifPageSize)}
                                        onClick={(e) => { e.stopPropagation(); setNotifPage(p => Math.min(Math.ceil(totalNotifs / notifPageSize), p + 1)); }}
                                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors"
                                    >
                                        Next &gt;
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Mobile Nav Toggle when not logged in */}
            {!user && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="lg:hidden flex items-center justify-center bg-black/40 border border-white/10 w-10 h-10 transition-all cursor-pointer"
                >
                    <Icon icon={isOpen ? "pixelarticons:close" : "pixelarticons:menu"} className="text-white text-xl" />
                </button>
            )}

            {user ?
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center bg-black/40 hover:bg-black/60 border border-white/10 h-10 transition-all cursor-pointer group shrink-0 ${isOpen ? 'px-2 gap-3' : 'w-10 justify-center'}`}
                >
                    <div className="w-6 h-6 bg-[#555] border border-black overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                            src={user.picture}
                            alt="avatar"
                            className="w-full h-full object-contain"
                            style={{ imageRendering: user.picture ? 'auto' : 'pixelated' }}
                        />
                    </div>
                    {isOpen && (
                        <>
                            <div className="hidden sm:flex flex-col items-start">
                                <div className="flex items-center gap-1">
                                    <span className={`text-white text-xs ${current.fontClass} max-w-[80px] truncate`}>{user.username}</span>
                                    {user.is_pro && <span className="text-[9px] bg-yellow-400 text-black px-1 border border-black shadow">PRO</span>}
                                </div>
                            </div>
                            <Icon icon="pixelarticons:chevron-down" className="text-white/20 group-hover:text-white/60 transition-transform rotate-180 hidden sm:block shrink-0" />
                        </>
                    )}
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
                <div className="absolute top-full right-0 mt-2 w-64 sm:w-52 max-h-[50vh] sm:max-h-[85vh] overflow-y-auto custom-scrollbar bg-zinc-950/95 backdrop-blur-md border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
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
                            onClick={() => { setIsOpen(false); navigate('/public'); }}
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
                                    {lang === 'zh-hans' ? '个人资料' : 'Profile'}
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

            {isProfileModalOpen && user && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border border-white/10 p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                            <h3 className={`text-white text-sm font-bold ${current.fontClass}`}>
                                {lang === 'zh-hans' ? '个人资料' : 'Profile'}
                            </h3>
                            <button
                                onClick={() => setIsProfileModalOpen(false)}
                                className="text-white/40 hover:text-white transition-colors cursor-pointer"
                            >
                                <Icon icon="pixelarticons:close" className="text-sm" />
                            </button>
                        </div>

                        {/* Avatar (Read-only) */}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                {lang === 'zh-hans' ? '头像 (不可修改)' : 'Avatar (Read-only)'}
                            </span>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden">
                                    {user.picture ? (
                                        <img src={user.picture} alt="avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <Icon icon="pixelarticons:user" className="text-white/40 text-lg" />
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[10px] text-white/50 ${current.fontClass}`}>
                                        {lang === 'zh-hans' ? '自 Google 账号同步' : 'Synced from Google'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Email (Read-only) */}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                {lang === 'zh-hans' ? '邮箱 (不可修改)' : 'Email (Read-only)'}
                            </span>
                            <input
                                type="text"
                                readOnly
                                value={user.email}
                                className={`w-full bg-white/5 border border-white/10 p-2 text-white/50 text-xs focus:outline-none cursor-not-allowed select-none ${current.fontClass}`}
                            />
                        </div>

                        {/* Nickname (Editable) */}
                        <div className="flex flex-col gap-1.5">
                            <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>
                                {lang === 'zh-hans' ? '昵称' : 'Nickname'}
                            </span>
                            <input
                                type="text"
                                value={tempNickname}
                                onChange={(e) => setTempNickname(e.target.value)}
                                className={`w-full bg-black/40 border border-white/10 p-2 text-white text-xs focus:outline-none focus:border-green-500/30 ${current.fontClass}`}
                                placeholder={lang === 'zh-hans' ? '请输入昵称...' : 'Enter nickname...'}
                                maxLength={50}
                            />
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
                                {lang === 'zh-hans' ? '取消' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile || !tempNickname.trim()}
                                className={`flex-1 py-2 bg-[#5cff5c] hover:bg-[#4ae04a] disabled:bg-zinc-800 disabled:text-white/30 disabled:cursor-not-allowed text-black font-bold text-xs transition-colors cursor-pointer ${current.fontClass}`}
                            >
                                {isSavingProfile 
                                    ? (lang === 'zh-hans' ? '保存中...' : 'Saving...') 
                                    : (lang === 'zh-hans' ? '保存' : 'Save')}
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
            className={`flex items-center justify-center gap-2 bg-black/40 hover:bg-black/60 border border-white/10 h-10 px-3 text-white/80 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-60 ${current.fontClass}`}
        >
            <Icon icon="pixelarticons:user" className="text-lg" />
            <span className="hidden sm:inline text-xs">{current.user.login}</span>
        </button>
    )
}
