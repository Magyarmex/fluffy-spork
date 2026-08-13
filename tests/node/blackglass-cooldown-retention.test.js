const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function allTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allTs(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

function loadBlackglass() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-blackglass-retention-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sources = [
    path.join(root, 'src/content/schema.ts'), path.join(root, 'src/content/registry.ts'),
    path.join(root, 'src/content/tanks/catalog.ts'), path.join(root, 'src/content/catalog.ts'),
    path.join(root, 'src/content/upgrades/catalog.ts'), path.join(root, 'src/content/index.ts'),
    path.join(root, 'src/game/simulation/math.ts'), path.join(root, 'src/game/simulation/types.ts'),
    path.join(root, 'src/game/battlefield/types.ts'), path.join(root, 'src/game/entities/types.ts'),
    path.join(root, 'src/game/entities/drones/types.ts'), path.join(root, 'src/game/entities/drones/formations.ts'),
    path.join(root, 'src/game/combat/types.ts'), path.join(root, 'src/game/combat/CombatSystem.ts'),
    ...allTs(path.join(root, 'src/rendering')), ...allTs(path.join(root, 'src/scenes/blackglass')),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    blackglass: require(path.join(outDir, 'scenes/blackglass/index.js')),
    rendering: require(path.join(outDir, 'rendering/index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

test('Blackglass keeps the last successful projectile preview when a held-fire frame is cooldown-blocked', () => {
  const api = loadBlackglass();
  try {
    const scene = new api.blackglass.BlackglassScene('scout');
    const first = scene.fire(0);
    assert.equal(first.result.fired, true);
    assert.ok(first.projectiles.length > 0);

    const blocked = scene.fire(0.001);
    assert.equal(blocked.result.fired, false);
    assert.equal(blocked.projectiles.length, 0, 'a blocked attempt must not claim it spawned a projectile');

    const snapshot = scene.snapshot();
    const actual = scene.render(2, 32);
    const renderer = new api.rendering.Renderer();
    renderer.start();
    const expected = renderer.render({ tick: 2, elapsedMs: 32, entities: [snapshot.tank, ...snapshot.drones, ...first.projectiles] });
    assert.deepEqual(actual, expected, 'cooldown polling must not erase the last successful Blackglass projectile visual');
    renderer.stop();
    scene.stop();
  } finally {
    api.dispose();
  }
});
