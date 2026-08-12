const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function loadMission24() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-m24-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entries = [path.join(root, 'src/replay/index.ts'), path.join(root, 'src/app/runtimeSelector.ts')];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict', '--outDir', outDir, ...entries], { cwd: root, stdio: 'pipe' });
  return {
    replay: require(path.join(outDir, 'replay/index.js')),
    runtimeSelector: require(path.join(outDir, 'app/runtimeSelector.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission24();
test.after(() => api.dispose());

function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/deterministic-replay-parity-mission-24.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

function buildRecording() {
  const recorder = new api.replay.ReplayRecorder({ seed: 90210, buildVersion: 'nova-foundation-m24', runtimeVersion: '1', fixedStepMs: 1000 / 60 });
  recorder.recordCommand({ tick: 2, actorId: 'player', envelope: { source: 'keyboard', sequence: 2, command: { type: 'fire', active: true } } });
  recorder.recordCommand({ tick: 1, actorId: 'player', envelope: { source: 'keyboard', sequence: 1, command: { type: 'move', vector: { x: 0.5, y: 0.25 } } } });
  recorder.recordSemanticEvents([{ type: 'ProjectileFired', tick: 2, elapsedMs: 33.333333, payload: { actorId: 'player' } }]);
  return recorder.finish();
}

class FakeRuntime {
  constructor(kind, drift = 0) {
    this.kind = kind;
    this.drift = drift;
    this.tick = 0;
    this.energy = 0;
    this.events = [];
    this.applied = [];
  }
  reset(recording) { this.tick = 0; this.energy = recording.seed % 10; this.events = []; this.applied = []; }
  stepTo(tick) { this.tick = tick; }
  applyCommand(command) {
    this.applied.push(command.envelope.command.type);
    if (command.envelope.command.type === 'move') this.energy += 1;
    if (command.envelope.command.type === 'fire') {
      this.energy += 2 + this.drift;
      this.events.push({ type: 'ProjectileFired', tick: command.tick, elapsedMs: command.tick * (1000 / 60), payload: { actorId: command.actorId } });
    }
  }
  drainSemanticEvents() { const events = this.events; this.events = []; return events; }
  outcome() { return { tick: this.tick, energy: this.energy, applied: this.applied }; }
}

missionTest('Mission 24 recording captures seed, build/runtime version, commands and semantic events in deterministic order', () => {
  const recording = buildRecording();
  assert.equal(recording.schemaVersion, 1);
  assert.equal(recording.seed, 90210);
  assert.equal(recording.buildVersion, 'nova-foundation-m24');
  assert.equal(recording.runtimeVersion, '1');
  assert.deepEqual(recording.commands.map((entry) => entry.tick), [1, 2]);
  assert.deepEqual(recording.commands.map((entry) => entry.envelope.sequence), [1, 2]);
  assert.equal(recording.semanticEvents[0].type, 'ProjectileFired');
});

missionTest('Mission 24 deterministic playback reproduces the same outcome for equivalent runtimes', () => {
  const recording = buildRecording();
  const player = new api.replay.ReplayPlayer();
  const legacy = player.play(recording, new FakeRuntime('legacy'));
  const foundation = player.play(recording, new FakeRuntime('foundation'));
  assert.deepEqual(legacy.outcome, foundation.outcome);
  assert.deepEqual(legacy.semanticEvents, foundation.semanticEvents);
});

missionTest('Mission 24 parity compares meaningful outcomes with bounded numeric tolerance', () => {
  assert.equal(api.replay.compareMeaningfulOutcomes({ x: 1 }, { x: 1 + 5e-7 }, { tolerance: 1e-6 }).length, 0);
  const differences = api.replay.compareMeaningfulOutcomes({ hp: 100 }, { hp: 99 }, { tolerance: 1e-6 });
  assert.equal(differences.length, 1);
  assert.match(differences[0].path, /hp/);
});

missionTest('Mission 24 parity harness refuses to pass without complete required behavioral coverage', () => {
  const recording = buildRecording();
  const incomplete = new api.replay.ParityHarness().run([{ id: 'desktop-only', surfaces: ['desktop'], recording, legacy: () => new FakeRuntime('legacy'), foundation: () => new FakeRuntime('foundation') }]);
  assert.equal(incomplete.passed, false);
  assert.ok(incomplete.missingSurfaces.includes('pwa'));

  const complete = new api.replay.ParityHarness().run([{ id: 'full-required-matrix', surfaces: api.replay.REQUIRED_PARITY_SURFACES, recording, legacy: () => new FakeRuntime('legacy'), foundation: () => new FakeRuntime('foundation'), tolerance: 1e-6 }]);
  assert.equal(complete.passed, true);
  assert.deepEqual(complete.missingSurfaces, []);
});

missionTest('Mission 24 parity harness exposes real discrepancies instead of weakening the comparison', () => {
  const recording = buildRecording();
  const report = new api.replay.ParityHarness().run([{ id: 'intentional-drift', surfaces: api.replay.REQUIRED_PARITY_SURFACES, recording, legacy: () => new FakeRuntime('legacy'), foundation: () => new FakeRuntime('foundation', 1) }]);
  assert.equal(report.passed, false);
  assert.ok(report.cases[0].differences.some((difference) => difference.path.includes('energy')));
});

missionTest('Mission 24 runtime selection is development-only and production cannot query-switch to legacy', () => {
  assert.equal(api.runtimeSelector.resolveDevelopmentRuntime('?runtime=legacy', true).selected, 'legacy');
  assert.equal(api.runtimeSelector.resolveDevelopmentRuntime('?runtime=foundation', true).selected, 'foundation');
  assert.equal(api.runtimeSelector.resolveDevelopmentRuntime('?runtime=legacy', false).selected, 'foundation');
  assert.equal(api.runtimeSelector.resolveDevelopmentRuntime('?runtime=nonsense', true).selected, 'foundation');
  const bootstrap = readFileSync(path.join(root, 'src/app/bootstrap.ts'), 'utf8');
  assert.match(bootstrap, /resolveDevelopmentRuntime\(window\.location\.search, import\.meta\.env\.DEV\)/);
  assert.match(bootstrap, /LegacyRuntime\.fromWindow\(\)\.boot\('main'\)/);
});

missionTest('Mission 24 parity evidence matrix names every mother-spec surface and preserves production cutover boundary', () => {
  const report = readFileSync(path.join(root, 'docs/nova-foundation/PARITY_REPORT_MISSION_24.md'), 'utf8').toLowerCase();
  for (const surface of ['desktop', 'portrait mobile', 'landscape mobile', 'touch', 'mouse', 'keyboard', 'gamepad', 'gunner', 'cannon', 'guardian', 'sniper', 'controller', 'major evolutions', 'battlefield', 'blackglass', 'lobby', 'settings', 'pwa']) assert.match(report, new RegExp(surface.replace(/ /g, '\\s+')));
  assert.match(report, /no production cutover/i);
  assert.match(report, /legacy.*foundation/i);
});
