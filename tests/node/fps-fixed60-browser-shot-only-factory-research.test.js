'use strict';
// Research-only integration gate: a shot-only pulse must be installed before
// the RAF owner snapshots Game lifecycle hooks, then fully detached on stop.
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');

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
function run({shotOnlyPulse=false,release='pointerup',maxSteps=3,failRequest=false}={}){
 const canvas=target(),win=target(),doc=target();doc.hidden=false;
 let now=1000,callback=null,shots=[],commands=0;
 const input={canvas,touchSeen:true,stickId:{move:-1,aim:-1},
  aim:{active:false,dx:0,dy:0},move:{active:false,dx:0,dy:0},
  keyboard:{},firing:false,autofire:false,
  attach(c){this.canvas=c},detach(){},
  pd(e){if(e.pointerType==='touch'){this.stickId.aim=e.pointerId;
    this.aim.active=true;this.aim.dx=0;this.aim.dy=0}},
  pm(e){if(this.stickId.aim===e.pointerId)this.aim.dx=e.clientX-600},
  pu(e){if(this.stickId.aim===e.pointerId){this.stickId.aim=-1;
    this.aim.active=false;this.aim.dx=0}},
  aimVec(){return {x:this.aim.dx/40,y:0}},
  __novaBlurReset(){this.pu({pointerId:this.stickId.aim});this.firing=false}
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
  canvas,maxSteps,shotOnlyPulse});
 try{
  pilot.start();
  for(let frame=1;frame<=8;frame++){
   now=1000+frame*50;
   if(frame===3)for(const [type,at,x] of
     [['pointerdown',134,600],['pointermove',137,640],[release,140,640]]){
    const place=type==='pointerdown'?canvas:win;
    place.dispatch({type,timeStamp:1000+at,pointerType:'touch',
      pointerId:22,clientX:x,clientY:200,button:0,
      buttons:type===release?0:1,target:canvas});
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
