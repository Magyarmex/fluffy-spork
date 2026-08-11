const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const combatDir = path.join(root, 'src', 'game', 'combat');

function tsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? tsFiles(file) : name.endsWith('.ts') ? [file] : [];
  });
}

function loadCanonicalCombat() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-combat-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    ...tsFiles(path.join(root, 'src', 'content')),
    path.join(root, 'src', 'game', 'simulation', 'math.ts'),
    ...tsFiles(combatDir),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    combat: require(path.join(outDir, 'game', 'combat', 'index.js')),
    content: require(path.join(outDir, 'content', 'index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function actor(id = 'blue', teamId = 'blue', overrides = {}) {
  return { id, teamId, position: { x: 0, y: 0 }, velocity: { x: 10, y: -4 }, radius: 16, health: 100, maxHealth: 100, alive: true, ...overrides };
}

function fire(system, weapon, shooter, atSeconds = 0, extras = {}) {
  return system.fire({ shooter, weapon, muzzleOrigin: shooter.position, aimRadians: 0, atSeconds, projectileId: (i) => `${shooter.id}-p${i}-${atSeconds}`, spreadSample: () => 0, ...extras });
}

test('Mission 10 consumes Mission 05 weapon definitions across every lineage', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const samples = ['scout', 'twin', 'cannon', 'marksman', 'carrier', 'guard'];
    for (const tankId of samples) {
      const weapon = content.WeaponRegistry.require(`${tankId}:weapon`);
      const system = new combat.CombatSystem();
      const result = fire(system, weapon, actor(tankId));
      assert.equal(result.fired, true, tankId);
      assert.ok(result.projectiles.length >= 1, tankId);
      assert.equal(result.projectiles[0].sourceProjectile.damage, weapon.projectile.damage, tankId);
      assert.equal(result.events[0].type, 'weapon-fired');
    }
  } finally { dispose(); }
});

test('Twin alternates barrels, shotgun preserves pellet cone, and twin-beam damage is split', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const shooter = actor('gunner');
    const twin = content.WeaponRegistry.require('twin:weapon');
    const system = new combat.CombatSystem();
    const first = fire(system, twin, shooter, 0);
    const second = fire(system, twin, shooter, 0.3);
    assert.equal(first.projectiles.length, 1);
    assert.equal(second.projectiles.length, 1);
    assert.notEqual(first.projectiles[0].position.y, second.projectiles[0].position.y);

    const shotgun = content.WeaponRegistry.require('shotgun:weapon');
    const blast = fire(new combat.CombatSystem(), shotgun, shooter, 0);
    assert.equal(blast.projectiles.length, 5);
    assert.equal(Number((blast.projectiles.at(-1).angle - blast.projectiles[0].angle).toFixed(2)), 0.21);
    assert.equal(blast.projectiles[0].damage, shotgun.projectile.damage);
    assert.equal(blast.projectiles[0].speed, shotgun.projectile.speed * 1.05);

    const prism = content.WeaponRegistry.require('prism:weapon');
    const beams = fire(new combat.CombatSystem(), prism, actor('sniper'), 0);
    assert.equal(beams.projectiles.length, 2);
    assert.equal(beams.projectiles[0].damage, prism.projectile.damage * 0.72);
  } finally { dispose(); }
});

test('Cooldowns, minigun spool and inherited shooter velocity remain deterministic', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const weapon = content.WeaponRegistry.require('minigun:weapon');
    const shooter = actor('mini');
    const system = new combat.CombatSystem();
    const first = fire(system, weapon, shooter, 0, { fireSpin: 1 });
    assert.equal(first.cooldownRemainingSeconds, weapon.projectile.reloadSeconds * 0.72);
    const blocked = fire(system, weapon, shooter, first.cooldownRemainingSeconds / 2, { fireSpin: 1 });
    assert.equal(blocked.fired, false);
    assert.deepEqual(first.projectiles[0].inheritedVelocity, { x: 2.2, y: -0.88 });
  } finally { dispose(); }
});

