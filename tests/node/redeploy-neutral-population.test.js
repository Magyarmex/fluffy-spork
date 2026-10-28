'use strict';
// Exercise the exact shipping inline engine plus the HTML-ordered overlays.
// This intentionally uses a no-op canvas: it checks runtime composition and
// simulation crashes, not React boot, rendered pixels, or real-device FPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('window.__defineModule("game/engine"'));
const overlays = [...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)]
  .map(m => m[1]);
const noop = () => {};
function canvas() {
  const gradient = {addColorStop: noop};
  const c = {clientWidth: 800, clientHeight: 600, width: 800, height: 600,
    style: {setProperty: noop}, classList: {add: noop, remove: noop, toggle: noop},
    setAttribute: noop, appendChild: noop, remove: noop, querySelector: () => null,
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({left: 0, top: 0, width: 800, height: 600})};
  const ctx = new Proxy({canvas: c, createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: t => ({width: String(t).length * 8}),
    getImageData: () => ({data: new Uint8ClampedArray(4)})},
    {get: (obj, key) => key in obj ? obj[key] : noop,
      set: (obj, key, value) => {obj[key] = value; return true;}});
  c.getContext = () => ctx;
  return c;
}
function bootGame() {
  const errors = [];
  const store = new Map();
  const document = {hidden: false, visibilityState: 'visible',
    addEventListener: noop, removeEventListener: noop,
    createElement: () => canvas(), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    body: {appendChild: noop}, head: {appendChild: noop},
    documentElement: {style: {setProperty: noop, removeProperty: noop},
      classList: {toggle: noop, add: noop, remove: noop}}};
  const window = {document, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
    addEventListener: noop, removeEventListener: noop,
    localStorage: {getItem: key => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value))},
    setTimeout, clearTimeout, performance};
  window.window = window;
  const context = vm.createContext({window, document, innerWidth: 800, innerHeight: 600,
    matchMedia: () => ({matches: false, addListener: noop, addEventListener: noop}),
    MutationObserver: class {observe() {} disconnect() {}},
    CanvasRenderingContext2D: class {},
    fetch: async () => ({ok: true, json: async () => ({releases: []}), text: async () => ''}),
    navigator: {maxTouchPoints: 0, onLine: false},
    console: {info: noop, warn: noop, log: noop,
      error: (...args) => errors.push(args.map(String).join(' '))},
    Math, Number, Object, Array, Date, Map, Set, WeakMap, Uint8Array,
    Uint8ClampedArray, ArrayBuffer, Promise, JSON, Symbol, Error, TypeError,
    RegExp, String, Boolean, Infinity, NaN, parseInt, parseFloat, isNaN,
    performance, setTimeout, clearTimeout, setInterval: () => 0,
    clearInterval: noop, requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop, Image: class {}, Audio: class {},
    URL, Blob, TextEncoder, TextDecoder});
  vm.runInContext(inline, context, {filename: 'index.html#canonical-engine', timeout: 12000});
  for (const script of overlays) {
    vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), context,
      {filename: script, timeout: 5000});
  }
  const requireGame = window.__novaMakeRequire('');
  const Game = requireGame('game/engine').Game;
  const game = new Game(canvas(), canvas(), {hud: noop, event: noop}, 'low');
  Object.defineProperty(game, '__testLivingFront', {value: window.__NOVA_LIVING_FRONT_INTERNAL__});
  return game;
}

