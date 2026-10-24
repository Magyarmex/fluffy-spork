'use strict';
// Ranking cannot depend on viewport calls for candidates already too distant
// to beat a selected visible threat. This guards dense-swarm frame budgets.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const src=name=>fs.readFileSync(path.join(root,'nova-updates',name),'utf8');
function boot(){
  class Game{acquireDroneTarget(){return this.nativeTarget;}updateDrones(){}damageDrone(){}damageShape(){}}
  const mods={'game/engine':m=>{m.exports.Game=Game;}};
  let checks=0;
  const win={__novaModules:mods,__NOVA_FAIR_ENGAGEMENT__:{
    inGameplayViewport(g,owner,target){checks++;return Math.abs(target.x-owner.x)<=g.w/(2*g.cam.zoom)&&Math.abs(target.y-owner.y)<=g.h/(2*g.cam.zoom);}
  }};
  const ctx={window:win,console:{info(){},error(){}},Math,Map,Set,Number};
  // Exactly the materialized production overlay order.
  vm.runInNewContext(src('drone-discipline-v1.5.1.js'),ctx);
  vm.runInNewContext(src('drone-targeting-v1.5.1.js'),ctx);
  const m={exports:{}};mods['game/engine'](m,m.exports,()=>({}));
  return{Game:m.exports.Game,hooks:win.__NOVA_DRONE_PERF_TEST__,
    count:()=>checks,reset:()=>{checks=0;}};
}
function world(Game){
 const g=new Game();g.w=220;g.h=380;g.cam={zoom:1};g.time=10;
 const owner={id:1,cls:'carrier',kind:'tank',team:'blue',alive:true,ai:{},x:0,y:0};
 const enemy={id:2,cls:'marksman',kind:'tank',team:'red',alive:true,x:900,y:0};
 const d={id:10,kind:'drone',ownerId:1,x:0,y:0,hp:30,r:8,leash:650,role:'hunter'};
 const visible={id:11,kind:'drone',ownerId:2,x:30,y:0,hp:30,r:8};
 const worse=Array.from({length:100},(_,i)=>({id:100+i,kind:'drone',ownerId:2,x:130+i*.5,y:0,hp:30,r:8}));
 g.tanks=[owner,enemy];g.drones=[d,visible,...worse];g.shapes=[];
 g.tankById=new Map([[1,owner],[2,enemy]]);
 g.areAllies=(a,b)=>a.team===b.team;g.areHostile=(a,b)=>a.team!==b.team;
 g.hasLineOfSight=()=>true;
 return{g,owner,d,visible};
}
test('nearest defense checks viewport only for candidates capable of winning',()=>{
 const x=boot(),s=world(x.Game);
 assert.equal(x.hooks.nearestDefense(s.g,s.owner,s.d),s.visible);
 assert.equal(x.count(),1,'100 farther drones must not trigger viewport geometry');
});
test('native fallback similarly avoids redundant viewport checks',()=>{
 const x=boot(),s=world(x.Game);
 s.g.nativeTarget={id:999,kind:'drone',__novaSpotter:true,ownerId:2,x:0,y:0,hp:30};
 assert.equal(s.g.acquireDroneTarget(s.d,s.owner,650),s.visible);
 assert.ok(x.count()<=2,'only the selected nearest threat should need viewport checking');
});
test('a nearer hidden candidate does not hide a farther visible candidate',()=>{
 const x=boot(),s=world(x.Game);
 s.visible.x=90;s.visible.y=170;
 s.g.drones[2].x=120;s.g.drones[2].y=0;
 assert.equal(x.hooks.nearestDefense(s.g,s.owner,s.d),s.visible);
 assert.ok(x.count()>=2,'hidden candidates must still be tested when they can win');
});
