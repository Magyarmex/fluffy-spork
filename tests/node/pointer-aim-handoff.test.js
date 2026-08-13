const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('mouse aim is not synthesized before a real non-touch pointer is observed', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');

  assert.match(runtime, /#pointerClient=\{x:0,y:0\}; #pointerSeen=false; #pointerDown=false;/,
    'runtime must distinguish an uninitialized mouse position from the real top-left canvas coordinate');
  assert.match(runtime, /if\(player&&this\.#pointerSeen\)\{const pointer=this\.#presenter\.worldPoint/,
    'keyboard fallback must not overwrite touch aim with a fabricated mouse vector before mouse input exists');
  assert.match(runtime, /onPointerMove=\(event:PointerEvent\)=>\{if\(event\.pointerType!=='touch'\)\{this\.#pointerSeen=true;/,
    'a real non-touch pointer move should enable mouse aiming');
  assert.match(runtime, /onPointerDown=\(event:PointerEvent\)=>\{if\(event\.pointerType==='touch'\)return;this\.#pointerSeen=true;/,
    'a mouse/pen click should establish a valid pointer position even without a prior move');
});
