'use strict';
// #648: a cancelled or already-delivered RAF callback must never advance
// the current simulation, especially after an opt-in fixed60 restart.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function scene(){
 let now=1000,updates=0,renders=0,next=0;
 const callbacks=new Map(),cancelled=[];
 const input={};
 const g={raf:0,paused:false,input,sfx:{startMusic(){}},
   w:800,h:600,update(){updates++},destroy(){},setPaused(v){this.paused=v},
   start(){}};
 const timeline={input,reset(){},consumeThrough(){}};
 const bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>{const id=++next;callbacks.set(id,fn);return id},
   // Intentionally retain cancelled callbacks: hostile browser/host delivery.
   cancel:id=>{cancelled.push(id)},render:()=>{renders++}
 });
 return {owner,g,callbacks,cancelled,at(v){now=v},
   counts:()=>({updates,renders,next})};
}
test('duplicate delivery of a completed frame is inert',()=>{
 const s=scene();s.owner.start();
 const first=s.callbacks.get(1);
 first(1017);
 const before=s.counts();
 assert.equal(before.updates,1);
 assert.equal(before.next,2);
 first(1034);
 assert.deepEqual(s.counts(),before,'old ticket must not schedule or simulate');
 s.callbacks.get(2)(1034);
 assert.equal(s.counts().updates,2);
 s.owner.stop();
});
test('cancelled callback from a previous run cannot advance restarted owner',()=>{
 const s=scene();s.owner.start();
 const obsolete=s.callbacks.get(1);
 s.owner.stop();
 s.at(2000);s.owner.start();
 const before=s.counts();
 assert.doesNotThrow(()=>obsolete(1017),'obsolete timestamp must not trip current monotonic clock');
 assert.deepEqual(s.counts(),before,'prior generation must be inert');
 s.callbacks.get(2)(2017);
 assert.equal(s.counts().updates,1,'current generation remains playable');
 s.owner.stop();
 assert.deepEqual(s.cancelled,[1,3]);
});
test('stale callback after destroy does not resurrect RAF or render',()=>{
 const s=scene();s.owner.start();
 const callback=s.callbacks.get(1);
 s.g.destroy();
 const before=s.counts();
 callback(1017);
 assert.deepEqual(s.counts(),before);
 assert.equal(s.owner.started,false);
});

test('actual 49-overlay Game rejects an obsolete browser RAF after restart',()=>{
 const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
 const g=bootGame();
 g.sfx.muted=true;g.sfx.startMusic=()=>{};
 const callbacks=new Map();
 let id=0,now=1000,updates=0;
 const originalUpdate=g.update;
 g.update=function(dt){updates++;return originalUpdate.call(this,dt)};
 const timeline={input:g.input,reset(){},consumeThrough(){}};
 const bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(g,timeline,bridge,{
  now:()=>now,request:fn=>{callbacks.set(++id,fn);return id},
  cancel:()=>{},render:()=>{}
 });
 try{
  owner.start();const obsolete=callbacks.get(1);
  owner.stop();now=2000;owner.start();
  const baseline=updates;
  obsolete(2017);
  assert.equal(updates,baseline,'stale callback must not update composed world');
  assert.equal(id,2,'stale callback must not create another RAF');
  callbacks.get(2)(2017);
  assert.equal(updates,baseline+1,'current callback must update real Game');
 }finally{owner.stop();g.destroy()}
});

test('synchronous destroy during update invalidates already scheduled next RAF',()=>{
 const s=scene();
 s.g.update=function(){s.g.destroy()};
 s.owner.start();
 s.callbacks.get(1)(1017);
 assert.equal(s.owner.started,false);
 assert.equal(s.counts().next,2,'next callback was scheduled before update');
 const before=s.counts();
 assert.doesNotThrow(()=>s.callbacks.get(2)(1034));
 assert.deepEqual(s.counts(),before,'destroyed game must not render or reschedule');
});

test('duplicate RAF delivery cannot change real Tempest combat state or RNG',()=>{
 const {bootGame,withSeed,digest,physical}=
   require('../research/audio-rng-causal-pilot.cjs');
 function run(seed,duplicate){
  return withSeed(seed,draws=>{
   const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(g.player,'tempest');
   let now=1000,next=0,volleys=0;
   const callbacks=new Map();
   const originalTryFire=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length;
    const result=originalTryFire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>before)volleys++;
    return result;
   };
   const timeline={input:g.input,reset(){},consumeThrough(){}};
   const owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
    now:()=>now,request:fn=>{callbacks.set(++next,fn);return next},
    cancel:()=>{},render:()=>{}
   });
   try{
    owner.start();
    g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
    g.input.firing=true;g.input.autofire=false;
    for(let i=0;i<120;i++){
     now=1000+(i+1)*1000/60;
     const callback=callbacks.get(i+1);
     assert.equal(typeof callback,'function');
     callback(now);
     if(duplicate)callback(now);
    }
    return {ticks:owner.ticks,volleys,hash:digest(physical(g)),draws:draws(),
      scheduled:next};
   }finally{owner.stop();g.destroy()}
  });
 }
 for(const seed of [1517800,1517802]){
  const reference=run(seed,false),adversarial=run(seed,true);
  assert.equal(reference.ticks,120);
  assert.ok(reference.volleys>0,'exercise real Tempest firing');
  assert.deepEqual(adversarial,reference,
   'duplicate RAF must not affect physical state, RNG or firing chronology');
 }
});
