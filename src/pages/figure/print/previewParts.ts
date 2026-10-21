import * as THREE from 'three'
import type { FigurePart } from './figureEngine'

export function createPreviewPart(part: FigurePart) {
    const content = new THREE.Group()
    const colors: { geometry: THREE.BufferGeometry; printed: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; voxel: THREE.BufferAttribute | THREE.InterleavedBufferAttribute }[] = []
    const meshes = part.meshes.map(({ geometry: source }) => {
        // Each viewport owns its color binding; never mutate shared export data.
        const geometry = source.hasAttribute('voxelColor') ? source.clone() : source
        if (geometry !== source) colors.push({ geometry, printed: geometry.getAttribute('color'), voxel: geometry.getAttribute('voxelColor') })
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
    return {
        part, pivot, meshes, initialPosition: pivot.position.clone(),
        setVoxelMode(value: boolean) {
            colors.forEach(({ geometry, printed, voxel }) => geometry.setAttribute('color', value ? voxel : printed))
        },
        dispose() {
            meshes.forEach(mesh => mesh.material.dispose())
            colors.forEach(({ geometry, printed }) => {
                // Keep both color buffers attached so Three can release either
                // mode's GPU allocation, including one switched out of view.
                geometry.setAttribute('color', printed)
                geometry.dispose()
            })
        },
    }
}
