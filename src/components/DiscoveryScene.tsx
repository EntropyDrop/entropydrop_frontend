import { Canvas } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { Discovery } from './Discovery'
import type { GenerationLogItemBrief } from '../types/log'

interface DiscoverySceneProps {
    selected: GenerationLogItemBrief | null
    onSelect: (item: GenerationLogItemBrief | null) => void
    onLoading: (isLoading: boolean) => void
}

export function DiscoveryScene({ selected, onSelect, onLoading }: DiscoverySceneProps) {
    return (
        <Canvas camera={{ position: [0, 0, 0.001] }} style={{ touchAction: 'none' }}>
            <ambientLight intensity={Math.PI / 2} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
            <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
            <Discovery selected={selected} onSelect={onSelect} onLoading={onLoading} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        </Canvas>
    )
}
