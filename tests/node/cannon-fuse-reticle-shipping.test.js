'use strict';
/* Actual materialized Game.tryFire/updateBullets plus Three Disciplines render. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function core(name,arg){
 const marker='    '+name+'('+arg+') {',start=html.indexOf(marker);
 assert.ok(start>=0,'shipping '+name+' missing');
 let p=start+marker.length,depth=1;
 for(;depth&&p<html.length;p++){if(html[p]==='{')depth++;else if(html[p]==='}')depth--;}
 assert.equal(depth,0);return html.slice(start+marker.length,p-1);
}
const CLASSES={
 cannon:{id:'cannon',fireMode:'single',barrels:[{len:30,x:0,off:0}],
 bullet:{dmg:20,speed:400,r:8,pen:0,reload:1,ttl:1.1,splash:70,splashDmg:.4},color:'#ffb45e',size:16},
 bomber:{id:'bomber',fireMode:'shell',barrels:[{len:30,x:0,off:0}],
 bullet:{dmg:20,speed:360,r:8,pen:0,reload:1.15,ttl:1.1,splash:45,splashDmg:.3},color:'#ffb45e',size:15}
};
const types={clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2,rnd:()=>0,TAU:Math.PI*2};
const fire=new Function('classes_1','types_1','return function(t){'+core('tryFire','t')+'}')({CLASSES},types);
const update=new Function('classes_1','types_1','M','return function(dt){'+core('updateBullets','dt')+'}')({CLASSES},types,2250);
function boot(cls='cannon',mode='stick',angle=0,vx=0,vy=0){
 const arcs=[],bursts=[];
 const ctx={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
 moveTo(){},lineTo(){},stroke(){},fill(){},arc(x,y,r){arcs.push({x,y,r});},fillText(){}};
 function Game(){
 this.bullets=[];this.tanks=[];this.nextId=1;this.time=10;
 this.w=800;this.h=600;this.dpr=1;this.cam={x:0,y:0,zoom:1,shake:0};
 this.ctx=ctx;this.canvas={getBoundingClientRect(){return{left:100,top:50}}};
 this.input={aim:{active:mode==='stick',dx:35,dy:20},mouseActive:mode==='mouse',
 mouseX:100+400+160,mouseY:50+300};
 this.hash={query(_x,_y,_r,out){out.length=0;}};this.tmp=[];
 this.sfx={shoot(){},novaFuseBurst(){}};
 }
 Game.prototype.tryFire=fire;Game.prototype.updateBullets=update;
 Game.prototype.update=function(){};Game.prototype.damageTank=function(){};
 Game.prototype.bodyDamage=function(){return 10;};Game.prototype.useAbility=function(){};
 Game.prototype.bulletDamageFor=(_t,d)=>d;
 Game.prototype.bulletSpeed=t=>CLASSES[t.cls].bullet.speed;
 Game.prototype.weaponRange=t=>CLASSES[t.cls].bullet.speed*CLASSES[t.cls].bullet.ttl+40;
 Game.prototype.addParticles=function(){};Game.prototype.addRing=function(){};
 Game.prototype.addText=function(){};Game.prototype.splashAt=function(x,y){bursts.push({x,y,kind:'splash'});};
 Game.prototype.clusterBurst=function(b){bursts.push({x:b.x,y:b.y,kind:'cluster'});};
 Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
 Game.prototype.initBulletIntegrity=function(){};Game.prototype.resolveBulletCollisions=function(){};
 function Sfx(){}Sfx.prototype.resume=function(){};
 const modules={
 'game/classes':m=>{m.exports={CLASSES,lineageForClass:id=>'cannon'};},
 'game/audio':m=>{m.exports={Sfx};},'game/engine':m=>{m.exports={Game};},
 'game/render':m=>{m.exports={render(){}};}
 };
 const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/disciplines-v1.7.0.js'),'utf8'),context);
 const cache={};
 function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;
 modules[id](m,m.exports,spec=>{if(spec==='./classes')return load('game/classes');
 throw Error('unexpected require '+spec);});return m.exports;}
 load('game/classes');load('game/audio');const {Game:Patched}=load('game/engine');
 const render=load('game/render').render,g=new Patched();
 const t={id:1,cls,x:25,y:-20,angle,vx,vy,alive:true,isPlayer:true,fireCd:0,
 fireSpin:0,barrelIdx:0,tripleT:0,overheatT:0,gene:null,perk:null,
 stats:{reload:0,penetration:0,bulletspeed:0,damage:0}};
 g.tanks=[t];g.player=t;
 return{g,t,bursts,render:()=>{arcs.length=0;render(g,g.w,g.h);
 assert.equal(arcs.length,1,'one Cannon fuse circle');return arcs[0];}};
}
function near(a,b,label,tol=1e-7){assert.ok(Math.abs(a-b)<=tol,label+': '+a+' vs '+b);}
function predicted(b){const sp=Math.hypot(b.vx,b.vy);
 return{x:b.x+b.vx/sp*b.__v17FuseDist,y:b.y+b.vy/sp*b.__v17FuseDist};}
for(const cls of ['cannon','bomber'])for(const [label,angle,vx,vy] of [
 ['straight',0,0,0],['oblique',.73,0,0],['moving hull',-.47,115,-80]]){
 test(cls+' '+label+': reticle predicts materialized Game.tryFire',()=>{
 const {g,t,render}=boot(cls,'stick',angle,vx,vy);
 const p=render();g.tryFire(t);assert.equal(g.bullets.length,1);
 const q=predicted(g.bullets[0]);near(p.x,q.x,'x');near(p.y,q.y,'y');});
}
for(const fps of [30,60,120,240]){
 test('bomber '+fps+'Hz: actual materialized fuse burst matches preview',()=>{
 const {g,t,render,bursts}=boot('bomber','stick',.61,45,-20);
 const p=render();g.tryFire(t);
 for(let i=0;i<Math.ceil(1.2*fps)&&g.bullets.length;i++){g.updateBullets(1/fps);g.time+=1/fps;}
 const hit=bursts.find(x=>x.kind==='cluster');
 assert.ok(hit,'programmed fuse must trigger before TTL');
 near(hit.x,p.x,'burst x',2.01);near(hit.y,p.y,'burst y',2.01);});
}
test('mouse preview before first shot predicts next materialized shot',()=>{
 const {g,t,render}=boot('cannon','mouse',.3),p=render();
 g.tryFire(t);const q=predicted(g.bullets[0]);near(p.x,q.x,'x');near(p.y,q.y,'y');});
test('mouse cursor movement updates preview without a new shot',()=>{
 const {g,t,render}=boot('cannon','mouse',0);
 g.tryFire(t);const old=t.__v17FuseDist;
 g.input.mouseX=100+400+330;t.fireCd=0;const p=render();g.bullets=[];g.tryFire(t);
 assert.ok(t.__v17FuseDist>old+30);
 const q=predicted(g.bullets[0]);near(p.x,q.x,'x');near(p.y,q.y,'y');});
test('held stick depth changes preview before next shot',()=>{
 const {g,t,render}=boot('cannon','stick',0),p1=render();
 g.input.aim.dx=59;g.input.aim.dy=0;const p2=render();
 assert.ok(p2.x>p1.x+40);g.tryFire(t);
 const q=predicted(g.bullets[0]);near(p2.x,q.x,'x');near(p2.y,q.y,'y');});


/* At full stick deflection the historic range formula could program a fuse
 * beyond the projectile's remaining TTL. Cannon then vanished without an
 * airburst; Bomber burst only at TTL expiry, not at the displayed reticle. */
