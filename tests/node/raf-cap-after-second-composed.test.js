'use strict';
// Actual 49-overlay Game.update driven by the shipping or candidate RAF body.
// This is a source-executed composed-game regression, not a browser pixel,
// touch-to-photon, natural-match or physical-device benchmark.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
const shipping=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function body(html){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'real materialized RAF owner');
 return html.slice(a,b).trim();
}
function trial(seed,startBody,gaps,seconds=4){
 return withSeed(seed,()=>{
  let now=0,raf=null,sim=0,updates=0,draws=0;
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
  game.input.keyboard.right=true;
  game.drawMinimap=()=>{};
  const initialTime=game.time,initialX=player.x;
  const update=game.update;
  game.update=function(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-9);
   sim+=dt;updates++;
   return update.call(this,dt);
  };
  const start=new Function('performance','requestAnimationFrame','render_1',
   'return ({'+startBody+'}).start')({now:()=>now},
    fn=>{raf=fn;return 1;},{render(){draws++;}});
  try{
   start.call(game);
   let i=0;while(now<seconds*1000-1e-7){
    now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
    const callback=raf;raf=null;
    assert.equal(typeof callback,'function');
    callback(now);
   }
   assert.ok(Math.abs(game.time-initialTime-sim)<1e-5,
    'actual Game clock must account for all executed updates');
   assert.ok(Number.isFinite(player.x)&&Number.isFinite(player.y));
   assert.ok(draws>0&&updates>0);
   return {sim,updates,draws,travel:player.x-initialX};
  }finally{game.destroy();}
 });
}
test('composed 49-overlay Game recovers moderate active time without extra updates',()=>{
 const old=body(shipping),next=body(patchRafStepCap(shipping));
 const moderate=[55,55,1000/15-55,1000/15-55];
 for(const seed of [1517800,1517802]){
  const before=trial(seed,old,moderate),after=trial(seed,next,moderate);
  assert.ok(before.sim<3.8,'reproduce current shipping world-time loss');
  assert.ok(Math.abs(after.sim-4)<1e-5,'candidate preserves four seconds of world time');
  assert.equal(after.updates,before.updates,'no extra calls in this named case');
  assert.equal(after.draws,before.draws);
  assert.ok(Number.isFinite(before.travel)&&Number.isFinite(after.travel));
 }
});
