'use strict';
// Causal A/B on the actual HTML-ordered production overlays and materialized Game.
// The intervention is a real NOVATips shuffle after matched Game boot, not a
// synthetic Math.random call. The erased arm discards only the displayed tip.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {bootGame,withSeed,digest,physical,firstDifference,playPublicPrelude}=
 require('./audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const patched=source.includes('function fieldcraftRandom(key)');
function arm(seed,hz,mode){return withSeed(seed,draws=>{
 const g=bootGame();if(!g.player)g.redeploy();
 assert.ok(g.player&&g.player.alive);
 assert.ok(g.__testWindow.NOVATips,'shipping Fieldcraft overlay not loaded');
 const initial=digest(physical(g)),tipCount=g.__testWindow.NOVATips.audit().current,before=draws();
 let picked=null;
 if(mode!=='off'){
  picked=g.__testWindow.NOVATips.next('fieldcraft-causal-main');
  assert.ok(picked&&picked.id,'actual tip shuffle failed');
  if(mode==='erased')picked=null; // Same selection/RNG, no displayed content.
 }
 const interventionDraws=draws()-before;
 g.sfx.muted=true;
 const prelude=playPublicPrelude(g,hz,4,g.__testFair,hz,draws);
 const trace=prelude.trace.map(({elapsed,x,y,hp,alive,score,
  enemyStateHash,neutralStateHash,projectileStateHash})=>
  ({elapsed,x,y,hp,alive,score,enemyStateHash,neutralStateHash,projectileStateHash}));
 return {initial,tipCount,interventionDraws,trace,finalHash:digest(physical(g)),
  selectedTip:mode==='enabled'?picked.id:null};
});}
test('actual Fieldcraft shuffle must not influence matched physical combat',()=>{
 const results=[];
 for(const hz of [30,60])for(const seed of [1517840,1517854,1517875,1517825,1517829,1517844]){
  const off=arm(seed,hz,'off'),enabled=arm(seed,hz,'enabled'),
   erased=arm(seed,hz,'erased');
  assert.equal(off.initial,enabled.initial,'mismatched initial physical world');
  assert.equal(off.initial,erased.initial,'mismatched erased initial world');
  assert.equal(off.interventionDraws,0);
  assert.equal(enabled.interventionDraws,erased.interventionDraws);
  const firstPhysicalDifference=firstDifference(off,enabled);
  const erasedDifference=firstDifference(enabled,erased);
  assert.equal(erasedDifference,null,'discarding tip display changed physics');
  results.push({seed,hz,tipCount:enabled.tipCount,sharedDraws:enabled.interventionDraws,
   firstPhysicalDifference,erasedDifference,selectedTip:enabled.selectedTip});
 }
 const physicalDivergences=results.filter(r=>r.firstPhysicalDifference!==null).length;
 const dir=path.join(root,'artifacts','fieldcraft-rng-causality');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,patched?'patched.json':'baseline.json'),
  JSON.stringify({patched,scenarios:results.length,physicalDivergences,results},null,2));
 if(patched){
  assert.ok(results.every(r=>r.sharedDraws===0),'Fieldcraft consumed gameplay RNG');
  assert.equal(physicalDivergences,0,'tip shuffle still influences physical combat');
 }else{
  assert.ok(results.every(r=>r.sharedDraws===r.tipCount-1),'baseline did not consume one draw per shuffle swap');
  assert.ok(physicalDivergences>0,'baseline causal leak was not reproduced');
 }
 console.log('NOVA_FIELDCRAFT_RNG '+JSON.stringify({patched,scenarios:results.length,
  physicalDivergences,sharedDraws:results.map(r=>r.sharedDraws)}));
});
