/**
 * 3D isometric/perspective character and layer slice preview renderer using Three.js.
 * Produces crisp, transparent-background guide previews for sticker assembly sheets.
 */

import * as THREE from 'three';
import { createCanvas } from './skinHelper.js';
import { createSkinFaceCanvas, getCutePartPose, taperCuteTorso } from './characterShape.js';
import { createSkinVoxelGeometry } from './voxelPreview.js';

let sharedRenderer = null;
function getSharedRenderer(width, height) {
  if (!sharedRenderer) {
    const canvas = document.createElement('canvas');
    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  sharedRenderer.setSize(width, height, false);
  return sharedRenderer;
}

/**
 * Creates skin UV face materials for a box.
 * Box face order in Three.js: +X (Right), -X (Left), +Y (Top), -Y (Bottom), +Z (Front), -Z (Back)
 */
function createBoxMaterials(
  skinCanvas,
  uvs,
  opacity = 1.0,
  isTransparent = false,
  highlightedFace = null,
  unlit = false,
  cuteMode = false
) {
  const materials = [];
  const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
  const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

  for (const face of faceOrder) {
    const uv = uvs[face];
    if (!uv) {
      materials.push(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
      continue;
    }

    const faceCanvas = createSkinFaceCanvas(skinCanvas, uv, cuteMode);

    const texture = new THREE.CanvasTexture(faceCanvas);
    // Canvas skin pixels are sRGB; preserve their color through rendering.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;

    const isDimmed = highlightedFace && face !== highlightedFace;
    materials.push(new Material({
      map: texture,
      color: isDimmed ? 0x000000 : 0xffffff,
      toneMapped: !unlit,
      transparent: true,
      // mc_preview2.py renders previously traversed decor voxels as
      // [0, 0, 0, 20], while the active outer face keeps its skin color.
      opacity: isDimmed ? 20 / 255 : opacity,
      alphaTest: isTransparent ? 0.01 : 0.0,
      depthWrite: !isDimmed,
      side: THREE.DoubleSide,
    }));
  }
  return materials;
}

function getHighlightedFace([x, y, z]) {
  if (z < 0) return 'front';
  if (z > 0) return 'back';
  if (x < 0) return 'left';
  if (x > 0) return 'right';
  if (y < 0) return 'top';
  if (y > 0) return 'bottom';
  return null;
}

/**
 * Builds standard Minecraft UV mappings for base and decor layers.
 */
function getSkinUVs(isSlim) {
  const armW = isSlim ? 3 : 4;
  const sOffset = isSlim ? 1 : 0;

  return {
    head: {
      // Match mc_preview2.py: the front/back axis of both head side faces
      // needs a horizontal UV reversal when mapped onto Three.js X faces.
      right: [0, 8, 8, 8, true, false],
      left: [16, 8, 8, 8, true, false],
      top: [8, 0, 8, 8, false, false],
      bottom: [16, 0, 8, 8, false, false],
      front: [8, 8, 8, 8, false, false],
      back: [24, 8, 8, 8, false, false],
    },
    hat: {
      right: [32, 8, 8, 8, true, false],
      left: [48, 8, 8, 8, true, false],
      top: [40, 0, 8, 8, false, false],
      bottom: [48, 0, 8, 8, false, false],
      front: [40, 8, 8, 8, false, false],
      back: [56, 8, 8, 8, false, false],
    },
    body: {
      right: [16, 20, 4, 12, false, false],
      left: [28, 20, 4, 12, false, false],
      top: [20, 16, 8, 4, false, false],
      bottom: [28, 16, 8, 4, false, false],
      front: [20, 20, 8, 12, false, false],
      back: [32, 20, 8, 12, false, false],
    },
    jacket: {
      right: [16, 36, 4, 12, false, false],
      left: [28, 36, 4, 12, false, false],
      top: [20, 32, 8, 4, false, false],
      bottom: [28, 32, 8, 4, false, false],
      front: [20, 36, 8, 12, false, false],
      back: [32, 36, 8, 12, false, false],
    },
    rightArm: {
      right: [40, 20, 4, 12, false, false],
      left: [48 - sOffset, 20, 4, 12, false, false],
      top: [44, 16, armW, 4, false, false],
      bottom: [48 - sOffset, 16, armW, 4, false, false],
      front: [44, 20, armW, 12, false, false],
      back: [52 - sOffset, 20, armW, 12, false, false],
    },
    rightSleeve: {
      right: [40, 36, 4, 12, false, false],
      left: [48 - sOffset, 36, 4, 12, false, false],
      top: [44, 32, armW, 4, false, false],
      bottom: [48 - sOffset, 32, armW, 4, false, false],
      front: [44, 36, armW, 12, false, false],
      back: [52 - sOffset, 36, armW, 12, false, false],
    },
    leftArm: {
      right: [32, 52, 4, 12, false, false],
      left: [40 - sOffset, 52, 4, 12, false, false],
      top: [36, 48, armW, 4, false, false],
      bottom: [40 - sOffset, 48, armW, 4, false, false],
      front: [36, 52, armW, 12, false, false],
      back: [44 - sOffset, 52, armW, 12, false, false],
    },
    leftSleeve: {
      right: [48, 52, 4, 12, false, false],
      left: [56 - sOffset, 52, 4, 12, false, false],
      top: [52, 48, armW, 4, false, false],
      bottom: [56 - sOffset, 48, armW, 4, false, false],
      front: [52, 52, armW, 12, false, false],
      back: [60 - sOffset, 52, armW, 12, false, false],
    },
    rightLeg: {
      right: [0, 20, 4, 12, false, false],
      left: [8, 20, 4, 12, false, false],
      top: [4, 16, 4, 4, false, false],
      bottom: [8, 16, 4, 4, false, false],
      front: [4, 20, 4, 12, false, false],
      back: [12, 20, 4, 12, false, false],
    },
    rightPants: {
      right: [0, 36, 4, 12, false, false],
      left: [8, 36, 4, 12, false, false],
      top: [4, 32, 4, 4, false, false],
      bottom: [8, 32, 4, 4, false, false],
      front: [4, 36, 4, 12, false, false],
      back: [12, 36, 4, 12, false, false],
    },
    leftLeg: {
      right: [16, 52, 4, 12, false, false],
      left: [24, 52, 4, 12, false, false],
      top: [20, 48, 4, 4, false, false],
      bottom: [24, 48, 4, 4, false, false],
      front: [20, 52, 4, 12, false, false],
      back: [28, 52, 4, 12, false, false],
    },
    leftPants: {
      right: [0, 52, 4, 12, false, false],
      left: [8, 52, 4, 12, false, false],
      top: [4, 48, 4, 4, false, false],
      bottom: [8, 48, 4, 4, false, false],
      front: [4, 52, 4, 12, false, false],
      back: [12, 52, 4, 12, false, false],
    },
  };
}

/**
 * Renders a 3D skin guide thumbnail with layer highlighting matching mc_preview2.py.
 * @param {Object} options
 * @returns {HTMLCanvasElement}
 */
export function renderSkinPreview({
  skin,
  outputSize = [500, 500],
  camFront = [0.5, 0.5, 0.5],
  zoom = 0.2,
  lookAtY = 12,
  coreDisplay = ['head', 'body', 'left_arm', 'right_arm', 'left_leg', 'right_leg'],
  decorDisplay = ['head', 'body', 'left_arm', 'right_arm', 'left_leg', 'right_leg'],
  coreOpacity = 0.1,
  decorOpacity = 1.0,
  hl = false,
  hlDirection = [0, 0, -1],
  hlDepth = 0,
  vertical = false,
  fitToBounds = false,
  unlit = false,
  cuteMode = false,
  voxelMode = false,
}) {
  const [targetW, targetH] = outputSize;
  if (typeof document === 'undefined') {
    return createCanvas(targetW, targetH);
  }
  const renderer = getSharedRenderer(targetW, targetH);
  const scene = new THREE.Scene();

  if (!unlit) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 40, 20);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-10, -20, -20);
    scene.add(dirLight2);
  }

  // Match mc_preview2.py / PyVista's default perspective camera. The Python
  // implementation keeps perspective projection enabled and applies
  // `camera.zoom(.14 / zoom)`; treating `zoom` as an orthographic view size
  // made the assembly guide thumbnails roughly four times too small.
  const aspect = targetW / targetH;
  const camera = fitToBounds
    ? new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 500)
    : new THREE.PerspectiveCamera(30, aspect, 0.1, 500);

  // Camera position calculated from camFront vector
  const [cx, cy, cz] = camFront;
  camera.position.set(cx * 70, cy * 70 + 20, cz * 70);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, lookAtY, 0);
  camera.zoom = fitToBounds ? 1 : 0.14 / zoom;
  camera.updateProjectionMatrix();

  const uvs = getSkinUVs(skin.isSlim);
  const isSlim = skin.isSlim;
  const armW = isSlim ? 3 : 4;
  const armOffset = 6.8;
  const legOffset = 2.8;
  const highlightedFace = hl ? getHighlightedFace(hlDirection) : null;

  // Build Parts
  const partsGroup = new THREE.Group();

  const addBox = (name, size, pos, uvKey, isDecor = false) => {
    const isVisible = isDecor
      ? decorDisplay.includes(name)
      : coreDisplay.includes(name);
    if (!isVisible) return;

    const partIndex = ['head', 'body', 'left_arm', 'right_arm', 'left_leg', 'right_leg'].indexOf(name);
    const height = cuteMode && partIndex !== 0 ? size[1] - 4 : size[1];
    const geom = voxelMode
      ? createSkinVoxelGeometry(skin, uvs[uvKey], size, { cuteMode, partIndex, isDecor })
      : new THREE.BoxGeometry(size[0], height, size[2], 1, cuteMode && partIndex === 1 ? 8 : 1, 1);
    if (!voxelMode && cuteMode && partIndex === 1) taperCuteTorso(geom);
    const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
    const mats = voxelMode ? [new Material({
      vertexColors: true, toneMapped: !unlit,
      opacity: isDecor ? decorOpacity : coreOpacity,
      transparent: (isDecor ? decorOpacity : coreOpacity) < 1,
    })] : createBoxMaterials(
      skin.canvas,
      uvs[uvKey],
      isDecor ? decorOpacity : coreOpacity,
      isDecor,
      isDecor ? highlightedFace : null,
      unlit,
      cuteMode
    );
    if (cuteMode) {
      // Cute joints touch. Resolve coplanar outer faces consistently so the
      // legs and waist do not show flickering lines where the layers overlap.
      for (const material of mats) {
        material.polygonOffset = true;
        material.polygonOffsetUnits = partIndex * 4;
      }
    }
    const mesh = new THREE.Mesh(geom, mats);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (cuteMode) {
      const pose = getCutePartPose(partIndex, isSlim);
      mesh.position.fromArray(pose.position);
      mesh.scale.fromArray(pose.scale);
      mesh.rotation.z = pose.rotationZ;
    }
    partsGroup.add(mesh);
  };

  // Base Layers
  addBox('head', [8, 8, 8], [0, 28, 0], 'head', false);
  addBox('body', [8, 12, 4], [0, 18, 0], 'body', false);
  addBox('right_arm', [armW, 12, 4], [-armOffset, 17, 0], 'rightArm', false);
  addBox('left_arm', [armW, 12, 4], [armOffset, 17, 0], 'leftArm', false);
  addBox('right_leg', [4, 12, 4], [-legOffset, 6, 0], 'rightLeg', false);
  addBox('left_leg', [4, 12, 4], [legOffset, 6, 0], 'leftLeg', false);

  // Decor Layers
  const decorExtra = 0.5;
  addBox('head', [9, 9, 9], [0, 28, 0], 'hat', true);
  addBox('body', [8 + decorExtra, 12 + decorExtra, 4 + decorExtra], [0, 18, 0], 'jacket', true);
  addBox('right_arm', [armW + decorExtra, 12 + decorExtra, 4 + decorExtra], [-armOffset, 17, 0], 'rightSleeve', true);
  addBox('left_arm', [armW + decorExtra, 12 + decorExtra, 4 + decorExtra], [armOffset, 17, 0], 'leftSleeve', true);
  addBox('right_leg', [4 + decorExtra, 12 + decorExtra, 4 + decorExtra], [-legOffset, 6, 0], 'rightPants', true);
  addBox('left_leg', [4 + decorExtra, 12 + decorExtra, 4 + decorExtra], [legOffset, 6, 0], 'leftPants', true);

  scene.add(partsGroup);
  if (fitToBounds) {
    const bounds = new THREE.Box3().setFromObject(partsGroup);
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(...camFront).normalize();
    camera.position.copy(center).addScaledVector(direction, 80);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    // Fit all eight box corners in camera space so front/back guides include
    // every limb and outer layer at the same scale, for classic and slim skins.
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          halfWidth = Math.max(halfWidth, Math.abs(point.x));
          halfHeight = Math.max(halfHeight, Math.abs(point.y));
        }
      }
    }
    const extent = Math.max(halfHeight, halfWidth / aspect) * 1.08;
    camera.left = -extent * aspect;
    camera.right = extent * aspect;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);

  // Copy rendered image to an offscreen canvas
  const outCanvas = createCanvas(targetW, targetH);
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(renderer.domElement, 0, 0);

  // Clean up geometries and textures
  partsGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  });

  if (vertical) {
    // Pillow's Image.rotate(90, expand=True) is counter-clockwise.
    const rotCanvas = createCanvas(targetH, targetW);
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.save();
    rotCtx.translate(0, targetW);
    rotCtx.rotate(-Math.PI / 2);
    rotCtx.drawImage(outCanvas, 0, 0);
    rotCtx.restore();
    return rotCanvas;
  }

  return outCanvas;
}

/** Release the guide renderer after the printable sheet is captured. */
export function disposePreviewRenderer() {
  sharedRenderer?.dispose();
  sharedRenderer?.forceContextLoss();
  sharedRenderer = null;
}
