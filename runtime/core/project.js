const { DEFAULT_MATERIAL } = require('./materials');
const { generateId } = require('./id');

const DEFAULT_TANK = {
  widthCm: 78,
  depthCm: 33,
  tankHeightCm: 44,
  waterlineCm: 22
};

const DEFAULT_RESOLUTION = 256;

function createDefaultTerrain(resolution = DEFAULT_RESOLUTION) {
  const size = resolution * resolution;
  const heightGrid = new Float32Array(size);
  const materialGrid = new Uint8Array(size);
  materialGrid.fill(materialIndex(DEFAULT_MATERIAL.id));
  return { resolution, heightGrid, materialGrid };
}

function materialIndex(material) {
  const order = ['FineSand', 'CoarseSand', 'Gravel', 'Soil'];
  return order.indexOf(material);
}

function materialFromIndex(idx) {
  const order = ['FineSand', 'CoarseSand', 'Gravel', 'Soil'];
  return order[Math.max(0, Math.min(order.length - 1, idx))];
}

function createProject(name = 'Aquascape') {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    tank: { ...DEFAULT_TANK },
    terrain: createDefaultTerrain(),
    camera: {
      position: [60, 60, 90],
      target: [DEFAULT_TANK.widthCm / 2, 0, DEFAULT_TANK.depthCm / 2]
    },
    settings: {
      showWater: true,
      showMaterialTint: false,
      falloff: 'smoothstep',
      autoSettle: false,
      brushRadiusCm: 12,
      brushStrengthMm: 18,
      flattenAbsoluteHeightCm: 8,
      selectedMaterial: DEFAULT_MATERIAL.id
    }
  };
}

module.exports = {
  DEFAULT_TANK,
  DEFAULT_RESOLUTION,
  createDefaultTerrain,
  materialIndex,
  materialFromIndex,
  createProject
};