test('Direct hit owns damage, armor, penetration, destruction and friendly-fire rejection', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const system = new combat.CombatSystem();
    const weapon = content.WeaponRegistry.require('marksman:weapon');
    const shot = fire(system, weapon, actor('marksman'), 0).projectiles[0];
    const target = actor('target', 'red', { health: 20, maxHealth: 100, armor: 2 });
    const hit = system.resolveDirectHit({ projectile: shot, target, atSeconds: 0.1 });
    assert.ok(hit.appliedDamage > 0);
    assert.equal(hit.remainingPenetration, 1);
    assert.equal(hit.destroyed, true);
    assert.ok(hit.events.some((event) => event.type === 'combatant-destroyed'));
    const friendly = system.resolveDirectHit({ projectile: shot, target: actor('friend', 'blue'), atSeconds: 0.1 });
    assert.equal(friendly.appliedDamage, 0);
  } finally { dispose(); }
});

test('Cannon splash honors cover exposure and canonical cover damage uses the battlefield port', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const system = new combat.CombatSystem();
    const weapon = content.WeaponRegistry.require('cannon:weapon');
    const projectile = fire(system, weapon, actor('cannon'), 0).projectiles[0];
    const open = actor('open', 'red');
    const edge = actor('edge', 'red');
    const blocked = actor('blocked', 'red');
    const splash = system.resolveSplash(projectile, [
      { combatant: open, exposure: 1 },
      { combatant: edge, exposure: 0.4 },
      { combatant: blocked, exposure: 0 },
    ], 0.2);
    assert.equal(splash.results.length, 2);
    assert.ok(splash.results[0].appliedDamage > splash.results[1].appliedDamage);
    assert.equal(splash.results[1].appliedDamage, splash.results[0].appliedDamage * 0.4);

    let call;
    const events = system.damageCover({ damageCover: (terrainId, amount, atMs) => (call = { terrainId, amount, atMs }, { applied: amount, destroyed: false, remainingHealth: 10 }) }, 7, projectile, 2);
    assert.deepEqual(call, { terrainId: 7, amount: projectile.damage, atMs: 2000 });
    assert.equal(events[0].type, 'cover-damaged');
  } finally { dispose(); }
});

test('Cluster shells deterministically emit the canonical child count without recursive clusters', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const system = new combat.CombatSystem();
    const weapon = content.WeaponRegistry.require('bomber:weapon');
    const parent = fire(system, weapon, actor('bomber'), 0).projectiles[0];
    const children = system.spawnCluster(parent, { x: 10, y: 20 }, (i) => `child-${i}`);
    assert.equal(children.length, weapon.projectile.clusterCount);
    assert.equal(children[0].damage, weapon.projectile.clusterDamage);
    assert.ok(children.every((child) => child.clusterCount === 0));
  } finally { dispose(); }
});

