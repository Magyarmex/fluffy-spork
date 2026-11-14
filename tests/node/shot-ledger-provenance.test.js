'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditShotEvidence}=require('../research/shot-ledger-provenance.cjs');
const pre={x:0,y:1,ttl:0.3};
const target={x:3,y:4,hp:90};
test('joins exact shot IDs across damage, interception and retirement without inventing misses',()=>{
  const events=[
    {frame:1,shotId:11,kind:'damageTank',preShot:pre,preTarget:target},
    {frame:2,shotId:11,kind:'projectileInterception',otherShotId:12,
      preShot:pre,preOtherShot:{x:3,y:4,ttl:.2}},
    {frame:3,shotId:11,kind:'projectileRetirement',preShot:pre},
    {frame:3,shotId:12,kind:'coverDamage',preShot:pre,preTarget:target}
  ];
  const result=auditShotEvidence(events);
  assert.equal(result.bounded,true);
  assert.equal(result.shotCount,2);
  assert.equal(result.preStatePresent,4);
  assert.equal(result.targetStatePresent,2);
  assert.equal(result.targetStateMissing,0);
  assert.equal(result.pairedInterceptionPresent,1);
  assert.equal(result.shots[1].interceptions,1,'peer projectile is a participant');
  assert.deepEqual(result.shots[0],{
    shotId:11,firstFrame:1,lastFrame:3,damageEvents:1,coverEvents:0,
    interceptions:1,retirements:1,missingPreStates:0,missingPairedStates:0
  });
  assert.equal(result.certifiedMissedHits,null);
  assert.equal(result.missedHitClassification,'not-evaluated');
  assert.equal(result.abstentionReason,'no-authoritative-competing-contact-geometry');
});
test('interception peer endpoints without TTL remain incomplete evidence',()=>{
  const result=auditShotEvidence([{frame:1,shotId:1,
    kind:'projectileInterception',otherShotId:2,preShot:pre,
    preOtherShot:{x:3,y:4}}]);
  assert.equal(result.pairedInterceptionPresent,0);
  assert.equal(result.pairedInterceptionMissing,1);
  assert.equal(result.unexplainedMissingPeerStates,1);
  assert.equal(result.certifiedMissedHits,null);
});
test('newborn, absent or unknown pre-state is an abstention, not a missed hit',()=>{
  const result=auditShotEvidence([
    {frame:1,shotId:7,kind:'projectileRetirement',preShot:null},
    {frame:2,shotId:8,kind:'projectileInterception',otherShotId:9,
      preShot:pre,preOtherShot:null}
  ]);
  assert.equal(result.preStateMissing,1);
  assert.equal(result.provenNewbornEvents,0);
  assert.equal(result.unexplainedMissingPreState,1);
  assert.equal(result.pairedInterceptionMissing,1);
  assert.equal(result.shotCount,3,'unobserved peer still has exact identity');
  assert.equal(result.shots.find(s=>s.shotId===9).missingPreStates,1);
  assert.equal(result.abstentionReason,'incomplete-pre-frame-evidence');
  assert.equal(result.certifiedMissedHits,null);
});
test('authoritative birth ceiling distinguishes newborn events without proving a miss',()=>{
  const result=auditShotEvidence([
    {frame:1,shotId:42,kind:'damageShape',preShot:null,
      bornThisFrame:true,preTarget:{x:0,y:0,hp:10}},
    {frame:2,shotId:43,kind:'projectileRetirement',preShot:null,
      bornThisFrame:false}
  ]);
  assert.equal(result.provenNewbornEvents,1);
  assert.equal(result.unexplainedMissingPreState,1);
  assert.equal(result.certifiedMissedHits,null);
  assert.equal(result.abstentionReason,'incomplete-pre-frame-evidence');
});
test('missing interception peers distinguish certified births from unexplained identity gaps',()=>{
  const events=[
    {frame:1,shotId:10,kind:'projectileInterception',otherShotId:11,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true},
    {frame:2,shotId:12,kind:'projectileInterception',otherShotId:13,
      preShot:pre,preOtherShot:null,otherBornThisFrame:false}
  ];
  const result=auditShotEvidence(events);
  assert.equal(result.pairedInterceptionMissing,2);
  assert.equal(result.provenNewbornPeerEvents,1);
  assert.equal(result.unexplainedMissingPeerStates,1);
  assert.equal(result.provenNewbornPeerEvents+result.unexplainedMissingPeerStates,
    result.pairedInterceptionMissing);
  assert.equal(result.abstentionReason,'incomplete-pre-frame-evidence');
  assert.equal(result.certifiedMissedHits,null);
  const bornOnly=auditShotEvidence(events.slice(0,1));
  assert.equal(bornOnly.provenNewbornPeerEvents,1);
  assert.equal(bornOnly.unexplainedMissingPeerStates,0);
  assert.equal(bornOnly.certifiedMissedHits,null);
});
test('contradictory birth and pre-existing witnesses fail closed',()=>{
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:1,kind:'damageTank',bornThisFrame:true,
      preShot:pre,preTarget:target}
  ]),/contradictory/);
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:1,kind:'projectileInterception',otherShotId:2,
      preShot:pre,preOtherShot:pre,otherBornThisFrame:true}
  ]),/contradictory/);
});
test('a projectile observed in an earlier frame cannot be born again later',()=>{
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:20,kind:'projectileRetirement',preShot:pre},
    {frame:2,shotId:20,kind:'damageTank',bornThisFrame:true,preShot:null,preTarget:target}
  ]),/contradictory projectile birth/);
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:30,kind:'projectileRetirement',preShot:pre},
    {frame:2,shotId:31,kind:'projectileInterception',otherShotId:30,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true}
  ]),/contradictory interception peer birth/);
  // Two callbacks in the same frame can legitimately share a newborn identity.
  const valid=auditShotEvidence([
    {frame:1,shotId:40,kind:'damageTank',bornThisFrame:true,preShot:null,preTarget:target},
    {frame:1,shotId:41,kind:'projectileInterception',otherShotId:40,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true}
  ]);
  assert.equal(valid.certifiedMissedHits,null);
  assert.equal(valid.provenNewbornPeerEvents,1);
});
test('same-frame pre-frame evidence cannot later be reclassified as a birth',()=>{
  const earlierPrimary=[
    {frame:1,shotId:50,kind:'damageTank',preShot:pre,preTarget:target},
    {frame:1,shotId:50,kind:'projectileRetirement',preShot:null,bornThisFrame:true}
  ];
  assert.throws(()=>auditShotEvidence(earlierPrimary),/contradictory projectile birth/);
  const earlierPeer=[
    {frame:1,shotId:60,kind:'projectileInterception',otherShotId:61,
      preShot:pre,preOtherShot:pre},
    {frame:1,shotId:62,kind:'projectileInterception',otherShotId:61,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true}
  ];
  assert.throws(()=>auditShotEvidence(earlierPeer),/contradictory interception peer birth/);
  const peerThenPrimary=[
    {frame:1,shotId:70,kind:'projectileInterception',otherShotId:71,
      preShot:pre,preOtherShot:pre},
    {frame:1,shotId:71,kind:'damageShape',preShot:null,
      bornThisFrame:true,preTarget:target}
  ];
  assert.throws(()=>auditShotEvidence(peerThenPrimary),/contradictory projectile birth/);
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:90,kind:'projectileRetirement',preShot:null,bornThisFrame:true},
    {frame:1,shotId:90,kind:'damageTank',preShot:pre,preTarget:target}
  ]),/contradictory projectile pre-frame witness/);
  assert.throws(()=>auditShotEvidence([
    {frame:1,shotId:91,kind:'projectileInterception',otherShotId:92,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true},
    {frame:1,shotId:93,kind:'projectileInterception',otherShotId:92,
      preShot:pre,preOtherShot:pre}
  ]),/contradictory interception peer pre-frame witness/);
  // Repeated legitimate newborn events within one frame remain accepted.
  const newborn=[
    {frame:1,shotId:80,kind:'projectileRetirement',preShot:null,bornThisFrame:true},
    {frame:1,shotId:81,kind:'projectileInterception',otherShotId:80,
      preShot:pre,preOtherShot:null,otherBornThisFrame:true}
  ];
  assert.equal(auditShotEvidence(newborn).provenNewbornPeerEvents,1);
  // A shot born in frame 1 can correctly appear in the frame-2 pre-state.
  const nextFrame=auditShotEvidence([
    {frame:1,shotId:100,kind:'projectileRetirement',preShot:null,bornThisFrame:true},
    {frame:2,shotId:100,kind:'damageTank',preShot:pre,preTarget:target}
  ]);
  assert.equal(nextFrame.preStatePresent,1);
  assert.equal(nextFrame.provenNewbornEvents,1);
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

