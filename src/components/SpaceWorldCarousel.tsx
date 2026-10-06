import { Icon } from '@iconify/react'
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

export function SpaceWorldControls({ current, world, launchUrl, onSelect, onPauseChange }: {
    current: LangData,
    world: SpaceEntranceWorld,
    launchUrl: string,
    onSelect: (world: SpaceEntranceWorld) => void,
    onPauseChange: (paused: boolean) => void,
}) {
    return (
        <div
            className="space-world-controls"
            role="group"
            aria-label={current.space_page.worldCarousel.label}
            onMouseEnter={() => onPauseChange(true)}
            onMouseLeave={event => onPauseChange(event.currentTarget.contains(document.activeElement))}
            onFocus={() => onPauseChange(true)}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    onPauseChange(event.currentTarget.matches(':hover'))
                }
            }}
        >
            {SPACE_ENTRANCE_WORLDS.map(entry => (
                <div key={entry.slug} className="space-world-choice">
                    <button
                        className="space-world-select"
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
                        <span className="space-world-name">{entry.name}</span>
                    </button>
                    {entry.slug === world ? (
                        <a
                            href={launchUrl}
                            className={`space-world-play ${current.fontClass}`}
                            aria-label={`${current.space_page.primaryCta} · ${entry.name}`}
                        >
                            <Icon icon="pixelarticons:play" className="text-xl" />
                            <span>{current.space_page.primaryCta}</span>
                            <Icon icon="pixelarticons:arrow-right" className="text-lg" />
                        </a>
                    ) : null}
                </div>
            ))}
        </div>
    )
}
