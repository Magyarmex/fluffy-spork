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
  Object.defineProperty(game, '__testFair', {value: window.__NOVA_FAIR_ENGAGEMENT_TEST__});
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
function run(seed,choice,hz,seconds,policy='navigate',preludeSeconds=0){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive,'real materialized Game has a live Scout');
  const prelude=preludeSeconds>0?playPublicPrelude(g,hz,preludeSeconds,g.__testFair):null;
  const origin={x:g.player.x,y:g.player.y};
  assert.ok(finitePosition(origin),'death origin is finite');
  if(prelude)assert.deepEqual(prelude.origin,origin,'death location is witnessed after actual play');
  const layout=g.__novaBattlefield.name,initialShapes=g.shapes.length;
  const terrainSeed=g.__novaBattlefield.seed>>>0,rotation=(terrainSeed>>>3)%4,
   mirrored=!!((terrainSeed>>>5)&1);
  /* Verify matched *physical worlds*, not just the same map label. */
  const fingerprint=JSON.stringify({
   layout,
   terrain:(g.__novaTerrain||[]).map(t=>[t.id,t.type,t.x,t.y,t.w,t.h,t.r,t.hp]),
   shapes:g.shapes.map(t=>[t.id,t.type,t.x,t.y,t.hp]),
   rivals:(g.tanks||[]).filter(t=>t.ai).map(t=>[t.id,t.cls,t.x,t.y,t.hp]),
   origin
  });
  if(g.player.alive)g.killTank(g.player,null);
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
  let routeRequests=0,routeWaypoints=0,frontReached=null,firstVisibleEnemy=null,
   firstVisibleNeutral=null;
  let distanceTravelled=0,postFrontTravelled=0,last={x:p.x,y:p.y};
  let neutralXPAtFront=null,firstNeutralXP=null;
  const fair=g.__testFair;
  if(policy!=='navigate')assert.ok(fair&&fair.viewportHalfExtents,'Fair Engagement must be present');
  const roaming=policy==='harvest_roam'?createPublicRoam(g,p,origin,fair):null;
  g.input.mouseActive=false;g.input.autofire=policy!=='navigate';g.input.firing=false;
  g.input.moveVec=()=>{
   if(roaming&&frontReached!==null)return roaming.move();
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
  /* A public-information harvesting policy may aim only at neutrals inside
   * both the player's Fair Engagement viewport and the rendered camera,
   * with physical terrain line-of-sight. No sector maturity, off-screen
   * shapes, bot positions or hidden rewards steer the firing decision. */
  g.input.aimVec=()=>{
   if(roaming)return roaming.aim();
   if(policy!=='harvest')return{x:1,y:0};
   const ext=fair.viewportHalfExtents(g),cam=g.cam||{},cx=Number.isFinite(cam.x)?cam.x:p.x,
    cy=Number.isFinite(cam.y)?cam.y:p.y;
   if(!ext||!(ext.x>0)||!(ext.y>0))return null;
   let best=null,bd=Infinity;
   for(const shape of g.shapes){
    if(!shape||!(shape.hp>0)||Math.abs(shape.x-p.x)>ext.x||
       Math.abs(shape.y-p.y)>ext.y||Math.abs(shape.x-cx)>ext.x||
       Math.abs(shape.y-cy)>ext.y)continue;
    const d=Math.hypot(shape.x-p.x,shape.y-p.y);
    if(!(d>1)||d>=bd||!g.hasLineOfSight(p.x,p.y,shape.x,shape.y,2))continue;
    best=shape;bd=d;
   }
   return best?{x:(best.x-p.x)/bd,y:(best.y-p.y)/bd}:null;
  };
  const steps=Math.ceil(seconds*hz),dt=1/hz;
  for(let i=0;i<steps&&g.status==='playing';i++){
   g.update(dt);
   if(!p.alive)break;
   const dist=Math.hypot(p.x-origin.x,p.y-origin.y);
   const stepTravel=Math.hypot(p.x-last.x,p.y-last.y);
   distanceTravelled+=stepTravel;
   if(frontReached!==null)postFrontTravelled+=stepTravel;
   last={x:p.x,y:p.y};
   if(frontReached===null&&dist<=130){
    frontReached=g.time;
    neutralXPAtFront=Number(g.__lfState?.stats?.playerNeutralXP)||0;
   }
   if(firstNeutralXP===null&&(Number(g.__lfState?.stats?.playerNeutralXP)||0)>0)
    firstNeutralXP=g.time;
   if(firstVisibleNeutral===null){
    const seen=g.shapes.some(t=>t&&t.hp>0&&
     Math.hypot(t.x-p.x,t.y-p.y)<250&&
     (!g.hasLineOfSight||g.hasLineOfSight(p.x,p.y,t.x,t.y,2)));
    if(seen)firstVisibleNeutral=g.time;
   }
   if(firstVisibleEnemy===null){
    // Observation only, not an input to the scripted player's movement.
    const visible=g.tanks.some(t=>t&&t!==p&&t.alive&&t.ai&&
     Math.hypot(t.x-p.x,t.y-p.y)<600&&
     (!g.hasLineOfSight||g.hasLineOfSight(p.x,p.y,t.x,t.y,2)));
    if(visible)firstVisibleEnemy=g.time;
   }
  }
  return{seed,choice,hz,policy,prelude,layout,rotation,mirrored,initialShapes,
   fingerprint,fingerprintHash:crypto.createHash('sha256').update(fingerprint).digest('hex'),origin,spawn,
   startDistance:+startDistance.toFixed(2),
   endDistance:+Math.hypot(p.x-origin.x,p.y-origin.y).toFixed(2),
   travelled:+distanceTravelled.toFixed(2),
   postFrontTravelled:+postFrontTravelled.toFixed(2),
   postFrontSeconds:frontReached===null?null:+Math.max(0,g.time-frontReached).toFixed(3),
   postFrontNeutralXP:frontReached===null?null:+Math.max(0,(Number(g.__lfState?.stats?.playerNeutralXP)||0)-neutralXPAtFront).toFixed(2),
   firstNeutralXP:firstNeutralXP===null?null:+firstNeutralXP.toFixed(3),
   frontReached:frontReached===null?null:+frontReached.toFixed(3),
   firstVisibleEnemy:firstVisibleEnemy===null?null:+firstVisibleEnemy.toFixed(3),
   firstVisibleNeutral:firstVisibleNeutral===null?null:+firstVisibleNeutral.toFixed(3),
   hp:+p.hp.toFixed(2),alive:!!p.alive,status:g.status,
   score:+(Number(p.score)||0).toFixed(2),xp:+(Number(p.xp)||0).toFixed(2),
   kills:p.kills,level:p.level,
   neutralXP:+(Number(g.__lfState?.stats?.playerNeutralXP)||0).toFixed(2),
   routeRequests:routeRequests+(roaming?roaming.stats().routeRequests:0),
   routeWaypoints:routeWaypoints+(roaming?roaming.stats().routeWaypoints:0),
   roaming:roaming?roaming.stats():null,time:+g.time.toFixed(3)};
 });
}
function comparable(a,b){
 return JSON.stringify(a)===JSON.stringify(b);
}

