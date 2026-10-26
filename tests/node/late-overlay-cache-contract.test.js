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
function bootModules() {
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
  return {Game,window,requireGame};
}

/* KNOWN-RED research contract. The decorative War Room eagerly requires the
 * engine before later overlays install their lazy module-factory wrappers.
 * Never merge these acceptance tests until the actual shipping composition
 * activates the intended Fair Engagement/Living Front owners safely. */
test('[RED] playable Game prototype receives authoritative Fair Engagement',()=>{
  const {Game}=bootModules();
  assert.equal(Game.prototype.__novaFairEngagement,true,
    'Fair Engagement engine hook must be installed, not just announced');
});
test('[RED] playable Game prototype receives Living Front ecology',()=>{
  const {Game}=bootModules();
  assert.equal(Game.prototype.__novaLivingFrontCore,true,
    'Living Front engine hook must be installed in the cached playable Game');
});
test('[RED] authoritative AI update function receives Fair Engagement wrapper',()=>{
  const {requireGame}=bootModules();
  const ai=requireGame('game/ai');
  assert.equal(ai.updateAI.__novaFairEngagement,true,
    'AI module must receive actual Fair Engagement scoring wrapper');
});
test('record preboot module cache exposure that bypasses later factories',()=>{
  const {window}=bootModules();
  assert.ok(window.__novaCache['game/engine'],
    'current War Room already populated engine cache before playable boot');
  assert.ok(window.__novaCache['game/ai'],
    'current War Room already populated AI cache before playable boot');
});
