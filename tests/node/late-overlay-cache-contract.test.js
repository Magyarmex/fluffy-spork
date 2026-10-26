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
function bootModules(withMenu=false) {
  const errors = [];
  const store = new Map(), listeners = {};
  const menu = withMenu ? {
    children: [], isConnected: true, offsetParent: {},
    classList: {add: noop, remove: noop},
    getBoundingClientRect: () => ({width: 800, height: 600}),
    querySelectorAll: () => [], querySelector: () => null,
    insertBefore(node, before) {
      const at = before ? this.children.indexOf(before) : -1;
      if(at < 0) this.children.push(node);
      else this.children.splice(at, 0, node);
      node.parentElement=this;node.isConnected=true;
      this.firstChild=this.children[0];
    }
  } : null;
  const document = {hidden: false, visibilityState: 'visible', readyState:'loading',
    addEventListener: (name,fn) => {listeners[name]=fn;}, removeEventListener: noop,
    createElement: () => canvas(), getElementById: () => null,
    querySelector: () => menu, querySelectorAll: () => [],
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
  const preRequireCache = {
    engine: !!window.__novaCache['game/engine'],
    ai: !!window.__novaCache['game/ai'],
    render: !!window.__novaCache['game/render']
  };
  document.readyState='complete';
  if(withMenu && listeners.DOMContentLoaded) listeners.DOMContentLoaded();
  const requireGame = window.__novaMakeRequire('');
  const Game = requireGame('game/engine').Game;
  return {Game,window,requireGame,preRequireCache,menu,errors};
}

/* Research-only shipping-path acceptance. This verifies module ownership,
 * not visual feel, AI balance, frame pacing or phone performance. */
test('playable Game prototype receives authoritative Fair Engagement',()=>{
  const {Game}=bootModules();
  assert.equal(Game.prototype.__novaFairEngagement,true,
    'Fair Engagement engine hook must be installed, not just announced');
});
test('playable Game prototype receives Living Front ecology',()=>{
  const {Game}=bootModules();
  assert.equal(Game.prototype.__novaLivingFrontCore,true,
    'Living Front engine hook must be installed in the cached playable Game');
});
test('authoritative AI update composes Living Front outside the Fair Engagement gate',()=>{
  const {Game,requireGame}=bootModules();
  const ai=requireGame('game/ai');
  assert.equal(ai.updateAI.__novaLivingFront,true,
    'Living Front must be the final AI wrapper around the earlier fair gate');
  const g=new Game(canvas(),canvas(),{hud:noop,event:noop},'low');
  const player=g.player, bot=g.tanks.find(t=>t&&!t.isPlayer);
  assert.ok(player&&bot,'real match provides human and bot actors');
  player.x=1600;player.y=1600;player.spawnShieldT=0;
  bot.x=-1600;bot.y=-1600;bot.ai.__v1112TargetId=player.id;
  g.tanks=[bot,player];g.time=10;
  ai.updateAI(bot,g,1/60);
  assert.equal(bot.ai.__v1112TargetId,-1,
    'actual composed AI must reject a stale offscreen player target');
});
test('War Room never caches gameplay modules before late overlays register',()=>{
  const {window,preRequireCache}=bootModules();
  assert.equal(window.__NOVA_LOBBY_BATTLEFIELD_TEST__.canonicalRuntime,true);
  assert.deepEqual(preRequireCache,{engine:false,ai:false,render:false},
    'decorative menu must not instantiate canonical modules before the playable game');
});

test('decorative War Room mounts after parser completion with late gameplay owners',()=>{
  const {Game,window,menu,errors,preRequireCache}=bootModules(true);
  assert.deepEqual(preRequireCache,{engine:false,ai:false,render:false},
    'the parser must finish installing all overlays before the menu requires modules');
  assert.equal(Game.prototype.__novaFairEngagement,true);
  assert.equal(Game.prototype.__novaLivingFrontCore,true);
  assert.equal(menu.children.filter(n=>n.className==='nv-lobby-battlefield').length,1,
    'War Room mounts exactly one canonical background canvas');
  assert.equal(menu.children.filter(n=>n.className==='nv-lobby-atmosphere').length,1,
    'War Room mounts exactly one atmosphere layer');
  assert.deepEqual(errors.filter(e=>!e.includes('React hooks unavailable')),[],
    'menu initialization must not log unexpected engine errors');
});

for(const hz of [30,60,120,240]){
  test('late-bound real Game runs Living Front + Fair Engagement for four seconds at '+hz+' FPS',()=>{
    const {Game,window}=bootModules();
    const g=new Game(canvas(),canvas(),{hud:noop,event:noop,toast:noop,offer:noop,stick:noop,gameover:noop},'low');
    for(let i=0;i<hz*4;i++)g.update(1/hz);
    assert.equal(g.status,'playing');
    assert.ok(Math.abs(g.time-4)<1e-5);
    assert.equal(g.__lfState?.sectors?.length,16,'ecology must actually tick in playable game');
    assert.ok(g.__lfState.stats && Number.isFinite(g.__lfState.planMsEma));
    assert.ok(g.shapes.length>=100 && g.shapes.length<220,
      'neutral population stays bounded after ecological updates');
    assert.equal(Game.prototype.__novaFairEngagement,true);
    assert.equal(Game.prototype.__novaLivingFrontCore,true);
    assert.equal(window.__novaMakeRequire('')('game/ai').updateAI.__novaLivingFront,true);
  });
}

test('decorative War Room ecology cannot overwrite active playable-match diagnostics',()=>{
  const {Game,window}=bootModules();
  const callbacks={hud:noop,event:noop,toast:noop,offer:noop,stick:noop,gameover:noop};
  const decorative=new Game(canvas(),canvas(),callbacks,'low');
  decorative.__novaDecorativeWorld=true;
  for(let i=0;i<30;i++)decorative.update(1/60);
  assert.equal(window.NOVALivingFront.snapshot().active,false,
    'background menu combat is not an active player match');
  const playable=new Game(canvas(),canvas(),callbacks,'low');
  for(let i=0;i<30;i++)playable.update(1/60);
  const active=window.NOVALivingFront.snapshot();
  assert.equal(active.active,true);
  assert.equal(active.age,.5);
  for(let i=0;i<30;i++)decorative.update(1/60);
  assert.equal(window.NOVALivingFront.snapshot().age,active.age,
    'decorative updates cannot replace the active match snapshot');
});
