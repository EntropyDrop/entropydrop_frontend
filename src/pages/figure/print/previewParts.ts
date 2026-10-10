import * as THREE from 'three'
import type { FigurePart } from './figureEngine'

export function createPreviewPart(part: FigurePart) {
    const content = new THREE.Group()
    const meshes = part.meshes.map(({ geometry }) => {
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
        const hasColor = !!geometry.getAttribute('color')
        const material = new THREE.MeshLambertMaterial({
            vertexColors: hasColor,
            ...(hasColor ? {} : { color: '#ffffff' }),
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = true
        mesh.receiveShadow = true
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
