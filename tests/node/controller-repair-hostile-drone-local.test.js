'use strict';
// Regression: a recovering Controller drone should assess hostile drones
// around its OWN physical position, not the Controller hull's position.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const anchor='  function repairDrone(g,d,owner,state,dt,threatCache){';
assert.equal(source.split(anchor).length,2,'exactly one shipping repair entrypoint');
const instrumented=source.replace(anchor,
  '  window.__NOVA_REPAIR_TEST__=repairDrone;\n'+anchor);

function boot({droneX=140,enemyDroneX=320,enemyDroneY=0,
  enemyOwnerX=1000,enemyOwnerAlive=true,enemyDroneHp=100,
  ai=false,visible=true,viewport=true,enemyTeam='red'}={}){
  class Game {updateDrones(){}}
  const modules={'game/engine':m=>{m.exports.Game=Game;}};
  const window={__novaModules:modules,NOVATips:{registerMany(){}}};
  if(ai)window.__NOVA_FAIR_ENGAGEMENT__={
    inGameplayViewport:(_g,_owner,target)=>viewport&&target.id===30
  };
  const ctx={window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},
    Math,Number,Object,Array,Map,Set,WeakMap,Date};
  vm.runInNewContext(instrumented,ctx,{filename:'second-body-live-vector-v1.10.7.js'});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,()=>({
    CLASSES:{carrier:{droneLeash:650}},lineageForClass:()=> 'controller'
  }));
  const owner={id:1,kind:'tank',cls:'carrier',team:'blue',
    x:0,y:0,alive:true,hp:100,maxHp:100,isPlayer:!ai,
    ai:ai?{isElite:false}:null};
  const rival={id:2,kind:'tank',cls:'carrier',team:enemyTeam,
    x:enemyOwnerX,y:0,alive:enemyOwnerAlive,hp:100,maxHp:100};
  const drone={id:10,kind:'drone',ownerId:1,x:droneX,y:0,r:8,
    hp:30,maxHp:100,speed:180,__novaPhase:'recover',
    __lvRepairing:true,__lvRepairWait:0,__lvLastHp:30};
  const threat={id:30,kind:'drone',ownerId:2,x:enemyDroneX,
    y:enemyDroneY,r:8,hp:enemyDroneHp,maxHp:100};
  const g=new m.exports.Game();
  Object.assign(g,{time:10,tanks:[owner,rival],drones:[drone,threat],
    getTank:id=>id===1?owner:id===2?rival:null,
    areAllies:(a,b)=>a.team===b.team,
    areHostile:(a,b)=>a.team!==b.team,
    hasLineOfSight:()=>visible,
    firstTerrainHit:()=>null,isTerrainSafe:()=>true});
  const tick=(dt=1/60,cache={candidates:null})=>
    window.__NOVA_REPAIR_TEST__(g,drone,owner,{active:false},dt,cache);
  return {g,owner,rival,drone,threat,tick,window};
}

test('materialized production loads Live Vector after the Controller engine',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const base=html.indexOf('nova-updates/controller-v1.3.0.js');
  const live=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  assert.ok(base>=0&&live>base,'repair logic must run in the playable runtime');
});

for(const hz of [30,60,120,240]){
  test('visible hostile drone beside healer but outside hull radius interrupts repair at '+hz+'Hz',()=>{
    const s=boot();
    s.tick(1/hz);
    assert.equal(s.drone.hp,30,'physical local threat must interrupt service');
  });
}

test('hostile drone near hull but far from healer cannot suppress safe repair',()=>{
  const s=boot({droneX:-140,enemyDroneX:200});
  s.tick();
  assert.ok(s.drone.hp>30,'repair must depend on actual drone exposure');
});

test('cover blocking healer-to-hostile-drone sight permits repair',()=>{
  const s=boot({visible:false});
  s.tick();
  assert.ok(s.drone.hp>30);
});

test('AI cannot use an offscreen hostile drone to interrupt repair',()=>{
  const s=boot({ai:true,viewport:false});
  s.tick();
  assert.ok(s.drone.hp>30);
});

test('AI responds to legitimately visible hostile drone near its healer',()=>{
  const s=boot({ai:true,viewport:true});
  s.tick();
  assert.equal(s.drone.hp,30);
});

test('allied and dead hostile drones do not interrupt repair',()=>{
  for(const opts of [{enemyTeam:'blue'},{enemyDroneHp:0}]){
    const s=boot(opts);s.tick();
    assert.ok(s.drone.hp>30);
  }
});

test('each repairing drone uses its own local threat distance with a shared owner cache',()=>{
  const s=boot({droneX:140,enemyDroneX:320});
  const other={...s.drone,id:11,x:-140,__lvLastHp:30};
  s.g.drones.push(other);
  const cache={candidates:null};
  s.tick(1/60,cache);
  s.window.__NOVA_REPAIR_TEST__(s.g,other,s.owner,{active:false},1/60,cache);
  assert.equal(s.drone.hp,30,'exposed drone cannot heal');
  assert.ok(other.hp>30,'sheltered squadmate can heal');
});

test('hostile owner beyond range cannot suppress repair on its own',()=>{
  const s=boot({enemyDroneX:900});
  s.tick();
  assert.ok(s.drone.hp>30);
});
