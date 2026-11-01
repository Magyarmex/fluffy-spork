'use strict';
/* Exact materialized engine and all HTML-ordered gameplay overlays. */
const test=require('node:test');
const assert=require('node:assert/strict');
const old=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
if(old===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=old;
function actor(id,x,y){return {id,x,y,r:14,hp:100,maxHp:100,alive:true,cls:'scout',isPlayer:false,vx:0,vy:0,angle:0,stats:{}};}
test('shipping 48-overlay Game filters hidden touch aim targets, not AI or Crasher queries',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const p=g.player;p.x=0;p.y=0;p.alive=true;p.hp=100;
 const visible=actor(8101,155,210),hidden=actor(8102,185,165);
 g.tanks=[p,visible,hidden];g.cam.x=0;g.cam.y=0;g.cam.zoom=1;
 g.w=320;g.h=568;g.hasLineOfSight=()=>true;
 assert.equal(g.nearestTank(0,0,480,p.id),visible,'offscreen nearest must not steal player aim');
 assert.equal(g.nearestTank(0,0,900,p.id),hidden,'AI-style query keeps nearest world target');
 g.cam.x=100;
 assert.equal(g.nearestTank(0,0,480,p.id),hidden,'camera pan exposes target');
 g.cam.x=0;g.hasLineOfSight=()=>false;
 assert.equal(g.nearestTank(0,0,480,p.id),null,'terrain still denies target');
});

test('full shipping Game.update steers touch gun toward visible rather than hidden nearest tank',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const p=g.player;p.x=0;p.y=0;p.angle=0;p.vx=0;p.vy=0;p.cls='scout';p.alive=true;p.hp=100;
 const visible=actor(8201,155,210),hidden=actor(8202,185,165);
 visible.isPlayer=true;hidden.isPlayer=true; // isolate player aim from unrelated AI decisions
 g.tanks=[p,visible,hidden];g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
 g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=320;g.h=568;
 g.status='playing';g.paused=false;g.hasLineOfSight=()=>true;
 g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>({x:155,y:210});
 g.input.mouseActive=false;g.input.firing=false;g.input.autofire=false;
 g.input.abilityQueued=false;
 g.update(1/60);
 const expected=Math.atan2(210,155)*(13/60);
 assert.ok(Math.abs(p.angle-expected)<1e-6,
   'actual composed Game.update should rotate toward the visible hull');
});

test('actual shipping Game.update ignores nearer spawn-protected tank while assisting visible exposed opponent',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const p=g.player;p.x=0;p.y=0;p.angle=0;p.vx=0;p.vy=0;p.cls='scout';p.alive=true;p.hp=100;
 const protectedTank=actor(8301,100,15),exposed=actor(8302,180,-10);
 protectedTank.spawnShieldT=2;exposed.spawnShieldT=0;
 protectedTank.isPlayer=true;exposed.isPlayer=true;
 g.tanks=[p,protectedTank,exposed];g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
 g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=568;g.h=320;
 g.status='playing';g.paused=false;g.hasLineOfSight=()=>true;
 g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>({x:180,y:-11});
 g.input.mouseActive=false;g.input.firing=false;g.input.autofire=false;g.input.abilityQueued=false;
 g.update(1/60);
 const expected=Math.atan2(-10,180)*(13/60);
 assert.ok(Math.abs(p.angle-expected)<1e-6,'full composed Game.update must not snap to invulnerable spawn');
});
