const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../src/components/MCModalPreview.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', '@react-three/fiber', '@react-three/drei', '@iconify/react', './MC', '../utils/httpClient', './FigureDiscountBadge'],
}).outputFiles[0].text;

test('modal scene skips unrelated updates, renders idle on demand, and suspends in hidden tabs', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const renders = [];
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, console, document, window,
        require(name) {
            if (name === '@react-three/fiber') return { Canvas: props => { renders.push(props); return null; } };
            if (name === '@react-three/drei') return { Stage: () => null, OrbitControls: () => null };
            if (name === './MC') return { MinecraftCharacter: () => null };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === './FigureDiscountBadge') return { FigurePrintOfferBadge: () => null };
            if (name === '../utils/httpClient') return {};
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const props = {
        textureUrl: '/skin.png', mode: 'plane', action: 'idle', modelType: 'steve',
        setMode() {}, setAction() {}, convertModel() {}, current: { mcmodal: {} },
    };
    const render = async patch => {
        Object.assign(props, patch);
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...props })));
    };
    try {
        await render({});
        assert.equal(renders.at(-1).frameloop, 'demand');
        assert.deepEqual(Array.from(renders.at(-1).dpr), [1, 1.5]);
        const count = renders.length;
        await render({ current: { mcmodal: {} }, onEdit() {}, modelType: 'alex', downloadFilename: 'renamed.png' });
        assert.equal(renders.length, count, 'Metadata and model detection must not rebuild the scene');
        await render({ action: 'walk' });
        assert.equal(renders.at(-1).frameloop, 'always');
        await render({ action: 'idle', mode: 'cute' });
        assert.equal(renders.at(-1).frameloop, 'always', 'Cute idle breathing stays animated');
        await React.act(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new window.Event('visibilitychange'));
        });
        assert.equal(renders.at(-1).frameloop, 'never');
        await React.act(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new window.Event('visibilitychange'));
        });
        assert.equal(renders.at(-1).frameloop, 'always');
        await render({ mode: 'voxel', action: 'idle' });
        assert.equal(renders.at(-1).frameloop, 'demand');
        await render({ action: 'dance' });
        assert.equal(renders.at(-1).frameloop, 'always');

        // Verify WebGL context loss shows fallback, restore clears it & invalidates, and unmount detaches listeners.
        const canvas = document.createElement('canvas');
        let invalidated = 0;
        renders.at(-1).onCreated({ gl: { domElement: canvas }, invalidate: () => { invalidated++; } });
        const lostEvent = new window.Event('webglcontextlost', { cancelable: true });
        await React.act(async () => { canvas.dispatchEvent(lostEvent); });
        assert.equal(lostEvent.defaultPrevented, true);
        assert.ok(document.body.textContent.includes('Preview unavailable'));
        await React.act(async () => { canvas.dispatchEvent(new window.Event('webglcontextrestored')); });
        assert.equal(invalidated, 1);
        assert.equal(document.body.textContent.includes('Preview unavailable'), false);

        await React.act(async () => root.unmount());
        const postUnmountLost = new window.Event('webglcontextlost', { cancelable: true });
        canvas.dispatchEvent(postUnmountLost);
        assert.equal(postUnmountLost.defaultPrevented, false, 'Unmount detaches context listeners before deferred forceContextLoss');
        return;
    } finally {
        await React.act(async () => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});