test('unidentified pre-frame entities force abstention even with complete event endpoints',()=>{
  const events=[{frame:1,shotId:11,kind:'damageTank',preShot:pre,preTarget:target}];
  for(const options of [{preFrameShotUnidentified:1},{preFrameTargetUnidentified:1},
    {preFrameShotUnidentified:2,preFrameTargetUnidentified:3}]){
    const result=auditShotEvidence(events,options);
    assert.equal(result.bounded,true,'identity loss is not a buffer overflow');
    assert.equal(result.abstentionReason,'incomplete-pre-frame-evidence');
    assert.equal(result.certifiedMissedHits,null);
    assert.equal(result.missedHitClassification,'not-evaluated');
  }
  assert.equal(auditShotEvidence(events).abstentionReason,
    'no-authoritative-competing-contact-geometry');
});

test('provenance keeps Sniper fractions separate from certified bullet-step seconds',()=>{
  const sniper={frame:1,shotId:101,otherShotId:102,
    kind:'projectileInterception',source:'sniper',
    timing:'normalized-sweep-fraction',contactFraction:.375,preShot:pre};
  const ttl={frame:2,shotId:103,otherShotId:104,
    kind:'projectileInterception',source:'battlefield-ttl',
    timing:'certified-bullet-step-seconds',contactSeconds:.008,preShot:pre};
  const ok=auditShotEvidence([sniper,ttl]);
  assert.equal(ok.eventCount,2);
  assert.equal(ok.certifiedMissedHits,null);
  for(const invalid of [
    {...sniper,contactSeconds:.008},
    {...sniper,contactFraction:1.1},
    {...sniper,contactFraction:null},
    {...sniper,source:'core'},
    {...ttl,contactSeconds:0},
    {...ttl,contactSeconds:.06},
    {...ttl,contactSeconds:null},
    {...ttl,source:'sniper'},
    {...ttl,timing:'normalized-sweep-fraction'}
  ])assert.throws(()=>auditShotEvidence([invalid]),/timing witness/);
});
