'use strict';
/* The old Forward Observer AI can call g.getTank even while Fair Engagement
 * narrows g.tanks. Its own remote authorization must reject stale IDs. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const modules={'game/ai':m=>{m.exports.updateAI=()=>{};}};
 const window={__novaModules:modules};
 const ctx={window,Math,Number,Object,Array,Map,console:{info(){},warn(){},error(){}},
  performance:{now:()=>0}};
 for(const file of ['stability-v1.4.0.js','spotter-intelligence-v1.5.1.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   ctx,{filename:file});
 const m={exports:{}};
 modules['game/ai'](m,m.exports,id=>id==='./classes'?
  {CLASSES:{marksman:{fireMode:'bullet'}}}:{});
 const owner={id:1,cls:'marksman',alive:true,hp:100,x:0,y:0,angle:0,
  abilityCd:100,ai:{state:'hunt',targetId:2,thinkT:1},
  __novaSpotterContactId:2,__novaSpotterContactUntil:20,__novaSpotterDroneId:3};
 const target={id:2,cls:'basic',alive:true,hp:100,x:900,y:0,spawnShieldT:0};
 const observer={id:3,ownerId:1,__novaSpotter:true,hp:100,x:300,y:0,angle:0};
 const g={time:10,tanks:[owner],drones:[observer],bullets:[],
  getTank:id=>id===2?target:null,getShape:()=>null,nearestShape:()=>null,
  tankSpeed:()=>100,weaponRange:()=>1000,moveTank:()=>{},
  tryFire:()=>{},useAbility:()=>{},bulletSpeed:()=>1000,
  hasLineOfSight:()=>true};
 return{g,owner,target,observer,update:()=>m.exports.updateAI(owner,g,1/60)};
}
test('legacy Sniper AI cannot use g.getTank to bypass the Fair Engagement narrow view',()=>{
 const w=boot();w.g.drones=[];
 w.update();
 assert.equal(w.owner.ai.targetId,-1);
 assert.notEqual(w.owner.ai.state,'hunt');
});
test('legacy Sniper AI drops last-frame remote target when Observer loses cone',()=>{
 const w=boot();w.target.x=900;w.target.y=900;
 w.update();
 assert.equal(w.owner.ai.targetId,-1);
});
test('legacy Sniper AI retains genuinely observed remote and direct-range targets',()=>{
 const valid=boot();valid.update();
 assert.equal(valid.owner.ai.targetId,2);
 const direct=boot();direct.g.drones=[];direct.target.x=600;
 direct.update();
 assert.equal(direct.owner.ai.targetId,2);
});
test('legacy Sniper target acquisition cannot resurrect hidden ID on its think tick',()=>{
 const w=boot();w.g.drones=[];w.owner.ai.thinkT=0;
 w.update();
 assert.equal(w.owner.ai.targetId,-1);
});
