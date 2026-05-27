import { useMemo, useRef, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, Stage, useFBX, useAnimations } from '@react-three/drei';
import { ensureSkinVoxelModeConsistency, isSlim } from './utils';

function DanceController({ action, partsRefs, fbxUrl }: { action: string, partsRefs: any, fbxUrl?: string }) {
    if (action !== 'dance') return null;
    return <DanceControllerInner key={fbxUrl} partsRefs={partsRefs} fbxUrl={fbxUrl} />;
}

function DanceControllerInner({ partsRefs, fbxUrl = '/fbx/Breakdance 1990.fbx' }: { partsRefs: any, fbxUrl?: string }) {
    const fbx = useFBX(fbxUrl);
    const { actions } = useAnimations(fbx.animations, fbx);
    const initialPosRef = useRef<THREE.Vector3 | null>(null);

    // Pre-defined alignment rotations from FBX local coordinate system to MC local coordinate system
    // Many FBX bones have the +Y axis along the bone direction, while the limbs of MC models have the -Y axis along the bone direction.
    // Therefore, we need a 180-degree rotation around the Z axis to flip the Y axis (while inverting the X axis to keep the Z axis facing forward).
    const flipYQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    const ALIGNMENTS: Record<string, THREE.Quaternion> = {
        'head': new THREE.Quaternion(), // Identity
        'body': new THREE.Quaternion(), // Identity
        'left_arm': flipYQuat,
        'left_low_arm': flipYQuat,
        'right_arm': flipYQuat,
        'right_low_arm': flipYQuat,
        'left_leg': flipYQuat,
        'left_low_leg': flipYQuat,
        'right_leg': flipYQuat,
        'right_low_leg': flipYQuat,
    };

    const mapping: Record<string, string> = useMemo(() => ({
        'head': 'head',
        'body': 'body',
        'left up arm': 'left_arm',
        'left low arm': 'left_low_arm',
        'right up arm': 'right_arm',
        'right low arm': 'right_low_arm',
        'left up leg': 'left_leg',
        'left low leg': 'left_low_leg',
        'right up leg': 'right_leg',
        'right low leg': 'right_low_leg',
    }), []);

    useEffect(() => {
        // We no longer need to record restQuatInverses because we will use absolute world rotations.
        // But if we need to handle the initial offset of body displacement, we can record the initial position of the body here.
        const bodyBone = fbx.getObjectByName('body') || fbx.getObjectByName('Spine');
        if (bodyBone) {
            initialPosRef.current = bodyBone.position.clone();
        }

        const clipAction = actions && Object.values(actions)[0];
        if (clipAction) {
            clipAction.reset().play();
        }
        return () => {
            if (clipAction) clipAction.stop();
            // Reset rotation and position of all parts when exiting dance mode
            Object.values(mapping).forEach((refName) => {
                if (partsRefs.current && (partsRefs.current as any)[refName]) {
                    const mcPart = (partsRefs.current as any)[refName] as THREE.Object3D;
                    mcPart.quaternion.set(0, 0, 0, 1);
                    if (refName === 'body') {
                        mcPart.position.set(0, 10, 0);
                    }
                }
            });
        };
    }, [actions, fbx, mapping, partsRefs]);

    useFrame(() => {
        Object.entries(mapping).forEach(([fbxName, refName]) => {
            let bone = fbx.getObjectByName(fbxName);
            if (!bone) bone = fbx.getObjectByName(fbxName.replace(/ /g, '_'));
            if (!bone) {
                fbx.traverse((child) => {
                    if (child.name.replace(/[_ ]/g, '').toLowerCase() === fbxName.replace(/ /g, '').toLowerCase()) {
                        bone = child as THREE.Bone;
                    }
                });
            }

            if (bone && partsRefs.current && (partsRefs.current as any)[refName]) {
                const mcPart = (partsRefs.current as any)[refName] as THREE.Object3D;

                // 1. Get the absolute world rotation of the FBX bone
                const fbxWorldQuat = new THREE.Quaternion();
                bone.getWorldQuaternion(fbxWorldQuat);

                // 2. Add the alignment offset (aligning the FBX coordinate system to the MC coordinate system)
                const alignOffset = ALIGNMENTS[refName] || new THREE.Quaternion();
                const mcWorldQuat = fbxWorldQuat.clone().multiply(alignOffset.clone().invert());

                // 3. Convert the world rotation to the local rotation of the MC part (relative to its parent)
                const parentWorldQuat = new THREE.Quaternion();
                if (mcPart.parent) {
                    mcPart.parent.getWorldQuaternion(parentWorldQuat);
                }
                const mcLocalQuat = parentWorldQuat.clone().invert().multiply(mcWorldQuat);

                // Apply rotation
                mcPart.quaternion.copy(mcLocalQuat);

                // Handle body position movement
                if (refName === 'body') {
                    if (!initialPosRef.current) {
                        initialPosRef.current = bone.position.clone();
                    }
                    const delta = new THREE.Vector3().subVectors(bone.position, initialPosRef.current);
                    delta.multiplyScalar(0.125); // Scale down Mixamo units (cm) to MC pixel units (12 / 96 = 1/8)
                    mcPart.position.set(0, 10, 0).add(delta);
                }
            }
        });
    });

    return (
        <group>
            <primitive object={fbx} visible={false} />
        </group>
    );
}

// --- Helper functions extracted outside the component to avoid repeated rendering ---

type Pos = {
    right?: [number, number, number, number],
    front?: [number, number, number, number],
    left?: [number, number, number, number],
    top?: [number, number, number, number],
    bottom?: [number, number, number, number, number?, number?],
    back?: [number, number, number, number]
};
type FaceName = 'right' | 'front' | 'left' | 'top' | 'bottom' | 'back';
function shiftpos(pos: Pos
    , x: number, y: number) {
    const res: any = {};
    Object.keys(pos).map(i => {
        res[i] = [...(pos as any)[i]];
        res[i][0] += x;
        res[i][1] += y;
    });
    return res as Pos;
}

