import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { apiFetch } from '../utils/api'
import type { LangData } from '../constants/lang'
import { ArticleMarkdown } from '../components/ArticleMarkdown'
import { MarkdownEditor } from '../components/MarkdownEditor'

interface FigurePageProps {
    current: LangData
}

interface PrintSettings {
    printer: string
    layerHeight: string
    infill: string
    printTime: string
    material: string
}

interface ForumComment {
    id: string
    author: string
    avatarUrl?: string
    isPro?: boolean
    content: string
    createdAt: string
    replies?: ForumComment[]
}

const BODY_TYPES_EN = ['SLA', 'FDM', 'UV Inkjet 3D Printing', 'Other/Unknown'];
const MULTICOLOR_TYPES_EN = ['Stickers', 'UV Inkjet', 'Spraying', 'FDM Multi-color', 'Other/Unknown'];

const getBodyTypeLabel = (val: string | undefined, current: LangData) => {
    if (!val) return '';
    const idx = BODY_TYPES_EN.findIndex(t => t.toLowerCase() === val.toLowerCase());
    if (idx !== -1 && current.figureForum.bodyTypes?.[idx]) {
        return current.figureForum.bodyTypes[idx];
    }
    return val;
};

const getMultiColorTypeLabel = (val: string | undefined, current: LangData) => {
    if (!val) return '';
    const idx = MULTICOLOR_TYPES_EN.findIndex(t => t.toLowerCase() === val.toLowerCase());
    if (idx !== -1 && current.figureForum.colorModes?.[idx]) {
        return current.figureForum.colorModes[idx];
    }
    return val;
};

interface ForumPost {
    id: string
    title: string
    content: string
    category: 'discussions' | 'showcase'
    image?: string // Optional image for discussions
    tags: string[]
    author: string
    authorAvatar?: string
    isPro?: boolean
    role?: string
    likes: number
    views: number
    isLiked?: boolean
    printSettings: PrintSettings
    comments: ForumComment[]
    commentsCount: number
    createdAt: string
    bodyType?: string
    multiColorType?: string
}

interface YoutubeVideo {
    id: string
    youtubeId: string
}

interface CommentNodeProps {
    comment: ForumComment
    current: LangData
    onReply: (parentCommentId: string, replyText: string) => void
}

