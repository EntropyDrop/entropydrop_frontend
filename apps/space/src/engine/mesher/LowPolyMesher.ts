import * as THREE from 'three';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../voxel/Chunk.ts';
import { BlockTypes } from '../voxel/BlockTypes.ts';

export class LowPolyMesher {
  private mode: string;
  private solidMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private glassMaterial: THREE.MeshStandardMaterial;
  private _tempColor: THREE.Color;

  constructor() {
    this.mode = 'beveled_lowpoly'; // 'beveled_lowpoly' | 'classic_cubes'

    // Solid opaque material
    this.solidMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.65,
      metalness: 0.15,
      shadowSide: THREE.DoubleSide
    });

    // Transparent water material
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

    // Glass material
    this.glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xdff9fb,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.25,
      side: THREE.DoubleSide
    });

    // Pre-allocate color objects for speed
    this._tempColor = new THREE.Color();
  }

  buildChunkMesh(chunk) {
    const origin = chunk.getWorldOrigin();
    const group = new THREE.Group();
    group.name = `Chunk_${chunk.cx}_${chunk.cz}`;
    group.position.set(origin.x, origin.y, origin.z);

    const solidPositions = [];
    const solidNormals = [];
    const solidColors = [];

    const waterPositions = [];
    const waterNormals = [];
    const waterColors = [];

    const glassPositions = [];
    const glassNormals = [];
    const glassColors = [];

    // Face definitions: [dx, dy, dz, normal, faceVertices]
    const faces = [
      // Top (+Y)
      { dir: [0, 1, 0], face: 'top', norm: [0, 1, 0], quad: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      // Bottom (-Y)
      { dir: [0, -1, 0], face: 'bottom', norm: [0, -1, 0], quad: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      // North (-Z)
      { dir: [0, 0, -1], face: 'side', norm: [0, 0, -1], quad: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
      // South (+Z)
      { dir: [0, 0, 1], face: 'side', norm: [0, 0, 1], quad: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
      // West (-X)
      { dir: [-1, 0, 0], face: 'side', norm: [-1, 0, 0], quad: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
      // East (+X)
      { dir: [1, 0, 0], face: 'side', norm: [1, 0, 0], quad: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] }
    ];

    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let ly = 0; ly < CHUNK_SIZE_Y; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          const block = chunk.getLocalBlock(lx, ly, lz);
          if (!block || block === BlockTypes.AIR) continue;

          for (const f of faces) {
            const nx = lx + f.dir[0];
            const ny = ly + f.dir[1];
            const nz = lz + f.dir[2];

            let neighbor = 0;
            // Faces at the streaming window edge neighbor an ungenerated
            // chunk; remember that so the cut wall can read as terrain.
            let cutEdge = false;
            if (nx >= 0 && nx < CHUNK_SIZE_X && ny >= 0 && ny < CHUNK_SIZE_Y && nz >= 0 && nz < CHUNK_SIZE_Z) {
              neighbor = chunk.getLocalBlock(nx, ny, nz);
            } else if (chunk.world) {
              const wx = origin.x + nx;
              const wy = origin.y + ny;
              const wz = origin.z + nz;
              const horizontalCut = (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z);
              if (horizontalCut && wy >= 0 && wy < CHUNK_SIZE_Y) {
                const { cx, cz } = chunk.world.worldToChunkCoords(wx, wz);
                const nChunk = chunk.world.getChunk(cx, cz);
                if (!nChunk || !nChunk.hasGenerated) {
                  neighbor = 0;
                  cutEdge = true;
                } else {
                  neighbor = chunk.world.getBlock(wx, wy, wz);
                }
              } else {
                neighbor = chunk.world.getBlock(wx, wy, wz);
              }
            }

            if (neighbor !== BlockTypes.AIR) continue;

            this._tempColor.setHex(chunk.getLocalColor(lx, ly, lz));

            // Subtle shade variation for low-poly feel. Cut edges at the
            // streaming window keep top-shade so the wall looks like the
            // terrain continuing past the rendered chunk range.
            const shade = f.face === 'top' ? 1.0 : f.face === 'bottom' ? 0.6 : cutEdge ? 1.0 : 0.85;
            const r = this._tempColor.r * shade;
            const g = this._tempColor.g * shade;
            const b = this._tempColor.b * shade;

            let posArr = solidPositions;
            let normArr = solidNormals;
            let colArr = solidColors;

            // Two triangles per quad: 0-1-2 and 0-2-3
            const q = f.quad;
            const v0 = [lx + q[0][0], ly + q[0][1], lz + q[0][2]];
            const v1 = [lx + q[1][0], ly + q[1][1], lz + q[1][2]];
            const v2 = [lx + q[2][0], ly + q[2][1], lz + q[2][2]];
            const v3 = [lx + q[3][0], ly + q[3][1], lz + q[3][2]];

            // Triangle 1
            posArr.push(...v0, ...v1, ...v2);
            normArr.push(...f.norm, ...f.norm, ...f.norm);
            colArr.push(r, g, b, r, g, b, r, g, b);

            // Triangle 2
            posArr.push(...v0, ...v2, ...v3);
            normArr.push(...f.norm, ...f.norm, ...f.norm);
            colArr.push(r, g, b, r, g, b, r, g, b);
          }
        }
      }
    }

    // Build solid mesh
    if (solidPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(solidColors, 3));
      const mesh = new THREE.Mesh(geo, this.solidMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Build water mesh
    if (waterPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Build glass mesh
    if (glassPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(glassPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(glassNormals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(glassColors, 3));
      const mesh = new THREE.Mesh(geo, this.glassMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }
}
