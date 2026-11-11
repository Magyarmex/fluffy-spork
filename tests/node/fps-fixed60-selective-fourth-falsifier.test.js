'use strict';
/* #799: exact research-owner falsifier for a tempting selective fourth-update
 * shortcut. This exercises FixedStepRafOwner itself, not a rewritten formula.
 * No production scheduler is changed or endorsed. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const STEP_MS=1000/60;
const GAPS_IN_TICKS=[4.5,5.9,.1,.1,1.35,1.35,1.35,1.35];
function run(selective){
 let now=1000,callback=null,updates=0;
 const game={input:{},sfx:{startMusic(){}},paused:false,status:'playing',
  raf:null,w:800,h:600,update(dt){assert.ok(Math.abs(dt-1/60)<1e-9);updates++;},
  destroy(){},start(){},setPaused(v){this.paused=!!v;}};
 const timeline={input:game.input,reset(){},consumeThrough(){}};
 const bridge={timeline,startMs:1000,takeStaleTouchResetNotice(){return false;}};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null;},
  render(){},maxSteps:4,backlogExtraTicks:3
 });
 if(selective){
  const originalAdvance=owner.advance;
  owner.advance=function(ts){
   const raw=Math.max(0,ts-this.lastMs);
   // Proposed research-only heuristic: save fourth-update CPU work until
   // pre-frame debt exceeds 4.75 ticks; retain the 100ms stall fallback.
   this.maxSteps=raw>100+1e-7?2:
    (this.lagMs+raw>4.75*STEP_MS?4:3);
   return originalAdvance.call(this,ts);
  };
 }
 try{
  owner.start();
  for(const ticks of GAPS_IN_TICKS){
   const gap=ticks*STEP_MS;
   assert.ok(gap>0&&gap<100,'all gaps must be active non-stall frames');
   now+=gap;
   const frame=callback;callback=null;
   assert.equal(typeof frame,'function','RAF callback must be scheduled');
   frame(now);
  }
  return {updates,ticks:owner.ticks,droppedMs:owner.droppedMs,
   queuedMs:owner.lagMs,wallMs:now-1000};
 }finally{owner.stop();}
}
test('selective fourth-update threshold can discard a whole tick that unconditional 4+3 preserves',()=>{
 const full=run(false),selective=run(true);
 assert.ok(Math.abs(full.wallMs-16*STEP_MS)<.002);
 assert.ok(Math.abs(selective.wallMs-full.wallMs)<.002);
 assert.equal(full.ticks,16);
 assert.equal(full.updates,16);
 assert.equal(full.droppedMs,0);
 assert.equal(selective.ticks,15);
 assert.equal(selective.updates,15);
 assert.ok(Math.abs(selective.droppedMs-STEP_MS)<.002,
  '4.75-tick shortcut loses one entire simulated frame');
 for(const r of [full,selective])
  assert.ok(Math.abs(r.ticks*STEP_MS+r.droppedMs+r.queuedMs-r.wallMs)<.002,
   'executed + discarded + queued must equal elapsed time');
 console.log('SELECTIVE_FOURTH_STEP_FALSIFIER '+JSON.stringify({
  frameGapsTicks:GAPS_IN_TICKS,full,selective,
  caveat:'source-executed zero-cost owner; constructed timing, not device incidence or CPU benefit'}));
});
