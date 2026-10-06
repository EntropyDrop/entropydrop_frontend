import { useCurrentUser } from '../hooks/useCurrentUser'
import { useForumData } from './figure/useForumData'
import { useForumActions } from './figure/useForumActions'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder'
import { PageContainer } from '../components/PageContainer';
import { useState, lazy, Suspense } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import type { LangData } from '../constants/lang'

// Split out components, types and helpers
import { FigureHeader } from './figure/FigureHeader'
import { PostItemDiscussions } from './figure/PostItemDiscussions'
import { PostItemShowcase } from './figure/PostItemShowcase'
import { VideoList } from './figure/VideoList'

const PostDetailView = lazy(() => import('./figure/PostDetailView').then(module => ({ default: module.PostDetailView })))
const CreatePostForm = lazy(() => import('./figure/CreatePostForm').then(module => ({ default: module.CreatePostForm })))
const AddVideoForm = lazy(() => import('./figure/AddVideoForm').then(module => ({ default: module.AddVideoForm })))

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
    const { user: currentUser } = useCurrentUser()
    const data = useForumData(activeCategory, searchQuery, sortBy, searchParams.get('postId'))
    const { posts, totalPosts, isLoading, postPage, setPostPage, postPageSize, selectedPost,
        comments, totalComments, commentPage, setCommentPage, commentPageSize, youtubeVideos } = data
    const {
        isCreateFormOpen, setIsCreateFormOpen, isAddVideoFormOpen, setIsAddVideoFormOpen,
        newVideoUrl, setNewVideoUrl, newTitle, setNewTitle, newContent, setNewContent,
        newCategory, setNewCategory, newBodyType, setNewBodyType, newMultiColorType, setNewMultiColorType,
        commentText, setCommentText, toastMessage,
        handleCreateVideo, handleDeleteVideo, handleDeletePost, handleUpdatePostCategory, handleUpdatePostTitle,
        handleLikePost, handleAddComment, handleCommentReply, handleCreatePost,
    } = useForumActions({ data, current, currentUser, activeCategory, navigate })

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
                onCreatePost={() => {
                    if (activeCategory === 'discussions' || activeCategory === 'showcase') {
                        setNewCategory(activeCategory)
                    }
                    setIsCreateFormOpen(true)
                }}
                setIsAddVideoFormOpen={setIsAddVideoFormOpen}
                current={current}
            />

            <Suspense fallback={<LoadingPlaceholder current={current} />} >
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
                    handleUpdatePostTitle={handleUpdatePostTitle}
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
            </Suspense>
        </PageContainer>
    )
}
