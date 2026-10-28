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


/* Pilot, not a claim about human skill or fun. All movement commands use
 * only the remembered death position and physical route waypoints; neither
 * enemy coordinates nor private ecological state steer the pilot. The
 * analysis may inspect those values only after each simulated step. */
function withSeed(seed,fn){
 let state=seed>>>0||1;
 const priorRandom=Math.random,priorDate=Date.now;
 Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 Date.now=()=>0;
 try{return fn();}finally{Math.random=priorRandom;Date.now=priorDate;}
}
function finitePosition(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y);}
function run(seed,choice,hz,seconds){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive,'real materialized Game has a live Scout');
  const origin={x:g.player.x,y:g.player.y};
  assert.ok(finitePosition(origin),'death origin is finite');
  const layout=g.__novaBattlefield.name,initialShapes=g.shapes.length;
  /* Verify matched *physical worlds*, not just the same map label. */
  const fingerprint=JSON.stringify({
   layout,
   terrain:(g.__novaTerrain||[]).map(t=>[t.id,t.type,t.x,t.y,t.w,t.h,t.r,t.hp]),
   shapes:g.shapes.map(t=>[t.id,t.type,t.x,t.y,t.hp]),
   rivals:(g.tanks||[]).filter(t=>t.ai).map(t=>[t.id,t.cls,t.x,t.y,t.hp]),
   origin
  });
  g.killTank(g.player,null);
  assert.equal(g.__novaRedeployChoice,'fresh','each death defaults to FRESH');
  g.__novaRedeployChoice=choice;
  g.redeploy();
  assert.equal(g.status,'playing');
  assert.equal(g.__novaRedeployChoice,'fresh','choice cannot leak across lives');
  assert.ok(g.isTerrainSafe(g.player.x,g.player.y,75),'real spawn must be terrain safe');
  const p=g.player,spawn={x:p.x,y:p.y};
  const startDistance=Math.hypot(p.x-origin.x,p.y-origin.y);
  if(choice==='return')assert.ok(startDistance>=420-1e-6&&startDistance<=850+1e-6,
   'RETURN must actually use the intended geographic sampler');
  let routeRequests=0,routeWaypoints=0,frontReached=null,firstVisibleEnemy=null;
  let distanceTravelled=0,last={x:p.x,y:p.y};
  g.input.mouseActive=false;g.input.autofire=false;g.input.firing=false;
  g.input.moveVec=()=>{
   const dx=origin.x-p.x,dy=origin.y-p.y,d=Math.hypot(dx,dy);
   if(d<=130)return{x:0,y:0};
   let target=origin;
   if(typeof g.hasLineOfSight==='function'&&!g.hasLineOfSight(p.x,p.y,origin.x,origin.y,24)&&
      typeof g.novaBattlefieldWaypoint==='function'){
    routeRequests++;
    const waypoint=g.novaBattlefieldWaypoint(p.x,p.y,origin.x,origin.y,24,p.id);
    if(finitePosition(waypoint)&&Math.hypot(waypoint.x-p.x,waypoint.y-p.y)>5){
     target=waypoint;routeWaypoints++;
    }
   }
   const tx=target.x-p.x,ty=target.y-p.y,len=Math.hypot(tx,ty);
   return len>1?{x:tx/len,y:ty/len}:{x:0,y:0};
  };
  g.input.aimVec=()=>({x:1,y:0});
  const steps=Math.ceil(seconds*hz),dt=1/hz;
  for(let i=0;i<steps&&g.status==='playing';i++){
   g.update(dt);
   if(!p.alive)break;
   const dist=Math.hypot(p.x-origin.x,p.y-origin.y);
   distanceTravelled+=Math.hypot(p.x-last.x,p.y-last.y);
   last={x:p.x,y:p.y};
   if(frontReached===null&&dist<=130)frontReached=g.time;
   if(firstVisibleEnemy===null){
    // Observation only, not an input to the scripted player's movement.
    const visible=g.tanks.some(t=>t&&t!==p&&t.alive&&t.ai&&
     Math.hypot(t.x-p.x,t.y-p.y)<600&&
     (!g.hasLineOfSight||g.hasLineOfSight(p.x,p.y,t.x,t.y,2)));
    if(visible)firstVisibleEnemy=g.time;
   }
  }
  return{seed,choice,hz,layout,initialShapes,fingerprint,origin,spawn,
   startDistance:+startDistance.toFixed(2),
   endDistance:+Math.hypot(p.x-origin.x,p.y-origin.y).toFixed(2),
   travelled:+distanceTravelled.toFixed(2),
   frontReached:frontReached===null?null:+frontReached.toFixed(3),
   firstVisibleEnemy:firstVisibleEnemy===null?null:+firstVisibleEnemy.toFixed(3),
   hp:+p.hp.toFixed(2),alive:!!p.alive,status:g.status,
   routeRequests,routeWaypoints,time:+g.time.toFixed(3)};
 });
}
function comparable(a,b){
 return JSON.stringify(a)===JSON.stringify(b);
}
test('FRESH/RETURN real-engine matched pilot is deterministic under counterbalanced arm order',()=>{
 const report=[];
 for(const hz of [30,60]){
  for(const seed of [0x172901,0x172902,0x172903]){
   const fresh=run(seed,'fresh',hz,2);
   const returning=run(seed,'return',hz,2);
   const returningFirst=run(seed,'return',hz,2);
   const freshSecond=run(seed,'fresh',hz,2);
   assert.ok(comparable(fresh,freshSecond),
    'FRESH must be order-independent: '+JSON.stringify({fresh,freshSecond}));
   assert.ok(comparable(returning,returningFirst),
    'RETURN must be order-independent: '+JSON.stringify({returning,returningFirst}));
   assert.equal(fresh.layout,returning.layout,'both arms must share the physical map');
   assert.deepEqual(fresh.origin,returning.origin,'both arms share a witnessed death position');
   assert.equal(fresh.initialShapes,returning.initialShapes,'same pre-death ecology count');
   assert.equal(fresh.fingerprint,returning.fingerprint,'same pre-death physical terrain, neutral and AI world');
   assert.ok(fresh.time>0&&returning.time>0,'both arms run real composed Game.update');
   report.push({seed,hz,layout:fresh.layout,fresh,returning});
  }
 }
 console.log('NOVA_REDEPLOY_REAL_PAIRED_PILOT '+JSON.stringify(report));
});
