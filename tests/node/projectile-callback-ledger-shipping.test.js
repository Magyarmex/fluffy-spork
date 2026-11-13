'use strict';
// The real shipping core and Battlefield overlays must retain damage parity
// with an unscoped research ledger; no owner-based shot ID inference.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createProjectileCallbackLedger} = require('../research/projectile-callback-ledger.cjs');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function coreMethod(instrument = false) {
  const marker='    updateBullets(dt) {', at=html.indexOf(marker);
  assert.ok(at>=0,'materialized shipping updater missing');
  let pos=at+marker.length, depth=1;
  while(depth && pos<html.length) {
    if(html[pos]==='{') depth++;
    else if(html[pos]==='}') depth--;
    pos++;
  }
  assert.equal(depth,0);
  let body=html.slice(at+marker.length,pos-1);
  if (instrument) {
    // Research-only source instrumentation of the *extracted shipping core*.
    // This does not modify production and does not instrument Battlefield TTL.
    const needles=[
      'this.damageTank(e, b.dmg, b.ownerId, Math.cos(ang) * (b.knock || 0) * 0.006, Math.sin(ang) * (b.knock || 0) * 0.006);',
      'this.damageShape(e, b.dmg, b.vx, b.vy);',
      'this.damageDrone(e, b.dmg, b.ownerId);'
    ];
    for(const needle of needles) {
      assert.ok(body.includes(needle),'shipping direct callback changed: '+needle);
      body=body.replace(needle,'this.__novaShotLedger.withProjectile(b, () => '+needle.slice(0,-1)+');');
    }
  }
  return new Function('types_1','classes_1','M',
    'return function(dt){'+body+'}')(
    {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
    {CLASSES:{scout:{size:15}}},2250);
}
function boot(instrument = false, kind = 'tank') {
  class Game {
    constructor() {
      this.bullets=[];this.burstOrigins=[];this.time=1;this.__novaTerrain=[];
      this.hash={query(_x,_y,_r,out){out.length=0;}};
      this.tmp=[];this.tanks=[];this.drones=[];this.shapes=[];
      this.cam={shake:0};this.tankById=new Map();
    }
  }
  for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
    'updateDrones','update','moveTank','damageTank','damageDrone',
    'damageShape','setClass','addParticles','addRing','addImpactDebris',
    'splashAt','initBulletIntegrity','useAbility','addFlash'])
    Game.prototype[name]=function(){};
  Game.prototype.resolveBulletCollisions=function(){};
  Game.prototype.updateBullets=coreMethod(instrument);
  Game.prototype.weakenBullet=function(b,damage){b.hp-=damage;if(b.hp<=0)b.dead=true;};
  Game.prototype.clusterBurst=function(b){this.burstOrigins.push(b.id);};
  Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
  Game.prototype.getTank=()=>null;
  class Sfx {resume(){}}
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/audio':m=>{m.exports={Sfx};},
    'game/render':m=>{m.exports={render(){}};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const context={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
    Math,Map,Set,Date,Number,Object,performance:{now:()=>0},document:{},navigator:{}};
  for(const file of ['sniper-v1.2.0.js','polish-v1.3.1.js',
    'battlefield-v1.6.0.js','apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js','performance-v1.7.8.js',
    'precision-contact-v1.8.3.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
      context,{filename:file});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,spec=>spec.includes('classes')
    ? {CLASSES:{scout:{size:15}},lineageForClass:()=>null}
    : {ARENA_HALF:2250});
  const g=new m.exports.Game();
  const target={id:2,kind,cls:'scout',x:40,y:0,hp:100,alive:true,r:15,ownerId:2};
  g.tanks=[target];
  g.hash.query=(_x,_y,_r,out)=>{out.length=0;out.push(target);};
  g.damageTank=(t,d)=>{t.hp-=d;};
  g.damageShape=(t,d)=>{t.hp-=d;};
  g.damageDrone=(t,d)=>{t.hp-=d;};
  g.bullets=[{id:101,kind:'bullet',ownerId:1,x:0,y:0,vx:6000,vy:0,
    r:3,dmg:20,pen:0,ttl:.005,hits:0,dead:false,shell:false,beam:false}];
  return {g,target};
}
for(const fps of [30,60,120,240]) {
  test('materialized shipping core: observer parity and unknown shot identity at '+fps+'Hz',()=>{
    const baseline=boot(), observed=boot();
    const ledger=createProjectileCallbackLedger(observed.g);
    ledger.install();
    baseline.g.updateBullets(1/fps);
    observed.g.updateBullets(1/fps);
    assert.equal(observed.target.hp,baseline.target.hp);
    assert.equal(observed.g.bullets.length,baseline.g.bullets.length);
    const events=ledger.snapshot().events.filter(e=>e.kind==='damageTank');
    assert.equal(events.length,1);
    assert.equal(events[0].targetId,2);
    assert.equal(events[0].shotId,null,
      'without call-site scope, a callback cannot identify its projectile');
    assert.equal(events[0].attribution,'unknown');
    ledger.uninstall();
  });
}

test('research-instrumented materialized core captures exact shot ID at 240Hz',()=>{
  const baseline=boot(), observed=boot(true);
  const ledger=createProjectileCallbackLedger(observed.g);
  observed.g.__novaShotLedger=ledger; ledger.install();
  baseline.g.updateBullets(1/240);
  observed.g.updateBullets(1/240);
  assert.equal(observed.target.hp,baseline.target.hp);
  assert.equal(observed.g.bullets.length,baseline.g.bullets.length);
  const events=ledger.snapshot().events.filter(e=>e.kind==='damageTank');
  assert.equal(events.length,1);
  assert.equal(events[0].shotId,101);
  assert.equal(events[0].attribution,'direct');
  assert.equal(ledger.snapshot().allCapturedCallbacksAttributed,true);
});
test('core-only instrumentation must not falsely attribute Battlefield TTL recovery',()=>{
  const observed=boot(true), ledger=createProjectileCallbackLedger(observed.g);
  observed.g.__novaShotLedger=ledger; ledger.install();
  observed.g.updateBullets(1/30);
  const events=ledger.snapshot().events.filter(e=>e.kind==='damageTank');
  assert.equal(events.length,1);
  assert.equal(events[0].shotId,null);
  assert.equal(events[0].attribution,'unknown');
});

for(const kind of ['shape','drone']) {
  test('research-instrumented shipping core labels '+kind+' projectile contact',()=>{
    const baseline=boot(false,kind), observed=boot(true,kind);
    const ledger=createProjectileCallbackLedger(observed.g);
    observed.g.__novaShotLedger=ledger; ledger.install();
    baseline.g.updateBullets(1/240);
    observed.g.updateBullets(1/240);
    assert.equal(observed.target.hp,baseline.target.hp);
    assert.equal(observed.target.hp,80);
    const events=ledger.snapshot().events;
    assert.equal(events.length,1);
    assert.equal(events[0].kind,kind==='shape'?'damageShape':'damageDrone');
    assert.equal(events[0].shotId,101);
    assert.equal(events[0].attribution,'direct');
  });
}