const TARGET={circle:62,triangle:30,square:16,pentagon:8,hexagon:4,star:1};
function counts(g){
  const out={circle:0,triangle:0,square:0,pentagon:0,hexagon:0,star:0};
  for(const s of g.shapes)if(s&&s.hp>0&&Object.hasOwn(out,s.type))out[s.type]++;
  return out;
}
test('materialized initial neutral ecology begins at canonical 121-body contract',()=>{
  const g=bootGame();
  assert.deepEqual(counts(g),TARGET);
});
test('two consecutive redeploys preserve existing neutral bodies without population doubling',()=>{
  const g=bootGame(),first=g.shapes[0],position={x:first.x,y:first.y};
  const before=counts(g);
  g.redeploy();
  assert.deepEqual(counts(g),before,'one redeploy cannot add a second full neutral population');
  assert.ok(g.shapes.includes(first),'living ecology keeps the same physical neutral bodies');
  assert.deepEqual({x:first.x,y:first.y},position,'redeploy does not teleport surviving ecology');
  g.redeploy();
  assert.deepEqual(counts(g),before,'repeated redeploys must not compound population');
});
test('redeploy replenishes only genuinely missing canonical neutral shapes',()=>{
  const g=bootGame();
  for(let i=g.shapes.length-1,removed=0;i>=0&&removed<9;i--){
    if(g.shapes[i].type==='circle'){g.shapes.splice(i,1);removed++;}
  }
  assert.equal(counts(g).circle,53);
  g.redeploy();
  assert.deepEqual(counts(g),TARGET,'missing circles refill without spawning duplicate other shapes');
});
test('redeploy does not delete preexisting extra neutral bodies to conceal overpopulation',()=>{
  const g=bootGame();
  g.spawnShape('circle',true);
  assert.equal(counts(g).circle,63);
  const existing=new Set(g.shapes);
  g.redeploy();
  assert.equal(counts(g).circle,63,'preexisting surplus must not multiply');
  for(const s of existing)assert.ok(g.shapes.includes(s),'surviving ecology is not wiped to satisfy count');
});

test('surviving neutral IDs remain resolvable after redeploy',()=>{
  const g=bootGame();
  const survivors=g.shapes.slice(0,12);
  for(const s of survivors)assert.equal(g.getShape(s.id),s,'baseline lookup is indexed');
  g.redeploy();
  for(const s of survivors)assert.equal(g.getShape(s.id),s,
    'redeploy must not orphan surviving neutral shapes in Zero Churn lookup');
  const live=g.shapes.filter(s=>s&&s.hp>0);
  assert.equal(g.shapeById.size,live.length,'index and physical population agree');
});

test('redeploy immediately replenishes the canonical one-star neutral deficit',()=>{
  const g=bootGame();
  const star=g.shapes.find(s=>s.type==='star');
  assert.ok(star&&star.hp>0,'materialized initial arena has one star');
  g.shapes.splice(g.shapes.indexOf(star),1);
  assert.equal(counts(g).star,0);
  g.redeploy();
  assert.equal(counts(g).star,1,'the rare star is part of the core neutral baseline');
});

test('surviving Rogue Star keeps its physical age and expires at the same deadline at 30–240 Hz',()=>{
  for(const hz of [30,60,120,240]){
    const g=bootGame(),star=g.shapes.find(s=>s.type==='star'),LF=g.__testLivingFront;
    assert.ok(star&&LF&&LF.behaviorTick,'the shipping Star and instinct owner must be installed');
    const initial={x:star.x,y:star.y,hp:star.hp};
    g.time=100;
    star.__lfStarBorn=90;star.__lfSpawnAt=90;star.born=90;
    star.__lfPublicAnnounced=true;star.__lfExit=true;
    g.redeploy();
    assert.equal(g.time,0,'the original game resets its clock on redeploy');
    assert.strictEqual(g.getShape(star.id),star,'the same physical Star survives');
    assert.deepEqual({x:star.x,y:star.y,hp:star.hp},initial,'redeploy does not alter its body');
    assert.equal(star.__lfStarBorn,-10,'Star birth is rebased, not restarted');
    assert.equal(star.__lfSpawnAt,-10,'general neutral birth age is preserved');
    assert.equal(star.born,-10,'core shape birth clock must not impersonate a newborn in Battlefield');
    assert.equal(star.__lfPublicAnnounced,true,'an announced Star cannot be announced twice');
    assert.equal(star.__lfExit,true,'the Star keeps its exit phase');
    const st=LF.ensure(g,LF.defs);
    g.time=22-1/hz;
    LF.behaviorTick(g,st,LF.defs,.12);
    assert.ok(g.shapes.includes(star),hz+' Hz: still alive before age 32');
    g.time=22+1/hz;
    LF.behaviorTick(g,st,LF.defs,.12);
    assert.ok(!g.shapes.includes(star),hz+' Hz: expires at age >32');
    assert.equal(g.getShape(star.id),null,hz+' Hz: spatial ID lookup is cleared');
    assert.equal(st.stats.starsExpired,1,hz+' Hz: expiry is counted exactly once');
  }
});

