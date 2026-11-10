'use strict';
// Research only: explore a three-step catch-up budget for *active* <=100ms
// jitter while preserving the existing two-step >100ms foreground-stall
// safety cap. This is a test-time policy, NOT a shipping scheduler change.
// No CPU, Canvas paint, GPU, physical touch or thermal performance is modeled.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const EPS=1e-6;
// Match the source owner's 100ms stall comparison exactly, not the looser
// numerical tolerance used by assertions below.
const STALL_EPS=1e-7;
function replay(gaps,{activeOnlyThree=false}={}){
 let now=1000,callback=null,elapsed=0,updates=0;
 const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
  stickId:{move:-1,aim:-1},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){updates++},start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render(){},maxSteps:2,backlogExtraTicks:2
 });
 // External opt-in experiment: change the per-callback step budget only
 // BEFORE advancing the source owner. Never let >100ms stall frames use 3.
 const originalAdvance=owner.advance;
 if(activeOnlyThree)owner.advance=function(ts){
  const raw=Math.max(0,ts-this.lastMs);
  this.maxSteps=raw>100+STALL_EPS?2:3;
  return originalAdvance.call(this,ts);
 };
 const rows=[];
 try{
  owner.start();
  for(const dt of gaps){
   elapsed+=dt;now=1000+elapsed;
   const cb=callback;callback=null;assert.equal(typeof cb,'function');
   cb(now);
   rows.push({gap:dt,steps:owner.lastSteps,budget:owner.maxSteps,
    dropped:owner.droppedMs,ticks:owner.ticks});
  }
  return {elapsed,ticks:owner.ticks,updates,droppedMs:owner.droppedMs,
   lagMs:owner.lagMs,rows};
 }finally{owner.stop()}
}
const uniform60=()=>Array(360).fill(1000/60);
const clustered30=()=>Array.from({length:45},()=>[
 55,55,1000/15-55,1000/15-55]).flat();
test('active-only three-step budget conserves clustered 30Hz ticks without changing uniform60',()=>{
 const normal=replay(uniform60()),control=replay(clustered30());
 const pilot=replay(clustered30(),{activeOnlyThree:true});
 assert.equal(normal.ticks,360);
 assert.equal(normal.droppedMs,0);
 // The default owner's known deficit is a negative control, not a golden.
 // A future default-owner fix must be allowed to improve or eliminate it.
 assert.ok(control.ticks>=315&&control.ticks<=360);
 if(control.droppedMs>0)assert.ok(control.ticks<360);
 assert.equal(pilot.ticks,360);
 assert.equal(pilot.updates,360);
 assert.equal(pilot.droppedMs,0);
 assert.equal(pilot.rows.filter(r=>r.steps===3).length,90);
 assert.equal(pilot.rows.filter(r=>r.steps===1).length,90);
 assert.ok(pilot.rows.every(r=>r.steps<=r.budget));
 const uniformPilot=replay(uniform60(),{activeOnlyThree:true});
 assert.equal(uniformPilot.ticks,normal.ticks);
 assert.equal(uniformPilot.droppedMs,0);
 console.log('ACTIVE_ONLY_THREE_STEP '+JSON.stringify({
  clusteredDefault:{ticks:control.ticks,droppedMs:control.droppedMs},
  clusteredPilot:{ticks:pilot.ticks,droppedMs:pilot.droppedMs,
   threeUpdateFrames:pilot.rows.filter(r=>r.steps===3).length}
 }));
});
test('active-only pilot retains exact two-step cap on a >100ms foreground stall',()=>{
 const gaps=[120,1000/60,1000/60,1000/60];
 const control=replay(gaps),pilot=replay(gaps,{activeOnlyThree:true});
 assert.equal(control.rows[0].budget,2);
 assert.equal(pilot.rows[0].budget,2);
 assert.equal(control.rows[0].steps,2);
 assert.equal(pilot.rows[0].steps,2);
 assert.ok(Math.abs(control.rows[0].dropped-pilot.rows[0].dropped)<EPS);
 assert.ok(control.rows[0].dropped>0);
 assert.equal(pilot.ticks,control.ticks);
 assert.ok(Math.abs(pilot.droppedMs-control.droppedMs)<EPS);
});

test('sub-microsecond >100ms boundary cannot accidentally widen stall catch-up',()=>{
 const gaps=[100+5e-7,1000/60];
 const control=replay(gaps),pilot=replay(gaps,{activeOnlyThree:true});
 assert.equal(pilot.rows[0].budget,2);
 assert.equal(control.rows[0].steps,pilot.rows[0].steps);
 assert.ok(Math.abs(control.rows[0].dropped-pilot.rows[0].dropped)<EPS);
});

test('long stall after active three-step frames resets to original two-step safety budget',()=>{
 const gaps=[1000/60,1000/60,120,1000/60];
 const control=replay(gaps),pilot=replay(gaps,{activeOnlyThree:true});
 assert.equal(pilot.rows[0].budget,3);
 assert.equal(pilot.rows[1].budget,3);
 assert.equal(pilot.rows[2].budget,2);
 assert.equal(pilot.rows[2].steps,2);
 assert.equal(pilot.rows[2].steps,control.rows[2].steps);
 assert.ok(Math.abs(pilot.rows[2].dropped-control.rows[2].dropped)<EPS);
 assert.equal(pilot.ticks,control.ticks);
});