test('Ultimate abilities reproduce live Ragnarok, Point Blank, Supercharge and Phase semantics', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const system = new combat.CombatSystem();
    const cannon = actor('cannon');
    const cannonWeapon = content.WeaponRegistry.require('demolisher:weapon');
    const ragnarok = system.activateAbility({ actor: cannon, ability: content.AbilityRegistry.require('ragnarok'), weapon: cannonWeapon, aimRadians: 0, atSeconds: 0, projectileId: (i) => `rag-${i}` });
    const rag = ragnarok.actions.find((action) => action.type === 'spawn-projectiles').projectiles[0];
    assert.equal(rag.damage, cannonWeapon.projectile.damage * 3);
    assert.equal(rag.speed, cannonWeapon.projectile.speed * 0.9);
    assert.equal(rag.penetrationRemaining, 2);
    assert.equal(rag.ttlSeconds, 1.4);
    assert.equal(rag.splashRadius, 160);
    assert.equal(rag.splashDamageScale, 0.8);
    assert.equal(rag.knockback, 540);

    const shotgunWeapon = content.WeaponRegistry.require('shotgun:weapon');
    const pointblank = system.activateAbility({ actor: actor('shotgun'), ability: content.AbilityRegistry.require('pointblank'), weapon: shotgunWeapon, aimRadians: 0, atSeconds: 0, projectileId: (i) => `pb-${i}` });
    const pb = pointblank.actions.find((action) => action.type === 'spawn-projectiles');
    assert.equal(pb.projectiles.length, 9);
    assert.equal(Number((pb.projectiles.at(-1).angle - pb.projectiles[0].angle).toFixed(2)), 0.52);
    assert.equal(pb.weaponLockSeconds, 0.45);

    const sniperSystem = new combat.CombatSystem();
    const sniper = actor('rail');
    sniperSystem.activateAbility({ actor: sniper, ability: content.AbilityRegistry.require('supercharge'), atSeconds: 0 });
    const charged = fire(sniperSystem, content.WeaponRegistry.require('railgun:weapon'), sniper, 0).projectiles[0];
    assert.equal(charged.damage, content.WeaponRegistry.require('railgun:weapon').projectile.damage * 2.5);
    assert.equal(charged.penetrationRemaining, Infinity);

    const phase = system.activateAbility({ actor: actor('ghost', 'blue', { position: { x: 2200, y: 0 } }), ability: content.AbilityRegistry.require('phase'), aimRadians: 0, atSeconds: 0 });
    const blink = phase.actions.find((action) => action.type === 'blink');
    assert.deepEqual(blink.destination, { x: 2220, y: 0 });
    assert.equal(blink.cloakSeconds, 0.7);
  } finally { dispose(); }
});

test('Controller and Guardian ultimates expose authoritative timed combat actions and defenses', () => {
  const { combat, content, dispose } = loadCanonicalCombat();
  try {
    const system = new combat.CombatSystem();
    const swarm = system.activateAbility({ actor: actor('controller'), ability: content.AbilityRegistry.require('swarm'), atSeconds: 0 });
    assert.deepEqual(swarm.actions.find((action) => action.type === 'temporary-drone-capacity'), { type: 'temporary-drone-capacity', additionalDrones: 2, durationSeconds: 8, frenzy: true });

    const guardian = actor('guardian');
    system.activateAbility({ actor: guardian, ability: content.AbilityRegistry.require('bulwark'), atSeconds: 0 });
    const incoming = fire(new combat.CombatSystem(), content.WeaponRegistry.require('scout:weapon'), actor('enemy', 'red'), 0).projectiles[0];
    assert.equal(system.resolveDirectHit({ projectile: incoming, target: guardian, atSeconds: 2 }).appliedDamage, 0);

    const iron = new combat.CombatSystem();
    iron.activateAbility({ actor: guardian, ability: content.AbilityRegistry.require('taunt'), atSeconds: 0 });
    const taunted = iron.resolveDirectHit({ projectile: incoming, target: guardian, atSeconds: 1 });
    assert.equal(Number((taunted.appliedDamage / incoming.damage).toFixed(2)), 0.35);
    assert.equal(Number((taunted.reflectedDamage / incoming.damage).toFixed(2)), 0.3);

    const stampede = new combat.CombatSystem().activateAbility({ actor: guardian, ability: content.AbilityRegistry.require('stampede'), atSeconds: 0 });
    const effect = stampede.effects[0];
    assert.equal(effect.moveSpeedMultiplier, 1.9);
    assert.equal(effect.bodyDamageMultiplier, 2);
  } finally { dispose(); }
});

test('Mission 10 combat source remains headless and presentation-free', () => {
  const forbidden = /\b(?:document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|AudioContext|React|TouchEvent|requestAnimationFrame|addParticles|addRing|addFlash|sfx)\b/;
  for (const name of readdirSync(combatDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = readFileSync(path.join(combatDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} contains presentation authority`);
  }
});
