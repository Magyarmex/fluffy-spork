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
