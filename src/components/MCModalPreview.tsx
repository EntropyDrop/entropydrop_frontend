import { FigurePrintOfferBadge } from './FigureDiscountBadge';
import type { LangData } from '../constants/lang'
import { request } from '../utils/httpClient'
import { Icon } from '@iconify/react'
import { Component, Suspense, memo, useState, useRef, useEffect, useCallback, useSyncExternalStore, type ErrorInfo, type ReactNode, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import type { TOUCH } from 'three'
import type { OrbitControls as OrbitControlsInstance } from 'three-stdlib'
import { MinecraftCharacter } from './MC'
import { useCanvasContextHandlers } from '../hooks/useCanvasContextHandlers'

interface MCModalPreviewProps {
    textureUrl: string;
    mode: 'voxel' | 'plane' | 'cute';
    action: 'idle' | 'walk' | 'dance';
    modelType: 'steve' | 'alex';
    setMode: (m: 'voxel' | 'plane' | 'cute') => void;
    setAction: (a: 'idle' | 'walk' | 'dance') => void;
    convertModel: (target: 'steve' | 'alex') => void;
    onEdit?: () => void;
    onPrint?: () => void;
    downloadFilename?: string;
    current: LangData;
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

function subscribeVisibility(listener: () => void) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
}
const isDocumentVisible = () => !document.hidden;

const CAMERA_VIEW_STORAGE_KEY = 'mcmodal_camera_angle';
const DEFAULT_CAMERA_POSITION: [number, number, number] = [35, 35, 35];
const DEFAULT_CAMERA_DISTANCE = Math.hypot(...DEFAULT_CAMERA_POSITION);
const MIN_CAMERA_DISTANCE = 18;
const MAX_CAMERA_DISTANCE = 160;
const CAMERA_POLAR_EPS = 1e-6;
const CAMERA_ANGLE_EPS = 1e-4;
const CAMERA_DISTANCE_EPS = 1e-2;
const CAMERA_VIEW_SAVE_DEBOUNCE_MS = 150;
const ORBIT_TOUCHES: { ONE: TOUCH; TWO: undefined } = { ONE: 0 as TOUCH, TWO: undefined };

interface SavedCameraView {
    azimuth: number;
    polar: number;
    distance: number;
}

type ViewReadableControls = {
    getAzimuthalAngle?: () => number;
    getPolarAngle?: () => number;
    getDistance?: () => number;
    object?: {
        position: {
            x: number;
            y: number;
            z: number;
            set: (x: number, y: number, z: number) => unknown;
        };
    };
    target?: { x: number; y: number; z: number };
    update?: () => unknown;
};

interface TouchPointLike {
    clientX: number;
    clientY: number;
}

interface PinchState {
    startTouchDistance: number;
    startCameraDistance: number;
}

function clampPolar(polar: number): number {
    return Math.min(Math.PI - CAMERA_POLAR_EPS, Math.max(CAMERA_POLAR_EPS, polar));
}

function clampDistance(distance: number): number {
    return Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, distance));
}

function getTouchPairDistance(touches: ArrayLike<TouchPointLike>): number {
    if (touches.length < 2) return 0;
    return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
    );
}