const FULL_SEEDS=[
 1517854,1517875,1517879,1517881,1517885,1517906,
 1517825,1517829,1517856,1517860,1517895,1517899,
 1517840,1517844,1517883,1517887,1517903,1517910,
 1517827,1517831,1517833,1517837,1517858,1517862,
 1517835,1517842,1517846,1517848,1517852,1517873,
 1517839,1517866,1517870,1517880,1517891,1517893
];
test('real composed RETURN pilot keeps moving after reaching the remembered front',()=>{
 const r=run(1517825,'return',30,8,'harvest_roam');
 assert.ok(r.frontReached!==null&&r.frontReached<6,'seed must reach front while alive');
 assert.ok(r.postFrontTravelled>20,'roaming policy must move in the real Game.update path');
 assert.ok(r.roaming&&r.roaming.patrolIndex>=0,'roaming policy must be exercised');
 assert.ok(r.postFrontSeconds>0,'post-front exposure must be recorded');
});

test('pre-death public combat changes the witnessed world without introducing arm-order bias',()=>{
 const a=run(1517825,'fresh',30,2,'harvest_roam',3);
 const b=run(1517825,'return',30,2,'harvest_roam',3);
 assert.ok(a.prelude&&a.prelude.ticks>0&&a.prelude.elapsed>0);
 assert.deepEqual(a.prelude,b.prelude,'both choices inherit exactly the same played first life');
 assert.equal(a.fingerprintHash,b.fingerprintHash,'the actual post-play world is matched');
 assert.deepEqual(a.origin,a.prelude.origin);
 assert.ok(Number.isFinite(a.prelude.travelled));
});

