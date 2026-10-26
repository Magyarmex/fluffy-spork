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
  return game;
}

const TARGET={circle:62,triangle:30,square:16,pentagon:8,hexagon:4};
function counts(g){
  const out={circle:0,triangle:0,square:0,pentagon:0,hexagon:0};
  for(const s of g.shapes)if(s&&s.hp>0&&Object.hasOwn(out,s.type))out[s.type]++;
  return out;
}
test('materialized initial neutral ecology begins at canonical 120-body contract',()=>{
  const g=bootGame();
  assert.match(String(g.seedShapes),/counts=Object.create/,'shipping Living Front deficit-only seeding is installed');
  assert.match(String(g.redeploy),/shapeById.clear/,'shipping redeploy rebuilds surviving shape lookup');
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
