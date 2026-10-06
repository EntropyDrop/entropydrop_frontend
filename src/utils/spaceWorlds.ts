export const SPACE_DEFAULT_ENTRANCE_WORLD = 'aether-archipelago' as const

export const SPACE_ENTRANCE_WORLDS = [
    { slug: 'aether-archipelago', name: 'Aether Archipelago', image: '/images/space_world_aether.webp' },
    { slug: 'nature', name: 'Nature', image: '/images/space_world_nature.webp' },
    { slug: 'copper-metropolis', name: 'Copper Metropolis', image: '/images/space_world_copper.webp' },
] as const

export type SpaceEntranceWorld = typeof SPACE_ENTRANCE_WORLDS[number]['slug']

export function spaceWorldLaunchUrl(spaceAppUrl: string, world: SpaceEntranceWorld, pageUrl: string): string {
    const destination = new URL(spaceAppUrl, pageUrl)
    destination.searchParams.set('world', world)
    destination.searchParams.delete('token')
    const fragment = new URLSearchParams(destination.hash.slice(1))
    fragment.delete('token')
    destination.hash = fragment.toString()
    return `/space/login?destination=${encodeURIComponent(destination.href)}`
}

export function spaceEntranceWorldName(world: string | null): string | null {
    if (!world || world === 'default') world = SPACE_DEFAULT_ENTRANCE_WORLD
    return SPACE_ENTRANCE_WORLDS.find(entry => entry.slug === world)?.name ?? null
}
