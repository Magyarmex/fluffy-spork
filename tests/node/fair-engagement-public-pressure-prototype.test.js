'use strict';
// #1025 RESEARCH ONLY. Prototype public *physical* crowding as an alternative
// to reading other bots' private target slots. No gameplay wiring.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function publicPressure(g,observer,target,{radius=260,cap=3}={}){
 const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
 let count=0;
 for(const q of g.tanks){
  if(!q||q.id===observer.id||q.id===target.id||q.alive===false||
     !(q.hp>0)||!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;
  // Visibility is from the deciding observer, not global team knowledge.
  if(!fair.inGameplayViewport(g,observer,q))continue;
  // Physical proximity is public; private AI target IDs and postures are not.
  if(Math.hypot(q.x-target.x,q.y-target.y)>radius)continue;
  if(++count>=cap)break;
 }
 return count;
}
function scene(){
 const g=bootGame(),fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
 const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
 assert.ok(bots.length>=4);
 const [observer,left,right,other]=bots.slice(0,4);
 for(const [i,t] of [observer,left,right,other].entries()){
  Object.assign(t,{x:i===1?-100:i===2?100:i===3?2000:0,
   y:i===3?2000:0,hp:100,maxHp:100,alive:true,
   spawnShieldT:0,cls:'twin',tier:1});
  Object.assign(t.ai,{state:i===3?'hunt':'wander',__v1112TargetId:-1,
   __v1105TargetId:-1,__v180TargetId:-1,targetId:-1});
 }
 g.tanks=[observer,left,right,other];
 g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
 g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
 g.areAllies=()=>false;g.areHostile=()=>true;
 return {g,fair,observer,left,right,other};
}
test('public physical pressure is invariant to an offscreen bot private target slot',()=>{
 withSeed(1517800,()=>{
  const s=scene();
  try{
   const {g,fair,observer,left,right,other}=s;
   assert.equal(fair.inGameplayViewport(g,observer,other),false);
   const before=[publicPressure(g,observer,left),publicPressure(g,observer,right)];
   other.ai.__v1112TargetId=left.id;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],before);
   other.ai.__v1112TargetId=right.id;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],before);
   // This is a prototype invariant, not a claim that the shipped scorer
   // already obeys it. The shipped private-slot leak has a separate witness.
   console.log('NOVA_PUBLIC_PRESSURE_PROTOTYPE '+JSON.stringify({before,
    hiddenDistance:Math.hypot(other.x-observer.x,other.y-observer.y)}));
  }finally{s.g.destroy();}
 });
});
test('a visible physical participant changes only the nearby target pressure',()=>{
 withSeed(1517802,()=>{
  const s=scene();
  try{
   const {g,observer,left,right,other}=s;
   const baseline=[publicPressure(g,observer,left),publicPressure(g,observer,right)];
   assert.deepEqual(baseline,[1,1],
    'each visible opposing target is near the other in this deliberately tight fixture');
   // Move the third participant inside the viewport and near left, but
   // beyond the pressure radius of right.
   other.x=-330;other.y=0;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],[2,1]);
   other.alive=false;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],baseline);
  }finally{s.g.destroy();}
 });
});
