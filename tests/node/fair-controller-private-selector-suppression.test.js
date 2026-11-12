'use strict';
// Real two-overlay module composition: Fair Engagement must own the AI
// Controller's target before Live Vector's legacy private planner runs.
// Not a full 49-overlay Game or a natural-match incidence measurement.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
const live=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const fair=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');

function boot(){
 const modules={
  'game/engine':function(module){
   class Game{
    constructor(){this.tanks=[];this.drones=[];this.time=7;this.w=800;this.h=600;
     this.cam={zoom:1};this.input={};this.player=null;}
    getTank(id){return this.tanks.find(t=>t.id===id)||null;}
    updateDrones(){}
   }
   module.exports.Game=Game;
  }
 };
 const window={__novaModules:modules};
 const document={addEventListener(){}};
 const context={window,document,console:{info(){},warn(){},error(){}},
  Math,Date,Number,Object,Array,Map,WeakMap,Set};
 vm.runInNewContext(live,context,{filename:'second-body-live-vector-v1.10.7.js'});
 vm.runInNewContext(fair,context,{filename:'fair-engagement-v1.11.2.js'});
 const classes={CLASSES:{carrier:{droneLeash:650}},lineageForClass:()=>null};
 const module={exports:{}};
 modules['game/engine'](module,module.exports,requested=>{
  assert.equal(requested,'./classes');return classes;
 });
 return {Game:module.exports.Game,window};
}
function tank(id,x,isPlayer=false){
 return {id,cls:id===1?'carrier':'basic',x,y:0,vx:0,vy:0,angle:0,
  alive:true,hp:100,maxHp:100,spawnShieldT:0,isPlayer,
  ai:id===1?{state:'hunt',targetId:-1,isElite:false}:null};
}
function run(playerId,reverse=false){
 const {Game}=boot(),g=new Game();
 const owner=tank(1,0),near=tank(2,100,playerId===2),
  far=tank(3,105,playerId===3);
 g.tanks=reverse?[owner,far,near]:[owner,near,far];
 g.updateDrones(1/60);
 const selected=owner.ai.__v1112TargetId;
 assert.ok(selected===2||selected===3);
 assert.equal(owner.__novaLiveVectorAI.targetId,selected,
  'real Live Vector must consume the outer Fair Engagement target');
 assert.equal(owner.ai.targetId,selected,
  'temporary virtual-stick target must be restored to the fair target');
 assert.ok(owner.__novaLiveVectorAI.thinkAt>g.time,
  'private player-weighted planner must remain asleep');
 g.time+=.01;g.updateDrones(1/60);
 assert.equal(owner.ai.targetId,selected,'legal target commitment must persist');
 g.getTank(selected).spawnShieldT=1;g.time+=.01;g.updateDrones(1/60);
 assert.notEqual(owner.ai.targetId,selected,
  'a shielded cached target must be revoked before the private planner');
 assert.ok(owner.ai.targetId===2||owner.ai.targetId===3);
 return selected;
}
test('materialized shell loads Fair Engagement after Live Vector before game boot',()=>{
 const a=shell.indexOf('second-body-live-vector-v1.10.7.js');
 const b=shell.indexOf('fair-engagement-v1.11.2.js');
 const c=shell.indexOf("window.__bootModule('main')");
 assert.ok(a>=0&&b>a&&c>b);
});
test('actual composed Controller wrappers ignore player identity and suppress legacy targeting',()=>{
 assert.equal(run(2),run(3),
  'swapping only isPlayer must not change selected target');
 assert.equal(run(3),run(3,true),
  'tank iteration order must not change a non-tied target');
});
