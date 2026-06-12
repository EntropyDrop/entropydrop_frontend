import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import type { LangData } from '../constants/lang'

// Split out components, types and helpers
import type { ForumPost, ForumComment, YoutubeVideo } from './figure/types'
import { extractFirstImageUrl } from './figure/helpers'
import { FigureHeader } from './figure/FigureHeader'
import { PostDetailView } from './figure/PostDetailView'
import { CreatePostForm } from './figure/CreatePostForm'
import { AddVideoForm } from './figure/AddVideoForm'
import { PostItemDiscussions } from './figure/PostItemDiscussions'
import { PostItemShowcase } from './figure/PostItemShowcase'
import { VideoList } from './figure/VideoList'

interface FigurePageProps {
    current: LangData
}

function DiscussionSkeleton() {
    return (
        <div className="bg-black/30 border border-white/10 p-4 sm:p-5 flex justify-between items-start animate-pulse">
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-3.5 h-3.5 bg-white/5 border border-white/10" />
                    <div className="w-20 h-2.5 bg-white/5" />
                    <span className="text-white/10">•</span>
                    <div className="w-12 h-2.5 bg-white/5" />
                </div>
                <div className="w-2/3 h-4 bg-white/10 mt-1" />
                <div className="w-full h-3 bg-white/5 mt-2.5" />
                <div className="w-4/5 h-3 bg-white/5 mt-1.5" />
                <div className="flex gap-4 mt-4 border-t border-white/5 pt-3">
                    <div className="w-8 h-3 bg-white/5" />
                    <div className="w-8 h-3 bg-white/5" />
                    <div className="w-8 h-3 bg-white/5" />
                </div>
            </div>
            <div className="w-20 h-20 bg-white/5 border border-white/10 shrink-0 ml-4 hidden sm:block" />
        </div>
    )
}