test('FRESH/RETURN real-engine matched pilot is deterministic under counterbalanced arm order',()=>{
 const full=process.env.NOVA_REDEPLOY_FULL_PILOT==='1';
 const policy=process.env.NOVA_REDEPLOY_POLICY||'navigate';
 assert.ok(['navigate','harvest','harvest_roam'].includes(policy),'explicitly supported public policy');
 const report=[],seeds=full?FULL_SEEDS:[0x172901,0x172902,0x172903];
 const seconds=full?20:2,preludeSeconds=Number(process.env.NOVA_REDEPLOY_PRELIFE_SECONDS||0),seen=new Set();
 assert.ok(Number.isFinite(preludeSeconds)&&preludeSeconds>=0&&preludeSeconds<=30,
  'pre-death simulation must be explicitly bounded');
 for(const hz of [30,60]){
  for(let i=0;i<seeds.length;i++){
   const seed=seeds[i],fresh=run(seed,'fresh',hz,seconds,policy,preludeSeconds);
   const returning=run(seed,'return',hz,seconds,policy,preludeSeconds);
   /* Full experiment counterbalances a representative of each map/rotation
    * cell. The ordinary CI smoke counterbalances every case. */
   if(!full||i%6===0){
    const returningFirst=run(seed,'return',hz,seconds,policy,preludeSeconds);
    const freshSecond=run(seed,'fresh',hz,seconds,policy,preludeSeconds);
    assert.ok(comparable(fresh,freshSecond),
     'FRESH must be order-independent: '+JSON.stringify({fresh,freshSecond}));
    assert.ok(comparable(returning,returningFirst),
     'RETURN must be order-independent: '+JSON.stringify({returning,returningFirst}));
   }
   assert.equal(fresh.layout,returning.layout,'both arms must share the physical map');
   assert.equal(fresh.rotation,returning.rotation,'both arms must share map rotation');
   assert.deepEqual(fresh.origin,returning.origin,'both arms share a witnessed death position');
   assert.equal(fresh.initialShapes,returning.initialShapes,'same pre-death ecology count');
   assert.equal(fresh.fingerprint,returning.fingerprint,
    'same pre-death physical terrain, neutral and AI world');
   if(preludeSeconds>0){
    assert.ok(fresh.prelude&&fresh.prelude.ticks>0,'actual pre-death Game.update must run');
    assert.deepEqual(fresh.prelude,returning.prelude,'matched first-life play before either choice');
   }
   assert.ok(fresh.time>0&&returning.time>0,'both arms run real composed Game.update');
   seen.add(fresh.layout+'/'+fresh.rotation);
   const compact=x=>{const {fingerprint,...rest}=x;return rest;};
   report.push({seed,hz,layout:fresh.layout,rotation:fresh.rotation,
    mirrored:fresh.mirrored,fresh:compact(fresh),returning:compact(returning)});
  }
 }
 if(full){
  assert.equal(report.length,72,'36 matched worlds at two frame rates; each contains two policies');
  assert.equal(seen.size,6,'all three maps and two rotations must be exercised');
  const dir=path.join(root,'artifacts','redeploy-pilot');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'results-'+policy+'.json'),JSON.stringify({
   contract:'total-policy effect, not isolated geography or human skill',
   policyNote:policy==='harvest_roam'?'public-only neutral approach and terrain-aware patrol AFTER reaching remembered front':'original baseline; harvest stops moving at remembered front',
   policy,seconds,preludeSeconds,worlds:36,frameRates:[30,60],counterbalancedPerHz:6,
   layouts:[...seen].sort(),results:report
  },null,2));
 }
 const avg=(key,mode)=>report.reduce((sum,r)=>sum+r[mode][key],0)/report.length;
 console.log('NOVA_REDEPLOY_REAL_PAIRED_PILOT '+JSON.stringify({
  full,policy,preludeSeconds,worlds:seeds.length,seconds,scenarios:report.length,
  layouts:[...seen].sort(),
  meanStartDistance:{fresh:+avg('startDistance','fresh').toFixed(2),
   return:+avg('startDistance','returning').toFixed(2)},
  reachedFront:{fresh:report.filter(r=>r.fresh.frontReached!==null).length,
   return:report.filter(r=>r.returning.frontReached!==null).length},
  visibleEnemy:{fresh:report.filter(r=>r.fresh.firstVisibleEnemy!==null).length,
   return:report.filter(r=>r.returning.firstVisibleEnemy!==null).length},
  alive:{fresh:report.filter(r=>r.fresh.alive).length,
   return:report.filter(r=>r.returning.alive).length},
  meanNeutralXP:{fresh:+avg('neutralXP','fresh').toFixed(2),
   return:+avg('neutralXP','returning').toFixed(2)},
  meanScore:{fresh:+avg('score','fresh').toFixed(2),
   return:+avg('score','returning').toFixed(2)}
 }));
});
