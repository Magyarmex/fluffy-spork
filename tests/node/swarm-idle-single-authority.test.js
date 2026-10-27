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

function boot(withSwarm=true,withBattlefield=false){
 class Game {
  update(dt){this.time+=dt;this.updateDrones(dt);}
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
  Math,Map,Set,Number,Object,Array,Date,performance:{now:()=>0}};
 for(const file of [...(withSwarm?files:files.slice(0,1)),...(withBattlefield?['battlefield-v1.6.0.js']:[])])
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
function world({withSwarm=true,withBattlefield=false,enemy=true,phase='form',phaseT=0,aim=false}={}){
 const Game=boot(withSwarm,withBattlefield),g=new Game();
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
  shapes:[shape],__novaTerrain:[],droneCounts:new Map(),
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

for(const hz of [30,60,120,240]){
 test('committed dash ending this frame is not rewound into an idle farm hit at '+hz+'Hz',()=>{
  const s=world({enemy:false,phase:'dash',phaseT:.001});
  s.d.__novaVX=300;s.d.__novaVY=0;s.d.__novaHitRun=true;
  s.g.updateDrones(1/hz);
  assert.equal(s.d.__novaPhase,'recover','dash enters recovery after physical movement');
  assert.ok(Math.abs(s.d.x-300/hz)<1e-6,
   'dash physical displacement must survive Swarm Discipline post-processing');
  assert.equal(s.shape.hp,100,'dash recovery cannot also harvest in the same frame');
  assert.deepEqual(s.hits,[]);
 });
}

for(const hz of [30,60,120,240]){
 test('committed dash interrupted by solid cover is not rewound at '+hz+'Hz',()=>{
  const s=world({enemy:false,phase:'dash',phaseT:.5});
  s.d.__novaVX=300;s.d.__novaVY=0;s.d.__novaHitRun=true;
  s.g.firstTerrainHit=()=>({hit:{t:.5}});
  s.g.updateDrones(1/hz);
  assert.equal(s.d.__novaPhase,'recover','wall interrupts committed dash');
  assert.ok(Math.abs(s.d.x-150/hz)<1e-6,
   'wall-truncated dash position must survive idle post-processing');
  assert.equal(s.shape.hp,100,'wall abort cannot harvest in the same frame');
  assert.deepEqual(s.hits,[]);
 });
}

for(const hz of [30,60,120,240]){
 test('shipping Controller → Swarm → Battlefield preserves one defensive contact at '+hz+'Hz',()=>{
  const s=world({withBattlefield:true});
  s.g.updateDrones(1/hz);
  assert.equal(s.d.__novaIdleMode,'defend');
  assert.equal(s.shape.hp,100,'discarded Controller farm contact must not leak through Battlefield');
  assert.equal(s.hostile.hp,18,'real defensive contact must survive terrain wrapper');
  assert.deepEqual(s.hits,[['drone',11]]);
 });
}

for(const hz of [30,60,120,240]){
 test('two idle allied drones reserve separate shapes without phantom double hits at '+hz+'Hz',()=>{
  const s=world({enemy:false});
  const second={...s.d,id:12,slot:1,attackCd:0,__novaPhase:'form'};
  const other={id:21,kind:'shape',type:'circle',x:0,y:12,r:10,hp:100};
  s.g.drones=[second,s.d]; // reverse the physical array vs sorted squad slots
  s.g.shapes=[other,s.shape]; // reverse shape enumeration too
  s.g.updateDrones(1/hz);
  assert.equal(s.shape.hp,88);
  assert.equal(other.hp,88);
  assert.equal(s.hits.length,2);
  assert.deepEqual(new Set(s.hits.map(h=>h[1])),new Set([20,21]));
 });
}


/* A chronological drone resolver needs motion from the actual integration
 * owner, not an invented straight line between Battlefield/Live Vector stage
 * checkpoints. This diagnostic is deliberately non-authoritative until all
 * later movement owners have been reconciled. */
function tracedIdleWorld(options={}){
 const s=world({enemy:false,withBattlefield:!!options.battlefield,
  aim:!!options.aim,phase:options.phase||'form'});
 s.g.__novaDroneChronoTraceEnabled=options.trace!==false;
 s.g.__novaShapeSweepActive=true;
 s.g.__novaShapeSweepEpoch=37;
 s.d.__novaChronoDroneEpoch=37;
 s.d.__novaChronoDronePrevX=s.d.x;
 s.d.__novaChronoDronePrevY=s.d.y;
 s.d.speed=options.speed===undefined?200:options.speed;
 return s;
}
for(const hz of [30,60,120,240]){
 test('idle Swarm records its real integration, not a phase interpolation at '+hz+'Hz',()=>{
  const s=tracedIdleWorld({battlefield:true});
  const beforeX=s.d.x,beforeY=s.d.y,dt=1/hz;
  s.g.updateDrones(dt);
  assert.equal(s.d.__novaChronoIdleRawEpoch,37);
  assert.equal(s.d.__novaChronoIdleRawX,beforeX);
  assert.equal(s.d.__novaChronoIdleRawY,beforeY);
  assert.equal(s.d.__novaChronoIdleRawEndX,s.d.__novaChronoDroneBaseX);
  assert.equal(s.d.__novaChronoIdleRawEndY,s.d.__novaChronoDroneBaseY);
  assert.equal(s.d.__novaChronoIdleRawDt,dt);
  assert.equal(s.d.__novaChronoIdleRawEndX,s.d.x);
  assert.ok(s.d.__novaChronoIdleRawEndX>beforeX);
 });
}
test('raw integration witness is absent when diagnostics are disabled',()=>{
 const s=tracedIdleWorld({trace:false});
 s.g.updateDrones(1/60);
 assert.equal(s.d.__novaChronoIdleRawEpoch,undefined);
});
test('committed dash never masquerades as idle Swarm integration',()=>{
 const s=tracedIdleWorld({phase:'dash'});
 s.d.__novaVX=300;s.d.__novaVY=0;s.d.__novaHitRun=true;
 s.g.updateDrones(1/60);
 assert.equal(s.d.__novaChronoIdleRawEpoch,undefined);
});
test('active command movement never masquerades as idle Swarm integration',()=>{
 const s=tracedIdleWorld({aim:true});
 s.g.updateDrones(1/60);
 assert.equal(s.owner.__novaSwarm.active,true);
 assert.equal(s.d.__novaChronoIdleRawEpoch,undefined);
});
test('arena clamping cannot produce a false raw straight segment',()=>{
 const s=tracedIdleWorld({speed:1000});
 s.d.x=2225.9;s.owner.x=2500;
 s.g.updateDrones(1/30);
 assert.equal(s.d.x,2226);
 assert.equal(s.d.__novaChronoIdleRawEpoch,-1);
});
test('terrain correction is visibly distinct from raw idle integration',()=>{
 const s=tracedIdleWorld({battlefield:true});
 s.g.__novaTerrain=[{id:-1,shape:'rect',x:0,y:0,w:30,h:30,
  solid:true,destructible:false}];
 s.g.updateDrones(1/30);
 assert.equal(s.d.__novaChronoIdleRawEpoch,37,
  'raw integration remains observable, never implicitly collision-certified');
 assert.notEqual(s.d.__novaChronoIdleRawEndX,s.d.__novaChronoDroneTerrainX);
 assert.equal(s.d.__novaChronoDroneTraceEpoch,37);
});

test('real Battlefield Game.update owns the raw integration epoch',()=>{
 const s=world({enemy:false,withBattlefield:true});
 s.d.speed=200;s.g.__novaDroneChronoTraceEnabled=true;
 s.g.update(1/60);
 const epoch=s.g.__novaShapeSweepEpoch;
 assert.equal(epoch,1);
 assert.equal(s.d.__novaChronoIdleRawEpoch,epoch);
 assert.equal(s.d.__novaChronoDroneTraceEpoch,epoch);
 assert.equal(s.g.__novaShapeSweepActive,false,
  'movement epoch is closed after the real Game.update wrapper');
 s.g.__novaDroneChronoTraceEnabled=false;
 s.g.update(1/60);
 assert.equal(s.g.__novaShapeSweepEpoch,epoch+1);
 assert.notEqual(s.d.__novaChronoIdleRawEpoch,s.g.__novaShapeSweepEpoch,
  'old diagnostic must not be reused as a new frame witness');
});
test('optional integration diagnostics do not change real drone motion or attacks',()=>{
 const a=world({enemy:false,withBattlefield:true});
 const b=world({enemy:false,withBattlefield:true});
 a.d.speed=200;b.d.speed=200;
 a.g.__novaDroneChronoTraceEnabled=true;
 for(let i=0;i<5;i++){a.g.update(1/60);b.g.update(1/60);}
 for(const key of ['x','y','hp','attackCd','__novaVX','__novaVY',
   '__novaIdleVX','__novaIdleVY','__novaPhase']){
  assert.equal(a.d[key],b.d[key],key+' must be independent of diagnostics');
 }
 assert.equal(a.shape.hp,b.shape.hp,'damage and farming must be unchanged');
 assert.equal(b.d.__novaChronoIdleRawEpoch,undefined);
});
