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
    type Texture,
    PerspectiveCamera
} from 'three'
import { Skin2D } from './utils'
import { apiFetch } from '../utils/api'
import type { GenerationLogItemBrief } from '../types/log'

const DISCOVERY_SKIN_PREVIEW_SCALE = 4
const DISCOVERY_SLOT_COUNT = 180
const DISCOVERY_LOAD_CONCURRENCY = 6
const DISCOVERY_BATCH_SIZE = 2
const DISCOVERY_LOAD_DELAY_MS = 70
const DISCOVERY_BLOCK_SIZE = 3
const DISCOVERY_RADIUS = 15

type LoadedDiscoveryItem = {
    log: GenerationLogItemBrief
    tex: CanvasTexture
    slotIndex: number
}

function getSpiralPosition(n: number, radius: number): Vector3 {
    const offsets = [0, Math.PI / 3, Math.PI / 3 * 2, Math.PI, Math.PI / 3 * 4, Math.PI / 3 * 5]
    const count = 30
    const offsetIdx = Math.floor(n / count)
    const i = n % count
    const offset = offsets[offsetIdx % offsets.length]

    const t = i / (count - 1)
    const theta = t * Math.PI * 2 * 2 + offset
    const phiMin = Math.PI * (10 / 180)
    const phiMax = Math.PI * (170 / 180)
    const phi = phiMin + t * (phiMax - phiMin)

    const x = Math.sin(phi) * Math.cos(theta) * radius
    const y = Math.cos(phi) * radius
    const z = Math.sin(phi) * Math.sin(theta) * radius
    return new Vector3(x, y, z)
}

