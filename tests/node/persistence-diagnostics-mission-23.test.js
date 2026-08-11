const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function loadMission23() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-m23-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entries = [
    path.join(root, 'src/persistence/index.ts'),
    path.join(root, 'src/diagnostics/index.ts'),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict', '--outDir', outDir, ...entries], { cwd: root, stdio: 'pipe' });
  return {
    persistence: require(path.join(outDir, 'persistence/index.js')),
    diagnostics: require(path.join(outDir, 'diagnostics/index.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission23();
test.after(() => api.dispose());

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/persistence-diagnostics-mission-23.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

missionTest('Mission 23 migrates every shipped legacy persistence key without deleting it', () => {
  const legacy = {
    novatanks_best: '4200',
    novatanks_bestlevel: '37',
    novatanks_quality: 'low',
    novatanks_muted: '1',
    novatanks_musicoff: '0',
    novatanks_pilot_settings_v1: JSON.stringify({ aimSensitivity: 145, moveSensitivity: 70, stickSize: 125, stickOpacity: 55, screenShake: 30 }),
    'nova:lastUpdateReadyAt': '1786480000000',
    'nova:lastUpdateFingerprint': 'abc123',
  };
  const storage = new MemoryStorage(legacy);
  const service = new api.persistence.PersistenceService(storage);
  const loaded = service.load();
  assert.equal(loaded.source, 'legacy');
  assert.equal(loaded.save.schemaVersion, 1);
  assert.equal(loaded.save.scores.best, 4200);
  assert.equal(loaded.save.progression.bestLevel, 37);
  assert.equal(loaded.save.preferences.quality, 'low');
  assert.equal(loaded.save.preferences.muted, true);
  assert.equal(loaded.save.preferences.pilot.aimSensitivity, 1.45);
  assert.equal(loaded.save.preferences.pilot.moveSensitivity, 0.7);
  assert.equal(loaded.save.preferences.pilot.stickOpacity, 0.55);
  assert.equal(loaded.save.extensions.pwaLastUpdateFingerprint, 'abc123');
  for (const [key, value] of Object.entries(legacy)) assert.equal(storage.getItem(key), value);
  assert.equal(storage.getItem(api.persistence.FOUNDATION_SAVE_KEY), null, 'load must not silently overwrite user storage');
});

missionTest('Mission 23 persists a versioned save and mirrors legacy keys for rollback/offline compatibility', () => {
  const storage = new MemoryStorage({ novatanks_best: '2' });
  const service = new api.persistence.PersistenceService(storage);
  const save = service.load().save;
  const updated = {
    ...save,
    scores: { best: 99 },
    progression: { bestLevel: 12 },
    preferences: { ...save.preferences, muted: true, pilot: { ...save.preferences.pilot, aimSensitivity: 1.2 } },
    profile: { data: { callsign: 'Nova' } },
  };
  assert.deepEqual(service.save(updated), []);
  const encoded = JSON.parse(storage.getItem(api.persistence.FOUNDATION_SAVE_KEY));
  assert.equal(encoded.schemaVersion, 1);
  assert.equal(encoded.profile.data.callsign, 'Nova');
  assert.equal(storage.getItem('novatanks_best'), '99');
  assert.equal(storage.getItem('novatanks_bestlevel'), '12');
  assert.equal(storage.getItem('novatanks_muted'), '1');
  assert.equal(JSON.parse(storage.getItem('novatanks_pilot_settings_v1')).aimSensitivity, 120);
});

missionTest('Mission 23 leaves malformed current data intact and recovers from legacy state', () => {
  const malformed = '{broken';
  const storage = new MemoryStorage({ novatanks_save_v1: malformed, novatanks_best: '71' });
  const loaded = new api.persistence.PersistenceService(storage).load();
  assert.equal(loaded.source, 'legacy');
  assert.equal(loaded.save.scores.best, 71);
  assert.equal(storage.getItem('novatanks_save_v1'), malformed);
  assert.ok(loaded.warnings.some((warning) => warning.includes('left untouched')));
});

missionTest('Mission 23 preserves unknown structured fields rather than silently deleting them', () => {
  const migrated = api.persistence.migrateSaveFile({
    schemaVersion: 1,
    scores: { best: 5 }, progression: { bestLevel: 2 }, preferences: {}, profile: { data: { badge: 'founder' } },
    futureField: { nested: 7 },
  }).save;
  assert.deepEqual(migrated.extensions['unmapped:futureField'], { nested: 7 });
  assert.equal(migrated.profile.data.badge, 'founder');
});

missionTest('Mission 23 diagnostics expose every required subsystem through explicit providers', () => {
  const service = new api.diagnostics.DiagnosticsService({
    build: () => ({ version: 'foundation-test', commit: 'abc' }),
    simulation: () => ({ tick: 42, seed: 7 }),
    player: () => ({ id: 'p1', health: 100 }),
    persistence: () => ({ schemaVersion: 1, source: 'foundation' }),
    scene: () => ({ id: 'blackglass' }),
  });
  const snapshot = service.capture('2026-08-11T23:00:00.000Z');
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.sections.simulation.tick, 42);
  assert.equal(snapshot.sections.player.health, 100);
  for (const name of api.diagnostics.DIAGNOSTIC_SECTIONS) assert.ok(snapshot.sections[name], `${name} section missing`);
  assert.equal(snapshot.sections.ai.status, 'unavailable');
});

missionTest('Mission 23 copy output is stable, machine-readable, and global-free', () => {
  const first = new api.diagnostics.DiagnosticsService({ build: () => ({ z: 2, a: 1 }) });
  const snapshot = first.capture('2026-08-11T23:00:00.000Z');
  const a = first.copy(snapshot);
  const b = first.copy(snapshot);
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a), snapshot);
  assert.ok(a.indexOf('"a"') < a.indexOf('"z"'));
  const source = readFileSync(path.join(root, 'src/diagnostics/DiagnosticsService.ts'), 'utf8');
  assert.doesNotMatch(source, /window\.|__NOVA_|__novaModules|globalThis\[/);
});

missionTest('Mission 23 persistence remains offline/PWA-safe and does not own gameplay authority', () => {
  const source = [
    readFileSync(path.join(root, 'src/persistence/PersistenceService.ts'), 'utf8'),
    readFileSync(path.join(root, 'src/persistence/migrations.ts'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|GameWorld|CombatSystem|applyDamage|TargetingService|EntityStore/);
  assert.match(readFileSync(path.join(root, 'pwa-register.js'), 'utf8'), /serviceWorker/);
  assert.match(readFileSync(path.join(root, 'sw.js'), 'utf8'), /caches\./);
});
