const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const battlefieldDir = path.join(root, 'src', 'game', 'battlefield');
const simulationDir = path.join(root, 'src', 'game', 'simulation');
const parity = require('../fixtures/nova-foundation/battlefield-v1.6.json');

function loadBattlefield() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-battlefield-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sourceFiles = [simulationDir, battlefieldDir].flatMap((dir) => readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(dir, name)));
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--rootDir', path.join(root, 'src', 'game'), '--outDir', outDir, ...sourceFiles], { cwd: root, stdio: 'pipe' });
  const battlefield = require(path.join(outDir, 'battlefield', 'index.js'));
  const simulation = require(path.join(outDir, 'simulation', 'index.js'));
  return { battlefield, simulation, dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

function terrain(id, type, geometry, health = 0) {
  return { id, type, geometry, destructible: type === 'cover', maxHealth: health, health, solid: true, brokenAtMs: null };
}

test('Mission 07 preserves v1.6 battlefield constants and all three template inventories', () => {
  const { battlefield, dispose } = loadBattlefield();
  try {
    assert.equal(battlefield.BATTLEFIELD_MAP_LIMIT, parity.mapLimit);
    assert.equal(battlefield.TERRAIN_CELL_SIZE, parity.terrainCell);
    for (const id of battlefield.BATTLEFIELD_TEMPLATE_IDS) {
      const expected = parity.templates[id];
      const template = battlefield.createBattlefieldTemplate(id);
      assert.equal(template.name, expected.name);
      assert.equal(template.terrain.filter((item) => item.type === 'wall').length, expected.walls);
      assert.equal(template.terrain.filter((item) => item.type === 'pillar').length, expected.pillars);
      assert.equal(template.terrain.filter((item) => item.type === 'cover').length, expected.covers);
      assert.ok(template.terrain.filter((item) => item.type === 'cover').every((item) => item.maxHealth === expected.coverHealth));
    }
  } finally { dispose(); }
});

test('Mission 07 matches legacy rectangle LOS and swept thin-wall hit fixtures headlessly', () => {
  const { battlefield, simulation, dispose } = loadBattlefield();
  try {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof globalThis.document, 'undefined');
    const rectangle = parity.geometryCases.rectangle;
    const wall = terrain(-1, 'wall', { shape: 'rect', x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height });
    const blockedStart = simulation.vec2(...rectangle.blocked[0]);
    const blockedEnd = simulation.vec2(...rectangle.blocked[1]);
    const clearStart = simulation.vec2(...rectangle.clear[0]);
    const clearEnd = simulation.vec2(...rectangle.clear[1]);
    assert.ok(battlefield.segmentTerrainHit(wall, blockedStart, blockedEnd, 0));
    assert.equal(battlefield.segmentTerrainHit(wall, clearStart, clearEnd, 0), null);

    const thin = parity.geometryCases.thinWall;
    const thinWall = terrain(-2, 'wall', { shape: 'rect', x: thin.x, y: thin.y, width: thin.width, height: thin.height });
    const hit = battlefield.segmentTerrainHit(thinWall, simulation.vec2(...thin.segment[0]), simulation.vec2(...thin.segment[1]), 2);
    assert.ok(hit);
    assert.ok(hit.t > thin.minT && hit.t < thin.maxT, `unexpected legacy-parity hit time ${hit.t}`);
  } finally { dispose(); }
});

test('Mission 07 canonical battlefield answers bounds, occupancy, spawn safety and LOS without renderer state', () => {
  const { battlefield, simulation, dispose } = loadBattlefield();
  try {
    const world = new battlefield.Battlefield({ template: 'crossfire' });
    assert.equal(world.contains(simulation.vec2(0, 0)), true);
    assert.equal(world.contains(simulation.vec2(2300, 0)), false);
    assert.equal(world.isOccupied(simulation.vec2(0, -690)), true);
    assert.equal(world.isSpawnSafe(simulation.vec2(0, -690), 10), false);
    assert.equal(world.isSpawnSafe(simulation.vec2(1800, 1800), 10), true);
    assert.equal(world.hasLineOfSight(simulation.vec2(-400, -250), simulation.vec2(-100, -250), 0), false);
    assert.equal(world.isInsideSpawnZone('player', simulation.vec2(1000, 0)), true);
    assert.equal(world.isInsideSpawnZone('player', simulation.vec2(100, 0)), false);
  } finally { dispose(); }
});

test('Mission 07 destructible cover becomes non-blocking rubble while preserving geometry identity', () => {
  const { battlefield, simulation, dispose } = loadBattlefield();
  try {
    const world = new battlefield.Battlefield({ template: 'crossfire' });
    const cover = world.terrain.find((item) => item.type === 'cover' && item.geometry.x === -250 && item.geometry.y === -250);
    assert.ok(cover);
    const start = simulation.vec2(-400, -250);
    const end = simulation.vec2(-100, -250);
    assert.equal(world.hasLineOfSight(start, end, 0), false);
    const result = world.damageCover(cover.id, 300, 1250);
    assert.deepEqual(result, { applied: 300, destroyed: true, remainingHealth: 0 });
    assert.equal(world.hasLineOfSight(start, end, 0), true);
    assert.equal(world.rubble.length, 1);
    assert.equal(world.rubble[0].terrainId, cover.id);
    assert.equal(world.isOccupied(simulation.vec2(-250, -250), 0), false);
  } finally { dispose(); }
});

test('Mission 07 rotation/mirroring is deterministic and spatial broad phase excludes distant solids', () => {
  const { battlefield, simulation, dispose } = loadBattlefield();
  try {
    const a = new battlefield.Battlefield({ template: 'four-gates', rotationQuarterTurns: 1, mirrored: true });
    const b = new battlefield.Battlefield({ template: 'four-gates', rotationQuarterTurns: 1, mirrored: true });
    assert.deepEqual(a.terrain, b.terrain);
    const candidates = a.querySolids(simulation.vec2(0, 0), simulation.vec2(0, 0), 20);
    assert.ok(candidates.length < a.terrain.length / 2, `expected broad-phase pruning; ${candidates.length}/${a.terrain.length}`);
  } finally { dispose(); }
});

test('Mission 07 canonical battlefield source contains no browser, renderer, audio or AI ownership', () => {
  const forbidden = /\b(?:window|document|CanvasRenderingContext2D|HTMLCanvasElement|AudioContext|render|updateAI|targetId|TouchEvent)\b/;
  for (const name of readdirSync(battlefieldDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = require('node:fs').readFileSync(path.join(battlefieldDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} crosses the Mission 07 headless boundary`);
  }
});
