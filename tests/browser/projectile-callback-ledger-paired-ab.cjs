'use strict';
// Research-only full-game paired trial. Requires the same local HTTP server
// as projectile-callback-ledger-natural-smoke.cjs (port 8765).
// No source changes are made to the shipping game.
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {comparePhysicalTraces}=require('../research/shot-ledger-trace-compare.cjs');
const {auditShotEvidence}=require('../research/shot-ledger-provenance.cjs');
function arm(mode,seed,layoutIndex){
  const result=spawnSync(process.execPath,
    [path.join(__dirname,'projectile-callback-ledger-natural-smoke.cjs')],{
      env:{...process.env,NOVA_SHOT_LEDGER_ARM:mode,NOVA_SHOT_LEDGER_SEED:seed,NOVA_SHOT_LEDGER_LAYOUT_INDEX:String(layoutIndex)},
      encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024
    });
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(mode+' browser arm failed:\n'+
    (result.stderr||'')+'\n'+(result.stdout||'').slice(-4000));
  const line=result.stdout.split(/\r?\n/).findLast(s=>s.includes('"research":"shot-ledger-browser-smoke"'));
  if(!line)throw Error(mode+' arm did not emit browser smoke JSON');
  const data=JSON.parse(line);
  assert.equal(data.arm,mode,'browser arm identity');
  assert.equal(data.seed,seed,'browser seed identity');
  assert.equal(data.layoutIndex,layoutIndex,'browser layout identity');
  assert.equal(data.observerErrors,0,'observer errors in '+mode);
  return data;
}
// Three distinct deterministic worlds, one per canonical Battlefield layout,
// each with its own independent A/A gate.
// A seed is never compared with a different seed: doing so would conflate
// observer effects with legitimate world-layout differences.
const trialsPlan=[
  {seed:'0x1d4a3f21',layoutIndex:0,layout:'CROSSFIRE'},
  {seed:'0x6c8e9cf5',layoutIndex:1,layout:'SPLIT HORIZON'},
  {seed:'0x27b4e8a3',layoutIndex:2,layout:'FOUR GATES'}
];
const trials=[];
const initialWorlds=new Set();
for(const {seed,layoutIndex,layout} of trialsPlan){
  // Bracket the instrumented arm between two independent OFF controls so a
  // simple monotonic browser warm-up/drift cannot masquerade as observer cost.
  // These are still sequential CPU samples, not a calibrated overhead study.
  const off=arm('off',seed,layoutIndex),on=arm('on',seed,layoutIndex),offRepeat=arm('off',seed,layoutIndex);
  assert.ok(Array.isArray(off.preSortTankIds)&&off.preSortTankIds.length>0,
    seed+' must expose native startup tank order');
  // The canonical natural-match harness documents asynchronous bot-array
  // insertion permutations. The identical-ID sort is a controlled fixture
  // normalization; disclose native order instead of falsely rejecting valid
  // A/A replays that normalize to the same complete physical state.
  const nativeOrderMatched=JSON.stringify(off.preSortTankIds)===JSON.stringify(offRepeat.preSortTankIds)&&
    JSON.stringify(off.preSortTankIds)===JSON.stringify(on.preSortTankIds);
  assert.equal(off.layout,layout,seed+' did not load its predeclared shipping Battlefield layout');
  assert.equal(off.layout,offRepeat.layout,seed+' OFF/OFF layout mismatch');
  assert.equal(off.layout,on.layout,seed+' OFF/ON layout mismatch');
  const initialHash=off.physicalTrace[0].hash;
  assert.ok(!initialWorlds.has(initialHash),
    seed+' did not produce a distinct initial world; multi-seed coverage is illusory');
  initialWorlds.add(initialHash);
  const control=comparePhysicalTraces(off,offRepeat);
  assert.ok(control.complete&&!control.firstDivergence&&control.fullFrameDigestMatched===true,
    seed+' OFF/OFF A/A control failed; OFF/ON causal inference is invalid');
  const comparison=comparePhysicalTraces(off,on);
  assert.ok(comparison.complete,seed+' arms must complete the same number of frames');
  assert.equal(comparison.fullFrameDigestMatched,true,
    seed+' observer changed an intermediate physical frame even if samples converged');
  assert.equal(comparison.firstDivergence,null,
    seed+' read-only observer changed physical state or trial was not deterministic');
  const events=on.eventSamples;
  const evidence=auditShotEvidence(events,{
    truncated:on.eventSamplesTruncated,preFrameOverflow:on.preFrameShotOverflow,
    preFrameShotUnidentified:on.preFrameShotUnidentified,
    preFrameTargetUnidentified:on.preFrameTargetUnidentified
  });
  assert.equal(evidence.bounded,true,
    seed+' cannot interpret truncated shot provenance');
  assert.equal(evidence.missedHitClassification,'not-evaluated',
    'endpoint snapshots cannot certify missed contacts');
  const ids=kind=>new Set(events.filter(e=>kind(e)&&Number.isSafeInteger(e.shotId))
    .map(e=>e.shotId));
  const damageIds=ids(e=>['damageTank','damageShape','damageDrone'].includes(e.kind));
  const retirementIds=ids(e=>e.kind==='projectileRetirement');
  const overlappingDamageRetirements=[...damageIds].filter(id=>retirementIds.has(id)).length;
  trials.push({seed,layout:off.layout,nativeOrderMatched,control,comparison,
    provenance:{sampled:events.length,truncated:on.eventSamplesTruncated,
      preStatePresent:evidence.preStatePresent,preStateMissing:evidence.preStateMissing,
      provenNewbornEvents:evidence.provenNewbornEvents,
      unexplainedMissingPreState:evidence.unexplainedMissingPreState,
      targetStatePresent:evidence.targetStatePresent,targetStateMissing:evidence.targetStateMissing,
      preFrameShotUnidentified:evidence.preFrameShotUnidentified,
      preFrameTargetUnidentified:evidence.preFrameTargetUnidentified,
      pairedInterceptionPresent:evidence.pairedInterceptionPresent,
      pairedInterceptionMissing:evidence.pairedInterceptionMissing,
      abstentionReason:evidence.abstentionReason,
      damageShotIds:damageIds.size,retiredShotIds:retirementIds.size,
      damageAndRetirementShotIds:overlappingDamageRetirements},
    off:{frames:off.frames,p95UpdateMs:off.p95UpdateMs,maxUpdateMs:off.maxUpdateMs},
    offRepeat:{frames:offRepeat.frames,p95UpdateMs:offRepeat.p95UpdateMs},
    on:{frames:on.frames,p95UpdateMs:on.p95UpdateMs,maxUpdateMs:on.maxUpdateMs,
      attributedCallbacks:on.attributedCallbacks,retirements:on.retirements,
      sniperInterceptions:on.sniperInterceptions,battlefieldTtlInterceptions:on.battlefieldTtlInterceptions},
    p95DifferenceMs:on.p95UpdateMs-off.p95UpdateMs});
}
assert.ok(trials.every(t=>t.on.retirements>0),
  'each seeded game must exercise actual projectile retirement');
assert.ok(trials.some(t=>t.on.attributedCallbacks>0),
  'paired campaign must witness real shot-attributed damage, not vacuous parity');
console.log(JSON.stringify({research:'shot-ledger-paired-physical-parity',trials,
  caveat:'Sequential Chromium CPU samples are not a real-device frame-pacing or isolated observer-cost measurement'}));
