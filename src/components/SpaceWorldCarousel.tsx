import type { LangData } from '../constants/lang'
import { SPACE_ENTRANCE_WORLDS, type SpaceEntranceWorld } from '../utils/spaceWorlds'
import './SpaceWorldCarousel.css'

export function SpaceWorldBackground({ world }: { world: SpaceEntranceWorld }) {
    return (
        <div className="space-world-background" aria-hidden="true">
            {SPACE_ENTRANCE_WORLDS.map(entry => (
                <img
                    key={entry.slug}
                    src={entry.image}
                    srcSet={`${entry.image.replace('.webp', '_960.webp')} 960w, ${entry.image} 1920w`}
                    sizes="100vw"
                    width="1920"
                    height="1108"
                    alt=""
                    decoding="async"
                    className={entry.slug === world ? 'is-active' : ''}
                />
            ))}
        </div>
    )
}

export function SpaceWorldControls({ current, world, onSelect }: {
    current: LangData,
    world: SpaceEntranceWorld,
    onSelect: (world: SpaceEntranceWorld) => void,
}) {
    return (
        <div className="space-world-controls" role="group" aria-label={current.space_page.worldCarousel.label}>
            {SPACE_ENTRANCE_WORLDS.map(entry => (
                <button
                    key={entry.slug}
                    type="button"
                    title={entry.name}
                    aria-label={current.space_page.worldCarousel.select.replace('{world}', entry.name)}
                    aria-pressed={entry.slug === world}
                    onClick={() => onSelect(entry.slug)}
                >
                    <img
                        src={entry.image.replace('.webp', '_960.webp')}
                        width="960"
                        height="554"
                        alt=""
                        decoding="async"
                    />
                </button>
            ))}
        </div>
    )
}
