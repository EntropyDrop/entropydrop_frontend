const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const React = require('react');
const THREE = require('three');

// Inspect the real scene and pointer handlers without a GPU or animation loop.
const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../src/components/MC.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'three', '@react-three/fiber', '@react-three/drei', './utils'],
}).outputFiles[0].text;
const moduleRef = { exports: {} };
const frameCallbacks = [];
vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports,
    document: { createElement() {
        let source;
        return { getContext: () => ({
            drawImage(image) { source = image; },
            getImageData() { return source.pixels; },
        }) };
    } },
    require: name => {
        if (name === 'react') return { ...React, useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect() {} };
        if (name === '@react-three/fiber') return { Canvas: 'canvas', useFrame: callback => frameCallbacks.push(callback) };
        if (name === '@react-three/drei') return { Stage: 'stage', OrbitControls: 'orbit-controls' };
        if (name === './utils') return { isSlim: image => image.slim, ensureSkinVoxelModeConsistency() {} };
        return require(name);
    },
});
const { MinecraftCharacterInner, MC } = moduleRef.exports;

function findAll(node, predicate) {
    if (Array.isArray(node)) return node.flatMap(child => findAll(child, predicate));
    if (!node || typeof node !== 'object' || !node.props) return [];
    return [...(predicate(node) ? [node] : []), ...findAll(node.props.children, predicate)];
}
function fixture({ slim = false, ...props } = {}) {
    const texture = new THREE.Texture({ width: 64, height: 64, complete: false, slim });
    const painted = [], hovered = [];
    const tree = MinecraftCharacterInner({ texture, mode: 'plane', unifiedArms: true,
        onPaint: (...pixel) => painted.push(pixel), onHover: (...pixel) => hovered.push(pixel), ...props });
    const shoulders = findAll(tree, node => node.type === 'group' && Math.abs(node.props.position?.[0]) === (slim ? 5.5 : 6));
    return { tree, shoulders, painted, hovered };
}

for (const slim of [false, true]) {
    test(`${slim ? 'Slim' : 'Classic'} editor arms have one continuous base and one continuous overlay`, () => {
        const { shoulders } = fixture({ slim });
        assert.equal(shoulders.length, 2);
        for (const shoulder of shoulders) {
            const meshes = findAll(shoulder, node => node.type === 'mesh');
            assert.equal(meshes.length, 2, 'No overlapping elbow or forearm meshes remain');
            const boxes = meshes.map(mesh => findAll(mesh, node => node.type === 'boxGeometry')[0]);
            assert.deepEqual(Array.from(boxes[0].props.args), [slim ? 3 : 4, 12, 4]);
            assert.deepEqual(Array.from(boxes[1].props.args), [slim ? 3.5 : 4.5, 12.5, 4.5]);
            for (const mesh of meshes) assert.ok(mesh.props.material.every(material => material.map), 'Both end caps retain skin textures');
        }
    });
    for (const showOverlay of [false, true]) {
        test(`${slim ? 'Slim' : 'Classic'} ${showOverlay ? 'overlay' : 'base'} paints and samples across the former elbow`, () => {
            const { shoulders, painted, hovered } = fixture({ slim, showOverlay });
            for (const shoulder of shoulders) {
                const left = shoulder.props.position[0] > 0;
                const mesh = findAll(shoulder, node => node.type === 'mesh')[showOverlay ? 1 : 0];
                const frontX = 44 + (left ? -8 : 0) + (showOverlay && left ? 16 : 0);
                const frontY = 20 + (left ? 32 : 0) + (showOverlay && !left ? 16 : 0);
                const width = slim ? 3 : 4;
                for (let row = 0; row < 12; row++) {
                    const uv = new THREE.Vector2(0.5 / width, 1 - (row + 0.5) / 12);
                    const event = { face: { materialIndex: 4 }, uv, stopPropagation() {}, buttons: 1 };
                    mesh.props.onPointerDown(event);
                    mesh.props.onPointerMove({ ...event, buttons: 0 });
                    assert.deepEqual(painted.at(-1), [frontX, frontY + row]);
                    assert.deepEqual(hovered.at(-1), painted.at(-1));
                    const map = mesh.props.material[4].map;
                    map.updateMatrix();
                    const sampled = map.transformUv(uv.clone()).multiplyScalar(64).floor();
                    assert.deepEqual(sampled.toArray(), painted.at(-1), 'Painting must match the rendered texel');
                }
            }
        });
    }
}

