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
const html = process.env.NOVA_AUDIO_RNG_PATCHED==='1' ?
 require('../../scripts/patch-audio-rng.cjs').patchAudioRng(sourceHtml) : sourceHtml;
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
  Object.defineProperty(game,'__testWindow',{value:window});
  return game;
}




/* Research only. Force the canonical Sfx.ensure noise-buffer initialization
 * at the SAME point after a matched physical Game boot. Three arms isolate
 * its 22,050 shared random draws from the audio buffer's visual analogue:
 * the sound waveform data itself. All arms then mute audio for identical
 * gameplay/input; no audio implementation or production code is changed.
 */
class FakeAudioContext {
 constructor(){this.sampleRate=44100;this.currentTime=0;this.state='running';this.destination={};}
 createGain(){return {gain:{value:0,cancelScheduledValues(){},setTargetAtTime(){},
  setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
 createBuffer(_channels,length){const data=new Float32Array(Math.ceil(length));
  return {getChannelData:()=>data};}
 resume(){this.state='running';}
}
function withSeed(seed,fn){
 let state=seed>>>0||1,draws=0;
 const old=Math.random,oldDate=Date.now;
 Math.random=()=>{draws++;state^=state<<13;state^=state>>>17;state^=state<<5;
  return(state>>>0)/4294967296;};
 Date.now=()=>0;
 try{return fn(()=>draws);}finally{Math.random=old;Date.now=oldDate;}
}
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const bodies=a=>(a||[]).filter(Boolean).map(x=>[x.id,x.x,x.y,x.hp,x.alive,x.angle,x.vx,x.vy,x.ttl,x.dead]);
function physical(g){return {time:g.time,status:g.status,nextId:g.nextId,
 player:g.player&&[g.player.id,g.player.x,g.player.y,g.player.hp,g.player.score],
 tanks:bodies(g.tanks),shapes:bodies(g.shapes),drones:bodies(g.drones),
 bullets:bodies(g.bullets),powerups:bodies(g.powerups),terrain:bodies(g.__novaTerrain),
 neutralXP:Number(g.__lfState?.stats?.playerNeutralXP)||0};}
function arm(seed,hz,mode){
 return withSeed(seed,draws=>{
  const g=bootGame();if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive);
  const initial=digest(physical(g)),before=draws();
  let audioSamples=0;
  if(mode!=='off'){
   g.__testWindow.AudioContext=FakeAudioContext;
   g.sfx.ensure();
   assert.ok(g.sfx.noiseBuf,'actual Sfx.ensure must create a noise buffer');
   const data=g.sfx.noiseBuf.getChannelData(0);
   audioSamples=data.length;
   assert.equal(audioSamples,22050,'canonical 0.5s at 44.1kHz');
   if(mode==='erased')data.fill(0);
  }
  // No audio output is permitted in any arm after the intervention.
  g.sfx.muted=true;
  const interventionDraws=draws()-before;
  const prelude=playPublicPrelude(g,hz,5,g.__testFair,hz,draws);
  const trace=prelude.trace.map(({elapsed,x,y,hp,alive,score,
   enemyStateHash,neutralStateHash,projectileStateHash})=>
   ({elapsed,x,y,hp,alive,score,enemyStateHash,neutralStateHash,projectileStateHash}));
  return {seed,hz,mode,initial,audioSamples,interventionDraws,
   totalDraws:draws()-before,trace,finalHash:digest(physical(g)),
   summary:{elapsed:prelude.elapsed,naturalDeath:prelude.naturalDeath,
    hpAfter:prelude.hpAfter,scoreEarned:prelude.scoreEarned,
    neutralXPEarned:prelude.neutralXPEarned}};
 });
}
function firstDifference(a,b){
 for(let i=0;i<Math.min(a.trace.length,b.trace.length);i++)
  if(JSON.stringify(a.trace[i])!==JSON.stringify(b.trace[i]))return a.trace[i].elapsed;
 return a.finalHash===b.finalHash?null:'final-only';
}
if (!process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL) test('canonical audio noise-buffer RNG causal A/B in 12 seeds at 30/60Hz',()=>{
 const seeds=[1517854,1517875,1517825,1517829,1517840,1517844,
  1517827,1517831,1517835,1517842,1517839,1517866];
 const results=[];
 for(const hz of [30,60])for(const seed of seeds){
  const off=arm(seed,hz,'off'),enabled=arm(seed,hz,'enabled'),
   erased=arm(seed,hz,'erased');
  assert.equal(off.initial,enabled.initial);
  assert.equal(off.initial,erased.initial);
  const expectedSharedDraws=process.env.NOVA_AUDIO_RNG_PATCHED==='1'?0:22050;
  assert.equal(enabled.interventionDraws,expectedSharedDraws);
  assert.equal(erased.interventionDraws,expectedSharedDraws);
  assert.equal(off.interventionDraws,0);
  const audioFirst=firstDifference(off,enabled);
  const erasedFirst=firstDifference(enabled,erased);
  results.push({seed,hz,off,enabled,erased,audioFirst,erasedFirst});
 }
 const summary={contract:'research-only causal intervention: Sfx.ensure at fixed post-boot point; erase audio waveform after burning same RNG; all subsequent SFX muted; not a real-device sound test',
  independentSeeds:seeds.length,frameRates:[30,60],seconds:5,
  scenarios:results.length,
  audioGameplayDivergences:results.filter(r=>r.audioFirst!==null).length,
  erasedGameplayDivergences:results.filter(r=>r.erasedFirst!==null).length,
  results};
 const dir=path.join(root,'artifacts','audio-rng-causality');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,process.env.NOVA_AUDIO_RNG_PATCHED==='1' ?
 'patched-results.json' : 'baseline-results.json'),JSON.stringify(summary,null,2));
 console.log('NOVA_AUDIO_RNG_CAUSAL '+JSON.stringify({
  scenarios:summary.scenarios,
  audioGameplayDivergences:summary.audioGameplayDivergences,
  erasedGameplayDivergences:summary.erasedGameplayDivergences,
  examples:results.filter(r=>r.audioFirst!==null).slice(0,4)
   .map(r=>({seed:r.seed,hz:r.hz,first:r.audioFirst,
    enabledDraws:r.enabled.totalDraws,offDraws:r.off.totalDraws}))
 }));
 assert.equal(summary.erasedGameplayDivergences,0,
  'audio waveform contents unexpectedly influence physical state');
 if(process.env.NOVA_AUDIO_RNG_PATCHED==='1')
  assert.equal(summary.audioGameplayDivergences,0,
   'audio noise RNG still perturbs gameplay after isolation');
 else assert.ok(summary.audioGameplayDivergences>0,
   'baseline audio RNG leak unexpectedly absent');
});

// Shared real-game fixture for the independent overlay-audio causal pilot.
module.exports={bootGame,FakeAudioContext,withSeed,digest,physical,firstDifference,playPublicPrelude};
