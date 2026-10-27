'use strict';
// Idle Controller drones must not deal damage from a discarded pre-Swarm path.
// Exercise the real Controller and Swarm Discipline engine overlays in load order.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const files=['controller-v1.3.0.js','drone-discipline-v1.5.1.js'];
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(html.indexOf('nova-updates/'+files[0])>=0&&
 html.indexOf('nova-updates/'+files[1])>html.indexOf('nova-updates/'+files[0]),
 'test uses the materialized production overlay order');

function boot(withSwarm=true){
 class Game {
  updateDrones(){}
  tryFire(){}
  damageTank(){}
  setClass(){}
  spawnDrone(){}
  removeDroneAt(i){this.drones.splice(i,1);}
  getTank(id){return this.tankById.get(id)||null;}
  addImpactDebris(){}
 }
 class Sfx {}
 const modules={
  'game/engine':m=>{m.exports.Game=Game;},
  'game/audio':m=>{m.exports.Sfx=Sfx;},
  'game/render':m=>{m.exports.render=()=>{};}
 };
 const win={__novaModules:modules};
 const ctx={window:win,console:{info(){},warn(){},error(){}},
  Math,Map,Set,Number,Object,Array,Date};
 for(const file of (withSwarm?files:files.slice(0,1)))
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   ctx,{filename:file});
 const mod={exports:{}};
 const classes={CLASSES:{
  carrier:{size:15,droneCount:1,droneLeash:650,droneRole:'hunter'},
  basic:{size:15,droneCount:0,droneLeash:0,droneRole:'hunter'}
 },ABILITIES:{}};
 modules['game/engine'](mod,mod.exports,request=>{
  if(request==='./classes')return classes;
  throw new Error('unexpected module '+request);
 });
 return mod.exports.Game;
}
function world({withSwarm=true,enemy=true,phase='form',phaseT=0,aim=false}={}){
 const Game=boot(withSwarm),g=new Game();
 const owner={id:1,cls:'carrier',kind:'tank',alive:true,isPlayer:true,
  x:0,y:0,angle:0,hp:100,maxHp:100,swarmT:0,droneRespawnT:999};
 const enemyOwner={id:2,cls:'basic',kind:'tank',alive:true,isPlayer:false,
  x:80,y:0,angle:0,hp:100,maxHp:100,swarmT:0,droneRespawnT:999,
  ai:{state:'wander',targetId:-1}};
 const d={id:10,kind:'drone',ownerId:1,x:0,y:0,r:8,hp:30,maxHp:30,
  speed:0,dmg:12,attackCd:0,retargetT:999,leash:650,role:'hunter',
  slot:0,orbitA:0,orbitR:55,__novaPhase:phase,__novaPhaseT:phaseT};
 const hostile={id:11,kind:'drone',ownerId:2,x:9,y:0,r:8,hp:30,maxHp:30,
  speed:0,dmg:10,attackCd:999,retargetT:999,leash:500,
  role:'hunter',slot:0,orbitA:0,orbitR:55};
 const shape={id:20,kind:'shape',type:'circle',x:12,y:0,r:10,hp:100};
 Object.assign(g,{time:10,quality:'high',sfx:{},input:{aim:{active:aim,dx:50,dy:0}},
  tanks:[owner,enemyOwner],drones:enemy?[d,hostile]:[d],
  shapes:[shape],droneCounts:new Map(),
  tankById:new Map([[1,owner],[2,enemyOwner]])});
 const hits=[];
 g.damageShape=(s,damage)=>{hits.push(['shape',s.id]);s.hp-=damage;};
 g.damageDrone=(t,damage)=>{hits.push(['drone',t.id]);t.hp-=damage;};
 return {g,d,owner,hostile,shape,hits};
}
for(const hz of [30,60,120,240]){
 test('idle swarm defense does not damage a discarded farm target at '+hz+'Hz',()=>{
  const s=world();
  s.g.updateDrones(1/hz);
  assert.equal(s.d.__novaIdleMode,'defend','Swarm Discipline chose defense');
  assert.equal(s.shape.hp,100,'no attack may occur on the discarded legacy farm path');
  assert.equal(s.hostile.hp,18,'the actual final defensive contact must receive damage');
  assert.deepEqual(s.hits,[['drone',11]]);
  assert.equal(s.g.__novaSwarmIdlePass,undefined,'temporary authority is restored');
 });
 test('idle swarm still farms when there is no hostile at '+hz+'Hz',()=>{
  const s=world({enemy:false});
  s.g.updateDrones(1/hz);
  assert.equal(s.shape.hp,88,'one real idle farm hit, no duplicate');
  assert.deepEqual(s.hits,[['shape',20]]);
  assert.equal(s.d.__novaIdleMode,'farm');
 });
}
test('without Swarm Discipline, standalone Controller farming remains unchanged',()=>{
 const s=world({withSwarm:false,enemy:false});
 s.g.updateDrones(1/60);
 assert.equal(s.shape.hp,88);
 assert.deepEqual(s.hits,[['shape',20]]);
});
test('idle recover countdown is not frozen when the discarded pass is suppressed',()=>{
 const s=world({enemy:false,phase:'recover',phaseT:.005});
 s.g.updateDrones(1/60);
 assert.equal(s.d.__novaPhase,'form');
 assert.ok(s.d.__novaPhaseT<=0);
});
test('active Controller command retains the original movement/attack owner',()=>{
 const s=world({enemy:false,aim:true});
 s.g.updateDrones(1/60);
 assert.equal(s.owner.__novaSwarm.active,true);
 assert.equal(s.g.__novaSwarmIdlePass,undefined);
});
