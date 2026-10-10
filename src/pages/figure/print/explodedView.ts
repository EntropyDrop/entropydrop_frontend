import * as THREE from 'three'
import { assemblySockets, MODEL_MM_PER_UNIT, normalizeAssemblySettings, type HoleId } from '../../../lib/minefigure/shared/assemblySettings.js'
import { cuteModelPose } from '../../../lib/minefigure/web_model/src/mcModel/cute'
import type { FigurePart, PrintPartId } from './figureEngine'
import { createPreviewPart } from './previewParts'
import { DEFAULT_PRINT_MODEL, getPrintModelProfile, type PrintModelType } from './figureModels'

export type AssemblyLabel = PrintPartId | 'leftHipJoint' | 'rightHipJoint' | 'leftShoulderJoint' | 'rightShoulderJoint' | 'leftTube' | 'rightTube'
export interface AssemblyItem {
    key: string
    label: AssemblyLabel
    pivot: THREE.Group
    meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]
    assembled: THREE.Vector3
    exploded: THREE.Vector3
    explodedRotation: THREE.Quaternion
    explodedOnly: boolean
    tubeLengthMm?: number
}
interface Socket { item: AssemblyItem; anchor: THREE.Vector3; normal: THREE.Vector3 }

const PART_INDICES = { head: 0, torso: 1, leftArm: 2, rightArm: 3, leftLeg: 4, rightLeg: 5 } as const
const UP = new THREE.Vector3(0, 1, 0)
// The two clip halves are mirrored and rotated 145° in buildConnector.
const CONNECTOR_AXIS = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(17.5)), Math.cos(THREE.MathUtils.degToRad(17.5)), 0)
export const ARM_TUBE_OUTER_DIAMETER_MM = 4
export const ARM_TUBE_LENGTH_MM = 12

function socketPosition(socket: Socket, exploded: boolean) {
    return socket.anchor.clone().add(exploded ? socket.item.exploded : socket.item.assembled)
}

