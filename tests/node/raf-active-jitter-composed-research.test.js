'use strict';
// RESEARCH ONLY: the exact materialized RAF drives the real 49-overlay Game.
// No browser paint, real-device CPU, or human touch latency is measured here.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function body(){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'materialized RAF owner');
 return html.slice(a,b).trim();
}
const shipping=body();
assert.equal(shipping.split('elapsed <= 1 / 12').length-1,1);
assert.equal(shipping.split('carry = Math.min(1 / 30, carry);').length-1,1);
const pilot=shipping.replace('elapsed <= 1 / 12','elapsed <= 0.1')
 .replace('carry = Math.min(1 / 30, carry);',
  'carry = Math.min(elapsed <= 0.1 ? 2 / 30 : 1 / 30, carry);');
function trial(seed,rafBody,gaps,seconds=4,workMs=0){
 return withSeed(seed,()=>{
  const game=bootGame();
  if(!game.player)game.redeploy();
  const player=game.player;
  game.sfx.muted=true;game.sfx.startMusic=()=>{};
  game.tanks=[player];game.tankById=new Map([[player.id,player]]);
  game.shapes=[];game.drones=[];game.powerups=[];game.bullets=[];
  if(game.shapeById)game.shapeById.clear();
  if(game.hash&&game.hash.clear)game.hash.clear();
  game.shapeTimer=Infinity;game.powerupTimer=Infinity;
  game.eliteTimer=Infinity;game.crasherTimer=Infinity;game.aiRespawns=[];
  game.spawnShape=()=>null;game.spawnPowerup=()=>null;
  game.spawnAITank=()=>null;game.spawnDrone=()=>null;
  player.droneRespawnT=Infinity;
  game.status='playing';game.paused=false;
  game.input.autofire=false;game.input.firing=false;
  game.input.keyboard.right=true;game.drawMinimap=()=>{};
  const initialTime=game.time,initialX=player.x;
  let now=0,work=0,raf=null,sim=0,updates=0,draws=0,frameUpdates=0,maxUpdates=0;
  const update=game.update;
  game.update=function(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-9);
   sim+=dt;updates++;frameUpdates++;
   const result=update.call(this,dt);
   work+=workMs;return result;
  };
  const start=new Function('performance','requestAnimationFrame','render_1',
   'return ({'+rafBody+'}).start')({now:()=>now+work},
    fn=>{raf=fn;return 1;},{render(){draws++;maxUpdates=Math.max(maxUpdates,frameUpdates);frameUpdates=0;}});
  try{
   start.call(game);
   let i=0;
   while(now<seconds*1000-1e-7){
    now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
    const cb=raf;raf=null;assert.equal(typeof cb,'function');cb(now);
   }
   assert.ok(Math.abs(game.time-initialTime-sim)<1e-5,'actual Game clock tracks updates');
   assert.ok(Number.isFinite(player.x)&&Number.isFinite(player.y));
   assert.ok(maxUpdates<=2,'bounded per-frame simulation work');
   return {sim,updates,draws,travel:player.x-initialX};
  }finally{game.destroy();}
 });
}
test('composed Game recovers harsh active-jitter world time without unsafe extra steps',()=>{
 const gaps=[85,40,5,1000/7.5-130];
 for(const seed of [1517800,1517802]){
  const before=trial(seed,shipping,gaps),after=trial(seed,pilot,gaps);
  assert.ok(after.sim>before.sim+0.4,'recover material active time');
  assert.ok(after.sim<=4+1e-5,'no invented time');
  assert.equal(after.draws,before.draws);
  assert.equal(after.updates,before.updates,'this specific schedule does not add update calls');
  assert.ok(Number.isFinite(after.travel));
 }
});
test('composed Game pilot does not change uniform 60Hz physical time',()=>{
 for(const seed of [1517800,1517802]){
  const before=trial(seed,shipping,[1000/60],2);
  const after=trial(seed,pilot,[1000/60],2);
  assert.ok(Math.abs(before.sim-after.sim)<1e-6);
  assert.equal(before.updates,after.updates);
  assert.ok(Math.abs(before.travel-after.travel)<1e-6);
 }
});

// Reproduce the pilot's strongest known limitation through the actual Game,
// not only through a scheduler-only clock model. A green assertion here is
// evidence that the candidate is INCOMPLETE, not permission to ship it.
test('composed Game still loses active time during consecutive 99ms frames',()=>{
 const gaps=[99,99,99,.5,.5,.5,.5,.5,.5];
 for(const seed of [1517800,1517802]){
  const before=trial(seed,shipping,gaps),after=trial(seed,pilot,gaps);
  assert.ok(after.sim>before.sim+1,
   'pilot recovers substantial simulated time over shipping');
  assert.ok(after.sim<3.9,
   'bounded two-step pilot still loses time in a four-second real Game');
  assert.equal(after.draws,before.draws);
  assert.ok(Number.isFinite(after.travel));
 }
});

// The current production 1/12s catch-up gate has a sharp threshold. Reproduce
// its world-time impact in the actual 49-overlay Game, not just a RAF stub.
test('composed shipping Game reproduces the 83.33ms active-time cliff',()=>{
 for(const seed of [1517800,1517802]){
  const eligible=trial(seed,shipping,[83.333]);
  const ineligible=trial(seed,shipping,[83.334]);
  assert.ok(eligible.sim>ineligible.sim*1.8,
   'tiny RAF gap change nearly halves real Game simulation progress');
  assert.ok(eligible.updates>ineligible.updates*1.8);
  assert.ok(Number.isFinite(eligible.travel)&&Number.isFinite(ineligible.travel));
 }
});

// The shipping prior-frame CPU gate changes the amount of real world time
// advanced under identical presentation timestamps. This is synthetic work
// injection through the exact RAF owner, not an Android performance sample.
test('composed Game CPU gate can deepen active-jitter time loss',()=>{
 const gaps=[85,40,5,1000/7.5-130];
 for(const seed of [1517800,1517802]){
  const cheap=trial(seed,shipping,gaps,4,0);
  const costly=trial(seed,shipping,gaps,4,22);
  assert.equal(costly.draws,cheap.draws,
   'presentation history is identical across synthetic CPU budgets');
  assert.ok(costly.sim<cheap.sim-0.1,
   'expensive previous updates suppress catch-up and deepen lost world time');
  assert.ok(costly.updates<cheap.updates,
   'the work gate must actually suppress full-world updates');
  assert.ok(Number.isFinite(costly.travel)&&Number.isFinite(cheap.travel));
  console.log('RAF_COMPOSED_CPU_CHRONOLOGY '+JSON.stringify({seed,cheap,costly}));
 }
});
