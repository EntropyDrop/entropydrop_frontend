import { Icon } from '@iconify/react'
import type { LangData } from '../../constants/lang'

interface AddVideoFormProps {
    isZh: boolean
    current: LangData
    handleCreateVideo: (e: React.FormEvent) => void
    newVideoUrl: string
    setNewVideoUrl: (url: string) => void
    setIsAddVideoFormOpen: (open: boolean) => void
}

export function AddVideoForm({
    isZh,
    current,
    handleCreateVideo,
    newVideoUrl,
    setNewVideoUrl,
    setIsAddVideoFormOpen
}: AddVideoFormProps) {
    return (
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
    )
}