function uvTo3d(imageData: ImageData | null, pos: Pos) {
    const box_width = pos.front![2];
    const box_depth = pos.right![2];
    const box_height = pos.front![3];

    const result = {} as Pos;
    if (!imageData) return result;

    const data = imageData.data;
    const width = imageData.width;

    for (const [face, uv] of Object.entries(pos)) {
        const [u, v, w, h, x_flip, y_flip] = uv;
        const startX = Math.floor(u);
        const startY = Math.floor(v);
        const faceWidth = Math.floor(w);
        const faceHeight = Math.floor(h);

        (result as any)[face] = [];

        for (let y = 0; y < faceHeight; y++) {
            for (let x = 0; x < faceWidth; x++) {
                const readX = x_flip ? faceWidth - 1 - x : x;
                const readY = y_flip ? faceHeight - 1 - y : y;

                const index = ((startY + readY) * width + (startX + readX)) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];

                if (a < 255) continue;

                (result as any)[face].push({
                    ...(face === 'front' ? { z: box_depth / 2, x: x - box_width / 2 + 1, y: box_height / 2 - y }
                        : face === 'back' ? { z: -box_depth / 2 + 1, x: -x + box_width / 2, y: box_height / 2 - y }
                            : face === 'left' ? { z: -x + box_depth / 2, y: box_height / 2 - y, x: box_width / 2 }
                                : face === 'right' ? { z: -box_depth / 2 + x + 1, y: box_height / 2 - y, x: -box_width / 2 + 1 }
                                    : face === 'top' ? { y: box_height / 2, x: x - box_width / 2 + 1, z: -box_depth / 2 + y + 1 }
                                        : face === 'bottom' ? { y: -box_height / 2 + 1, x: x - box_width / 2 + 1, z: -y + box_depth / 2 }
                                            : {}),
                    color: (r << 16) + (g << 8) + b,
                    u: startX + readX,
                    v: startY + readY
                });
            }
        }
    }
    return result;
}

function createFaceMaterials(texture: THREE.Texture, textureSize: number, uvMap: Pos, missingColor?: { [face: string]: number }) {
    const order = ['left', 'right', 'top', 'bottom', 'front', 'back'];
    const materials = [];

    for (const face of order) {
        const uv = (uvMap as any)[face];
        if (!uv) {
            if (missingColor && missingColor[face] !== undefined) {
                materials.push(new THREE.MeshBasicMaterial({ color: missingColor[face] }));
            } else {
                materials.push(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
            }
            continue;
        }

        const [u, v, w, h, x_flip, y_flip] = uv;
        const eps = 0.01; // Small offset to prevent texture edges from being clipped due to floating point precision when alphaTest=0.5
        const faceTexture = texture.clone();
        faceTexture.needsUpdate = true;

        const width = w - 2 * eps;
        const height = h - 2 * eps;
        const startX = u + eps;
        const startY = (textureSize - v - h) + eps;

        faceTexture.repeat.set(width / textureSize, height / textureSize);
        faceTexture.offset.set(startX / textureSize, startY / textureSize);

        if (y_flip) {
            faceTexture.repeat.y = -height / textureSize;
            faceTexture.offset.y = ((textureSize - v) - eps) / textureSize;
        }
        if (x_flip) {
            faceTexture.repeat.x = -width / textureSize;
            faceTexture.offset.x = (u + w - eps) / textureSize;
        }

        materials.push(new THREE.MeshBasicMaterial({
            map: faceTexture,
            side: THREE.DoubleSide,
            //transparent: true,
            alphaTest: 0.5,
        }));
    }
    return materials;
}

// Generate 3D voxel group based on pixel data (for performance, we do not generate meshes in bulk in JSX, but reuse native logic to generate Groups)
function createVoxelGroup(imageData: ImageData | null, cfg: any, showEdges = false, printMode = false) {
    const group = new THREE.Group();
    const [uvMap, extra_voxel, size] = cfg;
    const scale_x = (size[0] + extra_voxel) / size[0];
    const scale_y = (size[1] + extra_voxel) / size[1];
    const scale_z = (size[2] + extra_voxel) / size[2];

    const voxel = uvTo3d(imageData, uvMap);

    // 将不同面的体素像素按 3D 坐标聚合
    const grid: { [key: string]: any } = {};
    Object.keys(voxel).forEach((face) => {
        for (const i of (voxel as any)[face]) {
            const key = `${i.x}_${i.y}_${i.z}`;
            if (!grid[key]) {
                grid[key] = { x: i.x, y: i.y, z: i.z };
            }
            grid[key][face] = i.color;
            grid[key][`${face}_u`] = i.u;
            grid[key][`${face}_v`] = i.v;
        }
    });

    Object.values(grid).forEach((cell: any) => {
        const { x, y, z, left, right, top, bottom, front, back } = cell;

        // 找出一个该体素上存在的颜色作为缺损面的保底颜色
        const anyColor = left ?? right ?? top ?? bottom ?? front ?? back;

        // Three.js BoxGeometry 材质顺序:
        // 0: +x (对应 left), 1: -x (对应 right)
        // 2: +y (对应 top), 3: -y (对应 bottom)
        // 4: +z (对应 front), 5: -z (对应 back)
        const materials = [
            'left', 'right', 'top', 'bottom', 'front', 'back'
        ].map(faceName => {
            const color = cell[faceName];
            return new THREE.MeshBasicMaterial({
                color: color !== undefined ? color : (printMode ? 0xffffff : anyColor),
                transparent: true,
            });
        });

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(scale_x, scale_y, scale_z),
            materials
        );
        mesh.position.set((x - 0.5) * scale_x, (y - 0.5) * scale_y, (z - 0.5) * scale_z);
        mesh.userData = { cell }; // 保存单元格数据供射线检测读取
        group.add(mesh);
    });

    if (showEdges) {
        const edgesMap: { [key: string]: { p1: number[], p2: number[], faces: { normal: number[] }[] } } = {};
        const getEdgeKey = (p1: number[], p2: number[]) => {
            const arr = [p1, p2].sort((a, b) => {
                if (a[0] !== b[0]) return a[0] - b[0];
                if (a[1] !== b[1]) return a[1] - b[1];
                return a[2] - b[2];
            });
            return `${arr[0][0].toFixed(4)}_${arr[0][1].toFixed(4)}_${arr[0][2].toFixed(4)}|${arr[1][0].toFixed(4)}_${arr[1][1].toFixed(4)}_${arr[1][2].toFixed(4)}`;
        };

        const addEdge = (p1: number[], p2: number[], normal: number[]) => {
            const key = getEdgeKey(p1, p2);
            if (!edgesMap[key]) {
                edgesMap[key] = { p1, p2, faces: [] };
            }
            edgesMap[key].faces.push({ normal });
        };

        Object.values(grid).forEach((cell: any) => {
            const { x, y, z } = cell;
            const px = (x - 0.5) * scale_x;
            const py = (y - 0.5) * scale_y;
            const pz = (z - 0.5) * scale_z;
            const hx = scale_x / 2;
            const hy = scale_y / 2;
            const hz = scale_z / 2;

            const V = [
                [px - hx, py - hy, pz - hz], // 0
                [px + hx, py - hy, pz - hz], // 1
                [px + hx, py + hy, pz - hz], // 2
                [px - hx, py + hy, pz - hz], // 3
                [px - hx, py - hy, pz + hz], // 4
                [px + hx, py - hy, pz + hz], // 5
                [px + hx, py + hy, pz + hz], // 6
                [px - hx, py + hy, pz + hz]  // 7
            ];

            const faceConfigs = [
                { name: 'left', offset: [1, 0, 0], normal: [1, 0, 0], v: [1, 2, 6, 5] },
                { name: 'right', offset: [-1, 0, 0], normal: [-1, 0, 0], v: [0, 3, 7, 4] },
                { name: 'top', offset: [0, 1, 0], normal: [0, 1, 0], v: [3, 2, 6, 7] },
                { name: 'bottom', offset: [0, -1, 0], normal: [0, -1, 0], v: [0, 1, 5, 4] },
                { name: 'front', offset: [0, 0, 1], normal: [0, 0, 1], v: [4, 5, 6, 7] },
                { name: 'back', offset: [0, 0, -1], normal: [0, 0, -1], v: [0, 1, 2, 3] }
            ];

            faceConfigs.forEach(fc => {
                const adjKey = `${x + fc.offset[0]}_${y + fc.offset[1]}_${z + fc.offset[2]}`;
                if (!grid[adjKey]) {
                    const idx = fc.v;
                    addEdge(V[idx[0]], V[idx[1]], fc.normal);
                    addEdge(V[idx[1]], V[idx[2]], fc.normal);
                    addEdge(V[idx[2]], V[idx[3]], fc.normal);
                    addEdge(V[idx[3]], V[idx[0]], fc.normal);
                }
            });
        });

        const lineVertices: number[] = [];
        Object.values(edgesMap).forEach(e => {
            if (e.faces.length === 1) {
                lineVertices.push(...e.p1, ...e.p2);
            } else if (e.faces.length >= 2) {
                const n1 = e.faces[0].normal;
                const n2 = e.faces[1].normal;
                const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
                if (Math.abs(dot) < 0.01) {
                    lineVertices.push(...e.p1, ...e.p2);
                }
            }
        });

        if (lineVertices.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
            const line = new THREE.LineSegments(geo, mat);
            group.add(line);
        }
    }

    return group;
}


