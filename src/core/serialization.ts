import { ProjectModel } from './project';

export interface ExportBundle {
  version: string;
  project: ProjectModel;
  heightGrid: string;
  materialGrid: string;
  lateralOffsetX: string;
  lateralOffsetZ: string;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(str: string): ArrayBuffer {
  const binary = atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function exportProject(project: ProjectModel): ExportBundle {
  return {
    version: '1.1.0',
    project: {
      ...project,
      terrain: {
        ...project.terrain,
        heightGrid: new Float32Array(),
        materialGrid: new Uint8Array(),
        lateralOffsetX: new Float32Array(),
        lateralOffsetZ: new Float32Array()
      }
    },
    heightGrid: bufferToBase64(project.terrain.heightGrid.buffer),
    materialGrid: bufferToBase64(project.terrain.materialGrid.buffer),
    lateralOffsetX: bufferToBase64(project.terrain.lateralOffsetX.buffer),
    lateralOffsetZ: bufferToBase64(project.terrain.lateralOffsetZ.buffer)
  };
}

export function importProject(bundle: ExportBundle): ProjectModel {
  if (bundle.version !== '1.0.0' && bundle.version !== '1.1.0') {
    throw new Error(`Unsupported export version ${bundle.version}`);
  }
  const heightGrid = new Float32Array(base64ToBuffer(bundle.heightGrid));
  const materialGrid = new Uint8Array(base64ToBuffer(bundle.materialGrid));
  const lateralOffsetX = new Float32Array(
    bundle.lateralOffsetX ? base64ToBuffer(bundle.lateralOffsetX) : new ArrayBuffer(heightGrid.length * 4)
  );
  const lateralOffsetZ = new Float32Array(
    bundle.lateralOffsetZ ? base64ToBuffer(bundle.lateralOffsetZ) : new ArrayBuffer(heightGrid.length * 4)
  );
  return {
    ...bundle.project,
    terrain: {
      ...bundle.project.terrain,
      heightGrid,
      materialGrid,
      lateralOffsetX,
      lateralOffsetZ,
      baseDepthCm: bundle.project.terrain.baseDepthCm ?? -6
    }
  };
}
