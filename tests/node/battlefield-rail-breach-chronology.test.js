'use strict';
/* Rail breach chronology regression against the materialized NOVA engine,
 * Sniper projectile owner, Battlefield and both shipping Performance overlays.
 * A fast legal Singularity build can cross a damaged barricade, a permanent
 * pillar and a rear Scout in one 30Hz frame. Cover destruction must not turn
 * that solid pillar into transparent terrain.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
function coreMethod(name,args,deps,values){
 const marker='    '+name+'('+args+') {';
 const p=html.indexOf(marker);
 assert.ok(p>=0,'shipping method '+name);
 let i=p+marker.length,d=1;
 while(d&&i<html.length){
  if(html[i]==='{')d++;
  else if(html[i]==='}')d--;
  i++;
 }
 assert.equal(d,0);
 return new Function(...deps,'return function('+args+'){' +
  html.slice(p+marker.length,i-1)+'}')(...values);
}
const types={dist2:(a,b,c,d)=>(a-c)**2+(b-d)**2,
 clamp:(x,a,b)=>Math.max(a,Math.min(b,x))};
const CLASSES={scout:{size:14},
 singularity:{size:14,fireMode:'beam',bullet:{speed:3100,pen:18}}};
const core=coreMethod('updateBullets','dt',
 ['types_1','classes_1','M'],[types,{CLASSES},2250]);
const init=coreMethod('initBulletIntegrity','b',[],[]);
const weaken=coreMethod('weakenBullet','b, absorbed',['types_1'],[types]);
function boot(optimized=true){
 class Game{
  constructor(){
   this.time=1;this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];
   this.__novaTerrain=[];this.tmp=[];this.cam={shake:0};this.sfx={};
   this.player={id:999,x:1000,y:1000,alive:true};
   this.hash={query:(_x,_y,_r,out)=>{
    out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);
   }};
   this.hits=[];this.__novaShapeSweepActive=true;
   this.__novaShapeSweepEpoch=1;this.__novaFrameStartBulletEpoch=1;
   this.__novaFrameStartBulletIdCeiling=3;
   this.__novaBattlefield={coverBroken:0};
  }
 }
 for(const n of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt','addRing',
  'addFlash','addImpactDebris','damageShape','damageDrone','clusterBurst',
  'setClass','useAbility','setPaused'])Game.prototype[n]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.getTank=id=>id===1?{id:1,cls:'singularity',alive:true}:null;
 Game.prototype.gainXP=function(){};
 Game.prototype.areAllies=()=>false;
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.damageTank=function(t,dmg){this.hits.push({id:t.id,dmg});t.hp-=dmg;};
 Game.prototype.updateBullets=core;
 Game.prototype.initBulletIntegrity=init;
 Game.prototype.weakenBullet=weaken;
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game}},
  'game/audio':m=>{m.exports={Sfx}},
  'game/ai':m=>{m.exports={updateAI(){}}},
  'game/render':m=>{m.exports={render(){}}}
 };
 const ctx={window:{__novaModules:modules},
  console:{info(){},warn(){},error(){}},Math,Map,Set,Date,Number,Object,
  performance:{now:()=>0},document:{},navigator:{}};
 const files=['sniper-v1.2.0.js','battlefield-v1.6.0.js'];
 if(optimized)files.push('performance-v1.7.5.js','performance-v1.7.8.js');
 for(const f of files)vm.runInNewContext(read('nova-updates/'+f),ctx,{filename:f});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec.includes('classes')
  ?{CLASSES,lineageForClass:()=>null}:{ARENA_HALF:2250});
 return m.exports.Game;
}
function run(Game,{beam=true,rail=true,cover=true,pillar=true,
 targetX=235,dt=.033,speed=18414,coverHp=5,extraShot=false,
 secondCoverHp=null,railHp=20,railMaxHp=20,railPen=19}={}){
 const g=new Game();
 const t={kind:'tank',id:2,cls:'scout',x:targetX,y:-520,
  hp:100,alive:true,__novaSweepMoveTime:1,
  __novaSweepPrevX:targetX,__novaSweepPrevY:-520};
 g.tanks=[t];
 /* v1.7.8 swaps in a real spatial grid. Without insertion the test gives
  * a false negative because the rear tank becomes invisible to collisions. */
 if(typeof g.hash.insert==='function')g.hash.insert(t);
 if(cover)g.__novaTerrain.push({id:-1,shape:'rect',x:-260,y:-500,
  w:190,h:65,solid:true,destructible:true,hp:coverHp,maxHp:300});
 if(secondCoverHp!==null)g.__novaTerrain.push({id:-3,shape:'rect',
  x:-125,y:-520,w:10,h:50,solid:true,destructible:true,
  hp:secondCoverHp,maxHp:secondCoverHp});
 if(pillar)g.__novaTerrain.push({id:-2,shape:'circle',x:0,y:-520,
  r:105,solid:true,destructible:false,hp:0,maxHp:0});
 const b={kind:'bullet',id:1,ownerId:1,x:-370,y:-520,
  vx:speed,vy:0,r:8.84,dmg:95.2,baseDmg:95.2,
  maxHp:railMaxHp,hp:railHp,pen:railPen,ttl:.68,hits:0,dead:false,shell:false,beam,
  __novaRail:rail,__novaFullRail:rail};
 g.bullets=[b];
 if(extraShot)g.bullets.push({kind:'bullet',id:2,ownerId:3,
  x:1100,y:1100,vx:0,vy:0,r:3,dmg:4,pen:0,ttl:1,
  hp:4,maxHp:4,dead:false,shell:false,beam:false});
 g.updateBullets(dt);
 return {hits:g.hits,hp:t.hp,cover:g.__novaTerrain.find(x=>x.id===-1),
  pillar:g.__novaTerrain.find(x=>x.id===-2),
  secondCover:g.__novaTerrain.find(x=>x.id===-3),bullet:b,remaining:g.bullets.map(x=>x.id),coverBroken:g.__novaBattlefield.coverBroken};
}
for(const optimized of [false,true]){
 const Game=boot(optimized);
 const mode=optimized?'shipping Sniper/Battlefield/Performance 1.7.5+1.7.8':
  'shipping Sniper/Battlefield';
 test(mode+': breached cover cannot expose rear Scout through permanent pillar',()=>{
  const r=run(Game);
  assert.equal(r.cover.hp,0,'first cover genuinely destroyed');
  assert.equal(r.pillar.solid,true);
  assert.equal(r.hp,100,'pillar must protect rear Scout after first breach');
  assert.deepEqual(r.hits,[]);
  assert.equal(r.bullet.dead,true,'pillar consumes the penetrating rail');
 });
 test(mode+': intact first cover and standalone pillar still stop rail',()=>{
  const intact=run(Game,{coverHp:1000});
  assert.equal(intact.hp,100);
  assert.ok(intact.cover.hp>0);
  const pillarOnly=run(Game,{cover:false});
  assert.equal(pillarOnly.hp,100);
  assert.equal(pillarOnly.bullet.dead,true);
 });
 test(mode+': no pillar preserves legitimate post-breach hit',()=>{
  const r=run(Game,{pillar:false});
  assert.equal(r.cover.hp,0);
  assert.ok(Math.abs(r.hp-40.976)<1e-8);
  assert.deepEqual(r.hits.map(h=>h.id),[2]);
 });
 test(mode+': earlier Scout is not erased by later pillar',()=>{
  const r=run(Game,{targetX:-120});
  assert.equal(r.cover.hp,0);
  assert.ok(Math.abs(r.hp-40.976)<1e-8);
  assert.deepEqual(r.hits.map(h=>h.id),[2]);
 });
 test(mode+': ordinary flagged rail retains existing pillar protection',()=>{
  const r=run(Game,{beam:false});
  assert.equal(r.hp,100);
  assert.equal(r.cover.hp,0);
 });
 test(mode+': a second intact barricade takes one rail hit and protects rear hull',()=>{
  const r=run(Game,{pillar:false,secondCoverHp:1000});
  assert.equal(r.cover.hp,0);
  assert.equal(r.hp,100);
  assert.equal(r.bullet.dead,true);
  assert.ok(Math.abs(r.secondCover.hp-(1000-59.024*.92))<1e-8,
   'beam cover multiplier applies exactly once to second barricade');
 });
 test(mode+': a weakened rail that expires on first cover never reaches rear hull',()=>{
  const r=run(Game,{railHp:1});
  assert.equal(r.cover.hp,0);
  assert.equal(r.hp,100);
  assert.equal(r.bullet.dead,true);
 });
 for(const fps of [30,60,120,240]){
  test(mode+': synthetic equal-chord rail wall proof at '+fps+'Hz',()=>{
   const dt=1/fps,speed=607.662*fps;
   const r=run(Game,{dt,speed});
   assert.equal(r.cover.hp,0);
   assert.equal(r.hp,100);
   assert.equal(r.bullet.dead,true);
  });
 }
 test(mode+': remote competing projectile does not hide pillar',()=>{
  const r=run(Game,{extraShot:true});
  assert.equal(r.hp,100);
  assert.equal(r.cover.hp,0);
 });
}