test('ordinary and dance previews retain split arms', () => {
    for (const props of [{ unifiedArms: false }, { unifiedArms: false, action: 'dance' }, { unifiedArms: true, action: 'dance' }]) {
        const { shoulders } = fixture(props);
        for (const shoulder of shoulders) assert.equal(findAll(shoulder, node => node.type === 'mesh').length, 4);
    }
});

test('editor lighting follows camera rotation and stays still when the camera stops', () => {
    const scene = MC({ litMaterials: true });
    const lighting = findAll(scene, node => typeof node.type === 'function' && node.type.name === 'EditorLighting')[0];
    assert.ok(lighting);
    const tree = lighting.type();
    const frame = frameCallbacks.at(-1);
    const rig = findAll(tree, node => node.type === 'group')[0];
    const group = new THREE.Group();
    rig.props.ref.current = group;
    const light = findAll(rig, node => node.type === 'directionalLight')[0];
    const key = new THREE.DirectionalLight(0xffffff, light.props.intensity);
    key.position.set(...light.props.position);
    group.add(key);
    const camera = new THREE.PerspectiveCamera();
    const positions = [[25, 25, 25], [-25, 25, 25], [-25, 25, -25], [25, 25, -25], [10, 45, -10], [0, -35, 25]];
    for (const position of positions) {
        camera.position.set(...position);
        camera.lookAt(0, 0, 0);
        frame({ camera }, 1 / 60);
        const worldPosition = key.getWorldPosition(new THREE.Vector3());
        const viewRelative = worldPosition.clone().applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()).invert());
        assert.ok(viewRelative.distanceTo(key.position) < 1e-8, 'Light keeps its screen-relative angle at every azimuth and elevation');
        assert.ok(viewRelative.z > 0, 'The light remains on the viewing side of the character');
        frame({ camera }, 10);
        assert.ok(key.getWorldPosition(new THREE.Vector3()).distanceTo(worldPosition) < 1e-8, 'Elapsed time no longer rotates the light');
        camera.position.multiplyScalar(2);
        frame({ camera }, 1 / 30);
        assert.ok(key.getWorldPosition(new THREE.Vector3()).distanceTo(worldPosition) < 1e-8, 'Zoom does not move the light or change its intensity');
    }
    assert.ok(findAll(tree, node => node.type === 'ambientLight' || node.type === 'hemisphereLight').length > 0);
    assert.equal(findAll(MC({ litMaterials: false, flatLighting: true }), node => node.type === lighting.type).length, 0, 'The lighting switch removes the camera light');
    assert.equal(findAll(MC({}), node => node.type === lighting.type).length, 0, 'Other previews keep their existing lighting');
});


test('model previews configure their own texture without changing the caller texture', () => {
    const texture = new THREE.Texture({ width: 64, height: 64, complete: false });
    const before = { mag: texture.magFilter, min: texture.minFilter, color: texture.colorSpace };
    const tree = MinecraftCharacterInner({ texture, mode: 'plane' });
    const face = findAll(tree, node => node.type === 'mesh')[0].props.material.find(material => material.map).map;
    assert.notEqual(face, texture);
    assert.equal(face.magFilter, THREE.NearestFilter);
    assert.equal(face.colorSpace, THREE.SRGBColorSpace);
    assert.deepEqual({ mag: texture.magFilter, min: texture.minFilter, color: texture.colorSpace }, before);
});

test('canvas-backed editor textures produce voxel overlays and refresh after pixel edits', () => {
    const pixels = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    const offset = (8 * 64 + 40) * 4; // Front of the head overlay.
    const texture = new THREE.Texture({ width: 64, height: 64, pixels });
    for (const [revision, color] of [[1, [255, 0, 0, 255]], [2, [0, 255, 0, 255]]]) {
        pixels.data.set(color, offset);
        const tree = MinecraftCharacterInner({ texture, mode: 'voxel', updateTrigger: revision });
        const overlays = findAll(tree, node => node.type === 'primitive' && node.props.object instanceof THREE.Group);
        const head = overlays.map(node => node.props.object).find(group => group.children.length === 1);
        assert.ok(head, 'Canvas images do not have HTMLImageElement.complete');
        assert.equal(head.children[0].material[4].color.getHex(), revision === 1 ? 0xff0000 : 0x00ff00);
    }
});