test('two redeploys preserve fresh Star adoption age and Triangle dodge/cooldown timing',()=>{
  const g=bootGame(),star=g.shapes.find(s=>s.type==='star'),
    tri=g.shapes.find(s=>s.type==='triangle');
  assert.ok(star&&tri);
  g.time=100;
  star.__lfStarBorn=96;star.__lfPublicAnnounced=false;
  tri.__lfSpawnAt=95;tri.born=95;
  tri.__lfEvadeUntil=100.2;tri.__lfEvadeReady=100.9;
  g.redeploy();
  assert.equal(star.__lfStarBorn,-4);
  assert.equal(g.time-star.__lfStarBorn,4,'unannounced Star remains in its 0–8s adoption window');
  assert.equal(tri.__lfSpawnAt,-5);
  assert.equal(tri.born,-5,'the core shape birth clock follows the same rebase');
  assert.ok(Math.abs(tri.__lfEvadeUntil-.2)<1e-9);
  assert.ok(Math.abs(tri.__lfEvadeReady-.9)<1e-9);
  g.time=.1;
  g.redeploy();
  assert.strictEqual(g.getShape(star.id),star);
  assert.equal(g.time-star.__lfStarBorn,4.1,'a second redeploy does not rejuvenate the Star');
  assert.ok(Math.abs(tri.__lfEvadeUntil-.1)<1e-9,'active dodge retains its remaining duration');
  assert.ok(Math.abs(tri.__lfEvadeReady-.8)<1e-9,'cooldown retains its remaining duration');
  assert.equal(star.__lfPublicAnnounced,false,'the Star is not marked announced by redeploy');
});

test('replenished neutral bodies use the new clock, not the previous life offset',()=>{
  const g=bootGame(),old=g.shapes.find(s=>s.type==='star');
  assert.ok(old);
  g.time=100;
  g.shapes.splice(g.shapes.indexOf(old),1);
  g.redeploy();
  const replacement=g.shapes.find(s=>s.type==='star');
  assert.ok(replacement&&replacement!==old);
  assert.equal(replacement.__lfStarBorn,0,'new Star starts at age zero');
  assert.equal(replacement.__lfSpawnAt,0,'new neutral body is not shifted as a survivor');
  assert.equal(replacement.born,0,'Battlefield still recognizes a genuinely newborn shape');
});

test('Rogue Star exit-phase threshold survives redeploy without an early retreat',()=>{
  const g=bootGame(),star=g.shapes.find(s=>s.type==='star'),LF=g.__testLivingFront;
  assert.ok(star&&LF);
  g.time=100;
  star.__lfStarBorn=80;star.__lfExit=false;
  g.redeploy();
  assert.equal(g.time-star.__lfStarBorn,20);
  const st=LF.ensure(g,LF.defs);
  g.time=2.9;
  LF.behaviorTick(g,st,LF.defs,.12);
  assert.equal(star.__lfExit,false,'age 22.9 cannot trigger the age >23 exit');
  g.time=3.1;
  LF.behaviorTick(g,st,LF.defs,.12);
  assert.equal(star.__lfExit,true,'age 23.1 must start the exit phase');
  assert.ok(g.shapes.includes(star),'exit phase does not despawn the Star prematurely');
});

test('old neutral birth timestamps cannot masquerade as current-frame births after redeploy',()=>{
  const g=bootGame(),s=g.shapes.find(s=>s.type==='circle');
  assert.ok(s);
  g.time=100;s.born=12.5;
  g.redeploy();
  assert.strictEqual(g.getShape(s.id),s);
  assert.equal(s.born,-87.5,'old birth must be rebased into the new clock domain');
  g.time=12.5;
  assert.notEqual(s.born,g.time,
    'Battlefield born===g.time guard must not veto an old surviving body');
});
