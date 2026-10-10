import * as THREE from 'three'
import type { FigurePart } from './figureEngine'

export function createPreviewPart(part: FigurePart) {
    const content = new THREE.Group()
    const meshes = part.meshes.map(({ geometry }) => {
        const material = new THREE.MeshBasicMaterial({ vertexColors: !!geometry.getAttribute('color'), toneMapped: false })
        const mesh = new THREE.Mesh(geometry, material)
        content.add(mesh)
        return mesh
    })
    const center = new THREE.Box3().setFromObject(content).getCenter(new THREE.Vector3())
    const pivot = new THREE.Group()
    // Geometry contains the assembled offsets. Move the pivot, not the shared STL geometry.
    content.position.copy(center).negate()
    pivot.position.copy(center).add(new THREE.Vector3(...part.position))
    pivot.add(content)
    return { part, pivot, meshes, initialPosition: pivot.position.clone() }
}
