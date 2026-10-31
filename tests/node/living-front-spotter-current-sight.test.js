'use strict';
/* Living Front AI must not suppress a public rotation using a previous
 * frame's offscreen Observer contact after that target moves out of sight. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{}};
 const ctx={window,Math,Number,Object,Array,Date,JSON,Map,
  console:{info(){},warn(){},error(){}},
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const file of ['spotter-intelligence-v1.5.1.js','living-front-core-v1.12.0.js',
   'living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   ctx,{filename:file});
 const target={id:2,kind:'tank',cls:'basic',x:200,y:0,
  alive:true,hp:100,maxHp:100,spawnShieldT:0};
 const owner={id:1,cls:'railgun',x:0,y:0,alive:true,hp:100,maxHp:100,
  __novaSpotterContactId:2,__novaSpotterContactUntil:20,
  __novaSpotterDroneId:3,ai:{__v1112TargetId:2}};
 const observer={id:3,ownerId:1,__novaSpotter:true,hp:100,x:0,y:0,angle:0};
 const g={time:10,w:360,h:640,cam:{zoom:1.2},tanks:[owner,target],
  drones:[observer],shapes:[],__lfState:{signal:{type:'BLOOM',
  x:500,y:0,sector:2,until:20},queryScratch:[],queryScratch2:[]},
  getTank(id){return id===2?target:null;},
  hasLineOfSight(){return true;}};
 return{window,g,owner,target,observer,
  bias:()=>window.__NOVA_LIVING_FRONT_TEST__.publicEcoBias(g,owner,{},{}).weight};
}
test('real Observer relay legitimately overrides public ecology while target is seen',()=>{
 const w=boot();
 assert.equal(w.window.__NOVA_SPOTTER_LIVE_RELAY__(w.g,w.owner,w.target),true);
 assert.equal(w.bias(),0);
});
test('public ecology recovers before next drone scan when Observer loses target',()=>{
 const w=boot();w.target.x=0;w.target.y=400;
 assert.equal(w.owner.__novaSpotterContactId,2,'previous scan still remembers target');
 assert.equal(w.window.__NOVA_SPOTTER_LIVE_RELAY__(w.g,w.owner,w.target),false);
 assert.ok(w.bias()>.15,'hidden coordinates cannot suppress public rotation');
});
test('dead or terrain-occluded Observer never supplies a live ecological override',()=>{
 for(const fault of ['dead','blocked']){
  const w=boot();
  if(fault==='dead')w.observer.hp=0;
  if(fault==='blocked')w.g.hasLineOfSight=()=>false;
  assert.ok(w.bias()>.15,fault);
 }
});
