import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { apiFetch, apiResponseJson } from '../../utils/api'
import type { LangData } from '../../constants/lang'
import type { CurrentUser } from '../../hooks/useCurrentUser'
import { extractFirstImageUrl } from './helpers'
import type { ForumData } from './useForumData'

export function useForumActions({ data, current, currentUser, activeCategory, navigate }: {
    data: ForumData; current: LangData; currentUser: CurrentUser | null; activeCategory: string; navigate: NavigateFunction
}) {
    const { setYoutubeVideos, setPosts, selectedPost, setSelectedPost, fetchPostDetails, fetchComments, commentPage } = data
    const [createForm, setCreateForm] = useState({ category: activeCategory, open: false })
    const isCreateFormOpen = createForm.category === activeCategory && createForm.open
    const setIsCreateFormOpen = (open: boolean) => setCreateForm({ category: activeCategory, open })
    // Video form states
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
                const createdVideo = await apiResponseJson(res)
                setYoutubeVideos(prev => [createdVideo, ...prev])
                setIsAddVideoFormOpen(false)
                setNewVideoUrl('')
                triggerToast('Video added successfully!')
            } else {
                const err = await apiResponseJson(res).catch(() => ({}))
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
                const err = await apiResponseJson(res).catch(() => ({}))
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
                const err = await apiResponseJson(res).catch(() => ({}))
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
                const updatedPost = await apiResponseJson(res)
                setSelectedPost(updatedPost)
                setPosts(prev => prev.map(p => p.id === postId ? updatedPost : p))
                triggerToast('Post category updated successfully!')
            } else {
                const err = await apiResponseJson(res).catch(() => ({}))
                triggerToast(err.detail || 'Failed to update category')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }

    const handleUpdatePostTitle = async (postId: string, title: string) => {
        try {
            const res = await apiFetch(`/api/forum/posts/${postId}`, {
                method: 'PATCH',
                body: JSON.stringify({ title })
            })

            if (res.ok) {
                const updatedPost = await apiResponseJson(res)
                setSelectedPost(updatedPost)
                setPosts(prev => prev.map(p => p.id === postId ? updatedPost : p))
                triggerToast('Post title updated successfully!')
            } else {
                const err = await apiResponseJson(res).catch(() => ({}))
                triggerToast(err.detail || 'Failed to update title')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }

    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

    // Toast helper
    const triggerToast = (msg: string) => {
        setToastMessage(msg)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToastMessage(null), 3000)
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
                const { isLiked, likes } = await apiResponseJson(res)
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
                    const err = await apiResponseJson(res).catch(() => ({}))
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
                    const err = await apiResponseJson(res).catch(() => ({}))
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
                const createdPost = await apiResponseJson(res)
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
                const err = await apiResponseJson(res).catch(() => ({}))
                triggerToast(err.detail || 'Failed to publish post')
            }
        } catch (err) {
            console.error(err)
            triggerToast('Network error, please try again')
        }
    }



    return {
        isCreateFormOpen, setIsCreateFormOpen, isAddVideoFormOpen, setIsAddVideoFormOpen,
        newVideoUrl, setNewVideoUrl, newTitle, setNewTitle, newContent, setNewContent,
        newCategory, setNewCategory, newBodyType, setNewBodyType, newMultiColorType, setNewMultiColorType,
        commentText, setCommentText, toastMessage,
        handleCreateVideo, handleDeleteVideo, handleDeletePost, handleUpdatePostCategory, handleUpdatePostTitle,
        handleLikePost, handleAddComment, handleCommentReply, handleCreatePost,
    }
}
