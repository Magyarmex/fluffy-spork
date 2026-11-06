'use strict';
// Research pilot must never strand the playable game's input/lifecycle when
// a hostile callback throws during teardown. This does not enable fixed60.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner,createFixedStepBrowserPilot}=
  require('../research/fixed-step-raf-owner.cjs');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');

function emitter(){
 const listeners=new Map();
 return {
  addEventListener(type,fn){
   if(!listeners.has(type))listeners.set(type,new Set());
   listeners.get(type).add(fn);
  },
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0)}
 };
}
test('faulted input reset cannot strand the stopped RAF lifecycle',()=>{
 const input={},game={input,raf:null,sfx:{startMusic(){}},
  update(){},start(){},destroy(){},setPaused(){}};
 const originals={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
 let resets=0;
 const timeline={input,reset(){if(++resets>1)throw Error('reset failed')},
  consumeThrough(){}};
 const owner=new FixedStepRafOwner(game,timeline,{timeline,startMs:1000},{
  now:()=>1000,request:()=>7,cancel:()=>{},render:()=>{}});
 owner.start();
 assert.throws(()=>owner.stop(),/reset failed/);
 assert.equal(owner.started,false);
 for(const name of Object.keys(originals))assert.equal(game[name],originals[name]);
 assert.doesNotThrow(()=>owner.stop(),'repeat stop is harmless');
});

test('faulted capture reset still reattaches the production Input',()=>{
 const win=emitter(),doc=emitter(),canvas=emitter();
 let attached=0,detached=0;
 const input={canvas,
  attach(c){attached++;this.canvas=c;win.addEventListener('keydown',this.kd)},
  detach(){detached++;win.removeEventListener('keydown',this.kd);this.canvas=null},
  kd(){}};
 input.attach(canvas);
 let resets=0;
 const timeline={input,reset(){if(++resets>1)throw Error('reset failed')}};
 const capture=new BrowserInputCapture(input,canvas,timeline,{timeline},
  {window:win,document:doc});
 assert.equal(input.canvas,canvas);
 assert.throws(()=>capture.detach(),/reset failed/);
 assert.equal(input.canvas,canvas);
 assert.equal(attached,2,'production listeners were restored');
 assert.equal(detached,1);
 assert.equal(win.count(),1,'only original production listener remains');
 assert.equal(doc.count(),0);
 assert.equal(canvas.count(),0);
 assert.doesNotThrow(()=>capture.detach());
});

test('fatal simulation remains primary error despite owner and capture reset faults',()=>{
 const win=emitter(),doc=emitter(),canvas=emitter();
 const input={canvas,keyboard:{},move:{},aim:{},stickId:{move:-1,aim:-1},
  firing:false,abilityQueued:false,autofire:false,
  kd(){},ku(){},pd(){},pm(){},pu(){},
  attach(c){this.canvas=c;win.addEventListener('keydown',this.kd)},
  detach(){win.removeEventListener('keydown',this.kd);this.canvas=null}};
 input.attach(canvas);
 const game={input,raf:null,paused:false,sfx:{startMusic(){}},
  start(){},destroy(){},setPaused(){},
  update(){throw Error('original combat failure')},w:320,h:568};
 const originals={start:game.start,destroy:game.destroy,setPaused:game.setPaused};
 let callback;
 const pilot=createFixedStepBrowserPilot(game,{window:win,document:doc,
  canvas,clock:{now:()=>1000,timeOrigin:1793560000000},
  request:fn=>(callback=fn,7),cancel:()=>{},render:()=>{}});
 pilot.start();
 const reset=pilot.timeline.reset.bind(pilot.timeline);
 pilot.timeline.reset=function(){reset();throw Error('teardown reset failed')};
 assert.throws(()=>callback(1034),/original combat failure/,
  'cleanup failures cannot conceal the simulation exception');
 assert.equal(pilot.owner.started,false);
 assert.equal(pilot.capture.active,false);
 assert.equal(input.canvas,canvas,'original production input reattached');
 assert.equal(win.count(),1,'no research input listeners survive');
 assert.equal(doc.count(),0);
 assert.equal(canvas.count(),0);
 for(const name of Object.keys(originals))assert.equal(game[name],originals[name]);
});
