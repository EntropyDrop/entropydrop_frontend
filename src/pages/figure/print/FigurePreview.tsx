import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { FigurePart, PrintPartId } from './figureEngine'
import type { LangData } from '../../../constants/lang'
import { ARM_TUBE_LENGTH_MM, createAssemblyPreview, type AssemblyItem } from './explodedView'
import { projectHeightRuler } from './heightRuler'

export function FigurePreview({ parts, isSlim, resetLabel, resetPositionsLabel, partLabels, assemblyLabels, onError }: {
    parts: FigurePart[]
    isSlim: boolean
    resetLabel: string
    resetPositionsLabel: string
    partLabels: Record<PrintPartId, string>
    assemblyLabels: LangData['figurePrint']['assembly']
    onError: () => void
}) {
    const host = useRef<HTMLDivElement>(null)
    const ruler = useRef<SVGSVGElement>(null)
    const reset = useRef<() => void>(() => {})
    const resetPositions = useRef<() => void>(() => {})
    const toggleExploded = useRef<() => void>(() => {})
    const [view, setView] = useState<{ parts: FigurePart[]; exploded: boolean } | null>(null)
    const [selected, setSelected] = useState<{ parts: FigurePart[]; item: AssemblyItem } | null>(null)
    const exploded = view?.parts === parts && view.exploded
    const selectedItem = selected?.parts === parts ? selected.item : null
    useEffect(() => {
        const container = host.current!
        let renderer: THREE.WebGLRenderer
        try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
        catch { onError(); return }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.0
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.domElement.style.touchAction = 'none'
        renderer.domElement.tabIndex = 0
        container.appendChild(renderer.domElement)
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000)
        const world = new THREE.Group()
        world.rotation.x = -Math.PI / 2
        scene.add(world)
        const assembly = createAssemblyPreview(parts, isSlim)
        const previews = assembly.items
        let isExploded = false
        const selectable = previews.flatMap(preview => preview.meshes)
        const owners = new Map(previews.flatMap(preview => preview.meshes.map(mesh => [mesh, preview] as const)))
        previews.forEach(preview => world.add(preview.pivot))
        world.add(assembly.guides)
        const bounds = new THREE.Box3()
        const updateBounds = () => {
            world.updateMatrixWorld(true)
            bounds.makeEmpty()
            previews.filter(preview => preview.pivot.visible).forEach(preview => bounds.expandByObject(preview.pivot))
        }
        updateBounds()
        const bodyBounds = new THREE.Box3()
        previews.filter(item => ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].includes(item.key))
            .forEach(item => bodyBounds.expandByObject(item.pivot))
        const rulerBaseY = bodyBounds.min.y
        const rulerElement = ruler.current!
        const rulerPath = rulerElement.querySelector('path')!
        const rulerLabels = Array.from(rulerElement.querySelectorAll('text'))
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())
        const grid = new THREE.GridHelper(80, 40, '#3a493d', '#242c27')
        grid.position.y = bounds.min.y - 0.1
        scene.add(grid)

        // Lighting rig configured to match EditPage (ambient + hemisphere + view-locked key directional shadow light)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.18)
        scene.add(ambientLight)

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdce5f0, 0.28)
        scene.add(hemiLight)

        const lightRig = new THREE.Group()
        scene.add(lightRig)

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.8)
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
            new THREE.ShadowMaterial({ opacity: 0.35 })
        )
        shadowFloor.rotation.x = -Math.PI / 2
        shadowFloor.position.y = bounds.min.y - 0.1
        shadowFloor.receiveShadow = true
        scene.add(shadowFloor)

        // Register the gizmo first so it can suspend OrbitControls before a drag starts.
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
        const render = () => {
            assembly.updateGuides()
            lightRig.position.copy(center)
            lightRig.quaternion.copy(camera.quaternion)
            renderer.render(scene, camera)
            updateBounds()
            const { width, height } = container.getBoundingClientRect()
            const projected = projectHeightRuler(bounds, rulerBaseY, camera, width, height)
            rulerElement.style.visibility = projected ? 'visible' : 'hidden'
            if (!projected) return
            rulerElement.setAttribute('viewBox', `0 0 ${width} ${height}`)
            rulerPath.setAttribute('d', projected.path)
            projected.labels.forEach((label, index) => {
                rulerLabels[index].setAttribute('x', String(label.x))
                rulerLabels[index].setAttribute('y', String(label.y))
            })
        }
        transform.addEventListener('change', render)
        transform.addEventListener('dragging-changed', () => { controls.enabled = !transform.dragging })
        const frame = () => {
            updateBounds()
            bounds.getCenter(center)
            bounds.getSize(size)
            grid.position.y = bounds.min.y - 0.1
            shadowFloor.position.y = bounds.min.y - 0.1
            // Leave room for the toolbar and ruler captions when fitting the preview.
            const { height } = container.getBoundingClientRect()
            const paddingScale = Math.max(1, height / Math.max(height - 80, height / 2, 1))
            const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (isExploded ? 1.25 : 1.4) * paddingScale
            camera.position.copy(center).add(new THREE.Vector3(1, 0.5, 0.8).normalize().multiplyScalar(distance))
            controls.target.copy(center)
            controls.update()
            render()
        }
        reset.current = frame
        resetPositions.current = () => {
            assembly.resetPositions()
            render()
        }
        controls.addEventListener('change', render)
        const raycaster = new THREE.Raycaster()
        let pointer: { id: number; x: number; y: number; moved: boolean; gizmo: boolean } | null = null
        const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || !event.isPrimary) { pointer = null; return }
            renderer.domElement.focus({ preventScroll: true })
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, gizmo: transform.dragging }
        }
        const pointerMove = (event: PointerEvent) => {
            if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true
        }
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
            isExploded = !isExploded
            assembly.setExploded(isExploded)
            setView({ parts, exploded: isExploded })
            frame()
        }
        const pointerUp = (event: PointerEvent) => {
            const click = pointer
            pointer = null
            if (!click || click.id !== event.pointerId || click.moved || click.gizmo) return
            const rect = renderer.domElement.getBoundingClientRect()
            raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
            const hit = raycaster.intersectObjects(selectable.filter(mesh => owners.get(mesh)?.pivot.visible), false)[0]
            const preview = hit ? owners.get(hit.object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>) : undefined
            if (!preview) { clearSelection(); return }
            transform.attach(preview.pivot)
            setSelected({ parts, item: preview })
            render()
        }
        const cancelPointer = () => {
            pointer = null
            transform.dragging = false
            transform.axis = null
            controls.enabled = true
        }
        const keyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { pointer = null; clearSelection() }
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
        const contextLost = (event: Event) => { event.preventDefault(); onError() }
        renderer.domElement.addEventListener('webglcontextlost', contextLost)
        return () => {
            reset.current = () => {}
            resetPositions.current = () => {}
            toggleExploded.current = () => {}
            observer.disconnect()
            renderer.domElement.removeEventListener('pointerdown', pointerDown)
            renderer.domElement.removeEventListener('pointermove', pointerMove)
            renderer.domElement.removeEventListener('pointerup', pointerUp)
            renderer.domElement.removeEventListener('pointercancel', cancelPointer)
            renderer.domElement.removeEventListener('lostpointercapture', cancelPointer)
            renderer.domElement.removeEventListener('keydown', keyDown)
            transform.removeEventListener('change', render)
            transform.dispose()
            controls.dispose()
            assembly.dispose()
            shadowFloor.geometry.dispose()
            shadowFloor.material.dispose()
            ambientLight.dispose()
            hemiLight.dispose()
            dirLight.dispose()
            grid.geometry.dispose()
            ;(Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(material => material.dispose())
            renderer.domElement.removeEventListener('webglcontextlost', contextLost)
            renderer.dispose()
            renderer.forceContextLoss()
            renderer.domElement.remove()
            rulerElement.style.visibility = 'hidden'
        }
    }, [parts, isSlim, onError])
    const selectedLabel = selectedItem ? (selectedItem.label in partLabels
        ? partLabels[selectedItem.label as PrintPartId]
        : !exploded && selectedItem.label === 'leftHipJoint' ? partLabels.shortConnector
        : assemblyLabels.parts[selectedItem.label as keyof typeof assemblyLabels.parts]) : ''
    return <div className="relative h-full">
        <div ref={host} className="absolute inset-0" />
        <svg ref={ruler} aria-label="7 cm" role="img" className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-white/70" style={{ visibility: 'hidden' }}>
            <path fill="none" stroke="currentColor" strokeWidth="1" />
            {Array.from({ length: 8 }, (_, index) => <text key={index} dominantBaseline="middle" fill="currentColor" stroke="#111711" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke" className="text-[10px]">{index === 7 ? '7 cm' : index}</text>)}
        </svg>
        <div className="absolute top-3 left-24 right-3 flex flex-wrap justify-end gap-2">
            <button type="button" aria-pressed={exploded} onClick={() => toggleExploded.current()} className={`border px-3 py-1.5 text-xs cursor-pointer ${exploded ? 'border-[#84c96b]/50 bg-[#3c8527] text-white' : 'border-white/15 bg-black/50 text-white/70 hover:text-white'}`}>{assemblyLabels.toggle}</button>
            <button type="button" onClick={() => resetPositions.current()} className="border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white/70 hover:text-white cursor-pointer">{resetPositionsLabel}</button>
            <button type="button" onClick={() => reset.current()} className="border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white/70 hover:text-white cursor-pointer">{resetLabel}</button>
        </div>
        <div className="absolute bottom-3 left-3 max-w-[36%] bg-black/65 px-3 py-2 text-[10px] leading-relaxed pointer-events-none">
            <div aria-label={assemblyLabels.legend}>
                <div className="text-[#9bd278]">{assemblyLabels.neck}</div>
                <div className="text-[#8cbbe8]">{assemblyLabels.hips}</div>
                <div className="text-[#e9c37b]">{assemblyLabels.tubes.replace('{length}', String(ARM_TUBE_LENGTH_MM))}</div>
            </div>
            {selectedItem && <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-white/15 pt-1 text-xs" role="status"><span className="text-white/80">{selectedLabel}</span><span className="text-red-400">X</span><span className="text-green-400">Y</span><span className="text-blue-400">Z</span></div>}
        </div>
    </div>
}
