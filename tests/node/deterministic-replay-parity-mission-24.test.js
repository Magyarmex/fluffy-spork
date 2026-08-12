const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function loadReplay() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-replay-final-'));
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, path.join(root, 'src/replay/index.ts')], { cwd: root, stdio: 'pipe' });
  return { replay: require(path.join(outDir, 'replay/index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

function recording(replay) {
  const recorder = new replay.ReplayRecorder({ seed: 17, buildVersion: 'mission-26', runtimeVersion: 'foundation', fixedStepMs: 1000 / 60 });
  recorder.recordCommand({ tick: 4, actorId: 'player', envelope: { source:'keyboard', sequence:2, command:{ type:'fire', active:true } } });
  recorder.recordCommand({ tick: 2, actorId: 'player', envelope: { source:'keyboard', sequence:1, command:{ type:'move', vector:{ x:1, y:0 } } } });
  return recorder.finish();
}

class FoundationRuntimeDouble {
  kind = 'foundation';
  tick = 0;
  value = 0;
  events = [];
  reset(input) { this.tick = 0; this.value = input.seed; this.events = []; }
  stepTo(tick) { this.tick = tick; }
  applyCommand(command) {
    if (command.envelope.command.type === 'move') this.value += Math.round(command.envelope.command.vector.x * 10);
    if (command.envelope.command.type === 'fire' && command.envelope.command.active) this.value += 3;
    this.events.push({ type:'ReplayCommandApplied', tick:command.tick, elapsedMs:command.tick * (1000 / 60), payload:{ sequence:command.envelope.sequence } });
  }
  drainSemanticEvents() { const events = this.events; this.events = []; return events; }
  outcome() { return { tick:this.tick, value:this.value }; }
}

test('Foundation replay remains deterministic after dual-runtime retirement', () => {
  const { replay, dispose } = loadReplay();
  try {
    const artifact = recording(replay);
    assert.deepEqual(artifact.commands.map((entry) => entry.tick), [2, 4]);
    const player = new replay.ReplayPlayer();
    const first = player.play(artifact, new FoundationRuntimeDouble());
    const second = player.play(artifact, new FoundationRuntimeDouble());
    assert.equal(first.runtime, 'foundation');
    assert.deepEqual(first, second);
    assert.equal(first.outcome.value, 30);
  } finally { dispose(); }
});

test('Mission 24 parity matrix is retained as immutable migration evidence', () => {
  const report = readFileSync(path.join(root, 'docs/nova-foundation/PARITY_REPORT_MISSION_24.md'), 'utf8');
  for (const surface of ['Desktop','Portrait mobile','Landscape mobile','Touch','Mouse','Keyboard','Gamepad','Gunner','Cannon','Guardian','Sniper','Controller','Major evolutions','Representative Battlefield layouts','Blackglass','Lobby','Settings','PWA']) {
    assert.match(report, new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${surface} missing from retained parity report`);
  }
  assert.ok((report.match(/PASS/g) ?? []).length >= 18, 'parity report must retain PASS evidence for the required matrix');
  assert.match(report, /no new gameplay discrepancy was accepted as an exception/i);
});

test('migration-only replay and runtime switching sources are retired', () => {
  for (const relativePath of ['src/replay/ParityHarness.ts', 'src/app/runtimeSelector.ts', 'src/legacy']) {
    assert.equal(existsSync(path.join(root, relativePath)), false, `${relativePath} must be retired`);
  }
  const replaySource = readFileSync(path.join(root, 'src/replay/Replay.ts'), 'utf8');
  assert.match(replaySource, /RuntimeKind = 'foundation'/);
  assert.doesNotMatch(replaySource, /'legacy'/);
});
