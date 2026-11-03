'use strict';
// The research browser artifact must be an exact, inert packaging of the
// canonical CJS owners, not a second implementation or an implicit opt-in.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {buildBrowserBundle,MODULES}=
  require('../../scripts/build-fixed60-research-bundle.cjs');
const artifact=path.resolve(__dirname,'../../nova-updates/fixed60-research-browser.js');

test('browser research bundle is deterministic and matches exact source graph',()=>{
 const first=buildBrowserBundle(),second=buildBrowserBundle();
 assert.equal(first,second);
 assert.equal(first,fs.readFileSync(artifact,'utf8'),
  'regenerate research bundle after any source module changes');
 assert.deepEqual(MODULES,[
  'fixed-step-dom-input.cjs','fixed-step-browser-events.cjs',
  'fixed-step-browser-capture.cjs','fixed-step-raf-owner.cjs']);
});

test('browser artifact loads without CommonJS or starting a game',()=>{
 let requests=0;
 const window={requestAnimationFrame(){requests++}};
 const sandbox={window};
 vm.runInNewContext(fs.readFileSync(artifact,'utf8'),sandbox,
  {timeout:1000,filename:'fixed60-research-browser.js'});
 const api=window.__novaFixed60Research;
 assert.ok(Object.isFrozen(api));
 assert.equal(typeof api.FixedStepRafOwner,'function');
 assert.equal(typeof api.createFixedStepBrowserPilot,'function');
 assert.equal(api.STEP_MS,1000/60);
 assert.equal(requests,0,'import must never start a scheduler');
 assert.equal(sandbox.__novaFixed60Research,undefined,
  'only the explicit browser namespace is installed');
});

test('browser owner executes exactly the same bounded steps as source owner',()=>{
 const sandbox={window:{}};
 vm.runInNewContext(fs.readFileSync(artifact,'utf8'),sandbox,{timeout:1000});
 const BrowserOwner=sandbox.window.__novaFixed60Research.FixedStepRafOwner;
 const SourceOwner=require('../research/fixed-step-raf-owner.cjs').FixedStepRafOwner;
 function run(Owner){
  const input={},calls=[],timeline={input,reset(){calls.push('reset')},
    consumeThrough(t){calls.push(['input',t])}};
  const g={input,sfx:{startMusic(){}},paused:false,raf:null,
    update(dt){calls.push(['update',dt])},w:100,h:100};
  const frames=new Map();let id=0;
  const owner=new Owner(g,timeline,{timeline,startMs:1000},{
    now:()=>1000,request:fn=>{frames.set(++id,fn);return id},
    cancel:()=>{},render:(_g,_w,_h,alpha)=>calls.push(['render',alpha]),
    maxSteps:4
  });
  owner.start();
  for(const at of [1050,1100,1150,1200]){
    const fn=frames.get(id);fn(at);
  }
  const state={ticks:owner.ticks,dropped:owner.droppedMs,
    lag:owner.lagMs,alpha:owner.alpha};
  owner.stop();
  return {calls,state};
 }
 assert.deepEqual(JSON.parse(JSON.stringify(run(BrowserOwner))),run(SourceOwner));
});

test('bundle builder refuses unknown module imports',()=>{
 const root=path.resolve(__dirname,'../research');
 assert.throws(()=>buildBrowserBundle(name=>{
  if(name==='fixed-step-raf-owner.cjs')return "require('node:fs');";
  return fs.readFileSync(path.join(root,name),'utf8');
 }),/unapproved fixed60 browser import/);
});
