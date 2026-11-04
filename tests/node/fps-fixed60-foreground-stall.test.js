'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
function setup(){
 let id=0;const callbacks=new Map();
 const input={move:{active:false},stickId:{move:-1},keyboard:{},
  pd(e){this.move.active=true;this.stickId.move=e.pointerId},
  pm(e){if(this.stickId.move===e.pointerId)this.move.active=true},
  pu(e){if(this.stickId.move===e.pointerId){this.move.active=false;this.stickId.move=-1}},
  __novaBlurReset(){this.move.active=false;this.stickId.move=-1}};
 const game={input,sfx:{startMusic(){}},paused:false,raf:0,w:800,h:600,
  update(){},destroy(){},setPaused(v){this.paused=v}};
 const timeline=new ChronologicalInput(input),bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{now:()=>1000,
  request:cb=>{callbacks.set(++id,cb);return id},
  cancel:key=>callbacks.delete(key),render(){},maxSteps:4});
 const frame=ms=>{const cb=callbacks.get(id);assert.ok(cb);callbacks.delete(id);cb(1000+ms)};
 const edge=(ms,kind)=>timeline.push(ms/1000,kind,{pointerId:7,pointerType:'touch'});
 owner.start();edge(0,'pointerdown');frame(20);
 assert.equal(input.move.active,true);
 return {owner,input,timeline,frame,edge};
}
test('short foreground stall retains held stick and processes subsequent movement',()=>{
 const x=setup();x.frame(140);
 assert.equal(x.input.move.active,true,'120ms foreground stall must not silently drop held stick');
 x.edge(145,'pointermove');x.frame(160);
 assert.equal(x.input.move.active,true);
 x.owner.stop();
});
test('queued release during foreground stall is applied before catch-up',()=>{
 const x=setup();x.edge(80,'pointerup');x.frame(140);
 assert.equal(x.input.move.active,false);
 x.owner.stop();
});
test('late release after foreground stall clears held stick',()=>{
 const x=setup();x.frame(140);x.edge(145,'pointerup');x.frame(160);
 assert.equal(x.input.move.active,false);
 x.owner.stop();
});
test('long suspension fails closed and cannot revive old held stick',()=>{
 const x=setup();x.frame(340);
 assert.equal(x.input.move.active,false);
 x.edge(345,'pointermove');x.frame(360);
 assert.equal(x.input.move.active,false);
 x.owner.stop();
});

test('queued pointercancel through stall cannot leave phantom movement',()=>{
 const x=setup();x.edge(90,'pointercancel');x.frame(140);
 assert.equal(x.input.move.active,false);
 assert.equal(x.input.stickId.move,-1);
 x.owner.stop();
});
test('explicit blur reset after a recovered stall releases held input',()=>{
 const x=setup();x.frame(140);
 assert.equal(x.input.move.active,true);
 x.timeline.reset(); // BrowserInputCapture blur/visibilitychange contract.
 assert.equal(x.input.move.active,false);
 x.edge(145,'pointermove');x.frame(160);
 assert.equal(x.input.move.active,false,'movement alone must not re-arm a blurred stick');
 x.owner.stop();
});
