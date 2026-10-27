'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {liveKey,suppressLiveStart}=require('../browser/frontlines-live-turn-intervention.js');
const KEY='BLOOM:5:105';
function scene(){
 const a={},t={id:7,ai:a};
 const g={time:106,__lfState:{directorEnabled:true,
  signal:{type:'BLOOM',sector:5,started:105,until:110},
  bloomMemory:{sector:5,announcedAt:105,until:129}}};
 return{a,t,g};
}
test('only a current identity-matched public BLOOM has a live key',()=>{
 const {g}=scene();assert.equal(liveKey(g),KEY);
 g.__lfState.signal.sector=6;assert.equal(liveKey(g),null);
 g.__lfState.signal.sector=5;g.__lfState.signal.started=104;assert.equal(liveKey(g),null);
 g.__lfState.signal.started=105;g.time=110;assert.equal(liveKey(g),null);
 g.time=104;assert.equal(liveKey(g),null);
 g.time=106;g.__lfState.directorEnabled=false;assert.equal(liveKey(g),null);
 g.__lfState.directorEnabled=true;g.__lfState.signal.type='MIGRATION';assert.equal(liveKey(g),null);
 g.__lfState.signal.type='BLOOM';g.__lfState.bloomMemory.until=105;assert.equal(liveKey(g),null);
});
test('OFF masks only the current live start and restores absent spent key',()=>{
 const {g,t,a}=scene(),before=JSON.stringify(g);
 const observed=[];
 const result=suppressLiveStart((_t,_g,dt)=>{
  observed.push(a.__lfFrontTurnSpentKey);
  assert.equal(dt,.3);
  return 42;
 },t,g,.3);
 assert.equal(result,42);assert.deepEqual(observed,[KEY]);
 assert.equal(Object.hasOwn(a,'__lfFrontTurnSpentKey'),false);
 assert.equal(JSON.stringify(g),before,'public signal and memory are unchanged');
});
test('prior spent key is restored, including an explicit own undefined',()=>{
 const {g,t,a}=scene();a.__lfFrontTurnSpentKey='BLOOM:3:90';
 suppressLiveStart(()=>assert.equal(a.__lfFrontTurnSpentKey,KEY),t,g,1);
 assert.equal(a.__lfFrontTurnSpentKey,'BLOOM:3:90');
 a.__lfFrontTurnSpentKey=undefined;
 suppressLiveStart(()=>assert.equal(a.__lfFrontTurnSpentKey,KEY),t,g,1);
 assert.equal(Object.hasOwn(a,'__lfFrontTurnSpentKey'),true);
 assert.equal(a.__lfFrontTurnSpentKey,undefined);
});
test('an already spent live turn remains spent and never gets rearmed',()=>{
 const {g,t,a}=scene();a.__lfFrontTurnSpentKey=KEY;
 suppressLiveStart(()=>assert.equal(a.__lfFrontTurnSpentKey,KEY),t,g,.3);
 assert.equal(a.__lfFrontTurnSpentKey,KEY);
});
test('expired public signal permits normal stale-memory turn initiation',()=>{
 const {g,t,a}=scene();g.time=111;g.__lfState.signal=null;
 suppressLiveStart(()=>{a.__lfFrontTurnSpentKey=KEY;a.__lfFrontTurn={key:KEY,until:113};},t,g,.3);
 assert.equal(a.__lfFrontTurnSpentKey,KEY);
 assert.equal(a.__lfFrontTurn.until,113);
});
test('OFF restores its sentinel even when the composed AI throws',()=>{
 const {g,t,a}=scene();a.__lfFrontTurnSpentKey='previous';
 assert.throws(()=>suppressLiveStart(()=>{throw Error('AI fault');},t,g,.3),/AI fault/);
 assert.equal(a.__lfFrontTurnSpentKey,'previous');
});
test('real composed Living Front AI starts live ON, but OFF cannot spend it',()=>{
 const root=path.resolve(__dirname,'../..');
 function composed(){
  const window={__novaModules:{
   'game/engine':m=>{m.exports={Game:class{}};},
   'game/ai':m=>{m.exports={updateAI:(t,g,dt)=>g.moveTank(t,-100,0,dt)};}
  }};
  const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
   performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
  for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
   vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
  const mod={exports:{}};window.__novaModules['game/ai'](mod,mod.exports,()=>({SHAPE_DEFS:{}}));
  const t={id:7,x:-1130,y:-600,hp:100,maxHp:100,alive:true,spawnShieldT:0,
   ai:{isElite:false,__v1112TargetId:-1,__v180HitAt:-99,__v180Posture:'investigate'}};
  const st={signal:{type:'BLOOM',sector:5,x:-562.5,y:-562.5,started:105,until:110},
   directorEnabled:true,bloomMemory:{sector:5,announcedAt:105,until:129,initialValue:500},
   queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),
   stats:{aiRotations:0}};
  const moves=[],originalMove=(_t,x,y)=>moves.push({x,y});
  const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st,
   moveTank:originalMove,tankSpeed:()=>100};
  return{g,t,st,moves,originalMove,ai:mod.exports.updateAI};
 }
 const off=composed(),on=composed();
 assert.equal(liveKey(off.g),KEY);
 suppressLiveStart(off.ai,off.t,off.g,.3);
 on.ai(on.t,on.g,.3);
 assert.equal(off.st.stats.aiFrontlineCommitments||0,0);
 assert.equal(on.st.stats.aiFrontlineCommitments,1);
 assert.equal(off.t.ai.__lfFrontTurnSpentKey,undefined);
 assert.equal(on.t.ai.__lfFrontTurnSpentKey,KEY);
 assert.ok(on.moves.at(-1).x>off.moves.at(-1).x,'live turn should change actual commanded movement');
 assert.equal(off.g.moveTank,off.originalMove,'movement owner restored in OFF');
 assert.equal(on.g.moveTank,on.originalMove,'movement owner restored in ON');
 assert.equal(off.st.bloomMemory.announcedAt,on.st.bloomMemory.announcedAt);
 off.g.time=111;off.st.signal=null;off.t.ai.__lfEcoT=0;
 off.ai(off.t,off.g,.3);
 assert.equal(off.t.ai.__lfEcoMode,'memory','stale memory remains enabled after live signal');
});
