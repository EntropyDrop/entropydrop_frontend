import * as THREE from 'three';
import {
  applyCameraBend, hookSceneMaterials, cullChunks,
  bendPoint, bendDirection, unbendPoint, unbendDirection,
  TORUS_SIZE_X, TORUS_SIZE_Z, wrapX, wrapZ
} from '../torus/TorusWorld.ts';
import { CuteCharacter, loadCuteCharacter, type SkinModel } from './CuteCharacter.ts';

export const ENTITY_PREVIEW_LAYER = 1;
export const ENTITY_PREVIEW_FORCE_LIMIT_RATIO = 0.72;
const MAX_SELECTION_BEND_SEGMENTS = 64;

function createPlayerNameTag(username: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Glassmorphism dark rounded badge
    ctx.fillStyle = 'rgba(12, 18, 28, 0.78)';
    const r = 12;
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 52, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 210, 211, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Player name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Inter", "Outfit", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username.slice(0, 16), 128, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.set(0, 2.05, 0);
  sprite.renderOrder = 50;
  return sprite;
}

function createRemotePlayerFallback() {
  const group = new THREE.Group();
  group.name = 'RemotePlayerFallback';
  const material = new THREE.MeshStandardMaterial({
    color: 0x00d2d3,
    roughness: 0.72,
    metalness: 0.05,
  });
  const addBox = (size: [number, number, number], position: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
  };
  addBox([0.62, 0.78, 0.34], [0, 1.05, 0]);
  addBox([0.52, 0.52, 0.52], [0, 1.72, 0]);
  addBox([0.2, 0.72, 0.2], [-0.42, 1.06, 0]);
  addBox([0.2, 0.72, 0.2], [0.42, 1.06, 0]);
  addBox([0.24, 0.76, 0.24], [-0.18, 0.38, 0]);
  addBox([0.24, 0.76, 0.24], [0.18, 0.38, 0]);
  hookSceneMaterials(group);
  return group;
}

function disposeRemotePlayerFallback(group: THREE.Group | null | undefined) {
  if (!group) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  group.removeFromParent();
}

interface PlayerAppearance {
  skinUrl: string;
  skinModel: SkinModel;
}

/**
 * The torus shader bends vertices, not the straight line between two vertices.
 * A default BoxGeometry therefore turns a large selection edge into a chord
 * through the curved terrain. Subdivide at roughly one segment per selected
 * cell (with a safety cap) so fills and outlines follow the rendered surface.
 */
function updateTorusSelectionBoxGeometry(fill, edges, sizeX, sizeY, sizeZ) {
  if (!fill || !edges) return;
  const segments = [sizeX, sizeY, sizeZ].map(size => (
    Math.max(1, Math.min(MAX_SELECTION_BEND_SEGMENTS, Math.max(1, Math.round(Math.abs(Number(size)) * 5))))
  ));
  const signature = segments.join(',');
  if (fill.userData.torusSelectionSegments === signature) return;

  const box = new THREE.BoxGeometry(1, 1, 1, segments[0], segments[1], segments[2]);
  const outline = new THREE.EdgesGeometry(box);
  fill.geometry?.dispose?.();
  edges.geometry?.dispose?.();
  fill.geometry = box;
  edges.geometry = outline;
  fill.userData.torusSelectionSegments = signature;
}

function previewVector3(value, fallback = new THREE.Vector3()) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) {
    return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  }
  return fallback.clone();
}

function previewQuaternion(value) {
  if (value?.isQuaternion) return value.clone().normalize();
  if (Array.isArray(value) && value.length >= 4) {
    return new THREE.Quaternion(
      Number(value[0]) || 0,
      Number(value[1]) || 0,
      Number(value[2]) || 0,
      Number(value[3]) || 1
    ).normalize();
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Number(value[0]) || 0,
      Number(value[1]) || 0,
      Number(value[2]) || 0,
      'XYZ'
    ));
  }
  return new THREE.Quaternion();
}

/**
 * Convert either inventory format into voxel instances relative to the exact
 * placement origin. Entity component transforms mirror Contraption's initial
 * hierarchy, so articulated copies preview in the same pose they build in.
 */
export function getInventoryPreviewBlocks(slot) {
  if (!slot || !Array.isArray(slot.blocks)) return [];
  if (slot.kind === 'blockset') {
    return slot.blocks.map(block => ({
      center: new THREE.Vector3(
        Number(block.dx) + (Number(block.size) || 1) / 2,
        Number(block.dy) + (Number(block.size) || 1) / 2,
        Number(block.dz) + (Number(block.size) || 1) / 2
      ),
      size: Number(block.size) || 1,
      color: block.color
    }));
  }

  if (slot.blocks.length === 0) return [];
  const singleRoot = !!slot.rootId;
  const rootId = slot.rootId || null;
  const mapId = id => (singleRoot && id === rootId ? 'root' : id);
  const sourceChildIds = new Set((slot.childEntities || []).map(definition => definition.id));
  const blocks = slot.blocks.map(block => ({
    ...block,
    entityId: mapId(block.entityId || 'root')
  }));
  const definitions = (slot.childEntities || []).map(definition => ({
    ...definition,
    id: mapId(definition.id),
    parentId: sourceChildIds.has(definition.parentId)
      ? mapId(definition.parentId)
      : 'root'
  })).filter(definition => definition.id !== 'root');

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const block of blocks) {
    const x = Math.floor(Number(block.localX) + 1e-6);
    const y = Math.floor(Number(block.localY) + 1e-6);
    const z = Math.floor(Number(block.localZ) + 1e-6);
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1); maxZ = Math.max(maxZ, z + 1);
  }
  const rootPivot = new THREE.Vector3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );
  const rootMatrix = new THREE.Matrix4().makeTranslation(rootPivot.x, rootPivot.y, rootPivot.z);
  const nodes = new Map([['root', { pivot: rootPivot, matrix: rootMatrix }]]);
  const pending = [...definitions];
  let guard = pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const definition = pending[index];
      const parent = nodes.get(definition.parentId || 'root');
      if (!parent) continue;
      const pivot = previewVector3(definition.pivot, rootPivot);
      const defaultPosition = pivot.clone().sub(parent.pivot);
      const localPosition = previewVector3(definition.localPosition, defaultPosition);
      const localMatrix = new THREE.Matrix4().compose(
        localPosition,
        previewQuaternion(definition.localRotation),
        new THREE.Vector3(1, 1, 1)
      );
      nodes.set(definition.id, {
        pivot,
        matrix: new THREE.Matrix4().multiplyMatrices(parent.matrix, localMatrix)
      });
      pending.splice(index, 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  // Match Contraption's safe fallback for invalid/cyclic parents.
  for (const definition of pending) {
    const pivot = previewVector3(definition.pivot, rootPivot);
    const localMatrix = new THREE.Matrix4().makeTranslation(
      pivot.x - rootPivot.x,
      pivot.y - rootPivot.y,
      pivot.z - rootPivot.z
    );
    nodes.set(definition.id, {
      pivot,
      matrix: new THREE.Matrix4().multiplyMatrices(rootMatrix, localMatrix)
    });
  }

  return blocks.flatMap(block => {
    const node = nodes.get(block.entityId || 'root');
    if (!node) return [];
    const size = Number(block.size) || 1;
    const center = new THREE.Vector3(
      Number(block.localX) + size / 2,
      Number(block.localY) + size / 2,
      Number(block.localZ) + size / 2
    ).sub(node.pivot).applyMatrix4(node.matrix);
    return [{ center, size, color: block.color }];
  });
}

