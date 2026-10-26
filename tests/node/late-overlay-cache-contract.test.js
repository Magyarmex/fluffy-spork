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
function bootModules(withMenu=false,forceEarlyCache=false) {
  const errors = [];
  const store = new Map(), listeners = {}, rafCallbacks=[];
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
    querySelector: selector => selector==='#root .menu-grid-bg'?menu:null,
    querySelectorAll: () => [],
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
    clearInterval: noop, requestAnimationFrame: fn => {rafCallbacks.push(fn);return rafCallbacks.length;},
    cancelAnimationFrame: noop, Image: class {}, Audio: class {},
    URL, Blob, TextEncoder, TextDecoder});
  vm.runInContext(inline, context, {filename: 'index.html#canonical-engine', timeout: 12000});
  for (const script of overlays) {
    vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), context,
      {filename: script, timeout: 5000});
    if(forceEarlyCache && script==='nova-updates/lobby-battlefield-v1.10.10.js'){
      const req=window.__novaMakeRequire('lobby-battlefield-v11010');
      for(const spec of ['./game/engine','./game/classes','./game/ai','./game/render'])
        req(spec);
    }
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
  return {Game,window,requireGame,preRequireCache,menu,errors,rafCallbacks};
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

test('actual decorative War Room advances two seconds without hijacking playable ecology',()=>{
  const {menu,window,errors,rafCallbacks}=bootModules(true);
  assert.equal(menu.children.filter(n=>n.className==='nv-lobby-battlefield').length,1);
  let ts=100;
  for(let i=0;i<28;i++){
    const next=rafCallbacks.shift();
    assert.equal(typeof next,'function','live War Room schedules its next frame');
    next(ts);ts+=80;
  }
  assert.equal(window.NOVALivingFront.snapshot().active,false,
    'menu simulation must never impersonate the active playable match');
  assert.deepEqual(errors.filter(e=>!e.includes('React hooks unavailable')),[],
    'two seconds of real decorative combat must not produce engine errors');
});

test('differential audit: premature cache vs late binding in four seconds of real combat',()=>{
  const baseline=bootModules(false,true), candidate=bootModules();
  assert.equal(baseline.Game.prototype.__novaLivingFrontCore,undefined,
    'emulated current production cache bypasses the Living Front owner');
  assert.equal(baseline.Game.prototype.__novaFairEngagement,undefined,
    'emulated current production cache bypasses the Fair Engagement owner');
  assert.equal(candidate.Game.prototype.__novaLivingFrontCore,true);
  assert.equal(candidate.Game.prototype.__novaFairEngagement,true);
  function sample(boot){
    const g=new boot.Game(canvas(),canvas(),{hud:noop,event:noop,toast:noop,offer:noop,stick:noop,gameover:noop},'low');
    const durations=[];
    for(let i=0;i<240;i++){
      const t0=performance.now();g.update(1/60);
      durations.push(performance.now()-t0);
    }
    durations.sort((a,b)=>a-b);
    return {tanks:g.tanks.length,shapes:g.shapes.length,
      ecology:!!g.__lfState,meanMs:+(durations.reduce((a,b)=>a+b,0)/durations.length).toFixed(3),
      p95Ms:+durations[Math.floor(durations.length*.95)].toFixed(3),
      peakMs:+durations[durations.length-1].toFixed(3)};
  }
  const old=sample(baseline), now=sample(candidate);
  console.info('NOVA_LATE_BIND_DIFFERENTIAL '+JSON.stringify({baseline:old,candidate:now}));
  assert.equal(old.ecology,false);
  assert.equal(now.ecology,true);
  assert.equal(now.tanks>0,true);
  assert.ok(now.shapes>=100&&now.shapes<220);
});

test('late-bound materialized render/audio owners are actually installed',()=>{
  const {requireGame,Game}=bootModules();
  const render=requireGame('game/render'),audio=requireGame('game/audio');
  assert.equal(render.render.__novaLivingFront,true,
    'Crasher commitment and other ecology VFX must reach the real renderer');
  assert.equal(audio.Sfx.prototype.__novaLivingFrontAudio,true,
    'Crasher commitment sound hooks must reach the real audio class');
  assert.equal(Game.prototype.__novaLivingFrontCore,true);
});

