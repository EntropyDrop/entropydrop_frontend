import { Icon } from '@iconify/react'
import { Component, Suspense, useState, useRef, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { MinecraftCharacter } from './MC'

interface MCModalPreviewProps {
    textureUrl: string;
    mode: 'voxel' | 'plane';
    action: 'idle' | 'walking' | 'dance';
    modelType: 'steve' | 'alex';
    visibleParts: {
        head: boolean;
        body: boolean;
        leftArm: boolean;
        rightArm: boolean;
        leftLeg: boolean;
        rightLeg: boolean;
    };
    setMode: (m: 'voxel' | 'plane') => void;
    setAction: (a: 'idle' | 'walking' | 'dance') => void;
    convertModel: (target: 'steve' | 'alex') => void;
    togglePart: (part: 'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg') => void;
    onEdit?: () => void;
    onPrint?: () => void;
    downloadFilename?: string;
    current: any;
    fbxUrl?: string;
    setFbxUrl?: (url: string) => void;
}

const DanceOptions = [
    { label: 'Thriller Part 3', value: '/fbx/Thriller Part 3.fbx' },
    { label: 'Thriller Part 4', value: '/fbx/Thriller Part 4.fbx' },
    { label: 'Hip Hop Dancing', value: '/fbx/Hip Hop Dancing.fbx' },
    { label: 'Breakdance 1990', value: '/fbx/Breakdance 1990.fbx' },
    { label: 'Bboy Hip Hop Move', value: '/fbx/Bboy Hip Hop Move.fbx' },
    { label: 'Rumba Dancing', value: '/fbx/Rumba Dancing.fbx' },
    { label: 'Twist Dance', value: '/fbx/Twist Dance.fbx' },
    { label: 'Breakdance Uprock Var 2', value: '/fbx/Breakdance Uprock Var 2.fbx' }
]

interface PreviewErrorBoundaryProps {
    children: ReactNode
    onError: () => void
}

interface PreviewErrorBoundaryState {
    hasError: boolean
}

class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
    state: PreviewErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError(): PreviewErrorBoundaryState {
        return { hasError: true }
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.warn('Minecraft preview failed to render:', error, errorInfo.componentStack)
        this.props.onError()
    }

    render() {
        if (this.state.hasError) return null
        return this.props.children
    }
}

