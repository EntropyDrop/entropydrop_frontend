import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { MinecraftCharacter } from './MC'
import { type LangData } from '../constants/lang'

interface ProfileSkinPreviewProps {
    textureUrl: string
    current: LangData
    className?: string
}

interface PreviewBoundaryProps {
    children: ReactNode
    fallback: ReactNode
}

interface PreviewBoundaryState {
    hasError: boolean
}

class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
    state: PreviewBoundaryState = { hasError: false }

    static getDerivedStateFromError(): PreviewBoundaryState {
        return { hasError: true }
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.warn('Profile skin preview failed to render:', error, errorInfo.componentStack)
    }

    render() {
        if (this.state.hasError) return this.props.fallback
        return this.props.children
    }
}

function SkinImageFallback({ textureUrl, current }: ProfileSkinPreviewProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-zinc-900">
            <img
                src={textureUrl}
                alt="minecraft skin"
                className="w-12 h-12 object-contain"
                style={{ imageRendering: 'pixelated' }}
            />
            <span className={`text-[9px] text-white/35 text-center ${current.fontClass}`}>
                {current.mcmodal.previewUnavailable}
            </span>
        </div>
    )
}

export function ProfileSkinPreview({ textureUrl, current, className = 'w-24 h-28' }: ProfileSkinPreviewProps) {
    const fallback = <SkinImageFallback textureUrl={textureUrl} current={current} />

    return (
        <div className={`${className} bg-zinc-900 border border-white/10 overflow-hidden shrink-0`}>
            <PreviewBoundary key={textureUrl} fallback={fallback}>
                <Canvas
                    camera={{ position: [28, 24, 32], fov: 36 }}
                    resize={{ offsetSize: true }}
                    shadows
                >
                    <color attach="background" args={['#18181b']} />
                    <ambientLight intensity={0.65} />
                    <spotLight position={[12, 24, 12]} angle={0.2} penumbra={1} intensity={1.6} castShadow />
                    <pointLight position={[-10, 4, -10]} intensity={0.35} />

                    <Suspense fallback={null}>
                        <Stage environment={null} intensity={0.45} adjustCamera={false}>
                            <group position={[0, -10, 0]} rotation={[0, -0.35, 0]}>
                                <MinecraftCharacter textureUrl={textureUrl} mode="voxel" action="idle" />
                            </group>
                        </Stage>
                    </Suspense>

                    <OrbitControls
                        makeDefault
                        enableDamping
                        enablePan={false}
                        enableZoom={false}
                        target={[0, 0, 0]}
                    />
                </Canvas>
            </PreviewBoundary>
        </div>
    )
}
