'use strict';
// Research-only: compare *rendered* pose and interpolation saturation for
// scheduler budgets that all preserve identical authoritative 60Hz physics.
// This is not a physical-device CPU or touch-to-photon latency measurement.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {FixedStepPosePresentation}=require('../research/fixed-step-presentation.cjs');
const STEP=1000/60;
const gaps=Array.from({length:15},()=>[85,40,5,1000/7.5-130]).flat();
function run(seed,maxSteps,backlogExtraTicks){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  g.player.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  const presentation=new FixedStepPosePresentation(g,{enabled:true});
  const timeline=new ChronologicalInput(g.input);
  const bridge={timeline,startMs:1000};
  let now=1000,callback=null,rows=[],violations=0;
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
   maxSteps,backlogExtraTicks,
   render:(game,w,h,alpha)=>{
    const before=[game.player.x,game.player.y,game.cam.x,game.cam.y];
    presentation.draw(world=>{
     rows.push({x:world.player.x,y:world.player.y,camX:world.cam.x,
      camY:world.cam.y,alpha,lagMs:owner.lagMs,steps:owner.lastSteps});
    },game,w,h,alpha);
    if([game.player.x,game.player.y,game.cam.x,game.cam.y]
       .some((v,i)=>v!==before[i]))violations++;
   }
  });
  try{
   owner.start();
   g.input.keyboard.right=true;
   for(const gap of gaps){
    now+=gap;const fn=callback;callback=null;
    assert.equal(typeof fn,'function');fn(now);
   }
   return {hash:digest(physical(g)),draws:draws(),ticks:owner.ticks,
    droppedMs:owner.droppedMs,violations,rows,
    interpolated:presentation.interpolated};
  }finally{owner.stop();presentation.stop();g.destroy()}
 });
}
test('clustered 30Hz recovery keeps physical state but exposes distinct render-phase budgets',()=>{
 for(const seed of [1517800,1517802]){
  const variants=[
   run(seed,2,4),run(seed,3,3),run(seed,4,2)
  ];
  for(const v of variants){
   assert.equal(v.ticks,120,'each budget must recover all 60Hz ticks');
   assert.equal(v.droppedMs,0);
   assert.equal(v.violations,0,'interpolation must restore live positions');
   assert.equal(v.rows.length,gaps.length);
   assert.ok(v.interpolated>0,'moving player/camera should be interpolated');
   assert.ok(v.rows.every(r=>r.alpha>=0&&r.alpha<=1));
   assert.ok(v.rows.some(r=>r.alpha===1),
    'this clustered schedule must expose saturated interpolation');
   assert.ok(v.rows.some(r=>r.lagMs>STEP),
    'saturation corresponds to real queued simulation time');
  }
  assert.equal(variants[0].hash,variants[1].hash);
  assert.equal(variants[1].hash,variants[2].hash);
  assert.equal(variants[0].draws,variants[1].draws);
  assert.equal(variants[1].draws,variants[2].draws);
  const peak=v=>Math.max(...v.rows.map(r=>r.lagMs));
  assert.ok(peak(variants[0])>peak(variants[1]));
  assert.ok(peak(variants[1])>peak(variants[2]));
  // No claim that lower queued simulation lag guarantees smoother rendering:
  // compare actual rendered poses, not just tick totals.
  assert.ok(variants.some(v=>v.rows.some((r,i)=>i>0&&
   Math.abs(r.x-variants[0].rows[i].x)>1e-6)),
   'different catch-up budgets should produce measurable pose phase');
 }
});
