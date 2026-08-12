const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const simulationDir = path.join(root, 'src', 'game', 'simulation');

function loadKernel() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-simulation-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const sourceFiles = readdirSync(simulationDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(simulationDir, name));

  execFileSync(process.execPath, [
    tsc,
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--strict',
    '--outDir', outDir,
    ...sourceFiles,
  ], { cwd: root, stdio: 'pipe' });

  const kernel = require(path.join(outDir, 'index.js'));
  return { kernel, dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

test('Mission 06 kernel runs headlessly through start, step, inspect, pause, resume and stop', () => {
  const { kernel, dispose } = loadKernel();
  try {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const world = new kernel.GameWorld({
      initialData: { counter: 0 },
      fixedStepMs: 20,
      seed: 12345,
      systems: [({ data, random, emit }) => {
        data.counter += 1;
        emit('simulation.tick', { roll: random.integer(0, 1000) });
      }],
    });

    assert.deepEqual(world.inspect(), {
      tick: 0,
      elapsedMs: 0,
      lifecycle: 'idle',
      data: { counter: 0 },
    });

    world.start();
    const state = world.step(3);
    assert.equal(state.tick, 3);
    assert.equal(state.elapsedMs, 60);
    assert.equal(state.data.counter, 3);
    assert.equal(world.drainEvents().length, 3);

    world.pause();
    assert.equal(world.inspect().lifecycle, 'paused');
    world.resume();
    world.step();
    world.stop();
    assert.equal(world.inspect().lifecycle, 'stopped');
    assert.throws(() => world.step(), /must be running/);
  } finally {
    dispose();
  }
});

test('Mission 06 seeded worlds produce identical snapshots and event streams', () => {
  const { kernel, dispose } = loadKernel();
  try {
    const makeWorld = () => new kernel.GameWorld({
      initialData: { samples: [] },
      seed: 0x4e4f5641,
      systems: [({ data, random, emit }) => {
        const sample = random.nextUint32();
        data.samples.push(sample);
        emit('rng.sample', sample);
      }],
    });

    const a = makeWorld();
    const b = makeWorld();
    a.start();
    b.start();
    a.step(8);
    b.step(8);

    assert.deepEqual(a.snapshot(), b.snapshot());
    assert.deepEqual(a.drainEvents(), b.drainEvents());
  } finally {
    dispose();
  }
});

test('Mission 06 snapshots restore clock, data and random state deterministically', () => {
  const { kernel, dispose } = loadKernel();
  try {
    const system = ({ data, random }) => data.values.push(random.integer(0, 100));
    const source = new kernel.GameWorld({ initialData: { values: [] }, seed: 77, systems: [system] });
    source.start();
    source.step(5);
    source.pause();
    const checkpoint = source.snapshot();

    source.resume();
    source.step(4);
    const expected = source.inspect();

    const replay = new kernel.GameWorld({ initialData: { values: [] }, seed: 1, systems: [system] });
    replay.restore(checkpoint);
    replay.resume();
    replay.step(4);

    assert.deepEqual(replay.inspect(), expected);
  } finally {
    dispose();
  }
});

test('Mission 06 canonical simulation source has no browser presentation dependencies', () => {
  const forbidden = /\b(?:document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|AudioContext|React|TouchEvent)\b/;
  for (const name of readdirSync(simulationDir).filter((entry) => entry.endsWith('.ts'))) {
    const source = require('node:fs').readFileSync(path.join(simulationDir, name), 'utf8');
    assert.equal(forbidden.test(source), false, `${name} contains a forbidden browser/presentation dependency`);
  }
});
