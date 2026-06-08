export const TOP_NAV_ITEMS = [
    { key: 'skin', icon: 'pixelarticons:avatar', path: '/skin/' },
    { key: 'figure', icon: 'pixelarticons:box', path: '/figure' },
    { key: 'pro', icon: 'pixelarticons:zap', path: '/pro' },
    { key: 'public', icon: 'pixelarticons:binary', path: '/public' },
] as const

export const SKIN_NAV_ITEMS = [
    { key: 'discover', icon: 'pixelarticons:image-new', path: '/skin/' },
    { key: 'generate', icon: 'pixelarticons:robot', path: '/skin/generate' },
    { key: 'edit', icon: 'pixelarticons:edit', path: '/skin/edit' },
    // { key: 'print', icon: 'pixelarticons:box', path: '/skin/print' },
    { key: 'collection', icon: 'pixelarticons:folder', path: '/skin/collection' },
] as const

export const FIGURE_NAV_ITEMS = [
    { key: 'discussions', icon: 'pixelarticons:comment', path: '/figure' },
    { key: 'showcase', icon: 'pixelarticons:image-new', path: '/figure?category=showcase' },
    { key: 'videos', icon: 'pixelarticons:device-laptop', path: '/figure?category=videos' },
] as const

export type TopNavKey = typeof TOP_NAV_ITEMS[number]['key']
export type SkinNavKey = typeof SKIN_NAV_ITEMS[number]['key']
export type FigureNavKey = typeof FIGURE_NAV_ITEMS[number]['key']

// Keep NAV_ITEMS for backward compatibility
export const NAV_ITEMS = SKIN_NAV_ITEMS
export type NavKey = SkinNavKey
