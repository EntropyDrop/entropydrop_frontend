import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { apiFetch } from '../utils/api'
import type { LangData } from '../constants/lang'

interface FigurePageProps {
    current: LangData
}

interface PrintSettings {
    printer: string
    layerHeight: string
    infill: string
    printTime: string
    material: string
}

interface ForumComment {
    id: string
    author: string
    avatarUrl?: string
    isPro?: boolean
    content: string
    createdAt: string
}

interface ForumPost {
    id: string
    title: string
    content: string
    category: 'discussions' | 'showcase'
    image?: string // Optional image for discussions
    tags: string[]
    author: string
    authorAvatar?: string
    isPro?: boolean
    role?: string
    likes: number
    views: number
    isLiked?: boolean
    printSettings: PrintSettings
    comments: ForumComment[]
    createdAt: string
}

interface YoutubeVideo {
    id: string
    title: string
    description: string
    youtubeId: string
    thumbnailUrl: string
    channelName: string
    views: string
    duration: string
    publishedAt: string
}

export function FigurePage({ current }: FigurePageProps) {
    const [searchParams] = useSearchParams()
    const activeCategory = searchParams.get('category') || 'discussions'
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest')
    const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [selectedVideo, setSelectedVideo] = useState<YoutubeVideo | null>(null)

    // Current logged in user info (mocked/fetched)
    const [currentUser, setCurrentUser] = useState<{ username: string; picture: string; is_pro: boolean } | null>(null)

    // Form states for creating a post
    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')
    const [newCategory, setNewCategory] = useState<'discussions' | 'showcase'>('discussions')
    const [newTags, setNewTags] = useState('')
    const [hasImage, setHasImage] = useState(true)
    const [newImage, setNewImage] = useState('/images/warrior_figure.png')
    const [newPrinter, setNewPrinter] = useState('Bambu Lab P1S')
    const [newLayerHeight, setNewLayerHeight] = useState('0.12mm')
    const [newInfill, setNewInfill] = useState('15%')
    const [newPrintTime, setNewPrintTime] = useState('10 hours')
    const [newMaterial, setNewMaterial] = useState('PLA + TPU')

    // Comment input state
    const [commentText, setCommentText] = useState('')

    // Feedback/Toast state
    const [toastMessage, setToastMessage] = useState<string | null>(null)

    // Fetch user on mount
    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem('token')
            if (token) {
                try {
                    const res = await apiFetch('/api/users/me')
                    if (res.ok) {
                        const data = await res.json()
                        setCurrentUser({
                            username: data.username,
                            picture: data.picture,
                            is_pro: data.is_pro
                        })
                    }
                } catch (e) {
                    console.error('Failed to load user info for forum', e)
                }
            }
        }
        fetchUser()
    }, [])

    // Seed post data
    const [posts, setPosts] = useState<ForumPost[]>([
        {
            id: 'post-1',
            title: 'My first completed Bambu Lab print! Cyberpunk Knight figure',
            content: 'Stickers were a bit tricky around the knees, but the PLA body print came out extremely clean. Joint tolerances are perfect on my P1S. Used photo-grade adhesive waterproof paper for the sticker wrap and the colors popped nicely!',
            category: 'showcase',
            image: '/images/warrior_figure.png',
            tags: ['BambuLab', 'Warrior', 'Articulated'],
            author: 'PixelMaster',
            authorAvatar: 'https://lh3.googleusercontent.com/a/ACg8ocL3c7...',
            isPro: true,
            role: 'Pro Creator',
            likes: 48,
            views: 342,
            isLiked: false,
            printSettings: {
                printer: 'Bambu Lab X1C',
                layerHeight: '0.12mm',
                infill: '15% Gyroid',
                printTime: '12 hours',
                material: 'PLA (Body) + TPU (Joints)'
            },
            comments: [
                {
                    id: 'c-1',
                    author: 'Stickerman',
                    isPro: false,
                    content: 'Looks incredible! Which sticker paper brand did you use?',
                    createdAt: '2 hours ago'
                },
                {
                    id: 'c-2',
                    author: '3D-Warrior',
                    isPro: true,
                    content: 'Did you print the joints with TPU 95A? Mine were a bit loose.',
                    createdAt: '1 hour ago'
                }
            ],
            createdAt: '4 hours ago'
        },
        {
            id: 'post-2',
            title: 'Optimizing joint tolerances for TPU prints',
            content: 'After 5 failed joint prints, I found that scaling the joint models down by 1.5% in Bambu Studio makes them fit perfectly into the PLA sockets without cracking. Here is the step-by-step sizing breakdown for tight but posable limbs.',
            category: 'discussions',
            tags: ['Tolerances', 'TPU', 'Guide'],
            author: 'PrintPhysicist',
            isPro: true,
            role: 'Mod',
            likes: 95,
            views: 620,
            isLiked: false,
            printSettings: {
                printer: 'Bambu Lab P1S',
                layerHeight: '0.16mm',
                infill: '20% Cubic',
                printTime: '6 hours',
                material: 'TPU (95A)'
            },
            comments: [
                {
                    id: 'c-3',
                    author: 'FilamentKing',
                    isPro: false,
                    content: 'Extremely helpful guide, thanks for sharing! Saved me some TPU.',
                    createdAt: '5 hours ago'
                }
            ],
            createdAt: '8 hours ago'
        },
        {
            id: 'post-3',
            title: 'Minecraft Fox Figure - Printed in Orange PLA!',
            content: 'Sharing my sliced files for the Minecraft Fox. Print layout is optimized to minimize support usage so you do not ruin the outer face. Tail is fully rotatable with a snap joint.',
            category: 'showcase',
            image: '/images/fox_figure.png',
            tags: ['Fox', 'Minecraft', 'Toy'],
            author: 'FoxyCreator',
            isPro: false,
            role: 'Creator',
            likes: 120,
            views: 890,
            isLiked: false,
            printSettings: {
                printer: 'Bambu Lab A1',
                layerHeight: '0.08mm',
                infill: '10% Gyroid',
                printTime: '8.5 hours',
                material: 'PLA'
            },
            comments: [
                {
                    id: 'c-4',
                    author: 'MiniBuilder',
                    isPro: true,
                    content: 'This is so cute! My daughter is going to love it.',
                    createdAt: '1 day ago'
                }
            ],
            createdAt: '1 day ago'
        },
        {
            id: 'post-4',
            title: 'Discussing the optimal slicing profiles for small voxel hand figurines',
            content: 'When printing characters under 8cm with high voxel density, standard Bambu Studio profiles can over-extrude at corners. I recommend dropping print temperature by 5C and setting outer wall speeds to 40mm/s. Here is my setup.',
            category: 'discussions',
            tags: ['Slicing', 'Settings', 'PLA'],
            author: 'LayerExpert',
            isPro: false,
            likes: 31,
            views: 180,
            isLiked: false,
            printSettings: {
                printer: 'Bambu Lab X1C',
                layerHeight: '0.08mm',
                infill: '15% Grid',
                printTime: '4 hours',
                material: 'PLA'
            },
            comments: [],
            createdAt: '2 days ago'
        }
    ])

    const youtubeVideos: YoutubeVideo[] = [
        {
            id: 'v-1',
            title: 'I 3D Printed My Minecraft Skin! (Using Bambu Lab P1S)',
            description: 'In this video, I walk through the full process of extracting a Minecraft skin, converting it into a printable 3D OBJ model with solid joints, slicing in Bambu Studio, and printing it in colorful PLA.',
            youtubeId: 'p96u86q_7H0',
            thumbnailUrl: 'https://img.youtube.com/vi/p96u86q_7H0/mqdefault.jpg',
            channelName: '3DPrintCraft',
            views: '45K views',
            duration: '12:34',
            publishedAt: '3 weeks ago'
        },
        {
            id: 'v-2',
            title: 'Bambu Lab A1 Mini - Slicing and Printing Mini Figures',
            description: 'Reviewing the Bambu Lab A1 Mini printer specifically for micro-sized figures and pixelated models. We test different layer heights down to 0.08mm and test tolerance clearance on tight joints.',
            youtubeId: 'v2A_B1yL72Y',
            thumbnailUrl: 'https://img.youtube.com/vi/v2A_B1yL72Y/mqdefault.jpg',
            channelName: 'MakeAnythingMini',
            views: '128K views',
            duration: '15:10',
            publishedAt: '1 month ago'
        },
        {
            id: 'v-3',
            title: 'How to Post-Process & Paint 3D Printed Figures',
            description: 'Sanding, priming, and painting voxel models can be tough. Check out this beginner-friendly tutorial on using water-based acrylic paints, micro brushes, and matte varnishes to give your figures a premium finish.',
            youtubeId: 'wL6HkH20L1o',
            thumbnailUrl: 'https://img.youtube.com/vi/wL6HkH20L1o/mqdefault.jpg',
            channelName: 'PixelPainter',
            views: '82K views',
            duration: '8:45',
            publishedAt: '2 months ago'
        }
    ]

    // Toast helper
    const triggerToast = (msg: string) => {
        setToastMessage(msg)
        setTimeout(() => setToastMessage(null), 3000)
    }

    // Like handler
    const handleLikePost = (postId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const liked = !p.isLiked
                return {
                    ...p,
                    isLiked: liked,
                    likes: liked ? p.likes + 1 : p.likes - 1
                }
            }
            return p
        }))
        // Sync selectedPost if open
        if (selectedPost && selectedPost.id === postId) {
            setSelectedPost(prev => {
                if (!prev) return null
                const liked = !prev.isLiked
                return {
                    ...prev,
                    isLiked: liked,
                    likes: liked ? prev.likes + 1 : prev.likes - 1
                }
            })
        }
    }

    // Add comment handler
    const handleAddComment = (e: React.FormEvent) => {
        e.preventDefault()
        if (!commentText.trim()) return

        const newComment: ForumComment = {
            id: `c-${Date.now()}`,
            author: currentUser?.username || 'GuestMaker',
            isPro: currentUser?.is_pro || false,
            content: commentText.trim(),
            createdAt: 'Just now'
        }

        if (selectedPost) {
            const updatedPosts = posts.map(p => {
                if (p.id === selectedPost.id) {
                    return {
                        ...p,
                        comments: [...p.comments, newComment]
                    }
                }
                return p
            })
            setPosts(updatedPosts)
            setSelectedPost(prev => {
                if (!prev) return null
                return {
                    ...prev,
                    comments: [...prev.comments, newComment]
                }
            })
            setCommentText('')
            triggerToast('Comment posted successfully!')
        }
    }

    // Create post handler
    const handleCreatePost = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim() || !newContent.trim()) {
            triggerToast('Title and content are required!')
            return
        }

        const tagList = newTags.split(',').map(t => t.trim()).filter(t => t.length > 0)

        const createdPost: ForumPost = {
            id: `post-${Date.now()}`,
            title: newTitle,
            content: newContent,
            category: newCategory,
            image: hasImage ? newImage : undefined,
            tags: tagList.length > 0 ? tagList : ['Custom', 'Figure'],
            author: currentUser?.username || 'GuestMaker',
            isPro: currentUser?.is_pro || false,
            role: currentUser?.is_pro ? 'Pro Member' : 'Member',
            likes: 0,
            views: 1,
            isLiked: false,
            printSettings: {
                printer: newPrinter,
                layerHeight: newLayerHeight,
                infill: newInfill,
                printTime: newPrintTime,
                material: newMaterial
            },
            comments: [],
            createdAt: 'Just now'
        }

        setPosts([createdPost, ...posts])
        setIsCreateModalOpen(false)
        // Reset form
        setNewTitle('')
        setNewContent('')
        setNewCategory('discussions')
        setNewTags('')
        setHasImage(true)
        setNewImage('/images/warrior_figure.png')
        setNewPrinter('Bambu Lab P1S')
        setNewLayerHeight('0.12mm')
        setNewInfill('15%')
        setNewPrintTime('10 hours')
        setNewMaterial('PLA + TPU')

        triggerToast('Post published successfully!')
    }

    // Filtered and sorted posts
    const filteredPosts = posts
        .filter(p => {
            // Under discussions category, show ALL posts (since discussions represents the main thread) or those specific to discussions.
            // Let's filter: activeCategory === 'discussions' shows everything, activeCategory === 'showcase' ONLY shows posts with images.
            const matchesCategory = activeCategory === 'discussions' || (activeCategory === 'showcase' && !!p.image)
            const matchesSearch = searchQuery.trim() === '' || 
                p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
            return matchesCategory && matchesSearch
        })
        .sort((a, b) => {
            if (sortBy === 'popular') {
                return b.likes - a.likes
            }
            return b.id.localeCompare(a.id)
        })

    return (
        <PageContainer className="relative">
                
                {/* Toast Notification */}
                {toastMessage && (
                    <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 bg-[#3c8527] border border-white/20 px-4 py-2 text-xs shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300 ${current.fontClass}`}>
                        {toastMessage}
                    </div>
                )}

                {/* Forum Header Banner */}
                <div className="relative overflow-hidden border border-white/10 bg-gradient-to-r from-black/60 to-zinc-900/60 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shrink-0">
                    <div className="z-10 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-[#3c8527] text-white text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">3D Print</span>
                            <span className="text-white/40 text-xs font-mono">v1.2.0-beta</span>
                        </div>
                        <h2 className={`text-xl sm:text-3xl font-extrabold text-white leading-tight ${current.fontClass}`} style={{ textShadow: '1px 1px 0px #000' }}>
                            {current.figureForum.title}
                        </h2>
                        <p className={`text-xs sm:text-sm text-white/50 mt-1 max-w-2xl ${current.fontClass}`}>
                            {current.figureForum.subtitle}
                        </p>
                    </div>

                    {activeCategory !== 'videos' && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className={`z-10 w-full md:w-auto px-4 py-2.5 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 transition-all font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-md hover:scale-105 active:scale-95 ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:plus" className="text-lg" />
                            <span>{current.figureForum.publishPost}</span>
                        </button>
                    )}
                    
                    {/* Decorative cyber grid */}
                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none w-1/3 h-full bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-white/10 pb-4 shrink-0">
                    {/* Left: Search input */}
                    <div className="flex-1 max-w-md flex items-center bg-black/40 border border-white/10 focus-within:border-white/30 transition-all p-1">
                        <input
                            type="text"
                            placeholder={activeCategory === 'videos' ? "Search videos..." : "Search discussions or tags..."}
                            className="bg-transparent text-white px-2 py-1 text-xs outline-none flex-1 placeholder:text-white/30 font-pixel-hans"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white px-1.5 cursor-pointer">
                                <Icon icon="pixelarticons:close" />
                            </button>
                        )}
                        <span className="text-white/30 px-2 border-l border-white/10">
                            <Icon icon="pixelarticons:search" className="text-sm" />
                        </span>
                    </div>

                    {/* Right: Sorting Selector */}
                    {activeCategory !== 'videos' && (
                        <div className="flex items-center gap-3">
                            <div className="flex border border-white/10 p-0.5 bg-black/20">
                                <button
                                    onClick={() => setSortBy('latest')}
                                    className={`px-3 py-1.5 text-[10px] sm:text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 border-none ${sortBy === 'latest' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:clock" />
                                    <span>Latest</span>
                                </button>
                                <button
                                    onClick={() => setSortBy('popular')}
                                    className={`px-3 py-1.5 text-[10px] sm:text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 border-none ${sortBy === 'popular' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                                >
                                    <Icon icon="pixelarticons:heart" />
                                    <span>Popular</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Content View Switcher */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                    {/* Category 1: Discussions (List Format, optional image) */}
                    {activeCategory === 'discussions' && (
                        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                            {filteredPosts.length === 0 ? (
                                <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                    No discussions found.
                                </div>
                            ) : (
                                filteredPosts.map(post => (
                                    <div
                                        key={post.id}
                                        onClick={() => setSelectedPost(post)}
                                        className="bg-black/30 border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-start hover:border-[#3c8527]/50 hover:bg-white/5 transition-all duration-300 cursor-pointer group shadow-md"
                                    >
                                        <div className="flex-1 flex flex-col min-w-0">
                                            {/* Header Info */}
                                            <div className="flex items-center flex-wrap gap-2 text-[10px] text-white/40 mb-2">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-3.5 h-3.5 rounded-full bg-zinc-700 overflow-hidden border border-white/15 flex items-center justify-center shrink-0">
                                                        {post.authorAvatar ? (
                                                            <img src={post.authorAvatar} alt={post.author} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Icon icon="pixelarticons:user" className="text-white/60 text-[10px]" />
                                                        )}
                                                    </div>
                                                    <span className={`text-white/60 font-semibold truncate max-w-[100px] ${current.fontClass}`}>@{post.author}</span>
                                                    {post.role && (
                                                        <span className="bg-[#3c8527]/20 text-[#5cff5c] border border-[#3c8527]/30 text-[7px] px-1 font-mono uppercase scale-90">
                                                            {post.role}
                                                        </span>
                                                    )}
                                                </div>
                                                <span>•</span>
                                                <span className="font-mono">{post.createdAt}</span>
                                                <span>•</span>
                                                <span className="bg-white/5 border border-white/10 text-white/60 px-1 rounded-xs uppercase tracking-wider text-[8px]">
                                                    {post.category === 'showcase' ? 'Showcase' : 'Discussion'}
                                                </span>
                                            </div>

                                            {/* Title */}
                                            <h3 className={`text-sm sm:text-base font-bold text-white group-hover:text-[#5cff5c] transition-colors truncate max-w-full ${current.fontClass}`}>
                                                {post.title}
                                            </h3>

                                            {/* Snippet */}
                                            <p className="text-xs text-white/50 line-clamp-2 mt-1.5 leading-relaxed font-sans pr-4">
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
                                                    <span>{post.comments.length}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Icon icon="pixelarticons:sun" className="text-xs" />
                                                    <span>{post.views}</span>
                                                </div>
                                                <div className="flex gap-1 ml-auto">
                                                    {post.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="text-[7px] text-white/45 bg-white/5 border border-white/10 px-1 py-0.2 uppercase rounded-xs">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Optional Image Thumbnail on Right */}
                                        {post.image && (
                                            <div className="w-20 h-20 bg-zinc-950/45 border border-white/10 rounded-sm shrink-0 flex items-center justify-center p-2 self-center sm:self-start overflow-hidden">
                                                <img
                                                    src={post.image}
                                                    alt="Thumbnail"
                                                    className="max-w-full max-h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transform group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Category 2: Showcase (Stream/Card Grid Format, focuses on images) */}
                    {activeCategory === 'showcase' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            {filteredPosts.length === 0 ? (
                                <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                                    No showcase creations found.
                                </div>
                            ) : (
                                filteredPosts.map(post => (
                                    <div
                                        key={post.id}
                                        className="bg-black/30 border border-white/10 flex flex-col cursor-pointer group hover:border-[#3c8527]/50 transition-all duration-300 relative shadow-lg overflow-hidden"
                                        onClick={() => setSelectedPost(post)}
                                    >
                                        {/* Post Category Tag */}
                                        <div className="absolute top-3 left-3 z-10">
                                            <span className="bg-black/60 backdrop-blur-md border border-white/20 text-white/95 text-[9px] px-2 py-0.5 rounded-sm uppercase tracking-wider font-semibold">
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
                                                        <div className="w-4 h-4 rounded-full bg-zinc-700 overflow-hidden border border-white/15 flex items-center justify-center">
                                                            {post.authorAvatar ? (
                                                                <img src={post.authorAvatar} alt={post.author} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Icon icon="pixelarticons:user" className="text-white/60 text-xs" />
                                                            )}
                                                        </div>
                                                        <span className={`text-white/60 truncate ${current.fontClass}`}>@{post.author}</span>
                                                    </div>
                                                    <span className="font-mono text-[9px]">{post.createdAt}</span>
                                                </div>

                                                <h3 className={`text-sm sm:text-base font-bold text-white group-hover:text-[#5cff5c] transition-colors line-clamp-2 ${current.fontClass}`}>
                                                    {post.title}
                                                </h3>

                                                <p className="text-xs text-white/50 line-clamp-2 mt-1.5 leading-relaxed font-sans">
                                                    {post.content}
                                                </p>

                                                <div className="flex flex-wrap gap-1 mt-3">
                                                    {post.tags.map(tag => (
                                                        <span key={tag} className="text-[8px] text-white/45 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-sm">
                                                            #{tag}
                                                        </span>
                                                    ))}
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
                                                        <span>{post.comments.length}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 text-[9px] bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded-sm">
                                                    <Icon icon="pixelarticons:device-laptop" className="text-[10px] text-[#3c8527]" />
                                                    <span>{post.printSettings.material.split(' ')[0]}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Category 3: Videos (YouTube list with modal player) */}
                    {activeCategory === 'videos' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            {youtubeVideos
                                .filter(v => searchQuery.trim() === '' || 
                                    v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    v.channelName.toLowerCase().includes(searchQuery.toLowerCase())
                                )
                                .map(video => (
                                    <div
                                        key={video.id}
                                        onClick={() => setSelectedVideo(video)}
                                        className="bg-black/30 border border-white/10 flex flex-col cursor-pointer group hover:border-[#3c8527]/50 transition-all duration-300 shadow-lg overflow-hidden"
                                    >
                                        {/* Thumbnail Container */}
                                        <div className="w-full aspect-video bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-white/5">
                                            <img
                                                src={video.thumbnailUrl}
                                                alt={video.title}
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-102 transition-all duration-300"
                                            />
                                            {/* Duration tag */}
                                            <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 text-[9px] font-mono tracking-widest text-white/90">
                                                {video.duration}
                                            </span>
                                            {/* Play Overlay Button */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-12 h-12 bg-black/60 border border-white/20 group-hover:border-red-500 group-hover:bg-red-500 rounded-full flex items-center justify-center text-white transition-all shadow-md group-hover:scale-110 duration-200">
                                                    <Icon icon="pixelarticons:play" className="text-xl ml-0.5" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Video Info details */}
                                        <div className="p-4 flex-1 flex flex-col justify-between gap-3 bg-zinc-900/10">
                                            <div className="flex flex-col gap-1.5">
                                                <h3 className={`text-xs sm:text-sm font-bold text-white group-hover:text-[#5cff5c] transition-colors line-clamp-2 leading-snug ${current.fontClass}`}>
                                                    {video.title}
                                                </h3>
                                                <p className="text-[11px] text-white/50 line-clamp-2 leading-relaxed font-sans m-0">
                                                    {video.description}
                                                </p>
                                            </div>

                                            <div className="flex items-center justify-between text-[10px] text-white/40 border-t border-white/5 pt-2 mt-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon icon="pixelarticons:user" className="text-red-500/80" />
                                                    <span className="font-semibold text-white/60">{video.channelName}</span>
                                                </div>
                                                <div className="flex gap-2 font-mono text-[9px]">
                                                    <span>{video.views}</span>
                                                    <span>•</span>
                                                    <span>{video.publishedAt}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    )}
                </div>

                {/* POST DETAIL VIEW MODAL OVERLAY */}
                {selectedPost && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-200">
                        {selectedPost.category === 'discussions' ? (
                            /* REDDIT-STYLE DISCUSSION THREAD VIEW */
                            <div className="bg-[#1a1a1a] border-2 border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 p-6 relative">
                                {/* Close Button */}
                                <button
                                    onClick={() => setSelectedPost(null)}
                                    className="absolute top-4 right-4 w-7 h-7 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white cursor-pointer rounded-xs"
                                >
                                    <Icon icon="pixelarticons:close" />
                                </button>

                                {/* Header: Category Tag & Author Info */}
                                <div className="flex items-center gap-2 mb-3 pr-8">
                                    <span className="bg-[#3c8527]/20 text-[#5cff5c] border border-[#3c8527]/30 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider font-mono">
                                        Discussion
                                    </span>
                                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                                        <span>Posted by</span>
                                        <span className="text-white/70 font-semibold">@{selectedPost.author}</span>
                                        {selectedPost.role && (
                                            <span className="bg-[#3c8527]/20 text-[#5cff5c] border border-[#3c8527]/30 text-[7px] px-1 font-mono uppercase">
                                                {selectedPost.role}
                                            </span>
                                        )}
                                        <span>•</span>
                                        <span>{selectedPost.createdAt}</span>
                                    </div>
                                </div>

                                {/* Title */}
                                <h2 className={`text-xl sm:text-2xl font-bold leading-snug mb-4 text-white ${current.fontClass}`}>
                                    {selectedPost.title}
                                </h2>

                                {/* Body Content */}
                                <div className="text-xs sm:text-sm text-white/80 leading-relaxed font-sans whitespace-pre-wrap mb-4">
                                    {selectedPost.content}
                                </div>

                                {/* Inline Image (if present) */}
                                {selectedPost.image && (
                                    <div className="bg-zinc-950/60 border border-white/5 rounded p-4 flex items-center justify-center mb-6 overflow-hidden max-h-[350px]">
                                        <img
                                            src={selectedPost.image}
                                            alt={selectedPost.title}
                                            className="max-h-[300px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
                                        />
                                    </div>
                                )}

                                {/* Tags */}
                                <div className="flex flex-wrap gap-1.5 mb-6 border-b border-white/5 pb-4">
                                    {selectedPost.tags.map(tag => (
                                        <span key={tag} className="text-[9px] text-white/45 bg-white/5 border border-white/10 px-2 py-0.5 uppercase">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Interaction Row */}
                                <div className="flex items-center gap-6 text-xs text-white/40 mb-6 border-b border-white/5 pb-4 shrink-0">
                                    <button
                                        onClick={(e) => handleLikePost(selectedPost.id, e)}
                                        className="flex items-center gap-2 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer"
                                    >
                                        <Icon icon="pixelarticons:heart" className={`text-sm ${selectedPost.isLiked ? 'text-red-500' : ''}`} />
                                        <span className={selectedPost.isLiked ? 'text-red-500' : ''}>{selectedPost.likes} Likes</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <Icon icon="pixelarticons:comment" className="text-sm" />
                                        <span>{selectedPost.comments.length} Comments</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Icon icon="pixelarticons:sun" className="text-sm" />
                                        <span>{selectedPost.views} Views</span>
                                    </div>
                                </div>

                                {/* Comments Section */}
                                <div className="flex flex-col gap-4">
                                    <h3 className={`text-xs font-bold text-white uppercase tracking-wider ${current.fontClass}`}>
                                        Comments
                                    </h3>

                                    {/* Comment form */}
                                    <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            placeholder={current.figureForum.writeComment}
                                            className="bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] flex-1 font-sans"
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

                                    {/* Comments list */}
                                    <div className="flex flex-col gap-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                                        {selectedPost.comments.length === 0 ? (
                                            <div className="text-center text-white/35 py-4 text-xs font-sans">
                                                No comments yet. Be the first to reply!
                                            </div>
                                        ) : (
                                            selectedPost.comments.map(c => (
                                                <div key={c.id} className="bg-white/5 p-3 border border-white/5 rounded-xs flex flex-col gap-1 text-xs">
                                                    <div className="flex justify-between items-center text-[10px] text-white/45">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-white/70 font-semibold ${current.fontClass}`}>@{c.author}</span>
                                                            {c.isPro && <span className="text-[8px] bg-yellow-400 text-black px-0.5 font-bold">PRO</span>}
                                                        </div>
                                                        <span className="font-mono text-[9px]">{c.createdAt}</span>
                                                    </div>
                                                    <p className="text-white/85 font-sans text-xs leading-relaxed mt-0.5">{c.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ORIGINAL 50/50 PRODUCT-LIKE SHOWCASE PRINT VIEW */
                            <div className="bg-[#1a1a1a] border-2 border-white/10 w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col md:flex-row shadow-2xl animate-in zoom-in-95 duration-200">
                                
                                {/* Left Side: Image container */}
                                <div className="w-full md:w-1/2 aspect-square md:aspect-auto md:h-full min-h-[200px] bg-zinc-950 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-white/10 relative shrink-0">
                                    {selectedPost.image ? (
                                        <img
                                            src={selectedPost.image}
                                            alt={selectedPost.title}
                                            className="max-w-full max-h-[50vh] md:max-h-full object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-white/20 font-mono">
                                            <Icon icon="pixelarticons:comment" className="text-6xl" />
                                            <span className="text-xs uppercase">Discussion Post (No Image)</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setSelectedPost(null)}
                                        className="absolute top-4 left-4 w-8 h-8 bg-black/60 border border-white/10 rounded-full flex items-center justify-center text-white/60 hover:text-white cursor-pointer md:hidden"
                                    >
                                        <Icon icon="pixelarticons:close" />
                                    </button>
                                </div>

                                {/* Right Side: Details and comments */}
                                <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto max-h-[90vh] md:max-h-full">
                                    <div>
                                        {/* Header close button & Category */}
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="bg-black/60 backdrop-blur-md border border-white/20 text-white/95 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
                                                {selectedPost.category === 'showcase' ? 'Showcase' : 'Discussion'}
                                            </span>
                                            <button
                                                onClick={() => setSelectedPost(null)}
                                                className="w-7 h-7 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white cursor-pointer hidden md:flex rounded-xs"
                                            >
                                                <Icon icon="pixelarticons:close" />
                                            </button>
                                        </div>

                                        {/* Post Title */}
                                        <h2 className={`text-lg sm:text-xl font-bold leading-snug mb-2 text-white ${current.fontClass}`}>
                                            {selectedPost.title}
                                        </h2>

                                        {/* Author row */}
                                        <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
                                            <span>By</span>
                                            <span className="text-white/70 font-semibold">@{selectedPost.author}</span>
                                            {selectedPost.role && (
                                                <span className="bg-white/5 text-[#5cff5c] text-[8px] px-1 font-mono uppercase">
                                                    {selectedPost.role}
                                                </span>
                                            )}
                                            <span className="mx-1">•</span>
                                            <span>{selectedPost.createdAt}</span>
                                        </div>

                                        {/* Post Content */}
                                        <p className="text-xs sm:text-sm text-white/70 leading-relaxed font-sans whitespace-pre-wrap border-b border-white/5 pb-4 mb-4">
                                            {selectedPost.content}
                                        </p>

                                        {/* Print Settings Grid Box */}
                                        <div className="bg-black/40 border border-white/10 p-4 rounded-sm mb-6">
                                            <h3 className={`text-xs font-bold text-white mb-3 flex items-center gap-2 border-b border-white/5 pb-2 uppercase tracking-wide ${current.fontClass}`}>
                                                <Icon icon="pixelarticons:device-laptop" className="text-[#3c8527] text-sm" />
                                                <span>{current.figureForum.printSettingsTitle}</span>
                                            </h3>
                                            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-mono">
                                                <div>
                                                    <span className="text-white/40 block text-[10px] uppercase">Printer</span>
                                                    <span className="text-white/90">{selectedPost.printSettings.printer}</span>
                                                </div>
                                                <div>
                                                    <span className="text-white/40 block text-[10px] uppercase">Layer Height</span>
                                                    <span className="text-white/90">{selectedPost.printSettings.layerHeight}</span>
                                                </div>
                                                <div>
                                                    <span className="text-white/40 block text-[10px] uppercase">Infill</span>
                                                    <span className="text-white/90">{selectedPost.printSettings.infill}</span>
                                                </div>
                                                <div>
                                                    <span className="text-white/40 block text-[10px] uppercase">Print Time</span>
                                                    <span className="text-white/90">{selectedPost.printSettings.printTime}</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-white/40 block text-[10px] uppercase">{current.figureForum.material}</span>
                                                    <span className="text-[#5cff5c] text-[11px]">{selectedPost.printSettings.material}</span>
                                                </div>
                                            </div>

                                            {/* Direct print ordering simulator */}
                                            <button
                                                onClick={() => triggerToast('Direct ordering is locked in sandbox. Model added to configuration list.')}
                                                className={`w-full mt-4 py-2 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer ${current.fontClass}`}
                                            >
                                                <Icon icon="pixelarticons:cart" />
                                                <span>{current.figureForum.orderPrint}</span>
                                            </button>
                                        </div>

                                        {/* Comments Section */}
                                        <div className="border-t border-white/5 pt-4">
                                            <h3 className={`text-xs font-bold text-white mb-4 flex items-center gap-2 ${current.fontClass}`}>
                                                <Icon icon="pixelarticons:comment" className="text-sm" />
                                                <span>{current.figureForum.comments} ({selectedPost.comments.length})</span>
                                            </h3>

                                            {/* Comments list */}
                                            <div className="flex flex-col gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                {selectedPost.comments.length === 0 ? (
                                                    <div className="text-center text-white/35 py-4 text-xs font-sans">
                                                        No comments yet. Be the first to reply!
                                                    </div>
                                                ) : (
                                                    selectedPost.comments.map(c => (
                                                        <div key={c.id} className="bg-white/5 p-2.5 border border-white/5 rounded-xs flex flex-col gap-1 text-xs">
                                                            <div className="flex justify-between items-center text-[10px] text-white/45">
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-white/70 font-semibold ${current.fontClass}`}>@{c.author}</span>
                                                                    {c.isPro && <span className="text-[8px] bg-yellow-400 text-black px-0.5 font-bold">PRO</span>}
                                                                </div>
                                                                <span className="font-mono text-[9px]">{c.createdAt}</span>
                                                            </div>
                                                            <p className="text-white/80 font-sans text-xs leading-normal">{c.content}</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Comment Form */}
                                            <form onSubmit={handleAddComment} className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder={current.figureForum.writeComment}
                                                    className="bg-black/50 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527] flex-1 font-sans"
                                                    value={commentText}
                                                    onChange={e => setCommentText(e.target.value)}
                                                />
                                                <button
                                                    type="submit"
                                                    className={`px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-semibold cursor-pointer ${current.fontClass}`}
                                                >
                                                    {current.figureForum.commentBtn}
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                )}

                {/* YOUTUBE VIDEO PLAYER MODAL OVERLAY */}
                {selectedVideo && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-200">
                        <div className="bg-[#1a1a1a] border-2 border-white/10 w-full max-w-3xl flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden">
                            {/* Close button */}
                            <button
                                onClick={() => setSelectedVideo(null)}
                                className="absolute top-3 right-3 w-8 h-8 bg-black/60 border border-white/15 rounded-full flex items-center justify-center text-white/70 hover:text-white cursor-pointer z-10"
                            >
                                <Icon icon="pixelarticons:close" />
                            </button>

                            {/* Youtube Embed Iframe Container */}
                            <div className="w-full aspect-video bg-black relative">
                                <iframe
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1`}
                                    title={selectedVideo.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>

                            {/* Video detail descriptions */}
                            <div className="p-5 flex flex-col gap-2">
                                <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Icon icon="pixelarticons:play" />
                                    <span>YouTube Media Integration</span>
                                </span>
                                <h3 className={`text-sm sm:text-base font-bold text-white m-0 ${current.fontClass}`}>
                                    {selectedVideo.title}
                                </h3>
                                <p className="text-xs text-white/60 leading-relaxed font-sans m-0">
                                    {selectedVideo.description}
                                </p>
                                <div className="flex justify-between items-center text-[10px] text-white/40 border-t border-white/5 pt-3 mt-1 font-mono">
                                    <span>CHANNEL: <strong className="text-white/75">{selectedVideo.channelName}</strong></span>
                                    <div className="flex gap-3">
                                        <span>{selectedVideo.views}</span>
                                        <span>{selectedVideo.publishedAt}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* PUBLISH POST MODAL OVERLAY */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-200">
                        <div className="bg-[#1a1a1a] border-2 border-white/10 w-full max-w-xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
                            
                            <div className="flex justify-between items-start mb-6">
                                <h3 className={`text-base sm:text-lg font-bold text-white flex items-center gap-2 ${current.fontClass}`}>
                                    <Icon icon="pixelarticons:plus" className="text-[#3c8527]" />
                                    <span>{current.figureForum.publishPost}</span>
                                </h3>
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="w-7 h-7 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white cursor-pointer rounded-xs"
                                >
                                    <Icon icon="pixelarticons:close" />
                                </button>
                            </div>

                            <form onSubmit={handleCreatePost} className="flex flex-col gap-4">
                                {/* Title */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 uppercase font-mono">{current.figureForum.postTitle}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Slicing micro figurines instructions"
                                        className="bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] font-sans"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        required
                                    />
                                </div>

                                {/* Category Selection */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 uppercase font-mono">{current.figureForum.postCategory}</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setNewCategory('discussions'); }}
                                            className={`py-2 border flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-mono font-bold ${newCategory === 'discussions' ? 'bg-[#3c8527]/15 border-[#3c8527] text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                                        >
                                            <Icon icon="pixelarticons:comment" />
                                            <span>Discussion</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setNewCategory('showcase'); setHasImage(true); }}
                                            className={`py-2 border flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-mono font-bold ${newCategory === 'showcase' ? 'bg-[#3c8527]/15 border-[#3c8527] text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                                        >
                                            <Icon icon="pixelarticons:image-new" />
                                            <span>Showcase</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Image Attachment Toggle for Discussions */}
                                {newCategory === 'discussions' && (
                                    <div className="flex items-center gap-3 py-1">
                                        <input
                                            type="checkbox"
                                            id="hasImageCheckbox"
                                            className="w-4 h-4 accent-[#3c8527] cursor-pointer"
                                            checked={hasImage}
                                            onChange={e => setHasImage(e.target.checked)}
                                        />
                                        <label htmlFor="hasImageCheckbox" className="text-xs text-white/80 cursor-pointer font-sans select-none">
                                            Attach a 3D Printed Figurine Model image
                                        </label>
                                    </div>
                                )}

                                {/* Image selector */}
                                {hasImage && (
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs text-white/60 uppercase font-mono">Select Figurine Model Asset</label>
                                        <select
                                            className={`bg-[#222] border border-white/10 p-2.5 text-xs text-white/80 focus:outline-none focus:border-[#3c8527] cursor-pointer ${current.fontClass}`}
                                            value={newImage}
                                            onChange={e => setNewImage(e.target.value)}
                                        >
                                            <option value="/images/warrior_figure.png">Pixel Knight Warrior (Blue)</option>
                                            <option value="/images/robot_figure.png">Neon Cyber Mecha (Robot)</option>
                                            <option value="/images/fox_figure.png">Orange Red Fox Figurine</option>
                                        </select>
                                    </div>
                                )}

                                {/* Description Content */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 uppercase font-mono">{current.figureForum.postContent}</label>
                                    <textarea
                                        rows={4}
                                        placeholder="Describe details, settings, assembly tips, or ask a question..."
                                        className="bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] font-sans resize-none"
                                        value={newContent}
                                        onChange={e => setNewContent(e.target.value)}
                                        required
                                    />
                                </div>

                                {/* Slicing Settings subform */}
                                <div className="border border-white/5 bg-white/5 p-4 rounded-sm">
                                    <h4 className={`text-xs font-bold text-white mb-3 uppercase tracking-wide ${current.fontClass}`}>
                                        3D Print Spec Settings (Optional)
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Printer Model</span>
                                            <input
                                                type="text"
                                                className="bg-black/45 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527]"
                                                value={newPrinter}
                                                onChange={e => setNewPrinter(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Layer Height</span>
                                            <input
                                                type="text"
                                                className="bg-black/45 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527]"
                                                value={newLayerHeight}
                                                onChange={e => setNewLayerHeight(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Infill %</span>
                                            <input
                                                type="text"
                                                className="bg-black/45 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527]"
                                                value={newInfill}
                                                onChange={e => setNewInfill(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Print Time</span>
                                            <input
                                                type="text"
                                                className="bg-black/45 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527]"
                                                value={newPrintTime}
                                                onChange={e => setNewPrintTime(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1 col-span-2">
                                            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Filament & Material Specs</span>
                                            <input
                                                type="text"
                                                className="bg-black/45 border border-white/10 p-2 text-xs text-white focus:outline-none focus:border-[#3c8527]"
                                                value={newMaterial}
                                                onChange={e => setNewMaterial(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Tags (comma separated) */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 uppercase font-mono">{current.figureForum.postTags}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. PLA, BambuLab, Voxel"
                                        className="bg-black/50 border border-white/10 p-2.5 text-xs text-white focus:outline-none focus:border-[#3c8527] font-mono"
                                        value={newTags}
                                        onChange={e => setNewTags(e.target.value)}
                                    />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 justify-end mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
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
                )}

        </PageContainer>
    )
}
