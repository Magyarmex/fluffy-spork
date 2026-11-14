'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditShotEvidence}=require('../research/shot-ledger-provenance.cjs');
const pre={x:0,y:1,ttl:0.3};
test('joins exact shot IDs across damage, interception and retirement without inventing misses',()=>{
  const events=[
    {frame:1,shotId:11,kind:'damageTank',preShot:pre},
    {frame:2,shotId:11,kind:'projectileInterception',otherShotId:12,
      preShot:pre,preOtherShot:{x:3,y:4}},
    {frame:3,shotId:11,kind:'projectileRetirement',preShot:pre},
    {frame:3,shotId:12,kind:'coverDamage',preShot:pre}
  ];
  const result=auditShotEvidence(events);
  assert.equal(result.bounded,true);
  assert.equal(result.shotCount,2);
  assert.equal(result.preStatePresent,4);
  assert.equal(result.pairedInterceptionPresent,1);
  assert.equal(result.shots[1].interceptions,1,'peer projectile is a participant');
  assert.deepEqual(result.shots[0],{
    shotId:11,firstFrame:1,lastFrame:3,damageEvents:1,coverEvents:0,
    interceptions:1,retirements:1,missingPreStates:0,missingPairedStates:0
  });
  assert.equal(result.certifiedMissedHits,0);
  assert.equal(result.missedHitClassification,'not-evaluated');
  assert.equal(result.abstentionReason,'no-authoritative-competing-contact-geometry');
});
test('newborn, absent or unknown pre-state is an abstention, not a missed hit',()=>{
  const result=auditShotEvidence([
    {frame:1,shotId:7,kind:'projectileRetirement',preShot:null},
    {frame:2,shotId:8,kind:'projectileInterception',otherShotId:9,
      preShot:pre,preOtherShot:null}
  ]);
  assert.equal(result.preStateMissing,1);
  assert.equal(result.pairedInterceptionMissing,1);
  assert.equal(result.shotCount,3,'unobserved peer still has exact identity');
  assert.equal(result.shots.find(s=>s.shotId===9).missingPreStates,1);
  assert.equal(result.abstentionReason,'incomplete-pre-frame-evidence');
  assert.equal(result.certifiedMissedHits,0);
});
test('boundedness is lost on event or pre-frame overflow',()=>{
  for(const options of [{truncated:1},{preFrameOverflow:1}]){
    const result=auditShotEvidence([],options);
    assert.equal(result.bounded,false);
    assert.equal(result.abstentionReason,'truncated-evidence');
  }
  assert.throws(()=>auditShotEvidence([],{truncated:-1}),/truncation/);
});
test('rejects invalid chronology, identities and unrecognized kinds',()=>{
  assert.throws(()=>auditShotEvidence([{frame:2,shotId:1,kind:'damageTank'},
    {frame:1,shotId:1,kind:'damageTank'}]),/out-of-order/);
  assert.throws(()=>auditShotEvidence([{frame:1,shotId:-1,kind:'damageTank'}]),/invalid/);
  assert.throws(()=>auditShotEvidence([{frame:1,shotId:1,kind:'projectileInterception',
    otherShotId:1}]),/peer/);
  assert.throws(()=>auditShotEvidence([{frame:1,shotId:1,kind:'imaginary'}]),/unknown/);
});
