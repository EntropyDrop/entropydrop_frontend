import { memo, useLayoutEffect, useRef } from 'react'
import type { Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three'
import type { DISCOVERY_SLOTS, DiscoveryFade } from '../utils/discoveryGeometry'

export const DiscoveryBlock = memo(function DiscoveryBlock({ slot, texture, geometry, registerFade }: {
    slot: (typeof DISCOVERY_SLOTS)[number]
    texture: Texture | null
    geometry: PlaneGeometry
    registerFade: (fade: DiscoveryFade) => () => void
}) {
    const placeholder = useRef<Mesh>(null)
    const material = useRef<MeshBasicMaterial>(null)
    useLayoutEffect(() => {
        if (!placeholder.current) return
        placeholder.current.visible = true
        if (texture && material.current) {
            return registerFade({ material: material.current, placeholder: placeholder.current, elapsed: 0 })
        }
    }, [texture, registerFade])

    const color = slot.slotIndex % 3 === 0 ? '#26372f' : slot.slotIndex % 3 === 1 ? '#2c3340' : '#342f2b'
    return <group position={slot.position} quaternion={slot.quaternion} matrixAutoUpdate={false}
        onUpdate={group => group.updateMatrix()}>
        <mesh ref={placeholder} geometry={geometry}>
            <meshBasicMaterial color={color} transparent opacity={0.28} wireframe={!texture} depthWrite={false} />
        </mesh>
        {texture && <mesh geometry={geometry} position={[0, 0, 0.015]}>
            <meshBasicMaterial ref={material} map={texture} transparent opacity={0} alphaTest={0.01} toneMapped={false} />
        </mesh>}
    </group>
})
