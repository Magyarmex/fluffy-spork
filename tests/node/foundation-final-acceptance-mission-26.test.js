const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir, extensions = /\.(?:ts|tsx)$/) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full, extensions) : extensions.test(full) ? [full] : [];
  });
}

const retired = [
  'nova-gz', 'nova-payload', 'nova-updates', 'src/legacy',
  'src/app/runtimeSelector.ts', 'src/replay/ParityHarness.ts', 'pwa-register.js',
];

test('Mission 26 physically retires every migration runtime layer', () => {
  for (const item of retired) assert.equal(fs.existsSync(path.join(root, item)), false, `${item} must be absent`);
});

test('active source contains no retired module-registry or dual-runtime mechanisms', () => {
  const forbidden = /__novaModules|__novaCache|__novaMakeRequire|__bootModule|@legacy(?:\/|['"])|runtime=legacy/;
  const files = [
    ...walk(path.join(root, 'src')),
    path.join(root, 'index.html'), path.join(root, 'vite.config.ts'), path.join(root, 'tsconfig.json'),
    path.join(root, '.github/workflows/ci.yml'), path.join(root, '.github/workflows/deploy.yml'), path.join(root, 'sw.js'),
  ];
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, path.relative(root, file));
});

test('canonical bootstrap and production shell have exactly one Foundation runtime path', () => {
  const bootstrap = read('src/app/bootstrap.ts');
  const html = read('index.html');
  assert.match(bootstrap, /const app = new GameApp\(root\)/);
  assert.match(bootstrap, /app\.start\(\)/);
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js'/);
  assert.doesNotMatch(bootstrap, /LegacyRuntime|resolveDevelopmentRuntime|runtime\.selected/);
  assert.ok(Buffer.byteLength(html) < 32 * 1024);
  assert.match(html, /type="module" src="\/src\/main\.ts"/);
});

test('production composition wires desktop, twin-stick touch and gamepad through canonical commands', () => {
  const runtime = read('src/app/FoundationRuntime.ts');
  const ui = read('src/ui/CanonicalUI.tsx');
  const touch = read('src/ui/controls/TouchControls.tsx');
  assert.match(runtime, /GamepadInputAdapter/);
  assert.match(runtime, /navigator\.getGamepads/);
  assert.match(runtime, /issuePlayerCommand/);
  assert.match(ui, /TouchControls/);
  assert.match(touch, /TouchInputAdapter/);
  for (const token of ["'move'", "'aim'", "'fire'", "'ability'", "'ultimate'"]) assert.ok(touch.includes(token), token);
});

test('simulation remains browser/presentation independent', () => {
  const forbidden = /\b(?:document|window|HTMLElement|CanvasRenderingContext2D|requestAnimationFrame)\b|from ['"]react|@rendering|@ui|@audio/;
  for (const file of walk(path.join(root, 'src/game/simulation'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, path.relative(root, file));
  }
});

test('rendering has no gameplay authority imports or mutation entry points', () => {
  const forbidden = /\b(?:CombatSystem|TargetingService|EntityStore|GameWorld|stepTankMovement|stepProjectile|applyDamage)\b/;
  for (const file of walk(path.join(root, 'src/rendering'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, path.relative(root, file));
  }
});

test('AI cannot reacquire forbidden raw dynamic-state authority', () => {
  const forbidden = /\b(?:GameWorld|EntityStore)\b/;
  for (const file of walk(path.join(root, 'src/ai'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, path.relative(root, file));
  }
});

test('canonical registries are declared only inside src/content', () => {
  const sourceFiles = walk(path.join(root, 'src'));
  for (const registry of ['TankRegistry','WeaponRegistry','DroneRegistry','BattlefieldRegistry','UpgradeRegistry']) {
    const declarations = sourceFiles.filter((file) => new RegExp(`(?:export\\s+)?const\\s+${registry}\\b`).test(fs.readFileSync(file, 'utf8')));
    assert.equal(declarations.length, 1, `${registry} should have one declaration, got ${declarations.map((file) => path.relative(root, file)).join(', ')}`);
    assert.ok(declarations[0].includes(`${path.sep}src${path.sep}content${path.sep}`), `${registry} must live in src/content`);
  }
});

test('domain agent guardrails and final evidence are present', () => {
  for (const file of ['AGENTS.md','src/game/AGENTS.md','src/ai/AGENTS.md','src/rendering/AGENTS.md','src/content/AGENTS.md','src/ui/AGENTS.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
  for (const file of ['docs/nova-foundation/PARITY_REPORT_MISSION_24.md','docs/nova-foundation/PERFORMANCE_REPORT_MISSION_25.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
  for (let i = 1; i <= 25; i++) {
    const name = `MISSION-${String(i).padStart(2, '0')}.md`;
    assert.equal(fs.existsSync(path.join(root, 'docs/nova-foundation/completed', name)), true, name);
  }
});

test('retired patch-presence tests no longer masquerade as canonical regression coverage', () => {
  const names = fs.readdirSync(path.join(root, 'tests/node'));
  const forbidden = names.filter((name) => /v1\.\d|legacy-boundary|materializer-runtime-fingerprint/.test(name));
  assert.deepEqual(forbidden, []);
});
