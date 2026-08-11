const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
function tsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? tsFiles(file) : name.endsWith('.ts') ? [file] : [];
  });
}
function load() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-discipline-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [...tsFiles(path.join(root, 'src', 'content')), path.join(root, 'src', 'game', 'simulation', 'math.ts'), ...tsFiles(path.join(root, 'src', 'game', 'combat'))];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return { api: require(path.join(outDir, 'game', 'combat', 'index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}
function projectile(overrides = {}) {
  return {
    id: 'p', ownerId: '1', ownerTeamId: 'blue', weaponId: 'w', position: { x: 0, y: 0 }, angle: 0,
    damage: 10, speed: 400, inheritedVelocity: { x: 0, y: 0 }, radius: 5, penetrationRemaining: 1,
    ttlSeconds: 0.8, splashRadius: 0, splashDamageScale: 0, knockback: 200, clusterCount: 0, clusterDamage: 0,
    sourceProjectile: { damage: 10, speed: 400, radius: 5, reloadSeconds: 0.2, penetration: 1 }, ...overrides,
  };
}

test('Three Disciplines gunner sweet spot and projectile marking mechanics are canonical', () => {
  const { api, dispose } = load();
  try {
    assert.ok(api.gunSweet(0.56) > 0.99);
    assert.ok(api.gunSweet(0.95) < 0.01);
    const result = api.applyGunnerFireDiscipline({ classId: 'twin', fireMode: 'twin', angle: 0, velocity: { x: 0, y: 0 }, maxSpeed: 100, projectiles: [projectile()], state: { heat: 0, stability: 1, shotIndex: 0 } });
    assert.ok(result.state.heat > 0);
    assert.ok(result.recoilVelocityDelta.x < 0);
    assert.equal(result.projectiles.length, 1);
  } finally { dispose(); }
});

test('Apex Gunner gates preserve Tempest, Needle Storm, Breachlord and Flakmaster rules', () => {
  const { api, dispose } = load();
  try {
    const tempest = api.applyGunnerFireDiscipline({ classId: 'tempest', fireMode: 'minigun', angle: 0, velocity: { x: 0, y: 0 }, maxSpeed: 100, projectiles: [projectile()], state: { heat: 0.50, stability: 1, shotIndex: 0 } });
    assert.ok(tempest.cooldownMultiplier < 1);
    const redline = api.applyGunnerFireDiscipline({ classId: 'tempest', fireMode: 'minigun', angle: 0, velocity: { x: 0, y: 0 }, maxSpeed: 100, projectiles: [projectile()], state: { heat: 1, stability: 1, shotIndex: 0 } });
    assert.ok(redline.redlinePenaltySeconds > 0);

    const needle = api.applyGunnerFireDiscipline({ classId: 'needlestorm', fireMode: 'minigun', angle: 0, velocity: { x: 0, y: 0 }, maxSpeed: 100, projectiles: [projectile()], state: { heat: 0.462, stability: 1, shotIndex: 0 } });
    assert.ok(needle.projectiles[0].penetrationRemaining >= 2);
    assert.ok(needle.projectiles[0].speed > 400);

    const breach = api.applyGunnerFireDiscipline({ classId: 'breachlord', fireMode: 'shotgun', angle: 0, velocity: { x: 0, y: 0 }, maxSpeed: 100, projectiles: [projectile()], state: { heat: 0, stability: 1, shotIndex: 0 } });
    assert.equal(breach.recoverySeconds, 0.30);
    assert.equal(api.breachlordMovementMultiplier(true), 0.86);

    assert.ok(api.flakDiscipline(0.43, 0.92) > 0.99);
  } finally { dispose(); }
});

test('Cannon programming preserves fuse geometry, structure pressure and apex depth tradeoffs', () => {
  const { api, dispose } = load();
  try {
    const program = api.programCannonFuse('cannon', 1, 500);
    assert.ok(program.fuseDistance > 400);
    assert.ok(program.profile.structureMultiplier > 1);

    const siege = api.applyCannonApex('siegebomber', projectile({ splashRadius: 92 }), 0.8);
    assert.equal(siege.structureMultiplier, 2.35);
    assert.ok(api.structuralCoverDamage(10, siege.structureMultiplier, true) > 18);

    const annihilator = api.applyCannonApex('annihilator', projectile({ splashRadius: 155 }), 1);
    assert.ok(annihilator.apexMeter > 0.5);
    assert.ok(annihilator.cooldownMultiplier > 1);
    assert.ok(annihilator.projectile.damage > 10);
    assert.ok(annihilator.projectile.splashRadius > 155);

    const quake = api.applyCannonApex('quakecannon', projectile({ splashRadius: 120, knockback: 200 }), 1);
    assert.ok(quake.projectile.knockback > 300);

    const angles = api.clusterSectorAngles(0, 5, 0.9);
    assert.ok(angles.at(-1) - angles[0] <= api.clusterSectorWidth(0.9) + 1e-9);
  } finally { dispose(); }
});

test('Guardian directional defense replaces legacy 360-degree defense and Perfect Guard stores a counter', () => {
  const { api, dispose } = load();
  try {
    const front = api.resolveGuardianDirectionalDamage({ classId: 'guard', tankAngle: 0, incomingBearing: 0, rawDamage: 100, activeDefense: true, withinPerfectGuardWindow: false });
    const rear = api.resolveGuardianDirectionalDamage({ classId: 'guard', tankAngle: 0, incomingBearing: Math.PI, rawDamage: 100, activeDefense: true, withinPerfectGuardWindow: false });
    assert.ok(front.appliedDamage < rear.appliedDamage * 0.5);

    const perfect = api.resolveGuardianDirectionalDamage({ classId: 'guard', tankAngle: 0, incomingBearing: 0, rawDamage: 100, activeDefense: true, withinPerfectGuardWindow: true });
    assert.equal(perfect.appliedDamage, 0);
    assert.equal(perfect.counterCharge, 1);
    const counter = api.applyGuardianCountershot(projectile(), perfect.counterCharge);
    assert.equal(counter.consumedCharge, true);
    assert.ok(counter.projectile.damage > 13);
    assert.ok(counter.projectile.speed > 400);
    assert.equal(counter.projectile.penetrationRemaining, 2);
  } finally { dispose(); }
});

test('Apex Guardian rules preserve Bastion anchoring, Aegis flow and distinct Meteor/Ravager charge ceilings', () => {
  const { api, dispose } = load();
  try {
    const anchored = api.resolveGuardianDirectionalDamage({ classId: 'bastion', tankAngle: 0, incomingBearing: 0, rawDamage: 100, activeDefense: false, withinPerfectGuardWindow: false, anchor: 1 });
    const loose = api.resolveGuardianDirectionalDamage({ classId: 'bastion', tankAngle: 0, incomingBearing: 0, rawDamage: 100, activeDefense: false, withinPerfectGuardWindow: false, anchor: 0 });
    assert.ok(anchored.appliedDamage < loose.appliedDamage);
    assert.equal(api.aegisFlowMovementMultiplier(true), 1.10);
    assert.ok(api.guardianBodyDamageMultiplier('meteor', 1) > api.guardianBodyDamageMultiplier('ravager', 1));

    const meteorStraight = api.stepGuardianCharge({ classId: 'meteor', charge: 0.5, velocity: { x: 100, y: 0 }, maxSpeed: 100, previousMoveAngle: 0, dtSeconds: 1 });
    const meteorTurn = api.stepGuardianCharge({ classId: 'meteor', charge: 0.5, velocity: { x: 0, y: 100 }, maxSpeed: 100, previousMoveAngle: 0, dtSeconds: 0.2 });
    assert.ok(meteorStraight.charge > 0.5);
    assert.ok(meteorTurn.charge < 0.5);
  } finally { dispose(); }
});
