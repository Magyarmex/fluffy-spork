'use strict';
// Does the real lobby-score AudioContext initialization change the next match?
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {bootGame,FakeAudioContext,withSeed,digest,physical,firstDifference,playPublicPrelude}=
 require('./audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/lobby-music-v1.5.1.js'),'utf8');
function arm(seed,hz,mode){return withSeed(seed,draws=>{
 let samples=0,before=draws();
 if(mode!=='off'){
  const window={AudioContext:FakeAudioContext};
  const document={readyState:'loading',addEventListener(){},querySelector(){return null;}};
  const context={window,document,localStorage:{getItem(){return null;}},Math,
   setInterval(){return 0;},clearInterval(){},setTimeout(){return 0;},
   console:{info(){},warn(){},error(){}}};
  vm.runInNewContext(source,context,{filename:'nova-updates/lobby-music-v1.5.1.js',timeout:5000});
  const score=window.__NOVA_LOBBY_SCORE__;
  assert.ok(score&&score.ensure(),'actual lobby score did not initialize');
  const data=score.noise.getChannelData(0);
  samples=data.length;
  assert.equal(samples,15434);
  if(mode==='erased')data.fill(0);
 }
 const interventionDraws=draws()-before;
 const g=bootGame();if(!g.player)g.redeploy();
 assert.ok(g.player&&g.player.alive);
 const initial=digest(physical(g));
 g.sfx.muted=true;
 const prelude=playPublicPrelude(g,hz,2,g.__testFair,hz,draws);
 const trace=prelude.trace.map(({elapsed,x,y,hp,alive,score,
  enemyStateHash,neutralStateHash,projectileStateHash})=>
  ({elapsed,x,y,hp,alive,score,enemyStateHash,neutralStateHash,projectileStateHash}));
 return {samples,interventionDraws,initial,trace,finalHash:digest(physical(g))};
});}
test('lobby music buffer must not alter the next real-game initial world',()=>{
 const results=[];
 for(const hz of [30,60])for(const seed of [1517840,1517854,1517875]){
  const off=arm(seed,hz,'off'),on=arm(seed,hz,'on'),erased=arm(seed,hz,'erased');
  assert.equal(on.initial,erased.initial,'erasing sound must preserve gameplay');
  assert.equal(firstDifference(on,erased),null,'waveform-only control changed physics');
  assert.equal(on.interventionDraws,erased.interventionDraws);
  assert.equal(off.interventionDraws,0);
  results.push({hz,seed,draws:on.interventionDraws,
   changedInitial:off.initial!==on.initial,
   firstPhysicalDifference:firstDifference(off,on)});
 }
 const patched=process.env.NOVA_LOBBY_AUDIO_RNG_PATCHED==='1';
 const dir=path.join(root,'artifacts','lobby-audio-rng-causality');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,patched?'patched.json':'baseline.json'),JSON.stringify(results,null,2));
 if(patched){assert.ok(results.every(r=>r.draws===0&&!r.changedInitial&&r.firstPhysicalDifference===null));}
 else {assert.ok(results.every(r=>r.draws===15434&&r.changedInitial&&r.firstPhysicalDifference!==null));}
 console.log('NOVA_LOBBY_AUDIO_RNG '+JSON.stringify({patched,scenarios:results.length,
  changedInitial:results.filter(r=>r.changedInitial).length,
  physicalDivergences:results.filter(r=>r.firstPhysicalDifference!==null).length,
  sharedDraws:results.map(r=>r.draws)}));
});