test('modal preview persists orbit rotation and pinch zoom distance to localStorage and restores them for the next skin', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const canvasProps = [];
    const orbitProps = [];
    const createMockControls = (initialPos) => {
        const position = {
            x: initialPos[0],
            y: initialPos[1],
            z: initialPos[2],
            set(x, y, z) { this.x = x; this.y = y; this.z = z; },
        };
        const target = { x: 0, y: 0, z: 0 };
        return {
            object: { position },
            target,
            updates: 0,
            update() { this.updates += 1; },
            getDistance() { return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z); },
            getAzimuthalAngle() { return Math.atan2(position.x - target.x, position.z - target.z); },
            getPolarAngle() { return Math.acos((position.y - target.y) / this.getDistance()); },
        };
    };
    let activeControls = null;
    const OrbitControls = React.forwardRef((props, ref) => {
        orbitProps.push(props);
        if (typeof ref === 'function') ref(activeControls);
        else if (ref) ref.current = activeControls;
        return null;
    });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, console, document, window,
        require(name) {
            if (name === '@react-three/fiber') {
                return {
                    Canvas: props => {
                        canvasProps.push(props);
                        if (!activeControls) activeControls = createMockControls(props.camera.position);
                        return React.Children.toArray(props.children).filter(child => child && child.type === OrbitControls);
                    },
                };
            }
            if (name === '@react-three/drei') return { Stage: () => null, OrbitControls };
            if (name === './MC') return { MinecraftCharacter: () => null };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === './FigureDiscountBadge') return { FigurePrintOfferBadge: () => null };
            if (name === '../utils/httpClient') return {};
            return require(name);
        },
    });

    const baseProps = {
        textureUrl: '/skin-a.png', mode: 'plane', action: 'idle', modelType: 'steve',
        setMode() {}, setAction() {}, convertModel() {}, current: { mcmodal: {} },
    };
    const dispatchTouch = (el, type, touches) => {
        const event = new window.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: touches });
        el.dispatchEvent(event);
        return event;
    };
    let root = createRoot(document.getElementById('root'));
    try {
        // Invalid stored JSON safely falls back to the default camera position.
        window.localStorage.setItem('mcmodal_camera_angle', '{broken');
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...baseProps })));
        assert.deepEqual(Array.from(canvasProps.at(-1).camera.position), [35, 35, 35]);
        assert.equal(canvasProps.at(-1).style.touchAction, 'none');
        assert.equal(orbitProps.at(-1).enableZoom, true);
        assert.equal(orbitProps.at(-1).minDistance, 18);
        assert.equal(orbitProps.at(-1).maxDistance, 160);
        assert.equal(orbitProps.at(-1).touches.ONE, 0);
        assert.equal(orbitProps.at(-1).touches.TWO, undefined);

        // Initial mount-time change event (before user interaction) must not overwrite localStorage.
        window.localStorage.removeItem('mcmodal_camera_angle');
        orbitProps.at(-1).onChange({ target: { getAzimuthalAngle: () => 0.5, getPolarAngle: () => 1.0, getDistance: () => 50 } });
        assert.equal(window.localStorage.getItem('mcmodal_camera_angle'), null);

        // User drags and releases: saved immediately on end with distance included.
        const draggedView = { azimuth: -1.8, polar: 1.25, distance: 42 };
        orbitProps.at(-1).onStart();
        orbitProps.at(-1).onChange({ target: { getAzimuthalAngle: () => -1.5, getPolarAngle: () => 1.1, getDistance: () => 45 } });
        orbitProps.at(-1).onEnd({ target: { getAzimuthalAngle: () => draggedView.azimuth, getPolarAngle: () => draggedView.polar, getDistance: () => draggedView.distance } });
        assert.deepEqual(JSON.parse(window.localStorage.getItem('mcmodal_camera_angle')), draggedView);

        // Mobile two-finger pinch zoom zooms in smoothly, prevents native page zoom, and persists the zoom distance.
        const previewEl = document.getElementById('root').firstElementChild;
        const singleTouch = dispatchTouch(previewEl, 'touchstart', [{ clientX: 100, clientY: 100 }]);
        assert.equal(singleTouch.defaultPrevented, false, 'Single-finger touch must not prevent clicks/rotation');

        const gestureEvt = new window.Event('gesturestart', { bubbles: true, cancelable: true });
        previewEl.dispatchEvent(gestureEvt);
        assert.equal(gestureEvt.defaultPrevented, true, 'Safari gesturestart must be prevented on the preview');

        // Put camera directly on -Z back view at distance 60, then spread two fingers 2x apart -> distance 30.
        activeControls.object.position.set(0, 0, -60);
        const pinchStart = dispatchTouch(previewEl, 'touchstart', [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 100 }]);
        assert.equal(pinchStart.defaultPrevented, true);
        const pinchMove = dispatchTouch(previewEl, 'touchmove', [{ clientX: 50, clientY: 100 }, { clientX: 250, clientY: 100 }]);
        assert.equal(pinchMove.defaultPrevented, true);
        assert.ok(Math.abs(activeControls.getDistance() - 30) < 1e-6, `Expected pinched distance 30, got ${activeControls.getDistance()}`);
        assert.ok(activeControls.updates > 0, 'Pinch move must update OrbitControls');

        // Extreme pinch-in clamps cleanly to minDistance (18).
        dispatchTouch(previewEl, 'touchmove', [{ clientX: 0, clientY: 100 }, { clientX: 2000, clientY: 100 }]);
        assert.ok(Math.abs(activeControls.getDistance() - 18) < 1e-6, `Expected clamped minDistance 18, got ${activeControls.getDistance()}`);

        // Settle at distance 30 and lift fingers -> saved immediately to localStorage.
        dispatchTouch(previewEl, 'touchmove', [{ clientX: 50, clientY: 100 }, { clientX: 250, clientY: 100 }]);
        dispatchTouch(previewEl, 'touchend', []);
        const savedAfterPinch = JSON.parse(window.localStorage.getItem('mcmodal_camera_angle'));
        assert.ok(Math.abs(savedAfterPinch.azimuth - Math.PI) < 1e-6);
        assert.ok(Math.abs(savedAfterPinch.polar - Math.PI / 2) < 1e-6);
        assert.ok(Math.abs(savedAfterPinch.distance - 30) < 1e-6);

        // Opening another skin initializes the camera to the saved angle AND saved zoom distance.
        await React.act(async () => root.unmount());
        activeControls = null;
        root = createRoot(document.getElementById('root'));
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...baseProps, textureUrl: '/skin-b.png' })));
        const [x, y, z] = canvasProps.at(-1).camera.position;
        assert.ok(Math.abs(x - 0) < 1e-6, `Expected x ≈ 0, got ${x}`);
        assert.ok(Math.abs(y - 0) < 1e-6, `Expected y ≈ 0, got ${y}`);
        assert.ok(Math.abs(z - -30) < 1e-6, `Expected z ≈ -30, got ${z}`);

        // Backwards compatibility: legacy saved { azimuth, polar } without distance restores at default distance.
        await React.act(async () => root.unmount());
        activeControls = null;
        window.localStorage.setItem('mcmodal_camera_angle', JSON.stringify({ azimuth: Math.PI, polar: Math.PI / 2 }));
        root = createRoot(document.getElementById('root'));
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...baseProps, textureUrl: '/skin-c.png' })));
        const [lx, ly, lz] = canvasProps.at(-1).camera.position;
        const expectedDistance = Math.hypot(35, 35, 35);
        assert.ok(Math.abs(lx - 0) < 1e-6);
        assert.ok(Math.abs(ly - 0) < 1e-6);
        assert.ok(Math.abs(lz - -expectedDistance) < 1e-6);
    } finally {
        await React.act(async () => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});

