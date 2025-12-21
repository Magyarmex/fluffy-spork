import * as THREE from 'three';
import { ProjectModel, materialFromIndex } from '@core/project';
import { MATERIALS } from '@core/materials';
import { gridToWorld, indexFor } from '@core/grid';
import { recordDebug } from '@core/debug';

export class TerrainMesh {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private topVertexCount: number;
  private lastBounds: { min: number; max: number } = { min: 0, max: 0 };
  private lastMetricTs = 0;

  constructor(project: ProjectModel) {
    const { resolution } = project.terrain;
    this.topVertexCount = resolution * resolution;
    const vertexCount = this.topVertexCount * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    const indices: number[] = [];
    for (let j = 0; j < resolution - 1; j++) {
      for (let i = 0; i < resolution - 1; i++) {
        const a = j * resolution + i;
        const b = j * resolution + (i + 1);
        const c = (j + 1) * resolution + i;
        const d = (j + 1) * resolution + (i + 1);
        indices.push(a, c, b, b, c, d);

        const ba = this.topVertexCount + a;
        const bb = this.topVertexCount + b;
        const bc = this.topVertexCount + c;
        const bd = this.topVertexCount + d;
        indices.push(ba, bb, bc, bb, bd, bc);
      }
    }

    const pushSide = (t0: number, t1: number, b0: number, b1: number) => {
      indices.push(t0, b0, t1, t1, b0, b1);
    };

    for (let j = 0; j < resolution - 1; j++) {
      const base = this.topVertexCount;
      const leftTopA = j * resolution;
      const leftTopB = (j + 1) * resolution;
      pushSide(leftTopA, leftTopB, base + leftTopA, base + leftTopB);

      const rightTopA = j * resolution + (resolution - 1);
      const rightTopB = (j + 1) * resolution + (resolution - 1);
      pushSide(rightTopA, rightTopB, base + rightTopA, base + rightTopB);
    }

    for (let i = 0; i < resolution - 1; i++) {
      const base = this.topVertexCount;
      const frontTopA = i;
      const frontTopB = i + 1;
      pushSide(frontTopA, frontTopB, base + frontTopA, base + frontTopB);

      const backTopA = (resolution - 1) * resolution + i;
      const backTopB = (resolution - 1) * resolution + i + 1;
      pushSide(backTopA, backTopB, base + backTopA, base + backTopB);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      metalness: 0,
      roughness: 0.9,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.update(project);
  }

  update(project: ProjectModel) {
    const { resolution, heightGrid, materialGrid, lateralOffsetX, lateralOffsetZ, baseDepthCm } = project.terrain;
    const { widthCm, depthCm } = project.tank;
    const tintCache: Record<number, THREE.Color> = {};
    let ptr = 0;
    let cptr = 0;
    const bottomStart = this.topVertexCount;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const idx = indexFor(i, j, resolution);
        const base = gridToWorld(i, j, resolution, project.tank);
        const x = base.x + lateralOffsetX[idx];
        const z = base.z + lateralOffsetZ[idx];
        const y = heightGrid[idx];
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        this.positions[ptr++] = x;
        this.positions[ptr++] = y;
        this.positions[ptr++] = z;

        const bottomIdx = bottomStart + idx;
        this.positions[bottomIdx * 3] = base.x;
        this.positions[bottomIdx * 3 + 1] = baseDepthCm;
        this.positions[bottomIdx * 3 + 2] = base.z;

        const matIdx = materialGrid[idx];
        if (!tintCache[matIdx]) {
          const material = MATERIALS[materialFromIndex(matIdx)];
          const base = new THREE.Color('#44506a');
          const tint = new THREE.Color(material.tint);
          base.lerp(tint, project.settings.showMaterialTint ? 0.35 : 0.08);
          tintCache[matIdx] = base;
        }
        const color = tintCache[matIdx];
        this.colors[cptr++] = color.r;
        this.colors[cptr++] = color.g;
        this.colors[cptr++] = color.b;

        const bottomColor = color.clone().multiplyScalar(0.7);
        this.colors[bottomIdx * 3] = bottomColor.r;
        this.colors[bottomIdx * 3 + 1] = bottomColor.g;
        this.colors[bottomIdx * 3 + 2] = bottomColor.b;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
    const now = performance.now();
    if (
      (Math.abs(minY - this.lastBounds.min) > 0.5 || Math.abs(maxY - this.lastBounds.max) > 0.5) &&
      now - this.lastMetricTs > 750
    ) {
      recordDebug('info', 'Terrain bounds updated', `minY:${minY.toFixed(2)} maxY:${maxY.toFixed(2)} base:${baseDepthCm.toFixed(2)}`);
      this.lastBounds = { min: minY, max: maxY };
      this.lastMetricTs = now;
    }
  }
}
