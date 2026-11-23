'use strict';
/* Research only: the exact shipping RAF method drives the REAL composed
 * 49-overlay Game.update under deterministic presentation timestamps.
 * No renderer pixels or real-device performance are claimed. This file is
 * intentionally isolated on the known-red #843 branch. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const b=html.indexOf('    destroy() {',a);
assert.ok(a>=0&&b>a,'canonical materialized Game.start must be present');
const body=html.slice(a,b).trim();
function run(seed,gaps,seconds=10){
 return withSeed(seed,()=>{
  let now=0,raf=null,draws=0,updates=0,simulated=0,maxStep=0;
  const game=bootGame();
  if(!game.player)game.redeploy();
  const p=game.player;
  game.sfx.muted=true;game.sfx.startMusic=()=>{};
  game.tanks=[p];game.tankById=new Map([[p.id,p]]);
  game.shapes=[];game.drones=[];game.powerups=[];game.bullets=[];
  if(game.shapeById)game.shapeById.clear();
  if(game.hash&&game.hash.clear)game.hash.clear();
  game.shapeTimer=Infinity;game.powerupTimer=Infinity;
  game.eliteTimer=Infinity;game.crasherTimer=Infinity;game.aiRespawns=[];
  game.spawnShape=()=>null;game.spawnPowerup=()=>null;
  game.spawnAITank=()=>null;game.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;
  game.status='playing';game.paused=false;
  game.input.autofire=false;game.input.firing=false;
  game.input.keyboard.right=true;
  game.drawMinimap=()=>{};
  const update=game.update,initial=game.time,startX=p.x;
  game.update=function(dt){
   updates++;simulated+=dt;maxStep=Math.max(maxStep,dt);
   return update.call(this,dt);
  };
  const start=new Function('performance','requestAnimationFrame','render_1',
   'return ({'+body+'}).start')({now:()=>now},
    fn=>{raf=fn;return 1;},{render(){draws++;}});
  try{
   start.call(game);
   let i=0;while(now<seconds*1000-1e-7){
    now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
    const callback=raf;raf=null;
    assert.equal(typeof callback,'function','canonical RAF must continue');
    callback(now);
   }
   assert.ok(maxStep<=1/30+1e-9,'all collision steps remain bounded');
   assert.ok(draws>0&&updates>0,'real Game.update and RAF renderer invoked');
   assert.ok(Math.abs(game.time-initial-simulated)<1e-5,
    'real game clock must advance by the actual simulation updates');
   return {elapsed:game.time-initial,updates,draws,
    xDelta:p.x-startX,simulated,maxStep};
  }finally{game.destroy();}
 });
}
const moderate=[55,55,1000/15-55,1000/15-55];
const harsh=[85,40,5,1000/7.5-130];
test('composed Game: shipping clustered RAF chronology has player-world consequences',()=>{
 const rows=[];
 for(const seed of [1517800,1517802]){
  const uniform=run(seed,[1000/30]);
  const clustered=run(seed,moderate);
  const severe=run(seed,harsh);
  assert.ok(Math.abs(uniform.elapsed-10)<1e-5,'uniform 30Hz control');
  assert.ok(clustered.elapsed<uniform.elapsed-.5,
   'clustered schedule loses substantial real Game.update time');
  assert.ok(severe.elapsed<clustered.elapsed-1,
   'more severe schedule loses still more world time');
  assert.equal(uniform.draws,clustered.draws,
   'both mean-30Hz schedules present equal frame counts');
  assert.equal(clustered.draws,severe.draws,
   'all schedules present equal frame counts');
  rows.push({seed,uniform,clustered,severe});
 }
 console.log('COMPOSED_RAF_TIME_LOSS_RESEARCH '+JSON.stringify(rows));
});
