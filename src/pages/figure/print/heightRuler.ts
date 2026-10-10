import * as THREE from 'three'
import { MODEL_MM_PER_UNIT } from '../../../lib/minefigure/shared/assemblySettings.js'

/** Project a fixed 70 mm reference into the preview, using the STL export scale. */
export function projectHeightRuler(bounds: THREE.Box3, baseY: number, camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (bounds.isEmpty() || width <= 0 || height <= 0) return null
    camera.updateMatrixWorld()
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    right.y = 0
    right.normalize()
    const size = bounds.getSize(new THREE.Vector3())
    // Keep the ruler beside the model at its depth, facing the current camera.
    const offset = (Math.abs(right.x) * size.x + Math.abs(right.z) * size.z) / 2 + 2
    const base = bounds.getCenter(new THREE.Vector3()).addScaledVector(right, offset)
    base.y = baseY
    const ticks = Array.from({ length: 15 }, (_, index) => {
        const point = base.clone().add(new THREE.Vector3(0, index * 5 / MODEL_MM_PER_UNIT, 0)).project(camera)
        return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, z: point.z, major: index % 2 === 0 }
    })
    if (ticks.some(point => !Number.isFinite(point.x + point.y + point.z) || point.z < -1 || point.z > 1)) return null
    const start = ticks[0], end = ticks[ticks.length - 1]
    const path = [`M${start.x},${start.y}L${end.x},${end.y}`,
        ...ticks.map(point => `M${point.x},${point.y}h${point.major ? 10 : 5}`)].join(' ')
    return { path, labels: ticks.filter(point => point.major).map(point => ({ x: point.x + 14, y: point.y })) }
}
