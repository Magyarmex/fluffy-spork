'use strict';
// Shipping Second Body Live Vector, not retired Command Weave: cached AI target
// retention must revalidate hostility and spawn shielding at every think tick.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raw=fs.readFileSync(path.join(__dirname,
  '../../nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const marker='  function planAIControllers(g){';
assert.equal(raw.split(marker).length,2);
const source=raw.replace(marker,'  window.__testLiveVectorBestObserved=bestObservedTank;\n'+marker);

function boot(){
 class Game{
  constructor(){this.time=10;this.tanks=[];this.drones=[];this.tankById=new Map();this.player=null;}
  getTank(id){return this.tankById.get(id)||null;}
  updateDrones(){}
 }
 const mods={'game/engine':m=>{m.exports.Game=Game;}};
 const win={__novaModules:mods,NOVATips:{registerMany(){}}};
 vm.runInNewContext(source,{window:win,document:{addEventListener(){}},
   console:{info(){},warn(){},error(){}},
   Math,Number,Map,Set,Date,Object,Array,WeakMap},
   {filename:'second-body-live-vector-v1.10.7.js'});
 const m={exports:{}};
 mods['game/engine'](m,m.exports,()=>({CLASSES:{carrier:{droneLeash:650}}}));
 const g=new m.exports.Game();
 const owner={id:1,kind:'tank',cls:'carrier',team:'blue',alive:true,isPlayer:false,
   x:0,y:0,angle:0,hp:100,maxHp:100,swarmT:0,
   ai:{state:'hunt',targetId:-1,isElite:false,strafe:1}};
 const enemy={id:2,kind:'tank',cls:'carrier',team:'red',alive:true,
   x:120,y:0,hp:100,maxHp:100,spawnShieldT:0};
 const other={id:3,kind:'tank',cls:'carrier',team:'red',alive:true,
   x:190,y:0,hp:100,maxHp:100,spawnShieldT:0};
 g.tanks=[owner,enemy,other];g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
 g.hasLineOfSight=()=>true;
 g.areAllies=(a,b)=>a.team===b.team;
 g.areHostile=(a,b)=>a.team!==b.team;
 return{g,owner,enemy,other,win};
}
function tick(w){w.g.updateDrones(1/60);return w.owner.__novaLiveVectorAI;}
function rethink(w){w.g.time+=1;w.owner.__novaLiveVectorAI.thinkAt=0;return tick(w);}

test('cached Controller AI enemy becomes allied: select the next hostile',()=>{
 const w=boot();assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.team='blue';
 assert.equal(rethink(w).targetId,w.other.id);
});
test('cached Controller AI enemy gains spawn shield: choose unprotected hostile',()=>{
 const w=boot();assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.spawnShieldT=2;
 assert.equal(rethink(w).targetId,w.other.id);
});
test('cached allied target is cleared when no other hostile is visible',()=>{
 const w=boot();assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.team='blue';w.other.team='blue';
 const p=rethink(w);assert.equal(p.targetId,-1);assert.equal(p.active,false);
});
test('cached shielded target is cleared when all alternatives are shielded',()=>{
 const w=boot();assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.spawnShieldT=1;w.other.spawnShieldT=1;
 assert.equal(rethink(w).targetId,-1);
});
test('legitimate visible hostile target retains commitment even if another is nearer',()=>{
 const w=boot();assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.x=300;w.other.x=130;
 assert.equal(rethink(w).targetId,w.enemy.id);
});
test('team metadata fallback still rejects newly allied cached target',()=>{
 const w=boot();delete w.g.areAllies;delete w.g.areHostile;
 for(const t of w.g.tanks){t.teamId=t.team==='blue'?1:2;delete t.team;}
 assert.equal(tick(w).targetId,w.enemy.id);
 w.enemy.teamId=1;
 assert.equal(rethink(w).targetId,w.other.id);
});
test('historical FFA without relation metadata retains ordinary target',()=>{
 const w=boot();delete w.g.areAllies;delete w.g.areHostile;
 for(const t of w.g.tanks)delete t.team;
 assert.equal(tick(w).targetId,w.enemy.id);
 assert.equal(rethink(w).targetId,w.enemy.id);
});
test('actual wrapped updateDrones restores original getTank after virtual stick',()=>{
 const w=boot(),oldGet=w.g.getTank;
 tick(w);
 assert.equal(w.g.getTank,oldGet);
 assert.equal(w.owner.ai.targetId,w.enemy.id);
});
test('selector rejects a cached ally even when its coordinates are still sensed',()=>{
 const w=boot();w.enemy.team='blue';
 assert.equal(w.win.__testLiveVectorBestObserved(w.g,w.owner,w.enemy),w.other);
});

test('the corrected Live Vector module is wired into the materialized game',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 const base=html.indexOf('src="./nova-updates/controller-v1.3.0.js"');
 const live=html.indexOf('src="./nova-updates/second-body-live-vector-v1.10.7.js"');
 const fair=html.indexOf('src="./nova-updates/fair-engagement-v1.11.2.js"');
 assert.ok(base>=0&&live>base&&fair>live,'production overlay order');
 assert.equal(html.includes('src="./nova-updates/controller-command-weave-v1.10.0.js"'),false,
   'retired Command Weave must not be mistaken for the shipping path');
});
