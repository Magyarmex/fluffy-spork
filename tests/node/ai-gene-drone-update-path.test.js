'use strict';
// Actual Controller updateDrones owner-class dispatch: non-Controller tanks
// can field two legacy drones through the Controller gene. The fix must reach
// that live path, not merely a directly invoked selector.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
  class Game{
    acquireDroneTarget(){return this.nativeTarget;}
    updateDrones(){}
    tryFire(){}damageTank(){}setClass(){}
    getTank(id){return this.tankById.get(id)||null;}
  }
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/audio':m=>{m.exports={Sfx:class{}};},
    'game/render':m=>{m.exports={render(){}};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const classes={CLASSES:{
    twin:{size:15,droneCount:0,droneRole:'hunter',droneLeash:500},
    carrier:{size:15,droneCount:4,droneRole:'hunter',droneLeash:500},
    marksman:{size:15,droneCount:0,droneRole:'hunter',droneLeash:500},
    basic:{size:15,droneCount:0,droneRole:'hunter',droneLeash:500}
  },ABILITIES:{},lineageForClass:id=>id==='carrier'?'controller':'gunner'};
  const window={__novaModules:modules};
  const ctx={window,console:{info(){},warn(){},error(){}},
    Math,Number,Object,Array,Map,Set,Date,performance:{now:()=>0}};
  for(const file of ['controller-v1.3.0.js','drone-targeting-v1.5.1.js',
    'fair-engagement-v1.11.2.js']){
    vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
      ctx,{filename:file});
  }
  const m={exports:{}};
  modules['game/engine'](m,m.exports,request=>request==='./classes'?classes:{});
  const g=new m.exports.Game();
  const owner={id:1,kind:'tank',cls:'twin',gene:'controller',team:'blue',
    x:0,y:0,angle:0,alive:true,hp:100,maxHp:100,swarmT:0,
    droneRespawnT:999,ai:{state:'farm'},isPlayer:false};
  const hidden={id:2,kind:'tank',cls:'basic',team:'red',x:200,y:0,
    alive:true,hp:100,maxHp:100,spawnShieldT:0};
  const visible={id:3,kind:'tank',cls:'basic',team:'red',x:100,y:0,
    alive:true,hp:100,maxHp:100,spawnShieldT:0};
  const drone={id:10,kind:'drone',ownerId:1,x:180,y:0,hp:20,r:8,
    role:'hunter',slot:0,leash:500,speed:120,dmg:10,attackCd:5,
    retargetT:0,orbitA:0,orbitR:70,color:'#4da8ff',hitFlash:0};
  Object.assign(g,{w:320,h:240,cam:{zoom:1},time:5,
    tanks:[owner,hidden,visible],drones:[drone],shapes:[],
    tankById:new Map([[1,owner],[2,hidden],[3,visible]]),
    droneCounts:new Map(),quality:'low',player:null,
    nativeTarget:hidden,hasLineOfSight:()=>true,
    areAllies:(a,b)=>a.team===b.team,areHostile:(a,b)=>a.team!==b.team});
  return {g,owner,hidden,visible,drone};
}
for(const hz of [30,60,120,240]){
  test('live legacy gene-drone update chooses in-frame target at '+hz+'Hz',()=>{
    const {g,hidden,visible,drone}=boot();
    g.updateDrones(1/hz);
    assert.equal(drone.targetRef,visible,
      'non-Controller gene drone must consume the Fair Engagement-gated selector');
    assert.equal(drone.targetId,visible.id);
    assert.ok(Number.isFinite(drone.x)&&Number.isFinite(drone.y));
    assert.equal(hidden.hp,100,'offscreen target must not take incidental damage');
  });
}

test('legacy gene drone drops cached tank when it leaves the legal AI viewport',()=>{
  const {g,visible,drone}=boot();
  g.updateDrones(1/60);
  assert.equal(drone.targetRef,visible);
  visible.x=240;drone.retargetT=.20;
  g.updateDrones(1/60);
  assert.equal(drone.targetRef,null,'staggered retarget memory must not track live offscreen tank coordinates');
  assert.equal(drone.targetId,-1);
});
test('cached Sniper public relay and human drone autonomy remain intact',()=>{
  for(const mode of ['sniper','human']){
    const {g,owner,visible,drone}=boot();
    g.updateDrones(1/60);
    visible.x=240;drone.retargetT=.20;
    if(mode==='sniper'){
      owner.cls='marksman';owner.__novaSpotterContactId=visible.id;
      owner.__novaSpotterContactUntil=6;
    }else{owner.isPlayer=true;owner.ai=null;}
    g.updateDrones(1/60);
    assert.equal(drone.targetRef,visible,mode+' must retain a legal cached pursuit');
  }
});
