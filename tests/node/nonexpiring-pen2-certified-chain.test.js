'use strict';
/* The live Battlefield proof may settle a pen=2 round only when its three
 * distinct stationary-hull contacts fit inside ONE non-expiring frame.
 * This test executes the exact materialized Game.updateBullets, then the
 * production Battlefield and Performance module wrappers. It does not
 * claim full FPS parity for contacts split across frames (#234/#147).
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const battlefield=read('nova-updates/battlefield-v1.6.0.js');
const performanceSource=read('nova-updates/performance-v1.7.5.js');
const marker='    updateBullets(dt) {';
const start=html.indexOf(marker);
assert.ok(start>0,'materialized core bullet update exists');
let end=start+marker.length,depth=1;
while(depth&&end<html.length){if(html[end]==='{')depth++;else if(html[end]==='}')depth--;end++;}
assert.equal(depth,0,'materialized core method is balanced');
const core=new Function('types_1','classes_1','M',
 'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
 {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
 {CLASSES:{scout:{size:15}}},2250);

function boot(optimized){
 class Game{
  constructor(){
   this.time=1;this.bullets=[];this.tmp=[];this.__novaTerrain=[];
   this.tanks=[];this.shapes=[];this.drones=[];this.cam={shake:0};
   this.sfx={};this.player={id:999,x:1000,y:1000,alive:true};
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.getTank=()=>null;
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.damageTank=function(t){t.hitCount++;};
 Game.prototype.damageShape=function(s){s.hitCount=(s.hitCount||0)+1;};
 Game.prototype.damageDrone=function(d){d.hitCount=(d.hitCount||0)+1;};
 Game.prototype.updateBullets=core;
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game}},
  'game/audio':m=>{m.exports={Sfx}},
  'game/ai':m=>{m.exports={updateAI(){}}},
  'game/render':m=>{m.exports={render(){}}}
 };
 const context={window:{__novaModules:modules},
  console:{info(){},warn(){},error(){}},Math,Map,Set,Date,
  performance:{now:()=>0}};
 vm.runInNewContext(battlefield,context,{filename:'battlefield-v1.6.0.js'});
 if(optimized)vm.runInNewContext(performanceSource,context,
  {filename:'performance-v1.7.5.js'});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec==='./classes'
  ?{CLASSES:{scout:{size:15}}}:{ARENA_HALF:2250});
 return m.exports.Game;
}

function scenario(Game,{fps=30,positions=[40,70,100],pen=2,
 wall=null,shield=false,shape=false,moving=false,competitor=false,
 reverse=false,ttl=.2,velocity=6000,frames=1}={}){
 const g=new Game();
 g.tanks=positions.map((x,i)=>({kind:'tank',id:i+2,x,y:0,
  cls:'scout',hp:100,alive:true,hitCount:0}));
 if(reverse)g.tanks.reverse();
 if(shield)g.tanks.find(t=>t.id===3).spawnShieldT=2;
 if(wall!=null)g.__novaTerrain=[{id:-1,shape:'rect',x:wall,y:0,
  w:4,h:80,solid:true,destructible:false}];
 if(shape)g.shapes=[{kind:'shape',id:90,x:55,y:0,r:8,hp:100}];
 if(moving){
  for(const t of g.tanks){
   t.__novaSweepMoveTime=g.time+1/fps;
   t.__novaSweepPrevX=t.x-1;
   t.__novaSweepPrevY=t.y;
  }
 }
 g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:velocity,vy:0,
  r:3,dmg:20,ttl,pen,hits:0,dead:false,shell:false,beam:false}];
 if(competitor)g.bullets.push({kind:'bullet',id:7,ownerId:77,
  x:0,y:0,vx:velocity,vy:0,r:3,dmg:20,ttl,pen:0,hits:0,dead:false,
  shell:false,beam:false});
 for(let i=0;i<frames;i++){
  g.time+=1/fps;
  g.updateBullets(1/fps);
 }
 return {byId:Object.fromEntries(g.tanks.map(t=>[t.id,t.hitCount])),
  bullets:g.bullets,shapes:g.shapes};
}

for(const optimized of [false,true]){
 const label=optimized?'Battlefield + Performance':'Battlefield';
 test(label+': certified three-hull live pen=2 shot resolves in one 30Hz frame',()=>{
  const Game=boot(optimized);
  const out=scenario(Game);
  assert.deepEqual(out.byId,{2:1,3:1,4:1});
  assert.ok(out.bullets.every(b=>b.dead),'complete budget consumes projectile');
 });
 test(label+': reverse enumeration does not change chronological victims',()=>{
  assert.deepEqual(scenario(boot(optimized),{reverse:true}).byId,
   {2:1,3:1,4:1});
 });
 test(label+': 60Hz full-chain opportunity also resolves all three',()=>{
  assert.deepEqual(scenario(boot(optimized),{fps:60}).byId,
   {2:1,3:1,4:1});
 });
 test(label+': no fourth hull can receive damage beyond pen=2 budget',()=>{
  const out=scenario(boot(optimized),{positions:[40,70,100,130]});
  assert.equal(out.byId[5],0);
  assert.ok(Object.values(out.byId).every(x=>x<=1));
 });
 test(label+': permanent cover before the first hull blocks the shortcut',()=>{
  assert.deepEqual(scenario(boot(optimized),{wall:10}).byId,
   {2:0,3:0,4:0});
 });
 test(label+': shielded hull blocks speculative multi-hit damage',()=>{
  const out=scenario(boot(optimized),{shield:true});
  assert.equal(out.byId[3],0);
  assert.equal(out.byId[4],0);
 });
 test(label+': moving-hull uncertainty cannot certify the chain',()=>{
  const out=scenario(boot(optimized),{moving:true});
  assert.equal(out.byId[3],0);
  assert.equal(out.byId[4],0);
 });
 test(label+': neutral shape in corridor vetoes the chain',()=>{
  const out=scenario(boot(optimized),{shape:true});
  assert.equal(out.byId[3],0);
  assert.equal(out.byId[4],0);
 });
 test(label+': another shot in corridor prevents speculative chain',()=>{
  const out=scenario(boot(optimized),{competitor:true});
  assert.equal(out.byId[3],0);
  assert.equal(out.byId[4],0);
 });
 test(label+': contacts beyond this frame cannot be invented',()=>{
  const out=scenario(boot(optimized),{positions:[40,70,300]});
  assert.equal(out.byId[4],0);
 });
 test(label+': pen=0 never receives three-hit privilege',()=>{
  const out=scenario(boot(optimized),{pen:0});
  assert.ok(Object.values(out.byId).reduce((a,b)=>a+b,0)<=1);
 });
 test(label+': split-frame contacts do not double-hit at 120/240Hz',()=>{
  for(const fps of [120,240]){
   const out=scenario(boot(optimized),{fps,frames:Math.ceil(.1*fps)});
   assert.ok(Object.values(out.byId).every(x=>x<=1),
    'duplicate victim at '+fps+'Hz');
  }
 });
}