// --- React 组件核心逻辑 ---

export type VisibleParts = {
    head?: boolean;
    body?: boolean;
    leftArm?: boolean;
    rightArm?: boolean;
    leftLeg?: boolean;
    rightLeg?: boolean;
};

export function MinecraftCharacter({ textureUrl, texture, mode = 'voxel', action = 'idle', fbxUrl, visibleParts = {}, showOverlay = true, updateTrigger = 0, showEdges = false, printMode = false, onPaint, onHover, onHoverEnd }: { textureUrl?: string, texture?: THREE.Texture, mode?: 'voxel' | 'plane', action?: 'idle' | 'walking' | 'dance', fbxUrl?: string, visibleParts?: VisibleParts, showOverlay?: boolean, updateTrigger?: number, showEdges?: boolean, printMode?: boolean, onPaint?: (x: number, y: number) => void, onHover?: (x: number, y: number) => void, onHoverEnd?: () => void }) {
    if (texture) {
        return <MinecraftCharacterInner texture={texture} mode={mode} action={action} fbxUrl={fbxUrl} visibleParts={visibleParts} showOverlay={showOverlay} updateTrigger={updateTrigger} showEdges={showEdges} printMode={printMode} onPaint={onPaint} onHover={onHover} onHoverEnd={onHoverEnd} />
    }
    if (!textureUrl) return null
    return <MinecraftCharacterWithUrl textureUrl={textureUrl} mode={mode} action={action} fbxUrl={fbxUrl} visibleParts={visibleParts} showOverlay={showOverlay} showEdges={showEdges} printMode={printMode} onPaint={onPaint} onHover={onHover} onHoverEnd={onHoverEnd} />
}

function MinecraftCharacterWithUrl({ textureUrl, mode, action, fbxUrl, visibleParts, showOverlay = true, showEdges = false, printMode = false, onPaint, onHover, onHoverEnd }: { textureUrl: string, mode: 'voxel' | 'plane', action: 'idle' | 'walking' | 'dance', fbxUrl?: string, visibleParts: VisibleParts, showOverlay?: boolean, showEdges?: boolean, printMode?: boolean, onPaint?: (x: number, y: number) => void, onHover?: (x: number, y: number) => void, onHoverEnd?: () => void }) {
    const loadedTexture = useTexture(textureUrl);
    return <MinecraftCharacterInner texture={loadedTexture} mode={mode} action={action} fbxUrl={fbxUrl} visibleParts={visibleParts} showOverlay={showOverlay} showEdges={showEdges} printMode={printMode} onPaint={onPaint} onHover={onHover} onHoverEnd={onHoverEnd} />
}

