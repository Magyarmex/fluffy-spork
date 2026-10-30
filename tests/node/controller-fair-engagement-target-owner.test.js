'use strict';
// Regression for #514: the old Live Vector player-distance multiplier is
// unreachable in the canonical Fair Engagement + Live Vector updateDrones chain.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const live = fs.readFileSync(path.join(ROOT,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const fair = fs.readFileSync(path.join(ROOT,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');
const deploy = fs.readFileSync(path.join(ROOT,'.github/workflows/deploy.yml'),'utf8');

function run({ fairEnabled=true, playerX=120, npcX=100, swapIdentity=false,
               reverse=false, shield=false, width=1280, fps=60 }={}){
  class Game {
    constructor(){
      this.time=1;this.w=width;this.h=800;this.cam={zoom:1};
      this.drones=[];this.sfx={};this.tanks=[];this.player=null;
    }
    getTank(id){ return this.tanks.find(t=>t.id===id)||null; }
    updateDrones(){}
    hasLineOfSight(){ return true; }
    areHostile(a,b){ return a.id!==b.id; }
  }
  const modules={'game/engine':m=>{m.exports={Game};}};
  const window={__novaModules:modules};
  const context={window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},Math,Date,Map,WeakMap,Set,Object,Array,Number};
  vm.runInNewContext(live,context,{filename:'second-body-live-vector-v1.10.7.js'});
  if(fairEnabled)vm.runInNewContext(fair,context,{filename:'fair-engagement-v1.11.2.js'});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,()=>({
    CLASSES:{carrier:{droneLeash:650},scout:{size:15}},
    lineageForClass:()=>null,
  }));
  const g=new m.exports.Game();
  const owner={id:1,cls:'carrier',x:0,y:0,angle:0,hp:100,maxHp:100,
    alive:true,ai:{state:'wander',targetId:-1,isElite:false}};
  const npc={id:2,cls:'scout',x:npcX,y:0,alive:true,hp:100,maxHp:100,
    spawnShieldT:0,isPlayer:swapIdentity};
  const player={id:3,cls:'scout',x:playerX,y:0,alive:true,hp:100,maxHp:100,
    spawnShieldT:shield?1:0,isPlayer:!swapIdentity};
  g.tanks=reverse?[owner,player,npc]:[owner,npc,player];
  g.player=player;
  for(let frame=0;frame<3;frame++){
    g.updateDrones(1/fps);
    g.time+=1/fps;
  }
  return {id:owner.ai.targetId,privateId:owner.__novaLiveVectorAI?.targetId,
    fairId:owner.ai.__v1112TargetId,privateThink:owner.__novaLiveVectorAI?.thinkAt,
    time:g.time,contract:window.__NOVA_FAIR_ENGAGEMENT__?.contract};
}

test('materializer loads Fair Engagement after Live Vector, making it the final Controller target owner',()=>{
  const liveAt=deploy.indexOf("'./nova-updates/second-body-live-vector-v1.10.7.js'");
  const fairAt=deploy.indexOf("'./nova-updates/fair-engagement-v1.11.2.js'");
  assert.ok(liveAt>=0&&fairAt>liveAt);
});

test('the historical private Live Vector selector really did prefer a farther human',()=>{
  assert.equal(run({fairEnabled:false,playerX:105,npcX:100}).id,3);
  assert.equal(run({fairEnabled:false,playerX:105,npcX:100,swapIdentity:true}).id,2);
});

for(const fps of [30,60,120])for(const reverse of [false,true]){
  test('shipping Fair Engagement ignores isPlayer identity at '+fps+'Hz reverse='+reverse,()=>{
    const base=run({fps,reverse,playerX:105,npcX:100});
    const flipped=run({fps,reverse,playerX:105,npcX:100,swapIdentity:true});
    assert.equal(base.id,flipped.id,
      'identity-only flag cannot change fair target selection');
    assert.equal(base.id,base.fairId);
    assert.equal(base.privateId,base.fairId);
    assert.ok(base.privateThink>base.time,
      'legacy private selector remains asleep after the fair owner runs');
    assert.equal(base.contract.playerPriorityBonus,false);
  });
  test('farther player cannot outrank meaningfully closer equal rival at '+fps+'Hz reverse='+reverse,()=>{
    const result=run({fps,reverse,playerX:120,npcX:100});
    assert.equal(result.id,2);
    assert.equal(result.privateId,2);
  });
}
test('fair owner excludes spawn-protected and offscreen targets',()=>{
  assert.equal(run({playerX:50,npcX:100,shield:true}).id,2);
  assert.equal(run({playerX:105,npcX:100,width:180}).id,-1);
});
