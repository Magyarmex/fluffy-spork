'use strict';
// #641 Research-only: rapid retargeting while a short press is pending.
// Exercises the real 49-overlay Game/Input. No production patch.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
const {ExplicitShotIntent}=require('../research/explicit-shot-intent.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function observe(mode,{secondRelease=false,secondSide='aim',secondCancel=false}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.status='playing';g.paused=false;
  const t=new ChronologicalInput(g.input);
  const owner=mode==='subtick'?new SubtickFirePulse(g,t):
    mode==='explicit'?new ExplicitShotIntent(g,t):
    mode==='direct'?new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document}):null;
  const e=(id,x,y,buttons)=>({pointerType:'touch',pointerId:id,button:0,buttons,
    clientX:x,clientY:y,target:{tagName:'CANVAS',closest:()=>null}});
  t.push(.140,'pointerdown',e(11,600,200,1));
  t.push(.141,'pointermove',e(11,640,200,1));
  t.push(.152,'pointerup',e(11,640,200,0));
  const secondX=secondSide==='move'?100:600;
  const secondMoveX=secondSide==='move'?140:600;
  const secondMoveY=secondSide==='move'?200:240;
  t.push(.160,'pointerdown',e(12,secondX,200,1));
  t.push(.161,'pointermove',e(12,secondMoveX,secondMoveY,1));
  if(secondRelease)t.push(.168,secondCancel?'pointercancel':'pointerup',e(12,secondMoveX,secondMoveY,0));
  let shots=0,shotDirections=[];
  const fire=g.tryFire;
  g.tryFire=function(tank){const before=this.bullets.length;
   const result=fire.apply(this,arguments);
   if(tank===g.player&&this.bullets.length>before){
    shots++;shotDirections.push(...this.bullets.slice(before).map(b=>[b.vx,b.vy]));}
   return result;};
  try{
   t.consumeThrough(secondRelease?.175:.165);
   const pending=owner?.pulse?.pending??owner?.pending??null;
   const beforeUpdate={aimOwner:g.input.stickId?.aim??null,moveOwner:g.input.stickId?.move??null,
    aimActive:!!g.input.aim.active,
    aimDx:g.input.aim.dx,aimDy:g.input.aim.dy,
    pendingPointer:pending?.id??null,physicalFiring:!!g.input.firing};
   g.player.fireCd=0;
   g.update(1/60);
   return {...beforeUpdate,shots,shotDirections,playerAngle:+g.player.angle.toFixed(6),afterUpdateOwner:g.input.stickId?.aim??null,
    afterUpdateFiring:!!g.input.firing,postIntent:g.input.__novaShotIntent};
  }finally{if(owner)owner.detach();g.destroy();}
 });
}
test('rapid second touch is accepted by baseline Input; pending-shot research reports ownership conflict',()=>{
 const baseline=observe('baseline');
 assert.equal(baseline.aimOwner,12,'real Game must accept the new right-stick touch after release');
 assert.equal(baseline.aimActive,true);
 const subtick=observe('subtick'),explicit=observe('explicit'),direct=observe('direct');
 assert.equal(direct.aimOwner,12,'direct intent must release the first touch before the second press');
 assert.equal(direct.aimActive,true);
 assert.equal(direct.shots,baseline.shots,'direct intent must not suppress the new touch shot');
 assert.equal(direct.playerAngle,baseline.playerAngle,'direct intent must preserve the new aim bearing');
 assert.equal(direct.afterUpdateOwner,12);
 assert.equal(direct.postIntent,undefined);
 // Do not freeze today's failure as an acceptance criterion: a future
 // correction should be allowed to preserve pointer #12.
 for(const row of [subtick,explicit]){
  assert.ok(row.aimOwner===11||row.aimOwner===12||row.aimOwner===null,
   'research owner must not invent a pointer identity');
 }
 console.log('RAPID_RETARGET_OWNERSHIP '+JSON.stringify({baseline,subtick,explicit,direct,
  caveat:'constructed 8ms inter-gesture interval; real Game/Input, not physical Android'}));
});

test('two short consecutive presses preserve the newest aimed shot without a stale first-owner replay',()=>{
 const baseline=observe('baseline',{secondRelease:true});
 const direct=observe('direct',{secondRelease:true});
 const subtick=observe('subtick',{secondRelease:true});
 const explicit=observe('explicit',{secondRelease:true});
 assert.equal(baseline.shots,0,'two sub-tick presses are missed by unmodified Input sampling');
 assert.equal(direct.shots,1,'direct intent should preserve exactly the latest deliberate short press');
 assert.equal(direct.pendingPointer,null,'direct intent stores no physical pending owner');
 assert.equal(direct.aimOwner,-1,'both real touch pointers must be released before Game.update');
 assert.equal(direct.afterUpdateOwner,-1);
 assert.equal(direct.postIntent,undefined);
 assert.ok(direct.shotDirections.length>0,'latest intent must produce an actual projectile');
 assert.ok(direct.shotDirections.every(([vx,vy])=>vy>0&&Math.abs(vy)>Math.abs(vx)),
  'latest southward aim must win over stale eastward first press');
 // Research controls remain observational: a future fix may make both
 // deferred-release owners preserve the latest shot too.
 console.log('RAPID_RETARGET_SECOND_SHOT '+JSON.stringify({baseline,direct,subtick,explicit,
  caveat:'constructed short touches; no natural-play frequency or physical Android claim'}));
});

test('unrelated movement-stick touch does not cancel an earlier legitimate short aimed shot',()=>{
 const baseline=observe('baseline',{secondSide:'move'});
 const direct=observe('direct',{secondSide:'move'});
 assert.equal(baseline.shots,0,'unmodified input loses the short aim press');
 assert.equal(direct.moveOwner,12,'new left-stick movement must remain owned by pointer #12');
 assert.equal(direct.aimOwner,-1,'first right-stick touch is physically released');
 assert.equal(direct.shots,1,'unrelated movement touch must not cancel pending shot intent');
 assert.ok(direct.shotDirections.length>0);
 assert.ok(direct.shotDirections.every(([vx,vy])=>vx>0&&Math.abs(vx)>Math.abs(vy)),
  'first eastward aim should be preserved when only the movement stick changes');
 assert.equal(direct.postIntent,undefined);
 console.log('RAPID_RETARGET_MOVEMENT_INDEPENDENCE '+JSON.stringify({baseline,direct}));
});

test('canceled replacement touch never resurrects the earlier pending shot',()=>{
 const direct=observe('direct',{secondRelease:true,secondCancel:true});
 assert.equal(direct.shots,0,'cancellation of replacement touch must reject both old and new intent');
 assert.equal(direct.aimOwner,-1);
 assert.equal(direct.afterUpdateOwner,-1);
 assert.equal(direct.postIntent,undefined);
 console.log('RAPID_RETARGET_CANCEL '+JSON.stringify(direct));
});
