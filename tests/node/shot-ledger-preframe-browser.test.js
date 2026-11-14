'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
// Execute the exact browser producer closures against small adversarial
// worlds. This is not a full browser run, but prevents source drift between
// pre-frame snapshots and the tests of their exact-ID/collection semantics.
const browserSource=fs.readFileSync(path.join(__dirname,
  '../browser/projectile-callback-ledger-natural-smoke.cjs'),'utf8');
const start=browserSource.indexOf('      const MAX_PRE_FRAME_SHOTS=4096;');
const end=browserSource.indexOf('      const fingerprint=()=>{',start);
assert.ok(start>=0&&end>start,'pre-frame producer must exist');
const producer=browserSource.slice(start,end);
function sample(g){
  return new Function('g',`let preFrameShotOverflow=0,preFrameTargetUnidentified=0;
    ${producer}
    return {shots:snapshotPreFrameShots(),targets:snapshotPreFrameTargets(),
      preFrameShotOverflow,preFrameTargetUnidentified};`)(g);
}
function world(){
  return {
    bullets:[{id:5,x:10,y:20,vx:3,vy:4,ttl:0.5,dead:false,hp:2,
      pen:1,hits:0,r:3,ownerId:9,dmg:12}],
    tanks:[{id:8,x:30,y:40,r:15,hp:100,alive:true}],
    shapes:[{id:8,x:50,y:60,r:12,hp:30,alive:true}],
    drones:[{id:3,x:70,y:80,r:5,hp:20,alive:true}],
    __novaTerrain:[{id:-1000,x:90,y:100,w:64,h:24,shape:'rect',hp:80,solid:true}]
  };
}
test('browser pre-frame producer preserves exact shot identity and immutable values',()=>{
  const g=world(),a=sample(g);
  assert.equal(a.shots.get(5).x,10);
  assert.equal(a.shots.get(5).ttl,0.5);
  g.bullets[0].x=900;
  assert.equal(a.shots.get(5).x,10,'snapshot must not alias live projectile');
  assert.equal(a.preFrameShotOverflow,0);
});
test('same target ID in different real collections cannot be misattributed',()=>{
  const a=sample(world());
  assert.equal(a.targets.damageTank.get(8).x,30);
  assert.equal(a.targets.damageShape.get(8).x,50);
  assert.equal(a.targets.coverDamage.get(-1000).x,90);
  assert.equal(a.targets.coverDamage.get(-1000).w,64);
  assert.equal(a.targets.coverDamage.get(-1000).shape,'rect');
  assert.equal(a.targets.damageDrone.get(3).x,70);
});
test('malformed or duplicate shot identity invalidates frame rather than guessing',()=>{
  const g=world();
  g.bullets.push({...g.bullets[0]});
  const a=sample(g);
  assert.equal(a.shots,null);
  assert.equal(a.preFrameShotOverflow,1);
});
test('unidentified target cannot poison valid target snapshots',()=>{
  const g=world();
  g.tanks.push({id:'unidentified',x:1,y:1,hp:1});
  const a=sample(g);
  assert.equal(a.targets.damageTank.get(8).hp,100);
  assert.equal(a.preFrameTargetUnidentified,1);
});
