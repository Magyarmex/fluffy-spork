'use strict';
// Research only: #641 release-time mouse target must survive intervening cursor
// movement before the next real composed Game.update. No production wiring.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function scenario(cls,moveAfterRelease){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
  const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const ev=(type,x,y,buttons)=>({type,pointerType:'mouse',pointerId:1,
   button:0,buttons,clientX:x,clientY:y,target:{closest:()=>null}});
  try{
   i.pd(ev('pointerdown',350,180,1));
   i.pm(ev('pointermove',400,200,1));
   i.pu(ev('pointerup',400,200,0));
   assert.ok(o.pending&&o.pending.mouse,'short mouse release owns a target');
   if(moveAfterRelease)i.pm(ev('pointermove',700,500,0));
   const live={x:i.mouseX,y:i.mouseY};
   g.update(1/60);
   assert.equal(i.mouseX,live.x,'restore later physical mouse X');
   assert.equal(i.mouseY,live.y,'restore later physical mouse Y');
   assert.equal(i.__novaShotIntent,undefined,'no leaked synthetic input');
   assert.equal(o.intents,1,'one consumed release intent');
   const bullets=g.bullets.map(b=>({
    x:b.x,y:b.y,vx:b.vx,vy:b.vy,angle:b.angle,
    fuse:b.fuse,range:b.range,life:b.life,ttl:b.ttl
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
 }
});