export function calculatePreviewDragForce(
  cameraQuaternion,
  deltaX,
  deltaY,
  maxForce,
  flatReferencePoint = null
) {
  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;
  const dragLength = Math.hypot(dx, dy);
  const safeMaxForce = Math.max(0, Number(maxForce) || 0);
  const forceLimit = safeMaxForce * ENTITY_PREVIEW_FORCE_LIMIT_RATIO;
  if (dragLength < 0.5 || forceLimit <= 0) return new THREE.Vector3();

  const orientation = cameraQuaternion?.isQuaternion
    ? cameraQuaternion
    : new THREE.Quaternion();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
  // The preview camera lives in the torus-bent render space, while physics
  // forces live in the flat simulation space. Convert both screen axes back at
  // the grabbed point before composing the force; otherwise the displayed
  // arrow rotates with the entity's position around the torus.
  if (flatReferencePoint?.isVector3) {
    unbendDirection(
      flatReferencePoint.x,
      flatReferencePoint.y,
      flatReferencePoint.z,
      cameraRight,
      cameraRight
    ).normalize();
    unbendDirection(
      flatReferencePoint.x,
      flatReferencePoint.y,
      flatReferencePoint.z,
      cameraUp,
      cameraUp
    ).normalize();
  }
  const direction = cameraRight.multiplyScalar(dx)
    .addScaledVector(cameraUp, -dy)
    .normalize();
  const magnitude = Math.min(forceLimit, (dragLength / 140) * forceLimit);
  return direction.multiplyScalar(magnitude);
}

export function calculateEntityPreviewCameraPose(contraption, aspect = 1, fov = 42) {
  const safeAspect = Math.max(0.2, Number(aspect) || 1);
  const radius = Math.max(0.75, contraption.boundingRadius || 0.75);
  const verticalHalfFov = THREE.MathUtils.degToRad(fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * safeAspect);
  const limitingHalfFov = Math.max(0.1, Math.min(verticalHalfFov, horizontalHalfFov));
  const distance = (radius / Math.sin(limitingHalfFov)) * 1.16;
  const center = contraption.position.clone();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const localRear = new THREE.Vector3(0, 0, 1).applyQuaternion(contraption.quaternion).normalize();
  const position = center.clone()
    .addScaledVector(localRear, distance)
    .addScaledVector(worldUp, radius * 0.28);

  return { center, position, up: worldUp, distance, radius };
}

export class SceneRenderer {
  declare container: any;
  declare scene: THREE.Scene;
  declare skyColorDay: THREE.Color;
  declare camera: THREE.PerspectiveCamera;
  declare renderer: THREE.WebGLRenderer;
  declare previewRenderer: any;
  declare previewCamera: any;
  declare previewCanvas: any;
  declare previewTarget: any;
  declare previewRaycaster: any;
  declare previewPointer: any;
  declare previewOrbit: any;
  declare previewInteraction: any;
  declare previewForceArrow: any;
  declare previewArrowHoldUntil: number;
  declare onPreviewPointerDown: any;
  declare onPreviewPointerMove: any;
  declare onPreviewPointerUp: any;
  declare onPreviewContextMenu: any;
  declare onEntityPreviewNodeSelect: any;
  declare hemiLight: THREE.HemisphereLight;
  declare sunLight: THREE.DirectionalLight;
  declare cursorMesh: THREE.LineSegments;
  declare microCarveGroup: THREE.Group;
  declare microCarveFocusCell: THREE.LineSegments;
  declare focusBlockGuide: THREE.LineSegments;
  declare boxSelectionGroup: THREE.Group;
  declare boxSelectionFill: THREE.Mesh;
  declare boxSelectionEdges: THREE.LineSegments;
  declare wrenchTetherLine: THREE.Line;
  declare playerAvatar: THREE.Group;
  declare playerAvatarCharacter: CuteCharacter | null;
  declare playerFirstPersonHand: THREE.Group | null;
  declare remotePlayersGroup: THREE.Group;
  declare remotePlayers: Map<string, any>;
  declare inventoryPlacementGroup: THREE.Group;
  declare inventoryPlacementFill: THREE.InstancedMesh | null;
  declare inventoryPlacementWire: THREE.LineSegments | null;
  declare inventoryPlacementSlot: any;
  declare selectionGroup: THREE.Group;
  declare selectionWireframe: any;
  declare selectionFill: any;
  declare selectionCellsGroup: THREE.Group;
  declare selectionCellBoxGeometry: THREE.BoxGeometry;
  declare selectionCellEdgeGeometry: THREE.EdgesGeometry;
  declare selectionCellLineMaterial: THREE.LineBasicMaterial;
  declare selectionCellFillMaterial: THREE.MeshBasicMaterial;
  declare selectionCellsSignature: string;
  declare selectionMicroCellsGroup: THREE.Group;
  declare selectionMicroCellBoxGeometry: THREE.BoxGeometry;
  declare selectionMicroCellEdgeGeometry: THREE.EdgesGeometry;
  declare selectionMicroCellLineMaterial: THREE.LineBasicMaterial;
  declare selectionMicroCellFillMaterial: THREE.MeshBasicMaterial;
  declare selectionMicroCellsSignature: string;
  declare timeOfDay: number;
  declare world: any;
  declare flatCameraPosition: THREE.Vector3;
  declare flatCameraQuaternion: THREE.Quaternion;
  declare bentLightTarget: THREE.Vector3;
  declare bentLightDirection: THREE.Vector3;
  declare materialScanCountdown: number;
  declare skyDome: THREE.Mesh;
  declare skyDomeUniforms: Record<string, { value: any }>;
  declare playerAppearance: PlayerAppearance;

  constructor(canvasContainer, playerAppearance: PlayerAppearance) {
    this.container = canvasContainer;
    this.playerAppearance = playerAppearance;
    this.world = null;
    // Reused every frame so render-time torus transforms do not allocate or leak
    // back into the flat simulation camera.
    this.flatCameraPosition = new THREE.Vector3();
    this.flatCameraQuaternion = new THREE.Quaternion();
    this.bentLightTarget = new THREE.Vector3();
    this.bentLightDirection = new THREE.Vector3();
    this.materialScanCountdown = 0;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.skyColorDay = new THREE.Color('#74b9ff');
    this.scene.background = this.skyColorDay.clone();
    // Preserve opposite-ring visibility after doubling both map circumferences.
    // The opposite inner wall is now about 4,563 m away, so fog density scales
    // down so the dramatic planetary doughnut ring remains clearly visible in the sky.
    this.scene.fog = new THREE.FogExp2('#74b9ff', 0.00012);

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
    this.camera.rotation.order = 'YXZ';
    // Camera-local viewmodels (such as the first-person hand) need to be part
    // of the scene graph so they inherit the final bent render camera pose.
    this.scene.add(this.camera);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // Programming-terminal entity preview (created lazily when UI connects).
    this.previewRenderer = null;
    this.previewCamera = null;
    this.previewCanvas = null;
    this.previewTarget = null;
    this.previewRaycaster = new THREE.Raycaster();
    this.previewPointer = new THREE.Vector2();
    this.previewOrbit = this.createDefaultPreviewOrbit();
    this.previewInteraction = null;
    this.previewForceArrow = null;
    this.previewArrowHoldUntil = 0;
    this.onPreviewPointerDown = event => this.handleEntityPreviewPointerDown(event);
    this.onPreviewPointerMove = event => this.handleEntityPreviewPointerMove(event);
    this.onPreviewPointerUp = event => this.handleEntityPreviewPointerUp(event);
    this.onPreviewContextMenu = event => event.preventDefault();

    // 4. Lighting & Environment
    this.setupLighting();
    this.setupSkyDome();
    this.setupCursorHighlight();
    this.setupMicroCarvePreview();
    this.setupFocusBlockGuide();
    this.setupBoxSelectionPreview();
    this.setupInventoryPlacementPreview();
    this.setupSelectionHologram();
    this.setupPlayerAvatar();
    this.setupRemotePlayers();

    // 5. Lighting state — fixed daytime, no day/night cycle.
    this.timeOfDay = 10.0; // 10:00 AM, permanently

    // Resize handling
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  setupLighting() {
    // Ambient / Hemisphere Light
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x556644, 0.7);
    this.scene.add(this.hemiLight);

    // Sun Light
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 150;
    const d = 45;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
  }

