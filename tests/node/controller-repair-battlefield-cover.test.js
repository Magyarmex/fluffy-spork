'use strict';
// Actual shipping Battlefield + Live Vector + Fair Engagement composition:
// destructible/permanent cover is a tactical way to earn Controller repair.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const files=['battlefield-v1.6.0.js','second-body-live-vector-v1.10.7.js',
  'fair-engagement-v1.11.2.js'];

function boot({destructible=false,ai=false}={}){
  class Game{
    updateDrones(){}
    getTank(id){return this.tankById.get(id)||null;}
    updateBullets(){}update(){}moveTank(){}
    spawnPlayer(){}spawnShape(){}spawnPowerup(){}tryFire(){}
    randSpawnPos(){return{x:1500,y:1500};}
    addParticles(){}addRing(){}splashAt(){}
  }
  const modules={
    'game/engine':m=>{m.exports.Game=Game;},
    'game/ai':m=>{m.exports.updateAI=()=>{};},
    'game/render':m=>{m.exports.render=()=>{};},
    'game/audio':m=>{m.exports.Sfx=class{};}
  };
  const win={__novaModules:modules,NOVATips:{registerMany(){}}};
  const ctx={window:win,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},
    Math,Number,Map,Set,Date,Object,Array,WeakMap,
    performance:{now:()=>0}};
  for(const file of files)vm.runInNewContext(
    fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
    ctx,{filename:file});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,spec=>{
    if(spec==='./classes')return{CLASSES:{carrier:{size:15,droneLeash:650},
      gunner:{size:15}},lineageForClass:id=>id==='carrier'?'controller':'gunner'};
    if(spec==='./types')return{ARENA_HALF:2250};
    throw Error('unexpected '+spec);
  });
  const owner={id:1,kind:'tank',cls:'carrier',team:'blue',alive:true,
    isPlayer:!ai,ai:ai?{state:'wander',targetId:-1,isElite:false}:null,
    x:0,y:0,hp:100,maxHp:100,angle:0,swarmT:0,
    __novaSwarm:{active:false,power:0}};
  const enemy={id:2,kind:'tank',cls:'gunner',team:'red',alive:true,
    x:100,y:0,hp:100,maxHp:100,spawnShieldT:0};
  const drone={id:11,kind:'drone',ownerId:1,x:0,y:20,r:8,hp:30,maxHp:100,
    speed:200,__novaPhase:'recover',__novaPhaseT:0,attackCd:0,
    __lvRepairing:true,__lvRepairWait:0,__lvLastHp:30};
  const wall={id:-1000,kind:'terrain',shape:'rect',x:50,y:0,w:12,h:120,
    type:destructible?'cover':'wall',destructible,solid:true,hp:100,maxHp:100};
  const g=new m.exports.Game();
  Object.assign(g,{time:10,w:800,h:600,cam:{zoom:1,x:0,y:0},
    tanks:[owner,enemy],drones:[drone],shapes:[],bullets:[],
    player:ai?null:owner,tankById:new Map([[1,owner],[2,enemy]]),
    __novaTerrain:[wall],__novaBattlefield:{coverBroken:0},
    areAllies:(a,b)=>a.team===b.team,
    areHostile:(a,b)=>a.team!==b.team});
  return{g,owner,enemy,drone,wall};
}

for(const destructible of [false,true])for(const ai of [false,true]){
  const label=(ai?'AI':'human')+' Controller / '+(destructible?'destructible':'permanent')+' cover';
  test(label+': cover permits repair, opened lane interrupts it',()=>{
    const s=boot({destructible,ai});
    assert.equal(s.g.hasLineOfSight(s.drone.x,s.drone.y,s.enemy.x,s.enemy.y,2),false);
    s.g.updateDrones(1/60);
    const healed=s.drone.hp;
    assert.ok(healed>30,'repair must work while genuine cover blocks the enemy');
    s.wall.solid=false;s.wall.hp=0;
    assert.equal(s.g.hasLineOfSight(s.drone.x,s.drone.y,s.enemy.x,s.enemy.y,2),true);
    s.g.updateDrones(1/60);
    assert.equal(s.drone.hp,healed,'enemy now has a clear line; repair must stop');
  });
}

for(const destructible of [false,true])for(const ai of [false,true]){
  test((ai?'AI':'human')+' Controller: cover between repairing drone and hostile drone earns real repair',()=>{
    const s=boot({destructible,ai});
    s.drone.x=140;s.drone.y=0;
    s.enemy.x=1000;s.enemy.y=0; // Hostile tank itself is not local.
    s.wall.x=230;s.wall.y=0;s.wall.w=12;s.wall.h=120;
    s.g.drones.push({id:40,kind:'drone',ownerId:2,x:320,y:0,
      r:8,hp:100,maxHp:100});
    assert.equal(s.g.hasLineOfSight(s.drone.x,s.drone.y,320,0,2),false);
    s.g.updateDrones(1/60);
    const sheltered=s.drone.hp;
    assert.ok(sheltered>30,'solid cover should allow repair from hostile drones');
    s.wall.solid=false;s.wall.hp=0;
    assert.equal(s.g.hasLineOfSight(s.drone.x,s.drone.y,320,0,2),true);
    s.g.updateDrones(1/60);
    assert.equal(s.drone.hp,sheltered,'opening the lane exposes the healer');
  });
}