function CommentNode({ comment, current, onReply }: CommentNodeProps) {
    const [isReplying, setIsReplying] = useState(false)
    const [replyValue, setReplyValue] = useState('')

    const handleSubmitReply = (e: React.FormEvent) => {
        e.preventDefault()
        if (!replyValue.trim()) return
        onReply(comment.id, replyValue.trim())
        setReplyValue('')
        setIsReplying(false)
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Comment Body */}
            <div className="flex gap-3 items-start">
                {/* Avatar icon */}
                <div className="w-6 h-6 bg-zinc-800 overflow-hidden border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                    {comment.avatarUrl ? (
                        <img src={comment.avatarUrl} alt={comment.author} className="w-full h-full object-cover" />
                    ) : (
                        <Icon icon="pixelarticons:user" className="text-white/40 text-xs" />
                    )}
                </div>

                {/* Comment Content Column */}
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                    {/* Header: Author + Time */}
                    <div className="flex items-center gap-2 text-[10px] text-white/40">
                        <span className={`text-white/70 font-semibold ${current.fontClass}`}>@{comment.author}</span>
                        {comment.isPro && (
                            <span className={`text-[7px] bg-yellow-400 text-black px-0.5 font-bold leading-none py-0.5 ${current.fontClass}`}>
                                PRO
                            </span>
                        )}
                        <span>•</span>
                        <span className={`text-[9px] ${current.fontClass}`}>{comment.createdAt}</span>
                    </div>

                    {/* Text content */}
                    <p className={`text-white/95 text-xs leading-relaxed mt-0.5 pr-2 break-words ${current.fontClass}`}>
                        {comment.content}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-1">
                        <button
                            onClick={() => setIsReplying(!isReplying)}
                            className={`text-[10px] text-white/40 hover:text-[#5cff5c] transition-colors border-none bg-transparent cursor-pointer flex items-center gap-1 ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:reply" className="text-xs" />
                            <span>Reply</span>
                        </button>
                    </div>

                    {/* Inline Reply Form */}
                    {isReplying && (
                        <form onSubmit={handleSubmitReply} className="flex gap-2 mt-2 max-w-md animate-in fade-in duration-200">
                            <input
                                type="text"
                                placeholder="Write a reply..."
                                className={`bg-black/60 border border-white/15 p-1.5 text-xs text-white focus:outline-none focus:border-[#3c8527] flex-1 ${current.fontClass}`}
                                value={replyValue}
                                onChange={e => setReplyValue(e.target.value)}
                                autoFocus
                            />
                            <button
                                type="submit"
                                className={`px-3 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border-none text-[10px] font-semibold cursor-pointer ${current.fontClass}`}
                            >
                                Reply
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsReplying(false)}
                                className={`px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 text-[10px] font-semibold cursor-pointer ${current.fontClass}`}
                            >
                                Cancel
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Nested replies list with vertical thread line */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="flex gap-2 ml-3 sm:ml-4 group/thread">
                    {/* Visual vertical thread line with hover effect */}
                    <div className="flex justify-center w-3 cursor-pointer shrink-0">
                        <div className="w-[1.5px] bg-white/10 h-full group-hover/thread:bg-[#5cff5c]/60 transition-colors" />
                    </div>

                    {/* Children replies */}
                    <div className="flex-1 flex flex-col gap-4 pt-1">
                        {comment.replies.map(reply => (
                            <CommentNode
                                key={reply.id}
                                comment={reply}
                                current={current}
                                onReply={onReply}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

const extractFirstImageUrl = (markdown: string): string | undefined => {
    const match = markdown.match(/!\[.*?\]\((.*?)\)/);
    return match ? match[1] : undefined;
};

export function FigurePage({ current }: FigurePageProps) {
    const [searchParams] = useSearchParams()
    const { category } = useParams<{ category?: string }>()
    const navigate = useNavigate()
    const activeCategory = category || 'discussions'
    const [searchQuery, setSearchQuery] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest')
        const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null)
    const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)

    // Current logged in user info (mocked/fetched)
    const [currentUser, setCurrentUser] = useState<{ username: string; picture: string; is_pro: boolean; is_admin?: boolean } | null>(null)

    // Video form states
    const [youtubeVideos, setYoutubeVideos] = useState<YoutubeVideo[]>([])
    const [isAddVideoFormOpen, setIsAddVideoFormOpen] = useState(false)
    const [newVideoUrl, setNewVideoUrl] = useState('')

    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')
    const [newCategory, setNewCategory] = useState<'discussions' | 'showcase'>('discussions')
    const [newBodyType, setNewBodyType] = useState('Other/Unknown')
    const [newMultiColorType, setNewMultiColorType] = useState('Other/Unknown')

    // Comment input state
    const [commentText, setCommentText] = useState('')

    // Feedback/Toast state
    const [toastMessage, setToastMessage] = useState<string | null>(null)

    // Fetch user on mount
    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem('token')
            if (token) {
                try {
                    const res = await apiFetch('/api/users/me')
                    if (res.ok) {
                        const data = await res.json()
                        setCurrentUser({
                            username: data.username,
                            picture: data.picture,
                            is_pro: data.is_pro,
                            is_admin: data.is_admin
                        })
                    }
                } catch (e) {
                    console.error('Failed to load user info for forum', e)
                }
            }
        }
        fetchUser()
    }, [])

    // Reset view states when category filter changes
    useEffect(() => {
        setIsCreateFormOpen(false)
        setSelectedPost(null)
        setPostPage(1)
    }, [activeCategory])

    useEffect(() => {
        setPostPage(1)
    }, [searchQuery, sortBy])

    const [posts, setPosts] = useState<ForumPost[]>([])

    // Pagination states
    const [postPage, setPostPage] = useState(1)
    const [totalPosts, setTotalPosts] = useState(0)
    const [postPageSize] = useState(10)

    const [comments, setComments] = useState<ForumComment[]>([])
    const [commentPage, setCommentPage] = useState(1)
    const [totalComments, setTotalComments] = useState(0)
    const [commentPageSize] = useState(10)

    // Fetch comments for expanded post
    const fetchComments = async (postId: string, page: number) => {
        try {
            const res = await apiFetch(`/api/forum/posts/${postId}/comments?page=${page}&page_size=${commentPageSize}`)
            if (res.ok) {
                const data = await res.json()
                setComments(data.comments)
                setTotalComments(data.total)
            }
        } catch (e) {
            console.error("Failed to fetch comments", e)
        }
    }

    // Automatically load/reload comments when selected post or comment page changes
    useEffect(() => {
        if (selectedPost?.id) {
            setCommentPage(1)
            fetchComments(selectedPost.id, 1)
        } else {
            setComments([])
            setTotalComments(0)
        }
    }, [selectedPost?.id])

    useEffect(() => {
        if (selectedPost?.id) {
            fetchComments(selectedPost.id, commentPage)
        }
    }, [commentPage])

    // Fetch posts from backend
    const fetchPosts = async () => {
        try {
            const params = new URLSearchParams()
            if (activeCategory) params.append('category', activeCategory)
            if (searchQuery) params.append('search', searchQuery)
            if (sortBy) params.append('sort', sortBy)
            params.append('page', postPage.toString())
            params.append('page_size', postPageSize.toString())

            const res = await apiFetch(`/api/forum/posts?${params.toString()}`)
            if (res.ok) {
                const data = await res.json()
                setPosts(data.posts)
                setTotalPosts(data.total)
            }
        } catch (e) {
            console.error("Failed to fetch forum posts", e)
        }
    }

    const fetchPostDetails = async (postId: string) => {
        try {
            const res = await apiFetch(`/api/forum/posts/${postId}`)
            if (res.ok) {
                const data = await res.json()
                setSelectedPost(data)
                // Update post in listing too
                setPosts(prev => prev.map(p => p.id === postId ? data : p))
            }
        } catch (e) {
            console.error("Failed to load post details", e)
        }
    }

    // Debounced fetch posts or videos on changes
    useEffect(() => {
        if (activeCategory === 'videos') {
            fetchVideos()
            return
        }
        const delayDebounceFn = setTimeout(() => {
            fetchPosts()
        }, 300)
        return () => clearTimeout(delayDebounceFn)
    }, [activeCategory, searchQuery, sortBy, postPage])

    // Fetch post directly if query param contains postId
    const postIdFromUrl = searchParams.get('postId')
    useEffect(() => {
        if (postIdFromUrl) {
            fetchPostDetails(postIdFromUrl)
        } else {
            setSelectedPost(null)
        }
    }, [postIdFromUrl])

    const fetchVideos = async () => {
        try {
            const res = await apiFetch('/api/forum/videos')
            if (res.ok) {
                const data = await res.json()
                setYoutubeVideos(data)
            }
        } catch (e) {
            console.error('Failed to fetch videos', e)
        }
    }

    const handleCreateVideo = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newVideoUrl.trim()) return

        try {
            const res = await apiFetch('/api/forum/videos', {
                method: 'POST',
                body: JSON.stringify({
                    youtube_url: newVideoUrl.trim()
                })
            })

            if (res.ok) {
                const createdVideo = await res.json()
                setYoutubeVideos(prev => [createdVideo, ...prev])
                setIsAddVideoFormOpen(false)
                setNewVideoUrl('')
                triggerToast('Video added successfully!')
            } else {
                const err = await res.json().catch(() => ({}))
                triggerToast(err.detail || 'Failed to add video')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }

    const handleDeleteVideo = async (videoId: string) => {
        if (!confirm(isZh ? '确定要删除这个视频吗？' : 'Are you sure you want to delete this video?')) return

        try {
            const res = await apiFetch(`/api/forum/videos/${videoId}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                setYoutubeVideos(prev => prev.filter(v => v.id !== videoId))
                triggerToast('Video deleted successfully!')
            } else {
                const err = await res.json().catch(() => ({}))
                triggerToast(err.detail || 'Failed to delete video')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }


    // Toast helper
    const triggerToast = (msg: string) => {
        setToastMessage(msg)
        setTimeout(() => setToastMessage(null), 3000)
    }

    // Like handler
    const handleLikePost = async (postId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!currentUser) {
            triggerToast(isZh ? '请先登录！' : 'Please login first!')
            return
        }

        try {
            const res = await apiFetch(`/api/forum/posts/${postId}/like`, {
                method: 'POST'
            })
            if (res.ok) {
                const { isLiked, likes } = await res.json()
                setPosts(prev => prev.map(p => {
                    if (p.id === postId) {
                        return { ...p, isLiked, likes }
                    }
                    return p
                }))
                if (selectedPost && selectedPost.id === postId) {
                    setSelectedPost(prev => prev ? { ...prev, isLiked, likes } : null)
                }
            }
        } catch (err) {
            console.error("Failed to like post", err)
        }
    }

    const countTotalComments = (commentsList: ForumComment[]): number => {
        let count = commentsList.length
        for (const c of commentsList) {
            if (c.replies && c.replies.length > 0) {
                count += countTotalComments(c.replies)
            }
        }
        return count
    }

    // Add comment handler
    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!commentText.trim()) return

        if (!currentUser) {
            triggerToast(isZh ? '请先登录！' : 'Please login first!')
            return
        }

        if (selectedPost) {
            try {
                const res = await apiFetch(`/api/forum/posts/${selectedPost.id}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({
                        content: commentText.trim()
                    })
                })
                if (res.ok) {
                    await fetchPostDetails(selectedPost.id)
                    fetchComments(selectedPost.id, commentPage)
                    setCommentText('')
                    triggerToast('Comment posted successfully!')
                } else {
                    const err = await res.json().catch(() => ({}))
                    triggerToast(err.detail || 'Failed to post comment')
                }
            } catch (err) {
                console.error(err)
                triggerToast('Network error')
            }
        }
    }

    // Add nested comment reply handler
    const handleCommentReply = async (parentCommentId: string, replyText: string) => {
        if (!replyText.trim()) return

        if (!currentUser) {
            triggerToast(isZh ? '请先登录！' : 'Please login first!')
            return
        }

        if (selectedPost) {
            try {
                const res = await apiFetch(`/api/forum/posts/${selectedPost.id}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({
                        content: replyText.trim(),
                        parent_id: parentCommentId
                    })
                })
                if (res.ok) {
                    await fetchPostDetails(selectedPost.id)
                    fetchComments(selectedPost.id, commentPage)
                    triggerToast('Reply posted successfully!')
                } else {
                    const err = await res.json().catch(() => ({}))
                    triggerToast(err.detail || 'Failed to reply')
                }
            } catch (err) {
                console.error(err)
                triggerToast('Network error')
            }
        }
    }

    // Image upload handler


    // Create post handler
    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim() || !newContent.trim()) {
            triggerToast('Title and content are required!')
            return
        }

        const parsedImage = extractFirstImageUrl(newContent)
        if (newCategory === 'showcase' && !parsedImage) {
            triggerToast(isZh ? '玩家晒图必须包含图片！' : 'Showcase posts must contain at least one image!')
            return
        }

        try {
            const res = await apiFetch('/api/forum/posts', {
                method: 'POST',
                body: JSON.stringify({
                    title: newTitle.trim(),
                    content: newContent.trim(),
                    category: newCategory,
                    body_type: newBodyType,
                    multi_color_type: newMultiColorType,
                    image: parsedImage
                })
            })

            if (res.ok) {
                const createdPost = await res.json()
                setPosts(prev => [createdPost, ...prev])
                setIsCreateFormOpen(false)
                // Reset form
                setNewTitle('')
                setNewContent('')
                setNewCategory('discussions')
                setNewBodyType('Other/Unknown')
                setNewMultiColorType('Other/Unknown')

                triggerToast('Post published successfully!')
            } else {
                const err = await res.json().catch(() => ({}))
                triggerToast(err.detail || 'Failed to publish post')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }

    const filteredPosts = posts


    const isZh = current.figureForum.title.includes('手办') || current.figureForum.cancel === '取消'

    return (
        <PageContainer className="relative">

            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 bg-[#3c8527] border border-white/20 px-4 py-2 text-xs shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300 ${current.fontClass}`}>
                    {toastMessage}
                </div>
            )}



            {/* Forum Header Banner */}
            {!selectedPost && !isCreateFormOpen && (
                <div className="relative overflow-hidden border border-white/10 bg-gradient-to-r from-black/60 to-zinc-900/60 p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shrink-0">
                    <div className="z-10 flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`bg-[#3c8527] text-white text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider ${current.fontClass}`}>3D Print</span>
                            <span className={`text-white/40 text-[10px] ${current.fontClass}`}>v1.2.0-beta</span>
                        </div>
                        <h2 className={`text-lg sm:text-2xl font-extrabold text-white leading-tight ${current.fontClass}`} style={{ textShadow: '1px 1px 0px #000' }}>
                            {current.figureForum.title}
                        </h2>
                        <p className={`text-xs text-white/50 mt-1 max-w-2xl ${current.fontClass}`}>
                            {current.figureForum.subtitle}
                        </p>
                    </div>

                    <div className="z-10 flex flex-wrap items-center gap-3 shrink-0 w-full lg:w-auto justify-start lg:justify-end">
                        {/* Search container */}
                        <div className="flex items-center gap-1.5 w-full sm:w-auto flex-1 sm:flex-initial">
                            <div className="flex items-center bg-black/40 border border-white/10 focus-within:border-white/30 transition-all p-1 w-full sm:w-48 md:w-52">
                                <input
                                    type="text"
                                    placeholder={activeCategory === 'videos' ? "Search videos..." : "Search discussions..."}
                                    className="bg-transparent text-white px-2 py-0.5 text-xs outline-none flex-1 placeholder:text-white/30 font-pixel-hans"
                                    value={searchInput}
                                    onChange={e => setSearchInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            setSearchQuery(searchInput);
                                        }
                                    }}
                                />
                                {searchInput && (
                                    <button
                                        onClick={() => {
                                            setSearchInput('');
                                            setSearchQuery('');
                                        }}
                                        className="text-white/30 hover:text-white px-1 cursor-pointer border-none bg-transparent"
                                    >
                                        <Icon icon="pixelarticons:close" />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setSearchQuery(searchInput)}
                                className={`px-3 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/10 transition-colors font-semibold flex items-center gap-1 cursor-pointer text-xs shrink-0 ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:search" />
                                <span>{isZh ? '搜索' : 'Search'}</span>
                            </button>
                        </div>

                        {/* Sorting Selector */}
                        {activeCategory !== 'videos' && (
                            <div className="flex items-center">
                                <div className="flex border border-white/10 p-0.5 bg-black/20">
                                    <button
                                        onClick={() => setSortBy('latest')}
                                        className={`px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-colors flex items-center gap-1 border-none ${sortBy === 'latest' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                                    >
                                        <Icon icon="pixelarticons:clock" className="text-xs" />
                                        <span>Latest</span>
                                    </button>
                                    <button
                                        onClick={() => setSortBy('popular')}
                                        className={`px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-colors flex items-center gap-1 border-none ${sortBy === 'popular' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                                    >
                                        <Icon icon="pixelarticons:heart" className="text-xs" />
                                        <span>Popular</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Publish Post button */}
                        {activeCategory !== 'videos' && (
                            <button
                                onClick={() => { setIsCreateFormOpen(true); setSelectedPost(null); }}
                                className={`px-3 py-1.5 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 transition-all font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:scale-105 active:scale-95 text-xs ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:plus" className="text-sm" />
                                <span>{current.figureForum.publishPost}</span>
                            </button>
                        )}

                        {/* Add Video button (Admin only) */}
                        {activeCategory === 'videos' && currentUser?.is_admin && (
                            <button
                                onClick={() => { setIsAddVideoFormOpen(true); setSelectedPost(null); }}
                                className={`px-3 py-1.5 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 transition-all font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:scale-105 active:scale-95 text-xs ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:plus" className="text-sm" />
                                <span>{isZh ? '添加视频' : 'Add Video'}</span>
                            </button>
                        )}
                    </div>

                    {/* Decorative cyber grid */}
                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none w-1/3 h-full bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />
                </div>
            )}

            {selectedPost ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0 animate-in fade-in duration-300 flex flex-col gap-6">
                    {/* Back Button */}
                    <div>
                        <button
                            onClick={() => navigate(`/figure/${activeCategory}`)}
                            className={`flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors bg-white/5 border border-white/10 px-3 py-1.5 cursor-pointer ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:arrow-left" />
                            <span>Back to Forum</span>
                        </button>
                    </div>

                    {/* Inline Post Detail View */}
                    <div className="bg-black/20 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
                        {/* Header Info */}
                        <div className={`flex items-center gap-2 flex-wrap text-xs text-white/40 ${current.fontClass}`}>
                            <span className="bg-[#3c8527]/20 text-[#5cff5c] border border-[#3c8527]/30 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
                                {selectedPost.category === 'showcase' ? 'Showcase' : 'Discussion'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span>Posted by</span>
                                <span className="text-white/70 font-semibold">@{selectedPost.author}</span>
                                <span>•</span>
                                <span>{selectedPost.createdAt}</span>
                            </div>
                        </div>

                        {/* Title */}
                        <h2 className={`text-lg sm:text-2xl font-bold leading-snug text-white ${current.fontClass}`}>
                            {selectedPost.title}
                        </h2>

                        {/* Body Type and Multi-color details for Showcase posts */}
                        {(selectedPost.bodyType || selectedPost.multiColorType) && (
                            <div className={`flex flex-wrap gap-x-6 gap-y-2 text-xs border-b border-white/5 pb-4 mb-1 ${current.fontClass}`}>
                                {selectedPost.bodyType && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-white/40">{isZh ? '主体类型:' : 'Body Type:'}</span>
                                        <span className="text-[#5cff5c] font-semibold bg-[#3c8527]/15 border border-[#3c8527]/30 px-2 py-0.5">{getBodyTypeLabel(selectedPost.bodyType, current)}</span>
                                    </div>
                                )}
                                {selectedPost.multiColorType && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-white/40">{isZh ? '多色处理:' : 'Color Mode:'}</span>
                                        <span className="text-cyan-400 font-semibold bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5">{getMultiColorTypeLabel(selectedPost.multiColorType, current)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Body Content */}
                        <div className={`text-xs sm:text-sm text-white/80 leading-relaxed border-b border-white/5 pb-4 mb-2 ${current.fontClass}`}>
                            <ArticleMarkdown content={selectedPost.content} />
                        </div>

                        {/* Image (if present, typical for Showcase or image-attached Discussion posts) */}
                        {selectedPost.image && (
                            <div className="bg-zinc-950/60 border border-white/5 p-4 flex items-center justify-center overflow-hidden max-h-[450px] mb-4">
                                <img
                                    src={selectedPost.image}
                                    alt={selectedPost.title}
                                    className="max-h-[400px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
                                />
                            </div>
                        )}


                        {/* Interaction Row */}
                        <div className={`flex items-center gap-6 text-xs text-white/40 border-b border-white/5 pb-4 shrink-0 ${current.fontClass}`}>
                            <button
                                onClick={(e) => handleLikePost(selectedPost.id, e)}
                                className="flex items-center gap-2 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer"
                            >
                                <Icon icon="pixelarticons:heart" className={`text-sm ${selectedPost.isLiked ? 'text-red-500' : ''}`} />
                                <span className={selectedPost.isLiked ? 'text-red-500' : ''}>{selectedPost.likes} Likes</span>
                            </button>
                            <div className="flex items-center gap-2">
                                <Icon icon="pixelarticons:comment" className="text-sm" />
                                <span>{selectedPost.commentsCount} Comments</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Icon icon="pixelarticons:sun" className="text-sm" />
                                <span>{selectedPost.views} Views</span>
                            </div>
                        </div>

                        {/* Comments Section */}
                        <div className="flex flex-col gap-4 mt-2">
                            <h3 className={`text-xs font-bold text-white uppercase tracking-wider ${current.fontClass}`}>
                                Comments
                            </h3>

                            {/* Root comment form */}
                            <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    placeholder={current.figureForum.writeComment}
                                    className={`bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] flex-1 ${current.fontClass}`}
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    className={`px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-semibold cursor-pointer ${current.fontClass}`}
                                >
                                    {current.figureForum.commentBtn}
                                </button>
                            </form>

                            {/* Recursive comments list */}
                            <div className="flex flex-col gap-4">
                                {comments.length === 0 ? (
                                    <div className={`text-center text-white/35 py-4 text-xs ${current.fontClass}`}>
                                        No comments yet. Be the first to reply!
                                    </div>
                                ) : (
                                    comments.map(c => (
                                        <CommentNode
                                            key={c.id}
                                            comment={c}
                                            current={current}
                                            onReply={handleCommentReply}
                                        />
                                    ))
                                )}
                            </div>

                            {/* Pagination for comments */}
                            {totalComments > commentPageSize && (
                                <div className="flex justify-center items-center gap-3 mt-4 py-2 border-t border-white/5 font-pixel-hans text-[11px] text-white">
                                    <button
                                        type="button"
                                        onClick={() => setCommentPage(p => Math.max(1, p - 1))}
                                        disabled={commentPage === 1}
                                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white/80 hover:text-white transition-colors"
                                    >
                                        &lt;
                                    </button>
                                    <span className="select-none">
                                        {isZh ? `第 ${commentPage} 页，共 ${Math.ceil(totalComments / commentPageSize)} 页` : `Page ${commentPage} of ${Math.ceil(totalComments / commentPageSize)}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCommentPage(p => Math.min(Math.ceil(totalComments / commentPageSize), p + 1))}
                                        disabled={commentPage >= Math.ceil(totalComments / commentPageSize)}
                                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white/80 hover:text-white transition-colors"
                                    >
                                        &gt;
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            ) : isCreateFormOpen ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0 animate-in fade-in duration-300 flex flex-col gap-6">
                    {/* Back Button */}
                    <div>
                        <button
                            onClick={() => setIsCreateFormOpen(false)}
                            className={`flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors bg-white/5 border border-white/10 px-3 py-1.5 cursor-pointer ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:arrow-left" />
                            <span>Back to Forum</span>
                        </button>
                    </div>

                    {/* Inline Create Post View */}
                    <div className="bg-black/20 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className={`text-base sm:text-lg font-bold text-white flex items-center gap-2 ${current.fontClass}`}>
                                <Icon icon="pixelarticons:plus" className="text-[#3c8527]" />
                                <span>{current.figureForum.publishPost}</span>
                            </h3>
                        </div>

                        <form onSubmit={handleCreatePost} className="flex flex-col gap-4">
                            {/* Title */}
                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{current.figureForum.postTitle}</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Slicing micro figurines instructions"
                                    className={`bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] ${current.fontClass}`}
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Category Selection */}
                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{current.figureForum.postCategory}</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setNewCategory('discussions'); }}
                                        className={`py-2 border flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-bold ${current.fontClass} ${newCategory === 'discussions' ? 'bg-[#3c8527]/15 border-[#3c8527] text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                                    >
                                        <Icon icon="pixelarticons:comment" />
                                        <span>Discussion</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setNewCategory('showcase'); }}
                                        className={`py-2 border flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-bold ${current.fontClass} ${newCategory === 'showcase' ? 'bg-[#3c8527]/15 border-[#3c8527] text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                                    >
                                        <Icon icon="pixelarticons:image-new" />
                                        <span>Showcase</span>
                                    </button>
                                </div>
                            </div>

                            {/* Body Type & Multicolor Type Selection */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Body Type Selector */}
                                <div className="flex flex-col gap-1.5">
                                    <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{isZh ? '主体类型' : 'Body Type'}</label>
                                    <select
                                        value={newBodyType}
                                        onChange={e => setNewBodyType(e.target.value)}
                                        className={`bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] w-full ${current.fontClass}`}
                                    >
                                        {(current.figureForum.bodyTypes || []).map((t, idx) => (
                                            <option key={t} value={BODY_TYPES_EN[idx]} className="bg-zinc-900 text-white">
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Multicolor Type Selector */}
                                <div className="flex flex-col gap-1.5">
                                    <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{isZh ? '多色处理' : 'Color Mode'}</label>
                                    <select
                                        value={newMultiColorType}
                                        onChange={e => setNewMultiColorType(e.target.value)}
                                        className={`bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] w-full ${current.fontClass}`}
                                    >
                                        {(current.figureForum.colorModes || []).map((t, idx) => (
                                            <option key={t} value={MULTICOLOR_TYPES_EN[idx]} className="bg-zinc-900 text-white">
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>


                            {/* Description Content with WYSIWYG MDXEditor */}
                            <div className="flex flex-col gap-2">
                                <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{current.figureForum.postContent}</label>
                                <MarkdownEditor
                                    value={newContent}
                                    onChange={setNewContent}
                                    placeholder="Describe details, tips, guides using the WYSIWYG editor..."
                                    current={current}
                                />
                            </div>



                            {/* Action Buttons */}
                            <div className="flex gap-3 justify-end mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateFormOpen(false)}
                                    className={`px-4 py-2 border border-white/10 bg-transparent text-white/60 hover:text-white transition-colors text-xs font-semibold cursor-pointer ${current.fontClass}`}
                                >
                                    {current.figureForum.cancel}
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white font-bold text-xs transition-colors cursor-pointer border-none shadow-md ${current.fontClass}`}
                                >
                                    {current.figureForum.submitPost}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : isAddVideoFormOpen ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0 animate-in fade-in duration-300 flex flex-col gap-6">
                    {/* Back Button */}
                    <div>
                        <button
                            onClick={() => setIsAddVideoFormOpen(false)}
                            className={`flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors bg-white/5 border border-white/10 px-3 py-1.5 cursor-pointer ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:arrow-left" />
                            <span>{isZh ? '返回视频列表' : 'Back to Videos'}</span>
                        </button>
                    </div>

                    {/* Inline Add Video View */}
                    <div className="bg-black/20 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className={`text-base sm:text-lg font-bold text-white flex items-center gap-2 ${current.fontClass}`}>
                                <Icon icon="pixelarticons:plus" className="text-[#3c8527]" />
                                <span>{isZh ? '添加新视频' : 'Add New Video'}</span>
                            </h3>
                        </div>

                        <form onSubmit={handleCreateVideo} className="flex flex-col gap-4">
                            {/* YouTube URL */}
                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs text-white/60 uppercase ${current.fontClass}`}>{isZh ? 'YouTube 链接或视频 ID' : 'YouTube Link or Video ID'}</label>
                                <input
                                    type="text"
                                    placeholder="e.g. https://www.youtube.com/watch?v=... or p96u86q_7H0"
                                    className={`bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] ${current.fontClass}`}
                                    value={newVideoUrl}
                                    onChange={e => setNewVideoUrl(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 justify-end mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAddVideoFormOpen(false)}
                                    className={`px-4 py-2 border border-white/10 bg-transparent text-white/60 hover:text-white transition-colors text-xs font-semibold cursor-pointer ${current.fontClass}`}
                                >
                                    {isZh ? '取消' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white font-bold text-xs transition-colors cursor-pointer border-none shadow-md ${current.fontClass}`}
                                >
                                    {isZh ? '发布视频' : 'Publish Video'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                <>

                    {/* Main Content View Switcher */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                        {/* Category 1: Discussions (List Format, optional image) */}
                        {activeCategory === 'discussions' && (
                            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                                {filteredPosts.length === 0 ? (
                                    <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                        No discussions found.
                                    </div>
                                ) : (
                                    filteredPosts.map(post => (
                                        <div
                                            key={post.id}
                                            onClick={() => navigate(`/figure/${activeCategory}?postId=${post.id}`)}
                                            className="bg-black/30 border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-start hover:border-[#3c8527]/50 hover:bg-white/5 transition-all duration-300 cursor-pointer group shadow-md"
                                        >
                                            <div className="flex-1 flex flex-col min-w-0">
                                                {/* Header Info */}
                                                <div className="flex items-center flex-wrap gap-2 text-[10px] text-white/40 mb-2">
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-3.5 h-3.5 bg-zinc-700 overflow-hidden border border-white/15 flex items-center justify-center shrink-0">
                                                            {post.authorAvatar ? (
                                                                <img src={post.authorAvatar} alt={post.author} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Icon icon="pixelarticons:user" className="text-white/60 text-[10px]" />
                                                            )}
                                                        </div>
                                                        <span className={`text-white/60 font-semibold truncate max-w-[100px] ${current.fontClass}`}>@{post.author}</span>
                                                    </div>
                                                    <span>•</span>
                                                    <span className={current.fontClass}>{post.createdAt}</span>
                                                    <span>•</span>
                                                    <span className={`bg-white/5 border border-white/10 text-white/60 px-1 uppercase tracking-wider text-[8px] ${current.fontClass}`}>
                                                        {post.category === 'showcase' ? 'Showcase' : 'Discussion'}
                                                    </span>
                                                </div>

                                                {/* Title */}
                                                <h3 className={`text-sm sm:text-base font-bold text-white group-hover:text-[#5cff5c] transition-colors truncate max-w-full ${current.fontClass}`}>
                                                    {post.title}
                                                </h3>

                                                {/* Snippet */}
                                                <p className={`text-xs text-white/50 line-clamp-2 mt-1.5 leading-relaxed pr-4 ${current.fontClass}`}>
                                                    {post.content}
                                                </p>

                                                {/* Footer Info Row */}
                                                <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] text-white/40 border-t border-white/5 pt-3 w-full">
                                                    <div className="flex items-center gap-1 hover:text-red-500 transition-colors" onClick={(e) => handleLikePost(post.id, e)}>
                                                        <Icon icon="pixelarticons:heart" className={post.isLiked ? 'text-red-500 text-xs' : 'text-xs'} />
                                                        <span className={post.isLiked ? 'text-red-500' : ''}>{post.likes}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Icon icon="pixelarticons:comment" className="text-xs" />
                                                        <span>{post.commentsCount}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Icon icon="pixelarticons:sun" className="text-xs" />
                                                        <span>{post.views}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5 ml-auto">
                                                        {post.bodyType && (
                                                            <span className={`text-[7px] text-[#5cff5c] bg-[#3c8527]/15 border border-[#3c8527]/30 px-1.5 py-0.5 uppercase select-none ${current.fontClass}`}>
                                                                {getBodyTypeLabel(post.bodyType, current)}
                                                            </span>
                                                        )}
                                                        {post.multiColorType && (
                                                            <span className={`text-[7px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 uppercase select-none ${current.fontClass}`}>
                                                                {getMultiColorTypeLabel(post.multiColorType, current)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Optional Image Thumbnail on Right */}
                                            {post.image && (
                                                <div className="w-20 h-20 bg-zinc-950/45 border border-white/10 shrink-0 flex items-center justify-center p-2 self-center sm:self-start overflow-hidden">
                                                    <img
                                                        src={post.image}
                                                        alt="Thumbnail"
                                                        className="max-w-full max-h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transform group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Category 2: Showcase (Stream/Card Grid Format, focuses on images) */}
                        {activeCategory === 'showcase' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                                {filteredPosts.length === 0 ? (
                                    <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                        No showcase creations found.
                                    </div>
                                ) : (
                                    filteredPosts.map(post => (
                                        <div
                                            key={post.id}
                                            className="bg-black/30 border border-white/10 flex flex-col cursor-pointer group hover:border-[#3c8527]/50 transition-all duration-300 relative shadow-lg overflow-hidden"
                                            onClick={() => navigate(`/figure/${activeCategory}?postId=${post.id}`)}
                                        >
                                            {/* Post Category Tag */}
                                            <div className="absolute top-3 left-3 z-10">
                                                <span className="bg-black/60 backdrop-blur-md border border-white/20 text-white/95 text-[9px] px-2 py-0.5 uppercase tracking-wider font-semibold">
                                                    Showcase
                                                </span>
                                            </div>

                                            {/* Figure Image Preview */}
                                            <div className="w-full aspect-square bg-zinc-900/40 relative overflow-hidden flex items-center justify-center p-4 border-b border-white/5">
                                                <img
                                                    src={post.image}
                                                    alt={post.title}
                                                    className="max-w-full max-h-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)] transform group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>

                                            {/* Details */}
                                            <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center justify-between text-[10px] text-white/40 mb-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-4 h-4 bg-zinc-700 overflow-hidden border border-white/15 flex items-center justify-center">
                                                                {post.authorAvatar ? (
                                                                    <img src={post.authorAvatar} alt={post.author} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Icon icon="pixelarticons:user" className="text-white/60 text-xs" />
                                                                )}
                                                            </div>
                                                            <span className={`text-white/60 truncate ${current.fontClass}`}>@{post.author}</span>
                                                        </div>
                                                        <span className="font-mono text-[9px]">{post.createdAt}</span>
                                                    </div>

                                                    <h3 className={`text-sm sm:text-base font-bold text-white group-hover:text-[#5cff5c] transition-colors line-clamp-2 ${current.fontClass}`}>
                                                        {post.title}
                                                    </h3>

                                                    <p className={`text-xs text-white/50 line-clamp-2 mt-1.5 leading-relaxed ${current.fontClass}`}>
                                                        {post.content}
                                                    </p>

                                                    <div className="flex flex-wrap gap-1 mt-3">
                                                        {post.bodyType && (
                                                            <span className={`text-[8px] text-[#5cff5c] bg-[#3c8527]/15 border border-[#3c8527]/30 px-1.5 py-0.5 select-none ${current.fontClass}`}>
                                                                {getBodyTypeLabel(post.bodyType, current)}
                                                            </span>
                                                        )}
                                                        {post.multiColorType && (
                                                            <span className={`text-[8px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 select-none ${current.fontClass}`}>
                                                                {getMultiColorTypeLabel(post.multiColorType, current)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1 shrink-0">
                                                    <div className="flex items-center gap-4 text-[10px] text-white/40">
                                                        <button
                                                            onClick={(e) => handleLikePost(post.id, e)}
                                                            className="flex items-center gap-1.5 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer"
                                                        >
                                                            <Icon icon="pixelarticons:heart" className={`text-sm ${post.isLiked ? 'text-red-500' : 'text-white/40'}`} />
                                                            <span className={post.isLiked ? 'text-red-500' : ''}>{post.likes}</span>
                                                        </button>
                                                        <div className="flex items-center gap-1.5">
                                                            <Icon icon="pixelarticons:comment" className="text-sm" />
                                                            <span>{post.commentsCount}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Category 3: Videos (Direct YouTube embeds) */}
                        {activeCategory === 'videos' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                                {youtubeVideos.map(video => (
                                    <div
                                        key={video.id}
                                        className="bg-black/30 border border-white/10 flex flex-col group hover:border-[#3c8527]/50 transition-all duration-300 shadow-lg overflow-hidden relative text-white"
                                    >
                                        {currentUser?.is_admin && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteVideo(video.id);
                                                }}
                                                className="absolute top-2 right-2 z-20 bg-red-700/80 hover:bg-red-600 text-white p-1 border border-white/10 transition-colors cursor-pointer"
                                                title={isZh ? '删除视频' : 'Delete Video'}
                                            >
                                                <Icon icon="pixelarticons:trash" className="text-xs" />
                                            </button>
                                        )}
                                        {/* Embedded Iframe Container */}
                                        <div className="w-full aspect-video bg-zinc-950 relative border-b border-white/5">
                                            <iframe
                                                src={`https://www.youtube.com/embed/${video.youtubeId}`}
                                                className="w-full h-full border-none"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                title={`YouTube video player - ${video.youtubeId}`}
                                            ></iframe>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pagination for posts */}
                    {(activeCategory === 'discussions' || activeCategory === 'showcase') && totalPosts > postPageSize && (
                        <div className="flex justify-center items-center gap-4 py-3.5 border-t border-white/5 font-pixel-hans text-xs text-white shrink-0 mt-3">
                            <button
                                onClick={() => setPostPage(p => Math.max(1, p - 1))}
                                disabled={postPage === 1}
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white/80 hover:text-white transition-colors"
                            >
                                &lt;&lt;
                            </button>
                            <span className="select-none">
                                {isZh ? `第 ${postPage} 页，共 ${Math.ceil(totalPosts / postPageSize)} 页` : `Page ${postPage} of ${Math.ceil(totalPosts / postPageSize)}`}
                            </span>
                            <button
                                onClick={() => setPostPage(p => Math.min(Math.ceil(totalPosts / postPageSize), p + 1))}
                                disabled={postPage >= Math.ceil(totalPosts / postPageSize)}
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white/80 hover:text-white transition-colors"
                            >
                                &gt;&gt;
                            </button>
                        </div>
                    )}
                </>
            )}






        </PageContainer>
    )
}
