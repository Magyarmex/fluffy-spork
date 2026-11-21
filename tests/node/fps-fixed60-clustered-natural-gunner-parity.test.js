'use strict';
// #799/#648: source-executed natural-world chronology, not a phone benchmark.
// Keep all 49 composed overlays, AI, shapes, terrain, drones and ecology.
// Clustered 33.33/8.33/8.33ms presentation has mean 60Hz; variable-step
// simulation does not preserve rotary firing. The opt-in fixed60 owner should.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
 require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=120;
function run(cls,seed,clustered){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=cls==='minigun'?1:3;
  p.spawnShieldT=20;
  let now=1000,callback=null,owner=null,volleys=0;
  const fire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,out=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return out;
  };
  try{
   if(clustered){
    const timeline=new ChronologicalInput(g.input);
    owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:clustered===true?2:4
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=-15;
   g.input.firing=true;g.input.autofire=false;
   if(clustered){
    if(clustered===true){
     let subticks=0;
     for(let frame=0;frame<TICKS;frame++){
      subticks+=[4,1,1][frame%3];
      now=1000+subticks*1000/120;
      const fn=callback;assert.equal(typeof fn,'function');
      callback=null;fn(now);
     }
     assert.equal(subticks,TICKS*2);
    }else{
     assert.ok(['uniform20','bursty20'].includes(clustered));
     const gaps=clustered==='uniform20'?Array(40).fill(50):
      Array.from({length:20},()=>[95,5]).flat();
     let elapsed=0;
     for(const gap of gaps){
      elapsed+=gap;now=1000+elapsed;
      const fn=callback;assert.equal(typeof fn,'function');
      callback=null;fn(now);
     }
     assert.equal(elapsed,2000,'same two seconds of wall time');
    }
    assert.equal(owner.ticks,TICKS);
    assert.equal(owner.droppedMs,0);
    assert.equal(owner.droppedFrames,0);
   }else for(let tick=0;tick<TICKS;tick++)g.update(1/60);
   assert.ok(g.tanks.length>1,'real AI opponents must remain in the arena');
   assert.ok(g.shapes.length>0,'neutral ecology must remain active');
   assert.ok(volleys>0,'player must actually fire');
   return {world:digest(physical(g)),draws:draws(),volleys,
    spin:p.fireSpin||0,heat:p.__v17Heat||0,
    projectileSignature:digest(g.bullets.map(b=>
     [b.id,b.ownerId,b.dmg,b.ttl,b.x,b.y,b.vx,b.vy])),
    playerHp:p.hp,playerScore:p.score,
    droneCount:g.drones.length,enemyCount:g.tanks.length-1,
    neutralCount:g.shapes.length};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('natural 49-overlay Gunner worlds retain physics and RNG under clustered mean-60Hz fixed60',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802]){
   const reference=run(cls,seed,false);
   const clustered=run(cls,seed,true);
   assert.deepEqual(clustered,reference,cls+' seed='+seed);
  }
});


// The same real 49-overlay natural ecology and hostile AI should advance
// identically at 20Hz presentation when the bounded whole-Game owner can
// afford the necessary three/four canonical updates. Not a phone CPU gate.
test('natural Gunner worlds preserve complete AI/ecology RNG at uniform and bursty 20Hz',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802]){
   const reference=run(cls,seed,false);
   for(const mode of ['uniform20','bursty20'])
    assert.deepEqual(run(cls,seed,mode),reference,
     cls+' seed='+seed+' mode='+mode);
  }
});
