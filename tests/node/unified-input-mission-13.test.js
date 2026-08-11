const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const inputDir = path.join(root, 'src', 'input');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

function loadInput() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-input-'));
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...walk(inputDir)], { cwd: root, stdio: 'pipe' });
  return { input: require(path.join(outDir, 'index.js')), dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}

const settings = () => ({ aimSensitivity: 1, stickDeadzone: 0.1 });

function stateFrom(controller, input) {
  return input.reduceCommands(input.EMPTY_CONTROL_STATE, controller.poll());
}

test('Mission 13 touch preserves independent twin-stick movement, aim, fire and multitouch ultimate', () => {
  const { input, dispose } = loadInput();
  try {
    const controller = new input.TouchInputAdapter(settings);
    controller.ingest({ moveStick: { x: 1, y: 0 }, aimStick: { x: 0, y: -1 }, firing: true, ultimate: true, abilities: { 0: true } });
    const state = stateFrom(controller, input);
    assert.deepEqual(state.move, { x: 1, y: 0 });
    assert.deepEqual(state.aim, { x: 0, y: -1 });
    assert.equal(state.firing, true);
    assert.equal(state.ultimate, true);
    assert.equal(state.abilities[0], true);
  } finally { dispose(); }
});

test('Mission 13 keyboard, gamepad and scripted controllers converge on canonical command state', () => {
  const { input, dispose } = loadInput();
  try {
    const keyboard = new input.KeyboardInputAdapter();
    keyboard.ingest({ pressed: new Set(['KeyW', 'KeyD', 'ArrowRight', 'Space', 'KeyQ']) });
    const k = stateFrom(keyboard, input);
    assert.equal(k.firing, true);
    assert.equal(k.ultimate, true);
    assert.ok(k.move.x > 0 && k.move.y < 0);

    const gamepad = new input.GamepadInputAdapter(settings);
    gamepad.ingest({ leftStick: { x: 1, y: 0 }, rightStick: { x: 0, y: 1 }, fire: true, ability: false, ultimate: true });
    const g = stateFrom(gamepad, input);
    assert.deepEqual(g.move, { x: 1, y: 0 });
    assert.deepEqual(g.aim, { x: 0, y: 1 });
    assert.equal(g.firing, true);

    const scripted = new input.ScriptedCommandController([{ commands: [
      { type: 'move', vector: { x: 1, y: 0 } },
      { type: 'aim', vector: { x: 0, y: 1 } },
      { type: 'fire', active: true },
      { type: 'ultimate', active: true },
    ] }], 'replay');
    const r = stateFrom(scripted, input);
    assert.deepEqual(r.move, g.move);
    assert.deepEqual(r.aim, g.aim);
    assert.equal(r.firing, g.firing);
    assert.equal(r.ultimate, g.ultimate);
  } finally { dispose(); }
});

test('Mission 13 live sensitivity/deadzone are adapter inputs, not gameplay state', () => {
  const { input, dispose } = loadInput();
  try {
    let live = { aimSensitivity: 1, stickDeadzone: 0.2 };
    const controller = new input.GamepadInputAdapter(() => live);
    controller.ingest({ leftStick: { x: 0.1, y: 0 }, rightStick: { x: 0.1, y: 0 }, fire: false, ability: false, ultimate: false });
    assert.deepEqual(stateFrom(controller, input).move, { x: 0, y: 0 });
    live = { aimSensitivity: 2, stickDeadzone: 0 };
    controller.ingest({ leftStick: { x: 0.1, y: 0 }, rightStick: { x: 0.25, y: 0 }, fire: false, ability: false, ultimate: false });
    const state = stateFrom(controller, input);
    assert.equal(state.move.x, 0.1);
    assert.equal(state.aim.x, 0.5);
  } finally { dispose(); }
});

test('Mission 13 canonical input remains DOM-event agnostic and directly scriptable', () => {
  const forbidden = /\b(?:document|window|TouchEvent|MouseEvent|KeyboardEvent|GamepadEvent|navigator\.getGamepads)\b/;
  for (const file of walk(inputDir)) {
    assert.equal(forbidden.test(readFileSync(file, 'utf8')), false, `${path.relative(inputDir, file)} couples commands to browser events`);
  }
});
