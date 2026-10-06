import { useRef, useMemo, useEffect, useCallback, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
    Vector3,
    Group,
    Quaternion,
    Matrix4,
    CanvasTexture,
    NearestFilter,
    DoubleSide,
    PlaneGeometry,
    SRGBColorSpace,
    PerspectiveCamera
} from 'three'
import { Skin2D } from './utils'
import { DiscoveryBlock } from './DiscoveryBlock'
import { DISCOVERY_RADIUS, DISCOVERY_BLOCK_SIZE, DISCOVERY_SLOT_COUNT, DISCOVERY_SLOTS,
    advanceDiscoveryFades, cameraSmoothing, type DiscoveryFade } from '../utils/discoveryGeometry'
import type { GenerationLogItemBrief } from '../types/log'

const DISCOVERY_SKIN_PREVIEW_SCALE = 4
const DISCOVERY_INITIAL_ITEM_COUNT = 24
const DISCOVERY_LOAD_CONCURRENCY = 6
const DISCOVERY_BATCH_SIZE = 2
const DISCOVERY_LOAD_DELAY_MS = 70
const DISCOVERY_BACKGROUND_LOAD_DELAY_MS = 350

type LoadedDiscoveryItem = {
    log: GenerationLogItemBrief
    tex: CanvasTexture
    slotIndex: number
}

