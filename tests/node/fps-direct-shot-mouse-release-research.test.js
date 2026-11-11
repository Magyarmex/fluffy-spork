'use strict';
// Research only: #641 release-time mouse target must survive intervening cursor
// movement before the next real composed Game.update. No production wiring.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function scenario(cls,moveAfterRelease,moveBeforeRelease=true,cameraShift=false){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
  const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const ev=(type,x,y,buttons)=>({type,pointerType:'mouse',pointerId:1,
   button:0,buttons,clientX:x,clientY:y,target:{closest:()=>null}});
  try{
   i.pd(ev('pointerdown',350,180,1));
   if(moveBeforeRelease)i.pm(ev('pointermove',400,200,1));
   i.pu(ev('pointerup',400,200,0));
   assert.ok(o.pending&&o.pending.mouse,'short mouse release owns a target');
   if(moveAfterRelease)i.pm(ev('pointermove',700,500,0));
   if(cameraShift){g.cam.x+=190;g.cam.y-=100;g.cam.zoom*=.72;}
   const live={x:i.mouseX,y:i.mouseY};
   g.update(1/60);
   assert.equal(i.mouseX,live.x,'restore later physical mouse X');
   assert.equal(i.mouseY,live.y,'restore later physical mouse Y');
   assert.equal(i.__novaShotIntent,undefined,'no leaked synthetic input');
   assert.equal(o.intents,1,'one consumed release intent');
   // Array.from creates a host-realm array; Game lives in a separate VM realm.
   const bullets=Array.from(g.bullets,b=>({
    x:b.x,y:b.y,vx:b.vx,vy:b.vy,angle:b.angle,
    fuse:b.fuse,range:b.range,life:b.life,ttl:b.ttl,
    cannonFuse:b.__v17FuseDist,cannonArmed:b.__v17FuseArmed
   }));
   return {bullets,angle:g.player.angle,fireCd:g.player.fireCd,
    fuseDepth:g.player.__v17FuseDepth,fuseDist:g.player.__v17FuseDist};
  }finally{o.detach();g.destroy();}
 });
}
test('real composed Game uses release-time mouse target despite intervening cursor move',()=>{
 for(const cls of ['scout','cannon','carrier']){
  const fixed=scenario(cls,false),moved=scenario(cls,true);
  assert.ok(fixed.bullets.length>0,cls+' actual projectile birth');
  assert.deepEqual(moved,fixed,cls+' released shot should not follow a later cursor');
  const releaseOnly=scenario(cls,false,false);
  assert.deepEqual(releaseOnly,fixed,cls+' release coordinate works without delivered mousemove');
 }
});

test('exception during recovered Game.update restores the physical cursor and intent',()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
 const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
 const ev=(type,x,y,buttons)=>({type,pointerType:'mouse',pointerId:1,
  button:0,buttons,clientX:x,clientY:y,target:{closest:()=>null}});
 try{
  i.pd(ev('pointerdown',400,200,1));
  i.pu(ev('pointerup',400,200,0));
  i.pm(ev('pointermove',700,500,0));
  assert.ok(o.pending);
  o.old.update=()=>{throw Error('simulated update failure');};
  assert.throws(()=>g.update(1/60),/simulated update failure/);
  assert.equal(i.mouseX,700);assert.equal(i.mouseY,500);
  assert.equal(i.__novaShotIntent,undefined);
  assert.equal(o.pending,null);
 }finally{o.detach();g.destroy();}
});

test('release-time mouse shot retains world target when camera pans and zooms before consumption',()=>{
 for(const cls of ['scout','cannon','carrier']){
  const baseline=scenario(cls,false,true,false);
  const shifted=scenario(cls,false,true,true);
  assert.ok(baseline.bullets.length>0,cls+' fires a real projectile');
  assert.deepEqual(shifted,baseline,cls+' camera motion must not retarget the released world point');
 }
});

test('native mouse chord release keeps the world target through camera motion',()=>{
 function chord(shift){return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  try{
   i.mouseActive=true;i.mouseX=400;i.mouseY=200;
   const ev={button:0,clientX:400,clientY:200};
   o.nativeDown(ev);o.nativeUp(ev);
   assert.ok(o.pending&&o.pending.mouse,'native mouse release captured');
   if(shift){g.cam.x+=190;g.cam.y-=100;g.cam.zoom*=.72;}
   g.update(1/60);
   assert.equal(o.intents,1);
   return {angle:g.player.angle,bullets:Array.from(g.bullets,b=>
    ({x:b.x,y:b.y,vx:b.vx,vy:b.vy,angle:b.angle}))};
  }finally{o.detach();g.destroy();}
 });}
 const baseline=chord(false),shifted=chord(true);
 assert.ok(baseline.bullets.length>0,'native chord fires actual projectile');
 assert.deepEqual(shifted,baseline,'native mouse release must not follow camera motion');
});

test('Long Glass camera frame at Game.update start cannot move recovered Controller shot',()=>{
 function run(remote){return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.setClass(g.player,'carrier');
  const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const ev=(type,x,y,buttons)=>({type,pointerType:'mouse',pointerId:1,
   button:0,buttons,clientX:x,clientY:y,target:{closest:()=>null}});
  try{
   i.pd(ev('pointerdown',350,180,1));
   i.pu(ev('pointerup',400,200,0));
   const initial={x:g.cam.x,y:g.cam.y,z:g.cam.zoom};
   if(remote){
    const s=g.player.__novaSwarm||{};
    s.active=true;s.nodeX=g.player.x+2400;s.nodeY=g.player.y+1100;
    g.player.__novaSwarm=s;
   }
   g.update(1/60);
   const moved=Math.hypot(g.cam.x-initial.x,g.cam.y-initial.y)+
    Math.abs(g.cam.zoom-initial.z);
   assert.equal(o.intents,1,'one actual short shot consumed');
   return {angle:g.player.angle,bullets:Array.from(g.bullets,b=>
    ({x:b.x,y:b.y,vx:b.vx,vy:b.vy,angle:b.angle})),moved};
  }finally{o.detach();g.destroy();}
 });}
 const normal=run(false),framed=run(true);
 assert.ok(framed.moved>.1,'real tactical framing must move the camera in this test');
 assert.ok(normal.bullets.length>0,'real Controller projectile exists');
 assert.deepEqual(framed.bullets,normal.bullets,'camera frame cannot retarget projectile');
 assert.equal(framed.angle,normal.angle,'camera frame cannot retarget hull bearing');
});