  /**
   * Gradient sky dome.
   *
   * A flat scene.background reads as a featureless void in a torus world:
   * looking up through the central hole shows the opposite ring, but the sky
   * between has no depth cue. A dome centered on the camera adds a subtle
   * radial gradient (deeper toward the hole's center, lifting toward the
   * limb/sun side) so the donut reads as a planet in space instead of a
   * floating texture strip. Base color matches the fog color exactly so the
   * far terrain fades seamlessly into it.
   */
  setupSkyDome() {
    // Radius must exceed the far ring (~4563 m) but stay inside the camera far
    // plane (10000 m). 7000 m gives comfortable headroom for the torus.
    const RADIUS = 7000;
    const geometry = new THREE.SphereGeometry(RADIUS, 32, 16);

    this.skyDomeUniforms = {
      uSkyColor: { value: new THREE.Color('#74b9ff') },
      uHoleColor: { value: new THREE.Color('#3f7fc4') },
      uLimbColor: { value: new THREE.Color('#bfe3ff') },
      uHoleDir: { value: new THREE.Vector3(1, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uGradientStrength: { value: 0.55 }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.skyDomeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyColor;
        uniform vec3 uHoleColor;
        uniform vec3 uLimbColor;
        uniform vec3 uHoleDir;
        uniform vec3 uSunDir;
        uniform float uGradientStrength;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          // Toward the central hole: deeper space blue.
          float holeAmt = smoothstep( 0.15, 0.95, dot( dir, uHoleDir ) );
          // Opposite the hole / toward the sun-side limb: bright lift.
          float limbAmt = smoothstep( 0.25, 0.9, dot( dir, uSunDir ) );
          vec3 col = uSkyColor;
          col = mix( col, uHoleColor, holeAmt * uGradientStrength );
          col = mix( col, uLimbColor, limbAmt * uGradientStrength * 0.5 );
          gl_FragColor = vec4( col, 1.0 );
          // Run the same ACES + sRGB pipeline as the lit terrain so the dome's
          // base color matches fully-fogged terrain exactly (no horizon seam).
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.name = 'SkyDome';
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1;
    // Keep the GPU torus-bend hook off this dome: it is a camera-centered
    // background sphere, not world geometry.
    this.skyDome.userData.torusPreBent = true;
    this.scene.add(this.skyDome);

    // Fallback clear color in case the dome is ever culled/failed.
    this.renderer.setClearColor(new THREE.Color('#74b9ff'), 1);
    this.scene.background = null;
  }

  /** Point the dome's gradient at the torus hole and the sun each frame. */
  updateSkyDome(cameraBentPosition: THREE.Vector3) {
    if (!this.skyDome) return;
    this.skyDome.position.copy(cameraBentPosition);

    // Hole direction: from the camera toward the torus center (origin of the
    // major circle). This is the void you look up into.
    const hole = this.skyDomeUniforms.uHoleDir.value;
    const len = cameraBentPosition.length();
    if (len > 1e-6) {
      hole.set(-cameraBentPosition.x / len, -cameraBentPosition.y / len, -cameraBentPosition.z / len);
    } else {
      hole.set(1, 0, 0);
    }

    // Sun direction: reuse the bent light direction (points from target toward
    // the sun). The dome's limb brightens on the sun side.
    const sun = this.skyDomeUniforms.uSunDir.value;
    sun.copy(this.bentLightDirection).normalize();
  }

  setupCursorHighlight() {
    const geo = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: 0x222222,
      linewidth: 2,
      transparent: true,
      opacity: 0.6
    });

    this.cursorMesh = new THREE.LineSegments(edges, mat);
    this.cursorMesh.visible = false;
    this.scene.add(this.cursorMesh);
  }

  /**
   * Micro-carve focus preview: draws the 5x5x5 micro-voxel grid wireframe
   * inside the hit standard cell, and highlights the current 0.2³ micro cell
   * when a micro block is hit.
   */
  setupMicroCarvePreview() {
    this.microCarveGroup = new THREE.Group();
    this.microCarveGroup.name = 'MicroCarvePreview';

    // 5×5 grid lines on the outer surface of each 1×1×1 standard cell
    // (inner 3×3×3 lines hidden for a clean look)
    const positions = [];
    const N = 5;
    const step = 1 / N;
    for (const face of [0, 1]) {
      for (let j = 0; j <= N; j++) {
        const w = j * step;
        // x = the two faces: grid lines along Y and along Z
        positions.push(face, 0, w, face, 1, w);
        positions.push(face, w, 0, face, w, 1);
        // y = the two faces: grid lines along X and along Z
        positions.push(0, face, w, 1, face, w);
        positions.push(w, face, 0, w, face, 1);
        // z = the two faces: grid lines along X and along Y
        positions.push(0, w, face, 1, w, face);
        positions.push(w, 0, face, w, 1, face);
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    const gridLines = new THREE.LineSegments(gridGeo, gridMat);
    this.microCarveGroup.add(gridLines);

    // Highlight box for the focused micro cell (0.2³) with segments for curvature bending
    const cellGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2, 2, 2, 2);
    const cellEdges = new THREE.EdgesGeometry(cellGeo);
    const cellMat = new THREE.LineBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.microCarveFocusCell = new THREE.LineSegments(cellEdges, cellMat);
    this.microCarveFocusCell.visible = false;
    this.microCarveGroup.add(this.microCarveFocusCell);

    this.microCarveGroup.visible = false;
    this.scene.add(this.microCarveGroup);
  }

  /**
   * Update the micro-carve focus preview.
   * @param {null | { cellOrigin: THREE.Vector3, microCenter: THREE.Vector3|null }} preview
   *   cellOrigin: world coordinates of the standard cell corner (5×5×5 grid drawn inside);
   *   microCenter: world coordinates of the focused micro cell center (when a micro
   *   block is hit), otherwise null.
   */
  setMicroCarvePreview(preview) {
    if (!this.microCarveGroup) return;
    if (!preview || !preview.cellOrigin) {
      this.microCarveGroup.visible = false;
      return;
    }
    this.microCarveGroup.position.copy(preview.cellOrigin);
    if (preview.microCenter) {
      this.microCarveFocusCell.position.copy(preview.microCenter);
      this.microCarveFocusCell.visible = true;
    } else {
      this.microCarveFocusCell.visible = false;
    }
    this.microCarveGroup.visible = true;
  }

  setupInventoryPlacementPreview() {
    this.inventoryPlacementGroup = new THREE.Group();
    this.inventoryPlacementGroup.name = 'InventoryPlacementPreview';
    this.inventoryPlacementGroup.visible = false;
    this.inventoryPlacementFill = null;
    this.inventoryPlacementWire = null;
    this.inventoryPlacementSlot = null;
    this.scene.add(this.inventoryPlacementGroup);
  }

  rebuildInventoryPlacementPreview(slot) {
    this.inventoryPlacementGroup.clear();
    if (this.inventoryPlacementFill) {
      this.inventoryPlacementFill.geometry.dispose();
      const materials = Array.isArray(this.inventoryPlacementFill.material)
        ? this.inventoryPlacementFill.material
        : [this.inventoryPlacementFill.material];
      materials.forEach(material => material.dispose());
    }
    if (this.inventoryPlacementWire) {
      this.inventoryPlacementWire.geometry.dispose();
      const materials = Array.isArray(this.inventoryPlacementWire.material)
        ? this.inventoryPlacementWire.material
        : [this.inventoryPlacementWire.material];
      materials.forEach(material => material.dispose());
    }
    this.inventoryPlacementFill = null;
    this.inventoryPlacementWire = null;

    const entries = getInventoryPreviewBlocks(slot);
    if (entries.length === 0) return false;

    // The ghost is a regular object in the scene: depth-tested and depth
    // writing, so only the faces the camera can actually see are drawn —
    // no X-ray through the voxel shell or through the world.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      depthTest: true,
      depthWrite: true
    });
    const fill = new THREE.InstancedMesh(geometry, fillMaterial, entries.length);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      scale.setScalar(entry.size);
      matrix.compose(entry.center, identity, scale);
      fill.setMatrixAt(index, matrix);
      fill.setColorAt(index, new THREE.Color(entry.color ?? 0xf2a93b));
    }
    fill.instanceMatrix.needsUpdate = true;
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true;

