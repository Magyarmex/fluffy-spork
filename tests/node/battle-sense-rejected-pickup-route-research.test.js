'use strict';
/* Research-only source-executed witness: a pickup rejected by Battle Sense
 * may still seed the live movement route. Do not merge this test as an
 * acceptance contract for the undesirable behavior. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 function Game(){}
 const classes={CLASSES:{guard:{size:15,moveMult:.92,bullet:{reload:.5}}},lineageForClass:()=> 'guardian'};
 const modules={
  'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/classes':m=>{m.exports=classes;}
 };
 const w={__novaModules:modules};
 vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates/battle-sense-v1.8.1.js'),'utf8'),
  {window:w,Math,Number,Object,Array,console:{info(){},error(){}}});
 const t={id:7,cls:'guard',x:0,y:0,hp:10,maxHp:100,alive:true,ai:{}};
 const a={id:'rejected',type:'heal',x:200,y:0},b={id:'chosen',type:'heal',x:180,y:60};
 const g={time:10,tanks:[t],powerups:[],bullets:[],
  hasLineOfSight:(_x,_y,gx,gy)=>gx===b.x&&gy===b.y,
  isTerrainSafe:()=>true,
  novaBattlefieldWaypoint(x,y,gx,gy,pad,seed){
   const key=String(seed)+':'+Math.round(pad/4);
   this.__v1102Routes||=Object.create(null);
   this.__v1102Routes[key]={gx,gy,index:0,points:[{x:100,y:100}],until:11};
   return{x:100,y:100};
  },
  novaRouteLength:()=>9000
 };
 return{g,t,a,b,classes,h:w.__NOVA_BATTLE_SENSE_TEST__};
}
test('research: an unselected expensive heal still seeds the live movement route',()=>{
 const {g,t,a,classes,h}=boot();g.powerups=[a];
 assert.equal(h.chooseResource(g,t,classes),null);
 assert.equal(g.__v1102Routes['7:6'].gx,a.x);
 assert.equal(g.__v1102Routes['7:6'].gy,a.y);
});
test('research: a later selected direct heal inherits the rejected heal route owner',()=>{
 const {g,t,a,b,classes,h}=boot();g.powerups=[a,b];
 const selected=h.chooseResource(g,t,classes);
 assert.equal(selected,b);
 assert.deepEqual([g.__v1102Routes['7:6'].gx,g.__v1102Routes['7:6'].gy],[a.x,a.y]);
});
test('control: without a candidate there is no speculative movement route',()=>{
 const {g,t,classes,h}=boot();
 assert.equal(h.chooseResource(g,t,classes),null);
 assert.equal(g.__v1102Routes,undefined);
});


test('research: real Terrain Intelligence can retain a rejected one-wall heal route',()=>{
 function Game(){}
 Game.prototype.novaBattlefieldWaypoint=()=>null;
 Game.prototype.moveTank=function(){};
 const classes={CLASSES:{guard:{size:15,moveMult:.92,bullet:{reload:.5}}},
  lineageForClass:()=> 'guardian'};
 const modules={'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/classes':m=>{m.exports=classes;}};
 const w={__novaModules:modules},context={window:w,Math,Number,Object,Array,
  console:{info(){},error(){}}};
 for(const name of ['battle-sense-v1.8.1.js','terrain-intelligence-v1.10.2.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   context,{filename:name});
 const m={exports:{}};modules['game/engine'](m,m.exports,()=>classes);
 const g=new m.exports.Game(),t={id:7,cls:'guard',x:0,y:0,
  hp:60,maxHp:100,alive:true,ai:{}},wall={id:99,x:100,y:0,w:40,h:400,solid:true},
  a={id:'rejected',type:'heal',x:200,y:0},
  b={id:'chosen',type:'shield',x:-180,y:60};
 function hit(ax,ay,bx,by,pad=0){
  const x0=wall.x-wall.w/2-pad,x1=wall.x+wall.w/2+pad,
   y0=wall.y-wall.h/2-pad,y1=wall.y+wall.h/2+pad,
   dx=bx-ax,dy=by-ay;let lo=0,hi=1;
  for(const [p,q] of [[-dx,ax-x0],[dx,x1-ax],[-dy,ay-y0],[dy,y1-ay]]){
   if(Math.abs(p)<1e-9){if(q<0)return false;}
   else{const z=q/p;if(p<0)lo=Math.max(lo,z);else hi=Math.min(hi,z);
    if(lo>hi)return false;}
  }
  return true;
 }
 g.time=10;g.tanks=[t];g.powerups=[a,b];g.bullets=[];g.__novaTerrain=[wall];
 g.hasLineOfSight=(ax,ay,bx,by,pad=0)=>!hit(ax,ay,bx,by,pad);
 g.isTerrainSafe=(x,y,pad=0)=>Math.abs(x-wall.x)>wall.w/2+pad||
  Math.abs(y-wall.y)>wall.h/2+pad;
 const selected=w.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,t,classes);
 assert.equal(selected,b,'direct shield B should win over physically long occluded heal A');
 const route=g.__v1102Routes?.['7:6'];
 assert.ok(route,'pricing rejected A should have created a real route cache entry');
 assert.equal(route.gx,a.x);
 assert.equal(route.gy,a.y);
 assert.ok(route.points.length>1,'real planner must certify a nontrivial detour');
});
