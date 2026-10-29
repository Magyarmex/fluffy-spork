'use strict';
// Exercise the exact shipping inline engine plus the HTML-ordered overlays.
// This intentionally uses a no-op canvas: it checks runtime composition and
// simulation crashes, not React boot, rendered pixels, or real-device FPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {createPublicRoam} = require('../research/redeploy-public-roam.cjs');
const {playPublicPrelude} = require('../research/redeploy-public-prelife.cjs');
const root = path.resolve(__dirname, '../..');
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = process.env.NOVA_COSMETIC_RNG_PATCHED==='1' ?
  require('../../scripts/patch-cosmetic-rng.cjs').patchCosmeticRng(sourceHtml) : sourceHtml;
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
  Object.defineProperty(game, '__testFair', {value: window.__NOVA_FAIR_ENGAGEMENT_TEST__});
  return game;
}



/* RESEARCH ONLY: A/B of the actual materialized Game. All arms share
 * identical seeds, input policy, dt, initial world and HTML overlay order.
 * No private world state is used to control the public-information pilot.
 * Three arms distinguish random-stream coupling from visual particle state.
 */
function withSeed(seed, fn) {
 let state=seed>>>0||1, draws=0;
 const oldRandom=Math.random, oldDate=Date.now;
 Math.random=()=>{
  draws++;
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
 Date.now=()=>0;
 try {return fn(()=>draws);}
 finally {Math.random=oldRandom;Date.now=oldDate;}
}
const digest = v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const bodies = a=>(a||[]).filter(Boolean).map(x=>[
 x.id,x.x,x.y,x.vx,x.vy,x.hp,x.alive,x.angle,x.fireCd,x.cls,x.type,x.ttl,x.dead
]);
function physicalState(g) {
 return {time:g.time,status:g.status,nextId:g.nextId,
  player:g.player&&[g.player.id,g.player.x,g.player.y,g.player.hp,g.player.alive,
   g.player.score,g.player.cls],
  tanks:bodies(g.tanks),shapes:bodies(g.shapes),drones:bodies(g.drones),
  bullets:bodies(g.bullets),powerups:bodies(g.powerups),
  terrain:bodies(g.__novaTerrain),
  neutralXP:Number(g.__lfState?.stats?.playerNeutralXP)||0};
}
function runArm(seed,hz,mode,seconds) {
 return withSeed(seed,readDraws=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive,'shipping game must start alive');
  const initial=digest(physicalState(g));
  const before=readDraws();
  let particleCalls=0,particlesRequested=0;
  const originalAdd=g.addParticles;
  if(mode!=='normal'){
   g.addParticles=function(x,y,color,n,speed,kind){
    particleCalls++;particlesRequested+=n;
    if(mode==='muted')return;
    originalAdd.apply(this,arguments);
    // Draws are preserved; only cosmetic state is erased.
    for(const p of this.parts)p.active=false;
   };
  }else{
   g.addParticles=function(x,y,color,n,speed,kind){
    particleCalls++;particlesRequested+=n;
    return originalAdd.apply(this,arguments);
   };
  }
  const prelude=playPublicPrelude(g,hz,seconds,g.__testFair,hz,readDraws);
  const trace=prelude.trace.map(({elapsed,x,y,hp,alive,score,
   enemyStateHash,neutralStateHash,projectileStateHash})=>
   ({elapsed,x,y,hp,alive,score,enemyStateHash,neutralStateHash,projectileStateHash}));
  return {seed,hz,mode,initial,draws:readDraws()-before,
   particleCalls,particlesRequested,
   finalPhysicalHash:digest(physicalState(g)),
   trace,summary:{elapsed:prelude.elapsed,naturalDeath:prelude.naturalDeath,
    hpAfter:prelude.hpAfter,scoreEarned:prelude.scoreEarned,
    neutralXPEarned:prelude.neutralXPEarned,
    changedShapes:prelude.changedShapes,changedEnemies:prelude.changedEnemies,
    changedTerrain:prelude.changedTerrain}};
 });
}
function firstDifference(a,b){
 for(let i=0;i<Math.min(a.trace.length,b.trace.length);i++)
  if(JSON.stringify(a.trace[i])!==JSON.stringify(b.trace[i]))
   return a.trace[i].elapsed;
 return a.finalPhysicalHash===b.finalPhysicalHash?null:'final-only';
}
test('cosmetic particle RNG causal A/B in shipping engine, 12 seeds x 30/60Hz',()=>{
 const seeds=[1517854,1517875,1517825,1517829,1517840,1517844,
  1517827,1517831,1517835,1517842,1517839,1517866];
 const seconds=8, results=[];
 for(const hz of [30,60])for(const seed of seeds){
  const normal=runArm(seed,hz,'normal',seconds);
  const muted=runArm(seed,hz,'muted',seconds);
  const erased=runArm(seed,hz,'erased',seconds);
  assert.equal(normal.initial,muted.initial,'A/B initial physical worlds must match');
  assert.equal(normal.initial,erased.initial,'visual-state control must share world');
  assert.ok(normal.particleCalls>0,'representative world must exercise particles');
  assert.equal(normal.particleCalls,erased.particleCalls,
   'erasing particles must preserve effect calls');
  assert.equal(normal.draws,erased.draws,
   'erasing particles must preserve the shared RNG draw stream');
  const mutedFirst=firstDifference(normal,muted);
  const erasedFirst=firstDifference(normal,erased);
  results.push({seed,hz,seconds,
   normal,muted,erased,
   mutedFirstGameplayDifference:mutedFirst,
   erasedFirstGameplayDifference:erasedFirst});
 }
 const dir=path.join(root,'artifacts','cosmetic-rng-causality');
 fs.mkdirSync(dir,{recursive:true});
 const compact=results.map(({seed,hz,seconds,normal,muted,erased,
  mutedFirstGameplayDifference,erasedFirstGameplayDifference})=>({
  seed,hz,seconds,initial:normal.initial,
  normal:{draws:normal.draws,particleCalls:normal.particleCalls,
   finalPhysicalHash:normal.finalPhysicalHash,summary:normal.summary,trace:normal.trace},
  muted:{draws:muted.draws,particleCalls:muted.particleCalls,
   finalPhysicalHash:muted.finalPhysicalHash,summary:muted.summary,trace:muted.trace},
  erased:{draws:erased.draws,particleCalls:erased.particleCalls,
   finalPhysicalHash:erased.finalPhysicalHash,summary:erased.summary,trace:erased.trace},
  mutedFirstGameplayDifference,erasedFirstGameplayDifference
 }));
 const summary={contract:'Causal intervention: mute only addParticles RNG; preserve particle-gate RNG. Erased control burns identical draws but clears VFX state. Not evidence of FPS-specific mortality.',
  seeds:seeds.length,frameRates:[30,60],seconds,
  scenarios:results.length,
  mutedGameplayDivergences:results.filter(r=>r.mutedFirstGameplayDifference!==null).length,
  erasedGameplayDivergences:results.filter(r=>r.erasedFirstGameplayDifference!==null).length,
  mutedRngDrawDifferences:results.filter(r=>r.normal.draws!==r.muted.draws).length,
  results:compact};
 fs.writeFileSync(path.join(dir,process.env.NOVA_COSMETIC_RNG_PATCHED==='1' ?
  'patched-results.json' : 'baseline-results.json'),JSON.stringify(summary,null,2));
 console.log('NOVA_COSMETIC_RNG_CAUSAL '+JSON.stringify({
  scenarios:summary.scenarios,
  mutedGameplayDivergences:summary.mutedGameplayDivergences,
  erasedGameplayDivergences:summary.erasedGameplayDivergences,
  mutedRngDrawDifferences:summary.mutedRngDrawDifferences,
  examples:compact.filter(r=>r.mutedFirstGameplayDifference!==null).slice(0,5)
   .map(r=>({seed:r.seed,hz:r.hz,first:r.mutedFirstGameplayDifference,
    drawsNormal:r.normal.draws,drawsMuted:r.muted.draws}))
 }));
 // This control is a real acceptance invariant: removing the visual state
 // while preserving RNG consumption must not alter the physical game.
 assert.equal(summary.erasedGameplayDivergences,0,
  'VFX state itself affects gameplay: investigate before changing RNG ownership');
 if(process.env.NOVA_COSMETIC_RNG_PATCHED==='1')
  assert.equal(summary.mutedGameplayDivergences,0,
   'cosmetic RNG still leaks into physical state after isolation');
 else assert.ok(summary.mutedGameplayDivergences>0,
   'baseline causal leak unexpectedly absent: review experiment validity');
});
