'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../browser/bomber-burst-audit.js');
test('Bomber burst witness identifies actual callsites without inventing physical causes',()=>{
 assert.equal(audit.siteFromStack('Error\n at Game.updateBullets (https://host/nova-updates/battlefield-v1.6.0.js:928:17)'),'battlefield-v1.6.0.js:928');
 assert.equal(audit.siteFromStack('Error\n at Game.updateBullets (https://host/index.html:3500:12)'),'index.html:3500');
 assert.equal(audit.siteFromStack('Error\n at unrelated.js:1:2'),'unknown');
 assert.equal(audit.source('battlefield-v1.6.0.js:928'),'battlefield');
 assert.equal(audit.source('index.html:3500'),'core');
 assert.equal(audit.siteFromStack('Error\n at Object.clusterBurst (https://host/tests/browser/bomber-burst-audit.js:28:4)\n at Game.updateBullets (https://host/nova-updates/disciplines-v1.7.0.js:438:9)'),'disciplines-v1.7.0.js:438');
 assert.equal(audit.source('disciplines-v1.7.0.js:438'),'disciplines');
 assert.equal(audit.source('sniper-v1.2.0.js:12'),'other');
});
test('Bomber witness is read-only, preserves return value, child identity and consumed calls',()=>{
 const parent={ownerId:7,ttl:.1,x:10,y:20,shell:true};
 const g={time:5,bullets:[parent],clusterBurst(b){
  if(b.__novaClusterBurstConsumed)return 'already';
  b.__novaClusterBurstConsumed=true;
  this.bullets.push({id:44,ownerId:b.ownerId});
  return 'burst';
 }};
 const original=g.clusterBurst;
 const a=audit.install(g,audit.create(7),()=> 'Error\n at x (https://host/nova-updates/battlefield-v1.6.0.js:999:2)');
 assert.equal(g.clusterBurst(parent),'burst');
 assert.equal(g.clusterBurst(parent),'already');
 assert.equal(g.bullets.length,2);
 assert.equal(g.bullets[1].id,44);
 assert.equal(a.calls,2);assert.equal(a.firstBursts,1);assert.equal(a.suppressedCalls,1);
 assert.equal(a.childrenCreated,1);
 assert.deepEqual(a.byOwner,{pilot:1,other:0,unknown:0});
 assert.deepEqual(a.bySource,{battlefield:1,core:0,disciplines:0,other:0,unknown:0});
 assert.deepEqual(a.byTTL,{positive:1,expired:0,unknown:0});
 assert.equal(a.examples.length,1);
 assert.equal(g.clusterBurst({ownerId:8,ttl:-.01,x:0,y:0,shell:true}), 'burst');
 assert.equal(a.byOwner.other,1);assert.equal(a.byTTL.expired,1);
 assert.equal(a.bySource.battlefield,2);
 assert.equal(a.calls,3);assert.equal(a.firstBursts,2);
 assert.notEqual(g.clusterBurst,original);
});
test('Bomber witness does not sample RNG or change gameplay if source is unknown',()=>{
 let draws=0;const saved=Math.random;Math.random=()=>{draws++;return .5;};
 try{
  const g={bullets:[],clusterBurst(){return 42;}};
  const a=audit.install(g,audit.create(1),()=> 'Error');
  const b={ownerId:1,ttl:0,x:0,y:0};
  assert.equal(g.clusterBurst(b),42);
  assert.equal(draws,0);assert.equal(a.bySource.unknown,1);
  assert.equal(a.byTTL.expired,1);assert.equal(a.childrenCreated,0);
 }finally{Math.random=saved;}
});

test('5,000 seeded burst sequences preserve projectile state and random-stream consumption',()=>{
 function world(){
  let seed=0x9e3779b9,draws=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;draws++;return seed/4294967296;};
  const g={time:12,bullets:[],clusterBurst(b){
   if(b.__novaClusterBurstConsumed)return 'repeat';
   b.__novaClusterBurstConsumed=true;
   const child={id:this.bullets.length+1,ownerId:b.ownerId,
    vx:Math.floor(random()*1000),vy:Math.floor(random()*1000)};
   this.bullets.push(child);return 'created';
  }};
  return {g,draws:()=>draws,seed:()=>seed};
 }
 const base=world(),instrumented=world();
 const report=audit.install(instrumented.g,audit.create(1),
  ()=> 'Error\n at Game.updateBullets (https://host/index.html:3761:8)');
 for(let i=0;i<5000;i++){
  const parent={id:i,ownerId:i%3===0?1:2,ttl:i%2?.1:-.1,x:i,y:0};
  const copy={...parent};
  base.g.bullets.push(parent);instrumented.g.bullets.push(copy);
  assert.equal(instrumented.g.clusterBurst(copy),base.g.clusterBurst(parent));
  if(i%7===0)
   assert.equal(instrumented.g.clusterBurst(copy),base.g.clusterBurst(parent));
 }
 assert.equal(JSON.stringify(instrumented.g.bullets),JSON.stringify(base.g.bullets),
  'research witness must not change projectile state or ordering');
 assert.equal(instrumented.draws(),base.draws(),'no extra gameplay RNG calls');
 assert.equal(instrumented.seed(),base.seed(),'identical final gameplay RNG state');
 assert.equal(report.firstBursts,5000);
 assert.equal(report.suppressedCalls,Math.ceil(5000/7));
 assert.equal(report.bySource.core,5000);
 assert.ok(report.examples.length<=20,'bounded artifact examples');
});
