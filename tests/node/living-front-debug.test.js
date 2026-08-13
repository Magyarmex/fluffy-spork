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
  assert.match(runtime, /private readonly onPointerCancel=\(event:PointerEvent\)=>\{if\(event\.pointerType!==?'touch'\)this\.#pointerDown=false;\};/,
    'cancelled mouse pointers must release held fire state regardless of pointerup button semantics');
  assert.match(runtime, /window\.addEventListener\('pointercancel',this\.onPointerCancel\)/,
    'runtime should listen for cancelled mouse pointers');
  assert.match(runtime, /window\.removeEventListener\('pointercancel',this\.onPointerCancel\)/,
    'runtime teardown should remove the pointer cancellation listener');
});

test('secondary mouse buttons do not steal primary-fire ownership', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(runtime, /onPointerDown=\(event:PointerEvent\)=>\{if\(event\.pointerType==='touch'\)return;[\s\S]*?if\(event\.button===0\)this\.#pointerDown=true;/,
    'pressing a secondary mouse button while primary fire is held must not clear primary-fire state');
  assert.match(runtime, /onPointerUp=\(event:PointerEvent\)=>\{if\(event\.pointerType!=='touch'&&event\.button===0\)this\.#pointerDown=false;\};/,
    'releasing a secondary mouse button must not release primary fire');
});

test('touch UI forgets stale held state on blur and page hide', () => {
  const controls = readFileSync(path.join(root, 'src/ui/controls/TouchControls.tsx'), 'utf8');
  assert.match(controls, /const resetLocalTouchState = \(\) => \{[\s\S]*anchors\.current = \{ move: null, aim: null \};[\s\S]*firing: false,[\s\S]*abilities: \{\},[\s\S]*ultimate: false,[\s\S]*emit\(\);/,
    'touch presentation state must be neutralized instead of resurrecting a stale held command on the next touch event');
  assert.match(controls, /window\.addEventListener\('blur', onBlur\)/,
    'touch controls should clear their own local state when focus is lost');
  assert.match(controls, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/,
    'touch controls should clear their own local state when the page is hidden');
  assert.match(controls, /window\.removeEventListener\('blur', onBlur\)/,
    'touch-control focus listeners must be cleaned up on unmount');
  assert.match(controls, /document\.removeEventListener\('visibilitychange', onVisibilityChange\)/,
    'touch-control visibility listeners must be cleaned up on unmount');
});

test('touch action buttons preserve ownership across multiple simultaneous pointers', () => {
  const controls = readFileSync(path.join(root, 'src/ui/controls/TouchControls.tsx'), 'utf8');
  assert.match(controls, /const actionPointers = useRef<Record<ActionName, Set<number>>>/,
    'touch action state should track pointer ownership rather than one shared boolean');
  assert.match(controls, /const held = pointers\.size > 0;/,
    'releasing one pointer must not release an action while another pointer remains held');
  assert.match(controls, /onPointerUp=\{\(event\) => setActionPointer\(action, event\.pointerId, false\)\}/,
    'action release must remove only the pointer that actually ended');
  assert.match(controls, /onPointerCancel=\{\(event\) => setActionPointer\(action, event\.pointerId, false\)\}/,
    'cancelled pointers must release only their own action ownership');
});

test('touch sticks keep their original pointer owner until it releases', () => {
  const controls = readFileSync(path.join(root, 'src/ui/controls/TouchControls.tsx'), 'utf8');
  assert.match(controls, /const activeAnchor = anchors\.current\[name\];[\s\S]*if \(activeAnchor && activeAnchor\.pointerId !== event\.pointerId\) return;/,
    'a second finger landing on an occupied stick must not steal ownership or zero the first pointer movement');
  assert.match(controls, /if \(!anchor \|\| anchor\.pointerId !== event\.pointerId\) return;/,
    'only the owning pointer may move or release a touch stick');
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

test('lost pointer capture releases touch stick and action ownership', () => {
  const controls = readFileSync(path.join(root, 'src/ui/controls/TouchControls.tsx'), 'utf8');
  assert.match(controls, /onLostPointerCapture=\{\(event\) => endStick\(name, event\)\}/,
    'a stick must return to neutral if the browser revokes pointer capture without a normal pointerup');
  assert.match(controls, /onLostPointerCapture=\{\(event\) => setActionPointer\(action, event\.pointerId, false\)\}/,
    'an action must drop only the pointer whose capture was lost');
});
