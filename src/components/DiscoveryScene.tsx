import { Canvas } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { useSyncExternalStore } from 'react'
import { Discovery } from './Discovery'
import type { GenerationLogItemBrief } from '../types/log'

interface DiscoverySceneProps {
    items: GenerationLogItemBrief[] | null
    selected: GenerationLogItemBrief | null
    onSelect: (item: GenerationLogItemBrief | null) => void
    onLoading: (isLoading: boolean) => void
    paused?: boolean
}

function subscribeVisibility(listener: () => void) {
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
}
function subscribeMotionPreference(listener: () => void) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
}
const isVisible = () => !document.hidden
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function DiscoveryScene({ items, selected, onSelect, onLoading, paused = false }: DiscoverySceneProps) {
    const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true)
    const reducedMotion = useSyncExternalStore(subscribeMotionPreference, prefersReducedMotion, () => false)
    return (
        <Canvas
            camera={{ position: [0, 0, 0.001] }}
            frameloop={paused || !visible ? 'never' : reducedMotion ? 'demand' : 'always'}
            dpr={[1, 1.5]}
            gl={{ antialias: false }}
            style={{ touchAction: 'none' }}
        >
            <Discovery items={items} selected={selected} onSelect={onSelect} onLoading={onLoading} reducedMotion={reducedMotion} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={reducedMotion ? 0 : 1} />
        </Canvas>
    )
}
