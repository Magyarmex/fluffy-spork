const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const blackglassDir = path.join(root, 'src/scenes/blackglass');
const renderingDir = path.join(root, 'src/rendering');

function allTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allTs(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

function loadMission19() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-blackglass-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src/content/schema.ts'), path.join(root, 'src/content/registry.ts'),
    path.join(root, 'src/content/tanks/catalog.ts'), path.join(root, 'src/content/catalog.ts'),
    path.join(root, 'src/content/upgrades/catalog.ts'), path.join(root, 'src/content/index.ts'),
    path.join(root, 'src/game/simulation/math.ts'), path.join(root, 'src/game/simulation/types.ts'),
    path.join(root, 'src/game/battlefield/types.ts'), path.join(root, 'src/game/entities/types.ts'),
    path.join(root, 'src/game/entities/drones/types.ts'), path.join(root, 'src/game/entities/drones/formations.ts'),
    path.join(root, 'src/game/combat/types.ts'), path.join(root, 'src/game/combat/CombatSystem.ts'),
    ...allTs(renderingDir), ...allTs(blackglassDir),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    blackglass: require(path.join(outDir, 'scenes/blackglass/index.js')),
    rendering: require(path.join(outDir, 'rendering/index.js')),
    content: require(path.join(outDir, 'content/index.js')),
    formations: require(path.join(outDir, 'game/entities/drones/formations.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission19();
test.after(() => api.dispose());
function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/blackglass-mission-19.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

missionTest('Mission 19 reads the canonical tank, weapon and drone registries directly', () => {
  const scene = new api.blackglass.BlackglassScene('scout');
  for (const tank of api.content.TankRegistry.all()) {
    scene.selectTank(tank.id);
    const snapshot = scene.snapshot();
    assert.strictEqual(snapshot.tankDefinition, api.content.TankRegistry.get(tank.id));
    assert.strictEqual(snapshot.weaponDefinition, api.content.WeaponRegistry.get(`${tank.id}:weapon`));
    assert.strictEqual(snapshot.droneDefinition, api.content.DroneRegistry.get(`${tank.id}:drone`));
    assert.equal(snapshot.tank.tankDefinitionId, tank.id);
  }
  scene.stop();
});

missionTest('Mission 19 muzzle geometry is exactly the Mission 18 canonical visual factory output', () => {
  const scene = new api.blackglass.BlackglassScene('prism');
  scene.aimAt(Math.PI / 3);
  const snapshot = scene.snapshot();
  const canonical = new api.rendering.CanonicalVisualFactory().tank(snapshot.tank);
  assert.deepEqual(snapshot.tankVisual, canonical);
  assert.deepEqual(snapshot.visualMuzzles, canonical.barrels.map((barrel) => barrel.muzzle));
  assert.equal(snapshot.visualMuzzles.length, api.content.WeaponRegistry.get('prism:weapon').barrels.length);
  scene.stop();
});

missionTest('Mission 19 firing delegates canonical fire-mode behavior to CombatSystem', () => {
  const shotgun = new api.blackglass.BlackglassScene('shotgun');
  const shotgunWeapon = api.content.WeaponRegistry.get('shotgun:weapon');
  const shotgunShot = shotgun.fire(0);
  assert.equal(shotgunShot.result.fired, true);
  assert.equal(shotgunShot.projectiles.length, shotgunWeapon.projectile.pellets);
  assert.ok(shotgunShot.projectiles.every((projectile) => projectile.projectileDefinitionId === shotgunWeapon.id));
  shotgun.stop();

  const beam = new api.blackglass.BlackglassScene('prism');
  const beamWeapon = api.content.WeaponRegistry.get('prism:weapon');
  const beamShot = beam.fire(0);
  assert.equal(beamShot.projectiles.length, beamWeapon.barrels.length);
  assert.ok(beamShot.projectiles.every((projectile) => projectile.projectileDefinitionId === beamWeapon.id));
  beam.stop();

  const twin = new api.blackglass.BlackglassScene('twin');
  const first = twin.fire(0).projectiles[0];
  const second = twin.fire(10).projectiles[0];
  assert.notDeepEqual(first.position, second.position, 'CombatSystem barrel cycling must reach Blackglass without a local shot planner');
  twin.stop();
});

missionTest('Mission 19 Controller previews consume canonical drone count, formation and IFF visuals', () => {
  const scene = new api.blackglass.BlackglassScene('carrier');
  const snapshot = scene.snapshot();
  const drone = api.content.DroneRegistry.get('carrier:drone');
  assert.equal(snapshot.drones.length, drone.count);
  const formation = api.formations.formationForOrder('follow', snapshot.tankDefinition.lineage);
  snapshot.drones.forEach((state, index) => {
    assert.deepEqual(state.position, api.formations.formationSlot(snapshot.tank.position, snapshot.tank.rotation, index, drone.count, formation));
  });
  assert.ok(snapshot.droneVisuals.every((visual) => visual.iffColor === '#4da8ff'));
  scene.stop();
});

missionTest('Mission 19 scene rendering is the shared canonical Renderer output', () => {
  const scene = new api.blackglass.BlackglassScene('bomber');
  scene.aimAt(0.2);
  const shot = scene.fire(0);
  const snapshot = scene.snapshot();
  const actual = scene.render(7, 112);
  const renderer = new api.rendering.Renderer();
  renderer.start();
  const expected = renderer.render({ tick:7, elapsedMs:112, entities:[snapshot.tank, ...snapshot.drones, ...shot.projectiles] });
  assert.deepEqual(actual, expected);
  assert.ok(actual.commands.some((command) => command.layer === 'entity'));
  renderer.stop();
  scene.stop();
});

missionTest('Mission 19 projectile visuals automatically follow canonical weapon metadata', () => {
  const scene = new api.blackglass.BlackglassScene('bomber');
  const shell = scene.fire(0).projectiles[0];
  const shellVisual = new api.rendering.CanonicalVisualFactory().projectile(shell);
  scene.selectTank('railgun');
  const beam = scene.fire(10).projectiles[0];
  const beamVisual = new api.rendering.CanonicalVisualFactory().projectile(beam);
  assert.equal(shellVisual.fireMode, api.content.WeaponRegistry.get('bomber:weapon').fireMode);
  assert.equal(beamVisual.fireMode, api.content.WeaponRegistry.get('railgun:weapon').fireMode);
  assert.notEqual(shellVisual.trailLength, beamVisual.trailLength);
  scene.stop();
});

missionTest('Mission 19 contains no duplicate Blackglass model or projectile styling logic', () => {
  const source = allTs(blackglassDir).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /TankRegistry/);
  assert.match(source, /WeaponRegistry/);
  assert.match(source, /DroneRegistry/);
  assert.match(source, /CombatSystem/);
  assert.match(source, /CanonicalVisualFactory/);
  assert.match(source, /Renderer/);
  assert.match(source, /formationForOrder/);
  assert.doesNotMatch(source, /shotPlan|projectileProfile|visualMuzzleLocal|drawBarrels|drawProjectile/);
  assert.doesNotMatch(source, /switch\s*\([^)]*fireMode|case\s+['"](?:single|twin|minigun|shotgun|shell|beam)['"]/);
  assert.doesNotMatch(source, /#[0-9a-f]{6}/i, 'Blackglass must not carry a private visual palette');
  assert.doesNotMatch(source, /nova-updates|blackglass-mirror-v1\.10\.6/);
  assert.doesNotMatch(source, /const\s+(?:TANKS|CLASSES|WEAPONS|PROJECTILES)\s*=/);
});
