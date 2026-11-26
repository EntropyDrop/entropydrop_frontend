import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { MODEL_MM_PER_UNIT } from '../../../lib/minefigure/shared/assemblySettings.js'
import { CUTE_ARM_TILT, getCutePartPose } from '../../../lib/minefigure/shared/characterProportions.js'
import { projectHeightRuler } from '../print/heightRuler'
import type { OrigamiFaceName, OrigamiLayout, OrigamiPartId, OrigamiPartNet } from './origamiLayout'
import { getOverlayFaceMetrics, type DualLayerPlan, type SupportAnchor } from './origamiDualLayer'
import type { PartFaceCanvasMap } from './origamiEngine'

interface FloatingOverlayRef {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>
    baseZ: number
    explodedZ: number
}

interface SupportMeshRef {
    mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>
    baseColor: THREE.Color
}

interface OrigamiPreviewItem {
    id: OrigamiPartId
    pivot: THREE.Group
    mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial[]>
    edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>
    overlays: FloatingOverlayRef[]
    assembled: THREE.Vector3
    exploded: THREE.Vector3
    baseRotZ: number
}

interface JointGuide {
    from: { item: OrigamiPreviewItem; local: THREE.Vector3 }
    to: { item: OrigamiPreviewItem; local: THREE.Vector3 }
    line: THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>
}

interface OrigamiPreviewProps {
    layout: OrigamiLayout
    faceCanvases: PartFaceCanvasMap
    overlayFaceCanvases?: PartFaceCanvasMap
    dualPlan?: DualLayerPlan
    includeOverlay: boolean
    onToggleOverlay: (next: boolean) => void
    partLabels: Record<OrigamiPartId, string>
    explodedLabel: string
    overlayLabel: string
    overlayHint: string
    xrayLabel?: string
    xrayHint?: string
    onError: () => void
}

// Three.js BoxGeometry material index order: [+X, -X, +Y, -Y, +Z, -Z]
const BOX_FACE_ORDER: readonly OrigamiFaceName[] = ['left', 'right', 'top', 'bottom', 'front', 'back']
const PART_INDEX_MAP: Record<OrigamiPartId, number> = {
    head: 0,
    torso: 1,
    leftArm: 2,
    rightArm: 3,
    leftLeg: 4,
    rightLeg: 5,
}

function createFaceTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
}

function applyLinearTaperX(geometry: THREE.BufferGeometry, height: number, taper: number) {
    if (!taper) return
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, Math.min(1, (pos.getY(i) + height / 2) / height))
        pos.setX(i, pos.getX(i) * (1 - taper * t))
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
}

interface FaceMount {
    planeW: number
    planeH: number
    gridW: number
    gridH: number
    taper: number
    pos: [number, number, number]
    euler: THREE.Euler
}

