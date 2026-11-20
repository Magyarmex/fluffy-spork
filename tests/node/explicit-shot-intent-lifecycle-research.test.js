'use strict';
// Research-only one-tick weapon intent; production input remains untouched.
const test=require('node:test'),assert=require('node:assert/strict');
const {ExplicitShotIntent}=require('../research/explicit-shot-intent.cjs');
const event=(type,id)=>({type,pointerType:'touch',pointerId:id,target:{closest:()=>null}});
function setup(){
 const input={aim:{active:false,dx:0,dy:0},stickId:{aim:-1},firing:false,
  mouseActive:false,touchSeen:true,__novaInputPaused:false};
 const timeline={input,reset(){},releaseAll(){}},seen=[];
 input.pd=function(e){if(this.stickId.aim===-1){this.stickId.aim=e.pointerId;this.aim.active=true;this.firing=true;}};
 input.pm=function(e){if(this.stickId.aim===e.pointerId){
  this.aim.dx=e.dx||0;this.aim.dy=e.dy||0;}};
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

test('new right thumb supersedes stale aim, while left movement thumb preserves it',()=>{
 const right=setup();right.input.canvas={getBoundingClientRect:()=>({left:0,width:390})};
 right.press(7);right.release(7);
 right.input.pd({...event('pointerdown',8),clientX:300});
 assert.equal(right.input.stickId.aim,8,'new right thumb must own the stick');
 right.game.update(1/30);
 assert.equal(right.seen[0].intent,undefined,'old right-thumb release is superseded');
 right.owner.detach();
 const left=setup();left.input.canvas={getBoundingClientRect:()=>({left:0,width:390})};
 left.press(7);left.release(7);
 left.input.pd({...event('pointerdown',8),clientX:50});
 left.game.update(1/30);
 assert.equal(left.seen[0].intent?.fire,true,'left thumb must not cancel prior shot');
 left.owner.detach();
});

test('centered tick before first deflection must not consume a later short shot',()=>{
 const f=setup();
 f.input.pd(event('pointerdown',7));
 f.game.update(1/30);
 assert.equal(f.owner.pulse.down?.sampled,false,'centered tick has no firing bearing');
 f.input.pm({...event('pointermove',7),dx:30,dy:0});
 f.release(7);f.game.update(1/30);
 assert.equal(f.seen.at(-1).intent?.fire,true);
 assert.equal(f.owner.intents,1);f.owner.detach();
 const centered=setup();centered.input.pd(event('pointerdown',7));
 centered.game.update(1/30);centered.release(7);centered.game.update(1/30);
 assert.equal(centered.owner.intents,0,'centered-only tap must never fire');
 centered.owner.detach();
});

test('raw subtick pulse also rejects stale and dead-owner firing',async()=>{
 const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
 for(const mode of ['stale','dead']){
  const input={aim:{active:false,dx:0,dy:0},stickId:{aim:-1},firing:false,touchSeen:true};
  const timeline={input,reset(){},releaseAll(){}};
  let shots=0;
  input.pd=function(e){this.stickId.aim=e.pointerId;this.aim.active=true;this.firing=true;};
  input.pm=function(){this.aim.dx=30;};
  input.pu=function(){this.stickId.aim=-1;this.aim.active=false;this.firing=false;};
  const game={input,player:{id:1,alive:true},status:'playing',paused:false,
   __testWindow:{document:{hidden:false}},
   update(){if(this.input.firing&&this.input.aim.active&&this.input.aim.dx>=9)shots++;}};
  const pulse=new SubtickFirePulse(game,timeline);
  input.pd(event('pointerdown',7));input.pm(event('pointermove',7));
  input.pu(event('pointerup',7));
  if(mode==='stale')await new Promise(resolve=>setTimeout(resolve,75));
  if(mode==='dead')game.player.alive=false;
  game.update(1/30);
  assert.equal(shots,0,mode+' raw pulse cannot replay a revoked shot');
  assert.equal(pulse.pulses,0,mode+' cannot count a recovered shot');
  pulse.detach();
 }
});

test('trusted physical release time rejects late delivery despite a fresh handler',()=>{
 for(const offset of [-120, 120]){
  const f=setup();f.press();
  const e={...event('pointerup',7),isTrusted:true,
   timeStamp:performance.now()+offset};
  f.input.pu(e);
  f.game.update(1/30);
  assert.equal(f.seen[0].intent,undefined,
   'trusted release with stale/future physical timestamp cannot become fresh');
  assert.equal(f.owner.intents,0);
  assert.equal(f.owner.pulse.pulses,0);
  f.owner.detach();
 }
});
test('fresh trusted physical release retains exactly one weapon-only intent',()=>{
 const f=setup();f.press();
 f.input.pu({...event('pointerup',7),isTrusted:true,timeStamp:performance.now()});
 f.game.update(1/30);
 assert.equal(f.seen[0].intent?.fire,true);
 assert.equal(f.seen[0].firing,false);
 f.game.update(1/30);
 assert.equal(f.seen[1].intent,undefined);
 assert.equal(f.owner.intents,1);
 f.owner.detach();
});
test('raw pulse also refuses a physically stale trusted release',()=>{
 const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
 const input={aim:{active:false,dx:0,dy:0},stickId:{aim:-1},firing:false,touchSeen:true};
 const timeline={input,reset(){},releaseAll(){}};
 let shots=0;
 input.pd=function(e){this.stickId.aim=e.pointerId;this.aim.active=true;this.firing=true;};
 input.pm=function(){this.aim.dx=30;};
 input.pu=function(){this.stickId.aim=-1;this.aim.active=false;this.firing=false;};
 const game={input,player:{id:1,alive:true},status:'playing',paused:false,
  __testWindow:{document:{hidden:false}},
  update(){if(this.input.firing&&this.input.aim.active)shots++;}};
 const pulse=new SubtickFirePulse(game,timeline);
 input.pd(event('pointerdown',7));input.pm(event('pointermove',7));
 input.pu({...event('pointerup',7),isTrusted:true,
  timeStamp:performance.now()-120});
 game.update(1/30);
 assert.equal(shots,0);
 assert.equal(pulse.pulses,0);
 pulse.detach();
});

test('stalled long trusted hold is not mistaken for a short unsampled press',()=>{
 const f=setup();
 f.input.pd({...event('pointerdown',7),isTrusted:true,
  timeStamp:performance.now()-250});
 f.input.pm({...event('pointermove',7),dx:30,dy:0});
 f.input.pu({...event('pointerup',7),isTrusted:true,
  timeStamp:performance.now()});
 f.game.update(1/30);
 assert.equal(f.seen[0].intent,undefined);
 assert.equal(f.owner.intents,0);
 assert.equal(f.owner.pulse.pulses,0);
 f.owner.detach();
});

test('short physical hold may recover late within its independent release budget',()=>{
 const f=setup(),now=performance.now();
 f.input.pd({...event('pointerdown',7),isTrusted:true,timeStamp:now-60});
 f.input.pm({...event('pointermove',7),dx:30,dy:0});
 f.input.pu({...event('pointerup',7),isTrusted:true,timeStamp:now-40});
 f.game.update(1/30);
 assert.equal(f.seen[0].intent?.fire,true,
  '20ms physical hold plus 40ms release-to-tick is still legal');
 assert.equal(f.owner.intents,1);
 f.owner.detach();
});

test('mixed trusted and unverified timestamp provenance cannot certify a pulse',()=>{
 const f=setup();
 f.input.pd(event('pointerdown',7));
 f.input.pm({...event('pointermove',7),dx:30,dy:0});
 f.input.pu({...event('pointerup',7),isTrusted:true,timeStamp:performance.now()});
 f.game.update(1/30);
 assert.equal(f.seen[0].intent,undefined);
 assert.equal(f.owner.intents,0);
 f.owner.detach();
});

test('dead owner cannot retain an unreleased physical aim stick across update',()=>{
 const f=setup();
 f.press();f.game.player.alive=false;
 f.game.update(1/30);
 assert.equal(f.seen[0].firing,false);
 assert.equal(f.seen[0].aimActive,false);
 assert.equal(f.owner.pulse.down,null);
 assert.equal(f.input.stickId.aim,-1);
 f.owner.detach();
});

test('trusted events with unusable timestamps cannot be laundered as unverified',()=>{
 for(const stamp of [NaN,0,Infinity]){
  const f=setup();
  f.input.pd({...event('pointerdown',7),isTrusted:true,timeStamp:stamp});
  f.input.pm({...event('pointermove',7),dx:30,dy:0});
  f.input.pu({...event('pointerup',7),isTrusted:true,timeStamp:stamp});
  f.game.update(1/30);
  assert.equal(f.seen[0].intent,undefined,String(stamp));
  assert.equal(f.owner.intents,0);
  f.owner.detach();
 }
});

test('browser visibility guard works without Node-only __testWindow',()=>{
 const {ownerDocumentHidden}=require('../research/subtick-fire-pulse.cjs');
 const prior=globalThis.document;
 try{
  globalThis.document={hidden:true};
  assert.equal(ownerDocumentHidden({}),true);
  globalThis.document.hidden=false;
  assert.equal(ownerDocumentHidden({}),false);
  assert.equal(ownerDocumentHidden({__testWindow:{document:{hidden:true}}}),true);
 }finally{
  if(prior===undefined)delete globalThis.document;
  else globalThis.document=prior;
 }
});
