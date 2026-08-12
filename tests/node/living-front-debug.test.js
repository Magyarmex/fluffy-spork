const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('Living Front diagnostics are exposed through the copyable canonical Debug surface', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  const ui = readFileSync(path.join(root, 'src/ui/CanonicalUI.tsx'), 'utf8');
  assert.match(runtime, /livingFront:battle\.livingFront/, 'gameplay publishes the canonical Living Front snapshot into Debug data');
  assert.match(ui, /JSON\.stringify\(ui\.debug,null,2\)/, 'Debug data remains copyable as formatted JSON');
});

test('Debug preserves the last authoritative diagnostics instead of routing through lobby', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /if\(this\.#screen==='debug'\)\{this\.#animation=requestAnimationFrame\(this\.frame\);return;\}/,
    'Debug should keep the current canvas/read model without publishing lobby state over gameplay diagnostics');
});

test('scene changes discard fixed-step time accumulated by the previous scene', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /if\(nextScreen!==this\.#screen\)\{this\.#accumulator=0;this\.resetTransientInput\(\);\}/,
    'switching between lobby, gameplay, Blackglass, and Debug must not inherit stale simulation time');
});

test('scene changes clear touch, keyboard, pointer, and gamepad transient input state', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /private resetTransientInput\(\)\{this\.#pressed\.clear\(\);this\.#pointerDown=false;this\.#gamepadWasActive=false;/,
    'transitioning away from gameplay must not leave held inputs latched');
  assert.match(runtime, /for\(const channel of Object\.keys\(this\.#touchChannels\) as TouchChannel\[\]\)this\.#touchChannels\[channel\]=false;/,
    'touch ownership must be released when its controls unmount during a screen change');
});

test('browser focus loss clears transient controls and installs/removes the blur listener symmetrically', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /private readonly onBlur=\(\)=>\{this\.resetTransientInput\(\);\};/,
    'focus loss should release controls even if keyup or pointerup never arrives');
  assert.match(runtime, /window\.addEventListener\('blur',this\.onBlur\)/,
    'runtime should listen for focus loss');
  assert.match(runtime, /window\.removeEventListener\('blur',this\.onBlur\)/,
    'runtime teardown should remove the focus-loss listener');
});

test('page hiding and pointer cancellation release transient controls', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /private readonly onVisibilityChange=\(\)=>\{if\(document\.hidden\)this\.resetTransientInput\(\);\};/,
    'mobile/background visibility transitions must release controls even when blur is skipped');
  assert.match(runtime, /document\.addEventListener\('visibilitychange',this\.onVisibilityChange\)/,
    'runtime should observe page visibility changes');
  assert.match(runtime, /document\.removeEventListener\('visibilitychange',this\.onVisibilityChange\)/,
    'runtime teardown should remove the visibility listener');
  assert.match(runtime, /window\.addEventListener\('pointercancel',this\.onPointerUp\)/,
    'cancelled mouse pointers must release held fire state');
  assert.match(runtime, /window\.removeEventListener\('pointercancel',this\.onPointerUp\)/,
    'runtime teardown should remove the pointer cancellation listener');
});

test('redeploy starts a clean simulation run without inherited time or held controls', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /redeploy\(\)\{this\.persistRun\(\);this\.#gameplay\.stop\(\);this\.#accumulator=0;this\.resetTransientInput\(\);this\.#gameplay=new GameplayScene/,
    'replacing a dead gameplay scene must clear fixed-step residue and transient input ownership first');
});

test('runtime teardown works before start and remains idempotent', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /#running=false; #disposed=false;/,
    'runtime needs a disposal guard independent from animation-loop state');
  assert.match(runtime, /start\(\)\{if\(this\.#running\|\|this\.#disposed\)return;/,
    'a disposed runtime must not be restarted after its React root and presenters are torn down');
  assert.match(runtime, /stop\(\)\{if\(this\.#disposed\)return;this\.#disposed=true;if\(this\.#running\)\{this\.#running=false;cancelAnimationFrame\(this\.#animation\);\}this\.#lobby\.stop\(\);this\.#gameplay\.stop\(\);this\.#blackglass\.stop\(\);this\.#reactRoot\.unmount\(\);this\.#audioOut\.dispose\(\);this\.removeInput\(\);\}/,
    'stop must release scenes, UI, audio, and listeners even if animation never started, and only once');
});
