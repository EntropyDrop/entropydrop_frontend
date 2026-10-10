import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

export function EditorLighting() {
    const lightRigRef = useRef<Group>(null);

    useFrame(({ camera }) => {
        // Keep the key light above and to the left of the current view.
        if (lightRigRef.current) camera.getWorldQuaternion(lightRigRef.current.quaternion);
    });

    return (
        <>
            <ambientLight intensity={0.18} />
            <hemisphereLight args={['#ffffff', '#dce5f0', 0.28]} />
            <group ref={lightRigRef}>
                <directionalLight
                    position={[-12, 14, 44]} intensity={2.8} castShadow
                    shadow-mapSize={[1024, 1024]}
                    shadow-camera-left={-24} shadow-camera-right={24}
                    shadow-camera-top={24} shadow-camera-bottom={-24}
                    shadow-camera-near={1} shadow-camera-far={120}
                    shadow-normalBias={0.05}
                />
            </group>
        </>
    );
}
