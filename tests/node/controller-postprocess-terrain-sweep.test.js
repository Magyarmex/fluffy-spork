'use strict';
// Regression against the real shipping Battlefield -> Live Vector wrappers:
// post-update Controller repair/peel motion must not bypass terrain resolution.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
const live=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const wall=()=>({id:-1,shape:'rect',x:0,y:0,w:20,h:200,solid:true,destructible:false});
function boot({droneX=-20,droneY=0,ownerX=100,ownerY=0,damaged=true}={}){
 class Game{updateDrones(){} getTank(id){return this.tankById.get(id)||null;}}
 const modules={
  'game/engine':m=>{m.exports.Game=Game;},
  'game/audio':m=>{m.exports.Sfx=null;},
  'game/ai':m=>{m.exports.updateAI=null;},
  'game/render':m=>{m.exports.render=null;}
 };
 const window={__novaModules:modules,NOVATips:{registerMany(){}}};
 const ctx={window,document:{addEventListener(){}},console:{info(){},warn(){},error(){}},
  performance:{now:()=>0},Math,Date,Map,Set,Number,Object,Array,WeakMap};
 vm.runInNewContext(battlefield,ctx,{filename:'battlefield-v1.6.0.js'});
 vm.runInNewContext(live,ctx,{filename:'second-body-live-vector-v1.10.7.js'});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,()=>({CLASSES:{
  carrier:{droneLeash:650,size:15},gunner:{size:15}
 },lineageForClass:id=>id==='carrier'?'controller':'gunner'}));
 const owner={id:1,cls:'carrier',team:1,alive:true,isPlayer:true,
  x:ownerX,y:ownerY,hp:100,maxHp:100,angle:0,swarmT:0,
  __novaSwarm:{active:false,power:0}};
 const drone={id:11,ownerId:1,x:droneX,y:droneY,r:8,hp:damaged?10:100,
  maxHp:100,speed:200,__novaPhase:'form',attackCd:1};
 const g=new m.exports.Game();
 Object.assign(g,{drones:[drone],tanks:[owner],player:owner,time:1,quality:'high',
  tankById:new Map([[1,owner]]),__novaTerrain:[wall()],
  __novaBattlefield:{name:'test',coverTotal:0,coverBroken:0}});
 return{g,owner,drone};
}
test('shipping runtime loads Battlefield before Live Vector and keeps both in the materializer',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const a=html.indexOf('nova-updates/battlefield-v1.6.0.js');
 const b=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
 assert.ok(a>=0&&b>a);
});
test('damaged Controller repair cannot move into permanent cover after Battlefield collision pass',()=>{
 const w=boot();
 assert.equal(w.g.isTerrainSafe(w.drone.x,w.drone.y,9),true);
 w.g.updateDrones(.2);
 assert.equal(w.drone.__lvRepairing,true,'reproduction follows actual repair path');
 assert.equal(w.g.isTerrainSafe(w.drone.x,w.drone.y,9),true,
  'post-Battlefield repair movement must respect solid terrain');
 assert.ok(w.drone.x<=-19,'the drone stays on its side of the wall');
});
test('repair motion remains terrain-safe from a near-wall start at 30–240 Hz',()=>{
 for(const hz of [30,60,120,240]){
  const w=boot({droneX:-19.001});
  for(let frame=0;frame<16;frame++){
   w.g.time+=1/hz;w.g.updateDrones(1/hz);
   assert.equal(w.g.isTerrainSafe(w.drone.x,w.drone.y,9),true,
    hz+' Hz frame '+frame+' must not push through the wall');
  }
 }
});
test('unobstructed repair movement still advances toward its owner',()=>{
 const w=boot({droneX:-100,ownerX:-50});
 w.g.updateDrones(1/30);
 assert.ok(w.drone.x>-100,'safe path still allows repair travel');
 assert.equal(w.g.isTerrainSafe(w.drone.x,w.drone.y,9),true);
});
test('local defensive peel also respects cover after the canonical terrain pass',()=>{
 const w=boot({droneX:-20,droneY:0,ownerX:-50,ownerY:150,damaged:false});
 const rival={id:2,cls:'gunner',team:2,alive:true,isPlayer:false,x:60,y:150,hp:100};
 w.g.tanks.push(rival);w.g.tankById.set(2,rival);
 w.g.drones.push({id:40,ownerId:2,x:60,y:150,r:8,hp:100,maxHp:100});
 assert.equal(w.g.hasLineOfSight(w.owner.x,w.owner.y,60,150,2),true,
  'the enemy drone is a legitimate local threat to the Controller hull');
 w.g.updateDrones(.2);
 assert.equal(w.g.isTerrainSafe(w.drone.x,w.drone.y,9),true,
  'defensive peel may not bypass cover after the collision pass');
});
