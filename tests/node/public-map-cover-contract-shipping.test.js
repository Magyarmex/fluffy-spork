'use strict';
/* The public map makes an on-screen covered tank known, but permanent cover
 * still denies direct gunfire. This is a deliberate gameplay contract in
 * AI_DOCTRINE.md, not an AI wallhack. Exercise the actual 49-overlay Game,
 * Battlefield LOS, Fair Engagement AI wrapper and weapon firing owner. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(seed,hz,mode){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  const p=g.player,e=g.tanks.find(t=>t.ai&&t.alive);
  assert.ok(p&&e,'canonical Game must provide player and rival');
  g.sfx.muted=true;g.status='playing';g.time=12;
  g.tanks=[p,e];g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
  g.w=800;g.h=600;g.cam.x=0;g.cam.y=0;g.cam.zoom=1;
  p.x=mode==='offscreen'?950:100;p.y=0;p.vx=0;p.vy=0;
  p.alive=true;p.hp=100;p.spawnShieldT=0;
  e.x=-100;e.y=0;e.vx=0;e.vy=0;
  e.alive=true;e.hp=100;e.spawnShieldT=0;e.cls='scout';
  e.ai.state='wander';e.ai.targetId=-1;
  e.ai.__v1112TargetId=-1;e.ai.__v1112NextThink=0;
  e.ai.__v1105TargetId=-1;e.ai.__v180TargetId=-1;
  const wall={id:-9000,kind:'terrain',shape:'rect',
    x:0,y:0,w:24,h:180,type:'wall',destructible:false,
    solid:true,hp:0,maxHp:0};
  g.__novaTerrain=mode==='covered'?[wall]:[];
  delete g.__novaBattlefieldIndex;
  const physicalSight=g.hasLineOfSight(e.x,e.y,p.x,p.y,3);
  assert.equal(physicalSight,mode!=='covered','real Battlefield geometry');
  const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
  ai.updateAI(e,g,1/hz);
  const selected=e.ai.__v1112TargetId;
  const restored=g.tanks.length===2&&g.player===p;
  // Prove physical denial independently of whether the target is known.
  e.fireCd=-1;e.overheatT=0;e.ai.targetId=p.id;
  g.tryFire(e);
  const fired=g.bullets.filter(b=>b.ownerId===e.id).length;
  const denied=e.__novaTerrainDeniedFire===true;
  const out={selected,playerId:p.id,restored,physicalSight,fired,denied};
  g.destroy();return out;
 });
}

test('public covered hull stays known while permanent cover blocks shots at 30–240Hz',()=>{
 for(const seed of [1517800,1517802])for(const hz of [30,60,120,240]){
  const covered=arm(seed,hz,'covered'),clear=arm(seed,hz,'clear');
  assert.equal(covered.selected,covered.playerId,
    'on-screen covered hull remains legal public knowledge');
  assert.equal(clear.selected,clear.playerId,'unobstructed hull remains visible');
  assert.equal(covered.fired,0,'opaque cover blocks direct fire');
  assert.equal(covered.denied,true,'Battlefield firing denial is active');
  assert.ok(clear.fired>0,'open line must still permit the same Scout shot');
  assert.equal(covered.restored,true,'legacy AI narrow view is restored');
  assert.equal(clear.restored,true,'legacy AI narrow view is restored');
 }
});

test('public-map sight still rejects off-viewport targets without a relay',()=>{
 for(const seed of [1517800,1517802]){
  const out=arm(seed,60,'offscreen');
  assert.equal(out.selected,-1,'offscreen live coordinates are not global AI radar');
  assert.equal(out.restored,true);
 }
});
