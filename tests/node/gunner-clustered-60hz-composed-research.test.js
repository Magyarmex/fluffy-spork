'use strict';
/* #799 / #648: identical eight-second input and update-count exposure,
 * but different frame partitioning. [4,1,1] at 120Hz means
 * 33.33/8.33/8.33ms: exactly 60 updates/s on average. This is a
 * constructed stress schedule, not a measured Android frame trace. */
const test=require('node:test'),assert=require('node:assert/strict');
const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
function activeAt(tick,mode){
 if(mode==='held')return true;
 const on=mode==='long'?120:48,off=mode==='long'?30:48;
 return tick%(on+off)<on;
}
function run(seed,cls,reload,mode,pattern){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;
  let volleys=0,activeTicks=0,steps=0,tick=0;
  const first=[],fire=g.tryFire,start=g.time;
  g.tryFire=function(t){
   const before=this.bullets.length,out=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    volleys++;if(first.length<6)first.push(+this.time.toFixed(7));
   }
   return out;
  };
  try{
   while(tick<960){
    const n=Math.min(pattern[steps%pattern.length],960-tick);
    // Both schedule families align exactly with every policy boundary:
    // no speculative browser event splitting or mismatched active time.
    const a=activeAt(tick,mode),b=activeAt(tick+n-1,mode);
    assert.equal(a,b,'a presentation interval may not cross an input edge');
    g.input.firing=a;activeTicks+=a?n:0;
    g.update(n/120);tick+=n;steps++;
   }
   assert.equal(tick,960);assert.equal(steps,480);
   assert.ok(Math.abs(g.time-start-8)<1e-7);
   assert.equal(g.tanks.length,1);
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   return {cls,reload,mode,schedule:pattern.join(','),steps,volleys,
    activeSeconds:activeTicks/120,first,
    spin:+(p.fireSpin||0).toFixed(5),
    heat:+(p.__v17Heat||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('composed Gunner identical mean FPS and input exposure need not mean identical firing',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const mode of ['held','long','short']){
   const uniform=run(1517800,cls,reload,mode,[2]);
   const clustered=run(1517800,cls,reload,mode,[4,1,1]);
   assert.equal(uniform.activeSeconds,clustered.activeSeconds);
   assert.equal(uniform.steps,clustered.steps);
   for(const row of [uniform,clustered]){
    assert.ok(row.volleys>0);
    assert.ok(Number.isFinite(row.spin)&&Number.isFinite(row.heat));
    rows.push(row);
   }
  }
 assert.equal(rows.length,12);
 console.log('GUNNER_CLUSTERED_60HZ_RESEARCH '+JSON.stringify(rows));
});
