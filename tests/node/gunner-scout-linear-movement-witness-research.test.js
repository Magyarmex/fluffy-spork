'use strict';
/* #799: qualify the actual Battlefield Scout movement witness before
 * attributing Gunner hit differences to moving-body collision.
 * This is source-executed 49-overlay Game coverage, not a damage-parity
 * claim and not a production movement change. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function witness(seed,hz){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);
   assert.ok(t,'composed Game must contain a target');
   g.sfx.muted=true;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   t.cls='scout';t.isPlayer=true;t.alive=true;
   t.x=200;t.y=-30;t.vx=0;t.vy=60;
   t.spawnShieldT=0;t.shieldT=0;
   const dt=1/hz,startX=t.x,startY=t.y;
   g.moveTank(t,0,60,dt);
   const moved=Math.hypot(t.x-startX,t.y-startY);
   assert.ok(moved>0,'the real moveTank path must move the Scout');
   assert.equal(t.__novaLinearMoveEpoch,g.time);
   assert.equal(t.__novaLinearMoveCalls,1);
   assert.equal(t.__novaLinearMoveValid,true,
    'single unobstructed velocity-consistent Scout move should be witnessed');
   assert.equal(t.__novaLinearMoveDt,dt);
   assert.equal(t.__novaLinearMoveStartX,startX);
   assert.equal(t.__novaLinearMoveStartY,startY);
   assert.equal(t.__novaLinearMoveEndX,t.x);
   assert.equal(t.__novaLinearMoveEndY,t.y);
   const first={x:t.x,y:t.y,moved:+moved.toFixed(6)};
   // A second move in the same epoch must invalidate the linear certificate;
   // the resolver must never infer a single straight trajectory from it.
   g.moveTank(t,0,60,dt);
   assert.equal(t.__novaLinearMoveCalls,2);
   assert.equal(t.__novaLinearMoveValid,false);
   return {seed,hz,dt,first,secondMoveInvalidated:true};
  }finally{g.destroy();}
 });
}

test('real Scout movement certifies one segment and rejects two same-epoch moves',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])
  for(const hz of [30,60,120])rows.push(witness(seed,hz));
 assert.equal(rows.length,6);
 console.log('SCOUT_MOVING_BODY_WITNESS_RESEARCH '+JSON.stringify(rows));
});