for(const hz of [30,120]){
  test('late-bound Controller, ecology and Fair Engagement survive twelve-second combat at '+hz+' FPS',()=>{
    const {Game}=bootModules();
    const g=new Game(canvas(),canvas(),{hud:noop,event:noop,toast:noop,offer:noop,stick:noop,gameover:noop},'low');
    g.setClass(g.player,'warden');
    g.player.hp=1e6;g.player.maxHp=1e6;g.player.spawnShieldT=1e6;
    g.input.aim.active=true;g.input.aim.dx=80;g.input.aim.dy=0;
    g.input.keyboard.right=true;g.input.firing=true;
    for(let i=0;i<12*hz;i++){
      g.update(1/hz);
      if(i%hz===0){
        for(const e of [...g.tanks,...g.shapes,...g.drones]){
          assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.y),
            'all physical entities retain finite world coordinates');
        }
        assert.ok(g.shapes.length<220,'ecology must not grow an unbounded neutral population');
      }
    }
    assert.equal(g.status,'playing');
    assert.equal(g.__lfState.sectors.length,16);
    assert.ok(g.drones.some(d=>d.ownerId===g.player.id),
      'the real Controller drone owner still spawns allied drones');
    assert.ok(g.__lfState.age>=11,'ecology sector simulation actually advances');
  });
}

test('fair no-target flee never dereferences a hidden player or leaks a temporary nearest owner',()=>{
  const {Game,requireGame}=bootModules();
  const ai=requireGame('game/ai');
  const g=new Game(canvas(),canvas(),{hud:noop,event:noop},'low');
  const human=g.player,bot=g.tanks.find(t=>t&&!t.isPlayer);
  assert.ok(bot);
  g.tanks=[bot];g.time=10;
  human.x=1900;human.y=1900;
  bot.x=-1900;bot.y=-1900;
  bot.ai.state='flee';bot.ai.thinkT=1;bot.ai.__v1112TargetId=-1;
  let fleeQueries=0;
  const originalNearest=g.nearestTank;
  g.nearestTank=function(x,y,max,exclude){
    if(max===900&&exclude===bot.id)fleeQueries++;
    return originalNearest.apply(this,arguments);
  };
  const nearest=g.nearestTank,player=g.player;
  assert.doesNotThrow(()=>ai.updateAI(bot,g,1/60),
    'a legitimate low-health flee with no perceived opponent must not crash');
  assert.ok(fleeQueries>0,'the test must exercise the exact legacy flee query');
  assert.equal(g.nearestTank,nearest,'temporary flee fallback is fully restored');
  assert.equal(g.player,player,'actual human handle is fully restored');
  assert.equal(bot.ai.__v1112TargetId,-1,'no hidden player target is introduced');
  assert.ok(Number.isFinite(bot.x)&&Number.isFinite(bot.y));
});

test('fair flee keeps a genuinely visible human threat authoritative',()=>{
  const {Game,requireGame}=bootModules();
  const ai=requireGame('game/ai');
  const g=new Game(canvas(),canvas(),{hud:noop,event:noop},'low');
  const human=g.player,bot=g.tanks.find(t=>t&&!t.isPlayer);
  assert.ok(bot);
  g.tanks=[bot,human];g.time=10;g.cam.zoom=1;g.w=800;g.h=600;
  bot.x=0;bot.y=0;human.x=90;human.y=0;human.spawnShieldT=0;
  bot.ai.state='flee';bot.ai.thinkT=1;bot.ai.__v1112TargetId=human.id;
  const originalNearest=g.nearestTank;
  g.nearestTank=function(x,y,max,exclude){
    if(max===900&&exclude===bot.id)return human;
    return originalNearest.apply(this,arguments);
  };
  const nearest=g.nearestTank;
  assert.doesNotThrow(()=>ai.updateAI(bot,g,1/60));
  assert.equal(bot.ai.__v1112TargetId,human.id,
    'a legitimately visible human remains the actual fair target');
  assert.equal(g.nearestTank,nearest);
  assert.equal(g.player,human);
});

test('fair AI exception restores tank visibility and nearestTank ownership atomically',()=>{
  const {Game,requireGame}=bootModules();
  const ai=requireGame('game/ai');
  const g=new Game(canvas(),canvas(),{hud:noop,event:noop},'low');
  const bot=g.tanks.find(t=>t&&!t.isPlayer);
  assert.ok(bot);
  g.tanks=[bot];g.time=10;
  bot.ai.state='flee';bot.ai.thinkT=1;bot.ai.__v1112TargetId=-1;
  const originalTanks=g.tanks,originalPlayer=g.player,originalNearest=g.nearestTank;
  g.moveTank=()=>{throw new Error('injected movement failure');};
  assert.throws(()=>ai.updateAI(bot,g,1/60),/injected movement failure/);
  assert.equal(g.tanks,originalTanks,'AI target list must restore after an exception');
  assert.equal(g.player,originalPlayer,'human handle must restore after an exception');
  assert.equal(g.nearestTank,originalNearest,'nearestTank owner must restore after an exception');
});
