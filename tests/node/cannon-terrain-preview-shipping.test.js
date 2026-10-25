'use strict';
/* Production Game.tryFire/updateBullets + Battlefield + Three Disciplines +
 * Combined Arms, loaded in the materialized index.html order. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function core(name,arg){
 const marker='    '+name+'('+arg+') {',start=html.indexOf(marker);
 assert.ok(start>=0,'shipping '+name+' missing');
 let p=start+marker.length,depth=1;
 for(;depth&&p<html.length;p++){if(html[p]==='{')depth++;else if(html[p]==='}')depth--;}
 assert.equal(depth,0);return html.slice(start+marker.length,p-1);
}
const CLASSES={
 cannon:{id:'cannon',size:16,fireMode:'single',barrels:[{len:30,x:0,off:0}],
  bullet:{dmg:20,speed:400,r:8,pen:0,reload:1,ttl:1.1,splash:70,splashDmg:.4},color:'#ffb45e'},
 bomber:{id:'bomber',size:15,fireMode:'shell',barrels:[{len:30,x:0,off:0}],
  bullet:{dmg:20,speed:360,r:8,pen:0,reload:1,ttl:1.1,splash:45,splashDmg:.3},color:'#ffb45e'},
 siege:{id:'siege',size:17,fireMode:'shell',barrels:[{len:35,x:11,off:0}],
  bullet:{dmg:30,speed:380,r:9,pen:2,reload:1,ttl:1.2,splash:70,splashDmg:.4},color:'#ffb45e'}
};
const types={clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
 dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2,rnd:()=>0,TAU:Math.PI*2,ARENA_HALF:2250};
const fire=new Function('classes_1','types_1','return function(t){'+core('tryFire','t')+'}')({CLASSES},types);
const update=new Function('classes_1','types_1','M','return function(dt){'+core('updateBullets','dt')+'}')({CLASSES},types,2250);
function boot(cls='cannon',angle=0,vx=0,vy=0){
 const labels=[],bursts=[],segments=[];
 const ctx={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
 translate(){},roundRect(){},strokeRect(){},fillRect(){},
 createLinearGradient(){return{addColorStop(){}};},
 moveTo(x,y){this.__start={x,y};},lineTo(x,y){segments.push({from:this.__start,to:{x,y}});},
 stroke(){},fill(){},arc(){},fillText(label,x,y){labels.push({label,x,y});}};
 function Game(){
  this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];
  this.nextId=1;this.time=10;this.status='playing';this.w=800;this.h=600;this.dpr=1;
  this.cam={x:0,y:0,zoom:1,shake:0};this.ctx=ctx;
  this.canvas={getBoundingClientRect(){return{left:100,top:50}}};
  this.input={aim:{active:true,dx:35,dy:20},mouseActive:false,
   mouseX:100+400+160,mouseY:50+300};
  this.hash={query(_x,_y,_r,out){out.length=0;}};this.tmp=[];
  this.sfx={shoot(){},novaFuseBurst(){},explode(){}};
  this.__novaTerrain=[];this.__novaBattlefield={name:'TEST',announced:true,coverTotal:0,coverBroken:0};
 }
 Game.prototype.tryFire=fire;Game.prototype.updateBullets=update;
 Game.prototype.update=function(){};Game.prototype.updateDrones=function(){};
 Game.prototype.spawnPlayer=function(){};Game.prototype.randSpawnPos=function(){return{x:1000,y:1000};};
 Game.prototype.spawnShape=function(){};Game.prototype.spawnPowerup=function(){};
 Game.prototype.moveTank=function(t,dx,dy,dt){t.x+=dx*dt;t.y+=dy*dt;};
 Game.prototype.damageTank=function(){};Game.prototype.damageShape=function(){};
 Game.prototype.damageDrone=function(){};Game.prototype.bodyDamage=function(){return 10;};
 Game.prototype.useAbility=function(){};
 Game.prototype.bulletDamageFor=(_t,d)=>d;
 Game.prototype.bulletSpeed=t=>CLASSES[t.cls].bullet.speed;
 Game.prototype.weaponRange=t=>CLASSES[t.cls].bullet.speed*CLASSES[t.cls].bullet.ttl+40;
 Game.prototype.addParticles=function(){};Game.prototype.addRing=function(){};
 Game.prototype.addFlash=function(){};Game.prototype.addText=function(){};
 Game.prototype.splashAt=function(x,y){bursts.push({x,y,kind:'splash'});};
 Game.prototype.clusterBurst=function(b){bursts.push({x:b.x,y:b.y,kind:'cluster'});};
 Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
 Game.prototype.initBulletIntegrity=function(){};Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.weakenBullet=function(){};
 function Sfx(){}Sfx.prototype.resume=function(){};
 const modules={
 'game/classes':m=>{m.exports={CLASSES,lineageForClass:id=>CLASSES[id]?'cannon':'scout'};},
 'game/audio':m=>{m.exports={Sfx};},
 'game/engine':m=>{m.exports={Game};},
 'game/ai':m=>{m.exports={updateAI(){}};},
 'game/render':m=>{m.exports={render(){}};}
 };
 const context={window:{__novaModules:modules},console,Math,Date,Map,Set,performance:{now:()=>0}};
 for(const name of ['battlefield-v1.6.0.js','disciplines-v1.7.0.js','combined-arms-v1.7.2.js']){
  assert.ok(html.includes('nova-updates/'+name),'shipping overlay '+name+' must be materialized');
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),context,{filename:name});
 }
 const cache={};
 function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;
  modules[id](m,m.exports,spec=>{if(spec==='./classes')return load('game/classes');
   if(spec==='./types')return types;
   throw Error('unexpected require '+spec);});return m.exports;}
 load('game/classes');load('game/audio');const {Game:Patched}=load('game/engine');
 load('game/ai');const render=load('game/render').render,g=new Patched();
 const t={id:1,cls,x:0,y:0,angle,vx,vy,alive:true,isPlayer:true,
  fireCd:0,fireSpin:0,barrelIdx:0,tripleT:0,overheatT:0,gene:null,perk:null,
  stats:{reload:0,penetration:0,bulletspeed:0,damage:0}};
 g.tanks=[t];g.player=t;
 return{g,t,bursts,labels,segments,render:()=>{labels.length=0;segments.length=0;render(g,g.w,g.h);return labels;}};
}
function near(a,b,what,tol=.00001){assert.ok(Math.abs(a-b)<=tol,what+': '+a+' vs '+b);}
function wall(x=180,destructible=false,hp=300){
 return{id:-1,kind:'terrain',shape:'rect',x,y:0,w:20,h:600,solid:true,
  destructible,hp,maxHp:hp};
}
for(const [cls,angle,vx,vy] of [
 ['cannon',0,0,0],['bomber',.41,85,-45],['siege',-.38,120,40]
]){
 test(cls+' terrain preview traces the real materialized muzzle and velocity',()=>{
  const {g,t}=boot(cls,angle,vx,vy);
  g.__novaTerrain=[wall(180)];
  const p=g.novaFusePreview(t);
  g.tryFire(t);const b=g.bullets[0],mag=Math.hypot(b.vx,b.vy);
  const expected=g.firstTerrainHit(b.x,b.y,
   b.x+b.vx/mag*b.__v17FuseDist,b.y+b.vy/mag*b.__v17FuseDist,b.r*.45);
  assert.ok(expected,'test wall must intercept real projectile');
  assert.equal(p.blocked,true);
  near(p.originX,b.x,'muzzle x');near(p.originY,b.y,'muzzle y');
  near(p.x,expected.hit.x,'impact x');near(p.y,expected.hit.y,'impact y');
  near(p.programX,b.x+b.vx/mag*b.__v17FuseDist,'program x');
  near(p.programY,b.y+b.vy/mag*b.__v17FuseDist,'program y');
 });
}
for(const fps of [30,60,120,240]){
 test('wall '+fps+'Hz: IMPACT glyph matches actual terrain burst, not false FUSE',()=>{
  const {g,t,render,bursts}=boot('cannon',.17,45,-20);
  g.__novaTerrain=[wall(180)];
  const labels=render().map(x=>x.label);
  assert.ok(labels.some(x=>x.startsWith('IMPACT ')),'IMPACT marker missing: '+labels);
  assert.ok(!labels.some(x=>x.startsWith('FUSE ')),'unreachable FUSE marker leaked');
  const p=g.novaFusePreview(t);g.tryFire(t);
  for(let i=0;i<Math.ceil(fps*1.2)&&g.bullets.length;i++){g.updateBullets(1/fps);g.time+=1/fps;}
  const hit=bursts.find(x=>x.kind==='splash');
  assert.ok(hit,'physical wall impact must burst');
  near(hit.x,p.x,'impact x',.0001);near(hit.y,p.y,'impact y',.0001);
 });
}
test('unobstructed preview remains the live fuse, including mouse depth',()=>{
 const {g,t,render}=boot('cannon',.3,90,-30);
 g.input.aim.active=false;g.input.mouseActive=true;
 const first=g.novaFusePreview(t);
 assert.equal(first.blocked,false);
 const initialDistance=first.programDist; /* preview object is reused each frame */
 assert.ok(render().some(x=>x.label.startsWith('FUSE ')));
 g.input.mouseX+=170;const second=g.novaFusePreview(t);
 assert.ok(second.programDist>initialDistance+20,'mouse depth must refresh');
 g.tryFire(t);const b=g.bullets[0],mag=Math.hypot(b.vx,b.vy);
 near(second.programX,b.x+b.vx/mag*b.__v17FuseDist,'mouse shot x');
 near(second.programY,b.y+b.vy/mag*b.__v17FuseDist,'mouse shot y');
});
test('possible penetrating cover breach never promises a guaranteed IMPACT',()=>{
 const {g,t,render}=boot('siege');
 g.__novaTerrain=[wall(180,true,10)];
 const p=g.novaFusePreview(t);
 assert.equal(p.mayBreach,true);assert.equal(p.blocked,false);
 const labels=render().map(x=>x.label);
 assert.ok(labels.some(x=>x.startsWith('COVER / BREACH? ')));
 assert.ok(labels.some(x=>x.startsWith('FUSE ')));
 assert.ok(!labels.some(x=>x.startsWith('IMPACT ')));
});
test('low-penetration shells correctly predict an intact cover impact',()=>{
 const {g,t,render}=boot('bomber');
 g.__novaTerrain=[wall(180,true,500)];
 const p=g.novaFusePreview(t);
 assert.equal(p.mayBreach,false);assert.equal(p.blocked,true);
 assert.ok(render().some(x=>x.label.startsWith('IMPACT ')));
});