function getStorage(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

function loadSavedCameraView(): SavedCameraView | null {
    try {
        const raw = getStorage()?.getItem(CAMERA_VIEW_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<SavedCameraView> | null;
        if (
            !parsed ||
            typeof parsed.azimuth !== 'number' ||
            typeof parsed.polar !== 'number' ||
            !Number.isFinite(parsed.azimuth) ||
            !Number.isFinite(parsed.polar)
        ) {
            return null;
        }
        const distance =
            typeof parsed.distance === 'number' && Number.isFinite(parsed.distance) && parsed.distance > 0
                ? clampDistance(parsed.distance)
                : DEFAULT_CAMERA_DISTANCE;
        return {
            azimuth: parsed.azimuth,
            polar: clampPolar(parsed.polar),
            distance,
        };
    } catch {
        return null;
    }
}

function saveCameraView(view: SavedCameraView): void {
    if (
        !Number.isFinite(view.azimuth) ||
        !Number.isFinite(view.polar) ||
        !Number.isFinite(view.distance) ||
        view.distance <= 0
    ) {
        return;
    }
    try {
        getStorage()?.setItem(
            CAMERA_VIEW_STORAGE_KEY,
            JSON.stringify({
                azimuth: view.azimuth,
                polar: clampPolar(view.polar),
                distance: clampDistance(view.distance),
            }),
        );
    } catch {
        // Ignore storage quota or restricted-mode errors.
    }
}

function cameraPositionFromView(view: SavedCameraView | null): [number, number, number] {
    if (!view) return DEFAULT_CAMERA_POSITION;
    const polar = clampPolar(view.polar);
    const distance = clampDistance(view.distance);
    const sinPhiRadius = Math.sin(polar) * distance;
    return [
        sinPhiRadius * Math.sin(view.azimuth),
        Math.cos(polar) * distance,
        sinPhiRadius * Math.cos(view.azimuth),
    ];
}

function readControlsDistance(controls: ViewReadableControls | null | undefined): number | null {
    if (!controls) return null;
    if (typeof controls.getDistance === 'function') {
        const distance = controls.getDistance();
        if (Number.isFinite(distance) && distance > 0) {
            return clampDistance(distance);
        }
    }
    if (controls.object?.position && controls.target) {
        const distance = Math.hypot(
            controls.object.position.x - controls.target.x,
            controls.object.position.y - controls.target.y,
            controls.object.position.z - controls.target.z,
        );
        if (Number.isFinite(distance) && distance > 0) {
            return clampDistance(distance);
        }
    }
    return null;
}

function readControlsView(
    controls: ViewReadableControls | null | undefined,
    fallbackDistance: number,
): SavedCameraView | null {
    if (
        !controls ||
        typeof controls.getAzimuthalAngle !== 'function' ||
        typeof controls.getPolarAngle !== 'function'
    ) {
        return null;
    }
    const azimuth = controls.getAzimuthalAngle();
    const polar = controls.getPolarAngle();
    if (!Number.isFinite(azimuth) || !Number.isFinite(polar)) return null;
    const distance = readControlsDistance(controls) ?? clampDistance(fallbackDistance);
    return { azimuth, polar: clampPolar(polar), distance };
}

function applyControlsDistance(controls: ViewReadableControls | null | undefined, nextDistance: number): boolean {
    const position = controls?.object?.position;
    const target = controls?.target;
    if (!position || !target || !Number.isFinite(nextDistance) || nextDistance <= 0) return false;
    const offsetX = position.x - target.x;
    const offsetY = position.y - target.y;
    const offsetZ = position.z - target.z;
    const currentDistance = Math.hypot(offsetX, offsetY, offsetZ);
    if (!Number.isFinite(currentDistance) || currentDistance <= 1e-6) return false;
    const factor = clampDistance(nextDistance) / currentDistance;
    position.set(
        target.x + offsetX * factor,
        target.y + offsetY * factor,
        target.z + offsetZ * factor,
    );
    controls.update?.();
    return true;
}

// Sidebar, download and dropdown updates should not reconcile the Three scene.
const PreviewScene = memo(function PreviewScene({ textureUrl, mode, action, fbxUrl, containerRef, onError, onRecover }:
    Pick<MCModalPreviewProps, 'textureUrl' | 'mode' | 'action' | 'fbxUrl'> & {
        containerRef: RefObject<HTMLDivElement | null>;
        onError: () => void;
        onRecover: () => void;
    }) {
    const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, () => true);
    const animated = action !== 'idle' || mode === 'cute';
    const [initialCameraState] = useState(() => {
        const saved = loadSavedCameraView();
        return {
            saved,
            camera: { position: cameraPositionFromView(saved), fov: 40 },
        };
    });
    const controlsRef = useRef<OrbitControlsInstance | null>(null);
    const hasInteractedRef = useRef(false);
    const pinchRef = useRef<PinchState | null>(null);
    const pendingViewRef = useRef<SavedCameraView | null>(null);
    const saveTimerRef = useRef<number | null>(null);
    const lastSavedViewRef = useRef<SavedCameraView | null>(initialCameraState.saved);

    const persistView = useCallback((view: SavedCameraView) => {
        const prev = lastSavedViewRef.current;
        if (
            prev &&
            Math.abs(prev.azimuth - view.azimuth) < CAMERA_ANGLE_EPS &&
            Math.abs(prev.polar - view.polar) < CAMERA_ANGLE_EPS &&
            Math.abs(prev.distance - view.distance) < CAMERA_DISTANCE_EPS
        ) {
            return;
        }
        lastSavedViewRef.current = view;
        saveCameraView(view);
    }, []);

    const clearSaveTimer = useCallback(() => {
        if (saveTimerRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, []);

    const scheduleSaveView = useCallback((view: SavedCameraView) => {
        pendingViewRef.current = view;
        clearSaveTimer();
        if (typeof window !== 'undefined') {
            saveTimerRef.current = window.setTimeout(() => {
                saveTimerRef.current = null;
                const pending = pendingViewRef.current;
                pendingViewRef.current = null;
                if (pending) persistView(pending);
            }, CAMERA_VIEW_SAVE_DEBOUNCE_MS);
        }
    }, [clearSaveTimer, persistView]);

    const handleControlsStart = useCallback(() => {
        hasInteractedRef.current = true;
    }, []);

    const handleControlsChange = useCallback((event?: { target?: unknown }) => {
        if (!hasInteractedRef.current) return;
        const controls = (event?.target as ViewReadableControls | undefined) ?? controlsRef.current;
        const fallbackDistance = lastSavedViewRef.current?.distance ?? DEFAULT_CAMERA_DISTANCE;
        const view = readControlsView(controls, fallbackDistance);
        if (!view) return;
        scheduleSaveView(view);
    }, [scheduleSaveView]);

    const handleControlsEnd = useCallback((event?: { target?: unknown }) => {
        hasInteractedRef.current = true;
        clearSaveTimer();
        const controls = (event?.target as ViewReadableControls | undefined) ?? controlsRef.current;
        const fallbackDistance = lastSavedViewRef.current?.distance ?? DEFAULT_CAMERA_DISTANCE;
        const view = readControlsView(controls, fallbackDistance) ?? pendingViewRef.current;
        pendingViewRef.current = null;
        if (view) persistView(view);
    }, [clearSaveTimer, persistView]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length < 2) return;
            event.preventDefault();
            const controls = controlsRef.current as ViewReadableControls | null;
            const startTouchDistance = getTouchPairDistance(event.touches);
            const startCameraDistance = readControlsDistance(controls);
            if (startTouchDistance < 1 || startCameraDistance === null) return;
            hasInteractedRef.current = true;
            pinchRef.current = { startTouchDistance, startCameraDistance };
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (event.touches.length < 2) return;
            event.preventDefault();
            const controls = controlsRef.current as ViewReadableControls | null;
            if (!controls) return;
            const currentTouchDistance = getTouchPairDistance(event.touches);
            if (currentTouchDistance < 1) return;
            if (!pinchRef.current) {
                const startCameraDistance = readControlsDistance(controls);
                if (startCameraDistance === null) return;
                hasInteractedRef.current = true;
                pinchRef.current = { startTouchDistance: currentTouchDistance, startCameraDistance };
                return;
            }
            const nextDistance = clampDistance(
                pinchRef.current.startCameraDistance * (pinchRef.current.startTouchDistance / currentTouchDistance),
            );
            if (applyControlsDistance(controls, nextDistance)) {
                const view = readControlsView(controls, nextDistance);
                if (view) scheduleSaveView(view);
            }
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (event.touches.length >= 2) {
                const controls = controlsRef.current as ViewReadableControls | null;
                const startTouchDistance = getTouchPairDistance(event.touches);
                const startCameraDistance = readControlsDistance(controls);
                if (startTouchDistance >= 1 && startCameraDistance !== null) {
                    pinchRef.current = { startTouchDistance, startCameraDistance };
                }
                return;
            }
            if (!pinchRef.current) return;
            pinchRef.current = null;
            clearSaveTimer();
            const controls = controlsRef.current as ViewReadableControls | null;
            const fallbackDistance = lastSavedViewRef.current?.distance ?? DEFAULT_CAMERA_DISTANCE;
            const view = readControlsView(controls, fallbackDistance) ?? pendingViewRef.current;
            pendingViewRef.current = null;
            if (view) persistView(view);
        };

        const preventGesture = (event: Event) => {
            event.preventDefault();
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('touchcancel', handleTouchEnd);
        container.addEventListener('gesturestart', preventGesture, { passive: false });
        container.addEventListener('gesturechange', preventGesture, { passive: false });
        container.addEventListener('gestureend', preventGesture, { passive: false });

        return () => {
            pinchRef.current = null;
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
            container.removeEventListener('gesturestart', preventGesture);
            container.removeEventListener('gesturechange', preventGesture);
            container.removeEventListener('gestureend', preventGesture);
        };
    }, [clearSaveTimer, containerRef, persistView, scheduleSaveView]);

    useEffect(() => {
        return () => {
            clearSaveTimer();
            const pending = pendingViewRef.current;
            pendingViewRef.current = null;
            if (pending) persistView(pending);
        };
    }, [clearSaveTimer, persistView]);

    const handleContextCreated = useCanvasContextHandlers({
        onContextLost: onError,
        onContextRestored: onRecover,
    });
    const handleCanvasCreated = useCallback((state: Parameters<typeof handleContextCreated>[0]) => {
        if (state.gl?.domElement?.style) {
            state.gl.domElement.style.touchAction = 'none';
        }
        handleContextCreated(state);
    }, [handleContextCreated]);
    return (
        <Canvas
            camera={initialCameraState.camera}
            frameloop={!visible ? 'never' : animated ? 'always' : 'demand'}
            dpr={[1, 1.5]}
            resize={{ offsetSize: true }}
            style={{ touchAction: 'none' }}
            onCreated={handleCanvasCreated}
        >
            <color attach="background" args={['#1a1a1a']} />
            <ambientLight intensity={0.6} />
            <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={1.5} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            <PreviewErrorBoundary key={textureUrl} onError={onError}>
                <Suspense fallback={null}>
                    <Stage
                        key={mode}
                        environment={null}
                        intensity={0.5}
                        shadows={{ type: 'contact', opacity: 0.6, blur: 1.5, resolution: 256, smooth: false }}
                        adjustCamera={false}
                    >
                        <group position={[0, -0.5, 0]}>
                            <MinecraftCharacter textureUrl={textureUrl} mode={mode} action={action} fbxUrl={fbxUrl} />
                        </group>
                    </Stage>
                </Suspense>
            </PreviewErrorBoundary>
            <OrbitControls
                ref={controlsRef}
                makeDefault
                enableDamping
                enableZoom
                minDistance={MIN_CAMERA_DISTANCE}
                maxDistance={MAX_CAMERA_DISTANCE}
                touches={ORBIT_TOUCHES}
                target={[0, 0, 0]}
                onStart={handleControlsStart}
                onChange={handleControlsChange}
                onEnd={handleControlsEnd}
            />
        </Canvas>
    );
});

export function MCModalPreview({
    textureUrl,
    mode,
    action,
    modelType,
    setMode,
    setAction,
    convertModel,
    onEdit,
    onPrint,
    downloadFilename,
    current,
    fbxUrl,
    setFbxUrl,
}: MCModalPreviewProps) {
    const [isFbxDropdownOpen, setIsFbxDropdownOpen] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    const handlePreviewError = useCallback(() => setPreviewFailed(true), []);
    const handlePreviewRecover = useCallback(() => setPreviewFailed(false), []);
    const previewContainerRef = useRef<HTMLDivElement>(null);
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
            const response = await request(textureUrl);
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
        <div
            ref={previewContainerRef}
            className="w-full aspect-square lg:aspect-auto lg:w-[600px] h-full lg:h-full bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] relative overflow-hidden flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 touch-none select-none"
        >
            <PreviewScene textureUrl={textureUrl} mode={mode} action={action} fbxUrl={fbxUrl} containerRef={previewContainerRef} onError={handlePreviewError} onRecover={handlePreviewRecover} />

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
                            {(['voxel', 'plane', 'cute'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`px-3 py-1.5 text-[10px] font-pixel-hans uppercase transition-all cursor-pointer ${mode === m ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white'}`}
                                >
                                    {m}
                                </button>
                            ))}
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
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-2 pointer-events-auto">
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 flex flex-col lg:flex-row gap-1">
                            {(['idle', 'walk', 'dance'] as const).map((a) => (
                                <button
                                    key={a}
                                    onClick={() => setAction(a)}
                                    className={`px-4 py-1.5 text-[10px] font-pixel-hans text-left transition-all cursor-pointer uppercase ${action === a ? 'bg-white/10 text-[#4ea632]' : 'text-white/40 hover:text-white'}`}
                                >
                                    {a === action && <span className="mr-1 inline-block w-1 h-1 bg-[#4ea632]" />}
                                    {a}
                                </button>
                            ))}
                            {action === 'dance' && (
                                <div className="relative border-t lg:border-t-0 lg:border-l border-white/10 pt-1.5 lg:pt-0 pb-1 lg:pb-0 px-4 lg:px-0 lg:pl-1 mt-1 lg:mt-0 ml-0 lg:ml-1 flex items-center" ref={fbxDropdownRef}>
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

                    {/* Bottom-Right Stack: Edit, Model Type, Print, Download */}
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

                        {onPrint && (
                            <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 min-w-32">
                                <button
                                    type="button"
                                    onClick={onPrint}
                                    className="w-full px-2 py-1.5 bg-[#3c8527] hover:bg-[#4ea632] text-white font-pixel-hans text-[10px] uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-colors group border-none outline-none"
                                >
                                    <Icon icon="pixelarticons:box" className="text-sm shrink-0" />
                                    <span>{current.mcmodal?.print || '3D PRINT'}</span>
                                    <FigurePrintOfferBadge current={current} />
                                </button>
                            </div>
                        )}

                        {/* Download Button */}
                        <div className="bg-black/40 backdrop-blur-md p-1 border border-white/10 w-32">
                            <button
                                onClick={handleDownload}
                                className="w-full px-2 py-1.5 bg-[#38598b] hover:bg-[#4a6bb4] text-white font-pixel-hans text-[10px] uppercase flex items-center justify-center gap-2 transition-all cursor-pointer border-none outline-none"
                                title="Download Texture"
                            >
                                <Icon icon="pixelarticons:download" className="text-sm shrink-0" />
                                <span>DOWNLOAD</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
