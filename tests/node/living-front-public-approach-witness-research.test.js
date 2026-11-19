'use strict';
// Research-only #1029: evaluate a public, observer-owned approach witness.
// This is a candidate sensor, not evidence of natural-match anti-dogpile value.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublicApproachWitness}=require('../research/living-front-public-approach-witness.cjs');
const goal={x:500,y:0},seen=()=>true;
const body=(id,x=0,y=0)=>({id,x,y,hp:100,alive:true,spawnShieldT:0});
function advance(w,o,q,steps,visibility=seen){
 return steps.map(([time,x,y])=>{q.x=x;q.y=y;return w.sample(o,[q],goal,time,visibility);});
}
test('two successive visible approaches confirm a physical contender, not a private assignment',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 Object.defineProperty(q,'ai',{get(){throw Error('private AI state accessed');}});
 assert.deepEqual(advance(w,o,q,[[0,0,0],[.25,30,0],[.5,60,0],[.75,90,0]]),[0,0,1,1]);
});
test('lateral movement and moving away cannot certify an approach',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 assert.deepEqual(advance(w,o,q,[[0,0,0],[.25,0,30],[.5,-30,30],[.75,-60,30]]),[0,0,0,0]);
});
test('one impulse followed by ordinary movement cannot certify a sustained approach',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 assert.deepEqual(advance(w,o,q,[[0,0,0],[.25,80,0],[.5,80,30],[.75,80,60]]),[0,0,0,0]);
});
test('teleports, long sample gaps, lost viewport and recycled ids fail closed',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 assert.deepEqual(advance(w,o,q,[[0,0,0],[.25,30,0],[.5,900,0]]),[0,0,0]);
 q.x=40;q.y=0;assert.equal(w.sample(o,[q],goal,2,seen),0,'stale witness');
 q.x=70;assert.equal(w.sample(o,[q],goal,2.25,()=>false),0,'lost sight');
 q.x=100;assert.equal(w.sample(o,[q],goal,2.5,seen),0,'no offscreen carry');
 const replacement=body(2,130,0);
 assert.equal(w.sample(o,[replacement],goal,2.75,seen),0,'recycled identity');
 replacement.x=160;
 assert.equal(w.sample(o,[replacement],goal,3,seen),0,'first new interval');
 replacement.x=190;
 assert.equal(w.sample(o,[replacement],goal,3.25,seen),1,'second new interval');
});
test('a passing non-committed tank is still a possible false positive',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 const values=advance(w,o,q,[[0,0,0],[.25,30,0],[.5,60,0]]);
 assert.equal(values.at(-1),1);
 // Physical movement alone cannot distinguish a deliberate event rotation
 // from an unrelated straight-line pass. This is a falsification constraint.
});
test('observer records are independent and the visible-identity cache is bounded',()=>{
 const w=createPublicApproachWitness({cap:3}),a=body(1),b=body(9);
 const q=body(2);
 advance(w,a,q,[[0,0,0],[.25,30,0],[.5,60,0]]);
 assert.equal(w.sample(b,[q],goal,.5,seen),0,'no cross-observer knowledge');
 const others=[body(3,100),body(4,100),body(5,100)];
 w.sample(a,others,goal,.75,seen);
 q.x=90;
 assert.equal(w.sample(a,[q],goal,1,seen),0,'evicted record cannot certify');
});

test('omitted viewport contacts and a changed public destination reset approach evidence',()=>{
 const w=createPublicApproachWitness(),o=body(1),q=body(2);
 assert.equal(w.sample(o,[q],goal,0,seen),0);
 q.x=30;assert.equal(w.sample(o,[q],goal,.25,seen),0);
 assert.equal(w.sample(o,[],goal,.5,seen),0,'missing viewport sample');
 q.x=60;assert.equal(w.sample(o,[q],goal,.75,seen),0,'cannot infer unseen travel');
 q.x=90;assert.equal(w.sample(o,[q],goal,1,seen),0);
 const movedGoal={x:600,y:0};
 q.x=120;assert.equal(w.sample(o,[q],movedGoal,1.25,seen),0,
  'new public destination invalidates the prior trajectory');
 q.x=150;assert.equal(w.sample(o,[q],movedGoal,1.5,seen),0);
 q.x=180;assert.equal(w.sample(o,[q],movedGoal,1.75,seen),1);
});
