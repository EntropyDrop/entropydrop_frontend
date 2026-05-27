import { Icon } from '@iconify/react'
import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { MinecraftCharacter } from './MC';
import { type LangData } from '../constants/lang';

interface Skin3DModalProps {
    isOpen: boolean;
    onClose: () => void;
    textureUrl: string | null;
    current: LangData;
}

export function Skin3DModal({ isOpen, onClose, textureUrl, current }: Skin3DModalProps) {
    const [action, setAction] = useState<'idle' | 'walking'>('idle');

    if (!isOpen || !textureUrl) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
            <div className={`w-full max-w-lg bg-[#1a1a1a] border-2 border-white/10 flex flex-col shadow-2xl relative ${current.fontClass}`}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white/60 hover:text-white border border-white/10 cursor-pointer transition-colors"
                >
                    <Icon icon="pixelarticons:close" className="text-lg" />
                </button>

                {/* 3D Canvas Container */}
                <div className="w-full aspect-square bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] relative overflow-hidden">
                    <Canvas
                        camera={{ position: [35, 35, 35], fov: 40 }}
                        shadows
                        resize={{ offsetSize: true }}
                    >
                        <color attach="background" args={['#1a1a1a']} />
                        <ambientLight intensity={0.6} />
                        <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
                        <pointLight position={[-10, -10, -10]} intensity={0.5} />

                        <Suspense fallback={null}>
                            <Stage environment={null} intensity={0.5} shadows="contact" adjustCamera={false}>
                                <group position={[0, -0.5, 0]}>
                                    <MinecraftCharacter textureUrl={textureUrl} mode={'voxel'} action={action} />
                                </group>
                            </Stage>
                        </Suspense>

                        <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
                    </Canvas>
                </div>

                {/* Controls Footer */}
                <div className="p-3 border-t border-white/10 flex justify-between items-center bg-black/20">
                    {/* Actions */}
                    <div className="flex gap-1 bg-black/40 p-1 border border-white/5">
                        {['idle', 'walking'].map((a) => (
                            <button
                                key={a}
                                onClick={() => setAction(a as any)}
                                className={`px-3 py-1 text-[10px] uppercase transition-all cursor-pointer ${action === a ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
