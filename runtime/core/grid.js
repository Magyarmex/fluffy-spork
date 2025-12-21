function worldToGrid(x, z, resolution, tank) {
  const clampedX = Math.min(Math.max(x, 0), tank.widthCm);
  const clampedZ = Math.min(Math.max(z, 0), tank.depthCm);
  const i = Math.floor((clampedX / tank.widthCm) * (resolution - 1));
  const j = Math.floor((clampedZ / tank.depthCm) * (resolution - 1));
  const inBounds = x >= 0 && x <= tank.widthCm && z >= 0 && z <= tank.depthCm;
  return { i, j, inBounds };
}

function gridToWorld(i, j, resolution, tank) {
  const x = (i / (resolution - 1)) * tank.widthCm;
  const z = (j / (resolution - 1)) * tank.depthCm;
  return { x, z };
}

function indexFor(i, j, resolution) {
  return j * resolution + i;
}

function neighbors8(i, j, resolution) {
  const res = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < resolution && nj < resolution) {
        res.push({ i: ni, j: nj, di, dj });
      }
    }
  }
  return res;
}

function safeSample(heightGrid, i, j, resolution) {
  const clampedI = Math.max(0, Math.min(resolution - 1, i));
  const clampedJ = Math.max(0, Math.min(resolution - 1, j));
  return heightGrid[indexFor(clampedI, clampedJ, resolution)];
}

module.exports = { worldToGrid, gridToWorld, indexFor, neighbors8, safeSample };
