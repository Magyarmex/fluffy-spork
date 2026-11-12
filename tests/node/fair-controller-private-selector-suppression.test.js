'use strict';
// Source-composed research gate: the later Fair Engagement wrapper must keep
// the legacy Live Vector player-weighted private selector asleep.
// This is NOT a 49-overlay Game/browser encounter or a natural-match rate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const fair=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');
const live=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
function section(source,start,next){
 const i=source.indexOf(start),j=source.indexOf(next,i+start.length);
 assert.ok(i>=0&&j>i,'shipping source function boundary drift: '+start);
 return source.slice(i,j);
}
const functions=[
 section(fair,'function alive(','function d2('),
 section(fair,'function lineage(','function isController('),
 section(fair,'function hostile(','function targetDanger('),
 section(fair,'function targetDanger(','function saturation('),
 section(fair,'function saturationSnapshot(','function scoreTarget('),
 section(fair,'function scoreTarget(','function chooseTarget('),
 section(fair,'function chooseTarget(','function replanDelay('),
 section(fair,'function replanDelay(','function fairTarget('),
 section(fair,'function fairTarget(','function closeAimVector('),
 section(fair,'function targetFor(','function syncControllerPlans('),
 section(fair,'function syncControllerPlans(','var oldDrones=Game.prototype.updateDrones;'),
 section(live,'function planAIControllers(','function prepareAIVirtualThumbs(')
].join('\n');
function scenario(playerId,reverse=false){
 const owner={id:1,cls:'carrier',x:0,y:0,alive:true,hp:100,maxHp:100,
  angle:0,ai:{targetId:-1,state:'wander',isElite:false}};
 const npc={id:2,cls:'scout',x:100,y:0,hp:100,maxHp:100,alive:true,isPlayer:playerId===2};
 const rival={id:3,cls:'scout',x:105,y:0,hp:100,maxHp:100,alive:true,isPlayer:playerId===3};
 const g={time:10,tanks:reverse?[owner,rival,npc]:[owner,npc,rival],getTank(id){return this.tanks.find(t=>t.id===id)||null;}};
 const context={
  window:{__NOVA_LIVE_VECTOR_TEST__:{hostileDroneNear:()=>null,
   aiVirtualStick:()=>({active:true,angle:0,power:.5})}},
  Math,Number,Map,Infinity,SATURATION_PENALTY:.18,NORMAL_REPLAN:.18,ELITE_REPLAN:.12,classes:{},
  C:{carrier:{}},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  isController:t=>t.cls==='carrier',
  canPerceive:()=>true,
  aiPlan:t=>t.__novaLiveVectorAI,
  bestObservedTank:()=>{throw Error('legacy player-biased selector was reached');}
 };
 vm.createContext(context);
 vm.runInContext(functions,context);
 const before=context.chooseTarget(g,{},owner,owner.ai,10);
 context.syncControllerPlans(g);
 const plan=owner.__novaLiveVectorAI;
 assert.ok(plan&&plan.thinkAt>g.time,'fair outer owner must defer private planner');
 assert.equal(plan.targetId,before.id);
 assert.equal(owner.ai.targetId,before.id);
 assert.doesNotThrow(()=>context.planAIControllers(g),
  'private player-weighted selector must remain asleep in composed update order');
 assert.equal(owner.ai.targetId,before.id);
 const result={id:before.id,
  scoreNpc:context.scoreTarget(g,{},owner,owner.ai,npc,10,{counts:new Map()}),
  scoreRival:context.scoreTarget(g,{},owner,owner.ai,rival,10,{counts:new Map()})};
 // The fair owner must retain a legal cached target, then invalidate it
 // immediately on spawn protection without consulting the private selector.
 g.time=10.01;context.syncControllerPlans(g);context.planAIControllers(g);
 assert.equal(owner.ai.targetId,before.id,'legal target cache must remain stable');
 before.spawnShieldT=1;g.time=10.02;
 context.syncControllerPlans(g);context.planAIControllers(g);
 assert.notEqual(owner.ai.targetId,before.id,
  'spawn shield must immediately revoke a previously held Controller target');
 assert.ok(owner.ai.targetId>=0,'the other visible hostile remains eligible');
 return result;
}
test('shipping overlay order places Fair Engagement outside Live Vector',()=>{
 const a=shell.indexOf('second-body-live-vector-v1.10.7.js');
 const b=shell.indexOf('fair-engagement-v1.11.2.js');
 assert.ok(a>=0&&b>a,'Fair Engagement must load after the private Controller selector');
 assert.match(fair,/syncControllerPlans\(this\);[\s\S]*?oldDrones\.apply\(this,arguments\)/,
  'Fair Engagement must plan before calling the inner Live Vector updateDrones');
});
test('fair Controller target selection ignores human identity and suppresses legacy planner',()=>{
 const npcPlayer=scenario(2),farPlayer=scenario(3),reversed=scenario(3,true);
 assert.equal(npcPlayer.id,farPlayer.id,
  'switching isPlayer flags must not change the fair target identity');
 assert.equal(farPlayer.id,reversed.id,
  'reversing tank iteration must not change a non-tied fair choice');
 assert.equal(npcPlayer.scoreNpc,farPlayer.scoreNpc);
 assert.equal(npcPlayer.scoreRival,farPlayer.scoreRival);
});