test('released touch aim hides both fuse and impact markers',()=>{
 const {g,render}=boot('cannon');
 g.__novaTerrain=[wall(180)];
 assert.ok(render().some(x=>x.label.startsWith('IMPACT ')),'precondition: impact visible');
 g.input.aim.active=false;g.input.mouseActive=false;
 const labels=render().map(x=>x.label);
 assert.ok(!labels.some(x=>x.startsWith('IMPACT ')||x.startsWith('FUSE ')),
   'no aiming input should leave no persistent impact/fuse marker: '+labels);
});

test('inherited lateral hull motion does not invent a hull-ray cover impact',()=>{
 const {g,t}=boot('cannon',0,0,250);
 g.__novaTerrain=[{...wall(150),w:10,h:12,y:0}];
 const oldHullRay=g.firstTerrainHit(t.x,t.y,t.x+320,t.y,4);
 assert.ok(oldHullRay,'historic hull-centered ray would report a false IMPACT');
 const p=g.novaFusePreview(t);
 g.tryFire(t);const b=g.bullets[0],mag=Math.hypot(b.vx,b.vy);
 const actual=g.firstTerrainHit(b.x,b.y,
  b.x+b.vx/mag*b.__v17FuseDist,b.y+b.vy/mag*b.__v17FuseDist,b.r*.45);
 assert.equal(actual,null,'moving projectile must clear the narrow cover');
 assert.equal(p.blocked,false,'preview must not invent the old hull-ray contact');
});
test('inherited lateral hull motion reveals cover missed by the hull ray',()=>{
 const {g,t}=boot('cannon',0,0,250);
 g.__novaTerrain=[{...wall(150),w:10,h:12,y:15}];
 assert.equal(g.firstTerrainHit(t.x,t.y,t.x+320,t.y,4),null,
  'historic hull-centered ray would miss the real blocker');
 const p=g.novaFusePreview(t);
 g.tryFire(t);const b=g.bullets[0],mag=Math.hypot(b.vx,b.vy);
 const actual=g.firstTerrainHit(b.x,b.y,
  b.x+b.vx/mag*b.__v17FuseDist,b.y+b.vy/mag*b.__v17FuseDist,b.r*.45);
 assert.ok(actual,'actual projectile should reach narrow cover');
 assert.equal(p.blocked,true);
 near(p.x,actual.hit.x,'moving narrow-cover x');
 near(p.y,actual.hit.y,'moving narrow-cover y');
});
