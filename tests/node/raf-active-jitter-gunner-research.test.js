'use strict';
// RESEARCH ONLY: restoring wall time need not restore Gunner cadence.
// Actual 49-overlay Game, canonical weapon rules, no targets or fake bullets.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const b=html.indexOf('    destroy() {',a);
assert.ok(a>=0&&b>a);
const shipping=html.slice(a,b).trim();
assert.equal(shipping.split('elapsed <= 1 / 12').length-1,1);
assert.equal(shipping.split('carry = Math.min(1 / 30, carry);').length-1,1);
const pilot=shipping.replace('elapsed <= 1 / 12','elapsed <= 0.1')
 .replace('carry = Math.min(1 / 30, carry);',
  'carry = Math.min(elapsed <= 0.1 ? 2 / 30 : 1 / 30, carry);');
function run(cls,reload,seed,body,gaps,seconds=4){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=reload;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.firing=true;g.input.mouseActive=false;
  g.drawMinimap=()=>{};
  let now=0,raf=null,sim=0,updates=0,volleys=0;
  const fire=g.tryFire,update=g.update;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>n)volleys++;return r;};
  g.update=function(dt){sim+=dt;updates++;return update.call(this,dt);};
  const start=new Function('performance','requestAnimationFrame','render_1',
   'return ({'+body+'}).start')({now:()=>now},
   fn=>{raf=fn;return 1;},{render(){}});
  try{
   start.call(g);let i=0;
   while(now<seconds*1000-1e-7){
    now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
    const cb=raf;raf=null;assert.equal(typeof cb,'function');cb(now);
   }
   return {sim,updates,volleys,spin:+(p.fireSpin||0).toFixed(6),
    heat:+(p.__v17Heat||0).toFixed(6)};
  }finally{g.destroy();}
 });
}
test('active-time recovery does not pretend to solve rotary weapon cadence',()=>{
 const harsh=[85,40,5,1000/7.5-130];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  const old=run(cls,reload,1517800,shipping,harsh);
  const candidate=run(cls,reload,1517800,pilot,harsh);
  const baseline=run(cls,reload,1517800,shipping,[1000/60]);
  assert.ok(candidate.sim>old.sim+0.4,'pilot must actually recover active time');
  assert.ok(Math.abs(candidate.sim-baseline.sim)<1e-5,'compare equal simulated time');
  assert.ok(candidate.volleys>0&&baseline.volleys>0);
  assert.ok(candidate.updates<=2*120,'bounded work under 120 presentations');
  console.log('RAF_ACTIVE_GUNNER_RESEARCH '+JSON.stringify({cls,reload,old,candidate,baseline}));
 }
});
