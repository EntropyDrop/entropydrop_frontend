export interface PrintSettings {
    printer: string
    layerHeight: string
    infill: string
    printTime: string
    material: string
}

export interface ForumComment {
    id: string
    author: string
    avatarUrl?: string
    minecraftSkinUrl?: string
    isPro?: boolean
    content: string
    createdAt: string
    replies?: ForumComment[]
}

export interface ForumPost {
    id: string
    title: string
    content: string
    category: 'discussions' | 'showcase'
    image?: string // Optional image for discussions
    tags: string[]
    author: string
    authorAvatar?: string
    authorMinecraftSkinUrl?: string
    isPro?: boolean
    role?: string
    likes: number
    views: number
    isLiked?: boolean
    printSettings: PrintSettings
    comments: ForumComment[]
    commentsCount: number
    createdAt: string
    bodyType?: string
    multiColorType?: string
}

export interface YoutubeVideo {
    id: string
    youtubeId: string
}