export function Discovery({
    selected,
    onSelect,
    onLoading
}: {
    selected?: GenerationLogItemBrief | null,
    onSelect?: (item: GenerationLogItemBrief | null) => void,
    onLoading?: (isLoading: boolean) => void
}) {
    const groupRef = useRef<Group>(null!)
    const gl = useThree((state) => state.gl)
    const camera = useThree((state) => state.camera)
    const { width } = useThree((state) => state.size)

    useEffect(() => {
        if (camera instanceof PerspectiveCamera) {
            // Mobile viewports (width < 768px) get a larger FOV (e.g. 95)
            // Desktop/larger viewports get the default 75
            const targetFov = width < 768 ? 95 : 75
            if (camera.fov !== targetFov) {
                camera.fov = targetFov
                camera.updateProjectionMatrix()
            }
        }
    }, [camera, width])

    const focusedPosition = useRef<Vector3 | null>(null)
    const selectionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [loadedItems, setLoadedItems] = useState<LoadedDiscoveryItem[]>([])
    const isFirstRun = useRef(true);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        if (!selected) {
            focusedPosition.current = null;
            url.searchParams.delete('id');
        } else {
            url.searchParams.set('id', selected.id);
        }
        window.history.replaceState({}, '', url.toString());
    }, [selected])

    useEffect(() => {
        let active = true;
        const textures = new Set<CanvasTexture>();
        onLoading?.(true);

        apiFetch('/api/discovery')
            .then(res => res.json())
            .then(async (data: GenerationLogItemBrief[]) => {
                if (!active) return;

                // Shuffle slots
                const indices = Array.from({ length: DISCOVERY_SLOT_COUNT }, (_, i) => i);
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }

                const queuedItems = data
                    .slice(0, DISCOVERY_SLOT_COUNT)
                    .map((log, index) => ({ log, slotIndex: indices[index] }));
                let loadedBuffer: LoadedDiscoveryItem[] = [];

                const updateState = () => {
                    if (loadedBuffer.length > 0) {
                        setLoadedItems(prev => {
                            const currentIds = new Set(prev.map(p => p.log.id));
                            const newItems = loadedBuffer.filter(item => !currentIds.has(item.log.id));
                            if (newItems.length === 0) return prev;
                            return [...prev, ...newItems];
                        });
                        loadedBuffer = [];
                    }
                };

                // Load items in chunks to control concurrency
                for (let i = 0; i < queuedItems.length; i += DISCOVERY_LOAD_CONCURRENCY) {
                    if (!active) break;
                    const chunk = queuedItems.slice(i, i + DISCOVERY_LOAD_CONCURRENCY);

                    await Promise.all(chunk.map(async ({ log, slotIndex }) => {
                        try {
                            const canvas = await Skin2D(log.result, { scale: DISCOVERY_SKIN_PREVIEW_SCALE });
                            if (!active) return;
                            const tex = new CanvasTexture(canvas);
                            tex.magFilter = NearestFilter;
                            tex.minFilter = NearestFilter;
                            tex.generateMipmaps = false;
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

                    // Small delay to keep the UI responsive during intensive rendering
                    if (active && i + DISCOVERY_LOAD_CONCURRENCY < queuedItems.length) {
                        await new Promise(resolve => setTimeout(resolve, DISCOVERY_LOAD_DELAY_MS));
                    }
                }

                updateState();
                onLoading?.(false);
            })
            .catch(err => {
                if (!active) return;
                console.error("Discovery fetch failed:", err);
                onLoading?.(false);
            });

        return () => {
            active = false;
            onLoading?.(false);
            textures.forEach(texture => texture.dispose());
            textures.clear();
        };
    }, [onLoading])

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('id');
        if (id && onSelect) {
            onSelect({ id, result: '', is_public: true, prompt: '' });
        }
    }, [onSelect])

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
    const autoRotateSpeed = 0.0008
    const radius = DISCOVERY_RADIUS
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

            // Clamp phi to avoid flipping (keep between 0.1 and PI-0.1)
            targetSpherical.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, targetSpherical.current.phi))
        }

        const onPointerUp = (e: PointerEvent) => {
            isDragging.current = false
            dom.releasePointerCapture(e.pointerId)
        }

        dom.addEventListener('pointerdown', onPointerDown)
        dom.addEventListener('pointermove', onPointerMove)
        dom.addEventListener('pointerup', onPointerUp)

        return () => {
            if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
            dom.removeEventListener('pointerdown', onPointerDown)
            dom.removeEventListener('pointermove', onPointerMove)
            dom.removeEventListener('pointerup', onPointerUp)
        }
    }, [gl])

    // Create all placeholder slots immediately, then fill them as textures finish rendering.
    const blocks = useMemo(() => {
        const loadedBySlot = new Map(loadedItems.map(item => [item.slotIndex, item]));

        return Array.from({ length: DISCOVERY_SLOT_COUNT }, (_, slotIndex) => {
            const item = loadedBySlot.get(slotIndex);
            return {
                slotIndex,
                position: getSpiralPosition(slotIndex, radius),
                size: DISCOVERY_BLOCK_SIZE,
                texture: item?.tex ?? null,
                data: item?.log ?? null
            };
        });
    }, [loadedItems, radius])

    // We don't need the raw texture loader here anymore since we use rendered texture from Skin2D

    const firstRun = useRef(true)
    useFrame(() => {
        if (!groupRef.current) return

        // If focused on a block, compute target spherical from block position
        if (focusedPosition.current) {
            const worldPos = focusedPosition.current.clone().applyMatrix4(groupRef.current.matrixWorld)
            const dir = worldPos.clone().sub(camera.position).normalize()
            // Convert direction to spherical
            const focusTheta = Math.atan2(dir.x, dir.z)
            const focusPhi = Math.acos(Math.max(-1, Math.min(1, dir.y)))
            targetSpherical.current.theta = focusTheta
            targetSpherical.current.phi = focusPhi
        } else if (!isDragging.current) {
            // Auto-rotate slowly when not dragging and not focused
            targetSpherical.current.theta += autoRotateSpeed
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
        camera.quaternion.slerp(targetQuaternion.current, firstRun.current ? 1.0 : 0.08)
        firstRun.current = false
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
                <sphereGeometry args={[radius * 2, 16, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
            </mesh>
            {blocks.map((block) => (
                <Block
                    key={block.slotIndex}
                    {...block}
                />
            ))}
        </group >
    )
}


function Block({ position, size, texture, slotIndex }: {
    position: Vector3,
    size: number,
    texture: Texture | null,
    slotIndex: number
}) {
    const groupRef = useRef<Group>(null!)
    const [loadedOpacity, setLoadedOpacity] = useState(0)

    useEffect(() => {
        if (!texture) {
            return
        }

        const duration = 500
        const start = performance.now()
        let frameId: number

        const animate = (time: number) => {
            const progress = Math.min((time - start) / duration, 1)
            setLoadedOpacity(progress)
            if (progress < 1) {
                frameId = requestAnimationFrame(animate)
            }
        }
        frameId = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frameId)
    }, [texture])

    useFrame(() => {
        if (groupRef.current) {
            groupRef.current.lookAt(0, 0, 0)
        }
    })

    const placeholderOpacity = texture ? Math.max(0.06, 0.28 * (1 - loadedOpacity)) : 0.28
    const placeholderColor = slotIndex % 3 === 0 ? '#26372f' : slotIndex % 3 === 1 ? '#2c3340' : '#342f2b'

    return (
        <group
            ref={groupRef}
            position={position}
        >
            <mesh>
                <planeGeometry args={[size, size]} />
                <meshBasicMaterial
                    color={placeholderColor}
                    transparent
                    opacity={placeholderOpacity}
                    wireframe={!texture}
                />
            </mesh>
            {texture && (
                <mesh position={[0, 0, 0.015]}>
                    <planeGeometry args={[size, size]} />
                    <meshStandardMaterial
                        map={texture}
                        transparent
                        opacity={loadedOpacity}
                    />
                </mesh>
            )}
        </group>
    )
}
