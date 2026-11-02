'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const CONTROLLERS=['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie'];
function run({cls='basic',kind='touch',mode='shot',hz=60,seed=1517800,cancel=false,blur=false,
 release=.008,disableFire=false,fireCd=0}={}) {
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  if(cls!=='basic')g.setClass(g.player,cls);
  if(disableFire)g.tryFire=()=>{};
  if(fireCd)g.player.fireCd=fireCd;
  const timeline=new ChronologicalInput(g.input),driver=new FixedStepPresentation(g,timeline,{maxSteps:2});
  const pulse=mode==='shot'?new ShotOnlyFirePulse(g,timeline):mode==='original'?new (require('../research/subtick-fire-pulse.cjs').SubtickFirePulse)(g,timeline):null;
  if(kind==='touch'){
   timeline.push(.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200});
   timeline.push(.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
   timeline.push(release,cancel?'pointercancel':'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
  } else {
   timeline.push(.001,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:600,clientY:200});
   timeline.push(release,cancel?'pointercancel':'pointerup',{pointerType:'mouse',pointerId:1,button:0,buttons:0,clientX:600,clientY:200});
  }
  if(blur)timeline.push(.009,'blur');
  let maxBullets=0;
  for(let frame=1;frame<=hz;frame++){
   driver.frame(frame/hz);maxBullets=Math.max(maxBullets,g.bullets.length);
  }
  const drone=g.drones.find(d=>d.ownerId===g.player.id);
  const out={hash:digest(physical(g)),draws:draws(),maxBullets,shots:pulse?.shots||0,
   drone:drone&&[drone.x,drone.y],recall:g.player.__novaSwarm?.recallUntil,
   firing:g.input.firing,aim:g.input.aim.active,ticks:driver.ticks};
  if(pulse)pulse.detach();g.destroy();return out;
 });
}
test('short intentional touch and mouse shots are recovered without retained controls',()=>{
 for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  assert.equal(run({kind,seed,mode:'baseline'}).maxBullets,0);
  const ref=run({kind,seed});assert.equal(ref.maxBullets,1);assert.equal(ref.shots,1);
  assert.equal(ref.firing,false);assert.equal(ref.aim,false);
  for(const hz of [30,120,240])assert.deepEqual(run({kind,seed,hz}),ref);
 }
});
test('Controller swarm and recall are identical to baseline when firing is disabled',()=>{
 for(const cls of CONTROLLERS)for(const seed of [1517800,1517802,1517810]){
  for(const kind of ['touch','mouse']){
   const baseline=run({cls,seed,kind,mode:'baseline',disableFire:true});
   const shot=run({cls,seed,kind,disableFire:true});
   assert.deepEqual(shot.drone,baseline.drone,`${cls} ${seed} ${kind}`);
   assert.equal(shot.recall,baseline.recall);
   assert.equal(shot.shots,1);
  }
 }
});
test('no shots after cancel, blur or blocked cooldown',()=>{
 for(const kind of ['touch','mouse'])for(const hz of [30,60,120,240]){
  for(const key of ['cancel','blur']){
   const result=run({kind,hz,[key]:true});assert.equal(result.maxBullets,0,`${kind} ${hz} ${key}`);
   assert.equal(result.shots,0);
  }
  const cooldown=run({kind,hz,fireCd:100});assert.equal(cooldown.maxBullets,0);
  assert.equal(cooldown.shots,1);assert.equal(cooldown.firing,false);
 }
});
test('long holds preserve baseline 60Hz state',()=>{
 for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  const baseline=run({kind,seed,release:.12,mode:'baseline'});
  const shot=run({kind,seed,release:.12});
  assert.equal(shot.hash,baseline.hash);assert.equal(shot.draws,baseline.draws);
  assert.equal(shot.shots,0);
 }
});
test('detach restores update, drone update and input handlers',()=>{
 const g=bootGame(),t=new ChronologicalInput(g.input);
 const old={update:g.update,updateDrones:g.updateDrones,pd:g.input.pd,pm:g.input.pm,pu:g.input.pu};
 const pulse=new ShotOnlyFirePulse(g,t);pulse.detach();
 for(const [key,value] of Object.entries(old))assert.equal(key==='update'||key==='updateDrones'?g[key]:g.input[key],value);
 g.destroy();
});
test('Game.destroy automatically releases the shot-only research owner',()=>{
 const g=bootGame(),t=new ChronologicalInput(g.input);
 const old={update:g.update,updateDrones:g.updateDrones,destroy:g.destroy,
  pd:g.input.pd,pm:g.input.pm,pu:g.input.pu};
 const pulse=new ShotOnlyFirePulse(g,t);
 t.push(.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200});
 t.push(.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
 t.push(.008,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
 t.consumeThrough(.009);assert.ok(pulse.pulse.pending);
 g.destroy();assert.equal(pulse.pulse,null);
 for(const [key,value] of Object.entries(old))assert.equal(
  key==='update'||key==='updateDrones'||key==='destroy'?g[key]:g.input[key],value);
 assert.equal(g.input.firing,false);assert.equal(g.input.aim.active,false);
});
test('shot-only aim and first projectile match held-stick firing, without extending swarm commands',()=>{
 for(const cls of ['scout','carrier','warden','valkyrie'])for(const kind of ['touch','mouse']){
  const arm=mode=>withSeed(1517800,()=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
   const t=new ChronologicalInput(g.input),d=new FixedStepPresentation(g,t,{maxSteps:2});
   const p=mode==='shot'?new ShotOnlyFirePulse(g,t):new (require('../research/subtick-fire-pulse.cjs').SubtickFirePulse)(g,t);
   if(kind==='touch'){
    t.push(.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200});
    t.push(.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
    t.push(.008,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
   } else {
    t.push(.001,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:600,clientY:200});
    t.push(.008,'pointerup',{pointerType:'mouse',pointerId:1,button:0,buttons:0,clientX:600,clientY:200});
   }
   d.frame(1/60);
   const bullet=g.bullets[0];
   const out={angle:g.player.angle,bullet:bullet&&[bullet.x,bullet.y,bullet.vx,bullet.vy,bullet.dmg],
    drone:g.drones.filter(x=>x.ownerId===g.player.id).map(x=>[x.x,x.y])};
   p.detach();g.destroy();return out;
  });
  const original=arm('original'),shot=arm('shot');
  assert.equal(shot.angle,original.angle,`${cls} ${kind} angle`);
  assert.deepEqual(shot.bullet,original.bullet,`${cls} ${kind} first shot`);
 }
});
