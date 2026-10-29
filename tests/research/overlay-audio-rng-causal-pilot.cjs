'use strict';
// Controlled real-shipping-game A/B: do optional overlay sound buffers change
// physical combat through the shared Math.random stream? Research only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {bootGame,FakeAudioContext,withSeed,digest,physical,firstDifference,playPublicPrelude}=
 require('./audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
function param(){return {value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},
 linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};}
function node(){return {connect(){return this;},start(){},stop(){},
 frequency:param(),gain:param(),pan:param()};}
class AudioGraphContext extends FakeAudioContext {
 constructor(){super();this.buffers=[];}
 createBuffer(channels,length,rate){const b=super.createBuffer(channels,length,rate);
  this.buffers.push(b);return b;}
 createOscillator(){return node();}
 createBufferSource(){return node();}
 createBiquadFilter(){return node();}
 createStereoPanner(){return node();}
}
const owners=[
 ['polish','__novaPolishNoise',14112,s=>s.novaDroneNearMissPolish(0)],
 ['sniper','__novaNoise',19845,s=>s.novaRailIncoming(0,false)],
 ['violet','__novaVioletNoise',12348,s=>s.novaPrecisionFlyby(0,false)],
 ['controller','__novaControllerNoise',15434,s=>s.novaDroneLaunch(0,false,false)],
 ['observer','__novaObserverNoise',13230,s=>s.novaRailFlybyActual(0)],
 ['contact','__novaContactNoise',14112,s=>s.novaPrecisionShotCue(0,.5,0)],
 ['impact','__novaImpactNoise',10584,s=>s.novaFeedbackDamage(0,.5,false)]
];
function arm(owner,seed,hz,mode){return withSeed(seed,draws=>{
 const g=bootGame();if(!g.player)g.redeploy();
 assert.ok(g.player&&g.player.alive);
 const initial=digest(physical(g));
 g.__testWindow.AudioContext=AudioGraphContext;
 g.sfx.ensure();
 assert.ok(g.sfx.noiseBuf,'canonical core sound buffer must exist');
 const ctx=g.sfx.ctx,baseBuffers=ctx.buffers.length,before=draws();
 let samples=0;
 if(mode!=='off'){
  g.sfx.muted=false;
  owner[3](g.sfx);
  assert.ok(g.sfx[owner[1]],owner[0]+' sound buffer not initialized');
  const data=g.sfx[owner[1]].getChannelData(0);
  samples=data.length;
  assert.equal(samples,owner[2],owner[0]+' buffer length');
  assert.equal(ctx.buffers.length,baseBuffers+1,'one overlay buffer expected');
  if(mode==='erased')data.fill(0);
 }
 g.sfx.muted=true;
 const interventionDraws=draws()-before;
 const prelude=playPublicPrelude(g,hz,3,g.__testFair,hz,draws);
 const trace=prelude.trace.map(({elapsed,x,y,hp,alive,score,
  enemyStateHash,neutralStateHash,projectileStateHash})=>
  ({elapsed,x,y,hp,alive,score,enemyStateHash,neutralStateHash,projectileStateHash}));
 return {initial,interventionDraws,samples,trace,finalHash:digest(physical(g))};
});}
test('seven actual shipping overlay noise buffers must not perturb physical gameplay',()=>{
 const results=[];
 for(const owner of owners)for(const hz of [30,60])for(const seed of [1517840,1517854]){
  const off=arm(owner,seed,hz,'off'),enabled=arm(owner,seed,hz,'enabled'),
   erased=arm(owner,seed,hz,'erased');
  assert.equal(off.initial,enabled.initial);
  assert.equal(off.initial,erased.initial);
  assert.equal(off.interventionDraws,0);
  assert.equal(enabled.interventionDraws,erased.interventionDraws);
  const leaked=firstDifference(off,enabled),erasedFirst=firstDifference(enabled,erased);
  results.push({owner:owner[0],hz,seed,draws:enabled.interventionDraws,
   samples:enabled.samples,leaked,erasedFirst});
 }
 const summary={contract:'7 actual HTML-ordered overlay Sfx owners, matched post-boot world, core audio initialized in every arm, erase waveform after identical RNG consumption; all sound muted for 3s public-input combat; not a device audio quality test',
  scenarios:results.length,owners:owners.map(o=>o[0]),results};
 const out=path.join(root,'artifacts','overlay-audio-rng-causality');
 fs.mkdirSync(out,{recursive:true});
 const patched=process.env.NOVA_OVERLAY_AUDIO_RNG_PATCHED==='1';
 fs.writeFileSync(path.join(out,patched?'patched.json':'baseline.json'),JSON.stringify(summary,null,2));
 for(const owner of owners){
  const rows=results.filter(r=>r.owner===owner[0]);
  assert.equal(rows.filter(r=>r.erasedFirst!==null).length,0,owner[0]+' waveform control');
  if(patched){
   assert.equal(rows.filter(r=>r.leaked!==null).length,0,owner[0]+' physical independence');
   assert.ok(rows.every(r=>r.draws===0),owner[0]+' must not draw global RNG');
  }else{
   assert.ok(rows.some(r=>r.leaked!==null),owner[0]+' baseline causal leak absent');
   assert.ok(rows.every(r=>r.draws===r.samples),owner[0]+' shared RNG draw count');
  }
 }
 console.log('NOVA_OVERLAY_AUDIO_RNG '+JSON.stringify({patched,scenarios:results.length,
  byOwner:owners.map(o=>({owner:o[0],samples:o[2],
   physicalDivergences:results.filter(r=>r.owner===o[0]&&r.leaked!==null).length,
   waveformControlDivergences:results.filter(r=>r.owner===o[0]&&r.erasedFirst!==null).length}))}));
});
