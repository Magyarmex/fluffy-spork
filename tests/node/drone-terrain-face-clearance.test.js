'use strict';
// Adversarial production Battlefield wrapper regression for inclusive wall faces.
// A terrain-corrected drone must not remain on the exact padded face that the
// downstream Live Vector repair sweep treats as embedded.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8');
class Game{
  updateDrones(){const d=this.drones[0];d.x+=this.stepX;d.y+=this.stepY;}
  getTank(){return null;}
}
const modules={
 'game/engine':m=>{m.exports.Game=Game;},
 'game/audio':m=>{m.exports.Sfx=null;},
 'game/ai':m=>{m.exports.updateAI=null;},
 'game/render':m=>{m.exports.render=null;}
};
const ctx={window:{__novaModules:modules},document:{addEventListener(){}},
 console:{info(){},warn(){},error(){}},performance:{now:()=>0},
 Math,Date,Map,Set,Number,Object,Array,WeakMap};
vm.runInNewContext(source,ctx,{filename:'battlefield-v1.6.0.js'});
const m={exports:{}};
modules['game/engine'](m,m.exports,()=>({CLASSES:{}}));
const BattlefieldGame=m.exports.Game;
function simulate(solid,x,y,dx,dy,dt){
 const d={id:11,ownerId:1,x,y,r:8,hp:100,speed:200};
 const g=new BattlefieldGame();
 Object.assign(g,{drones:[d],tanks:[],shapes:[],bullets:[],time:1,
  quality:'high',stepX:dx,stepY:dy,__novaTerrain:[solid],
  __novaBattlefield:{name:'test',coverTotal:0,coverBroken:0}});
 g.updateDrones(dt);
 return {g,d};
}
function seeded(seed){
 let s=seed>>>0;
 return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
test('single-wall terrain resolution releases the inclusive padded face across 30–240 Hz',()=>{
 const random=seeded(352);
 let contacts=0;
 for(let i=0;i<4000;i++){
  const rect=i%2===0;
  const solid=rect?{id:-1,shape:'rect',x:0,y:0,w:20,h:200,
   solid:true,destructible:false}:{id:-1,shape:'circle',x:0,y:0,r:25,
   solid:true,destructible:false};
  const x=(random()-.5)*100,y=(random()-.5)*220;
  const hz=[30,60,120,240][i%4],dt=1/hz;
  const dx=(random()-.5)*400*dt,dy=(random()-.5)*400*dt;
  const {g,d}=simulate(solid,x,y,dx,dy,dt);
  assert.equal(g.isTerrainSafe(d.x,d.y,9),true,
   'case '+i+' at '+hz+' Hz must end outside the inclusive wall');
  if(d.__novaTerrainBump)contacts++;
  else{
   assert.equal(d.x,x+dx,'unobstructed x motion unchanged');
   assert.equal(d.y,y+dy,'unobstructed y motion unchanged');
  }
 }
 assert.ok(contacts>100,'exercise real collision corrections, not only open field');
});
test('a face-corrected drone can resume its next movement without penetrating',()=>{
 const wall={id:-1,shape:'rect',x:0,y:0,w:20,h:200,
  solid:true,destructible:false};
 const {g,d}=simulate(wall,-30,0,25,0,.2);
 assert.equal(g.isTerrainSafe(d.x,d.y,9),true);
 assert.ok(d.x<=-19.0005);
 const beforeY=d.y;
 g.stepX=0;g.stepY=5;g.updateDrones(.2);
 assert.equal(g.isTerrainSafe(d.x,d.y,9),true);
 assert.ok(d.y>beforeY,'tangential follow-up movement remains possible');
});
