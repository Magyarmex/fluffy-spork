const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const entitiesDir = path.join(root, 'src', 'game', 'entities');
const simulationDir = path.join(root, 'src', 'game', 'simulation');

function loadEntities() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-entities-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entitySources = readdirSync(entitiesDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(entitiesDir, name));
  const sourceFiles = [path.join(simulationDir, 'types.ts'), ...entitySources];

  execFileSync(process.execPath, [
    tsc,
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--strict',
    '--outDir', outDir,
    ...sourceFiles,
  ], { cwd: root, stdio: 'pipe' });

  const entities = require(path.join(outDir, 'entities', 'index.js'));
  const simulationTypes = require(path.join(outDir, 'simulation', 'types.js'));
  return { entities, simulationTypes, dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

function base(id, kind, teamId = 'blue') {
  return {
    id,
    kind,
    position: { x: 10, y: -20 },
    rotation: 0.25,
    team: { teamId },
    spawnedAtTick: 4,
  };
}

test('Mission 08 tracks every major entity category without presentation objects', () => {
  const { entities, simulationTypes, dispose } = loadEntities();
  try {
    const { EntityStore } = entities;
    const { entityId } = simulationTypes;
    const store = new EntityStore();
    const tankId = entityId('tank-alpha');

    store.spawn({ ...base(tankId, 'tank'), tankDefinitionId: 'origin', turretRotation: 0.5, health: { current: 100, max: 100 } });
    store.spawn({ ...base(entityId('drone-alpha'), 'drone'), droneDefinitionId: 'origin:escort', ownerId: tankId, health: { current: 30, max: 30 } });
    store.spawn({ ...base(entityId('projectile-alpha'), 'projectile'), projectileDefinitionId: 'origin:projectile', ownerId: tankId, velocity: { x: 12, y: 3 } });
    store.spawn({ ...base(entityId('shape-alpha'), 'shape', 'neutral'), shapeType: 'square', health: { current: 20, max: 20 } });
    store.spawn({ ...base(entityId('powerup-alpha'), 'powerup', 'neutral'), powerupType: 'health' });

    assert.deepEqual(store.counts(), {
      total: 5,
      active: 5,
      destroyed: 0,
      despawned: 0,
      byKind: { tank: 1, drone: 1, projectile: 1, shape: 1, powerup: 1 },
    });
    assert.deepEqual(store.list().map((entity) => entity.kind).sort(), ['drone', 'powerup', 'projectile', 'shape', 'tank']);
  } finally {
    dispose();
  }
});

test('Mission 08 lifecycle retains deterministic destroyed/despawned tombstones', () => {
  const { entities, simulationTypes, dispose } = loadEntities();
  try {
    const store = new entities.EntityStore();
    const id = simulationTypes.entityId('tank-lifecycle');
    store.spawn({ ...base(id, 'tank'), tankDefinitionId: 'gunner', turretRotation: 0, health: { current: 80, max: 100 } });

    const destroyed = store.destroy(id, 10);
    assert.equal(destroyed.lifecycle, 'destroyed');
    assert.deepEqual(destroyed.health, { current: 0, max: 100 });
    assert.equal(destroyed.destroyedAtTick, 10);

    const despawned = store.despawn(id, 12);
    assert.equal(despawned.lifecycle, 'despawned');
    assert.equal(despawned.destroyedAtTick, 10);
    assert.equal(despawned.despawnedAtTick, 12);
    assert.equal(store.list({ lifecycle: 'active' }).length, 0);
    assert.equal(store.list({ lifecycle: 'despawned' }).length, 1);
  } finally {
    dispose();
  }
});

test('Mission 08 snapshots are stable, JSON serializable, restorable and isolated from caller mutation', () => {
  const { entities, simulationTypes, dispose } = loadEntities();
  try {
    const ownerId = simulationTypes.entityId('owner');
    const droneId = simulationTypes.entityId('owned-drone');
    const source = new entities.EntityStore();
    source.spawn({ ...base(ownerId, 'tank'), tankDefinitionId: 'controller', turretRotation: 0, health: { current: 120, max: 120 } });
    source.spawn({ ...base(droneId, 'drone'), droneDefinitionId: 'controller:escort', ownerId, health: { current: 40, max: 40 } });

    const leaked = source.require(ownerId);
    leaked.position.x = 9999;
    assert.equal(source.require(ownerId).position.x, 10);

    const snapshot = source.snapshot();
    const encoded = JSON.stringify(snapshot);
    const restored = new entities.EntityStore();
    restored.restore(JSON.parse(encoded));
    assert.deepEqual(restored.snapshot(), snapshot);
    assert.deepEqual(snapshot.entities.map((entity) => String(entity.id)), ['owned-drone', 'owner']);
  } finally {
    dispose();
  }
});

test('Mission 08 rejects duplicate IDs, orphan ownership and invalid health state', () => {
  const { entities, simulationTypes, dispose } = loadEntities();
  try {
    const store = new entities.EntityStore();
    const id = simulationTypes.entityId('tank-one');
    const input = { ...base(id, 'tank'), tankDefinitionId: 'origin', turretRotation: 0, health: { current: 100, max: 100 } };
    store.spawn(input);
    assert.throws(() => store.spawn(input), /already exists/);
    assert.throws(() => store.spawn({ ...base(simulationTypes.entityId('orphan'), 'drone'), droneDefinitionId: 'escort', ownerId: simulationTypes.entityId('missing') }), /Active owner is required/);
    assert.throws(() => store.spawn({ ...base(simulationTypes.entityId('bad-health'), 'shape'), shapeType: 'square', health: { current: 11, max: 10 } }), /health.current/);
  } finally {
    dispose();
  }
});

test('Mission 08 canonical entity source has no renderer, DOM, audio or AI authority', () => {
  const forbidden = /\b(?:document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|AudioContext|React|TouchEvent|requestAnimationFrame)\b/;
  for (const name of readdirSync(entitiesDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = readFileSync(path.join(entitiesDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} contains a forbidden presentation dependency`);
  }
});
