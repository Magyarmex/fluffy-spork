'use strict';
/* Issue #581 — real materialized 49-overlay Game and Battlefield line of sight.
 * A newly spawned non-Sniper rival must not acquire live coordinates of a
 * player physically behind intact opaque cover, even inside its viewport.
 * The unobstructed control must still acquire the same target. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(seed,hz,blocked){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  const player=g.player,enemy=g.tanks.find(t=>t.ai&&t.alive);
  assert.ok(player&&enemy,'actual game must provide both owners');
  g.sfx.muted=true;
  g.tanks=[player,enemy];g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
  g.w=800;g.h=600;g.cam.x=0;g.cam.y=0;g.cam.zoom=1;
  g.status='playing';g.time=12;
  player.x=100;player.y=0;player.vx=0;player.vy=0;
  player.alive=true;player.hp=100;player.spawnShieldT=0;
  enemy.x=-100;enemy.y=0;enemy.vx=0;enemy.vy=0;
  enemy.alive=true;enemy.hp=100;enemy.spawnShieldT=0;
  enemy.cls='scout';
  enemy.ai.state='wander';enemy.ai.targetId=-1;
  enemy.ai.__v1112TargetId=-1;enemy.ai.__v1112NextThink=0;
  enemy.ai.__v1105TargetId=-1;enemy.ai.__v180TargetId=-1;
  g.__novaTerrain=blocked?[{id:-9000,kind:'terrain',shape:'rect',
    x:0,y:0,w:24,h:180,type:'wall',destructible:false,
    solid:true,hp:0,maxHp:0}]:[];
  delete g.__novaBattlefieldIndex;
  const physicalSight=g.hasLineOfSight(enemy.x,enemy.y,player.x,player.y,3);
  assert.equal(physicalSight,!blocked,'actual Battlefield wall geometry');
  const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
  ai.updateAI(enemy,g,1/hz);
  const out={targetId:enemy.ai.__v1112TargetId,playerId:player.id,
    hasSight:physicalSight,alive:player.alive,worldCount:g.tanks.length};
  g.destroy();
  return out;
 });
}

test('real Battlefield wall blocks fresh ordinary AI hull acquisition at 30–240Hz',()=>{
 for(const seed of [1517800,1517802]){
  for(const hz of [30,60,120,240]){
   const hidden=arm(seed,hz,true),visible=arm(seed,hz,false);
   assert.equal(hidden.targetId,-1,'no live target behind opaque wall at '+hz+'Hz');
   assert.equal(visible.targetId,visible.playerId,
    'same-distance unobstructed rival must remain a legal target at '+hz+'Hz');
   assert.equal(hidden.worldCount,2,'AI wrappers must restore complete tank list');
   assert.equal(visible.worldCount,2,'AI wrappers must restore complete tank list');
  }
 }
});
