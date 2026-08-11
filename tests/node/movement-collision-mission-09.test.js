const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function loadMission09() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-m09-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const dirs = ['src/game/simulation', 'src/game/battlefield', 'src/game/collision', 'src/game/movement', 'src/game/entities/projectiles'];
  const sources = dirs.flatMap((dir) => readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.ts')).map((n) => path.join(root, dir, n)));
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    movement: require(path.join(outDir, 'movement', 'index.js')),
    collision: require(path.join(outDir, 'collision', 'index.js')),
    projectile: require(path.join(outDir, 'entities', 'projectiles', 'ProjectileKinematics.js')),
    battlefield: require(path.join(outDir, 'battlefield', 'index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function world(battlefield) {
  return new battlefield.Battlefield({ template: 'crossfire' });
}

test('Mission 09 preserves legacy tank speed and dt*9 velocity response', () => {
  const m = loadMission09();
  try {
    assert.equal(m.movement.tankMaxSpeed({ moveMultiplier: 1 }), 124);
    assert.equal(m.movement.tankMaxSpeed({ moveMultiplier: 1.04, speedUpgradeLevel: 2 }), 124 * 1.04 * 1.09);
    const state = { position: { x: -1500, y: -1500 }, velocity: { x: 0, y: 0 }, hullRotation: 0, turretRotation: 0 };
    const next = m.movement.stepTankMovement(state, { move: { x: 1, y: 0 } }, { moveMultiplier: 1 }, world(m.battlefield), 1 / 60);
    assert.ok(Math.abs(next.velocity.x - 18.6) < 1e-9);
    assert.equal(next.velocity.y, 0);
  } finally { m.dispose(); }
});

test('Mission 09 clamps battlefield boundaries and removes blocked velocity component', () => {
  const m = loadMission09();
  try {
    const state = { position: { x: 2228, y: 0 }, velocity: { x: 124, y: 0 }, hullRotation: 0, turretRotation: 0 };
    const next = m.movement.stepTankMovement(state, { move: { x: 1, y: 0 } }, { moveMultiplier: 1, radius: 20 }, world(m.battlefield), 0.2);
    assert.equal(next.position.x, 2230);
    assert.equal(next.velocity.x, 0);
  } finally { m.dispose(); }
});

test('Mission 09 swept terrain collision prevents tunneling and retains tangential slide', () => {
  const m = loadMission09();
  try {
    const bf = world(m.battlefield);
    const terrain = bf.terrain.find((t) => t.solid);
    assert.ok(terrain);
    const g = terrain.geometry;
    const cx = g.x;
    const cy = g.y;
    const start = { x: cx - 500, y: cy + (g.shape === 'rect' ? g.height * 0.3 : g.radius * 0.3) };
    const result = m.collision.moveCircleWithSliding(bf, start, { x: 2000, y: 180 }, 14, 0.5);
    assert.equal(result.collided, true);
    assert.ok(bf.isOccupied(result.position, 13) === false);
    assert.ok(result.position.y !== start.y);
  } finally { m.dispose(); }
});

test('Mission 09 resolves circle entity overlap deterministically', () => {
  const m = loadMission09();
  try {
    const r = m.collision.resolveCirclePair({ position: { x: 0, y: 0 }, radius: 10 }, { position: { x: 15, y: 0 }, radius: 10 });
    assert.equal(r.collided, true);
    assert.deepEqual(r.a, { x: -2.5, y: 0 });
    assert.deepEqual(r.b, { x: 17.5, y: 0 });
  } finally { m.dispose(); }
});

test('Mission 09 projectile sweep catches high-speed terrain and lifetime/range expire without combat authority', () => {
  const m = loadMission09();
  try {
    const bf = world(m.battlefield);
    const terrain = bf.terrain.find((t) => t.solid);
    const g = terrain.geometry;
    const y = g.y;
    const start = { x: g.x - 900, y };
    const hit = m.projectile.stepProjectile({ position: start, velocity: { x: 5000, y: 0 }, radius: 4, ageSeconds: 0, distanceTravelled: 0, ttlSeconds: 2 }, bf, 0.4);
    assert.equal(hit.active, false);
    assert.equal(hit.reason, 'terrain');
    assert.equal(hit.terrainId, terrain.id);

    const ttl = m.projectile.stepProjectile({ position: { x: -1800, y: -1800 }, velocity: { x: 10, y: 0 }, radius: 2, ageSeconds: 0.9, distanceTravelled: 9, ttlSeconds: 1 }, bf, 0.2);
    assert.equal(ttl.reason, 'lifetime');
    const range = m.projectile.stepProjectile({ position: { x: -1800, y: -1800 }, velocity: { x: 100, y: 0 }, radius: 2, ageSeconds: 0, distanceTravelled: 0, ttlSeconds: 5, maxRange: 10 }, bf, 0.2);
    assert.equal(range.reason, 'range');
    assert.equal(range.state.distanceTravelled, 10);
  } finally { m.dispose(); }
});

test('Mission 09 source remains headless and contains no AI routing or combat authority', () => {
  const forbidden = /\b(?:document|window|HTMLElement|CanvasRenderingContext2D|AudioContext|requestAnimationFrame|pathfind|damage|penetration|weapon|fireCooldown)\b/i;
  for (const dir of ['src/game/movement', 'src/game/collision', 'src/game/entities/projectiles']) {
    for (const name of readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.ts'))) {
      const source = readFileSync(path.join(root, dir, name), 'utf8');
      assert.equal(forbidden.test(source), false, `${dir}/${name} crosses the Mission 09 boundary`);
    }
  }
});
