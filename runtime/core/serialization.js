function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function base64ToBuffer(str) {
  return Buffer.from(str, 'base64');
}

function exportProject(project) {
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

function importProject(bundle) {
  if (bundle.version !== '1.0.0' && bundle.version !== '1.1.0') {
    throw new Error(`Unsupported export version ${bundle.version}`);
  }
  const heightGrid = new Float32Array(base64ToBuffer(bundle.heightGrid).buffer);
  const materialGrid = new Uint8Array(base64ToBuffer(bundle.materialGrid).buffer);
  const lateralOffsetX = new Float32Array(
    bundle.lateralOffsetX ? base64ToBuffer(bundle.lateralOffsetX).buffer : new ArrayBuffer(heightGrid.length * 4)
  );
  const lateralOffsetZ = new Float32Array(
    bundle.lateralOffsetZ ? base64ToBuffer(bundle.lateralOffsetZ).buffer : new ArrayBuffer(heightGrid.length * 4)
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

module.exports = { exportProject, importProject };
