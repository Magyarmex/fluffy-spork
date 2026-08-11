const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const targetingDir = path.join(root, 'src', 'game', 'targeting');

function loadTargeting() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-targeting-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src', 'game', 'simulation', 'types.ts'),
    path.join(root, 'src', 'game', 'entities', 'types.ts'),
    ...readdirSync(targetingDir).filter((name) => name.endsWith('.ts')).map((name) => path.join(targetingDir, name)),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    targeting: require(path.join(outDir, 'targeting', 'index.js')),
    simulation: require(path.join(outDir, 'simulation', 'types.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function tank(id, teamId, x, y, hp = 100) {
  return { id, kind: 'tank', lifecycle: 'active', position: { x, y }, rotation: 0.5, team: { teamId }, health: { current: hp, max: 100 }, spawnedAtTick: 0, tankDefinitionId: 'origin', turretRotation: 0 };
}

function los(blockedStarts = []) {
  return { hasLineOfSight(start) { return !blockedStarts.some((x) => x === start.x); } };
}

test('Mission 12 preserves v1.10.5 shared battlefield map tracking without granting through-wall combat details', () => {
  const { targeting, simulation, dispose } = loadTargeting();
  try {
    const self = simulation.entityId('self');
    const hostile = simulation.entityId('hostile');
    const core = new targeting.PerceptionCore({ lineOfSight: los([0]) });
    const world = core.perceive({ tick: 10, elapsedMs: 160, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 500, 0, 42)] });
    const contact = world.getContact(hostile);
    assert.equal(contact.source, 'public-map');
    assert.deepEqual(contact.position, { x: 500, y: 0 });
    assert.equal(contact.live, true);
    assert.equal(contact.visibility.directSight, false);
    assert.equal(contact.visibility.publiclyTracked, true);
    assert.equal(contact.health, undefined);
    assert.equal(contact.rotation, undefined);
  } finally { dispose(); }
});

test('Mission 12 hidden state becomes stale last-known data and never leaks live movement or health', () => {
  const { targeting, simulation, dispose } = loadTargeting();
  try {
    const self = simulation.entityId('self');
    const hostile = simulation.entityId('hidden');
    let blocked = false;
    const core = new targeting.PerceptionCore({
      lineOfSight: { hasLineOfSight() { return !blocked; } },
      policy: { publicTankTracking: false, lastKnownTtlTicks: 20 },
    });
    const first = core.perceive({ tick: 1, elapsedMs: 16, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 100, 10, 75)] });
    assert.equal(first.getContact(hostile).health.current, 75);
    blocked = true;
    const second = core.perceive({ tick: 2, elapsedMs: 32, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 900, 700, 5)] });
    const stale = second.getContact(hostile);
    assert.equal(stale.source, 'last-known');
    assert.equal(stale.live, false);
    assert.deepEqual(stale.position, { x: 100, y: 10 });
    assert.equal(stale.health, undefined);
    assert.equal(stale.rotation, undefined);
    assert.equal(core.perceive({ tick: 30, elapsedMs: 480, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(hostile, 'red', 999, 999, 1)] }).getContact(hostile), undefined);
  } finally { dispose(); }
});

test('Mission 12 relay is explicit: only declared friendly observers can contribute sight', () => {
  const { targeting, simulation, dispose } = loadTargeting();
  try {
    const self = simulation.entityId('self');
    const spotter = simulation.entityId('spotter');
    const hostile = simulation.entityId('hostile');
    const core = new targeting.PerceptionCore({ lineOfSight: los([0]), policy: { publicTankTracking: false } });
    const entities = [tank(self, 'blue', 0, 0), tank(spotter, 'blue', 50, 0), tank(hostile, 'red', 800, 0)];
    assert.equal(core.perceive({ tick: 4, elapsedMs: 64, observerId: self, entities }).getContact(hostile), undefined);
    const relayed = core.perceive({ tick: 5, elapsedMs: 80, observerId: self, entities, relayObserverIds: [spotter] }).getContact(hostile);
    assert.equal(relayed.source, 'relay');
    assert.equal(relayed.visibility.relayed, true);
    assert.equal(relayed.health, undefined);
  } finally { dispose(); }
});

test('Mission 12 designation authorizes a bounded hostile contact without exposing precise combat state', () => {
  const { targeting, simulation, dispose } = loadTargeting();
  try {
    const self = simulation.entityId('self');
    const observer = simulation.entityId('observer');
    const hostile = simulation.entityId('hostile');
    const core = new targeting.PerceptionCore({ lineOfSight: los([0, 50]), policy: { publicTankTracking: false } });
    core.designations.designate({ targetId: hostile, teamId: 'blue', observerId: observer, createdAtTick: 10, expiresAtTick: 15 });
    const entities = [tank(self, 'blue', 0, 0), tank(observer, 'blue', 50, 0), tank(hostile, 'red', 900, 0, 20)];
    const designated = core.perceive({ tick: 11, elapsedMs: 176, observerId: self, entities }).getContact(hostile);
    assert.equal(designated.source, 'designation');
    assert.equal(designated.visibility.designated, true);
    assert.equal(designated.health, undefined);
    const expired = core.perceive({ tick: 16, elapsedMs: 256, observerId: self, entities }).getContact(hostile);
    assert.equal(expired.source, 'last-known');
    assert.equal(expired.live, false);
  } finally { dispose(); }
});

test('Mission 12 targeting consumes PerceivedWorld rather than raw hostile entities', () => {
  const { targeting, simulation, dispose } = loadTargeting();
  try {
    const self = simulation.entityId('self');
    const near = simulation.entityId('near');
    const far = simulation.entityId('far');
    const core = new targeting.PerceptionCore({ lineOfSight: los() });
    const world = core.perceive({ tick: 1, elapsedMs: 16, observerId: self, entities: [tank(self, 'blue', 0, 0), tank(far, 'red', 400, 0), tank(near, 'red', 100, 0)] });
    const service = new targeting.TargetingService();
    assert.equal(service.acquireNearest(world, { origin: { x: 0, y: 0 } }).id, near);
    assert.equal(service.isValidTarget(world, far, { origin: { x: 0, y: 0 }, maxRange: 200 }), false);
  } finally { dispose(); }
});

test('Mission 12 canonical targeting has no DOM, renderer, audio, input or AI tactics authority', () => {
  const forbidden = /\b(?:document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|AudioContext|React|TouchEvent|KeyboardEvent|Gamepad|requestAnimationFrame)\b/;
  for (const name of readdirSync(targetingDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = readFileSync(path.join(targetingDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} contains a forbidden presentation/input dependency`);
  }
});
