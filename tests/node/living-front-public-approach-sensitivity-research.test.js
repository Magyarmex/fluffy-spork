'use strict';
// Synthetic #1029 sensitivity, not a natural-match incidence estimate.
// Canonical sector-6 center and default 800x600 viewport; no terrain or AI.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublicApproachWitness}=require('../research/living-front-public-approach-witness.cjs');
function random(seed){
 let s=seed>>>0;
 return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};
}
function detected(x,y,angle){
 const observer={id:1,x:-400,y:-562.5,hp:100,alive:true};
 const q={id:2,x,y,hp:100,alive:true,spawnShieldT:0};
 const goal={x:562.5,y:-562.5},w=createPublicApproachWitness();
 const visible=(a,b)=>Math.abs(a.x-b.x)<=400&&Math.abs(a.y-b.y)<=300;
 for(let step=0;step<9;step++){
  if(w.sample(observer,[q],goal,step*.25,visible)>0)return true;
  q.x+=30*Math.cos(angle);q.y+=30*Math.sin(angle);
 }
 return false;
}
test('synthetic public motion witness detects approach but also unrelated passersby',()=>{
 const rng=random(1029),n=10000;
 let randomHeading=0,towardGoal=0;
 for(let i=0;i<n;i++){
  const x=-350+rng()*320,y=-830+rng()*540;
  const incidental=(rng()*2-1)*Math.PI;
  const aimed=Math.atan2(-562.5-y,562.5-x)+(rng()*2-1)*.35;
  if(detected(x,y,incidental))randomHeading++;
  if(detected(x,y,aimed))towardGoal++;
 }
 assert.ok(randomHeading>0,'passing traffic can falsely resemble commitment');
 assert.ok(towardGoal>randomHeading,'directed approaches must be easier to witness');
 assert.ok(towardGoal<n,'viewport and range still miss some genuine approaches');
 console.log('NOVA_PUBLIC_APPROACH_SYNTHETIC '+JSON.stringify({
  n,randomHeading,towardGoal,viewport:'800x600',seconds:2,
  caveat:'synthetic straight-line motion, not natural NOVA match rates'
 }));
});
