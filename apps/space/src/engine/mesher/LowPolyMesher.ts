import * as THREE from 'three';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../voxel/Chunk.ts';
import { BlockTypes } from '../voxel/BlockTypes.ts';

type FaceDefinition = Readonly<{
  dir: readonly [number, number, number];
  face: 'top' | 'bottom' | 'side';
  norm: readonly [number, number, number];
  quad: readonly (readonly [number, number, number])[];
}>;

// Module constants keep chunk rebuilds from recreating the same nested arrays.
// Winding stays 0-1-2, 0-2-3 because bent-world raycasts mirror it exactly.
const FACES: readonly FaceDefinition[] = [
  { dir: [0, 1, 0], face: 'top', norm: [0, 1, 0], quad: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], face: 'bottom', norm: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], face: 'side', norm: [0, 0, -1], quad: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], face: 'side', norm: [0, 0, 1], quad: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
  { dir: [-1, 0, 0], face: 'side', norm: [-1, 0, 0], quad: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
  { dir: [1, 0, 0], face: 'side', norm: [1, 0, 0], quad: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] }
] as const;

const CUT_EDGE_FLAG = 0x100;

export class LowPolyMesher {
  private mode: string;
  private solidMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private glassMaterial: THREE.MeshStandardMaterial;
  private _tempColor: THREE.Color;

  constructor() {
    this.mode = 'beveled_lowpoly'; // 'beveled_lowpoly' | 'classic_cubes'

    this.solidMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.65,
      metalness: 0.15,
      shadowSide: THREE.DoubleSide
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x2980b9,
      vertexColors: true,
      flatShading: true,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xdff9fb,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.25,
      side: THREE.DoubleSide
    });

    this._tempColor = new THREE.Color();
  }

  buildChunkMesh(chunk) {
    const origin = chunk.getWorldOrigin();
    const group = new THREE.Group();
    group.name = `Chunk_${chunk.cx}_${chunk.cz}`;
    group.position.set(origin.x, origin.y, origin.z);

    // Resolve the four horizontal neighbor chunks once. The previous hot loop
    // repeated wrapped world-coordinate conversion and map lookup for every
    // boundary voxel face (up to thousands of times per rebuild).
    const world = chunk.world;
    const neighborChunks = new Map<number, any>();
    if (world) {
      const resolve = (faceIndex: number, wx: number, wz: number) => {
        const { cx, cz } = world.worldToChunkCoords(wx, wz);
        neighborChunks.set(faceIndex, world.getChunk(cx, cz));
      };
      resolve(2, origin.x, origin.z - 1);
      resolve(3, origin.x, origin.z + CHUNK_SIZE_Z);
      resolve(4, origin.x - 1, origin.z);
      resolve(5, origin.x + CHUNK_SIZE_X, origin.z);
    }

    const sampleNeighbor = (
      lx: number,
      ly: number,
      lz: number,
      faceIndex: number
    ): number => {
      const face = FACES[faceIndex];
      const nx = lx + face.dir[0];
      const ny = ly + face.dir[1];
      const nz = lz + face.dir[2];
      if (
        nx >= 0 && nx < CHUNK_SIZE_X
        && ny >= 0 && ny < CHUNK_SIZE_Y
        && nz >= 0 && nz < CHUNK_SIZE_Z
      ) {
        return chunk.blocks[(ny * CHUNK_SIZE_Z + nz) * CHUNK_SIZE_X + nx];
      }
      if (!world || ny < 0 || ny >= CHUNK_SIZE_Y) return BlockTypes.AIR;

      const neighborChunk = neighborChunks.get(faceIndex);
      if (!neighborChunk?.hasGenerated) return CUT_EDGE_FLAG;
      if (faceIndex === 2) return neighborChunk.getLocalBlock(lx, ny, CHUNK_SIZE_Z - 1);
      if (faceIndex === 3) return neighborChunk.getLocalBlock(lx, ny, 0);
      if (faceIndex === 4) return neighborChunk.getLocalBlock(CHUNK_SIZE_X - 1, ny, lz);
      if (faceIndex === 5) return neighborChunk.getLocalBlock(0, ny, lz);
      return BlockTypes.AIR;
    };

    const visitVisibleFaces = (visitor: (
      lx: number,
      ly: number,
      lz: number,
      face: FaceDefinition,
      cutEdge: boolean,
      color: number
    ) => void) => {
      const blocks = chunk.blocks as Uint8Array;
      const colors = chunk.colors as Uint32Array;
      for (let ly = 0; ly < CHUNK_SIZE_Y; ly++) {
        const layerOffset = ly * CHUNK_SIZE_Z * CHUNK_SIZE_X;
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          let index = layerOffset + lz * CHUNK_SIZE_X;
          for (let lx = 0; lx < CHUNK_SIZE_X; lx++, index++) {
            if (blocks[index] === BlockTypes.AIR) continue;
            for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
              const neighbor = sampleNeighbor(lx, ly, lz, faceIndex);
              if ((neighbor & 0xff) !== BlockTypes.AIR) continue;
              visitor(lx, ly, lz, FACES[faceIndex], (neighbor & CUT_EDGE_FLAG) !== 0, colors[index]);
            }
          }
        }
      }
    };

    let faceCount = 0;
    visitVisibleFaces(() => { faceCount++; });
    if (faceCount === 0) return group;

    // Four indexed vertices replace six duplicated triangle vertices per face.
    // Apart from reducing uploads, this also cuts the torus vertex-shader work
    // by one third while retaining one-metre tessellation along curved terrain.
    const vertexCount = faceCount * 4;
    // Chunk-local coordinates are integral and bounded by 0..128. Compact
    // integer attributes are expanded by WebGL during vertex fetch, avoiding
    // 32-bit floats for data that only needs 8 bits (similar to Sodium's
    // compact terrain vertex formats).
    const PositionArray = Math.max(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z) <= 0xff
      ? Uint8Array
      : Uint16Array;
    const positions = new PositionArray(vertexCount * 3);
    const normals = new Int8Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 3);
    const indices = vertexCount <= 0xffff
      ? new Uint16Array(faceCount * 6)
      : new Uint32Array(faceCount * 6);

    let vertexOffset = 0;
    let attributeOffset = 0;
    let indexOffset = 0;
    visitVisibleFaces((lx, ly, lz, face, cutEdge, color) => {
      this._tempColor.setHex(color);
      const shade = face.face === 'top' ? 1 : face.face === 'bottom' ? 0.6 : cutEdge ? 1 : 0.85;
      const r = this._tempColor.r * shade;
      const g = this._tempColor.g * shade;
      const b = this._tempColor.b * shade;

      for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
        const vertex = face.quad[vertexIndex];
        positions[attributeOffset] = lx + vertex[0];
        normals[attributeOffset] = face.norm[0] * 127;
        colors[attributeOffset++] = Math.round(r * 255);
        positions[attributeOffset] = ly + vertex[1];
        normals[attributeOffset] = face.norm[1] * 127;
        colors[attributeOffset++] = Math.round(g * 255);
        positions[attributeOffset] = lz + vertex[2];
        normals[attributeOffset] = face.norm[2] * 127;
        colors[attributeOffset++] = Math.round(b * 255);
      }

      indices[indexOffset++] = vertexOffset;
      indices[indexOffset++] = vertexOffset + 1;
      indices[indexOffset++] = vertexOffset + 2;
      indices[indexOffset++] = vertexOffset;
      indices[indexOffset++] = vertexOffset + 2;
      indices[indexOffset++] = vertexOffset + 3;
      vertexOffset += 4;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const mesh = new THREE.Mesh(geometry, this.solidMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
  }
}
