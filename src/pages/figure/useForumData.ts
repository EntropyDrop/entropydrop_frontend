import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { apiJson } from '../../utils/api'
import { useAuthSession } from '../../hooks/useAuthSession'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import type { ForumPost, ForumComment, YoutubeVideo } from './types'

export function useForumData(activeCategory: string, searchQuery: string, sortBy: string, postId: string | null) {
    const session = useAuthSession()
    const listRequest = useLatestRequest(), detailRequest = useLatestRequest(), commentRequest = useLatestRequest(), videoRequest = useLatestRequest()
    const selection = useRef(postId)
    useEffect(() => { selection.current = postId }, [postId])
    const filterKey = JSON.stringify([activeCategory, searchQuery, sortBy])
    const [pagination, setPagination] = useState({ key: filterKey, page: 1 })
    const postPage = pagination.key === filterKey ? pagination.page : 1
    const setPostPage = (value: SetStateAction<number>) => setPagination({ key: filterKey, page: typeof value === 'function' ? value(postPage) : value })
    const [posts, setPosts] = useState<ForumPost[]>([])
    const [totalPosts, setTotalPosts] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [detail, setDetail] = useState<ForumPost | null>(null)
    const selectedPost = detail?.id === postId ? detail : null
    const setSelectedPost = useCallback((value: SetStateAction<ForumPost | null>) => setDetail(previous => {
        const next = typeof value === 'function' ? value(previous) : value
        return next && next.id !== selection.current ? previous : next
    }), [])
    const [commentState, setCommentState] = useState({ id: postId, page: 1 })
    const commentPage = commentState.id === postId ? commentState.page : 1
    const setCommentPage = (value: SetStateAction<number>) => setCommentState({ id: postId, page: typeof value === 'function' ? value(commentPage) : value })
    const [comments, setComments] = useState<ForumComment[]>([])
    const [totalComments, setTotalComments] = useState(0)
    const [youtubeVideos, setYoutubeVideos] = useState<YoutubeVideo[]>([])
    const postPageSize = 10, commentPageSize = 10

    const fetchPosts = useCallback(async () => {
        const ticket = listRequest.begin()
        setIsLoading(true)
        const params = new URLSearchParams({ category: activeCategory, search: searchQuery, sort: sortBy, page: String(postPage), page_size: String(postPageSize) })
        try {
            const data = await apiJson<{ posts: ForumPost[]; total: number }>(`/api/forum/posts?${params}`, { signal: ticket.signal })
            if (ticket.isCurrent()) { setPosts(data.posts); setTotalPosts(data.total) }
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load posts', error) }
        finally { if (ticket.isCurrent()) setIsLoading(false) }
    }, [activeCategory, searchQuery, sortBy, postPage, listRequest])
    const fetchPostDetails = useCallback(async (id: string) => {
        if (id !== selection.current) return
        const ticket = detailRequest.begin()
        try {
            const post = await apiJson<ForumPost>(`/api/forum/posts/${id}`, { signal: ticket.signal })
            if (ticket.isCurrent() && id === selection.current) {
                setDetail(post)
                setPosts(previous => previous.map(item => item.id === id ? post : item))
            }
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load post details', error) }
    }, [detailRequest])
    const fetchComments = useCallback(async (id: string, page: number) => {
        if (id !== selection.current) return
        const ticket = commentRequest.begin()
        try {
            const data = await apiJson<{ comments: ForumComment[]; total: number }>(`/api/forum/posts/${id}/comments?page=${page}&page_size=${commentPageSize}`, { signal: ticket.signal })
            if (ticket.isCurrent() && id === selection.current) { setComments(data.comments); setTotalComments(data.total) }
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load comments', error) }
    }, [commentRequest])
    const fetchVideos = useCallback(async () => {
        const ticket = videoRequest.begin()
        try {
            const videos = await apiJson<YoutubeVideo[]>('/api/forum/videos', { signal: ticket.signal })
            if (ticket.isCurrent()) setYoutubeVideos(videos)
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load videos', error) }
        finally { if (ticket.isCurrent()) setIsLoading(false) }
    }, [videoRequest])
    useEffect(() => {
        const list = listRequest, videos = videoRequest
        const timer = window.setTimeout(() => { void (activeCategory === 'videos' ? fetchVideos() : fetchPosts()) }, 300)
        return () => { window.clearTimeout(timer); list.cancel(); videos.cancel() }
    }, [activeCategory, fetchPosts, fetchVideos, session, listRequest, videoRequest])
    useEffect(() => {
        const scope = detailRequest
        setDetail(null)
        if (postId) void fetchPostDetails(postId)
        return () => scope.cancel()
    }, [postId, fetchPostDetails, session, detailRequest])
    useEffect(() => {
        const scope = commentRequest
        setComments([])
        setTotalComments(0)
        if (postId) void fetchComments(postId, commentPage)
        return () => scope.cancel()
    }, [postId, commentPage, fetchComments, session, commentRequest])
    return { posts, setPosts, totalPosts, isLoading, postPage, setPostPage, postPageSize, selectedPost, setSelectedPost,
        comments, totalComments, commentPage, setCommentPage, commentPageSize, youtubeVideos, setYoutubeVideos, fetchPosts, fetchPostDetails, fetchComments }
}
export type ForumData = ReturnType<typeof useForumData>
