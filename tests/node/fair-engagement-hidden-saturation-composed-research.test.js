'use strict';
// #1025 RESEARCH ONLY: materialized 49-overlay Fair Engagement selection.
// This deliberately records a current hidden-information leak; it is NOT
// an acceptance criterion for a future fairness fix.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed Fair Engagement target choice is altered by offscreen private AI assignments',()=>{
 withSeed(1517800,()=>{
  const g=bootGame();
  try{
   const T=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   assert.ok(T&&typeof T.chooseTarget==='function',
    'shipping Fair Engagement must own target selection');
   const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
   assert.ok(bots.length>=4,'composed world needs observer, two targets and hidden attacker');
   const [observer,a,b,hidden]=bots.slice(0,4);
   for(const [i,t] of [observer,a,b,hidden].entries()){
    Object.assign(t,{x:i===3?2000:i===1?100:i===2?-100:0,
     y:i===3?2000:0,cls:'twin',tier:1,hp:100,maxHp:100,
     alive:true,spawnShieldT:0});
    Object.assign(t.ai,{state:i===3?'hunt':'wander',
     __v1112TargetId:-1,__v1105TargetId:-1,__v180TargetId:-1,
     targetId:-1,__v180Posture:null,__v180LastAttacker:-1});
   }
   g.tanks=[observer,a,b,hidden];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.areAllies=()=>false;g.areHostile=()=>true;
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   assert.ok(Math.abs(hidden.x-observer.x)>g.w/2,
    'hidden attacker must be outside observer viewport');
   assert.ok(T.canPerceive(g,classes,observer,a));
   assert.ok(T.canPerceive(g,classes,observer,b));
   assert.equal(T.canPerceive(g,classes,observer,hidden),false);
   const choose=()=>T.chooseTarget(g,classes,observer,observer.ai,g.time);
   const baseline=choose();
   assert.ok(baseline===a||baseline===b,'one visible target must win');
   const other=baseline===a?b:a;
   const publicBefore=JSON.stringify(g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive]));
   hidden.ai.__v1112TargetId=baseline.id;
   assert.equal(choose(),other,
    'hidden attacker private assignment alone flips the visible target choice');
   hidden.ai.__v1112TargetId=other.id;
   assert.equal(choose(),baseline,
    'reversing only hidden assignment reverses the selection');
   assert.equal(JSON.stringify(g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive])),
    publicBefore,'public battlefield state must be identical across arms');
  }finally{g.destroy();}
 });
});
