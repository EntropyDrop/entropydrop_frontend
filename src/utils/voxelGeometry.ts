import * as THREE from 'three';

const faces = ['left', 'right', 'top', 'bottom', 'front', 'back'] as const;
type VoxelCell = { x: number; y: number; z: number } & Partial<Record<typeof faces[number], number>>;

/** Bake opaque preview voxels into one draw call, retaining each face's color. */
export function createVoxelGeometry(cells: VoxelCell[], scale: [number, number, number], taper?: { height: number; amount: number }) {
    const box = new THREE.BoxGeometry(...scale);
    const sourcePositions = box.getAttribute('position');
    const sourceNormals = box.getAttribute('normal');
    const sourceIndices = box.getIndex()!;
    const vertexCount = sourcePositions.count;
    const positions = new Float32Array(cells.length * vertexCount * 3);
    const normals = new Float32Array(positions.length);
    const colors = new Float32Array(positions.length);
    const indices = new (cells.length * vertexCount > 65535 ? Uint32Array : Uint16Array)(cells.length * sourceIndices.count);
    const color = new THREE.Color();

    cells.forEach((cell, cellIndex) => {
        const x = (cell.x - 0.5) * scale[0];
        const y = (cell.y - 0.5) * scale[1];
        const z = (cell.z - 0.5) * scale[2];
        // Cute tapers each voxel at its center, just like the editable mesh.
        const taperScale = taper ? 1 - taper.amount * THREE.MathUtils.clamp((y + taper.height / 2) / taper.height, 0, 1) : 1;
        const fallback = cell.left ?? cell.right ?? cell.top ?? cell.bottom ?? cell.front ?? cell.back ?? 0;
        for (let face = 0; face < faces.length; face++) {
            color.setHex(cell[faces[face]] ?? fallback);
            for (let corner = 0; corner < 4; corner++) {
                const vertex = face * 4 + corner;
                const offset = (cellIndex * vertexCount + vertex) * 3;
                positions[offset] = (sourcePositions.getX(vertex) + x) * taperScale;
                positions[offset + 1] = sourcePositions.getY(vertex) + y;
                positions[offset + 2] = sourcePositions.getZ(vertex) + z;
                normals[offset] = sourceNormals.getX(vertex);
                normals[offset + 1] = sourceNormals.getY(vertex);
                normals[offset + 2] = sourceNormals.getZ(vertex);
                color.toArray(colors, offset);
            }
        }
        for (let index = 0; index < sourceIndices.count; index++) {
            indices[cellIndex * sourceIndices.count + index] = cellIndex * vertexCount + sourceIndices.getX(index);
        }
    });
    box.dispose();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}