    // Quad outlines only: EdgesGeometry keeps each box's 12 clean face edges
    // and drops the triangle diagonals a wireframe-mesh pass would add.
    // The 12 edges are instanced per box with per-instance center/scale.
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const wireGeometry = new THREE.InstancedBufferGeometry();
    // Clone the attribute so disposing the template geometry below cannot
    // release the GL buffer the instanced outline still draws from.
    wireGeometry.setAttribute('position', edgeGeometry.getAttribute('position').clone());
    const centers = new Float32Array(entries.length * 3);
    const sizes = new Float32Array(entries.length);
    for (let index = 0; index < entries.length; index++) {
      centers[index * 3] = entries[index].center.x;
      centers[index * 3 + 1] = entries[index].center.y;
      centers[index * 3 + 2] = entries[index].center.z;
      sizes[index] = entries[index].size;
    }
    wireGeometry.setAttribute('iCenter', new THREE.InstancedBufferAttribute(centers, 3));
    wireGeometry.setAttribute('iScale', new THREE.InstancedBufferAttribute(sizes, 1));
    wireGeometry.instanceCount = entries.length;
    edgeGeometry.dispose();
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x74d9ff,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false
    });
    wireMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = [
        'attribute vec3 iCenter;',
        'attribute float iScale;',
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          'vec3 transformed = vec3( position * iScale ) + iCenter;'
        )
      ].join('\n');
    };
    wireMaterial.customProgramCacheKey = () => 'hammer-ghost-quad-wire-v1';
    const wire = new THREE.LineSegments(wireGeometry, wireMaterial);

    fill.renderOrder = 38;
    wire.renderOrder = 39;
    fill.frustumCulled = false;
    wire.frustumCulled = false;
    this.inventoryPlacementGroup.add(fill, wire);
    this.inventoryPlacementFill = fill;
    this.inventoryPlacementWire = wire;
    // Slot changes can occur just after the periodic scene scan; hook the new
    // materials immediately so the ghost follows the torus on its first frame.
    hookSceneMaterials(this.inventoryPlacementGroup);
    return true;
  }

  setInventoryPlacementPreview(preview) {
    if (!this.inventoryPlacementGroup) return;
    if (!preview?.slot || !preview.position) {
      this.inventoryPlacementGroup.visible = false;
      return;
    }
    if (preview.slot !== this.inventoryPlacementSlot) {
      this.inventoryPlacementSlot = preview.slot;
      if (!this.rebuildInventoryPlacementPreview(preview.slot)) {
        this.inventoryPlacementGroup.visible = false;
        return;
      }
    }
    this.inventoryPlacementGroup.position.copy(preview.position);
    this.inventoryPlacementGroup.visible = true;
  }

  setupSelectionHologram() {
    // 3D holographic box for confirmed Selector regions.
    this.selectionGroup = new THREE.Group();
    this.selectionGroup.name = 'SelectionHologram';

    // Outer Wireframe
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00d2d3,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false
    });
    this.selectionWireframe = new THREE.LineSegments(edgesGeo, lineMat);
    this.selectionWireframe.renderOrder = 42;
    this.selectionGroup.add(this.selectionWireframe);

    // Inner Translucent Shimmer Plane Box
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.selectionFill = new THREE.Mesh(boxGeo, fillMat);
    this.selectionFill.renderOrder = 41;
    this.selectionGroup.add(this.selectionFill);

    this.selectionGroup.visible = false;
    this.scene.add(this.selectionGroup);

    // Exact-cell mode uses independent breathing cells rather than a single
    // bounding box, so sparse Shift selections remain visually unambiguous.
    this.selectionCellsGroup = new THREE.Group();
    this.selectionCellsGroup.name = 'SingleCellSelectionHologram';
    this.selectionCellBoxGeometry = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
    this.selectionCellEdgeGeometry = new THREE.EdgesGeometry(this.selectionCellBoxGeometry);
    this.selectionCellLineMaterial = new THREE.LineBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false
    });
    this.selectionCellFillMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.selectionCellsSignature = '';
    this.selectionCellsGroup.visible = false;
    this.scene.add(this.selectionCellsGroup);

    // Micro-mode sparse selection: each selected 0.2 m cell gets its own
    // breathing hologram so Tab-toggled micro picks read distinctly from the
    // standard orange single-cell mode.
    this.selectionMicroCellsGroup = new THREE.Group();
    this.selectionMicroCellsGroup.name = 'MicroCellSelectionHologram';
    this.selectionMicroCellBoxGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2, 2, 2, 2);
    this.selectionMicroCellEdgeGeometry = new THREE.EdgesGeometry(this.selectionMicroCellBoxGeometry);
    this.selectionMicroCellLineMaterial = new THREE.LineBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false
    });
    this.selectionMicroCellFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.selectionMicroCellsSignature = '';
    this.selectionMicroCellsGroup.visible = false;
    this.scene.add(this.selectionMicroCellsGroup);
  }

  setCursor(hitPos, size = 1) {
    if (hitPos) {
      this.cursorMesh.position.set(hitPos.x + size / 2, hitPos.y + size / 2, hitPos.z + size / 2);
      this.cursorMesh.scale.setScalar(size);
      this.cursorMesh.visible = true;
    } else {
      this.cursorMesh.visible = false;
    }
  }

  setEntityPreviewCanvas(canvas) {
    if (!canvas || this.previewCanvas === canvas) return;

    if (this.previewCanvas) {
      this.previewCanvas.removeEventListener('pointerdown', this.onPreviewPointerDown);
      this.previewCanvas.removeEventListener('pointermove', this.onPreviewPointerMove);
      this.previewCanvas.removeEventListener('pointerup', this.onPreviewPointerUp);
      this.previewCanvas.removeEventListener('pointercancel', this.onPreviewPointerUp);
      this.previewCanvas.removeEventListener('contextmenu', this.onPreviewContextMenu);
    }
    if (this.previewRenderer) this.previewRenderer.dispose();
    this.previewCanvas = canvas;
    this.previewCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    this.previewCamera.layers.set(0);
    this.previewCamera.layers.enable(ENTITY_PREVIEW_LAYER);

    this.previewRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power'
    });
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = 1.15;
    this.previewRenderer.shadowMap.enabled = true;
    this.previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.previewForceArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      1,
      0xffb142,
      0.32,
      0.18
    );
    this.previewForceArrow.name = 'EntityPreviewAppliedForce';
    this.previewForceArrow.traverse(object => object.layers.set(ENTITY_PREVIEW_LAYER));
    this.previewForceArrow.visible = false;
    this.scene.add(this.previewForceArrow);

