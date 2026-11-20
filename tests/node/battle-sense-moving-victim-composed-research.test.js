'use strict';
// Research-only characterization of #1081 against the exact 49-overlay
// materialized Game. This intentionally does NOT change production AI.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
// Importing the composed Game fixture must not register its unrelated audio RNG test.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
function tank(id,x,y,ai){return {id,x,y,alive:true,hp:100,maxHp:100,cls:'twin',ai};}
function scene(){
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 assert.equal(typeof helper?.thirdPartyVector,'function',
  'shipping Battle Sense test seam must be loaded in composed Game');
 const observer=tank(9001,-200,0,{
  __v181ObservedShotId:9002,__v181ObservedShotAt:10,
  __v181ObservedShotAngle:0,__v181ObservedShotX:0,__v181ObservedShotY:0});
 const target=tank(9002,0,0,{});
 const third=tank(9003,0,100,{});
 g.time=10.5;
 g.tanks=[observer,target,third];
 g.__novaFairVisibleTanks=g.tanks;
 g.areHostile=()=>true;
 g.areAllies=()=>false;
 g.hasLineOfSight=()=>true;
 return {g,helper,observer,target,third,
  weight:()=>helper.thirdPartyVector(g,observer,target,{}).weight};
}
test('composed Battle Sense: moving only the victim can invent a crossfire from an old shot',()=>{
 const w=scene();
 try{
  assert.equal(w.weight(),0,'north-of-shot third party was not in eastbound firing lane');
  w.third.x=100;w.third.y=0;
  assert.equal(w.weight(),.62,
   'characterize current defect: later victim position reclassifies old eastbound shot');
  assert.equal(w.observer.ai.__v181ObservedShotX,0);
  assert.equal(w.observer.ai.__v181ObservedShotAngle,0);
  w.g.time=11.250001;
  assert.equal(w.weight(),0,'existing 1.25-second expiry must still constrain the effect');
 }finally{w.g.destroy();}
});
test('composed Battle Sense: victim departure can erase a genuine witnessed firing lane',()=>{
 const w=scene();
 try{
  w.third.x=100;w.third.y=0;
  assert.equal(w.weight(),.62,'eastbound shot was toward firing-time third party');
  w.third.x=0;w.third.y=100;
  assert.equal(w.weight(),0,
   'characterize current defect: moving the victim erases the historical lane');
  w.third.x=100;w.third.y=0;
  w.g.__novaFairVisibleTanks=[w.observer,w.target];
  assert.equal(w.weight(),0,'offscreen third party must not be used for crossfire');
  w.g.__novaFairVisibleTanks=w.g.tanks;
  w.g.hasLineOfSight=()=>false;
  assert.equal(w.weight(),0,'cover must still veto the inferred crossfire');
 }finally{w.g.destroy();}
});
test('research fixture uses canonical materialized 49-overlay composition',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)];
 assert.equal(scripts.length,49);
 assert.ok(scripts.some(x=>x[1]==='nova-updates/battle-sense-v1.8.1.js'));
});
