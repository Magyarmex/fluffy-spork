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

function importProject(bundle) {
  if (bundle.version !== '1.0.0') {
    throw new Error(`Unsupported export version ${bundle.version}`);
  }
  const heightGrid = new Float32Array(base64ToBuffer(bundle.heightGrid).buffer);
  const materialGrid = new Uint8Array(base64ToBuffer(bundle.materialGrid).buffer);
  return {
    ...bundle.project,
    terrain: {
      ...bundle.project.terrain,
      heightGrid,
      materialGrid
    }
  };
}

module.exports = { exportProject, importProject };
