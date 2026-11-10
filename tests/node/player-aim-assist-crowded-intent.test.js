'use strict';
// Regression for the production 49-overlay aim fallback. This is deliberately
// an actual Game.update test, not an isolated nearestTank selection test.
const test=require('node:test');
const assert=require('node:assert/strict');
const prior=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
if(prior===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prior;

function rival(id,x,y){
 return {id,x,y,r:14,hp:100,maxHp:100,alive:true,cls:'scout',
  isPlayer:true,vx:0,vy:0,angle:0,stats:{},spawnShieldT:0};
}
function scene(rivals,aim={x:1,y:0}){
 const g=bootGame();if(!g.player)g.redeploy();
 const p=g.player;
 p.x=0;p.y=0;p.angle=0;p.vx=0;p.vy=0;p.cls='scout';
 p.alive=true;p.hp=100;
 g.tanks=[p,...rivals];g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
 g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=568;g.h=320;
 g.status='playing';g.paused=false;g.hasLineOfSight=()=>true;
 g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>aim;
 g.input.mouseActive=false;g.input.firing=false;g.input.autofire=false;
 g.input.abilityQueued=false;
 return {g,p};
}
function close(g){g.destroy();}
test('crowded cone does not silently choose one of two plausible rivals',()=>{
 const offAxis=rival(9401,120,70),above=rival(9402,220,20),
       below=rival(9403,250,-20);
 const {g,p}=scene([offAxis,above,below]);
 try{
  assert.equal(g.nearestTank(0,0,480,p.id),offAxis,
   'outside the player update the nearest query remains unchanged');
  g.update(1/60);
  assert.ok(Math.abs(p.angle)<1e-9,
   'two in-cone candidates must preserve eastward manual aim');
  assert.equal(g.__novaFairAimQuery,undefined,'no query marker may leak');
 }finally{close(g);}
});
test('a genuinely nearest in-cone rival retains original assistance',()=>{
 const near=rival(9411,110,12),far=rival(9412,230,-15),
       offAxis=rival(9413,150,100);
 const {g,p}=scene([near,far,offAxis]);
 try{
  g.update(1/60);
  assert.ok(Math.abs(p.angle-Math.atan2(12,110)*13/60)<1e-6,
   'nearest already-aligned opponent keeps existing assistance');
 }finally{close(g);}
});
test('one aligned rival is recovered beyond a closer off-axis distractor',()=>{
 const offAxis=rival(9421,120,70),aligned=rival(9422,240,-18);
 const {g,p}=scene([offAxis,aligned]);
 try{
  g.update(1/60);
  assert.ok(Math.abs(p.angle-Math.atan2(-18,240)*13/60)<1e-6,
   'unique in-cone rival should be selected');
 }finally{close(g);}
});
