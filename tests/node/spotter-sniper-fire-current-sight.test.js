'use strict';
/* Violet Doctrine is an independent firing consumer: a stale remote contact
 * must not authorize a precision shot even if an older AI target ID survives. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 class Game{
  tryFire(t){this.fired++;this.bullets.push({ownerId:t.id});}
  getTank(id){return this.tankById.get(id)||null;}
  damageDrone(){}
  updateDrones(){}
  updateBullets(){}
  hasLineOfSight(){return !this.blocked;}
  addRing(){}
  addText(){}
 }
 const modules={'game/engine':m=>{m.exports.Game=Game;}};
 const window={__novaModules:modules};
 const ctx={window,Math,Number,Object,Array,Map,console:{info(){},warn(){},error(){}},
  performance:{now:()=>0}};
 for(const file of ['sniper-lineage-v1.4.1.js','spotter-intelligence-v1.5.1.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   ctx,{filename:file});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,id=>id==='./classes'?
  {CLASSES:{marksman:{fireMode:'bullet'}}}:{});
 const g=new m.exports.Game();
 const owner={id:1,cls:'marksman',alive:true,hp:100,x:0,y:0,fireCd:0,
  ai:{targetId:2},isPlayer:false,__novaSpotterContactId:2,
  __novaSpotterContactUntil:20,__novaSpotterDroneId:3,__novaSpotterDownUntil:0};
 const target={id:2,cls:'basic',alive:true,hp:100,spawnShieldT:0,x:900,y:0,isPlayer:false};
 const observer={id:3,ownerId:1,__novaSpotter:true,hp:100,x:300,y:0,angle:0};
 Object.assign(g,{time:10,bullets:[],fired:0,drones:[observer],tanks:[owner,target],
  tankById:new Map([[1,owner],[2,target]]),player:null});
 function prime(){
  owner.__novaPrecisionTargetId=2;owner.__novaPrecisionStart=g.time-.5;
  owner.__novaPrecisionLast=g.time-.05;owner.fireCd=0;
 }
 return{g,owner,target,observer,window,prime};
}
test('legitimate remote Observer contact still authorizes a committed Sniper shot',()=>{
 const w=boot();w.prime();
 assert.equal(w.window.__NOVA_SPOTTER_LIVE_RELAY__(w.g,w.owner,w.target),true);
 w.g.tryFire(w.owner);
 assert.equal(w.g.fired,1);
});
test('Sniper cannot fire at last-frame hidden coordinates after Observer loses sight',()=>{
 const w=boot();w.target.x=900;w.target.y=900;w.prime();
 assert.equal(w.window.__NOVA_SPOTTER_LIVE_RELAY__(w.g,w.owner,w.target),false);
 w.g.tryFire(w.owner);
 assert.equal(w.g.fired,0,'remote fire requires current Observer sight');
 assert.equal(w.owner.__novaPrecision,0,'old precision lock must be cancelled');
});
test('dead/missing/disabled Observer cannot authorize remote fire',()=>{
 for(const fault of ['dead','missing','disabled']){
  const w=boot();w.prime();
  if(fault==='dead')w.observer.hp=0;
  if(fault==='missing')w.g.drones=[];
  if(fault==='disabled')w.owner.__novaSpotterDownUntil=11;
  w.g.tryFire(w.owner);
  assert.equal(w.g.fired,0,fault);
 }
});
test('existing 720u direct Sniper range remains independent of remote relay',()=>{
 const w=boot();w.g.drones=[];w.target.x=600;w.prime();
 w.g.tryFire(w.owner);
 assert.equal(w.g.fired,1,'direct-range doctrine is preserved');
});
