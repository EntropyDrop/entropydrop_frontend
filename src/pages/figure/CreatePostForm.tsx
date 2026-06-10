import { Icon } from '@iconify/react'
import type { LangData } from '../../constants/lang'
import { MarkdownEditor } from '../../components/MarkdownEditor'
import { BODY_TYPES_EN, MULTICOLOR_TYPES_EN } from './helpers'

interface CreatePostFormProps {
    isZh: boolean
    current: LangData
    handleCreatePost: (e: React.FormEvent) => void
    newTitle: string
    setNewTitle: (title: string) => void
    newCategory: 'discussions' | 'showcase'
    setNewCategory: (cat: 'discussions' | 'showcase') => void
    newBodyType: string
    setNewBodyType: (t: string) => void
    newMultiColorType: string
    setNewMultiColorType: (t: string) => void
    newContent: string
    setNewContent: (content: string) => void
    setIsCreateFormOpen: (open: boolean) => void
}

export function CreatePostForm({
    isZh,
    current,
    handleCreatePost,
    newTitle,
    setNewTitle,
    newCategory,
    setNewCategory,
    newBodyType,
    setNewBodyType,
    newMultiColorType,
    setNewMultiColorType,
    newContent,
    setNewContent,
    setIsCreateFormOpen
}: CreatePostFormProps) {
    return (
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
                                onClick={() => setNewCategory('discussions')}
                                className={`py-2 border flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-bold ${current.fontClass} ${newCategory === 'discussions' ? 'bg-[#3c8527]/15 border-[#3c8527] text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                            >
                                <Icon icon="pixelarticons:comment" />
                                <span>Discussion</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewCategory('showcase')}
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
    )
}
