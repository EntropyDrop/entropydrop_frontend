import { Icon } from '@iconify/react'
import type { ForumPost } from './types'
import type { LangData } from '../../constants/lang'
import { getBodyTypeLabel, getMultiColorTypeLabel } from './helpers'
import { SkinAvatarImage } from '../../components/SkinAvatarImage'

interface PostItemShowcaseProps {
    post: ForumPost
    onSelect: () => void
    handleLikePost: (postId: string, e: React.MouseEvent) => void
    current: LangData
}

export function PostItemShowcase({
    post,
    onSelect,
    handleLikePost,
    current
}: PostItemShowcaseProps) {
    return (
        <div
            className="bg-black/30 border border-white/10 flex flex-col cursor-pointer group hover:border-[#3c8527]/50 transition-all duration-300 relative shadow-lg overflow-hidden"
            onClick={onSelect}
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
                            <SkinAvatarImage
                                textureUrl={post.authorMinecraftSkinUrl}
                                fallbackSrc={post.authorAvatar}
                                alt={post.author}
                                className="w-4 h-4"
                                framed={false}
                            />
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
                        <div className="flex items-center gap-1.5">
                            <Icon icon="pixelarticons:sun" className="text-sm" />
                            <span>{post.views}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
