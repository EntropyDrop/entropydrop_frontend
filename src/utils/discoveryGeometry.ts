import { Matrix4, Quaternion, Vector3, type Mesh, type MeshBasicMaterial } from 'three'

export const DISCOVERY_RADIUS = 15
export const DISCOVERY_BLOCK_SIZE = 3
export const DISCOVERY_SLOT_COUNT = 180

const origin = new Vector3()
const up = new Vector3(0, 1, 0)
export const DISCOVERY_SLOTS = Array.from({ length: DISCOVERY_SLOT_COUNT }, (_, slotIndex) => {
    const t = (slotIndex % 30) / 29
    const theta = t * Math.PI * 4 + Math.floor(slotIndex / 30) * Math.PI / 3
    const phi = Math.PI / 18 + t * Math.PI * 8 / 9
    const position = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
        .multiplyScalar(DISCOVERY_RADIUS)
    // A Group's positive Z points at the origin. Bake it once for static slots.
    const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(origin, position, up))
    return { slotIndex, position, quaternion }
})

export type DiscoveryFade = { material: MeshBasicMaterial; placeholder: Mesh; elapsed: number }

export function advanceDiscoveryFades(fades: Set<DiscoveryFade>, delta: number) {
    for (const fade of fades) {
        fade.elapsed = Math.min(0.5, fade.elapsed + delta)
        const opacity = fade.elapsed / 0.5
        fade.material.opacity = opacity
        const placeholderMaterial = fade.placeholder.material as MeshBasicMaterial
        placeholderMaterial.opacity = 0.28 * (1 - opacity)
        if (opacity === 1) {
            // Stop submitting a second plane once this thumbnail has appeared.
            fade.placeholder.visible = false
            fades.delete(fade)
        }
    }
}

export function cameraSmoothing(delta: number) {
    return 1 - Math.pow(0.92, delta * 60)
}
