'use strict';
// Research-only integration gate: a shot-only pulse must be installed before
// the RAF owner snapshots Game lifecycle hooks, then fully detached on stop.
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');

function target(){
 const handlers=new Map();
 return {
  addEventListener(k,fn){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(fn)},
  removeEventListener(k,fn){handlers.set(k,(handlers.get(k)||[]).filter(f=>f!==fn))},
  dispatch(e){for(const fn of handlers.get(e.type)||[])fn(e)},
  getBoundingClientRect(){return {left:0,width:800}},
  listenerCount(){return [...handlers.values()].reduce((n,list)=>n+list.length,0)}
 };
}
function run({shotOnlyPulse=false,release='pointerup',maxSteps=3,failRequest=false,mouse=false,compat=false}={}){
 const canvas=target(),win=target(),doc=target();doc.hidden=false;
 let now=1000,callback=null,shots=[],commands=0;
 const input={canvas,touchSeen:!mouse,stickId:{move:-1,aim:-1},
  aim:{active:false,dx:0,dy:0},move:{active:false,dx:0,dy:0},
  keyboard:{},firing:false,autofire:false,mouseActive:false,
  attach(c){this.canvas=c},detach(){},
  pd(e){if(e.pointerType==='mouse'&&e.button===0){this.mouseActive=true;this.firing=true}
    else if(e.pointerType==='touch'){this.stickId.aim=e.pointerId;
    this.aim.active=true;this.aim.dx=0;this.aim.dy=0}},
  pm(e){if(this.stickId.aim===e.pointerId)this.aim.dx=e.clientX-600},
  pu(e){if(e.pointerType==='mouse'){this.mouseActive=false;this.firing=false}
    else if(this.stickId.aim===e.pointerId){this.stickId.aim=-1;
    this.aim.active=false;this.aim.dx=0}},
  aimVec(){return {x:this.aim.dx/40,y:0}},
  __novaBlurReset(){this.pu({pointerId:this.stickId.aim});this.mouseActive=false;this.firing=false}
 };
 const game={input,raf:null,status:'playing',paused:false,
  sfx:{startMusic(){}},w:800,h:600,
  update(){if(this.input.firing)shots.push(now-1000);this.updateDrones()},
  updateDrones(){if(this.input.firing)commands++},
  destroy(){},start(){},setPaused(){}};
 const originals={update:game.update,destroy:game.destroy,pd:input.pd};
 const pilot=createFixedStepBrowserPilot(game,{window:win,document:doc,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:fn=>{if(failRequest)throw Error('host refused RAF');callback=fn;return 1},
  cancel:()=>{callback=null},render(){},
  canvas,maxSteps,shotOnlyPulseFactory:shotOnlyPulse?
    (g,t)=>new ShotOnlyFirePulse(g,t):null});
 try{
  pilot.start();
  for(let frame=1;frame<=8;frame++){
   now=1000+frame*50;
   if(frame===3){
    const events=mouse ? (compat ?
      [['pointerdown',134,600],['mousedown',135,600],
       ['pointerup',140,600],['mouseup',141,600]] :
      [['mousedown',134,600],['mouseup',140,600]]) :
      [['pointerdown',134,600],['pointermove',137,640],[release,140,640]];
    for(const [type,at,x] of events){
     const place=type==='pointerdown'||type==='mousedown'?canvas:win;
     place.dispatch({type,timeStamp:1000+at,pointerType:mouse?'mouse':'touch',
       pointerId:mouse?1:22,clientX:x,clientY:200,button:0,
       buttons:type==='pointerup'||type==='mouseup'||type==='pointercancel'?0:1,
       target:canvas});
    }
   }
   const cb=callback;callback=null;assert.equal(typeof cb,'function');cb(now);
  }
  return {shots,commands,pulses:pilot.pulse?.shots||0,ticks:pilot.owner.ticks,
   droppedMs:pilot.owner.droppedMs,aim:input.aim.active,firing:input.firing};
 }finally{
  pilot.stop();pilot.stop();
  assert.equal(game.update,originals.update);
  assert.equal(game.destroy,originals.destroy);
  assert.equal(input.pd,originals.pd);
  assert.equal(pilot.capture.active,false);
  assert.equal(canvas.listenerCount(),0);
  assert.equal(win.listenerCount(),0);
  assert.equal(doc.listenerCount(),0);
 }
}
test('browser factory default does not install shot-only pulse',()=>{
 const baseline=run();assert.deepEqual(baseline.shots,[]);
 assert.equal(baseline.pulses,0);assert.equal(baseline.ticks,24);
});
test('opt-in browser factory recovers exactly one short touch shot and no drone command',()=>{
 const recovered=run({shotOnlyPulse:true});
 assert.deepEqual(recovered.shots,[150]);assert.equal(recovered.pulses,1);
 assert.equal(recovered.commands,0);assert.equal(recovered.ticks,24);
 assert.equal(recovered.aim,false);assert.equal(recovered.firing,false);
});
test('opt-in browser factory never turns pointercancel into a shot',()=>{
 const cancelled=run({shotOnlyPulse:true,release:'pointercancel'});
 assert.deepEqual(cancelled.shots,[]);assert.equal(cancelled.pulses,0);
 assert.equal(cancelled.commands,0);
});
test('two-step overloaded browser factory delays but does not duplicate the shot',()=>{
 const delayed=run({shotOnlyPulse:true,maxSteps:2});
 assert.deepEqual(delayed.shots,[200]);assert.equal(delayed.pulses,1);
 assert.equal(delayed.ticks,16);assert.ok(delayed.droppedMs>0);
 assert.equal(delayed.commands,0);
});

test('failed first RAF request unwinds pulse, capture and Game lifecycle hooks',()=>{
 assert.throws(()=>run({shotOnlyPulse:true,failRequest:true}),/host refused RAF/);
});

test('native mouse and pointer compatibility events recover only one shot',()=>{
 for(const compat of [false,true]){
  const result=run({shotOnlyPulse:true,mouse:true,compat});
  assert.deepEqual(result.shots,[150]);assert.equal(result.pulses,1);
  assert.equal(result.commands,0);assert.equal(result.firing,false);
 }
});
