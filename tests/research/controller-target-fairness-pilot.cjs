'use strict';
// Research only: the actual materialized 48-overlay Game.updateDrones path.
// A controlled open-field fixture isolates target identity from geometry.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
function arm(seed,hz,playerFlag){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.tanks.find(t=>t&&!t.isPlayer&&t.alive&&t.ai);
  const npc=g.tanks.find(t=>t&&!t.isPlayer&&t.id!==owner.id&&t.alive);
  const player=g.player;
  assert.ok(owner&&npc&&player,'real engine actors unavailable');
  for(const t of g.tanks)if(t!==owner&&t!==npc&&t!==player)t.alive=false;
  owner.cls='carrier';owner.x=0;owner.y=0;owner.angle=0;
  owner.hp=100;owner.maxHp=100;owner.ai.targetId=-1;
  owner.ai.state='wander';owner.ai.isElite=false;
  delete owner.__novaLiveVectorAI;
  npc.x=100;npc.y=0;npc.alive=true;npc.spawnShieldT=0;npc.isPlayer=false;
  player.x=105;player.y=0;player.alive=true;player.spawnShieldT=0;
  player.isPlayer=playerFlag;
  g.drones=[];g.time=1;
  // Both targets are deliberately visible in an otherwise empty open lane.
  // This is a perception-controlled unit of the full shipping update chain,
  // not a claim about naturally occurring map positions.
  g.hasLineOfSight=()=>true;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.updateDrones(1/hz);
  const initial={targetId:owner.ai.targetId,planId:owner.__novaLiveVectorAI?.targetId,
   ownerId:owner.id,npcId:npc.id,playerId:player.id};
  npc.x=20;
  const later=[];
  for(let t=2;t<=6;t++){g.time=t;g.updateDrones(1/hz);
   later.push({t,targetId:owner.ai.targetId,planId:owner.__novaLiveVectorAI?.targetId,
    commitUntil:owner.__novaLiveVectorAI?.commitUntil});}
  return {seed,hz,playerFlag,initial,later};
 });
}
test('materialized Controller target preference and commitment are measured, not guessed',()=>{
 const results=[];
 for(const hz of [30,60,120])for(const seed of [1517840,1517854,1517875]){
  const player=arm(seed,hz,true),neutral=arm(seed,hz,false);
  assert.equal(player.initial.targetId,player.initial.playerId,
   'source-level human preference did not survive shipping composition');
  assert.equal(neutral.initial.targetId,neutral.initial.npcId,
   'identity-only control did not select the closer rival');
  assert.ok(player.later.every(t=>t.targetId===player.initial.playerId),
   'cached-target stickiness was not reproduced');
  results.push({seed,hz,player,neutral});
 }
 const dir=path.join(root,'artifacts','controller-target-fairness');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'baseline.json'),JSON.stringify({scenarios:results.length,results},null,2));
 console.log('NOVA_CONTROLLER_TARGET_BIAS '+JSON.stringify({scenarios:results.length,
  biasedSelections:results.filter(r=>r.player.initial.targetId===r.player.initial.playerId).length,
  identityControls:results.filter(r=>r.neutral.initial.targetId===r.neutral.initial.npcId).length,
  stickyThroughSixSeconds:results.filter(r=>r.player.later.every(t=>t.targetId===r.player.initial.playerId)).length}));
});