function getPartFaceMount(part: OrigamiPartNet, faceName: OrigamiFaceName, mmToWorld: number): FaceMount {
    const W = part.sizeMm[0] * mmToWorld
    const H = part.sizeMm[1] * mmToWorld
    const D = part.sizeMm[2] * mmToWorld
    const [gW, gH, gD] = part.sizePx
    const taper = part.taper

    if (!taper) {
        switch (faceName) {
            case 'front': return { planeW: W, planeH: H, gridW: gW, gridH: gH, taper: 0, pos: [0, 0, D / 2], euler: new THREE.Euler(0, 0, 0) }
            case 'back': return { planeW: W, planeH: H, gridW: gW, gridH: gH, taper: 0, pos: [0, 0, -D / 2], euler: new THREE.Euler(0, Math.PI, 0) }
            case 'left': return { planeW: D, planeH: H, gridW: gD, gridH: gH, taper: 0, pos: [W / 2, 0, 0], euler: new THREE.Euler(0, Math.PI / 2, 0) }
            case 'right': return { planeW: D, planeH: H, gridW: gD, gridH: gH, taper: 0, pos: [-W / 2, 0, 0], euler: new THREE.Euler(0, -Math.PI / 2, 0) }
            case 'top': return { planeW: W, planeH: D, gridW: gW, gridH: gD, taper: 0, pos: [0, H / 2, 0], euler: new THREE.Euler(-Math.PI / 2, 0, 0) }
            case 'bottom': return { planeW: W, planeH: D, gridW: gW, gridH: gD, taper: 0, pos: [0, -H / 2, 0], euler: new THREE.Euler(Math.PI / 2, 0, 0) }
        }
    }

    // Tapered Cute torso faces
    const Wtop = W * (1 - taper)
    const dx = (W - Wtop) / 2
    const Hside = Math.hypot(H, dx)
    const tilt = Math.atan2(dx, H)
    const midX = (W + Wtop) / 4

    switch (faceName) {
        case 'front': return { planeW: W, planeH: H, gridW: gW, gridH: gH, taper, pos: [0, 0, D / 2], euler: new THREE.Euler(0, 0, 0) }
        case 'back': return { planeW: W, planeH: H, gridW: gW, gridH: gH, taper, pos: [0, 0, -D / 2], euler: new THREE.Euler(0, Math.PI, 0) }
        case 'top': return { planeW: Wtop, planeH: D, gridW: gW, gridH: gD, taper: 0, pos: [0, H / 2, 0], euler: new THREE.Euler(-Math.PI / 2, 0, 0) }
        case 'bottom': return { planeW: W, planeH: D, gridW: gW, gridH: gD, taper: 0, pos: [0, -H / 2, 0], euler: new THREE.Euler(Math.PI / 2, 0, 0) }
        case 'left': {
            const q = new THREE.Quaternion()
                .setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
            return { planeW: D, planeH: Hside, gridW: gD, gridH: gH, taper: 0, pos: [midX, 0, 0], euler: new THREE.Euler().setFromQuaternion(q) }
        }
        case 'right': {
            const q = new THREE.Quaternion()
                .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tilt)
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))
            return { planeW: D, planeH: Hside, gridW: gD, gridH: gH, taper: 0, pos: [-midX, 0, 0], euler: new THREE.Euler().setFromQuaternion(q) }
        }
    }
}

