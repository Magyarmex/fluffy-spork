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
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=-15;
   g.input.firing=true;g.input.autofire=false;
   if(clustered){
    let subticks=0;
    for(let frame=0;frame<TICKS;frame++){
     subticks+=[4,1,1][frame%3];
     now=1000+subticks*1000/120;
     const fn=callback;assert.equal(typeof fn,'function');
     callback=null;fn(now);
    }
    assert.equal(subticks,TICKS*2);
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
