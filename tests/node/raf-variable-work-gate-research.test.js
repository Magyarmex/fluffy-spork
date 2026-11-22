'use strict';
/* #799 research: exercise the exact materialized Game.start RAF owner under
 * correlated, variable synthetic CPU costs. This is NOT a mobile benchmark
 * and does not change production timing, gameplay or deployment inputs.
 * A green test proves source execution and bounds, not safe threshold tuning. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const html=patchRafStepCap(fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8'));
const begin=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const end=html.indexOf('    destroy() {',begin);
assert.ok(begin>=0&&end>begin,'materialized Game.start owner');
const original=html.slice(begin,end).trim();
const guard='priorWork < 18 && earlierWork < 18';
assert.equal(original.split(guard).length-1,1,'one shipping work gate');
const policies={
 shipping:original,
 candidate22:original.replace(guard,'priorWork < 22 && earlierWork < 22'),
 candidate26:original.replace(guard,'priorWork < 26 && earlierWork < 26')
};
function rng(seed){
 let x=seed>>>0;
 return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
}
function run(source,seed,profile){
 const random=rng(seed),heavy=profile==='heavy';
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0;
 let steps=0,maxSteps=0,overruns=0,load=heavy?14:8,frameStart=0;
 let updateCost=8,renderCost=4,maxFrameWork=0;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+source+'}).start')({now:()=>now+work},
  fn=>{raf=fn;return 1;},{render(){
   draws++;work+=renderCost;
  }});
 const game={paused:false,__novaDestroyed:false,mmTimer:.08,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-10,'bounded collision update');
   sim+=dt;updates++;steps++;work+=updateCost;
  },drawMinimap(){}};
 start.call(game);
 for(let i=0;i<240;i++){
  // Correlated CPU cost and rare spikes. No assertion that these represent
  // any particular Android, browser, thermal state or actual Game workload.
  load=Math.max(2,Math.min(38,.92*load+.08*
   ((heavy?8:4)+random()*(heavy?19:13))+(random()-.5)*2.5));
  updateCost=load+(random()<(heavy?.035:.012)?8+17*random():0);
  renderCost=Math.max(1,(heavy?7:4)+(random()-.5)*3.4);
  now+=50;frameStart=work;steps=0;
  const callback=raf;assert.equal(typeof callback,'function');
  callback(now);
  const frameWork=work-frameStart;
  maxFrameWork=Math.max(maxFrameWork,frameWork);
  maxSteps=Math.max(maxSteps,steps);
  if(frameWork>50)overruns++;
 }
 return {sim,updates,draws,maxSteps,overruns,maxFrameWork};
}
test('variable-cost source RAF pilot exposes work-recovery versus overrun tradeoff',()=>{
 const totals={};
 for(const profile of ['medium','heavy']){
  const rows={shipping:[],candidate22:[],candidate26:[]};
  for(let seed=1;seed<=100;seed++)
   for(const [policy,source] of Object.entries(policies)){
    const x=run(source,seed,profile);
    assert.equal(x.draws,240,'all 20Hz display callbacks render');
    assert.ok(x.maxSteps<=2,'never exceed two complete Game updates per draw');
    assert.ok(x.sim<=12+1e-7,'no simulated time created from nowhere');
    assert.ok(x.sim>=0&&x.updates>=240);
    rows[policy].push(x);
   }
  const mean=(arr,key)=>arr.reduce((sum,x)=>sum+x[key],0)/arr.length;
  totals[profile]={};
  for(const [policy,arr] of Object.entries(rows))
   totals[profile][policy]={meanSim:+mean(arr,'sim').toFixed(3),
    overrunFrames:arr.reduce((sum,x)=>sum+x.overruns,0),
    maxObservedFrameWork:+Math.max(...arr.map(x=>x.maxFrameWork)).toFixed(2)};
  assert.ok(mean(rows.candidate26,'sim')>=mean(rows.shipping,'sim')-1e-8,
   'looser synthetic gate cannot recover less simulation time');
  // An enlarged historical-work gate is not a free mobile-safe optimization.
  // If this falsifier fails after a code change, inspect the model and source.
  assert.ok(totals[profile].candidate26.overrunFrames>=
   totals[profile].shipping.overrunFrames,'larger gate must not hide overrun risk');
 }
 console.log('NOVA_VARIABLE_RAF_WORK_RESEARCH '+JSON.stringify(totals));
});
