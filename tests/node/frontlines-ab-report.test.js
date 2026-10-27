'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSnapshot,extract,analyzePair}=require('../../scripts/frontlines-ab-report.cjs');
function sample(patch={},meta={}){
 return{metadata:{layout:'CROSSFIRE',seed:17,...meta},frontline:{counts:{
  announcements:2,aiPhysicalArrivals:4,hostileOutsideBotSeconds:200,
  hostileBotSeconds:300,pilotAliveSeconds:120,pilotDeathCensors:0,
  observedContests:3,neutralXP:600,aiArrivals:999,...patch}}};
}
test('COPY ECOLOGY text and raw JSON both parse without private telemetry',()=>{
 const s=sample();
 assert.deepEqual(parseSnapshot(JSON.stringify(s)),s);
 assert.deepEqual(parseSnapshot('NOVA TANKS · LIVING FRONT 1.12.0\n'+JSON.stringify(s)),s);
 assert.throws(()=>parseSnapshot('no snapshot'),/missing JSON/);
});
test('paired physical arrival rates use OUT-S, never all BOT-S or memory-only AI MEM',()=>{
 const on=sample(),off=sample({aiPhysicalArrivals:1,hostileOutsideBotSeconds:100,
  observedContests:2,neutralXP:360,aiArrivals:0});
 const r=analyzePair(on,off);
 assert.equal(r.on.rates.arrivalsPer100OutsideBotSeconds,2);
 assert.equal(r.off.rates.arrivalsPer100OutsideBotSeconds,1);
 assert.equal(r.delta.arrivalsPer100OutsideBotSeconds,1);
 assert.equal(r.delta.contestsPerPilotMinute,.5);
 assert.equal(r.delta.neutralXpPerPilotMinute,120);
 assert.equal(r.on.counts.aiArrivals,undefined,'memory-only counter is not a comparator');
});
test('zero exposure, early deaths and small samples produce explicit warnings, not invented rates',()=>{
 const on=sample({hostileOutsideBotSeconds:0,pilotDeathCensors:1}),
  off=sample({hostileOutsideBotSeconds:20});
 const r=analyzePair(on,off);
 assert.equal(r.on.rates.arrivalsPer100OutsideBotSeconds,null);
 assert.equal(r.delta.arrivalsPer100OutsideBotSeconds,null);
 assert.ok(r.warnings.some(w=>/Zero outside-sector/.test(w)));
 assert.ok(r.warnings.some(w=>/Pilot death/.test(w)));
 assert.ok(r.warnings.some(w=>/Less than 100/.test(w)));
});
test('unmatched seeds/layouts and missing or impossible exposure cannot be silently compared',()=>{
 assert.throws(()=>analyzePair(sample(),sample({}, {seed:18})),/unmatched experiment seeds/);
 assert.throws(()=>analyzePair(sample(),sample({}, {layout:'FOUR GATES'})),/unmatched Battlefield/);
 assert.throws(()=>extract(sample({hostileOutsideBotSeconds:400})),/exceeds total/);
 const bad=sample();delete bad.frontline.counts.hostileOutsideBotSeconds;
 assert.throws(()=>extract(bad),/missing Frontlines counter/);
});