/** Separate preview instances own their poses/materials, never the exported STL geometry. */
export function createAssemblyPreview(parts: FigurePart[], isSlim: boolean, modelType: PrintModelType = DEFAULT_PRINT_MODEL) {
    const items: AssemblyItem[] = parts.map(part => {
        const preview = createPreviewPart(part)
        return { key: part.id, label: part.id as PrintPartId, pivot: preview.pivot, meshes: preview.meshes,
            assembled: preview.initialPosition, exploded: preview.initialPosition.clone(),
            explodedRotation: new THREE.Quaternion(), explodedOnly: false }
    })
    const byId = new Map(items.map(item => [item.key, item]))
    const { modelScale } = getPrintModelProfile(modelType)
    const settings = normalizeAssemblySettings({}, true, modelScale)
    const sockets = new Map<HoleId, Socket>()
    for (const [id, index] of Object.entries(PART_INDICES)) {
        const item = byId.get(id)
        const part = parts.find(part => part.id === id)
        if (!item || !part) continue
        const pose = cuteModelPose(index, isSlim, modelScale)
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.rotationX)
        for (const socket of assemblySockets(index, settings, isSlim, true, modelScale)) {
            const depth = settings.holeDepths[socket.id] / MODEL_MM_PER_UNIT
            const normal = new THREE.Vector3(...socket.normal)
            const surface = new THREE.Vector3(...socket.center).addScaledVector(normal, depth - socket.length / 2)
                .applyQuaternion(rotation).add(new THREE.Vector3(...pose.position)).add(new THREE.Vector3(...part.position))
            sockets.set(socket.id, { item, anchor: surface.sub(item.assembled), normal: normal.applyQuaternion(rotation) })
        }
    }
    byId.get('head')?.exploded.add(new THREE.Vector3(0, 0, 9 * modelScale))
    byId.get('leftLeg')?.exploded.add(new THREE.Vector3(0, 2 * modelScale, -8 * modelScale))
    byId.get('rightLeg')?.exploded.add(new THREE.Vector3(0, -2 * modelScale, -8 * modelScale))
    for (const [id, hole] of [['leftArm', 'torsoLeftArm'], ['rightArm', 'torsoRightArm']] as const) {
        const normal = sockets.get(hole)?.normal
        if (normal) byId.get(id)?.exploded.addScaledVector(normal, 8 * modelScale)
    }

    // Reuse one printable short-joint geometry for hips and cute10 shoulders.
    const shortPart = parts.find(part => part.id === 'shortConnector')
    const leftJoint = byId.get('shortConnector')
    if (shortPart && leftJoint) {
        leftJoint.label = 'leftHipJoint'
        const extraJoints = modelType === 'cute10'
            ? ['rightHipJoint', 'leftShoulderJoint', 'rightShoulderJoint'] as const
            : ['rightHipJoint'] as const
        for (const key of extraJoints) {
            const preview = createPreviewPart(shortPart)
            const joint: AssemblyItem = { key, label: key, pivot: preview.pivot, meshes: preview.meshes,
                assembled: preview.initialPosition, exploded: preview.initialPosition.clone(), explodedRotation: new THREE.Quaternion(), explodedOnly: true }
            items.push(joint)
            byId.set(key, joint)
        }
    }
    const ownedGeometries: THREE.BufferGeometry[] = []
    const connections: { from: Socket; to: Socket; item: AssemblyItem; color: string }[] = []
    function connect(fromId: HoleId, toId: HoleId, key: string, color: string) {
        const from = sockets.get(fromId), to = sockets.get(toId), item = byId.get(key)
        if (!from || !to || !item) return
        const start = socketPosition(from, true), end = socketPosition(to, true)
        item.exploded.copy(start).lerp(end, 0.5)
        item.explodedRotation.setFromUnitVectors(item.tubeLengthMm ? UP : CONNECTOR_AXIS, end.sub(start).normalize())
        connections.push({ from, to, item, color })
    }
    connect('torsoTop', 'headBottom', 'longConnector', '#9bd278')
    connect('torsoLeftLeg', 'leftLeg', 'shortConnector', '#8cbbe8')
    connect('torsoRightLeg', 'rightLeg', 'rightHipJoint', '#8cbbe8')

    if (modelType === 'cute10') {
        connect('torsoLeftArm', 'leftArm', 'leftShoulderJoint', '#e9c37b')
        connect('torsoRightArm', 'rightArm', 'rightShoulderJoint', '#e9c37b')
    } else for (const [fromId, toId, key] of [['torsoLeftArm', 'leftArm', 'leftTube'], ['torsoRightArm', 'rightArm', 'rightTube']] as const) {
        const from = sockets.get(fromId), to = sockets.get(toId)
        if (!from || !to) continue
        // Purchased tubes keep their specified dimensions in either preview pose.
        const start = socketPosition(from, false), end = socketPosition(to, false)
        const length = ARM_TUBE_LENGTH_MM / MODEL_MM_PER_UNIT
        const outerRadius = ARM_TUBE_OUTER_DIAMETER_MM / MODEL_MM_PER_UNIT / 2
        const ring = new THREE.Shape()
        ring.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
        const bore = new THREE.Path()
        bore.absarc(0, 0, outerRadius / 2, 0, Math.PI * 2, true)
        ring.holes.push(bore)
        const geometry = new THREE.ExtrudeGeometry(ring, { depth: length, bevelEnabled: false, curveSegments: 24 })
            .rotateX(-Math.PI / 2).translate(0, -length / 2, 0)
        ownedGeometries.push(geometry)
        const material = new THREE.MeshLambertMaterial({ color: '#dbece6' })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        const pivot = new THREE.Group()
        pivot.add(mesh)
        const assembled = start.clone().lerp(end, 0.5)
        const item: AssemblyItem = { key, label: key, pivot, meshes: [mesh], assembled, exploded: assembled.clone(),
            explodedRotation: new THREE.Quaternion(), explodedOnly: true, tubeLengthMm: length * MODEL_MM_PER_UNIT }
        items.push(item)
        byId.set(key, item)
        connect(fromId, toId, key, '#e9c37b')
    }

    const guides = new THREE.Group()
    const lines = connections.map(connection => {
        const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
        const line = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({ color: connection.color, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.7 }))
        guides.add(line)
        return { ...connection, line }
    })
    function updateGuides() {
        for (const { from, to, item, line } of lines) {
            const start = from.anchor.clone().applyQuaternion(from.item.pivot.quaternion).add(from.item.pivot.position)
            const end = to.anchor.clone().applyQuaternion(to.item.pivot.quaternion).add(to.item.pivot.position)
            const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute
            ;[start, item.pivot.position, item.pivot.position, end].forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z))
            positions.needsUpdate = true
            line.computeLineDistances()
            line.geometry.computeBoundingSphere()
        }
    }
    let exploded = false
    const saved = {
        assembled: items.map(item => item.assembled.clone()),
        exploded: items.map(item => item.exploded.clone()),
    }
    function applyPositions() {
        items.forEach((item, index) => {
            item.pivot.position.copy(saved[exploded ? 'exploded' : 'assembled'][index])
            item.pivot.quaternion.copy(exploded ? item.explodedRotation : new THREE.Quaternion())
            item.pivot.visible = exploded || !item.explodedOnly
        })
        guides.visible = exploded
        updateGuides()
    }
    applyPositions()
    return {
        items, guides, connections, updateGuides,
        setExploded(value: boolean) {
            if (value === exploded) return
            items.forEach((item, index) => saved[exploded ? 'exploded' : 'assembled'][index].copy(item.pivot.position))
            exploded = value
            applyPositions()
        },
        resetPositions() {
            items.forEach((item, index) => saved[exploded ? 'exploded' : 'assembled'][index].copy(exploded ? item.exploded : item.assembled))
            applyPositions()
        },
        dispose() {
            items.forEach(item => item.meshes.forEach(mesh => mesh.material.dispose()))
            ownedGeometries.forEach(geometry => geometry.dispose())
            lines.forEach(({ line }) => { line.geometry.dispose(); line.material.dispose() })
        },
    }
}
