import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import type { ForumPost, ForumComment } from './types'
import type { LangData } from '../../constants/lang'
import { ArticleMarkdown } from '../../components/ArticleMarkdown'
import { CommentNode } from './CommentNode'
import { getBodyTypeLabel, getMultiColorTypeLabel } from './helpers'
import { SkinAvatarImage } from '../../components/SkinAvatarImage'

interface PostDetailViewProps {
    selectedPost: ForumPost
    activeCategory: string
    commentText: string
    setCommentText: (text: string) => void
    handleAddComment: (e: React.FormEvent) => void
    comments: ForumComment[]
    commentPage: number
    setCommentPage: React.Dispatch<React.SetStateAction<number>>
    totalComments: number
    commentPageSize: number
    handleLikePost: (postId: string, e: React.MouseEvent) => void
    handleCommentReply: (parentCommentId: string, replyText: string) => void
    current: LangData
    currentUser: any
    handleDeletePost: (postId: string) => void
    handleUpdatePostCategory: (postId: string, newCategory: 'discussions' | 'showcase') => void
    handleUpdatePostTitle: (postId: string, newTitle: string) => void
}

export function PostDetailView({
    selectedPost,
    activeCategory,
    commentText,
    setCommentText,
    handleAddComment,
    comments,
    commentPage,
    setCommentPage,
    totalComments,
    commentPageSize,
    handleLikePost,
    handleCommentReply,
    current,
    currentUser,
    handleDeletePost,
    handleUpdatePostCategory,
    handleUpdatePostTitle
}: PostDetailViewProps) {
    const navigate = useNavigate()
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<'discussions' | 'showcase'>(selectedPost.category)

    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [editedTitle, setEditedTitle] = useState(selectedPost.title)
    const [isSavingTitle, setIsSavingTitle] = useState(false)

    const handleSaveTitle = async () => {
        if (!editedTitle.trim()) return
        setIsSavingTitle(true)
        try {
            await handleUpdatePostTitle(selectedPost.id, editedTitle.trim())
            setIsEditingTitle(false)
        } catch (e) {
            console.error(e)
        } finally {
            setIsSavingTitle(false)
        }
    }

    const handleOpenModal = () => {
        setSelectedCategory(selectedPost.category)
        setIsTypeModalOpen(true)
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-16 min-h-0 animate-in fade-in duration-300 flex flex-col gap-6">
            {/* Back Button and Actions */}
            <div className="flex justify-between items-center">
                <button
                    onClick={() => navigate(`/figure/${activeCategory}`)}
                    className={`flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors bg-white/5 border border-white/10 px-3 py-1.5 cursor-pointer ${current.fontClass}`}
                >
                    <Icon icon="pixelarticons:arrow-left" />
                    <span>{current.figureForum.backToForum}</span>
                </button>

                {/* Show Delete Button only if user is author or admin */}
                {(currentUser?.is_admin || (currentUser && currentUser.username === selectedPost.author)) && (
                    <button
                        onClick={() => handleDeletePost(selectedPost.id)}
                        className={`flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 px-3 py-1.5 cursor-pointer ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:trash" />
                        <span>{current.figureForum.deletePost}</span>
                    </button>
                )}
            </div>

            {/* Inline Post Detail View */}
            <div className="bg-black/20 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
                {/* Header Info */}
                <div className={`flex items-center gap-2 flex-wrap text-xs text-white/40 ${current.fontClass}`}>
                    {(currentUser?.is_admin || (currentUser && currentUser.username === selectedPost.author)) ? (
                        <button
                            type="button"
                            onClick={handleOpenModal}
                            className="bg-[#3c8527]/20 text-[#5cff5c] hover:bg-[#3c8527]/40 border border-[#3c8527]/30 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                        >
                            <span>{selectedPost.category === 'showcase' ? current.nav.showcase : current.nav.discussions}</span>
                            <Icon icon="pixelarticons:edit" className="text-[10px]" />
                        </button>
                    ) : (
                        <span className="bg-[#3c8527]/20 text-[#5cff5c] border border-[#3c8527]/30 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
                            {selectedPost.category === 'showcase' ? current.nav.showcase : current.nav.discussions}
                        </span>
                    )}
                    <div className="flex items-center gap-1.5">
                        <span>{current.figureForum.postedBy}</span>
                        <SkinAvatarImage
                            textureUrl={selectedPost.authorMinecraftSkinUrl}
                            fallbackSrc={selectedPost.authorAvatar}
                            alt={selectedPost.author}
                            className="w-4 h-4"
                            framed={false}
                        />
                        <span className="text-white/70 font-semibold">@{selectedPost.author}</span>
                        <span>•</span>
                        <span>{selectedPost.createdAt}</span>
                    </div>
                </div>

                {/* Title */}
                <div className="flex items-center gap-2 group/title my-1">
                    {isEditingTitle ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                                type="text"
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitle();
                                    if (e.key === 'Escape') setIsEditingTitle(false);
                                }}
                                className={`flex-1 bg-black/40 border border-white/20 px-3 py-1.5 text-base sm:text-xl font-bold text-white focus:outline-none focus:border-[#5cff5c] ${current.fontClass}`}
                                maxLength={100}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={handleSaveTitle}
                                disabled={isSavingTitle || !editedTitle.trim()}
                                className="bg-[#3c8527] hover:bg-[#4ea632] disabled:opacity-50 text-white p-2 cursor-pointer border border-black shadow flex items-center justify-center shrink-0"
                                title={current.modal.confirm}
                            >
                                <Icon icon={isSavingTitle ? 'pixelarticons:reload' : 'pixelarticons:check'} className={`text-sm ${isSavingTitle ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEditingTitle(false)}
                                className="bg-white/10 hover:bg-white/20 text-white/60 hover:text-white p-2 cursor-pointer border border-white/10 flex items-center justify-center shrink-0"
                                title={current.figureForum.cancel}
                            >
                                <Icon icon="pixelarticons:close" className="text-sm" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h2 className={`text-lg sm:text-2xl font-bold leading-snug text-white ${current.fontClass}`}>
                                {selectedPost.title}
                            </h2>
                            {(currentUser?.is_admin || (currentUser && currentUser.username === selectedPost.author)) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditedTitle(selectedPost.title);
                                        setIsEditingTitle(true);
                                    }}
                                    className="opacity-100 lg:opacity-0 lg:group-hover/title:opacity-100 text-white/40 hover:text-[#5cff5c] transition-all cursor-pointer p-1 shrink-0 border-none bg-transparent"
                                    title="Edit Title"
                                >
                                    <Icon icon="pixelarticons:edit" className="text-base" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Body Type and Multi-color details for Showcase posts */}
                {(selectedPost.bodyType || selectedPost.multiColorType) && (
                    <div className={`flex flex-wrap gap-x-6 gap-y-2 text-xs border-b border-white/5 pb-4 mb-1 ${current.fontClass}`}>
                        {selectedPost.bodyType && (
                            <div className="flex items-center gap-2">
                                <span className="text-white/40">{current.figureForum.bodyTypeLabel}</span>
                                <span className="text-[#5cff5c] font-semibold bg-[#3c8527]/15 border border-[#3c8527]/30 px-2 py-0.5">{getBodyTypeLabel(selectedPost.bodyType, current)}</span>
                            </div>
                        )}
                        {selectedPost.multiColorType && (
                            <div className="flex items-center gap-2">
                                <span className="text-white/40">{current.figureForum.colorModeLabel}</span>
                                <span className="text-cyan-400 font-semibold bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5">{getMultiColorTypeLabel(selectedPost.multiColorType, current)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Body Content */}
                <div className={`text-xs sm:text-sm text-white/80 leading-relaxed border-b border-white/5 pb-4 mb-2 ${current.fontClass}`}>
                    <ArticleMarkdown content={selectedPost.content} />
                </div>



                {/* Interaction Row */}
                <div className={`flex items-center gap-6 text-xs text-white/40 border-b border-white/5 pb-4 shrink-0 ${current.fontClass}`}>
                    <button
                        onClick={(e) => handleLikePost(selectedPost.id, e)}
                        className="flex items-center gap-2 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer"
                    >
                        <Icon icon="pixelarticons:heart" className={`text-sm ${selectedPost.isLiked ? 'text-red-500' : ''}`} />
                        <span className={selectedPost.isLiked ? 'text-red-500' : ''}>{selectedPost.likes} {current.figureForum.likes}</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <Icon icon="pixelarticons:comment" className="text-sm" />
                        <span>{selectedPost.commentsCount} {current.figureForum.commentsCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Icon icon="pixelarticons:sun" className="text-sm" />
                        <span>{selectedPost.views} {current.figureForum.views}</span>
                    </div>
                </div>

                {/* Comments Section */}
                <div className="flex flex-col gap-4 mt-2">
                    <h3 className={`text-xs font-bold text-white uppercase tracking-wider ${current.fontClass}`}>
                        {current.figureForum.comments}
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
                                {current.figureForum.noComments}
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
                                {current.figureForum.forumPageLabel.replace('{page}', String(commentPage)).replace('{total}', String(Math.ceil(totalComments / commentPageSize)))}
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

            {isTypeModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                            <h3 className={`text-white text-xs font-bold uppercase tracking-wider ${current.fontClass}`}>
                                {current.figureForum.changePostType}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsTypeModalOpen(false)}
                                className="text-white/40 hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                            >
                                <Icon icon="pixelarticons:close" className="text-sm" />
                            </button>
                        </div>
                        
                        <div className="flex flex-col gap-3 my-2">
                            <span className={`text-[10px] text-white/50 ${current.fontClass}`}>
                                {current.figureForum.changePostTypePrompt}
                            </span>
                            
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategory('discussions')}
                                    className={`flex-1 py-3 text-center border text-xs font-bold transition-all cursor-pointer ${
                                        selectedCategory === 'discussions'
                                            ? 'bg-[#3c8527] border-[#5cff5c] text-white'
                                            : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:text-white'
                                    } ${current.fontClass}`}
                                >
                                    {current.nav.discussions}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategory('showcase')}
                                    className={`flex-1 py-3 text-center border text-xs font-bold transition-all cursor-pointer ${
                                        selectedCategory === 'showcase'
                                            ? 'bg-[#3c8527] border-[#5cff5c] text-white'
                                            : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:text-white'
                                    } ${current.fontClass}`}
                                >
                                    {current.nav.showcase}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2 border-t border-white/5">
                            <button
                                type="button"
                                onClick={() => setIsTypeModalOpen(false)}
                                className={`flex-1 py-2 bg-transparent border border-white/10 hover:bg-white/5 text-white/50 hover:text-white text-xs transition-colors cursor-pointer ${current.fontClass}`}
                            >
                                {current.figureForum.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleUpdatePostCategory(selectedPost.id, selectedCategory)
                                    setIsTypeModalOpen(false)
                                }}
                                className={`flex-1 py-2 bg-[#5cff5c] hover:bg-[#4ae04a] text-black font-bold text-xs transition-colors cursor-pointer border-none ${current.fontClass}`}
                            >
                                {current.modal.confirm}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
