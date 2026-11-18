'use strict';
// Research-only #1025: natural composed-world snapshot sensitivity to hidden
// AI target slots. Does NOT change production AI or infer human win rates.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const SEEDS=[1517800,1517802,1517810],TICKS=240,SAMPLE_EVERY=12;
function privateTarget(a){
 return a.__v1112TargetId>=0?a.__v1112TargetId:
  a.__v1105TargetId>=0?a.__v1105TargetId:
  a.__v180TargetId>=0?a.__v180TargetId:a.targetId;
}
function active(a){return a.state==='hunt'||['pressure','flank','route'].includes(a.__v180Posture);}
function sample(g,classes,T,counters){
 const tanks=g.tanks||[];
 for(const observer of tanks){
  if(!observer||observer.alive===false||!observer.ai||observer.isPlayer)continue;
  counters.observerSamples++;
  const visible=tanks.filter(q=>q&&q.id!==observer.id&&q.alive!==false&&
   !(q.spawnShieldT>0)&&T.canPerceive(g,classes,observer,q)&&
   (!g.areAllies||!g.areAllies(observer,q)));
  if(visible.length<2)continue;
  counters.multiVisibleSamples++;
  const ids=new Set(visible.map(t=>t.id));
  const baseline=T.chooseTarget(g,classes,observer,observer.ai,g.time);
  if(!baseline)continue;
  const eligible=tanks.filter(hidden=>hidden&&hidden.id!==observer.id&&
   hidden.alive!==false&&hidden.ai&&!T.canPerceive(g,classes,observer,hidden)&&
   active(hidden.ai)&&ids.has(privateTarget(hidden.ai)));
  if(!eligible.length)continue;
  counters.jointCandidateSamples++;
  for(const hidden of eligible){
   counters.hiddenAssignmentsToVisible++;
   const a=hidden.ai,fields=['__v1112TargetId','__v1105TargetId','__v180TargetId','targetId'];
   const saved=fields.map(k=>[k,Object.prototype.hasOwnProperty.call(a,k),a[k]]);
   try{
    for(const key of fields)a[key]=-1;
    const counterfactual=T.chooseTarget(g,classes,observer,observer.ai,g.time);
    if(counterfactual?.id!==baseline.id)counters.changedChoices++;
   }finally{
    for(const [key,owned,value] of saved){if(owned)a[key]=value;else delete a[key];}
   }
  }
  // Two small hidden penalties can jointly change a choice even when
  // removing either one alone cannot. Count that interaction separately.
  const fields=['__v1112TargetId','__v1105TargetId','__v180TargetId','targetId'];
  const saved=eligible.map(hidden=>({a:hidden.ai,slots:fields.map(k=>
   [k,Object.prototype.hasOwnProperty.call(hidden.ai,k),hidden.ai[k]])}));
  try{
   for(const {a} of saved)for(const key of fields)a[key]=-1;
   if(T.chooseTarget(g,classes,observer,observer.ai,g.time)?.id!==baseline.id)
    counters.jointChangedChoices++;
  }finally{
   for(const {a,slots} of saved)for(const [key,owned,value] of slots){
    if(owned)a[key]=value;else delete a[key];
   }
  }
 }
}
function run(seed,observe){return withSeed(seed,draws=>{
 const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
 const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
 assert.ok(T&&typeof T.chooseTarget==='function'&&typeof T.canPerceive==='function');
 const counters={observerSamples:0,multiVisibleSamples:0,hiddenAssignmentsToVisible:0,changedChoices:0,jointCandidateSamples:0,jointChangedChoices:0};
 try{
  g.status='playing';g.paused=false;
  for(let tick=1;tick<=TICKS;tick++){
   g.update(1/60);
   if(observe&&tick%SAMPLE_EVERY===0)sample(g,C,T,counters);
  }
  return {hash:digest(physical(g)),draws:draws(),counters};
 }finally{g.destroy();}
});}
test('natural composed AI snapshots measure hidden target-slot sensitivity without changing world',()=>{
 const rows=[];
 for(const seed of SEEDS){
  const control=run(seed,false),observed=run(seed,true);
  assert.equal(observed.hash,control.hash,'diagnostic changed physical world');
  assert.equal(observed.draws,control.draws,'diagnostic consumed gameplay RNG');
  assert.ok(observed.counters.observerSamples>0,'must sample actual AI observers');
  rows.push({seed,...observed.counters});
 }
 console.log('NOVA_FAIR_SATURATION_NATURAL_SNAPSHOT '+JSON.stringify(rows));
});
