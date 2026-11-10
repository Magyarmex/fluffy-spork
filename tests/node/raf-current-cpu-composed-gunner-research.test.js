'use strict';
/* Research-only: actual 49-overlay Game.update under the current-frame RAF
 * CPU guard. A cheap RAF model is insufficient when Gunner spin/heat and
 * physical held-fire sampling depend on the number of Game.update calls.
 * This is NOT a production approval or an Android responsiveness benchmark. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const shipping=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const guarded=patchRafStepCap(shipping);
const capLine='carry = Math.min(1 / 30, carry);';
assert.equal(guarded.split(capLine).length-1,1);
const retained=guarded.replace(capLine,
 'carry = Math.min(elapsed <= 1 / 12 ? 2 / 30 : 1 / 30, carry);');
const gate='performance.now() - workStart < Math.min(32, Math.max(18, elapsed * 500 - 2))';
assert.ok(!shipping.includes(gate),'production control must remain shipping');
assert.ok(guarded.includes(gate),'research guard must be present');
function startBody(html){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'real materialized Game.start owner');
 return html.slice(a,b).trim();
}
function trial(seed,cls,html){
 return withSeed(seed,()=>{
  let now=0,cpuClock=0,raf=null,draws=0,updates=0,volleys=0,sim=0,frame=0;
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.level=Math.max(p.level,30);
  p.stats.reload=cls==='minigun'?1:3;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;g.status='playing';g.paused=false;
  g.input.autofire=false;g.input.firing=true;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.drawMinimap=()=>{};
  const initial=g.time,update=g.update,fire=g.tryFire;
  g.update=function(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-9);
   updates++;sim+=dt;
   cpuClock+=frame%10===9?30:0;
   return update.call(this,dt);
  };
  g.tryFire=function(t){
   const before=this.bullets.length,result=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  const start=new Function('performance','requestAnimationFrame','render_1',
   'return ({'+startBody(html)+'}).start')(
    {now:()=>now+cpuClock},fn=>{raf=fn;return 1;},{render(){draws++;}});
  try{
   start.call(g);
   for(frame=0;frame<200;frame++){
    now+=50;
    const cb=raf;raf=null;assert.equal(typeof cb,'function');
    cb(now);
   }
   assert.ok(Math.abs(g.time-initial-sim)<1e-5);
   assert.equal(draws,200);
   assert.ok(volleys>0);
   return {sim,updates,volleys,spin:p.fireSpin,heat:p.__v17Heat};
  }finally{g.destroy();}
 });
}
test('actual Game: CPU guard changes held-fire chronology; bounded carry is only a pilot',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802]){
   const a=trial(seed,cls,shipping),b=trial(seed,cls,guarded),
    c=trial(seed,cls,retained);
   assert.equal(a.updates,300);
   assert.equal(b.updates,280);
   assert.equal(c.updates,299);
   assert.ok(Math.abs(a.sim-10)<1e-5);
   assert.ok(Math.abs(b.sim-28/3)<1e-5);
   assert.ok(Math.abs(c.sim-(10-1/30))<1e-5);
   rows.push({cls,seed,shipping:a,guard:b,retained:c});
  }
 console.log('RAF_CURRENT_CPU_COMPOSED_GUNNER_RESEARCH '+JSON.stringify(rows));
});
