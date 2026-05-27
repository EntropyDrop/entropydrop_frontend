import { useRef, useMemo, useEffect, useCallback, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { 
    Vector3, 
    Group, 
    Quaternion, 
    Matrix4, 
    CanvasTexture, 
    NearestFilter, 
    DoubleSide, 
    Mesh,
    type Texture 
} from 'three'
import { Skin2D } from './utils'
import { apiFetch } from '../utils/api'
import type { GenerationLogItemBrief } from '../types/log'

const DISCOVERY_SKIN_PREVIEW_SCALE = 4

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
    const focusedPosition = useRef<Vector3 | null>(null)
    const selectionTimeout = useRef<any>(null)
    const [loadedItems, setLoadedItems] = useState<{ log: GenerationLogItemBrief; tex: CanvasTexture; slotIndex: number }[]>([])
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
                const indices = Array.from({ length: 180 }, (_, i) => i);
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }

                const CONCURRENCY = 8;
                const BATCH_SIZE = 3;
                let loadedBuffer: { log: GenerationLogItemBrief; tex: CanvasTexture; slotIndex: number }[] = [];

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
                for (let i = 0; i < data.length; i += CONCURRENCY) {
                    if (!active) break;
                    const chunk = data.slice(i, i + CONCURRENCY);

                    await Promise.all(chunk.map(async (log, chunkIdx) => {
                        const slotIndex = indices[(i + chunkIdx) % indices.length];
                        try {
                            const canvas = await Skin2D(log.result, { scale: DISCOVERY_SKIN_PREVIEW_SCALE });
                            if (!active) return;
                            const tex = new CanvasTexture(canvas);
                            tex.magFilter = NearestFilter;
                            tex.minFilter = NearestFilter;
                            tex.generateMipmaps = false;
                            textures.add(tex);

                            loadedBuffer.push({ log, tex, slotIndex });

                            if (loadedBuffer.length >= BATCH_SIZE) {
                                updateState();
                            }
                        } catch (err) {
                            if (!active) return;
                            console.warn("Failed to load skin for", log.result, err);
                        }
                    }));

                    // Small delay to keep the UI responsive during intensive rendering
                    await new Promise(resolve => setTimeout(resolve, 30));
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
            onSelect({ id, result: '', is_public: true, timestamp: '' } as any);
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
    const radius = 15
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

    // Create data for blocks in a spherical spiral
    const blocks = useMemo(() => {
        return loadedItems.map((item) => {
            const position = getSpiralPosition(item.slotIndex, radius);
            const size = 3;

            // Use a seeded random for rotation speed to keep it stable
            const seed = item.log.id;
            const seededRandom = () => {
                let hash = 0;
                for (let j = 0; j < seed.length; j++) {
                    hash = seed.charCodeAt(j) + ((hash << 5) - hash);
                }
                return (Math.abs(hash) % 1000) / 1000;
            };

            return {
                position,
                size,
                rotationSpeed: seededRandom() * 0.02,
                texture: item.tex,
                data: item.log
            };
        });
    }, [loadedItems])

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



    const handleSceneClick = (e: any) => {
        e.stopPropagation()
        const ray = e.ray
        let minDistanceSq = Infinity
        let nearestBlock = null

        for (const block of blocks) {
            const distSq = ray.distanceSqToPoint(block.position)
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq
                nearestBlock = block
            }
        }

        if (dragDistance.current > 10) return

        if (nearestBlock) {
            if (selected) {
                // closeModal()
            } else if (focusedPosition.current && focusedPosition.current.equals(nearestBlock.position)) {
                // closeModal()
            } else {
                focusedPosition.current = nearestBlock.position
                if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
                selectionTimeout.current = setTimeout(() => {
                    if (onSelect) onSelect(nearestBlock.data)
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
            {blocks.map((block, i) => (
                <Block
                    key={`${block.data.id}-${i}`}
                    {...block}
                />
            ))}
        </group >
    )
}


function Block({ position, size, texture }: {
    position: Vector3,
    size: number,
    texture: Texture
}) {
    const meshRef = useRef<Mesh>(null!)
    const [opacity, setOpacity] = useState(0)

    useEffect(() => {
        // Fade in
        const duration = 500
        const start = performance.now()
        let frameId: number

        const animate = (time: number) => {
            const progress = Math.min((time - start) / duration, 1)
            setOpacity(progress)
            if (progress < 1) {
                frameId = requestAnimationFrame(animate)
            }
        }
        frameId = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frameId)
    }, [])

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.lookAt(0, 0, 0)
        }
    })

    return (
        <mesh
            ref={meshRef}
            position={position}
        >
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial
                map={texture}
                transparent={true}
                opacity={opacity}
            />
        </mesh>
    )
}
