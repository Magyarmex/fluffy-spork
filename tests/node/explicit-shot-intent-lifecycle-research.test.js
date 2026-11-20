'use strict';
// Research-only one-tick weapon intent; production input remains untouched.
const test=require('node:test'),assert=require('node:assert/strict');
const {ExplicitShotIntent}=require('../research/explicit-shot-intent.cjs');
const event=(type,id)=>({type,pointerType:'touch',pointerId:id,target:{closest:()=>null}});
function setup(){
 const input={aim:{active:false,dx:0,dy:0},stickId:{aim:-1},firing:false,
  mouseActive:false,touchSeen:true,__novaInputPaused:false};
 const timeline={input,reset(){},releaseAll(){}},seen=[];
 input.pd=function(e){if(this.stickId.aim===-1){this.stickId.aim=e.pointerId;this.aim.active=true;}};
 input.pm=function(e){if(this.stickId.aim===e.pointerId){
  this.aim.dx=e.dx||0;this.aim.dy=e.dy||0;this.firing=Math.hypot(this.aim.dx,this.aim.dy)>=9;}};
 input.pu=function(e){if(this.stickId.aim===e.pointerId){
  this.stickId.aim=-1;this.aim.active=false;this.firing=false;}};
 const game={input,player:{id:1,alive:true},status:'playing',paused:false,
  update(){seen.push({intent:this.input.__novaShotIntent,
   firing:this.input.firing,aimActive:this.input.aim.active});},
  destroy(){this.destroyed=true;},__testWindow:{document:{hidden:false}}};
 const owner=new ExplicitShotIntent(game,timeline);
 const press=(id=7,dx=30)=>{input.pd(event('pointerdown',id));
  input.pm({...event('pointermove',id),dx,dy:0});};
 const release=(id=7,type='pointerup')=>input.pu(event(type,id));
 return {game,input,owner,seen,press,release};
}
test('one short pulse fires once without restoring the drone command stick',()=>{
 const f=setup();f.press();f.release();f.game.update(1/30);
 assert.equal(f.seen[0].intent?.fire,true);
 assert.equal(f.seen[0].intent?.aim?.x,1);
 assert.equal(f.seen[0].firing,false);
 assert.equal(f.seen[0].aimActive,false);
 assert.equal(f.input.__novaShotIntent,undefined);
 f.game.update(1/30);
 assert.equal(f.seen[1].intent,undefined);
 assert.equal(f.owner.intents,1);f.owner.detach();
});
test('cancellation, weak deflection and previously sampled hold cannot replay',()=>{
 for(const mode of ['cancel','weak','sampled']){
  const f=setup();f.press(7,mode==='weak'?5:30);
  if(mode==='sampled')f.game.update(1/30);
  f.release(7,mode==='cancel'?'pointercancel':'pointerup');
  f.game.update(1/30);
  assert.equal(f.seen.at(-1).intent,undefined,mode);f.owner.detach();
 }
});
test('pause, hidden tab, input lock and player replacement revoke pending pulse',()=>{
 for(const mode of ['pause','hidden','locked','replacement']){
  const f=setup();f.press();f.release();
  if(mode==='pause')f.game.paused=true;
  if(mode==='hidden')f.game.__testWindow.document.hidden=true;
  if(mode==='locked')f.input.__novaInputPaused=true;
  if(mode==='replacement')f.game.player={id:2,alive:true};
  f.game.update(1/30);
  assert.equal(f.seen.at(-1).intent,undefined,mode);
  assert.equal(f.input.__novaShotIntent,undefined,mode);
  assert.equal(f.owner.pulse.pulses,0,'revoked pulse must not count as recovered');
  f.owner.detach();
 }
});
test('second thumb cannot steal right-stick ownership',()=>{
 const f=setup();f.press(7);f.input.pd(event('pointerdown',8));
 f.input.pm({...event('pointermove',8),dx:-30,dy:0});
 f.release(8);f.release(7);f.game.update(1/30);
 assert.equal(f.seen[0].intent?.fire,true);
 assert.equal(f.seen[0].intent?.aim?.x,1);
 assert.equal(f.seen[0].firing,false);f.owner.detach();
});
test('detach and destroy restore original update and hook owners',()=>{
 const f=setup(),wrapped=f.game.update;f.owner.detach();
 assert.notEqual(f.game.update,wrapped);
 f.game.update(1/30);assert.equal(f.seen[0].intent,undefined);
 const g=setup();g.game.destroy();
 assert.equal(g.game.destroyed,true);
 assert.equal(g.owner.pulse,null);
});
test('stale queued release and dead player never fire a delayed weapon intent',async()=>{
 const stale=setup();stale.press();stale.release();
 await new Promise(resolve=>setTimeout(resolve,75));
 stale.game.update(1/30);
 assert.equal(stale.seen[0].intent,undefined,'expired release must not fire late');
 assert.equal(stale.owner.pulse.pulses,0,'expired release must not count as recovered');
 stale.owner.detach();
 const dead=setup();dead.press();dead.release();dead.game.player.alive=false;
 dead.game.update(1/30);
 assert.equal(dead.seen[0].intent,undefined,'dead player cannot fire queued intent');
 assert.equal(dead.owner.pulse.pulses,0,'dead player must not count as recovered');
 dead.owner.detach();
});