function ShowcaseSkeleton() {
    return (
        <div className="bg-black/30 border border-white/10 flex flex-col animate-pulse">
            <div className="w-full aspect-square bg-white/5 border-b border-white/5" />
            <div className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-white/5 border border-white/10" />
                        <div className="w-16 h-2.5 bg-white/5" />
                    </div>
                    <div className="w-10 h-2.5 bg-white/5" />
                </div>
                <div className="w-3/4 h-4 bg-white/10" />
                <div className="w-full h-3 bg-white/5 mt-1" />
                <div className="w-5/6 h-3 bg-white/5" />
                <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
                    <div className="flex gap-3">
                        <div className="w-8 h-3 bg-white/5" />
                        <div className="w-8 h-3 bg-white/5" />
                    </div>
                </div>
            </div>
        </div>
    )
}

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
    const [isLoading, setIsLoading] = useState(false)

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
        setIsLoading(true)
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
        } finally {
            setIsLoading(false)
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
        if (!confirm(current.figureForum.confirmDeleteVideo)) return

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

    const handleDeletePost = async (postId: string) => {
        if (!confirm(current.figureForum.confirmDeletePost)) return

        try {
            const res = await apiFetch(`/api/forum/posts/${postId}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                setPosts(prev => prev.filter(p => p.id !== postId))
                triggerToast('Post deleted successfully!')
                navigate(`/figure/${activeCategory}`)
            } else {
                const err = await res.json().catch(() => ({}))
                triggerToast(err.detail || 'Failed to delete post')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }

    const handleUpdatePostCategory = async (postId: string, newCat: 'discussions' | 'showcase') => {
        try {
            const res = await apiFetch(`/api/forum/posts/${postId}`, {
                method: 'PATCH',
                body: JSON.stringify({ category: newCat })
            })

            if (res.ok) {
                const updatedPost = await res.json()
                setSelectedPost(updatedPost)
                setPosts(prev => prev.map(p => p.id === postId ? updatedPost : p))
                triggerToast('Post category updated successfully!')
            } else {
                const err = await res.json().catch(() => ({}))
                triggerToast(err.detail || 'Failed to update category')
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
            triggerToast(current.common.authRequired + '!')
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

    // Add comment handler
    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!commentText.trim()) return

        if (!currentUser) {
            triggerToast(current.common.authRequired + '!')
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
            triggerToast(current.common.authRequired + '!')
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

    // Create post handler
    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim() || !newContent.trim()) {
            triggerToast('Title and content are required!')
            return
        }

        const parsedImage = extractFirstImageUrl(newContent)
        if (newCategory === 'showcase' && !parsedImage) {
            triggerToast(current.figureForum.showcaseImgWarning)
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



    return (
        <PageContainer className="relative">
            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 bg-[#3c8527] border border-white/20 px-4 py-2 text-xs shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300 ${current.fontClass}`}>
                    {toastMessage}
                </div>
            )}

            {/* Forum Header Banner */}
            <FigureHeader
                activeCategory={activeCategory}
                selectedPost={selectedPost}
                isCreateFormOpen={isCreateFormOpen}
                currentUser={currentUser}
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                setSearchQuery={setSearchQuery}
                sortBy={sortBy}
                setSortBy={setSortBy}
                setIsCreateFormOpen={setIsCreateFormOpen}
                setIsAddVideoFormOpen={setIsAddVideoFormOpen}
                current={current}
            />

            {selectedPost ? (
                <PostDetailView
                    selectedPost={selectedPost}
                    activeCategory={activeCategory}
                    commentText={commentText}
                    setCommentText={setCommentText}
                    handleAddComment={handleAddComment}
                    comments={comments}
                    commentPage={commentPage}
                    setCommentPage={setCommentPage}
                    totalComments={totalComments}
                    commentPageSize={commentPageSize}
                    handleLikePost={handleLikePost}
                    handleCommentReply={handleCommentReply}
                    current={current}
                    currentUser={currentUser}
                    handleDeletePost={handleDeletePost}
                    handleUpdatePostCategory={handleUpdatePostCategory}
                />
            ) : isCreateFormOpen ? (
                <CreatePostForm
                    current={current}
                    handleCreatePost={handleCreatePost}
                    newTitle={newTitle}
                    setNewTitle={setNewTitle}
                    newCategory={newCategory}
                    setNewCategory={setNewCategory}
                    newBodyType={newBodyType}
                    setNewBodyType={setNewBodyType}
                    newMultiColorType={newMultiColorType}
                    setNewMultiColorType={setNewMultiColorType}
                    newContent={newContent}
                    setNewContent={setNewContent}
                    setIsCreateFormOpen={setIsCreateFormOpen}
                />
            ) : isAddVideoFormOpen ? (
                <AddVideoForm
                    current={current}
                    handleCreateVideo={handleCreateVideo}
                    newVideoUrl={newVideoUrl}
                    setNewVideoUrl={setNewVideoUrl}
                    setIsAddVideoFormOpen={setIsAddVideoFormOpen}
                />
            ) : (
                <>
                    {/* Main Content View Switcher */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                        {/* Category 1: Discussions */}
                        {activeCategory === 'discussions' && (
                            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <DiscussionSkeleton key={i} />
                                    ))
                                ) : posts.length === 0 ? (
                                    <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                        {current.figureForum.noDiscussions}
                                    </div>
                                ) : (
                                    posts.map(post => (
                                        <PostItemDiscussions
                                            key={post.id}
                                            post={post}
                                            onSelect={() => navigate(`/figure/${activeCategory}?postId=${post.id}`)}
                                            handleLikePost={handleLikePost}
                                            current={current}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        {/* Category 2: Showcase */}
                        {activeCategory === 'showcase' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                                {isLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <ShowcaseSkeleton key={i} />
                                    ))
                                ) : posts.length === 0 ? (
                                    <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                        {current.figureForum.noShowcases}
                                    </div>
                                ) : (
                                    posts.map(post => (
                                        <PostItemShowcase
                                            key={post.id}
                                            post={post}
                                            onSelect={() => navigate(`/figure/${activeCategory}?postId=${post.id}`)}
                                            handleLikePost={handleLikePost}
                                            current={current}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        {/* Category 3: Videos */}
                        {activeCategory === 'videos' && (
                            <VideoList
                                youtubeVideos={youtubeVideos}
                                currentUser={currentUser}
                                handleDeleteVideo={handleDeleteVideo}
                                current={current}
                            />
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
                                {current.figureForum.forumPageLabel.replace('{page}', String(postPage)).replace('{total}', String(Math.ceil(totalPosts / postPageSize)))}
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
