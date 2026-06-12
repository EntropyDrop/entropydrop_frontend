import { Icon } from '@iconify/react'
import type { ForumPost } from './types'
import type { LangData } from '../../constants/lang'
import { getBodyTypeLabel, getMultiColorTypeLabel } from './helpers'
import { SkinAvatarImage } from '../../components/SkinAvatarImage'

interface PostItemDiscussionsProps {
    post: ForumPost
    onSelect: () => void
    handleLikePost: (postId: string, e: React.MouseEvent) => void
    current: LangData
}

export function PostItemDiscussions({
    post,
    onSelect,
    handleLikePost,
    current
}: PostItemDiscussionsProps) {
    return (
        <div
            onClick={onSelect}
            className="bg-black/30 border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-start hover:border-[#3c8527]/50 hover:bg-white/5 transition-all duration-300 cursor-pointer group shadow-md"
        >
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header Info */}
                <div className="flex items-center flex-wrap gap-2 text-[10px] text-white/40 mb-2">
                    <div className="flex items-center gap-1">
                        <SkinAvatarImage
                            textureUrl={post.authorMinecraftSkinUrl}
                            fallbackSrc={post.authorAvatar}
                            alt={post.author}
                            className="w-3.5 h-3.5"
                            framed={false}
                        />
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
    )
}
