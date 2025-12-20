import { ProjectModel } from './project';

export interface ExportBundle {
  version: string;
  project: ProjectModel;
  heightGrid: string;
  materialGrid: string;
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
    version: '1.0.0',
    project: {
      ...project,
      terrain: {
        ...project.terrain,
        heightGrid: new Float32Array(),
        materialGrid: new Uint8Array()
      }
    },
    heightGrid: bufferToBase64(project.terrain.heightGrid.buffer),
    materialGrid: bufferToBase64(project.terrain.materialGrid.buffer)
  };
}

export function importProject(bundle: ExportBundle): ProjectModel {
  if (bundle.version !== '1.0.0') {
    throw new Error(`Unsupported export version ${bundle.version}`);
  }
  const heightGrid = new Float32Array(base64ToBuffer(bundle.heightGrid));
  const materialGrid = new Uint8Array(base64ToBuffer(bundle.materialGrid));
  return {
    ...bundle.project,
    terrain: {
      ...bundle.project.terrain,
      heightGrid,
      materialGrid
    }
  };
}
