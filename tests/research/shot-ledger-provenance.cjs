'use strict';
// Research-only provenance audit. A pre-update endpoint is NOT a swept
// collision witness. Never classify a missed hit without competing geometry.
function auditShotEvidence(events,{truncated=0,preFrameOverflow=0,preFrameShotUnidentified=0,preFrameTargetUnidentified=0}={}){
  if(!Array.isArray(events))throw new TypeError('events array required');
  if(!Number.isSafeInteger(truncated)||truncated<0||
     !Number.isSafeInteger(preFrameOverflow)||preFrameOverflow<0||
     !Number.isSafeInteger(preFrameShotUnidentified)||preFrameShotUnidentified<0||
     !Number.isSafeInteger(preFrameTargetUnidentified)||preFrameTargetUnidentified<0)
    throw new RangeError('invalid evidence truncation counters');
  const shots=new Map();
  // A projectile witnessed at frame start cannot be born later in that frame.
  // Keep this internal: it is an evidence invariant, not a gameplay counter.
  const preFrameWitnessIds=new Set();
  let lastFrame=0,preStatePresent=0,preStateMissing=0,
      pairedInterceptionPresent=0,pairedInterceptionMissing=0,
      provenNewbornPeerEvents=0,unexplainedMissingPeerStates=0,
      targetStatePresent=0,targetStateMissing=0,
      provenNewbornEvents=0,unexplainedMissingPreState=0;
  for(const e of events){
    if(!e||!Number.isSafeInteger(e.frame)||e.frame<1||
       e.frame<lastFrame||!Number.isSafeInteger(e.shotId)||e.shotId<0)
      throw new TypeError('invalid or out-of-order shot event');
    // Chronology units are not interchangeable. A Sniper fraction of a
    // swept segment is NOT a frame timestamp; only the certified mutual-TTL
    // owner supplies bullet-step seconds. Reject mismatched metadata before
    // a future comparator can accidentally order incomparable events.
    const hasFraction=e.contactFraction!=null,hasSeconds=e.contactSeconds!=null;
    if((hasFraction&&hasSeconds)||
       (hasFraction&&(e.kind!=='projectileInterception'||e.source!=='sniper'||
         e.timing!=='normalized-sweep-fraction'||
         !Number.isFinite(e.contactFraction)||e.contactFraction<0||e.contactFraction>1))||
       (hasSeconds&&(e.kind!=='projectileInterception'||e.source!=='battlefield-ttl'||
         e.timing!=='certified-bullet-step-seconds'||
         !Number.isFinite(e.contactSeconds)||e.contactSeconds<=0||e.contactSeconds>.05))||
       (e.timing==='normalized-sweep-fraction'&&!hasFraction)||
       (e.timing==='certified-bullet-step-seconds'&&!hasSeconds))
      throw new TypeError('invalid or incomparable interception timing witness');
    lastFrame=e.frame;
    const existing=shots.get(e.shotId)||{
      shotId:e.shotId,firstFrame:e.frame,lastFrame:e.frame,
      damageEvents:0,coverEvents:0,interceptions:0,retirements:0,
      missingPreStates:0,missingPairedStates:0
    };
    existing.lastFrame=e.frame;
    if(e.bornThisFrame===true&&(existing.firstFrame<e.frame||preFrameWitnessIds.has(e.shotId)))
      throw new TypeError('contradictory projectile birth after earlier event');
    if(e.bornThisFrame===true&&e.preShot)
      throw new TypeError('contradictory frame-start birth witness');
    if(e.preShot)preFrameWitnessIds.add(e.shotId);
    if(e.preShot&&Number.isFinite(e.preShot.x)&&
       Number.isFinite(e.preShot.y)&&Number.isFinite(e.preShot.ttl))
      preStatePresent++;
    else{
      preStateMissing++;existing.missingPreStates++;
      if(e.bornThisFrame===true)provenNewbornEvents++;
      else unexplainedMissingPreState++;
    }
    if(['damageTank','damageShape','damageDrone','coverDamage'].includes(e.kind)){
      if(e.preTarget&&Number.isFinite(e.preTarget.x)&&
         Number.isFinite(e.preTarget.y)&&Number.isFinite(e.preTarget.hp))
        targetStatePresent++;
      else targetStateMissing++;
    }
    if(e.kind==='projectileRetirement')existing.retirements++;
    else if(e.kind==='projectileInterception'){
      existing.interceptions++;
      if(!Number.isSafeInteger(e.otherShotId)||e.otherShotId<0||
         e.otherShotId===e.shotId)throw new TypeError('invalid interception peer');
      const peer=shots.get(e.otherShotId)||{
        shotId:e.otherShotId,firstFrame:e.frame,lastFrame:e.frame,
        damageEvents:0,coverEvents:0,interceptions:0,retirements:0,
        missingPreStates:0,missingPairedStates:0
      };
      peer.lastFrame=e.frame;
      if(e.otherBornThisFrame===true&&(peer.firstFrame<e.frame||preFrameWitnessIds.has(e.otherShotId)))
        throw new TypeError('contradictory interception peer birth after earlier event');
      if(e.otherBornThisFrame===true&&e.preOtherShot)
        throw new TypeError('contradictory interception peer birth witness');
      if(e.preOtherShot)preFrameWitnessIds.add(e.otherShotId);
      peer.interceptions++;
      // The second projectile is an equal participant, not just metadata
      // on the first projectile's event.
      if(e.preOtherShot&&Number.isFinite(e.preOtherShot.x)&&
         Number.isFinite(e.preOtherShot.y)&&Number.isFinite(e.preOtherShot.ttl))
        pairedInterceptionPresent++;
      else{pairedInterceptionMissing++;existing.missingPairedStates++;
        peer.missingPreStates++;
        if(e.otherBornThisFrame===true)provenNewbornPeerEvents++;
        else unexplainedMissingPeerStates++;
      }
      shots.set(e.otherShotId,peer);
    }else if(e.kind==='coverDamage')existing.coverEvents++;
    else if(['damageTank','damageShape','damageDrone'].includes(e.kind))
      existing.damageEvents++;
    else throw new TypeError('unknown shot event kind: '+String(e.kind));
    shots.set(e.shotId,existing);
  }
  const bounded=truncated===0&&preFrameOverflow===0;
  return {
    bounded,eventCount:events.length,shotCount:shots.size,
    preStatePresent,preStateMissing,provenNewbornEvents,
    unexplainedMissingPreState,targetStatePresent,targetStateMissing,
    preFrameShotUnidentified,preFrameTargetUnidentified,pairedInterceptionPresent,
    pairedInterceptionMissing,provenNewbornPeerEvents,unexplainedMissingPeerStates,
    // Missing endpoints may mean births during the update; do not guess.
    // Even complete endpoints cannot certify swept contact or its priority.
    certifiedMissedHits:null,missedHitClassification:'not-evaluated',
    abstentionReason:!bounded?'truncated-evidence':
      preStateMissing||pairedInterceptionMissing||targetStateMissing||
      preFrameShotUnidentified||preFrameTargetUnidentified?
      'incomplete-pre-frame-evidence':
      'no-authoritative-competing-contact-geometry',
    shots:[...shots.values()].map(s=>Object.freeze({...s}))
  };
}
module.exports={auditShotEvidence};
