import { Icon } from '@iconify/react'
import type { YoutubeVideo } from './types'
import type { LangData } from '../../constants/lang'

interface VideoListProps {
    youtubeVideos: YoutubeVideo[]
    currentUser: any
    handleDeleteVideo: (videoId: string) => void
    current: LangData
}

export function VideoList({
    youtubeVideos,
    currentUser,
    handleDeleteVideo,
    current
}: VideoListProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {youtubeVideos.map(video => (
                <div
                    key={video.id}
                    className="bg-black/30 border border-white/10 flex flex-col group hover:border-[#3c8527]/50 transition-all duration-300 shadow-lg overflow-hidden relative text-white"
                >
                    {currentUser?.is_admin && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVideo(video.id);
                            }}
                            className="absolute top-2 right-2 z-20 bg-red-700/80 hover:bg-red-600 text-white p-1 border border-white/10 transition-colors cursor-pointer"
                            title={current.figureForum.deleteVideo}
                        >
                            <Icon icon="pixelarticons:trash" className="text-xs" />
                        </button>
                    )}
                    {/* Embedded Iframe Container using privacy-enhanced domain */}
                    <div className="w-full aspect-video bg-zinc-950 relative border-b border-white/5">
                        <iframe
                            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`}
                            className="w-full h-full border-none"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={`YouTube video player - ${video.youtubeId}`}
                        ></iframe>
                    </div>
                </div>
            ))}
        </div>
    )
}
