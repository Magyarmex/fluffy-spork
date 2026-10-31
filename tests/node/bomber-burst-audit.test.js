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
 assert.deepEqual(a.bySource,{battlefield:1,core:0,unknown:0});
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