export function MCModalPreview({
    textureUrl,
    mode,
    action,
    modelType,
    visibleParts,
    setMode,
    setAction,
    convertModel,
    togglePart,
    onEdit,
    onPrint,
    downloadFilename,
    current,
    fbxUrl,
    setFbxUrl,
}: MCModalPreviewProps) {
    const [isFbxDropdownOpen, setIsFbxDropdownOpen] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    const fbxDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fbxDropdownRef.current && !fbxDropdownRef.current.contains(event.target as Node)) {
                setIsFbxDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (action === 'dance') {
            setFbxUrl?.(DanceOptions[0].value);
        }
    }, [action, setFbxUrl]);

    useEffect(() => {
        setPreviewFailed(false);
    }, [textureUrl]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!textureUrl) return;
        try {
            const response = await fetch(textureUrl);
            if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadFilename!;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback to direct link if fetch fails
            const link = document.createElement('a');
            link.href = textureUrl;
            link.download = downloadFilename!;
            link.target = '_blank';
            link.click();
        }
    };

    return (
        <div className="w-full lg:w-[600px] aspect-square lg:h-[720px] [@media(max-height:850px)]:lg:h-full [@media(max-height:850px)]:lg:aspect-square bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] relative overflow-hidden flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10">
            <Canvas
                camera={{ position: [35, 35, 35], fov: 40 }}
                shadows
                resize={{ offsetSize: true }}
            >
                <color attach="background" args={['#1a1a1a']} />
                <ambientLight intensity={0.6} />
                <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                {!previewFailed && (
                    <PreviewErrorBoundary key={textureUrl} onError={() => setPreviewFailed(true)}>
                        <Suspense fallback={null}>
                            <Stage environment={null} intensity={0.5} shadows="contact" adjustCamera={false}>
                                <group position={[0, -0.5, 0]}>
                                    <MinecraftCharacter textureUrl={textureUrl} mode={mode} action={action} fbxUrl={fbxUrl} visibleParts={visibleParts} />
                                </group>
                            </Stage>
                        </Suspense>
                    </PreviewErrorBoundary>
                )}

                <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
            </Canvas>

            {previewFailed && (
                <div className={`absolute inset-0 pointer-events-none flex items-center justify-center p-6 text-center ${current.fontClass}`}>
                    <div className="bg-black/50 border border-white/10 px-4 py-3 text-xs text-white/60">
                        {current.mcmodal?.previewUnavailable || 'Preview unavailable'}
                    </div>
                </div>
            )}

            {/* Floating Scene Controls */}
            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                <div className="flex justify-start items-start gap-2">
                    <div className="flex flex-col gap-2 pointer-events-auto">
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 flex gap-1">
                            <button
                                onClick={() => setMode('voxel')}
                                className={`px-3 py-1.5 text-[10px] font-pixel-hans transition-all cursor-pointer ${mode === 'voxel' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                VOXEL
                            </button>
                            <button
                                onClick={() => setMode('plane')}
                                className={`px-3 py-1.5 text-[10px] font-pixel-hans transition-all cursor-pointer ${mode === 'plane' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                PLANE
                            </button>
                        </div>
                    </div>

                    <div className="hidden lg:flex flex-col gap-2 pointer-events-auto">
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 flex gap-1">
                            <button
                                onClick={() => onEdit?.()}
                                className="px-3 py-1.5 text-[10px] font-pixel-hans transition-all cursor-pointer text-white/60 hover:text-white flex items-center gap-1"
                            >
                                <Icon icon="pixelarticons:edit" className="text-sm" />
                                EDIT
                            </button>
                            {onPrint && false && (
                                <button
                                    onClick={() => onPrint?.()}
                                    className="px-3 py-1.5 text-[10px] font-pixel-hans transition-all cursor-pointer text-[#e09f3e] hover:text-white flex items-center gap-1"
                                >
                                    <Icon icon="pixelarticons:box" className="text-sm" />
                                    3D PRINT
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-2 pointer-events-auto">
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 flex flex-row gap-1">
                            {['idle', 'walking', 'dance'].map((a) => (
                                <button
                                    key={a}
                                    onClick={() => setAction(a as any)}
                                    className={`px-4 py-1.5 text-[10px] font-pixel-hans text-left transition-all cursor-pointer uppercase ${action === a ? 'bg-white/10 text-[#4ea632]' : 'text-white/40 hover:text-white'}`}
                                >
                                    {a === action && <span className="mr-1 inline-block w-1 h-1 bg-[#4ea632]" />}
                                    {a}
                                </button>
                            ))}
                            {action === 'dance' && (
                                <div className="relative ml-1 border-l border-white/10 pl-1 flex items-center" ref={fbxDropdownRef}>
                                    <button
                                        onClick={() => setIsFbxDropdownOpen(!isFbxDropdownOpen)}
                                        className="bg-transparent text-white font-pixel-hans text-[10px] outline-none cursor-pointer border-none uppercase flex items-center gap-1 hover:text-[#4ea632] transition-colors"
                                    >
                                        {DanceOptions.find(opt => opt.value === fbxUrl)?.label || fbxUrl?.split('/').pop()?.replace('.fbx', '') || 'SELECT FBX'}
                                        <Icon icon="pixelarticons:chevron-down" className={`transition-transform duration-200 ${isFbxDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isFbxDropdownOpen && (
                                        <div className="absolute bottom-full left-0 mb-2 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 shadow-xl z-50 flex flex-col min-w-[120px]">
                                            {DanceOptions.map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => {
                                                        setFbxUrl?.(opt.value);
                                                        setIsFbxDropdownOpen(false);
                                                    }}
                                                    className={`px-3 py-2 text-left font-pixel-hans text-[10px] uppercase transition-colors hover:bg-white/10 ${fbxUrl === opt.value ? 'text-[#4ea632] bg-white/5' : 'text-white/60'}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom-Right Stack: Edit above Toggler above Download */}
                    <div className="flex flex-col gap-2 items-end pointer-events-auto">
                        <div className="lg:hidden bg-black/40 backdrop-blur-md p-1 border border-white/10 flex gap-1 w-fit">
                            <button
                                onClick={() => onEdit?.()}
                                className="px-3 py-1.5 text-[10px] font-pixel-hans transition-all cursor-pointer text-white/60 hover:text-white flex items-center gap-1"
                            >
                                <Icon icon="pixelarticons:edit" className="text-sm" />
                                EDIT
                            </button>
                        </div>
                        {/* Model Type Toggler */}
                        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 p-0.5">
                            <button
                                onClick={() => convertModel('steve')}
                                className={`px-2 py-1 text-[9px] font-pixel-hans transition-all cursor-pointer ${current.fontClass} ${modelType === 'steve' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                {current.mcmodal.strongMode}
                            </button>
                            <button
                                onClick={() => convertModel('alex')}
                                className={`px-2 py-1 text-[9px] font-pixel-hans transition-all cursor-pointer ${current.fontClass} ${modelType === 'alex' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                {current.mcmodal.slimMode}
                            </button>
                        </div>

                        {/* Simplified Character Toggler */}
                        <div className="bg-black/40 backdrop-blur-md p-3 border border-white/10 flex flex-col items-center gap-1.5">
                            <div
                                onClick={() => togglePart('head')}
                                className={`w-4 h-4 cursor-pointer border-2 transition-colors ${visibleParts.head ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`}
                            />
                            <div className="flex gap-1">
                                <div onClick={() => togglePart('rightArm')} className={`w-2 h-6 cursor-pointer border-2 transition-colors ${visibleParts.rightArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('body')} className={`w-4 h-6 cursor-pointer border-2 transition-colors ${visibleParts.body ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('leftArm')} className={`w-2 h-6 cursor-pointer border-2 transition-colors ${visibleParts.leftArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                            </div>
                            <div className="flex gap-1">
                                <div onClick={() => togglePart('rightLeg')} className={`w-2 h-6 cursor-pointer border-2 transition-colors ${visibleParts.rightLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                <div onClick={() => togglePart('leftLeg')} className={`w-2 h-6 cursor-pointer border-2 transition-colors ${visibleParts.leftLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                            </div>
                        </div>

                        {/* Download Button */}
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 flex flex-row">
                            <button
                                onClick={handleDownload}
                                className="px-5 py-1.5 bg-[#38598b] hover:bg-[#4a6bb4] text-white font-pixel-hans text-[10px] uppercase flex items-center gap-2 transition-all cursor-pointer border-none outline-none"
                                title="Download Texture"
                            >
                                <Icon icon="pixelarticons:download" className="text-sm" />
                                DOWNLOAD
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
