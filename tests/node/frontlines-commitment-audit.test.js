'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,sample,summary}=require('../browser/frontlines-commitment-audit.js');
const sectorIndex=(x,y)=>Math.floor((y+2250)/1125)*4+Math.floor((x+2250)/1125);
function scene(){
 const t={id:7,x:-1130,y:-600,alive:true,hp:100,maxHp:100,spawnShieldT:0,
  ai:{__lfEcoMode:'memory',__lfEcoKey:'BLOOM:5',__lfEcoWeight:.2}};
 const g={time:106,__lfState:{directorEnabled:true,signal:null,
  bloomMemory:{sector:5,announcedAt:100,until:124}}};
 return{g,t};
}
test('natural-match audit is read-only and counts a valid precombat commitment window',()=>{
 const {g,t}=scene(),a=create(),before=JSON.stringify({g,t});
 sample(a,g,t,true,sectorIndex);
 assert.equal(JSON.stringify({g,t}),before,'observer cannot mutate game or AI');
 assert.equal(a.samples,1);assert.equal(a.publicMemory,1);
 assert.equal(a.eligibleWindow,1);assert.equal(a.precombatIntersection,1);
 assert.equal(a.subset,1);assert.equal(a.memoryMode,1);
 assert.equal(a.meaningfulWeight,1);assert.equal(a.alreadyInside,0);
 assert.equal(summary(a)._seen,undefined,'no private identity cache in result');
});
test('live announcement, expired opportunity, disabled Director and arrived bot are separate gates',()=>{
 const {g,t}=scene(),a=create();
 g.__lfState.signal={type:'BLOOM',until:108};sample(a,g,t,true,sectorIndex);
 g.__lfState.signal=null;g.time=114;sample(a,g,t,true,sectorIndex);
 g.time=106;t.x=-900;sample(a,g,t,true,sectorIndex);
 g.__lfState.directorEnabled=false;sample(a,g,t,true,sectorIndex);
 sample(a,g,t,false,sectorIndex);
 assert.equal(a.samples,5);assert.equal(a.enabledSamples,4);assert.equal(a.publicMemory,3);
 assert.equal(a.liveSignal,1);assert.equal(a.expiredWindow,1);
 assert.equal(a.alreadyInside,1);assert.equal(a.precombatIntersection,0);
});
test('nonmatching subset and weak ecology intent cannot count as a plausible turn',()=>{
 const {g,t}=scene(),a=create();
 t.id=3;t.ai.__lfEcoWeight=.05;
 sample(a,g,t,true,sectorIndex);
 assert.equal(a.eligibleWindow,1);assert.equal(a.subset,0);
 assert.equal(a.meaningfulWeight,0);assert.equal(a.precombatIntersection,0);
});
test('spent-key starts are counted once without changing AI state',()=>{
 const {g,t}=scene(),a=create();
 t.ai.__lfFrontTurnSpentKey='BLOOM:5:100';
 t.ai.__lfFrontTurn={key:'BLOOM:5:100',until:108};
 sample(a,g,t,true,sectorIndex);sample(a,g,t,true,sectorIndex);
 assert.equal(a.started,1);assert.equal(a.activeTurn,2);
});
test('a live public commitment is witnessed even if the rival arrives during the same AI update',()=>{
 const {g,t}=scene(),a=create();
 g.time=104;g.__lfState.signal={type:'BLOOM',sector:5,started:100,until:105};
 t.x=-900;t.y=-600; // already inside when the post-update observer samples
 t.ai.__lfFrontTurnSpentKey='BLOOM:5:100';
 t.ai.__lfFrontTurn={key:'BLOOM:5:100',until:106};
 sample(a,g,t,true,sectorIndex);sample(a,g,t,true,sectorIndex);
 assert.equal(a.liveSignal,2);
 assert.equal(a.started,1);assert.equal(a.startedLive,1);
 assert.equal(a.activeTurn,2);assert.equal(a.activeTurnLive,2);
 assert.equal(a.eligibleWindow,0,'live phase still bypasses stale-window eligibility');
});
test('a spent key from another announcement is not misattributed to the current BLOOM',()=>{
 const {g,t}=scene(),a=create();
 t.ai.__lfFrontTurnSpentKey='BLOOM:5:80';
 t.ai.__lfFrontTurn={key:'BLOOM:5:80',until:108};
 sample(a,g,t,false,sectorIndex);
 assert.equal(a.started,0);assert.equal(a.activeTurn,0);
 assert.equal(a.enabledSamples,0);
});
test('live starts and later remembered samples are deduplicated by public announcement',()=>{
 const {g,t}=scene(),a=create();
 t.ai.__lfFrontTurnSpentKey='BLOOM:5:100';
 g.time=104;g.__lfState.signal={type:'BLOOM',sector:5,started:100,until:105};
 sample(a,g,t,true,sectorIndex);
 g.time=106;g.__lfState.signal=null;sample(a,g,t,true,sectorIndex);
 assert.equal(a.started,1);assert.equal(a.startedLive,1);assert.equal(a.startedMemory,0);
});
