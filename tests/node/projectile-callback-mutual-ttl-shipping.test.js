'use strict';
// Research-only composed-owner parity: actual Battlefield mutual-TTL owner,
// Sniper and Polish overlays. Never writes the production runtime.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const {patchBattlefieldMutualInterception}=require('../research/projectile-callback-source-patch.cjs');
const {createProjectileCallbackLedger}=require('../research/projectile-callback-ledger.cjs');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker='    updateBullets(dt) {';
const start=html.indexOf(marker);
assert.ok(start>=0);
let end=start+marker.length,depth=1;
while(depth&&end<html.length){
  if(html[end]==='{')depth++;
  else if(html[end]==='}')depth--;
  end++;
}
assert.equal(depth,0);
const update=new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
  {dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2},
  {CLASSES:{scout:{size:15}}},2250);

function boot(observed){
  class Game {
    constructor(){
      this.bullets=[];this.time=1;this.__novaTerrain=[];
      this.hash={query(_x,_y,_r,out){out.length=0;}};
      this.tmp=[];this.tanks=[];this.drones=[];this.shapes=[];
      this.cam={shake:0};this.tankById=new Map();
    }
  }
  for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
    'updateDrones','update','moveTank','damageTank','damageDrone','damageShape',
    'setClass','addParticles','addRing','addImpactDebris','splashAt',
    'initBulletIntegrity','useAbility','addFlash'])
    Game.prototype[name]=function(){};
  Game.prototype.resolveBulletCollisions=function(){};
  Game.prototype.updateBullets=update;
  Game.prototype.weakenBullet=function(b,damage){
    b.hp-=damage;if(b.hp<=0)b.dead=true;
  };
  Game.prototype.clusterBurst=function(){};
  Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
  class Sfx {resume(){}}
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/audio':m=>{m.exports={Sfx};},
    'game/render':m=>{m.exports={render(){}};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const context={window:{__novaModules:modules},
    console:{info(){},warn(){},error(){}},
    Math,Map,Set,Date,Number,Object,performance:{now:()=>0},
    document:{},navigator:{}};
  for(const file of ['sniper-v1.2.0.js','polish-v1.3.1.js',
    'battlefield-v1.6.0.js','apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js','performance-v1.7.8.js',
    'precision-contact-v1.8.3.js']){
    let source=fs.readFileSync(path.join(root,'nova-updates',file),'utf8');
    if(observed&&file==='battlefield-v1.6.0.js')
      source=patchBattlefieldMutualInterception(source);
    vm.runInNewContext(source,context,{filename:file});
  }
  const m={exports:{}};
  modules['game/engine'](m,m.exports,spec=>spec.includes('classes')
    ?{CLASSES:{scout:{size:15}},lineageForClass:()=>null}
    :{ARENA_HALF:2250});
  return new m.exports.Game();
}
function run(hz,mode){
  const g=boot(mode==='observed'||mode==='throwing');
  const shot=(id,owner,x,vx,hp)=>({
    id,kind:'bullet',ownerId:owner,x,y:0,vx,vy:0,r:3,
    hp,maxHp:hp,baseDmg:8,dmg:8,ttl:.003,pen:0,hits:0,
    shell:false,beam:false,dead:false
  });
  const a=shot(1,1,-20,6000,1),b=shot(2,2,20,-6000,1);
  g.bullets=[a,b];g.__novaShapeSweepEpoch=1;
  g.__novaFrameStartBulletEpoch=1;
  g.__novaFrameStartBulletIdCeiling=4;
  g.tankById.set(1,{id:1,team:1});
  g.tankById.set(2,{id:2,team:2});
  let ledger=null;
  if(mode==='observed'){
    ledger=createProjectileCallbackLedger(g);
    g.__novaShotLedger=ledger;
  }
  if(mode==='throwing')
    g.__novaShotLedger={recordProjectileInterception(){throw Error('observer');}};
  g.updateBullets(1/hz);
  const state={aHp:a.hp,bHp:b.hp,aDead:a.dead,bDead:b.dead,
    bullets:g.bullets.map(x=>x.id)};
  const events=ledger?ledger.snapshot().events:[];
  const counters=ledger?ledger.counters():null;
  return {state,events,counters};
}
for(const hz of [30,60,120,240]){
  test('composed mutual-TTL owner retains combat parity and explicit witness at '+hz+'Hz',()=>{
    const baseline=run(hz,'baseline');
    const observed=run(hz,'observed');
    const broken=run(hz,'throwing');
    assert.deepEqual(observed.state,baseline.state);
    assert.deepEqual(broken.state,baseline.state);
    assert.equal(observed.events.length,1);
    assert.equal(observed.events[0].source,'battlefield-ttl');
    assert.equal(observed.events[0].kind,'projectileInterception');
    assert.deepEqual([observed.events[0].shotId,observed.events[0].otherShotId],[1,2]);
    assert.equal(observed.counters.battlefieldTtlInterceptions,1);
    assert.equal(observed.counters.damageCallbacksCaptured,0);
    assert.equal(observed.counters.observerErrors,0);
  });
}
