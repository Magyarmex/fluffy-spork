'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../browser/frontlines-offer-policy.js');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const harness=fs.readFileSync(path.join(__dirname,'../browser/frontlines-natural-match-ab.cjs'),'utf8');
function offered(tier=1,level=10){
 return withSeed(1517802,()=>{
  const g=bootGame();g.player.level=level;g.player.spawnShieldT=0;
  g.tryOffer(tier);
  assert.equal(g.paused,true);assert.equal(g.pendingOffer,tier);
  return g;
 });
}
test('reject unknown offer policies before any match is run',()=>{
 for(const bad of ['',undefined,'ignore','tier1:scout','tier1:bomber','tier2:twin','CENSOR',null])
  assert.throws(()=>policy.parse(bad),/NOVA_OFFER_POLICY/);
 assert.deepEqual(policy.parse('defer'),{kind:'defer'});
 assert.deepEqual(policy.parse('censor'),{kind:'censor'});
 for(const id of ['cannon','twin','marksman','carrier','guard'])
  assert.deepEqual(policy.parse('tier1:'+id),{kind:'tier1',classId:id});
});
test('censor records exact offer and never advances, chooses or shields',()=>{
 const g=offered(),time=g.time,shield=g.player.spawnShieldT;
 const result=policy.handle(g,policy.parse('censor'));
 assert.deepEqual(result,{action:'censor',censored:true});
 assert.equal(g.time,time);assert.equal(g.paused,true);assert.equal(g.pendingOffer,1);
 assert.equal(g.player.spawnShieldT,shield);assert.equal(g.__novaResearchOfferActions,undefined);
 assert.equal(g.__novaResearchOfferCensor.choice,'censor');
 assert.equal(g.__novaResearchOfferCensor.tier,1);
 assert.match(g.__novaResearchOfferCensor.beforePhysicalHash,/^[0-9a-f]{8}:[0-9a-f]{8}$/);
 assert.throws(()=>policy.handle(g,policy.parse('censor')),/duplicate/);
});
test('pre-offer physical hash is deterministic and does not mutate the game',()=>{
 const a=offered(),b=offered();
 assert.equal(policy.physicalHash(a),policy.physicalHash(b));
 const before=policy.physicalHash(a);
 assert.equal(policy.physicalHash(a),before);
 a.player.hp-=1;assert.notEqual(policy.physicalHash(a),before);
});
test('defer uses actual Game.dismissOffer, resumes and grants canonical evolution grace',()=>{
 const g=offered(),r=policy.handle(g,policy.parse('defer'));
 assert.equal(r.action,'later');assert.equal(g.paused,false);assert.equal(g.pendingOffer,null);
 assert.ok(g.player.spawnShieldT>=1.8);
 assert.equal(g.__novaResearchOfferActions.length,1);
 assert.equal(g.__novaResearchOfferActions[0].choice,'later');
 assert.equal(policy.handle(g,policy.parse('defer')).action,'none');
 assert.equal(g.__novaResearchOfferActions.length,1);
});
test('tier1 policy legally evolves the actual player, with no invisible extra step',()=>{
 for(const id of ['cannon','twin','marksman','carrier','guard']){
  const g=offered(),time=g.time;
  const r=policy.handle(g,policy.parse('tier1:'+id));
  assert.equal(r.action,'class');assert.equal(g.player.cls,id);
  assert.equal(g.player.tier,1);assert.equal(g.paused,false);assert.equal(g.pendingOffer,null);
  assert.equal(g.time,time);assert.equal(g.__novaResearchOfferActions[0].classId,id);
 }
});
test('cap-retained Later offer is not repeatedly resolved while unpaused',()=>{
 const g=offered(3,45);g.player.tier=2;
 const r=policy.handle(g,policy.parse('defer'));
 assert.equal(r.action,'later');assert.equal(g.paused,false);assert.equal(g.pendingOffer,3);
 const shield=g.player.spawnShieldT;
 for(let i=0;i<5;i++)assert.equal(policy.handle(g,policy.parse('defer')).action,'none');
 assert.equal(g.__novaResearchOfferActions.length,1);assert.equal(g.player.spawnShieldT,shield);
});
test('tier1 selection falls back to explicit Later for later offers',()=>{
 const g=offered(2,20);g.player.tier=1;
 const r=policy.handle(g,policy.parse('tier1:cannon'));
 assert.equal(r.action,'later');assert.equal(g.__novaResearchOfferActions[0].choice,'later');
 assert.equal(g.paused,false);
});
test('invalid paused offers fail closed instead of silently advancing',()=>{
 const g=offered();g.pendingOffer=99;
 assert.throws(()=>policy.handle(g,policy.parse('defer')),/invalid pending/);
 assert.equal(g.paused,true);
});
test('canonical manual match integrates both pre-step and post-step offer guards and censor output',()=>{
 assert.match(harness,/offer\.handle\(g,policy\)\.censored\)break;\s*g\.update\(dt\)/);
 assert.match(harness,/g\.update\(dt\);\s*g\.__novaResearchFrames=.*?;\s*if\(offer\.handle\(g,policy\)\.censored\)break;/s);
 assert.match(harness,/last\.offerCensored/);
 assert.match(harness,/offerResearch:\{/);
 assert.match(harness,/offerPolicy:OFFER_POLICY/);
});
