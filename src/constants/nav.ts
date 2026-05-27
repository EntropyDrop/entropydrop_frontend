export const NAV_ITEMS = [
    { key: 'discover', icon: 'pixelarticons:image-new', path: '/skin/' },
    { key: 'generate', icon: 'pixelarticons:robot', path: '/skin/generate' },
    { key: 'edit', icon: 'pixelarticons:edit', path: '/skin/edit' },
    // { key: 'print', icon: 'pixelarticons:box', path: '/skin/print' },
    { key: 'collection', icon: 'pixelarticons:folder', path: '/skin/collection' },
    { key: 'open', icon: 'pixelarticons:binary', path: '/skin/open' },
] as const

export type NavKey = typeof NAV_ITEMS[number]['key']
