'use strict';
// Research-only provenance audit. A pre-update endpoint is NOT a swept
// collision witness. Never classify a missed hit without competing geometry.
function auditShotEvidence(events,{truncated=0,preFrameOverflow=0,preFrameTargetUnidentified=0}={}){
  if(!Array.isArray(events))throw new TypeError('events array required');
  if(!Number.isSafeInteger(truncated)||truncated<0||
     !Number.isSafeInteger(preFrameOverflow)||preFrameOverflow<0||
     !Number.isSafeInteger(preFrameTargetUnidentified)||preFrameTargetUnidentified<0)
    throw new RangeError('invalid evidence truncation counters');
  const shots=new Map();
  let lastFrame=0,preStatePresent=0,preStateMissing=0,
      pairedInterceptionPresent=0,pairedInterceptionMissing=0,
      targetStatePresent=0,targetStateMissing=0;
  for(const e of events){
    if(!e||!Number.isSafeInteger(e.frame)||e.frame<1||
       e.frame<lastFrame||!Number.isSafeInteger(e.shotId)||e.shotId<0)
      throw new TypeError('invalid or out-of-order shot event');
    lastFrame=e.frame;
    const existing=shots.get(e.shotId)||{
      shotId:e.shotId,firstFrame:e.frame,lastFrame:e.frame,
      damageEvents:0,coverEvents:0,interceptions:0,retirements:0,
      missingPreStates:0,missingPairedStates:0
    };
    existing.lastFrame=e.frame;
    if(e.preShot&&Number.isFinite(e.preShot.x)&&
       Number.isFinite(e.preShot.y)&&Number.isFinite(e.preShot.ttl))
      preStatePresent++;
    else{preStateMissing++;existing.missingPreStates++;}
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
      peer.interceptions++;
      // The second projectile is an equal participant, not just metadata
      // on the first projectile's event.
      if(e.preOtherShot&&Number.isFinite(e.preOtherShot.x)&&
         Number.isFinite(e.preOtherShot.y))pairedInterceptionPresent++;
      else{pairedInterceptionMissing++;existing.missingPairedStates++;
        peer.missingPreStates++;}
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
    preStatePresent,preStateMissing,targetStatePresent,targetStateMissing,
    preFrameTargetUnidentified,pairedInterceptionPresent,
    pairedInterceptionMissing,
    // Missing endpoints may mean births during the update; do not guess.
    // Even complete endpoints cannot certify swept contact or its priority.
    certifiedMissedHits:0,missedHitClassification:'not-evaluated',
    abstentionReason:!bounded?'truncated-evidence':
      preStateMissing||pairedInterceptionMissing||targetStateMissing?
      'incomplete-pre-frame-evidence':
      'no-authoritative-competing-contact-geometry',
    shots:[...shots.values()].map(s=>Object.freeze({...s}))
  };
}
module.exports={auditShotEvidence};