canvas.addEventListener('pointerdown', this.onPreviewPointerDown);
    canvas.addEventListener('pointermove', this.onPreviewPointerMove);
    canvas.addEventListener('pointerup', this.onPreviewPointerUp);
    canvas.addEventListener('pointercancel', this.onPreviewPointerUp);
    canvas.addEventListener('contextmenu', this.onPreviewContextMenu);
  }

  setEntityPreviewTarget(contraption) {
    if (this.previewTarget === contraption) return;

    this.previewTarget = contraption || null;
    this.previewOrbit = this.createDefaultPreviewOrbit();
    this.previewInteraction = null;
    this.previewArrowHoldUntil = 0;
    if (this.previewForceArrow) this.previewForceArrow.visible = false;
    this.previewCanvas?.classList.remove('is-dragging', 'is-applying-force');
  }

  createDefaultPreviewOrbit() {
    return {
      yaw: 0,
      pitch: 0,
      distance: 1,
      initialized: false,
      userControlled: false
    };
  }

  getEntityPreviewPointer(event) {
    if (!this.previewCanvas) return this.previewPointer.set(0, 0);
    const rect = this.previewCanvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    return this.previewPointer.set(
      ((event.clientX - rect.left) / width) * 2 - 1,
      -((event.clientY - rect.top) / height) * 2 + 1
    );
  }

  handleEntityPreviewPointerDown(event) {
    if (event.button !== 0 || !this.previewTarget || !this.previewCamera) return;
    event.preventDefault();
    event.stopPropagation();

    this.previewCanvas?.setPointerCapture?.(event.pointerId);
    this.previewTarget.rootGroup?.updateMatrixWorld(true);
    this.previewCamera.updateMatrixWorld(true);
    this.previewRaycaster.setFromCamera(this.getEntityPreviewPointer(event), this.previewCamera);
    // Entity meshes use flat-space geometry and are bent by the GPU; locally linearize the bent ray back into flat space.
    const ray = this.previewRaycaster.ray;
    const flatOrigin = unbendPoint(ray.origin.x, ray.origin.y, ray.origin.z, new THREE.Vector3());
    const flatDir = unbendDirection(flatOrigin.x, flatOrigin.y, flatOrigin.z, ray.direction, new THREE.Vector3());
    ray.origin.copy(flatOrigin);
    ray.direction.copy(flatDir);
    const targetHits = this.previewTarget.rootGroup
      ? this.previewRaycaster.intersectObject(this.previewTarget.rootGroup, true)
        .filter(hit => hit.object.isMesh)
      : [];

    if (targetHits.length > 0) {
      const hit = targetHits[0];
      let currentObj = hit.object;
      let hitNodeId = 'root';
      while (currentObj && currentObj !== this.previewTarget.rootGroup) {
        if (currentObj.name?.startsWith('Entity_')) {
          hitNodeId = currentObj.name.replace('Entity_', '');
          break;
        }
        currentObj = currentObj.parent;
      }
      if (this.onEntityPreviewNodeSelect) {
        this.onEntityPreviewNodeSelect(hitNodeId);
      }

      this.previewInteraction = {
        mode: 'force',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        localPoint: this.previewTarget.worldToLocal(hit.point),
        force: new THREE.Vector3(),
        appliedFrames: 0,
        active: true
      };
      this.previewArrowHoldUntil = Infinity;
      this.previewCanvas?.classList.add('is-dragging', 'is-applying-force');
      
      return;
    }

    this.previewInteraction = {
      mode: 'orbit',
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      active: true
    };
    this.previewOrbit.userControlled = true;
    this.previewCanvas?.classList.add('is-dragging');
    this.previewCanvas?.classList.remove('is-applying-force');
    if (this.previewForceArrow) this.previewForceArrow.visible = false;
    
  }

  handleEntityPreviewPointerMove(event) {
    const interaction = this.previewInteraction;
    if (!interaction?.active || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    if (interaction.mode === 'force') {
      const forceOrigin = this.previewTarget.localToWorld(interaction.localPoint);
      interaction.force.copy(calculatePreviewDragForce(
        this.previewCamera.quaternion,
        event.clientX - interaction.startX,
        event.clientY - interaction.startY,
        this.previewTarget?.maxForce || 0,
        forceOrigin
      ));
      this.updatePreviewForceArrow(interaction);
      
      return;
    }

    const dx = event.clientX - interaction.lastX;
    const dy = event.clientY - interaction.lastY;
    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;
    this.previewOrbit.yaw -= dx * 0.008;
    this.previewOrbit.pitch = THREE.MathUtils.clamp(
      this.previewOrbit.pitch + dy * 0.006,
      -1.25,
      1.25
    );
  }

  handleEntityPreviewPointerUp(event) {
    const interaction = this.previewInteraction;
    if (!interaction?.active || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    interaction.active = false;
    this.previewCanvas?.releasePointerCapture?.(event.pointerId);
    this.previewCanvas?.classList.remove('is-dragging', 'is-applying-force');

    if (interaction.mode === 'force') {
      if (interaction.appliedFrames === 0 && interaction.force.lengthSq() > 0) {
        this.applyEntityPreviewForce(interaction);
      }
      this.previewArrowHoldUntil = performance.now() + 650;
      
    } else {
      this.previewInteraction = null;
      }
  }

  applyEntityPreviewForce(interaction) {
    if (!this.previewTarget || !interaction?.localPoint || !interaction?.force) return;
    const force = interaction.force;
    const point = interaction.localPoint;
    this.previewTarget.applyForceAt(
      [force.x, force.y, force.z],
      [point.x, point.y, point.z]
    );
    interaction.appliedFrames += 1;
  }

  updatePreviewForceArrow(interaction = this.previewInteraction) {
    if (!this.previewForceArrow || !this.previewTarget || interaction?.mode !== 'force') return;
    const magnitude = interaction.force.length();
    if (magnitude < 0.01) {
      this.previewForceArrow.visible = false;
      return;
    }

    const origin = this.previewTarget.localToWorld(interaction.localPoint);
    const direction = interaction.force.clone().normalize();
    const limit = Math.max(1, this.previewTarget.maxForce * ENTITY_PREVIEW_FORCE_LIMIT_RATIO);
    const ratio = THREE.MathUtils.clamp(magnitude / limit, 0, 1);
    const radius = Math.max(0.75, this.previewTarget.boundingRadius || 0.75);
    const length = radius * (0.48 + ratio * 1.65);
    this.previewForceArrow.position.copy(origin);
    this.previewForceArrow.setDirection(direction);
    this.previewForceArrow.setLength(
      length,
      Math.min(radius * 0.52, length * 0.38),
      Math.min(radius * 0.28, length * 0.2)
    );
    this.previewForceArrow.visible = true;
    this.previewForceArrow.updateMatrixWorld(true);
  }


  renderEntityPreview(contraption = this.previewTarget) {
    if (!this.previewRenderer || !this.previewCamera || !this.previewCanvas || !contraption) return;
    this.setEntityPreviewTarget(contraption);

    const width = Math.max(1, Math.round(this.previewCanvas.clientWidth));
    const height = Math.max(1, Math.round(this.previewCanvas.clientHeight));
    if (width <= 1 || height <= 1) return;

    const pixelRatio = this.previewRenderer.getPixelRatio();
    if (this.previewCanvas.width !== Math.round(width * pixelRatio)
      || this.previewCanvas.height !== Math.round(height * pixelRatio)) {
      this.previewRenderer.setSize(width, height, false);
    }

    const aspect = width / height;
    const pose = calculateEntityPreviewCameraPose(contraption, aspect, this.previewCamera.fov);
    if (!this.previewOrbit.initialized || !this.previewOrbit.userControlled) {
      const offset = pose.position.clone().sub(pose.center);
      const distance = Math.max(0.01, offset.length());
      this.previewOrbit.yaw = Math.atan2(offset.x, offset.z);
      this.previewOrbit.pitch = Math.asin(THREE.MathUtils.clamp(offset.y / distance, -1, 1));
      this.previewOrbit.distance = distance;
      this.previewOrbit.initialized = true;
    }

    const cosPitch = Math.cos(this.previewOrbit.pitch);
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.previewOrbit.yaw) * cosPitch,
      Math.sin(this.previewOrbit.pitch),
      Math.cos(this.previewOrbit.yaw) * cosPitch
    ).multiplyScalar(this.previewOrbit.distance);
    this.previewCamera.aspect = aspect;
    this.previewCamera.near = Math.max(0.03, pose.radius * 0.015);
    this.previewCamera.far = Math.max(500, pose.distance + pose.radius * 12);
    this.previewCamera.position.copy(pose.center).add(cameraOffset);
    this.previewCamera.up.set(0, 1, 0);
    this.previewCamera.lookAt(pose.center);
    this.previewCamera.updateProjectionMatrix();
    this.previewCamera.updateMatrixWorld(true);
    // Torus world: bend the preview camera as well; the GPU bends entity meshes.
    applyCameraBend(this.previewCamera);

    if (this.previewInteraction?.mode === 'force') {
      if (this.previewInteraction.active && this.previewInteraction.force.lengthSq() > 0) {
        this.applyEntityPreviewForce(this.previewInteraction);
      }
      this.updatePreviewForceArrow(this.previewInteraction);
      if (!this.previewInteraction.active && performance.now() > this.previewArrowHoldUntil) {
        this.previewForceArrow.visible = false;
        this.previewInteraction = null;
          }
    }

    this.previewRenderer.render(this.scene, this.previewCamera);
  }

  /**
   * Selector focus guide: a simple 1x1x1 wireframe for the block under the crosshair.
   */
  setupFocusBlockGuide() {
    const box = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
    const edges = new THREE.EdgesGeometry(box);
    const mat = new THREE.LineBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.85,
      // The wireframe is inside the block, so disable depth testing for an X-ray view.
      depthTest: false,
      depthWrite: false
    });
    this.focusBlockGuide = new THREE.LineSegments(edges, mat);
    this.focusBlockGuide.name = 'FocusBlockGuide';
    this.focusBlockGuide.renderOrder = 40;
    this.focusBlockGuide.visible = false;
    this.scene.add(this.focusBlockGuide);
  }

  setFocusBlockGuide(center, active = false, cellSize = 1) {
    if (!this.focusBlockGuide) return;
    if (!center) {
      this.focusBlockGuide.visible = false;
      return;
    }
    this.focusBlockGuide.position.set(center.x, center.y, center.z);
    // The geometry is 1.04 m across, so scaling by the target cell size makes
    // the guide hug a 1 m standard cell or a 0.2 m micro block.
    this.focusBlockGuide.scale.setScalar(cellSize);
    // Orange while point 1 is set; cyan while waiting for point 1.
    (this.focusBlockGuide.material as THREE.LineBasicMaterial).color
      .setHex(active ? 0xff9f43 : 0x48dbfb);
    this.focusBlockGuide.visible = true;
  }

  clearFocusBlockGuide() {
    if (this.focusBlockGuide) this.focusBlockGuide.visible = false;
  }

  setWrenchTether(startPoint: THREE.Vector3 | null, endPoint: THREE.Vector3 | null) {
    if (!this.wrenchTetherLine) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false
      });
      this.wrenchTetherLine = new THREE.Line(geom, mat);
      this.wrenchTetherLine.name = 'WrenchTetherLine';
      this.wrenchTetherLine.renderOrder = 90;
      this.wrenchTetherLine.frustumCulled = false;
      this.wrenchTetherLine.visible = false;
      this.scene.add(this.wrenchTetherLine);
    }
    if (!startPoint || !endPoint) {
      this.wrenchTetherLine.visible = false;
      return;
    }
    const posAttr = this.wrenchTetherLine.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, startPoint.x, startPoint.y, startPoint.z);
    posAttr.setXYZ(1, endPoint.x, endPoint.y, endPoint.z);
    posAttr.needsUpdate = true;
    this.wrenchTetherLine.visible = true;
  }


  /**
   * Live selector-box preview in a desktop drag-selection style.
   * After point 1 is set, show a translucent AABB from the start to the crosshair;
   * the second click confirms it.
   */
  setupBoxSelectionPreview() {
    this.boxSelectionGroup = new THREE.Group();
    this.boxSelectionGroup.name = 'BoxSelectionPreview';

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.boxSelectionFill = new THREE.Mesh(unit, fillMat);
    this.boxSelectionFill.renderOrder = 41;
    this.boxSelectionGroup.add(this.boxSelectionFill);

    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x48dbfb,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false
    });
    this.boxSelectionEdges = new THREE.LineSegments(new THREE.EdgesGeometry(unit), edgeMat);
    this.boxSelectionEdges.renderOrder = 42;
    this.boxSelectionGroup.add(this.boxSelectionEdges);

    this.boxSelectionGroup.visible = false;
    this.scene.add(this.boxSelectionGroup);
  }

  setBoxSelectionPreview(a, b, micro = false) {
    if (!this.boxSelectionGroup) return;
    if (!a || !b) {
      this.boxSelectionGroup.visible = false;
      return;
    }
    if (micro) {
      // Micro mode (Selector Tab): a/b are the meter-space origins of 0.2 m
      // cells, so quantize to micro indices and span whole micro cells.
      const minMx = Math.floor(Math.min(a.x, b.x) * 5 + 1e-6);
      const maxMx = Math.floor(Math.max(a.x, b.x) * 5 + 1e-6);
      const minMy = Math.floor(Math.min(a.y, b.y) * 5 + 1e-6);
      const maxMy = Math.floor(Math.max(a.y, b.y) * 5 + 1e-6);
      const minMz = Math.floor(Math.min(a.z, b.z) * 5 + 1e-6);
      const maxMz = Math.floor(Math.max(a.z, b.z) * 5 + 1e-6);
      const sx = (maxMx - minMx + 1) * 0.2;
      const sy = (maxMy - minMy + 1) * 0.2;
      const sz = (maxMz - minMz + 1) * 0.2;
      updateTorusSelectionBoxGeometry(this.boxSelectionFill, this.boxSelectionEdges, sx, sy, sz);
      this.boxSelectionGroup.position.set(
        minMx * 0.2 + sx / 2,
        minMy * 0.2 + sy / 2,
        minMz * 0.2 + sz / 2
      );
      this.boxSelectionFill.scale.set(sx, sy, sz);
      this.boxSelectionEdges.scale.set(sx, sy, sz);
      this.boxSelectionGroup.visible = true;
      return;
    }
    // Block alignment rounds corners, adds one cell to the span, and centers on
    // cell centers. This exactly matches updateSelectionHologram, so the preview
    // and confirmed selection have identical geometry.
    const minX = Math.floor(Math.min(a.x, b.x)), maxX = Math.floor(Math.max(a.x, b.x));
    const minY = Math.floor(Math.min(a.y, b.y)), maxY = Math.floor(Math.max(a.y, b.y));
    const minZ = Math.floor(Math.min(a.z, b.z)), maxZ = Math.floor(Math.max(a.z, b.z));
    const sx = Math.max(0.001, maxX - minX + 1);
    const sy = Math.max(0.001, maxY - minY + 1);
    const sz = Math.max(0.001, maxZ - minZ + 1);
    updateTorusSelectionBoxGeometry(this.boxSelectionFill, this.boxSelectionEdges, sx, sy, sz);
    this.boxSelectionGroup.position.set((minX + maxX + 1) / 2, (minY + maxY + 1) / 2, (minZ + maxZ + 1) / 2);
    this.boxSelectionFill.scale.set(sx, sy, sz);
    this.boxSelectionEdges.scale.set(sx, sy, sz);
    this.boxSelectionGroup.visible = true;
  }

  private buildCulledVoxelHologram(
    cells: Array<{ x: number; y: number; z: number }>,
    cellSize: number
  ): { fillGeo: THREE.BufferGeometry; edgeGeo: THREE.BufferGeometry } | null {
    if (!cells || cells.length === 0) return null;

    const cellSet = new Set<string>();
    for (const c of cells) {
      cellSet.add(`${c.x},${c.y},${c.z}`);
    }

    const faces = [
      // Top (+Y)
      { dir: [0, 1, 0], norm: [0, 1, 0], quad: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      // Bottom (-Y)
      { dir: [0, -1, 0], norm: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      // North (-Z)
      { dir: [0, 0, -1], norm: [0, 0, -1], quad: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
      // South (+Z)
      { dir: [0, 0, 1], norm: [0, 0, 1], quad: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
      // West (-X)
      { dir: [-1, 0, 0], norm: [-1, 0, 0], quad: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
      // East (+X)
      { dir: [1, 0, 0], norm: [1, 0, 0], quad: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] }
    ];

    const fillPositions: number[] = [];
    const fillNormals: number[] = [];
    const edgePositions: number[] = [];
    const edgeSet = new Set<string>();

    for (const c of cells) {
      for (const f of faces) {
        const nx = c.x + f.dir[0];
        const ny = c.y + f.dir[1];
        const nz = c.z + f.dir[2];
        if (cellSet.has(`${nx},${ny},${nz}`)) continue; // Internal overlapping face culled!

        const q = f.quad;
        const v0 = [(c.x + q[0][0]) * cellSize, (c.y + q[0][1]) * cellSize, (c.z + q[0][2]) * cellSize];
        const v1 = [(c.x + q[1][0]) * cellSize, (c.y + q[1][1]) * cellSize, (c.z + q[1][2]) * cellSize];
        const v2 = [(c.x + q[2][0]) * cellSize, (c.y + q[2][1]) * cellSize, (c.z + q[2][2]) * cellSize];
        const v3 = [(c.x + q[3][0]) * cellSize, (c.y + q[3][1]) * cellSize, (c.z + q[3][2]) * cellSize];

        fillPositions.push(...v0, ...v1, ...v2);
        fillPositions.push(...v0, ...v2, ...v3);
        fillNormals.push(...f.norm, ...f.norm, ...f.norm);
        fillNormals.push(...f.norm, ...f.norm, ...f.norm);

        const quadEdges = [
          [v0, v1],
          [v1, v2],
          [v2, v3],
          [v3, v0]
        ];
        for (const [p1, p2] of quadEdges) {
          const k1 = `${Math.round(p1[0] * 1000)},${Math.round(p1[1] * 1000)},${Math.round(p1[2] * 1000)}`;
          const k2 = `${Math.round(p2[0] * 1000)},${Math.round(p2[1] * 1000)},${Math.round(p2[2] * 1000)}`;
          const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edgePositions.push(...p1, ...p2);
          }
        }
      }
    }

    if (fillPositions.length === 0) return null;

    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
    fillGeo.setAttribute('normal', new THREE.Float32BufferAttribute(fillNormals, 3));

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));

    return { fillGeo, edgeGeo };
  }

  clearBoxSelectionPreview() {
    if (this.boxSelectionGroup) this.boxSelectionGroup.visible = false;
  }

  updateSelectionHologram(bounds, connectedBlocks = null, microBlocks = null) {
    if (Array.isArray(microBlocks)) {
      this.selectionCellsGroup.visible = false;
      this.selectionMicroCellsGroup.visible = false;

      if (microBlocks.length === 0) {
        this.selectionGroup.visible = false;
        return;
      }

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const b of microBlocks) {
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.z < minZ) minZ = b.z;
        if (b.x > maxX) maxX = b.x;
        if (b.y > maxY) maxY = b.y;
        if (b.z > maxZ) maxZ = b.z;
      }

      const sx = Math.max(0.001, (maxX - minX + 1) * 0.2);
      const sy = Math.max(0.001, (maxY - minY + 1) * 0.2);
      const sz = Math.max(0.001, (maxZ - minZ + 1) * 0.2);

      const cx = (minX + maxX + 1) * 0.2 * 0.5;
      const cy = (minY + maxY + 1) * 0.2 * 0.5;
      const cz = (minZ + maxZ + 1) * 0.2 * 0.5;

      updateTorusSelectionBoxGeometry(this.selectionFill, this.selectionWireframe, sx, sy, sz);
      this.selectionGroup.position.set(cx, cy, cz);
      this.selectionGroup.scale.set(sx, sy, sz);
      this.selectionGroup.visible = true;

      // Pulse opacity subtly matching standard mode
      const t = performance.now() * 0.003;
      const pulse = 0.75 + Math.sin(t) * 0.2;
      this.selectionWireframe.material.opacity = pulse;
      this.selectionFill.material.opacity = 0.12 + Math.sin(t) * 0.06;
      return;
    }

    if (connectedBlocks !== null) {
      this.selectionGroup.visible = false;
      this.selectionMicroCellsGroup.visible = false;
      const signature = connectedBlocks
        .map(block => `${block.x},${block.y},${block.z}`)
        .sort()
        .join('|');
      if (signature !== this.selectionCellsSignature) {
        for (const child of this.selectionCellsGroup.children as any[]) {
          child.geometry?.dispose();
        }
        this.selectionCellsGroup.clear();
        const geos = this.buildCulledVoxelHologram(connectedBlocks, 1.0);
        if (geos) {
          const fill = new THREE.Mesh(geos.fillGeo, this.selectionCellFillMaterial);
          const lines = new THREE.LineSegments(geos.edgeGeo, this.selectionCellLineMaterial);
          fill.renderOrder = 20;
          lines.renderOrder = 21;
          this.selectionCellsGroup.add(fill, lines);
        }
        this.selectionCellsSignature = signature;
      }
      const t = performance.now() * 0.004;
      const pulse = (Math.sin(t) + 1) * 0.5;
      this.selectionCellLineMaterial.opacity = 0.5 + pulse * 0.46;
      this.selectionCellFillMaterial.opacity = 0.06 + pulse * 0.17;
      this.selectionCellsGroup.visible = connectedBlocks.length > 0;
      return;
    }

    this.selectionCellsGroup.visible = false;
    this.selectionMicroCellsGroup.visible = false;

    if (!bounds) {
      this.selectionGroup.visible = false;
      return;
    }

    const sx = bounds.maxX - bounds.minX + 1;
    const sy = bounds.maxY - bounds.minY + 1;
    const sz = bounds.maxZ - bounds.minZ + 1;

    const cx = (bounds.minX + bounds.maxX + 1) / 2;
    const cy = (bounds.minY + bounds.maxY + 1) / 2;
    const cz = (bounds.minZ + bounds.maxZ + 1) / 2;

    updateTorusSelectionBoxGeometry(this.selectionFill, this.selectionWireframe, sx, sy, sz);
    this.selectionGroup.position.set(cx, cy, cz);
    this.selectionGroup.scale.set(sx, sy, sz);
    this.selectionGroup.visible = true;

    // Pulse opacity subtly
    const t = performance.now() * 0.003;
    const pulse = 0.75 + Math.sin(t) * 0.2;
    this.selectionWireframe.material.opacity = pulse;
    this.selectionFill.material.opacity = 0.12 + Math.sin(t) * 0.06;
  }



  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setupPlayerAvatar() {
    this.playerAvatar = new THREE.Group();
    this.playerAvatarCharacter = null;
    this.playerFirstPersonHand = null;
    this.playerAvatar.visible = false;
    this.scene.add(this.playerAvatar);

    void loadCuteCharacter(this.playerAppearance.skinUrl, {
      model: this.playerAppearance.skinModel,
      height: 1.8,
      showOverlay: true,
      castShadow: true
    }).then(character => {
      if (!this.playerAvatar) {
        character.dispose();
        return;
      }
      this.playerAvatarCharacter = character;
      this.playerAvatar.add(character.object3d);
      this.playerFirstPersonHand = character.firstPersonHand;
      this.playerFirstPersonHand.visible = !this.playerAvatar.visible;
      this.camera.add(this.playerFirstPersonHand);
      // The model arrives asynchronously, so hook it immediately instead of
      // waiting for the scene's periodic dynamic-material scan.
      hookSceneMaterials(character.object3d);
    }).catch(error => {
      console.error('Failed to load the EntropyDrop player skin:', error);
    });
  }

  setupRemotePlayers() {
    this.remotePlayersGroup = new THREE.Group();
    this.remotePlayersGroup.name = 'RemotePlayers';
    this.remotePlayers = new Map();
    this.scene.add(this.remotePlayersGroup);
  }

  updateRemotePlayers(players: any[], dt = 0.016) {
    if (!this.remotePlayersGroup || !this.remotePlayers) return;

    const seenIds = new Set<string>();
    const now = performance.now();

    for (const p of players) {
      if (p.is_self) continue;
      const id = String(p.user_id || p.player_entity_id);
      seenIds.add(id);

      let record = this.remotePlayers.get(id);
      if (!record) {
        const group = new THREE.Group();
        group.name = `RemotePlayer_${id}`;
        group.position.set(p.x, p.y, p.z);
        group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw || 0);

        const nameTag = createPlayerNameTag(p.username || 'Player');
        group.add(nameTag);
        const fallback = createRemotePlayerFallback();
        group.add(fallback);

        record = {
          id,
          group,
          character: null,
          fallback,
          nameTag,
          targetPosition: new THREE.Vector3(p.x, p.y, p.z),
          targetYaw: p.yaw || 0,
          currentYaw: p.yaw || 0,
          lastSeen: now,
          skinUrl: p.minecraft_skin_url,
          skinModel: p.minecraft_skin_model || 'strong',
          speed: 0,
          loadingSkin: false
        };

        this.remotePlayers.set(id, record);
        this.remotePlayersGroup.add(group);
      } else {
        record.targetPosition.set(p.x, p.y, p.z);
        record.targetYaw = p.yaw || 0;
        record.lastSeen = now;
      }

      if (!record.character && !record.loadingSkin) {
        record.loadingSkin = true;
        void loadCuteCharacter(record.skinUrl, {
          model: record.skinModel,
          height: 1.8,
          showOverlay: true,
          castShadow: true
        }).then(character => {
          record.loadingSkin = false;
          if (!this.remotePlayers?.has(id)) {
            character.dispose();
            return;
          }
          record.character = character;
          record.group.add(character.object3d);
          hookSceneMaterials(character.object3d);
          disposeRemotePlayerFallback(record.fallback);
          record.fallback = null;
        }).catch(err => {
          record.loadingSkin = false;
          console.warn('Failed to load remote player skin:', err);
        });
      } else if (p.minecraft_skin_url && record.skinUrl !== p.minecraft_skin_url && !record.loadingSkin) {
        record.loadingSkin = true;
        record.skinUrl = p.minecraft_skin_url;
        record.skinModel = p.minecraft_skin_model || 'strong';
        void loadCuteCharacter(record.skinUrl, {
          model: record.skinModel,
          height: 1.8,
          showOverlay: true,
          castShadow: true
        }).then(character => {
          record.loadingSkin = false;
          if (!this.remotePlayers?.has(id)) {
            character.dispose();
            return;
          }
          if (record.character) {
            record.character.dispose();
          }
          record.character = character;
          record.group.add(character.object3d);
          hookSceneMaterials(character.object3d);
          disposeRemotePlayerFallback(record.fallback);
          record.fallback = null;
        }).catch(err => {
          record.loadingSkin = false;
          console.warn('Failed to reload remote player skin:', err);
        });
      }

      // Smoothly interpolate position with toroidal wrap
      let dx = wrapX(record.targetPosition.x) - wrapX(record.group.position.x);
      if (dx > TORUS_SIZE_X / 2) dx -= TORUS_SIZE_X;
      else if (dx < -TORUS_SIZE_X / 2) dx += TORUS_SIZE_X;

      let dz = wrapZ(record.targetPosition.z) - wrapZ(record.group.position.z);
      if (dz > TORUS_SIZE_Z / 2) dz -= TORUS_SIZE_Z;
      else if (dz < -TORUS_SIZE_Z / 2) dz += TORUS_SIZE_Z;

      const dy = record.targetPosition.y - record.group.position.y;
      const dist = Math.hypot(dx, dz);
      record.speed = THREE.MathUtils.lerp(record.speed, dist / Math.max(0.001, dt), Math.min(1, dt * 8));

      const lerpFactor = Math.min(1, dt * 12);
      record.group.position.x = wrapX(record.group.position.x + dx * lerpFactor);
      record.group.position.y = record.group.position.y + dy * lerpFactor;
      record.group.position.z = wrapZ(record.group.position.z + dz * lerpFactor);

      let dyaw = record.targetYaw - record.currentYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      record.currentYaw += dyaw * lerpFactor;
      record.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), record.currentYaw);

      if (record.character) {
        const forwardX = -Math.sin(record.currentYaw);
        const forwardZ = -Math.cos(record.currentYaw);
        const rightX = Math.cos(record.currentYaw);
        const rightZ = -Math.sin(record.currentYaw);
        const vx = dx / Math.max(0.001, dt);
        const vz = dz / Math.max(0.001, dt);
        const forwardSpeed = vx * forwardX + vz * forwardZ;
        const sideSpeed = vx * rightX + vz * rightZ;

        record.character.update(dt, {
          speed: record.speed,
          forwardSpeed,
          sideSpeed,
          grounded: true,
          flying: false
        });
      }
      record.group.updateMatrixWorld(true);
    }

    // Clean up offline/inactive players (> 15 seconds)
    for (const [id, record] of this.remotePlayers.entries()) {
      if (!seenIds.has(id) && now - record.lastSeen > 15000) {
        if (record.character) record.character.dispose();
        disposeRemotePlayerFallback(record.fallback);
        if (record.nameTag?.material?.map) record.nameTag.material.map.dispose();
        if (record.nameTag?.material) record.nameTag.material.dispose();
        record.group.removeFromParent();
        this.remotePlayers.delete(id);
      }
    }
  }

  setPlayerAvatarVisible(visible: boolean) {
    if (this.playerAvatar) {
      this.playerAvatar.visible = !!visible;
    }
    if (this.playerFirstPersonHand) {
      this.playerFirstPersonHand.visible = !visible;
    }
  }

  updatePlayerAvatar(playerPos: THREE.Vector3, playerYaw = 0, dt = 0, playerMotion: any = null) {
    if (!this.playerAvatar) return;
    if (this.playerAvatar.visible) {
      // Keep the avatar in logical flat-world coordinates. The same torus shader
      // that bends terrain bends every character vertex and its normals at render time.
      this.playerAvatar.position.copy(playerPos);
      this.playerAvatar.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    }
    if (this.playerAvatarCharacter) {
      const velocity = playerMotion?.velocity;
      const speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
      const forwardX = -Math.sin(playerYaw);
      const forwardZ = -Math.cos(playerYaw);
      const rightX = Math.cos(playerYaw);
      const rightZ = -Math.sin(playerYaw);
      this.playerAvatarCharacter.update(dt, {
        speed,
        forwardSpeed: velocity ? velocity.x * forwardX + velocity.z * forwardZ : 0,
        sideSpeed: velocity ? velocity.x * rightX + velocity.z * rightZ : 0,
        verticalSpeed: velocity?.y ?? 0,
        maxSpeed: playerMotion?.maxSpeed,
        grounded: playerMotion?.grounded,
        flying: playerMotion?.flying,
        lookPitch: playerMotion?.lookPitch
      });
    }
    if (this.playerAvatar.visible) this.playerAvatar.updateMatrixWorld(true);
  }

  update(dt, playerPos, playerYaw = 0, playerMotion: any = null) {
    // Update player avatar when in third-person view
    this.updatePlayerAvatar(playerPos, playerYaw, dt, playerMotion);

    // Fixed daytime: sun stays at 10:00 AM (no day/night cycle).
    const sunAngle = ((10 - 6) / 24) * Math.PI * 2;
    const sunDist = 80;
    bendPoint(playerPos.x, playerPos.y, playerPos.z, this.bentLightTarget);
    const flatSunDirection = this.bentLightDirection.set(
      Math.cos(sunAngle),
      Math.max(0.1, Math.sin(sunAngle)),
      0.25
    ).normalize();
    bendDirection(playerPos.x, playerPos.y, playerPos.z, flatSunDirection, this.bentLightDirection);

    // Lights are not vertices and therefore are not affected by the torus shader.
    // Put the directional light directly in bent space so lighting and shadows
    // follow the local surface instead of pointing at a stale flat-world target.
    this.sunLight.target.position.copy(this.bentLightTarget);
    this.sunLight.position.copy(this.bentLightTarget).addScaledVector(this.bentLightDirection, sunDist);
    this.sunLight.target.updateMatrixWorld();

    // Fixed daylight fog. The sky dome renders the background gradient; keep
    // its base and the fog color identical so far terrain fades into the sky.
    this.scene.fog.color.copy(this.skyColorDay);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.skyColorDay);
    }
    this.skyDomeUniforms.uSkyColor.value.copy(this.skyColorDay);

    this.sunLight.intensity = 1.5;
    this.hemiLight.intensity = 0.8;
  }

  setWorld(world) {
    this.world = world;
  }

  render() {
    if (!this.world) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Dynamic entities and editor helpers can introduce materials at runtime.
    // Scan every 16 frames rather than traversing the entire scene graph every frame;
    // WeakSet de-duplication still keeps shader setup one-time per material.
    if (this.materialScanCountdown <= 0) {
      hookSceneMaterials(this.scene);
      this.materialScanCountdown = 15;
    } else {
      this.materialScanCountdown--;
    }

    // Rendering must never mutate the logical FPS camera. Previously the bent
    // quaternion survived into the next frame and was bent again, producing a
    // three-state terrain/sky flicker and incorrect raycasts.
    this.flatCameraPosition.copy(this.camera.position);
    this.flatCameraQuaternion.copy(this.camera.quaternion);
    try {
      applyCameraBend(this.camera);
      cullChunks(this.camera, this.world);
      this.updateSkyDome(this.camera.position);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.camera.position.copy(this.flatCameraPosition);
      this.camera.quaternion.copy(this.flatCameraQuaternion);
      this.camera.updateMatrixWorld(true);
    }
  }
}
