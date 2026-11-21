'use strict';
// Real materialized Game and HTML-ordered overlays, not a separate aim model.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed player aim query never inspects an off-camera rival HP',()=>withSeed(1095,()=>{
 const g=bootGame();let hidden,priorHp,los,ownLos;
 try {
  if(!g.player)g.redeploy();
  const p=g.player,bots=g.tanks.filter(t=>t&&t!==p&&t.ai);
  assert.ok(p&&p.alive&&bots.length>=2);
  const visible=bots[0];hidden=bots[1];
  g.w=800;g.h=600;g.cam.x=p.x;g.cam.y=p.y;g.cam.zoom=1;
  for(const t of g.tanks)if(t!==p){t.x=p.x+1600;t.y=p.y;}
  visible.x=p.x+90;visible.y=p.y;visible.alive=true;visible.hp=100;
  visible.spawnShieldT=0;hidden.spawnShieldT=0;
  los=g.hasLineOfSight;ownLos=Object.prototype.hasOwnProperty.call(g,'hasLineOfSight');
  g.hasLineOfSight=()=>true; // isolate camera and status gates, not terrain
  priorHp=Object.getOwnPropertyDescriptor(hidden,'hp');
  Object.defineProperty(hidden,'hp',{configurable:true,
   get(){throw Error('composed player assist inspected off-camera HP');}});
  assert.equal(g.nearestTank(p.x,p.y,480,p.id),visible);
 } finally {
  if(hidden&&priorHp)Object.defineProperty(hidden,'hp',priorHp);
  if(los){if(ownLos)g.hasLineOfSight=los;else delete g.hasLineOfSight;}
  g.destroy();
 }
}));