export function MinecraftCharacterInner({ texture, mode = 'voxel', action = 'idle', fbxUrl, visibleParts = {}, showOverlay = true, updateTrigger = 0, showEdges = false, printMode = false, onPaint, onHover, onHoverEnd }: { texture: THREE.Texture, mode?: 'voxel' | 'plane', action?: 'idle' | 'walking' | 'dance', fbxUrl?: string, visibleParts?: VisibleParts, showOverlay?: boolean, updateTrigger?: number, showEdges?: boolean, printMode?: boolean, onPaint?: (x: number, y: number) => void, onHover?: (x: number, y: number) => void, onHoverEnd?: () => void }) {
    // Refs
    const characterRef = useRef(null);
    const partsRefs = useRef({});
    const setPartRef = (name: string) => (ref: any) => {
        if (ref) (partsRefs.current as any)[name] = ref;
    };

    const isMouseDownOnMesh = useRef(false);

    useEffect(() => {
        const handleMouseUp = () => { isMouseDownOnMesh.current = false; };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const resolvePixelCoords = (part: string, e: any, isOverlay = false): [number, number] | null => {
        const actualIsOverlay = showOverlay ? isOverlay : false;

        if (e.object?.userData?.cell && actualIsOverlay) {
            const cell = e.object.userData.cell;
            const faceIndex = e.face ? Math.floor(e.faceIndex / 2) : 0;
            const faces = ['left', 'right', 'top', 'bottom', 'front', 'back'];
            const faceName = faces[faceIndex];
            const u_px = cell[`${faceName}_u`];
            const v_px = cell[`${faceName}_v`];
            if (u_px !== undefined && v_px !== undefined) return [u_px, v_px];
        }

        const faceIndex = e.face ? Math.floor(e.faceIndex / 2) : 0;
        const faces = ['left', 'right', 'top', 'bottom', 'front', 'back'];
        const faceName = faces[faceIndex] as FaceName;
        const uvConfig = (charData.uvMaps as any)[part];
        if (!uvConfig) return null;
        let uvMap = (uvConfig as any)[faceName];
        if (!uvMap) return null;

        if (actualIsOverlay) {
            const mockUv: any = {};
            mockUv[faceName] = uvMap;
            if (part === 'head') uvMap = shiftpos(mockUv, 32, 0)[faceName];
            else if (part === 'body') uvMap = shiftpos(mockUv, 0, 16)[faceName];
            else if (part.includes('Arm')) uvMap = shiftpos(mockUv, part.includes('left') ? 16 : 0, part.includes('left') ? 0 : 16)[faceName];
            else if (part.includes('Leg')) uvMap = shiftpos(mockUv, part.includes('left') ? -16 : 0, part.includes('left') ? 0 : 16)[faceName];
        }

        const [u, v, w, h, x_flip, y_flip] = uvMap;
        const uvCoords = e.uv;
        if (!uvCoords) return null;
        let u_val = uvCoords.x;
        let v_val = uvCoords.y;
        if (x_flip) u_val = 1 - u_val;
        if (y_flip) v_val = 1 - v_val;
        return [Math.floor(u + u_val * w), Math.floor(v + (1 - v_val) * h)];
    };

    const handle3DClick = (part: string, e: any, isOverlay = false, isDown = false) => {
        // Check if the part is visible before interaction
        const basePart = part.replace('Low', '') as keyof VisibleParts;
        if (visibleParts[basePart] === false) return;
        if (isOverlay && !showOverlay) return;

        // Hover preview (no button pressed)
        if (e.buttons === 0 && onHover) {
            e.stopPropagation();
            const coords = resolvePixelCoords(part, e, isOverlay);
            if (coords) onHover(coords[0], coords[1]);
            return;
        }

        if (!onPaint) return;
        if (e.buttons !== 1) return; // Only mouse left click
        e.stopPropagation();

        if (isDown) {
            isMouseDownOnMesh.current = true;
        } else if (!isMouseDownOnMesh.current) {
            return;
        }

        const coords = resolvePixelCoords(part, e, isOverlay);
        if (coords) onPaint(coords[0], coords[1]);
    };

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime() * 10;
        const refs = partsRefs.current;
        if (!refs) return;

        const setRot = (name: string, x: number, y: number, z: number = 0) => {
            if ((refs as any)[name]) {
                (refs as any)[name].rotation.set(x, y, z);
            }
        };

        if (action === 'idle') {
            setRot('left_arm', 0, 0, 0);
            setRot('right_arm', 0, 0, 0);
            setRot('left_leg', 0, 0, 0);
            setRot('right_leg', 0, 0, 0);
            setRot('head', 0, 0, 0);
            setRot('body', 0, 0, 0);
            if ((refs as any)['body']) {
                (refs as any)['body'].position.set(0, 10, 0);
            }
            if (characterRef.current) {
                (characterRef.current as any).position.set(0, 0, 0);
                (characterRef.current as any).rotation.set(0, 0, 0);
            }
        } else if (action === 'walking') {
            const swing = Math.sin(t * 0.5) * 0.8;
            setRot('left_arm', -swing, 0, 0);
            setRot('right_arm', swing, 0, 0);
            setRot('left_leg', swing, 0, 0);
            setRot('right_leg', -swing, 0, 0);
            setRot('head', 0, 0, 0);
            setRot('body', 0, 0, 0);
            if (characterRef.current) {
                (characterRef.current as any).position.y = 0;
                (characterRef.current as any).rotation.x = 0;
            }
        } else if (action === 'dance') {
            // FBX animation driven by DanceController
        }
    });

    // 2. 纹理和身型处理 (Steve or Alex)
    const { isAlex, processedTexture } = useMemo(() => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        let typeIsAlex = true;
        if (texture.image) {
            typeIsAlex = isSlim((texture as any).image);
        }
        return { isAlex: typeIsAlex, processedTexture: texture };
    }, [texture, updateTrigger]);

    // 3. 构建角色的几何参数和材质 (拆分以优化性能)
    const armConfig = useMemo(() => {
        const armWidth = isAlex ? 3 : 4;
        const armUVWidth = isAlex ? 3 : 4;
        const armPositionX = isAlex ? 5.5 : 6;
        return { armWidth, armUVWidth, armPositionX };
    }, [isAlex]);

    const uvMaps = useMemo(() => {
        const { armUVWidth } = armConfig;

        const headpos: Pos = { right: [0, 8, 8, 8], left: [16, 8, 8, 8], top: [8, 0, 8, 8], bottom: [16, 0, 8, 8, 0, 1], front: [8, 8, 8, 8], back: [24, 8, 8, 8] };
        const bodypos: Pos = { right: [16, 20, 4, 12], left: [28, 20, 4, 12], top: [20, 16, 8, 4], bottom: [28, 16, 8, 4, 0, 1], front: [20, 20, 8, 12], back: [32, 20, 8, 12] };
        const rightArmUvMap: Pos = { right: [40, 20, 4, 6], front: [44, 20, armUVWidth, 6], left: [44 + armUVWidth, 20, 4, 6], top: [44, 16, armUVWidth, 4], back: [44 + 4 + armUVWidth, 20, armUVWidth, 6] };
        const rightArmLowUvMap: Pos = { right: [40, 26, 4, 6], front: [44, 26, armUVWidth, 6], left: [44 + armUVWidth, 26, 4, 6], bottom: [44 + armUVWidth, 16, armUVWidth, 4, 0, 1], back: [44 + 4 + armUVWidth, 26, armUVWidth, 6] };
        const leftArmUvMap = shiftpos(rightArmUvMap, -8, 32);
        const leftArmLowUvMap = shiftpos(rightArmLowUvMap, -8, 32);
        const rightLegUvMap: Pos = { right: [0, 20, 4, 6], left: [8, 20, 4, 6], top: [4, 16, 4, 4], front: [4, 20, 4, 6], back: [12, 20, 4, 6] };
        const rightLegLowUvMap: Pos = { right: [0, 26, 4, 6], left: [8, 26, 4, 6], bottom: [8, 16, 4, 4, 0, 1], front: [4, 26, 4, 6], back: [12, 26, 4, 6] };
        const leftLegUvMap = shiftpos(rightLegUvMap, 16, 32);
        const leftLegLowUvMap = shiftpos(rightLegLowUvMap, 16, 32);

        return {
            head: headpos, body: bodypos,
            rightArm: rightArmUvMap, rightArmLow: rightArmLowUvMap,
            leftArm: leftArmUvMap, leftArmLow: leftArmLowUvMap,
            rightLeg: rightLegUvMap, rightLegLow: rightLegLowUvMap,
            leftLeg: leftLegUvMap, leftLegLow: leftLegLowUvMap
        };
    }, [armConfig]);

    const mats = useMemo(() => {
        return {
            head: createFaceMaterials(processedTexture, 64, uvMaps.head),
            body: createFaceMaterials(processedTexture, 64, uvMaps.body),
            leftArm: createFaceMaterials(processedTexture, 64, uvMaps.leftArm, { bottom: 0xffffff }),
            leftArmLow: createFaceMaterials(processedTexture, 64, uvMaps.leftArmLow, { top: 0xffffff }),
            rightArm: createFaceMaterials(processedTexture, 64, uvMaps.rightArm, { bottom: 0xffffff }),
            rightArmLow: createFaceMaterials(processedTexture, 64, uvMaps.rightArmLow, { top: 0xffffff }),
            leftLeg: createFaceMaterials(processedTexture, 64, uvMaps.leftLeg, { bottom: 0xffffff }),
            leftLegLow: createFaceMaterials(processedTexture, 64, uvMaps.leftLegLow, { top: 0xffffff }),
            rightLeg: createFaceMaterials(processedTexture, 64, uvMaps.rightLeg, { bottom: 0xffffff }),
            rightLegLow: createFaceMaterials(processedTexture, 64, uvMaps.rightLegLow, { top: 0xffffff }),
            // Overlay mats
            headOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.head, 32, 0)),
            bodyOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.body, 0, 16)),
            leftArmOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.leftArm, 16, 0)),
            leftArmLowOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.leftArmLow, 16, 0)),
            rightArmOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.rightArm, 0, 16)),
            rightArmLowOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.rightArmLow, 0, 16)),
            leftLegOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.leftLeg, -16, 0)),
            leftLegLowOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.leftLegLow, -16, 0)),
            rightLegOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.rightLeg, 0, 16)),
            rightLegLowOverlay: createFaceMaterials(processedTexture, 64, shiftpos(uvMaps.rightLegLow, 0, 16))
        };
    }, [processedTexture, uvMaps]);

    const voxels = useMemo(() => {
        let processedImageData: ImageData | null = null;
        const img = processedTexture.image as any;
        if (img && img.complete && img.width > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                ensureSkinVoxelModeConsistency(tempCanvas);
                processedImageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            }
        }

        const { armWidth } = armConfig;
        return {
            head: createVoxelGroup(processedImageData, [shiftpos(uvMaps.head, 32, 0), 1, [8, 8, 8]], showEdges, printMode),
            body: createVoxelGroup(processedImageData, [shiftpos(uvMaps.body, 0, 16), 0.5, [8, 12, 4]], showEdges, printMode),
            leftArm: createVoxelGroup(processedImageData, [shiftpos(uvMaps.leftArm, 16, 0), 0.5, [armWidth, 6, 4]], showEdges, printMode),
            leftArmLow: createVoxelGroup(processedImageData, [shiftpos(uvMaps.leftArmLow, 16, 0), 0.5, [armWidth, 6, 4]], showEdges, printMode),
            rightArm: createVoxelGroup(processedImageData, [shiftpos(uvMaps.rightArm, 0, 16), 0.5, [armWidth, 6, 4]], showEdges, printMode),
            rightArmLow: createVoxelGroup(processedImageData, [shiftpos(uvMaps.rightArmLow, 0, 16), 0.5, [armWidth, 6, 4]], showEdges, printMode),
            leftLeg: createVoxelGroup(processedImageData, [shiftpos(uvMaps.leftLeg, -16, 0), 0.5, [4, 6, 4]], showEdges, printMode),
            leftLegLow: createVoxelGroup(processedImageData, [shiftpos(uvMaps.leftLegLow, -16, 0), 0.5, [4, 6, 4]], showEdges, printMode),
            rightLeg: createVoxelGroup(processedImageData, [shiftpos(uvMaps.rightLeg, 0, 16), 0.5, [4, 6, 4]], showEdges, printMode),
            rightLegLow: createVoxelGroup(processedImageData, [shiftpos(uvMaps.rightLegLow, 0, 16), 0.5, [4, 6, 4]], showEdges, printMode)
        };
    }, [processedTexture, armConfig, uvMaps, updateTrigger, showEdges, printMode]);

    const coreEdgeGeometries = useMemo(() => {
        const createEdges = (w: number, h: number, d: number) => {
            const box = new THREE.BoxGeometry(w, h, d);
            const edges = new THREE.EdgesGeometry(box);
            box.dispose();
            return edges;
        };
        const aw = armConfig.armWidth;
        return {
            head: createEdges(8, 8, 8),
            body: createEdges(8, 12, 4),
            arm: createEdges(aw, 6, 4),
            armLow: createEdges(aw + 0.002, 6, 4.002),
            leg: createEdges(4, 6, 4),
            legLow: createEdges(4.002, 6, 4.002),
            rightLegLow: createEdges(4.003, 6, 4.003)
        };
    }, [armConfig.armWidth]);

    useEffect(() => {
        return () => {
            if (coreEdgeGeometries) {
                Object.values(coreEdgeGeometries).forEach(g => g.dispose());
            }
        };
    }, [coreEdgeGeometries]);

    const charData = useMemo(() => ({
        armWidth: armConfig.armWidth,
        armPositionX: armConfig.armPositionX,
        uvMaps,
        mats,
        voxels
    }), [armConfig, uvMaps, mats, voxels]);

    // 4. 清理资源，防止内存泄漏和 WebGL Context Lost
    useEffect(() => {
        return () => {
            if (mats) {
                Object.values(mats).forEach((matList: any) => {
                    matList.forEach((m: THREE.Material) => {
                        if ((m as any).map) (m as any).map.dispose();
                        m.dispose();
                    });
                });
            }
            if (voxels) {
                Object.values(voxels).forEach((group: THREE.Group) => {
                    group.traverse((obj: any) => {
                        if (obj.isMesh) {
                            obj.geometry.dispose();
                            if (Array.isArray(obj.material)) {
                                obj.material.forEach((m: THREE.Material) => {
                                    if ((m as any).map) (m as any).map.dispose();
                                    m.dispose();
                                });
                            } else {
                                if (obj.material.map) obj.material.map.dispose();
                                obj.material.dispose();
                            }
                        } else if (obj.type === 'LineSegments') {
                            obj.geometry.dispose();
                            if (obj.material) {
                                obj.material.dispose();
                            }
                        }
                    });
                });
            }
        };
    }, [mats, voxels]);

    // 5. 监听 updateTrigger 更新材质纹理 (用于 Plane 模式流畅更新)
    useEffect(() => {
        if (!mats) return;

        Object.values(mats).forEach((matList: any) => {
            matList.forEach((m: THREE.Material) => {
                if ((m as any).map) {
                    (m as any).map.needsUpdate = true;
                }
            });
        });
    }, [updateTrigger, mats]);

    return (
        <group ref={characterRef} onPointerLeave={() => onHoverEnd?.()}>
            <Suspense fallback={null}>
                <DanceController action={action} partsRefs={partsRefs} fbxUrl={fbxUrl} />
            </Suspense>
            {/* Body */}
            <group ref={setPartRef('body')} position={[0, 10, 0]}>
                <group visible={visibleParts.body !== false}>
                    <mesh material={charData.mats.body} onPointerDown={(e) => handle3DClick('body', e, false, true)} onPointerMove={(e) => handle3DClick('body', e)}>
                        <boxGeometry args={[8, 12, 4]} />
                        {showEdges && (
                            <lineSegments geometry={coreEdgeGeometries.body}>
                                <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                            </lineSegments>
                        )}
                    </mesh>
                    {mode === 'voxel' ? (
                        <primitive object={charData.voxels.body} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('body', e, true, true)} onPointerMove={(e: any) => handle3DClick('body', e, true)} />
                    ) : (
                        <mesh material={charData.mats.bodyOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('body', e, true, true)} onPointerMove={(e) => handle3DClick('body', e, true)}>
                            <boxGeometry args={[8.5, 12.5, 4.5]} />
                        </mesh>
                    )}
                </group>

                {/* Head */}
                <group ref={setPartRef('head')} position={[0, 6, 0]} visible={visibleParts.head !== false}>
                    <group position={[0, 4, 0]}>
                        <mesh material={charData.mats.head} onPointerDown={(e) => handle3DClick('head', e, false, true)} onPointerMove={(e) => handle3DClick('head', e)}>
                            <boxGeometry args={[8, 8, 8]} />
                            {showEdges && (
                                <lineSegments geometry={coreEdgeGeometries.head}>
                                    <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                </lineSegments>
                            )}
                        </mesh>
                        {mode === 'voxel' ? (
                            <primitive object={charData.voxels.head} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('head', e, true, true)} onPointerMove={(e: any) => handle3DClick('head', e, true)} />
                        ) : (
                            <mesh material={charData.mats.headOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('head', e, true, true)} onPointerMove={(e) => handle3DClick('head', e, true)}>
                                <boxGeometry args={[9, 9, 9]} />
                            </mesh>
                        )}
                    </group>
                </group>

                {/* Left Arm & Left Lower Arm */}
                <group ref={setPartRef('left_arm')} position={[charData.armPositionX, 6, 0]} visible={visibleParts.leftArm !== false}>
                    <group position={[0, -3, 0]}>
                        <mesh material={charData.mats.leftArm} onPointerDown={(e) => handle3DClick('leftArm', e, false, true)} onPointerMove={(e) => handle3DClick('leftArm', e)}>
                            <boxGeometry args={[charData.armWidth, 6, 4]} />
                            {showEdges && (
                                <lineSegments geometry={coreEdgeGeometries.arm}>
                                    <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                </lineSegments>
                            )}
                        </mesh>
                        {mode === 'voxel' ? (
                            <primitive object={charData.voxels.leftArm} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('leftArm', e, true, true)} onPointerMove={(e: any) => handle3DClick('leftArm', e, true)} />
                        ) : (
                            <mesh material={charData.mats.leftArmOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('leftArm', e, true, true)} onPointerMove={(e) => handle3DClick('leftArm', e, true)}><boxGeometry args={[charData.armWidth + 0.5, 6.5, 4.5]} /></mesh>
                        )}
                    </group>
                    <group ref={setPartRef('left_low_arm')} position={[0, -6, 0]}>
                        <group position={[0, -2.95, 0]}>
                            <mesh material={charData.mats.leftArmLow} onPointerDown={(e) => handle3DClick('leftArmLow', e, false, true)} onPointerMove={(e) => handle3DClick('leftArmLow', e)}>
                                <boxGeometry args={[charData.armWidth + 0.002, 6, 4.002]} />
                                {showEdges && (
                                    <lineSegments geometry={coreEdgeGeometries.armLow}>
                                        <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                    </lineSegments>
                                )}
                            </mesh>
                            {mode === 'voxel' ? (
                                <primitive object={charData.voxels.leftArmLow} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('leftArmLow', e, true, true)} onPointerMove={(e: any) => handle3DClick('leftArmLow', e, true)} />
                            ) : (
                                <mesh material={charData.mats.leftArmLowOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('leftArmLow', e, true, true)} onPointerMove={(e) => handle3DClick('leftArmLow', e, true)}><boxGeometry args={[charData.armWidth + 0.502, 6.5, 4.502]} /></mesh>
                            )}
                        </group>
                    </group>
                </group>

                {/* Right Arm & Right Lower Arm */}
                <group ref={setPartRef('right_arm')} position={[-charData.armPositionX, 6, 0]} visible={visibleParts.rightArm !== false}>
                    <group position={[0, -3, 0]}>
                        <mesh material={charData.mats.rightArm} onPointerDown={(e) => handle3DClick('rightArm', e, false, true)} onPointerMove={(e) => handle3DClick('rightArm', e)}>
                            <boxGeometry args={[charData.armWidth, 6, 4]} />
                            {showEdges && (
                                <lineSegments geometry={coreEdgeGeometries.arm}>
                                    <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                </lineSegments>
                            )}
                        </mesh>
                        {mode === 'voxel' ? (
                            <primitive object={charData.voxels.rightArm} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('rightArm', e, true, true)} onPointerMove={(e: any) => handle3DClick('rightArm', e, true)} />
                        ) : (
                            <mesh material={charData.mats.rightArmOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('rightArm', e, true, true)} onPointerMove={(e) => handle3DClick('rightArm', e, true)}><boxGeometry args={[charData.armWidth + 0.5, 6.5, 4.5]} /></mesh>
                        )}
                    </group>
                    <group ref={setPartRef('right_low_arm')} position={[0, -6, 0]}>
                        <group position={[0, -2.95, 0]}>
                            <mesh material={charData.mats.rightArmLow} onPointerDown={(e) => handle3DClick('rightArmLow', e, false, true)} onPointerMove={(e) => handle3DClick('rightArmLow', e)}>
                                <boxGeometry args={[charData.armWidth + 0.002, 6, 4.002]} />
                                {showEdges && (
                                    <lineSegments geometry={coreEdgeGeometries.armLow}>
                                        <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                    </lineSegments>
                                )}
                            </mesh>
                            {mode === 'voxel' ? (
                                <primitive object={charData.voxels.rightArmLow} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('rightArmLow', e, true, true)} onPointerMove={(e: any) => handle3DClick('rightArmLow', e, true)} />
                            ) : (
                                <mesh material={charData.mats.rightArmLowOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('rightArmLow', e, true, true)} onPointerMove={(e) => handle3DClick('rightArmLow', e, true)}><boxGeometry args={[charData.armWidth + 0.502, 6.5, 4.502]} /></mesh>
                            )}
                        </group>
                    </group>
                </group>

                {/* Left Leg & Left Lower Leg */}
                <group ref={setPartRef('left_leg')} position={[2, -6, 0]} visible={visibleParts.leftLeg !== false}>
                    <group position={[0, -3, 0]}>
                        <mesh material={charData.mats.leftLeg} onPointerDown={(e) => handle3DClick('leftLeg', e, false, true)} onPointerMove={(e) => handle3DClick('leftLeg', e)}>
                            <boxGeometry args={[4, 6, 4]} />
                            {showEdges && (
                                <lineSegments geometry={coreEdgeGeometries.leg}>
                                    <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                </lineSegments>
                            )}
                        </mesh>
                        {mode === 'voxel' ? (
                            <primitive object={charData.voxels.leftLeg} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('leftLeg', e, true, true)} onPointerMove={(e: any) => handle3DClick('leftLeg', e, true)} />
                        ) : (
                            <mesh material={charData.mats.leftLegOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('leftLeg', e, true, true)} onPointerMove={(e) => handle3DClick('leftLeg', e, true)}><boxGeometry args={[4.5, 6.5, 4.5]} /></mesh>
                        )}
                    </group>
                    <group ref={setPartRef('left_low_leg')} position={[0, -6, 0]}>
                        <group position={[0, -2.95, 0]}>
                            <mesh material={charData.mats.leftLegLow} onPointerDown={(e) => handle3DClick('leftLegLow', e, false, true)} onPointerMove={(e) => handle3DClick('leftLegLow', e)}>
                                <boxGeometry args={[4.002, 6, 4.002]} />
                                {showEdges && (
                                    <lineSegments geometry={coreEdgeGeometries.legLow}>
                                        <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                    </lineSegments>
                                )}
                            </mesh>
                            {mode === 'voxel' ? (
                                <primitive object={charData.voxels.leftLegLow} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('leftLegLow', e, true, true)} onPointerMove={(e: any) => handle3DClick('leftLegLow', e, true)} />
                            ) : (
                                <mesh material={charData.mats.leftLegLowOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('leftLegLow', e, true, true)} onPointerMove={(e) => handle3DClick('leftLegLow', e, true)}><boxGeometry args={[4.502, 6.5, 4.502]} /></mesh>
                            )}
                        </group>
                    </group>
                </group>

                {/* Right Leg & Right Lower Leg */}
                <group ref={setPartRef('right_leg')} position={[-2, -6, 0]} visible={visibleParts.rightLeg !== false}>
                    <group position={[0, -3, 0]}>
                        <mesh material={charData.mats.rightLeg} onPointerDown={(e) => handle3DClick('rightLeg', e, false, true)} onPointerMove={(e) => handle3DClick('rightLeg', e)}>
                            <boxGeometry args={[4, 6, 4]} />
                            {showEdges && (
                                <lineSegments geometry={coreEdgeGeometries.leg}>
                                    <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                </lineSegments>
                            )}
                        </mesh>
                        {mode === 'voxel' ? (
                            <primitive object={charData.voxels.rightLeg} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('rightLeg', e, true, true)} onPointerMove={(e: any) => handle3DClick('rightLeg', e, true)} />
                        ) : (
                            <mesh material={charData.mats.rightLegOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('rightLeg', e, true, true)} onPointerMove={(e) => handle3DClick('rightLeg', e, true)}><boxGeometry args={[4.5, 6.5, 4.5]} /></mesh>
                        )}
                    </group>
                    <group ref={setPartRef('right_low_leg')} position={[0, -6, 0]}>
                        <group position={[0, -2.95, 0]}>
                            <mesh material={charData.mats.rightLegLow} onPointerDown={(e) => handle3DClick('rightLegLow', e, false, true)} onPointerMove={(e) => handle3DClick('rightLegLow', e)}>
                                <boxGeometry args={[4.003, 6, 4.003]} />
                                {showEdges && (
                                    <lineSegments geometry={coreEdgeGeometries.rightLegLow}>
                                        <lineBasicMaterial color="white" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                                    </lineSegments>
                                )}
                            </mesh>
                            {mode === 'voxel' ? (
                                <primitive object={charData.voxels.rightLegLow} visible={showOverlay} onPointerDown={(e: any) => handle3DClick('rightLegLow', e, true, true)} onPointerMove={(e: any) => handle3DClick('rightLegLow', e, true)} />
                            ) : (
                                <mesh material={charData.mats.rightLegLowOverlay} visible={showOverlay} onPointerDown={(e) => handle3DClick('rightLegLow', e, true, true)} onPointerMove={(e) => handle3DClick('rightLegLow', e, true)}><boxGeometry args={[4.502, 6.5, 4.502]} /></mesh>
                            )}
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
}

