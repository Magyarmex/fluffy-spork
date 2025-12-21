import * as THREE from 'three';
import { ProjectModel, materialFromIndex } from '@core/project';
import { MATERIALS } from '@core/materials';
import { indexFor } from '@core/grid';

export class TerrainMesh {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(project: ProjectModel) {
    const { resolution } = project.terrain;
    const vertexCount = resolution * resolution;
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
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      metalness: 0,
      roughness: 0.9
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.update(project);
  }

  update(project: ProjectModel) {
    const { resolution, heightGrid, materialGrid } = project.terrain;
    const { widthCm, depthCm } = project.tank;
    const tintCache: Record<number, THREE.Color> = {};
    let ptr = 0;
    let cptr = 0;
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const idx = indexFor(i, j, resolution);
        const x = (i / (resolution - 1)) * widthCm;
        const z = (j / (resolution - 1)) * depthCm;
        const y = heightGrid[idx];
        this.positions[ptr++] = x;
        this.positions[ptr++] = y;
        this.positions[ptr++] = z;
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
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
