'use strict';
/* Exact materialized engine and all HTML-ordered gameplay overlays. */
const test=require('node:test');
const assert=require('node:assert/strict');
const old=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
if(old===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=old;
function actor(id,x,y){return {id,x,y,r:14,hp:100,maxHp:100,alive:true,cls:'scout',isPlayer:false};}
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
