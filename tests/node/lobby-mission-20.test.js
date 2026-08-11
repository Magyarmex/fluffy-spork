const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const lobbyDir = path.join(root, 'src/scenes/lobby');

function loadMission20() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-lobby-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entry = path.join(lobbyDir, 'index.ts');
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, entry], { cwd: root, stdio: 'pipe' });
  return {
    lobby: require(path.join(outDir, 'scenes/lobby/index.js')),
    content: require(path.join(outDir, 'content/index.js')),
    ai: require(path.join(outDir, 'ai/controllers/TankAIController.js')),
    nav: require(path.join(outDir, 'ai/navigation/NavigationService.js')),
    drones: require(path.join(outDir, 'game/entities/drones/DroneSystem.js')),
    combat: require(path.join(outDir, 'game/combat/CombatSystem.js')),
    rendering: require(path.join(outDir, 'rendering/Renderer.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission20();
test.after(() => api.dispose());

function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/lobby-mission-20.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

missionTest('Mission 20 lobby roster is the complete canonical level-30 tank registry', () => {
  const battle = new api.lobby.LobbyBattle();
  const snapshot = battle.snapshot();
  const canonical = api.content.TankRegistry.all();
  assert.equal(battle.level, 30);
  assert.equal(snapshot.level, 30);
  assert.equal(snapshot.tanks.length, canonical.length);
  assert.deepEqual(new Set(snapshot.tanks.map((tank) => tank.tankDefinitionId)), new Set(canonical.map((tank) => tank.id)));
  assert.ok(snapshot.drones.length > 0);
});

missionTest('Mission 20 delegates simulation responsibilities to canonical systems', () => {
  const battle = new api.lobby.LobbyBattle();
  assert.ok(battle.navigation instanceof api.nav.NavigationService);
  assert.ok(battle.droneSystem instanceof api.drones.DroneSystem);
  assert.ok(battle.combat instanceof api.combat.CombatSystem);
  const first = battle.snapshot().tanks[0];
  const runtimeSource = readFileSync(path.join(lobbyDir, 'LobbyBattle.ts'), 'utf8');
  assert.match(runtimeSource, /TankAIController/);
  assert.match(runtimeSource, /PerceptionCore/);
  assert.match(runtimeSource, /stepTankMovement/);
  assert.match(runtimeSource, /stepDroneVelocity/);
  assert.match(runtimeSource, /stepProjectile/);
  assert.equal(first.tankDefinitionId, api.content.TankRegistry.all()[0].id);
});

missionTest('Mission 20 cheaper policy changes cadence and presentation caps, never the canonical roster', () => {
  const normal = new api.lobby.LobbyBattle({ policy:new api.lobby.LobbyPerformancePolicy() });
  const cheap = new api.lobby.LobbyBattle({ policy:new api.lobby.LobbyPerformancePolicy({ lowPower:true, aiThinkIntervalTicks:8, maxVisibleProjectiles:12 }) });
  assert.equal(cheap.tankCount, normal.tankCount);
  assert.equal(cheap.tankCount, api.content.TankRegistry.size);
  assert.ok(cheap.policy.renderHz <= normal.policy.renderHz);
  assert.ok(cheap.policy.aiThinkIntervalTicks >= normal.policy.aiThinkIntervalTicks);
  assert.equal(cheap.policy.capProjectiles(Array.from({length:30}, (_, i) => i)).length, 12);

  const policySource = readFileSync(path.join(lobbyDir, 'LobbyPerformancePolicy.ts'), 'utf8');
  assert.doesNotMatch(policySource, /damage|health|reload|projectileSpeed|moveMultiplier|targeting/i,
    'performance policy must not acquire gameplay tuning authority');
});

missionTest('Mission 20 canonical AI actually drives the background simulation', () => {
  const battle = new api.lobby.LobbyBattle({ policy:new api.lobby.LobbyPerformancePolicy({ aiThinkIntervalTicks:2 }) });
  const before = new Map(battle.snapshot().tanks.map((tank) => [tank.id, tank.position]));
  const after = battle.step(8);
  const moved = after.tanks.filter((tank) => {
    const start = before.get(tank.id);
    return start && Math.hypot(tank.position.x - start.x, tank.position.y - start.y) > 0.01;
  });
  assert.ok(moved.length > 0, 'canonical AI commands should produce canonical tank movement');
  assert.equal(after.tick, 8);
});

missionTest('Mission 20 scene renders canonical battle entities and runtime Battlefield state', () => {
  const scene = new api.lobby.LobbyScene();
  const frame = scene.step(2);
  assert.ok(frame.render instanceof Object);
  assert.ok(frame.render.metrics.entitiesVisited >= frame.battle.tanks.length);
  assert.ok(frame.render.commands.some((command) => command.layer === 'arena' || command.layer === 'terrain'));
  scene.stop();
});

missionTest('Mission 20 reduced motion freezes only camera drift', () => {
  const scene = new api.lobby.LobbyScene({ policy:new api.lobby.LobbyPerformancePolicy({ reducedMotion:true }) });
  const frame = scene.step(4);
  assert.equal(frame.cameraY, 0);
  assert.equal(frame.battle.tick, 4, 'simulation must continue when presentation motion is reduced');
  scene.stop();
});

missionTest('Mission 20 contains no lobby-private class AI or fire-mode implementation', () => {
  const source = [
    readFileSync(path.join(lobbyDir, 'LobbyBattle.ts'), 'utf8'),
    readFileSync(path.join(lobbyDir, 'LobbyScene.ts'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /switch\s*\([^)]*fireMode|case\s+['"](?:single|twin|minigun|shotgun|shell|beam)['"]/);
  assert.doesNotMatch(source, /lineage\s*===|lineage\s*==/);
  assert.doesNotMatch(source, /ROSTER\s*=|COLORS\s*=|targetFor\s*\(/);
  assert.doesNotMatch(source, /nova-updates\/lobby-battlefield/);
  assert.match(source, /TankRegistry\.all\(\)/);
  assert.match(source, /WeaponRegistry\.get/);
});
