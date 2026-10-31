'use strict';
/* Production overlay order: drone targeting wraps updateDrones before
 * Spotter Intelligence scans. The cached drone pursuit must validate sight
 * at consumption time, not trust the previous scan's contact ID. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 class Game{
  updateDrones(){}
  getTank(id){return this.tankById.get(id)||null;}
  hasLineOfSight(){return !this.blocked;}
  addRing(){}
  addText(){}
  acquireDroneTarget(){return null;}
 }
 const modules={'game/engine':m=>{m.exports.Game=Game;}};
 const window={__novaModules:modules,
  __NOVA_FAIR_ENGAGEMENT__:{inGameplayViewport:(g,o,t)=>
   Math.abs(t.x-o.x)<=g.w/(2*g.cam.zoom)&&Math.abs(t.y-o.y)<=g.h/(2*g.cam.zoom)}};
 const ctx={window,Math,Number,Object,Array,Map,console:{info(){},error(){}},
  performance:{now:()=>0}};
 for(const name of ['drone-targeting-v1.5.1.js','spotter-intelligence-v1.5.1.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   ctx,{filename:name});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,()=>({}));
 const g=new m.exports.Game();
 const owner={id:1,kind:'tank',cls:'marksman',alive:true,hp:100,x:0,y:0,
  ai:{state:'hunt'},isPlayer:false};
 const target={id:2,kind:'tank',alive:true,hp:100,spawnShieldT:0,x:400,y:0};
 const observer={id:3,kind:'drone',ownerId:1,__novaSpotter:true,hp:100,
  x:0,y:0,angle:0,slot:0,speed:285,leash:1000};
 const fighter={id:4,kind:'drone',ownerId:1,hp:100,x:0,y:0,
  angle:0,slot:1,leash:500,targetRef:null,targetId:-1};
 Object.assign(g,{time:10,w:200,h:200,cam:{zoom:1},
  tanks:[owner,target],drones:[observer,fighter],bullets:[],shapes:[],
  tankById:new Map([[1,owner],[2,target]])});
 g.updateDrones(0);
 assert.equal(owner.__novaSpotterContactId,2);
 fighter.targetRef=target;fighter.targetId=2;
 return{g,owner,target,observer,fighter,window};
}
test('AI combat drone rejects a lost-cone target before Observer scan retires the contact',()=>{
 const w=boot();
 w.target.x=0;w.target.y=400;w.g.time+=1/60;
 assert.equal(w.owner.__novaSpotterContactId,2,'old scan still has contact ID');
 assert.equal(w.window.__NOVA_SPOTTER_LIVE_RELAY__(w.g,w.owner,w.target),false);
 w.g.updateDrones(0);
 assert.equal(w.fighter.targetRef,null,'cached drone pursuit must stop without hidden coordinates');
 assert.equal(w.fighter.targetId,-1);
 assert.equal(w.owner.__novaSpotterContactId,-1,'scanner retires contact after consumer');
});
test('valid remote Observer sight retains AI combat-drone pursuit',()=>{
 const w=boot();w.g.time+=1/120;
 w.g.updateDrones(0);
 assert.equal(w.fighter.targetRef,w.target);
 assert.equal(w.fighter.targetId,2);
});
test('missing Observer rejects AI relay while human drone autonomy remains unchanged',()=>{
 const w=boot();w.g.drones=[w.fighter];
 w.g.updateDrones(0);
 assert.equal(w.fighter.targetRef,null);
 const h=boot();h.owner.isPlayer=true;h.owner.ai=null;
 h.target.x=0;h.target.y=400;
 h.g.updateDrones(0);
 assert.equal(h.fighter.targetRef,h.target,'human autonomy remains outside AI viewport gate');
});
