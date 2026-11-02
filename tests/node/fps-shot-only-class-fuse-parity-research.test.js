'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
const classes=Object.keys(bootGame().__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
function arm(cls,kind,mode){return withSeed(1517800,()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
 const t=new ChronologicalInput(g.input),d=new FixedStepPresentation(g,t,{maxSteps:2});
 const p=mode==='shot'?new ShotOnlyFirePulse(g,t):new SubtickFirePulse(g,t);
 const e={pointerType:kind,pointerId:kind==='touch'?22:1,button:0,buttons:1,clientX:600,clientY:200};
 t.push(.001,'pointerdown',e);
 if(kind==='touch')t.push(.002,'pointermove',{...e,clientX:640});
 t.push(.008,'pointerup',{...e,buttons:0,clientX:640});
 d.frame(1/60);
 const out={angle:g.player.angle,fireCd:g.player.fireCd,
  fuseDepth:g.player.__v17FuseDepth,fuseDist:g.player.__v17FuseDist,
  bullets:g.bullets.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.dmg,b.pen,b.ttl,b.r,
   b.ownerId,b.shell,b.beam,b.__v17FuseDist,b.__v17FuseArmed,
   b.__v171Committed,b.splash,b.knock])};
 p.detach();g.destroy();return out;
});}
test('shot-only intent preserves the actual first-shot class mechanics, including Cannon fuse depth',()=>{
 assert.equal(classes.length,36);
 for(const cls of classes)for(const kind of ['touch','mouse']){
  const actual=arm(cls,kind,'shot'),expected=arm(cls,kind,'held');
  assert.equal(JSON.stringify(actual),JSON.stringify(expected),
   `${cls} ${kind} first shot must retain class-specific aim/fuse/reload`);
 }
});
