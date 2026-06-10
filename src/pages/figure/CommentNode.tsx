import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { ForumComment } from './types'
import type { LangData } from '../../constants/lang'

interface CommentNodeProps {
    comment: ForumComment
    current: LangData
    onReply: (parentCommentId: string, replyText: string) => void
}

export function CommentNode({ comment, current, onReply }: CommentNodeProps) {
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