/* #147: two genuinely breached covers in the same physical frame must not
 * make the permanent pillar behind them transparent. This is a separate
 * chronology gate from the already-shipped first-breach/second-solid case.
 * The second cover must take its own structural damage, not merely block
 * the hull by deleting the shot before its physical impact. */
for(const optimized of [false,true]){
 const Game=boot(optimized);
 for(const beam of [false,true])for(const fps of [30,60,120,240]){
  test((optimized?'optimized':'baseline')+' '+(beam?'rail':'ordinary')+
   ': two breached covers then pillar at '+fps+'Hz',()=>{
   const dt=1/fps;
   const r=run(Game,{beam,rail:beam,secondCoverHp:5,dt,speed:607.662*fps});
   assert.equal(r.cover.hp,0,'first cover breached');
   assert.equal(r.secondCover.hp,0,'second cover must also breach');
   assert.equal(r.coverBroken,2,'each cover break is credited exactly once');
   assert.equal(r.hp,100,'permanent pillar must protect rear Scout');
   assert.deepEqual(r.hits,[]);
   assert.equal(r.bullet.dead,true,'pillar must consume the shot');
  });
 }
}

/* Rail cover damage is 0.92x, not the ordinary 1.0x. A second barricade
 * whose HP lies between these two thresholds must survive a beam hit and
 * still stop the shot; ordinary rounds should breach it and reach the wall. */
for(const optimized of [false,true]){
 const Game=boot(optimized);
 test((optimized?'optimized':'baseline')+
  ': rail second cover at HP55 survives exact beam damage',()=>{
  const r=run(Game,{beam:true,rail:true,secondCoverHp:55});
  assert.equal(r.hp,100);
  assert.equal(r.bullet.dead,true);
  assert.equal(r.coverBroken,1,'second cover is damaged, not breached');
  assert.ok(Math.abs(r.secondCover.hp-(55-59.024*.92))<1e-8);
 });
 test((optimized?'optimized':'baseline')+
  ': ordinary second cover at HP55 breaches before permanent wall',()=>{
  const r=run(Game,{beam:false,rail:false,secondCoverHp:55});
  assert.equal(r.hp,100);
  assert.equal(r.bullet.dead,true);
  assert.equal(r.coverBroken,2);
  assert.equal(r.secondCover.hp,0);
 });
}
