'use strict';
/* Regression for #633: drawing the real composed game must not mutate
 * simulation state, reorder AI iteration or consume gameplay randomness.
 * This exercises the shipping render and minimap, not a replacement renderer. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const SEEDS=[1517800,1517802,1517810,1517814,1517820,1517825];
const CLOCKS=[30,60,120];
function simulationSnapshot(g){
 return digest({
  physical:physical(g),
  tankOrder:g.tanks.map(t=>t.id),
  tankAI:g.tanks.map(t=>({id:t.id,ai:t.ai||null,cls:t.cls,spawnShieldT:t.spawnShieldT})),
  droneOrder:(g.drones||[]).map(d=>d.id),
  shapeOrder:(g.shapes||[]).map(s=>s.id),
  bulletOrder:(g.bullets||[]).map(b=>b.id),
  player:g.player&&{id:g.player.id,angle:g.player.angle,cls:g.player.cls,
   level:g.player.level,exp:g.player.exp},
  worldTime:g.time,paused:g.paused,status:g.status,nextId:g.nextId
 });
}
function probe(seed,renderHz){return withSeed(seed,draws=>{
 const g=bootGame(),render=g.__testWindow.__novaMakeRequire('')('game/render').render;
 assert.equal(g.__novaSimulationTankOrder,true,'simulation ordering owner missing');
 assert.equal(g.__novaOrderReady,undefined,'new world already ticked');
 g.sfx.muted=true;g.input.firing=false;g.input.autofire=false;
 g.input.moveVec=()=>({x:1,y:0});g.input.aimVec=()=>null;
 let ticks=0,drawCount=0,miniCount=0;
 const initial=simulationSnapshot(g);
 for(let frame=1;frame<=renderHz*3;frame++){
  const goal=Math.floor(frame*60/renderHz+1e-9);
  while(ticks<goal){if(g.paused&&g.pendingOffer)g.dismissOffer();g.update(1/60);ticks++;}
  const before=simulationSnapshot(g),rng=draws(),order=g.tanks.map(t=>t.id);
  render(g,g.w,g.h);drawCount++;
  assert.equal(simulationSnapshot(g),before,`render mutated simulation at seed ${seed}, ${renderHz}Hz, frame ${frame}`);
  assert.deepEqual(g.tanks.map(t=>t.id),order,'render changed tank iteration order');
  assert.equal(draws(),rng,'render consumed gameplay random numbers');
  if(frame%Math.max(1,Math.round(renderHz/12))===0){
   const prior=simulationSnapshot(g),n=draws();g.drawMinimap();miniCount++;
   assert.equal(simulationSnapshot(g),prior,'minimap mutated simulation');
   assert.equal(draws(),n,'minimap consumed gameplay random numbers');
  }
 }
 return {initial,final:simulationSnapshot(g),draws:draws(),ticks,drawCount,miniCount};
});}
test('composed render and minimap remain read-only across seeds and display rates',()=>{
 for(const seed of SEEDS){
  const results=CLOCKS.map(hz=>probe(seed,hz));
  for(const x of results){assert.equal(x.ticks,180);assert.ok(x.miniCount>0);}
  assert.ok(results.every(x=>x.initial===results[0].initial));
  assert.ok(results.every(x=>x.final===results[0].final&&x.draws===results[0].draws),
   `drawing frequency changed gameplay or RNG at seed ${seed}`);
 }
});
test('purity witness detects deliberately reintroduced live-array depth sort',()=>{
 withSeed(1517802,()=>{
  const g=bootGame(),before=simulationSnapshot(g),order=g.tanks.map(t=>t.id);
  g.tanks.sort((a,b)=>a.y-b.y);
  assert.notDeepEqual(g.tanks.map(t=>t.id),order,'negative control must reorder');
  assert.notEqual(simulationSnapshot(g),before,'witness must detect old renderer defect');
 });
});