export function OrigamiPreview({
    layout,
    faceCanvases,
    overlayFaceCanvases,
    dualPlan,
    includeOverlay,
    onToggleOverlay,
    partLabels,
    explodedLabel,
    overlayLabel,
    overlayHint,
    xrayLabel,
    xrayHint,
    onError,
}: OrigamiPreviewProps) {
    const isDual = Boolean(dualPlan && overlayFaceCanvases)
    const host = useRef<HTMLDivElement>(null)
    const ruler = useRef<SVGSVGElement>(null)
    const toggleExploded = useRef<() => void>(() => {})
    const applyXray = useRef<(value: boolean) => void>(() => {})
    const [view, setView] = useState<{ key: PartFaceCanvasMap; exploded: boolean } | null>(null)
    const [selected, setSelected] = useState<{ key: PartFaceCanvasMap; id: OrigamiPartId } | null>(null)
    const [xrayState, setXrayState] = useState<{ key: PartFaceCanvasMap; active: boolean } | null>(null)
    const exploded = view?.key === faceCanvases && view.exploded
    const selectedId = selected?.key === faceCanvases ? selected.id : null
    const xrayActive = xrayState?.key === faceCanvases && xrayState.active

    useEffect(() => {
        const container = host.current
        if (!container) return
        let renderer: THREE.WebGLRenderer
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        } catch {
            onError()
            return
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.0
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFShadowMap
        renderer.domElement.style.touchAction = 'none'
        renderer.domElement.tabIndex = 0
        container.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000)

        const unit = layout.mmPerPixel / MODEL_MM_PER_UNIT
        const mmToWorld = 1 / MODEL_MM_PER_UNIT
        const isCute = layout.shape === 'cute'
        const armW = layout.isSlim ? 3 : 4

        const getPose = (id: OrigamiPartId): { pos: [number, number, number]; explode: [number, number, number]; rotZ: number } => {
            if (isCute) {
                const pose = getCutePartPose(PART_INDEX_MAP[id], layout.isSlim)
                const explodeMap: Record<OrigamiPartId, [number, number, number]> = {
                    head: [0, 3.8, 0],
                    torso: [0, 0, 0],
                    leftArm: [3.2 * Math.cos(CUTE_ARM_TILT), -3.2 * Math.sin(CUTE_ARM_TILT), 0],
                    rightArm: [-3.2 * Math.cos(CUTE_ARM_TILT), -3.2 * Math.sin(CUTE_ARM_TILT), 0],
                    leftLeg: [1.4, -3.2, 0],
                    rightLeg: [-1.4, -3.2, 0],
                }
                return { pos: pose.position as [number, number, number], explode: explodeMap[id], rotZ: pose.rotationZ }
            }
            const armCenterX = 4 + armW / 2
            const stdCenters: Record<OrigamiPartId, [number, number, number]> = {
                head: [0, 28, 0],
                torso: [0, 18, 0],
                leftArm: [armCenterX, 18, 0],
                rightArm: [-armCenterX, 18, 0],
                leftLeg: [2, 6, 0],
                rightLeg: [-2, 6, 0],
            }
            const stdExplode: Record<OrigamiPartId, [number, number, number]> = {
                head: [0, 5.5, 0],
                torso: [0, 0, 0],
                leftArm: [4.5, 0, 0],
                rightArm: [-4.5, 0, 0],
                leftLeg: [1.8, -4.5, 0],
                rightLeg: [-1.8, -4.5, 0],
            }
            return { pos: stdCenters[id], explode: stdExplode[id], rotZ: 0 }
        }

        const textures: THREE.CanvasTexture[] = []
        const extraGeometries: THREE.BufferGeometry[] = []
        const extraMaterials: THREE.Material[] = []
        const allOverlays: FloatingOverlayRef[] = []
        const allSupports: SupportMeshRef[] = []
        const items: OrigamiPreviewItem[] = []
        const byId = new Map<OrigamiPartId, OrigamiPreviewItem>()

        const anchorsByFace = new Map<string, SupportAnchor[]>()
        if (dualPlan) {
            for (const anchor of dualPlan.supports) {
                const key = `${anchor.partId}:${anchor.faceName}`
                const list = anchorsByFace.get(key)
                if (list) list.push(anchor)
                else anchorsByFace.set(key, [anchor])
            }
        }

        for (const part of layout.parts) {
            const W = part.sizeMm[0] * mmToWorld
            const H = part.sizeMm[1] * mmToWorld
            const D = part.sizeMm[2] * mmToWorld
            const geometry = part.taper
                ? new THREE.BoxGeometry(W, H, D, 8, 8, 4)
                : new THREE.BoxGeometry(W, H, D)
            if (part.taper) applyLinearTaperX(geometry, H, part.taper)

            const materials = BOX_FACE_ORDER.map(faceName => {
                const tex = createFaceTexture(faceCanvases[part.id][faceName])
                textures.push(tex)
                return new THREE.MeshLambertMaterial({ map: tex })
            })
            const mesh = new THREE.Mesh(geometry, materials)
            mesh.castShadow = true
            mesh.receiveShadow = true

            const edgesGeo = new THREE.EdgesGeometry(geometry)
            const edgesMat = new THREE.LineBasicMaterial({ color: 0x0b0f0b, transparent: true, opacity: 0.2 })
            const edges = new THREE.LineSegments(edgesGeo, edgesMat)
            mesh.add(edges)

            const pivot = new THREE.Group()
            pivot.add(mesh)

            const partOverlays: FloatingOverlayRef[] = []
            if (dualPlan && overlayFaceCanvases) {
                for (const faceName of BOX_FACE_ORDER) {
                    const faceAnchors = anchorsByFace.get(`${part.id}:${faceName}`) || []
                    const hasIslands = dualPlan.islands.some(i => i.partId === part.id && i.faceName === faceName)
                    if (!hasIslands && faceAnchors.length === 0) continue

                    const faceSpec = part.faces.find(f => f.name === faceName)
                    if (!faceSpec) continue
                    const metrics = getOverlayFaceMetrics(part, faceSpec, layout.modelId)
                    const standoffWorld = metrics.standoffMm * mmToWorld
                    const shiftYWorld = metrics.shiftYMm * mmToWorld

                    const mount = getPartFaceMount(part, faceName, mmToWorld)
                    const faceGroup = new THREE.Group()
                    faceGroup.position.set(...mount.pos)
                    faceGroup.rotation.copy(mount.euler)
                    pivot.add(faceGroup)

                    if (hasIslands) {
                        const ovTex = createFaceTexture(overlayFaceCanvases[part.id][faceName])
                        textures.push(ovTex)
                        const outerW = metrics.outerWidthMm * mmToWorld
                        const outerH = metrics.outerHeightMm * mmToWorld
                        const planeGeo = metrics.taperTopFactor
                            ? new THREE.PlaneGeometry(outerW, outerH, 8, 8)
                            : new THREE.PlaneGeometry(outerW, outerH)
                        if (metrics.taperTopFactor) applyLinearTaperX(planeGeo, outerH, metrics.taperTopFactor)
                        const planeMat = new THREE.MeshLambertMaterial({
                            map: ovTex,
                            transparent: true,
                            alphaTest: 0.5,
                            opacity: 1,
                            side: THREE.DoubleSide,
                        })
                        extraGeometries.push(planeGeo)
                        extraMaterials.push(planeMat)
                        const ovMesh = new THREE.Mesh(planeGeo, planeMat)
                        ovMesh.position.set(0, shiftYWorld, standoffWorld)
                        ovMesh.castShadow = true
                        ovMesh.receiveShadow = true
                        faceGroup.add(ovMesh)
                        const ref: FloatingOverlayRef = {
                            mesh: ovMesh,
                            baseZ: standoffWorld,
                            explodedZ: Math.max(standoffWorld * 2.6, 2.2 * mmToWorld),
                        }
                        partOverlays.push(ref)
                        allOverlays.push(ref)
                    }

                    for (const anchor of faceAnchors) {
                        const anchorStandoff = anchor.standoffMm * mmToWorld
                        const paperThick = Math.min(0.2, anchor.standoffMm * 0.24) * mmToWorld
                        const lx = anchor.faceOffsetXMm * mmToWorld
                        const ly = -anchor.faceOffsetYMm * mmToWorld

                        const baseColor = new THREE.Color(
                            anchor.color[0] / 255,
                            anchor.color[1] / 255,
                            anchor.color[2] / 255,
                        ).lerp(new THREE.Color('#d8dee6'), 0.35)

                        const addSupportBox = (bw: number, bh: number, bd: number, px: number, py: number, pz: number, rotZ = 0) => {
                            const sGeo = new THREE.BoxGeometry(bw, bh, bd)
                            const sMat = new THREE.MeshLambertMaterial({ color: baseColor.clone() })
                            extraGeometries.push(sGeo)
                            extraMaterials.push(sMat)
                            const sMesh = new THREE.Mesh(sGeo, sMat)
                            sMesh.position.set(px, py, pz)
                            if (rotZ) sMesh.rotation.z = rotZ
                            faceGroup.add(sMesh)
                            allSupports.push({ mesh: sMesh, baseColor: baseColor.clone() })
                        }

                        const w1 = anchor.legXMm * mmToWorld
                        const w2 = anchor.legYMm * mmToWorld
                        const hyp = Math.hypot(w1, w2)
                        const foot = Math.min(anchor.footMm * mmToWorld, Math.min(w1, w2) * 0.55)
                        const cornerX = lx - w1 / 2
                        const cornerY = ly - w2 / 2
                        // 90° L-legs + closing diagonal brace (forms a closed right-triangle column)
                        addSupportBox(w1, paperThick, anchorStandoff, lx, cornerY + paperThick / 2, anchorStandoff / 2)
                        addSupportBox(paperThick, w2, anchorStandoff, cornerX + paperThick / 2, ly, anchorStandoff / 2)
                        addSupportBox(hyp, paperThick, anchorStandoff, lx, ly, anchorStandoff / 2, -Math.atan2(w2, w1))
                        // Top & bottom glue flaps tucked inside the right-angle corner
                        addSupportBox(w1 * 0.5, foot, paperThick, cornerX + w1 * 0.25, cornerY + foot / 2, anchorStandoff - paperThick / 2)
                        addSupportBox(foot, w2 * 0.5, paperThick, cornerX + foot / 2, cornerY + w2 * 0.25, paperThick / 2)
                    }
                }
            }

            const pose = getPose(part.id)
            const assembled = new THREE.Vector3(pose.pos[0] * unit, pose.pos[1] * unit, pose.pos[2] * unit)
            const explodedPos = new THREE.Vector3(
                (pose.pos[0] + pose.explode[0]) * unit,
                (pose.pos[1] + pose.explode[1]) * unit,
                (pose.pos[2] + pose.explode[2]) * unit,
            )
            pivot.position.copy(assembled)
            pivot.rotation.z = pose.rotZ
            scene.add(pivot)

            const item: OrigamiPreviewItem = {
                id: part.id,
                pivot,
                mesh,
                edges,
                overlays: partOverlays,
                assembled,
                exploded: explodedPos,
                baseRotZ: pose.rotZ,
            }
            items.push(item)
            byId.set(part.id, item)
        }

        // Dashed joint alignment guides shown in exploded view
        const guidesGroup = new THREE.Group()
        guidesGroup.visible = false
        scene.add(guidesGroup)

        const torsoHalfH = (byId.get('torso') ? layout.parts.find(p => p.id === 'torso')!.sizeMm[1] / 2 : 0) * mmToWorld
        const torsoTopHalfW = (layout.parts.find(p => p.id === 'torso')!.sizeMm[0] * (1 - (isCute ? 0.3 : 0)) / 2) * mmToWorld
        const headHalfH = (layout.parts.find(p => p.id === 'head')!.sizeMm[1] / 2) * mmToWorld
        const legHalfH = (layout.parts.find(p => p.id === 'leftLeg')!.sizeMm[1] / 2) * mmToWorld
        const legOffsetX = (isCute ? 2 * 0.85 : 2) * unit
        const armHalfW = (layout.parts.find(p => p.id === 'leftArm')!.sizeMm[0] / 2) * mmToWorld
        const armShoulderY = (layout.parts.find(p => p.id === 'leftArm')!.sizeMm[1] / 3) * mmToWorld

        const guideSpecs: { from: OrigamiPartId; fromLocal: THREE.Vector3; to: OrigamiPartId; toLocal: THREE.Vector3; color: string }[] = [
            { from: 'torso', fromLocal: new THREE.Vector3(0, torsoHalfH, 0), to: 'head', toLocal: new THREE.Vector3(0, -headHalfH, 0), color: '#9bd278' },
            { from: 'torso', fromLocal: new THREE.Vector3(legOffsetX, -torsoHalfH, 0), to: 'leftLeg', toLocal: new THREE.Vector3(0, legHalfH, 0), color: '#8cbbe8' },
            { from: 'torso', fromLocal: new THREE.Vector3(-legOffsetX, -torsoHalfH, 0), to: 'rightLeg', toLocal: new THREE.Vector3(0, legHalfH, 0), color: '#8cbbe8' },
            { from: 'torso', fromLocal: new THREE.Vector3(torsoTopHalfW, torsoHalfH * 0.65, 0), to: 'leftArm', toLocal: new THREE.Vector3(-armHalfW, armShoulderY, 0), color: '#e9c37b' },
            { from: 'torso', fromLocal: new THREE.Vector3(-torsoTopHalfW, torsoHalfH * 0.65, 0), to: 'rightArm', toLocal: new THREE.Vector3(armHalfW, armShoulderY, 0), color: '#e9c37b' },
        ]
        const guides: JointGuide[] = []
        for (const spec of guideSpecs) {
            const fromItem = byId.get(spec.from)
            const toItem = byId.get(spec.to)
            if (!fromItem || !toItem) continue
            const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
            const mat = new THREE.LineDashedMaterial({ color: spec.color, dashSize: 0.45, gapSize: 0.28, transparent: true, opacity: 0.78 })
            const line = new THREE.LineSegments(geo, mat)
            guidesGroup.add(line)
            guides.push({ from: { item: fromItem, local: spec.fromLocal }, to: { item: toItem, local: spec.toLocal }, line })
        }

        const updateGuides = () => {
            for (const guide of guides) {
                const start = guide.from.local.clone().applyQuaternion(guide.from.item.pivot.quaternion).add(guide.from.item.pivot.position)
                const end = guide.to.local.clone().applyQuaternion(guide.to.item.pivot.quaternion).add(guide.to.item.pivot.position)
                const pos = guide.line.geometry.getAttribute('position') as THREE.BufferAttribute
                pos.setXYZ(0, start.x, start.y, start.z)
                pos.setXYZ(1, end.x, end.y, end.z)
                pos.needsUpdate = true
                guide.line.computeLineDistances()
                guide.line.geometry.computeBoundingSphere()
            }
        }
        updateGuides()

        const bounds = new THREE.Box3()
        const updateBounds = () => {
            scene.updateMatrixWorld(true)
            bounds.makeEmpty()
            items.forEach(item => bounds.expandByObject(item.pivot))
        }
        updateBounds()
        const rulerBaseY = bounds.min.y
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())

        const grid = new THREE.GridHelper(80, 40, '#3a493d', '#242c27')
        grid.position.y = bounds.min.y - 0.1
        scene.add(grid)

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.24)
        scene.add(ambientLight)

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdce5f0, 0.34)
        scene.add(hemiLight)

        const lightRig = new THREE.Group()
        scene.add(lightRig)

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
        dirLight.position.set(-12, 14, 44)
        dirLight.castShadow = true
        dirLight.shadow.mapSize.set(1024, 1024)
        dirLight.shadow.camera.left = -30
        dirLight.shadow.camera.right = 30
        dirLight.shadow.camera.top = 30
        dirLight.shadow.camera.bottom = -30
        dirLight.shadow.camera.near = 1
        dirLight.shadow.camera.far = 140
        dirLight.shadow.normalBias = 0.05
        dirLight.shadow.bias = -0.0005
        lightRig.add(dirLight)
        lightRig.add(dirLight.target)
        dirLight.target.position.set(0, 0, 0)

        const shadowFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 80),
            new THREE.ShadowMaterial({ opacity: 0.35 }),
        )
        shadowFloor.rotation.x = -Math.PI / 2
        shadowFloor.position.y = bounds.min.y - 0.1
        shadowFloor.receiveShadow = true
        scene.add(shadowFloor)

        const transform = new TransformControls(camera, renderer.domElement)
        transform.setMode('translate')
        transform.setSpace('world')
        transform.setSize(0.85)
        scene.add(transform.getHelper())

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.target.copy(center)
        controls.enableDamping = false
        controls.minDistance = 10
        controls.maxDistance = 180

        const rulerElement = ruler.current!
        const rulerPath = rulerElement.querySelector('path')!
        const rulerLabels = Array.from(rulerElement.querySelectorAll('text'))

        let isExploded = false
        const saved = {
            assembled: items.map(item => item.assembled.clone()),
            exploded: items.map(item => item.exploded.clone()),
        }

        const render = () => {
            updateGuides()
            lightRig.position.copy(center)
            lightRig.quaternion.copy(camera.quaternion)
            renderer.render(scene, camera)
            updateBounds()
            const { width, height } = container.getBoundingClientRect()
            const projected = projectHeightRuler(bounds, rulerBaseY, camera, width, height, layout.heightCm)
            rulerElement.style.visibility = projected ? 'visible' : 'hidden'
            if (!projected) return
            rulerElement.setAttribute('viewBox', `0 0 ${width} ${height}`)
            rulerPath.setAttribute('d', projected.path)
            projected.labels.forEach((label, index) => {
                rulerLabels[index]?.setAttribute('x', String(label.x))
                rulerLabels[index]?.setAttribute('y', String(label.y))
            })
        }

        applyXray.current = (active: boolean) => {
            for (const ov of allOverlays) {
                ov.mesh.material.opacity = active ? 0.28 : 1
                ov.mesh.material.alphaTest = active ? 0.1 : 0.5
                ov.mesh.material.depthWrite = !active
                ov.mesh.material.needsUpdate = true
            }
            for (const sup of allSupports) {
                if (active) {
                    sup.mesh.material.color.set('#4ade80')
                } else {
                    sup.mesh.material.color.copy(sup.baseColor)
                }
            }
            render()
        }

        transform.addEventListener('change', render)
        transform.addEventListener('dragging-changed', () => {
            controls.enabled = !transform.dragging
        })

        const frame = () => {
            updateBounds()
            bounds.getCenter(center)
            bounds.getSize(size)
            grid.position.y = bounds.min.y - 0.1
            shadowFloor.position.y = bounds.min.y - 0.1
            const { height } = container.getBoundingClientRect()
            const paddingScale = Math.max(1, height / Math.max(height - 80, height / 2, 1))
            const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (isExploded ? 1.25 : 1.4) * paddingScale
            camera.position.copy(center).add(new THREE.Vector3(0.75, 0.38, 1.0).normalize().multiplyScalar(distance))
            controls.target.copy(center)
            controls.update()
            render()
        }

        controls.addEventListener('change', render)

        const selectable = items.map(item => item.mesh)
        const owners = new Map(items.map(item => [item.mesh, item] as const))
        const raycaster = new THREE.Raycaster()
        let pointer: { id: number; x: number; y: number; moved: boolean; gizmo: boolean } | null = null

        const clearSelection = () => {
            transform.detach()
            transform.dragging = false
            controls.enabled = true
            setSelected(null)
            render()
        }

        toggleExploded.current = () => {
            pointer = null
            clearSelection()
            items.forEach((item, index) => saved[isExploded ? 'exploded' : 'assembled'][index].copy(item.pivot.position))
            isExploded = !isExploded
            items.forEach((item, index) => {
                item.pivot.position.copy(saved[isExploded ? 'exploded' : 'assembled'][index])
                item.overlays.forEach(ov => {
                    ov.mesh.position.z = isExploded ? ov.explodedZ : ov.baseZ
                })
            })
            guidesGroup.visible = isExploded
            setView({ key: faceCanvases, exploded: isExploded })
            frame()
        }

        const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || !event.isPrimary) {
                pointer = null
                return
            }
            renderer.domElement.focus({ preventScroll: true })
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, gizmo: transform.dragging }
        }
        const pointerMove = (event: PointerEvent) => {
            if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) {
                pointer.moved = true
            }
        }
        const pointerUp = (event: PointerEvent) => {
            const click = pointer
            pointer = null
            if (!click || click.id !== event.pointerId || click.moved || click.gizmo) return
            const rect = renderer.domElement.getBoundingClientRect()
            raycaster.setFromCamera(
                new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1),
                camera,
            )
            const hit = raycaster.intersectObjects(selectable, false)[0]
            const item = hit ? owners.get(hit.object as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial[]>) : undefined
            if (!item) {
                clearSelection()
                return
            }
            transform.attach(item.pivot)
            setSelected({ key: faceCanvases, id: item.id })
            render()
        }
        const cancelPointer = () => {
            pointer = null
            transform.dragging = false
            transform.axis = null
            controls.enabled = true
        }
        const keyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                pointer = null
                clearSelection()
            }
        }

        renderer.domElement.addEventListener('pointerdown', pointerDown)
        renderer.domElement.addEventListener('pointermove', pointerMove)
        renderer.domElement.addEventListener('pointerup', pointerUp)
        renderer.domElement.addEventListener('pointercancel', cancelPointer)
        renderer.domElement.addEventListener('lostpointercapture', cancelPointer)
        renderer.domElement.addEventListener('keydown', keyDown)

        const resize = () => {
            const { width, height } = container.getBoundingClientRect()
            if (!width || !height) return
            camera.aspect = width / height
            camera.updateProjectionMatrix()
            renderer.setSize(width, height)
            frame()
        }
        const observer = new ResizeObserver(resize)
        observer.observe(container)
        resize()

        const contextLost = (event: Event) => {
            event.preventDefault()
            onError()
        }
        renderer.domElement.addEventListener('webglcontextlost', contextLost)

        return () => {
            toggleExploded.current = () => {}
            applyXray.current = () => {}
            observer.disconnect()
            renderer.domElement.removeEventListener('pointerdown', pointerDown)
            renderer.domElement.removeEventListener('pointermove', pointerMove)
            renderer.domElement.removeEventListener('pointerup', pointerUp)
            renderer.domElement.removeEventListener('pointercancel', cancelPointer)
            renderer.domElement.removeEventListener('lostpointercapture', cancelPointer)
            renderer.domElement.removeEventListener('keydown', keyDown)
            renderer.domElement.removeEventListener('webglcontextlost', contextLost)
            transform.removeEventListener('change', render)
            transform.dispose()
            controls.dispose()
            items.forEach(item => {
                item.mesh.geometry.dispose()
                item.mesh.material.forEach(mat => mat.dispose())
                item.edges.geometry.dispose()
                item.edges.material.dispose()
            })
            extraGeometries.forEach(geo => geo.dispose())
            extraMaterials.forEach(mat => mat.dispose())
            textures.forEach(tex => tex.dispose())
            guides.forEach(guide => {
                guide.line.geometry.dispose()
                guide.line.material.dispose()
            })
            shadowFloor.geometry.dispose()
            shadowFloor.material.dispose()
            ambientLight.dispose()
            hemiLight.dispose()
            dirLight.dispose()
            grid.geometry.dispose()
            ;(Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(mat => mat.dispose())
            renderer.dispose()
            renderer.forceContextLoss()
            renderer.domElement.remove()
            rulerElement.style.visibility = 'hidden'
        }
    }, [layout, faceCanvases, overlayFaceCanvases, dualPlan, onError])

    return (
        <div className="relative h-full">
            <div ref={host} className="absolute inset-0" />
            <svg
                ref={ruler}
                aria-label={`${layout.heightCm} cm`}
                role="img"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-white/70"
                style={{ visibility: 'hidden' }}
            >
                <path fill="none" stroke="currentColor" strokeWidth="1" />
                {Array.from({ length: layout.heightCm + 1 }, (_, index) => (
                    <text
                        key={index}
                        dominantBaseline="middle"
                        fill="currentColor"
                        stroke="#111711"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        className="text-[10px]"
                    >
                        {index === layout.heightCm ? `${layout.heightCm} cm` : index}
                    </text>
                ))}
            </svg>
            <div className="absolute top-3 left-24 right-3 flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    aria-pressed={exploded}
                    onClick={() => toggleExploded.current()}
                    className={`border px-3 py-1.5 text-xs cursor-pointer ${exploded ? 'border-[#84c96b]/50 bg-[#3c8527] text-white' : 'border-white/15 bg-black/50 text-white/70 hover:text-white'}`}
                >
                    {explodedLabel}
                </button>
                {isDual ? (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={xrayActive}
                        title={xrayHint}
                        onClick={() => {
                            const next = !xrayActive
                            setXrayState({ key: faceCanvases, active: next })
                            applyXray.current(next)
                        }}
                        className="flex items-center gap-2 border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:text-white/80 cursor-pointer"
                    >
                        {xrayLabel}
                        <span aria-hidden="true" className="relative inline-block h-3.5 w-6 shrink-0 rounded-full bg-white/15">
                            <span className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white/60 transition-transform ${xrayActive ? 'translate-x-2.5' : 'translate-x-0'}`} />
                        </span>
                    </button>
                ) : (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={includeOverlay}
                        title={overlayHint}
                        onClick={() => onToggleOverlay(!includeOverlay)}
                        className="flex items-center gap-2 border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:text-white/80 cursor-pointer"
                    >
                        {overlayLabel}
                        <span aria-hidden="true" className="relative inline-block h-3.5 w-6 shrink-0 rounded-full bg-white/15">
                            <span className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white/60 transition-transform ${includeOverlay ? 'translate-x-2.5' : 'translate-x-0'}`} />
                        </span>
                    </button>
                )}
            </div>
            {selectedId && (
                <div className="absolute bottom-3 left-3 max-w-[46%] bg-black/65 px-3 py-2 text-xs leading-relaxed pointer-events-none flex flex-wrap items-center gap-3" role="status">
                    <span className="text-white/80">{partLabels[selectedId]}</span>
                    <span className="text-red-400">X</span>
                    <span className="text-green-400">Y</span>
                    <span className="text-blue-400">Z</span>
                </div>
            )}
        </div>
    )
}