for(const cls of ['cannon','bomber'])for(const fps of [30,60,120,240]){
 test(cls+' full stick '+fps+'Hz: programmed fuse must be reachable before TTL',()=>{
 const {g,t,render,bursts}=boot(cls,'stick',.32);
 g.input.aim.dx=65;g.input.aim.dy=0;
 const preview=render();g.tryFire(t);
 const b=g.bullets[0],maxTravel=Math.hypot(b.vx,b.vy)*Math.max(0,b.ttl-1/30);
 assert.ok(b.__v17FuseDist<=maxTravel+1e-6,
   'programmed distance '+b.__v17FuseDist+' exceeds safe lifetime travel '+maxTravel);
 for(let i=0;i<Math.ceil(1.2*fps)&&g.bullets.length;i++){
   g.updateBullets(1/fps);g.time+=1/fps;
 }
 const hit=bursts.find(x=>x.kind===('bomber'===cls?'cluster':'splash'));
 assert.ok(hit,'full stick must actually airburst rather than expire');
 near(hit.x,preview.x,'full-depth x',2.01);near(hit.y,preview.y,'full-depth y',2.01);
 });
}
test('moving hull reduces reachable fuse distance without changing mid-depth',()=>{
 const {g,t,render}=boot('bomber','stick',0,-200,0);
 g.input.aim.dx=65;g.input.aim.dy=0;const p=render();g.tryFire(t);
 const b=g.bullets[0],travel=Math.hypot(b.vx,b.vy)*(b.ttl-1/30);
 assert.ok(b.__v17FuseDist<=travel+1e-6);
 const q=predicted(b);near(p.x,q.x,'moving x');near(p.y,q.y,'moving y');
});
test('ordinary mid-depth fuse program retains its original range formula',()=>{
 const {g,t}=boot('cannon','stick',0);
 g.input.aim.dx=32.5;g.input.aim.dy=0;g.tryFire(t);
 const depth=(32.5-5)/55,range=g.weaponRange(t);
 const original=Math.max(150,Math.min(range*.965,range*(.20+.78*depth)));
 near(g.bullets[0].__v17FuseDist,original,'unchanged mid-depth');
});

/* Exact 30Hz TTL boundary: a stale .033 safety margin exceeds the last
 * surviving frame by >2 world units at high projectile speed. The old
 * source loses the airburst; the exact 1/30 margin must trigger in time. */
for(const cls of ['cannon','bomber'])test(cls+' high-speed 30Hz TTL boundary: fuse survives the last safe step',()=>{
 const ttl=.23333333333333328,old=CLASSES[cls].bullet.ttl;
 CLASSES[cls].bullet.ttl=ttl;
 try{
  const {g,t,bursts}=boot(cls,'stick',0);
  g.bulletSpeed=()=>7000;g.weaponRange=()=>7000*ttl+40;
  g.input.aim.dx=65;g.input.aim.dy=0;g.tryFire(t);
  assert.equal(g.bullets.length,1);
  const b=g.bullets[0];
  assert.ok(b.__v17FuseDist<=7000*(ttl-1/30)+1e-6);
  for(let i=0;i<7&&g.bullets.length;i++){g.updateBullets(1/30);g.time+=1/30;}
  assert.ok(bursts.some(x=>x.kind===(cls==='bomber'?'cluster':'splash')),
   'programmed fuse must not be silently removed by core TTL expiry');
 }finally{CLASSES[cls].bullet.ttl=old;}
});
