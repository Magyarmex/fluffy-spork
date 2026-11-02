'use strict';
// Opt-in exact shipping 49-overlay engine, not the live scheduler.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const {ExplicitShotIntent,patchEngineHtml,patchDisciplines}=require('../research/explicit-shot-intent.cjs');
const CLASSES=Object.keys(bootGame().__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
const CONTROLLERS=['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie'];
function arm({cls='scout',kind='touch',mode='explicit',seed=1517800,hz=60,
 cancel=false,blur=false,release=.008,fireCd=0,disableFire=false,seconds=1}={}){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
  if(fireCd)g.player.fireCd=fireCd;
  if(disableFire)g.tryFire=()=>{};
  const timeline=new ChronologicalInput(g.input),driver=new FixedStepPresentation(g,timeline,{maxSteps:2});
  const p=mode==='explicit'?new ExplicitShotIntent(g,timeline):
    mode==='shot'?new ShotOnlyFirePulse(g,timeline):null;
  const e={pointerType:kind,pointerId:kind==='touch'?22:1,button:0,buttons:1,
    clientX:600,clientY:200};
  timeline.push(.001,'pointerdown',e);
  if(kind==='touch')timeline.push(.002,'pointermove',{...e,clientX:640});
  timeline.push(release,cancel?'pointercancel':'pointerup',{...e,buttons:0,clientX:640});
  if(blur)timeline.push(release+.001,'blur');
  let maxBullets=0;
  for(let frame=1;frame<=seconds*hz;frame++){
   driver.frame(frame/hz);maxBullets=Math.max(maxBullets,g.bullets.length);
  }
  const drone=g.drones.filter(d=>d.ownerId===g.player.id).map(d=>[d.id,d.x,d.y,d.hp,d.__novaPhase]);
  const result={hash:digest(physical(g)),draws:draws(),maxBullets,
   drone,recall:g.player.__novaSwarm?.recallUntil,
   firing:g.input.firing,aim:g.input.aim.active,
   intent:g.input.__novaShotIntent,attempts:p?.intents??p?.shots??0,
   firstShot:{angle:g.player.angle,fireCd:g.player.fireCd,
    fuseDepth:g.player.__v17FuseDepth,fuseDist:g.player.__v17FuseDist,
    bullets:g.bullets.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.dmg,b.pen,b.ttl,b.r,b.__v17FuseDist,b.__v17FuseArmed])}};
  if(p)p.detach();g.destroy();return result;
 });
}
test('research patch anchors fail closed on production changes',()=>{
 const root=path.resolve(__dirname,'../..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const overlay=fs.readFileSync(path.join(root,'nova-updates/disciplines-v1.7.0.js'),'utf8');
 assert.match(patchEngineHtml(html),/shotIntent && shotIntent\.fire === true/);
 assert.match(patchDisciplines(overlay),/shotIntent\.depth/);
 assert.throws(()=>patchEngineHtml(html.replace('const aim = this.input.aimVec(mv);','const aim = null;')),/anchor/);
 assert.throws(()=>patchDisciplines(overlay.replace('if(t.isPlayer){\n    var a=g.input&&g.input.aim;','if(t.isPlayer){')),/anchor/);
});
test('all 36 classes preserve first-shot mechanics, Cannon fuse and exact physical state',()=>{
 assert.equal(CLASSES.length,36);
 for(const cls of CLASSES)for(const kind of ['touch','mouse']){
  const a=arm({cls,kind,seconds:1/60}),b=arm({cls,kind,mode:'shot',seconds:1/60});
  assert.equal(JSON.stringify(a.firstShot),JSON.stringify(b.firstShot),cls+'/'+kind);
  assert.equal(a.hash,b.hash,cls+'/'+kind);assert.equal(a.draws,b.draws);
  assert.equal(a.attempts,1);assert.equal(a.intent,undefined);
  assert.equal(a.firing,false);assert.equal(a.aim,false);
 }
});
test('all seven Controller descendants preserve drones and recall when shot disabled',()=>{
 for(const cls of CONTROLLERS)for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  const a=arm({cls,kind,seed,disableFire:true}),b=arm({cls,kind,seed,mode:'baseline',disableFire:true});
  assert.equal(JSON.stringify(a.drone),JSON.stringify(b.drone),cls+'/'+kind+'/'+seed);
  assert.equal(a.recall,b.recall);
 }
});
test('30/60/120/240Hz physical and RNG outcomes remain identical',()=>{
 for(const cls of ['scout','cannon','annihilator','carrier','valkyrie'])
 for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  const base=arm({cls,kind,seed});
  for(const hz of [30,120,240]){
   const a=arm({cls,kind,seed,hz});
   assert.equal(a.hash,base.hash,cls+'/'+kind+'/'+seed+'/'+hz);
   assert.equal(a.draws,base.draws);assert.equal(a.attempts,1);
  }
 }
});
test('cancel, blur, cooldown, long holds and Game.destroy cannot leak a shot',()=>{
 for(const kind of ['touch','mouse'])for(const hz of [30,60,120,240]){
  for(const reason of ['cancel','blur']){
   const a=arm({kind,hz,[reason]:true});
   assert.equal(a.maxBullets,0);assert.equal(a.attempts,0);
  }
  const cd=arm({kind,hz,fireCd:100});
  assert.equal(cd.maxBullets,0);assert.equal(cd.attempts,1);
  const a=arm({kind,hz,release:.12}),b=arm({kind,hz,release:.12,mode:'baseline'});
  assert.equal(a.hash,b.hash);assert.equal(a.draws,b.draws);assert.equal(a.attempts,0);
 }
 const g=bootGame(),t=new ChronologicalInput(g.input);
 const old={update:g.update,destroy:g.destroy,pd:g.input.pd,pm:g.input.pm,pu:g.input.pu};
 const owner=new ExplicitShotIntent(g,t);
 t.push(.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200});
 t.push(.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
 t.push(.008,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
 t.consumeThrough(.009);assert.ok(owner.pulse.pending);
 g.destroy();assert.equal(owner.pulse,null);
 assert.equal(g.update,old.update);assert.equal(g.destroy,old.destroy);
 for(const key of ['pd','pm','pu'])assert.equal(g.input[key],old[key]);
 assert.equal(g.input.firing,false);assert.equal(g.input.__novaShotIntent,undefined);
});
