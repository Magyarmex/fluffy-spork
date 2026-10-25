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
function runGame(hz, controller) {
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
  if (controller) {
    game.setClass(game.player, 'warden');
    game.player.angle = Math.PI / 2;
    game.player.droneRespawnT = 0;
    game.input.aim.active = true;
    game.input.aim.dx = 80;
    game.input.aim.dy = 0;
  }
  for (let i = 0; i < 2 * hz; i++) game.update(1 / hz);
  requireGame('game/render').render(game, game.w, game.h);
  assert.ok(Math.abs(game.time - 2) < 1e-6, 'simulation advances exactly two seconds');
  assert.equal(game.status, 'playing', 'the playable game remains live');
  assert.ok(game.tanks.length > 0 && game.shapes.length > 0,
    'real tank and neutral-shape simulation survives');
  assert.ok(window.__NOVA_CONTROLLER_RELEASE__ && window.__NOVA_TERRAIN_INTELLIGENCE__,
    'both Controller and Terrain Intelligence are active');
  if (controller) {
    assert.equal(game.player.cls, 'warden');
    assert.ok(game.drones.some(d => d.ownerId === game.player.id),
      'real Warden command spawns player-owned drones');
  }
  const unexpected = errors.filter(s => !s.includes('React hooks unavailable; interaction patch not installed'));
  assert.deepEqual(unexpected, [], 'no unexpected runtime console errors');
}
test('shipping HTML contains the actual inline game and its overlay chain', () => {
  assert.ok(inline, 'canonical game module exists');
  assert.ok(overlays.length >= 40, 'materialized gameplay overlays are present');
  assert.equal(new Set(overlays).size, overlays.length, 'no duplicate gameplay overlay');
  for (const script of overlays) assert.ok(fs.statSync(path.join(root, script)).size > 0, script);
});
for (const [hz, controller] of [[30, false], [120, false], [60, true], [240, true]]) {
  test('materialized game: ' + (controller ? 'Warden Controller' : 'baseline') +
    ' survives two seconds at ' + hz + ' FPS', () => runGame(hz, controller));
}