export function MC({ textureUrl, texture, mode = 'voxel', action = 'idle', visibleParts = {}, showOverlay = true, updateTrigger = 0, showEdges = false, printMode = false, onPaint, onPaintEnd, onHover, onHoverEnd }: { textureUrl?: string, texture?: THREE.Texture, mode?: 'voxel' | 'plane', action?: 'idle' | 'walking' | 'dance', visibleParts?: VisibleParts, showOverlay?: boolean, updateTrigger?: number, showEdges?: boolean, printMode?: boolean, onPaint?: (x: number, y: number) => void, onPaintEnd?: () => void, onHover?: (x: number, y: number) => void, onHoverEnd?: () => void }) {
    const isPaintingRef = useRef(false);
    const controlsRef = useRef<any>(null);

    useEffect(() => {
        const handleMouseUp = () => {
            if (isPaintingRef.current) {
                if (controlsRef.current) controlsRef.current.enabled = true;
                isPaintingRef.current = false;
                onPaintEnd?.();
            }
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [onPaintEnd]);

    return (
        <Canvas
            camera={{ position: [25, 25, 25], fov: 50 }}
            shadows
        >
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <Suspense fallback={null}>
                <Stage environment={null} intensity={0.6} adjustCamera={false}>
                    <MinecraftCharacter
                        textureUrl={textureUrl}
                        texture={texture}
                        mode={mode}
                        action={action}
                        visibleParts={visibleParts}
                        showOverlay={showOverlay}
                        updateTrigger={updateTrigger}
                        showEdges={showEdges}
                        printMode={printMode}
                        onPaint={onPaint ? (x, y) => {
                            if (!isPaintingRef.current) {
                                isPaintingRef.current = true;
                                if (controlsRef.current) controlsRef.current.enabled = false;
                            }
                            onPaint?.(x, y);
                        } : undefined}
                        onHover={onHover}
                        onHoverEnd={onHoverEnd}
                    />
                </Stage>
            </Suspense>
            <mesh onPointerMove={() => onHoverEnd?.()}>
                <sphereGeometry args={[200, 32, 32]} />
                <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
            </mesh>
            <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} />
        </Canvas>
    );
}