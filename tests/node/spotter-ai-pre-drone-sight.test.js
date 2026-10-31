'use strict';
/* Regression: Fair Engagement AI runs before the Observer drone update.
 * A stored contact ID is not current sight when either body has moved. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const spotter=fs.readFileSync(path.join(root,'nova-updates/spotter-intelligence-v1.5.1.js'),'utf8');
const fair=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
function boot(){
 class Game{
  updateDrones(){}
  getTank(id){return this.tankById.get(id)||null;}
  hasLineOfSight(){return !this.blocked;}
  addRing(){}
  addText(){}
 }
 const modules={
  'game/engine'(m){m.exports.Game=Game;},
  'game/ai'(m){m.exports.updateAI=(t,g)=>{g.__aiSaw=g.tanks.map(x=>x.id);};}
 };
 const window={__novaModules:modules};
 const ctx={window,Math,Number,Object,Array,console:{info(){},error(){}},performance:{now:()=>0}};
 vm.runInNewContext(spotter,ctx,{filename:'spotter-intelligence-v1.5.1.js'});
 vm.runInNewContext(fair,ctx,{filename:'fair-engagement-v1.11.2.js'});
 function load(id){
  const m={exports:{}};
  modules[id](m,m.exports,r=>{
   if(r==='./classes')return{CLASSES:{},lineageForClass:cls=>cls==='marksman'?'sniper':'gunner'};
   throw Error('Unexpected module '+r);
  });
  return m.exports;
 }
 const G=load('game/engine').Game,ai=load('game/ai');
 const g=new G();
 const owner={id:1,cls:'marksman',alive:true,hp:100,maxHp:100,x:0,y:0,angle:0,
  ai:{state:'hunt',targetId:-1,__v1112TargetId:-1,__v1112NextThink:0}};
 const target={id:2,cls:'basic',alive:true,hp:100,maxHp:100,x:400,y:0,
  spawnShieldT:0,isPlayer:true};
 const drone={id:3,ownerId:1,__novaSpotter:true,hp:100,x:0,y:0,angle:0,
  slot:0,speed:285,leash:1000};
 Object.assign(g,{time:10,w:400,h:300,cam:{x:0,y:0,zoom:1},
  tanks:[owner,target],drones:[drone],bullets:[],tankById:new Map([[1,owner],[2,target]]),
  player:target});
 const perceive=()=>window.__NOVA_FAIR_ENGAGEMENT_TEST__.canPerceive(g,
  {lineageForClass:()=> 'sniper'},owner,target);
 return{g,owner,target,drone,ai,perceive};
}
test('shipping path contains the Spotter and Fair Engagement consumers',()=>{
 for(const name of ['spotter-intelligence-v1.5.1.js','fair-engagement-v1.11.2.js'])
  assert.ok(shipping.includes('nova-updates/'+name));
});
test('AI cannot pursue a remote enemy that left the cone before the next drone tick',()=>{
 const w=boot();w.g.updateDrones(0);
 assert.equal(w.owner.__novaSpotterContactId,2);
 assert.equal(w.perceive(),true,'real contact is allowed');
 w.ai.updateAI(w.owner,w.g,1/60);
 assert.equal(w.owner.ai.__v1112TargetId,2);
 w.target.x=0;w.target.y=500;w.g.time+=1/60;
 assert.equal(w.owner.__novaSpotterContactId,2,'scan has not run yet');
 assert.equal(w.perceive(),false,'the AI consumer must verify current sight');
 w.ai.updateAI(w.owner,w.g,1/60);
 assert.equal(w.owner.ai.__v1112TargetId,-1,'old target is dropped before next drone scan');
 assert.equal(w.owner.ai.targetId,-1);
 assert.equal(w.owner.__novaSpotterContactId,2,'consumer must not rewrite scanner state');
 w.g.updateDrones(0);
 assert.equal(w.owner.__novaSpotterContactId,-1,'scanner eventually retires contact');
});
test('AI relay rejects disabled, dead, missing, mismatched or occluded Observer before scan',()=>{
 for(const fault of ['disabled','dead','missing','wrong-owner','wrong-id','occluded']){
  const w=boot();w.g.updateDrones(0);
  if(fault==='disabled')w.owner.__novaSpotterDownUntil=w.g.time+1;
  if(fault==='dead')w.drone.hp=0;
  if(fault==='missing')w.g.drones=[];
  if(fault==='wrong-owner')w.drone.ownerId=999;
  if(fault==='wrong-id')w.owner.__novaSpotterDroneId=999;
  if(fault==='occluded')w.g.blocked=true;
  assert.equal(w.perceive(),false,fault);
 }
});
test('live cone sight remains valid, including 135u proximity exception, across frame rates',()=>{
 for(const hz of [30,60,120,240]){
  const w=boot();w.g.updateDrones(0);w.g.time+=1/hz;
  assert.equal(w.perceive(),true,hz+'Hz remote sight');
  /* Keep the target off the hull viewport, but within 135u of the
   * Observer: proximity sight legitimately ignores the Observer cone. */
  w.drone.x=500;w.drone.y=0;w.drone.angle=Math.PI;
  w.target.x=500;w.target.y=100;
  assert.equal(w.perceive(),true,hz+'Hz offscreen close-range Observer sight');
  w.target.x=-300;w.target.y=500;
  assert.equal(w.perceive(),false,hz+'Hz target beyond Observer range');
 }
});
test('direct viewport remains legal without a relay; no offscreen ID-only permission',()=>{
 const w=boot();w.g.updateDrones(0);
 w.owner.__novaSpotterContactId=-1;
 assert.equal(w.perceive(),false,'remote target requires an actual Observer');
 w.target.x=100;w.target.y=0;
 assert.equal(w.perceive(),true,'normal viewport perception is unchanged');
});
