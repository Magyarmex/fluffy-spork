const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const targetingDir = path.join(root, 'src', 'game', 'targeting');
const perceptionDir = path.join(root, 'src', 'ai', 'perception');
const memoryDir = path.join(root, 'src', 'ai', 'memory');

function loadMission14() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-ai-knowledge-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src', 'game', 'simulation', 'types.ts'),
    path.join(root, 'src', 'game', 'entities', 'types.ts'),
    ...readdirSync(targetingDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(targetingDir, name)),
    ...readdirSync(memoryDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(memoryDir, name)),
    ...readdirSync(perceptionDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(perceptionDir, name)),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    targeting: require(path.join(outDir, 'game', 'targeting', 'index.js')),
    simulation: require(path.join(outDir, 'game', 'simulation', 'types.js')),
    ai: require(path.join(outDir, 'ai', 'perception', 'index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function tank(id, teamId, x, y, hp = 100) {
  return { id, kind: 'tank', lifecycle: 'active', position: { x, y }, rotation: 0.5, team: { teamId }, health: { current: hp, max: 100 }, spawnedAtTick: 0, tankDefinitionId: 'origin', turretRotation: 0 };
}

test('Mission 14 preserves Shared Battlefield View while withholding through-cover combat details', () => {
  const { targeting, simulation, ai, dispose } = loadMission14();
  try {
    const self = simulation.entityId('self');
    const hostile = simulation.entityId('hostile');
    const core = new targeting.PerceptionCore({ lineOfSight: { hasLineOfSight() { return false; } } });
    const knowledge = new ai.AIKnowledge({ preferredRange: 400 });
    const frame = knowledge.ingest(core.perceive({ tick: 10, elapsedMs: 160, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 500, 0, 12)] }));
    const observed = frame.observations.find((entry) => entry.id === hostile);
    const threat = frame.threats.find((entry) => entry.id === hostile);
    assert.equal(observed.source, 'public-map');
    assert.equal(observed.freshness, 'live');
    assert.equal(observed.publiclyTracked, true);
    assert.equal(observed.healthFraction, undefined);
    assert.equal(observed.rotation, undefined);
    assert.equal(threat.detailsKnown, false);
    assert.equal(threat.range, 'preferred');
  } finally { dispose(); }
});

test('Mission 14 hidden targets become stale bounded memory and cannot leak hidden movement or health', () => {
  const { targeting, simulation, ai, dispose } = loadMission14();
  try {
    const self = simulation.entityId('self');
    const hostile = simulation.entityId('hidden');
    let visible = true;
    const core = new targeting.PerceptionCore({
      lineOfSight: { hasLineOfSight() { return visible; } },
      policy: { publicTankTracking: false, lastKnownTtlTicks: 1 },
    });
    const knowledge = new ai.AIKnowledge({ memoryTtlTicks: 10 });
    knowledge.ingest(core.perceive({ tick: 1, elapsedMs: 16, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 100, 10, 75)] }));
    knowledge.rememberTarget(hostile, 1);
    visible = false;
    const hidden = knowledge.ingest(core.perceive({ tick: 3, elapsedMs: 48, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 900, 700, 5)] }));
    const memory = knowledge.memory.get(hostile);
    assert.equal(hidden.observations.find((entry) => entry.id === hostile), undefined);
    assert.deepEqual(memory.position, { x: 100, y: 10 });
    assert.equal(memory.freshness, 'remembered');
    assert.equal(memory.publiclyTracked, false);
    assert.equal(memory.healthFraction, undefined);
    assert.equal(memory.rotation, undefined);
    assert.ok(memory.confidence < 1 && memory.confidence > 0);
    assert.ok(knowledge.memory.target().confidence < 1);
    knowledge.ingest(core.perceive({ tick: 12, elapsedMs: 192, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 999, 999, 1)] }));
    assert.equal(knowledge.memory.get(hostile), undefined);
    assert.equal(knowledge.memory.target(), undefined);
  } finally { dispose(); }
});

test('Mission 14 class/build range awareness is descriptive and does not choose a target or action', () => {
  const { targeting, simulation, ai, dispose } = loadMission14();
  try {
    const self = simulation.entityId('self');
    const close = simulation.entityId('close');
    const far = simulation.entityId('far');
    const core = new targeting.PerceptionCore({ lineOfSight: { hasLineOfSight() { return true; } } });
    const knowledge = new ai.AIKnowledge({ preferredRange: 400, closeRangeFactor: 0.5 });
    const frame = knowledge.ingest(core.perceive({ tick: 2, elapsedMs: 32, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(close, 'red', 100, 0), tank(far, 'red', 700, 0)] }));
    assert.equal(frame.threats.find((entry) => entry.id === close).range, 'close');
    assert.equal(frame.threats.find((entry) => entry.id === far).range, 'far');
    assert.equal(knowledge.memory.target(), undefined);
  } finally { dispose(); }
});

test('Mission 14 AI knowledge code cannot import raw entity/world authority or later AI layers', () => {
  const forbidden = /(?:game\/entities|EntityState|GameWorld|\.entities\b|ai\/navigation|ai\/tactics|\b(?:document|window|HTMLElement|CanvasRenderingContext2D|AudioContext|TouchEvent|KeyboardEvent|requestAnimationFrame)\b)/;
  for (const dir of [perceptionDir, memoryDir]) {
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.ts'))) {
      const source = readFileSync(path.join(dir, name), 'utf8');
      assert.equal(forbidden.test(source), false, `${name} crosses the Mission 14 knowledge boundary`);
    }
  }
});