test('switching Strong/Slim shows a subtle temporary-effect reminder with clickable Edit without rebuilding the 3D scene', async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
    const renders = [];
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, console, document, window,
        require(name) {
            if (name === '@react-three/fiber') return { Canvas: props => { renders.push(props); return null; } };
            if (name === '@react-three/drei') return { Stage: () => null, OrbitControls: () => null };
            if (name === './MC') return { MinecraftCharacter: () => null };
            if (name === '@iconify/react') return { Icon: () => null };
            if (name === './FigureDiscountBadge') return { FigurePrintOfferBadge: () => null };
            if (name === '../utils/httpClient') return {};
            return require(name);
        },
    });
    const root = createRoot(document.getElementById('root'));
    const converted = [];
    let editClicks = 0;
    const props = {
        textureUrl: '/skin.png',
        mode: 'plane',
        action: 'idle',
        modelType: 'steve',
        setMode() {},
        setAction() {},
        convertModel(target) { converted.push(target); },
        onEdit() { editClicks += 1; },
        current: {
            fontClass: 'font-pixel-hans',
            mcmodal: {
                strongMode: '标准型',
                slimMode: '纤细型',
                modelTempNotice: '仅临时生效，如需修改请点击',
                modelTempNoticeEdit: 'Edit',
            },
        },
    };
    const render = async patch => {
        Object.assign(props, patch);
        await React.act(async () => root.render(React.createElement(module.exports.MCModalPreview, { ...props })));
    };
    try {
        await render({});
        assert.equal(document.querySelector('[role="status"]'), null, 'No temporary notice before switching Strong/Slim');

        const findButton = text => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === text);
        const initialSceneRenders = renders.length;

        // Clicking the already-active Strong button is a no-op.
        await React.act(async () => { findButton('标准型').click(); });
        assert.deepEqual(converted, []);
        assert.equal(document.querySelector('[role="status"]'), null);

        // Clicking Slim triggers convertModel and shows the subtle temporary reminder.
        await React.act(async () => { findButton('纤细型').click(); });
        assert.deepEqual(converted, ['alex']);
        assert.equal(renders.length, initialSceneRenders, 'Showing the model reminder must not rebuild the 3D scene');
        const notice = document.querySelector('[role="status"]');
        assert.ok(notice, 'Temporary notice should appear after switching Strong/Slim');
        assert.match(notice.textContent, /仅临时生效，如需修改请点击/);
        assert.match(notice.textContent, /Edit/);

        // Clicking Edit inside the reminder triggers onEdit.
        const editButton = notice.querySelector('button');
        assert.ok(editButton, 'Edit link inside notice should be clickable when onEdit is provided');
        await React.act(async () => { editButton.click(); });
        assert.equal(editClicks, 1);

        // Controlled prop reset (e.g., switching to another skin in MCModal) hides the notice cleanly.
        await render({ showModelTempNotice: false });
        assert.equal(document.querySelector('[role="status"]'), null);
        await render({ showModelTempNotice: true });
        assert.ok(document.querySelector('[role="status"]'));
    } finally {
        await React.act(async () => root.unmount());
        global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        dom.window.close();
    }
});