export function Discovery({
    items,
    selected,
    onSelect,
    onLoading,
    reducedMotion = false
}: {
    items: GenerationLogItemBrief[] | null,
    selected?: GenerationLogItemBrief | null,
    onSelect?: (item: GenerationLogItemBrief | null) => void,
    onLoading?: (isLoading: boolean) => void,
    reducedMotion?: boolean
}) {
    const groupRef = useRef<Group>(null!)
    const gl = useThree((state) => state.gl)
    const camera = useThree((state) => state.camera)
    const invalidate = useThree((state) => state.invalidate)
    const geometry = useMemo(() => new PlaneGeometry(DISCOVERY_BLOCK_SIZE, DISCOVERY_BLOCK_SIZE), [])
    const fades = useRef(new Set<DiscoveryFade>())
    const registerFade = useCallback((fade: DiscoveryFade) => {
        fades.current.add(fade)
        invalidate()
        return () => { fades.current.delete(fade) }
    }, [invalidate])
    useEffect(() => () => geometry.dispose(), [geometry])
    const { width } = useThree((state) => state.size)

    useEffect(() => {
        if (camera instanceof PerspectiveCamera) {
            // Mobile viewports (width < 768px) get a larger FOV (e.g. 95)
            // Desktop/larger viewports get the default 75
            const targetFov = width < 768 ? 95 : 75
            if (camera.fov !== targetFov) {
                Object.assign(camera, { fov: targetFov })
                camera.updateProjectionMatrix()
            }
        }
    }, [camera, width])

    const focusedPosition = useRef<Vector3 | null>(null)
    const selectionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [loadedState, setLoadedState] = useState<{
        source: GenerationLogItemBrief[] | null; data: LoadedDiscoveryItem[]
    }>({ source: null, data: [] })
    const selectedRef = useRef(selected)
    const onLoadingRef = useRef(onLoading)

    useEffect(() => {
        selectedRef.current = selected
        onLoadingRef.current = onLoading
    }, [selected, onLoading])

    useEffect(() => {
        if (!selected) focusedPosition.current = null;
        invalidate()
    }, [selected, invalidate])

    useEffect(() => {
        let active = true;
        let backgroundLoadId: number | null = null;
        let backgroundLoadUsesIdleCallback = false;
        const idleWindow = window as unknown as {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        const textures = new Set<CanvasTexture>();
        onLoadingRef.current?.(true);

        if (items === null) {
            return () => onLoadingRef.current?.(false);
        }

        void (async () => {
            if (!active) return;

            // Shuffle slots
            const indices = Array.from({ length: DISCOVERY_SLOT_COUNT }, (_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            const queuedItems = items
                .slice(0, DISCOVERY_SLOT_COUNT)
                .map((log, index) => ({ log, slotIndex: indices[index] }))
                // The first thumbnails should be in the initial camera view (+X).
                .sort((a, b) => DISCOVERY_SLOTS[b.slotIndex].position.x - DISCOVERY_SLOTS[a.slotIndex].position.x);
            let loadedBuffer: LoadedDiscoveryItem[] = [];

            const updateState = () => {
                if (active && loadedBuffer.length > 0) {
                    // React may defer the updater until after this buffer is cleared.
                    const batch = loadedBuffer;
                    loadedBuffer = [];
                    setLoadedState(state => {
                        const prev = state.source === items ? state.data : [];
                        const currentIds = new Set(prev.map(p => p.log.id));
                        const newItems = batch.filter(item => !currentIds.has(item.log.id));
                        if (newItems.length === 0) return state;
                        return { source: items, data: [...prev, ...newItems] };
                    });
                }
            };

            const loadItems = async (items: typeof queuedItems) => {
                for (let i = 0; i < items.length; i += DISCOVERY_LOAD_CONCURRENCY) {
                    if (!active) break;

                    // Keep texture decoding and canvas rendering from competing
                    // with interactions inside the detail modal.
                    while (active && (selectedRef.current || document.hidden)) {
                        await new Promise(resolve => window.setTimeout(resolve, 100));
                    }
                    if (!active) break;

                    const chunk = items.slice(i, i + DISCOVERY_LOAD_CONCURRENCY);

                    await Promise.all(chunk.map(async ({ log, slotIndex }) => {
                        try {
                            const canvas = await Skin2D(log.result, { scale: DISCOVERY_SKIN_PREVIEW_SCALE });
                            if (!active) return;
                            const tex = new CanvasTexture(canvas);
                            tex.magFilter = NearestFilter;
                            tex.minFilter = NearestFilter;
                            tex.generateMipmaps = false;
                            tex.colorSpace = SRGBColorSpace;
                            textures.add(tex);

                            loadedBuffer.push({ log, tex, slotIndex });

                            if (loadedBuffer.length >= DISCOVERY_BATCH_SIZE) {
                                updateState();
                            }
                        } catch (err) {
                            if (!active) return;
                            console.warn("Failed to load skin for", log.result, err);
                        }
                    }));

                    if (active && i + DISCOVERY_LOAD_CONCURRENCY < items.length) {
                        await new Promise(resolve => window.setTimeout(resolve, DISCOVERY_LOAD_DELAY_MS));
                    }
                }

                updateState();
            };

            const initialItems = queuedItems.slice(0, DISCOVERY_INITIAL_ITEM_COUNT);
            const remainingItems = queuedItems.slice(DISCOVERY_INITIAL_ITEM_COUNT);

            await loadItems(initialItems);
            if (!active) return;
            onLoadingRef.current?.(false);

            if (remainingItems.length === 0) return;

            const loadRemainingItems = () => {
                backgroundLoadId = null;
                if (active) void loadItems(remainingItems);
            };

            if (idleWindow.requestIdleCallback) {
                backgroundLoadUsesIdleCallback = true;
                backgroundLoadId = idleWindow.requestIdleCallback(loadRemainingItems, { timeout: 1200 });
            } else {
                backgroundLoadId = window.setTimeout(
                    loadRemainingItems,
                    DISCOVERY_BACKGROUND_LOAD_DELAY_MS
                );
            }
        })()
            .catch(err => {
                if (!active) return;
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error("Discovery texture loading failed:", err);
                onLoadingRef.current?.(false);
            });

        return () => {
            active = false;
            if (backgroundLoadId !== null) {
                if (backgroundLoadUsesIdleCallback && idleWindow.cancelIdleCallback) {
                    idleWindow.cancelIdleCallback(backgroundLoadId);
                } else {
                    window.clearTimeout(backgroundLoadId);
                }
            }
            onLoadingRef.current?.(false);
            textures.forEach(texture => texture.dispose());
            textures.clear();
        };
    }, [items])

    // Spherical coordinates for camera look direction
    const targetSpherical = useRef({ theta: Math.PI / 2, phi: Math.PI / 2 })
    const targetQuaternion = useRef(new Quaternion())
    const lookAtMatrix = useRef(new Matrix4())
    const lookAtTarget = useRef(new Vector3())
    const lookAtDir = useRef(new Vector3())

    // Drag state
    const isDragging = useRef(false)
    const lastPointer = useRef({ x: 0, y: 0 })
    const dragSensitivity = 0.003
    const autoRotateSpeed = 0.048
    const dragDistance = useRef(0)

    // Convert spherical to a lookAt point on a unit sphere
    const sphericalToVec3 = useCallback((theta: number, phi: number, out: Vector3) => {
        out.set(
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.cos(theta)
        )
        return out
    }, [])

    // Pointer event handlers
    useEffect(() => {
        const dom = gl.domElement

        const onPointerDown = (e: PointerEvent) => {
            isDragging.current = true
            dragDistance.current = 0
            lastPointer.current = { x: e.clientX, y: e.clientY }
            dom.setPointerCapture(e.pointerId)
            invalidate()
        }

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging.current) return
            const dx = e.clientX - lastPointer.current.x
            const dy = e.clientY - lastPointer.current.y
            dragDistance.current += Math.sqrt(dx * dx + dy * dy)
            lastPointer.current = { x: e.clientX, y: e.clientY }

            // Clear focus when user drags
            if (focusedPosition.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
                focusedPosition.current = null
            }

            targetSpherical.current.theta += dx * dragSensitivity
            targetSpherical.current.phi -= dy * dragSensitivity

            invalidate()

            // Clamp phi to avoid flipping (keep between 0.1 and PI-0.1)
            targetSpherical.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, targetSpherical.current.phi))
        }

        const onPointerUp = (e: PointerEvent) => {
            isDragging.current = false
            if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId)
        }

        dom.addEventListener('pointerdown', onPointerDown)
        dom.addEventListener('pointermove', onPointerMove)
        dom.addEventListener('pointerup', onPointerUp)
        dom.addEventListener('pointercancel', onPointerUp)

        return () => {
            if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
            dom.removeEventListener('pointerdown', onPointerDown)
            dom.removeEventListener('pointermove', onPointerMove)
            dom.removeEventListener('pointerup', onPointerUp)
            dom.removeEventListener('pointercancel', onPointerUp)
        }
    }, [gl, invalidate])

    // Create all placeholder slots immediately, then fill them as textures finish rendering.
    const blocks = useMemo(() => {
        const loadedItems = loadedState.source === items ? loadedState.data : [];
        const loadedBySlot = new Map(loadedItems.map(item => [item.slotIndex, item]));

        return DISCOVERY_SLOTS.map(slot => {
            const { slotIndex } = slot;
            const item = loadedBySlot.get(slotIndex);
            return {
                slotIndex,
                slot,
                position: slot.position,
                texture: item?.tex ?? null,
                data: item?.log ?? null
            };
        });
    }, [loadedState, items])

    // We don't need the raw texture loader here anymore since we use rendered texture from Skin2D

    const firstRun = useRef(true)
    useFrame((_, frameDelta) => {
        const delta = Math.min(frameDelta, 0.05)
        advanceDiscoveryFades(fades.current, delta)
        if (!groupRef.current) return

        // If focused on a block, compute target spherical from block position
        if (focusedPosition.current) {
            const dir = lookAtDir.current.copy(focusedPosition.current)
                .applyMatrix4(groupRef.current.matrixWorld).sub(camera.position).normalize()
            // Convert direction to spherical
            const focusTheta = Math.atan2(dir.x, dir.z)
            const focusPhi = Math.acos(Math.max(-1, Math.min(1, dir.y)))
            targetSpherical.current.theta = focusTheta
            targetSpherical.current.phi = focusPhi
        } else if (!isDragging.current && !reducedMotion) {
            // Auto-rotate slowly when not dragging and not focused
            targetSpherical.current.theta += autoRotateSpeed * delta
        }

        // Calculate target look direction vector from targetSpherical
        sphericalToVec3(targetSpherical.current.theta, targetSpherical.current.phi, lookAtDir.current)

        // Set target position
        lookAtTarget.current.copy(camera.position).add(lookAtDir.current)

        // Create rotation matrix looking at target
        lookAtMatrix.current.lookAt(camera.position, lookAtTarget.current, camera.up)

        // Extract target quaternion
        targetQuaternion.current.setFromRotationMatrix(lookAtMatrix.current)

        // Slerp current camera quaternion toward target
        camera.quaternion.slerp(targetQuaternion.current, firstRun.current ? 1.0 : cameraSmoothing(delta))
        firstRun.current = false
        if (reducedMotion && (fades.current.size > 0 || camera.quaternion.angleTo(targetQuaternion.current) > 0.0001)) {
            invalidate()
        }
    })



    const handleSceneClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        const ray = e.ray
        let minDistanceSq = Infinity
        let nearestBlock: (typeof blocks)[number] | null = null

        for (const block of blocks) {
            if (!block.data) continue
            const distSq = ray.distanceSqToPoint(block.position)
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq
                nearestBlock = block
            }
        }

        if (dragDistance.current > 10) return

        if (nearestBlock?.data) {
            const selectedPosition = nearestBlock.position
            const selectedData = nearestBlock.data

            if (selected) {
                // closeModal()
            } else if (focusedPosition.current && focusedPosition.current.equals(selectedPosition)) {
                // closeModal()
            } else {
                focusedPosition.current = selectedPosition
                invalidate()
                if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
                selectionTimeout.current = setTimeout(() => {
                    if (onSelect) onSelect(selectedData)
                    selectionTimeout.current = null
                }, 200)
            }
        }
    }

    return (
        <group ref={groupRef}>
            {/* Background sphere to capture clicks anywhere */}
            <mesh onClick={handleSceneClick}>
                <sphereGeometry args={[DISCOVERY_RADIUS * 2, 16, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
            </mesh>
            {blocks.map((block) => (
                <DiscoveryBlock key={block.slotIndex} slot={block.slot} texture={block.texture}
                    geometry={geometry} registerFade={registerFade} />
            ))}
        </group >
    )
}
