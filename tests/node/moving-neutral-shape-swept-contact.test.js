'use strict';
// Real materialized core bullet method + shipping Battlefield overlay.
// The simulated frame moves shapes BEFORE projectile processing, exactly as
// Game.update does; this preserves the physical history missing from endpoint-only fixtures.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
const perf=fs.readFileSync(path.join(root,'nova-updates/performance-v1.7.8.js'),'utf8');
function coreBullets(){
 const marker='    updateBullets(dt) {',at=html.indexOf(marker);
 assert.ok(at>=0,'materialized core method absent');
 let p=at+marker.length,depth=1;
 while(depth&&p<html.length){if(html[p]==='{')depth++;else if(html[p]==='}')depth--;p++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(at+marker.length,p-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2,
   clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x))},
  {CLASSES:{scout:{size:15}}},2250);
}
function coreUpdate(){
 const marker='    update(dt) {',at=html.indexOf(marker);
 assert.ok(at>=0,'materialized core update missing');
 let p=at+marker.length,depth=1;
 while(depth&&p<html.length){if(html[p]==='{')depth++;else if(html[p]==='}')depth--;p++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','ai_1','storage_1','M','SHAPE_TARGETS',
  'return function(dt){'+html.slice(at+marker.length,p-1)+'}')(
  {rnd:()=>1,TAU:Math.PI*2,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
   lerp:(a,b,t)=>a+(b-a)*t,dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{scout:{size:15,hpMult:1},crasher:{size:15,hpMult:1}}},
  {updateAI(){}},{lsSet(){}},2250,[]);
}
function boot(withPerf=false,withCore=false){
 class Game{
  constructor(){
   this.bullets=[];this.shapes=[];this.tanks=[];this.drones=[];
   this.tmp=[];this.time=1;this.__novaTerrain=[];this.hits=[];
   this.cam={shake:0};this.sfx={explode(){}};
   this.hash={cell:180,clear(){},insert(){},query:(x,y,r,out)=>{
    out.length=0;
    for(const e of this.shapes)
     if(Math.hypot(e.x-x,e.y-y)<=r+(e.r||0))out.push(e);
   }};
  }
 }
 for(const name of ['spawnShape','spawnPlayer','spawnPowerup','tryFire',
  'moveTank','updateDrones','addParticles','addImpactDebris',
  'addRing','damageTank','damageDrone','splashAt','initBulletIntegrity',
  'resolveBulletCollisions','clusterBurst','useAbility','addFlash']){
  Game.prototype[name]=function(){};
 }
 Game.prototype.updateBullets=coreBullets();
 Game.prototype.update=withCore?coreUpdate():function(dt){
  this.time+=dt;
  if(this.__testShapeMotion)this.__testShapeMotion(dt);
  else for(const s of this.shapes){s.x+=(s.vx||0)*dt;s.y+=(s.vy||0)*dt;}
  if(this.hash.clear&&this.hash.insert){this.hash.clear();for(const s of this.shapes)this.hash.insert(s);}
  this.updateBullets(dt);
 };
 Game.prototype.damageShape=function(s,dmg){s.hp-=dmg;this.hits.push(s.id);};
 Game.prototype.randSpawnPos=()=>({x:1000,y:1000});
 const modules={
  'game/engine':m=>{m.exports.Game=Game;},
  'game/ai':m=>{m.exports.updateAI=()=>{};},
  'game/render':m=>{m.exports.render=()=>{};},
  'game/audio':m=>{m.exports.Sfx=class{};}
 };
 const window={__novaModules:modules};
 new Function('window','console',battlefield)(window,{info(){},warn(){},error(){}});
 if(withPerf)new Function('window','console',perf)(window,{info(){},warn(){},error(){}});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,id=>id.includes('classes')
  ?{CLASSES:{scout:{size:15}}}:{ARENA_HALF:2250});
 const g=new m.exports.Game();
 if(withCore){
  g.__novaBattlefield={announced:true,name:'TEST'};
  g.status='playing';g.zoom=1;g.w=800;g.h=600;
  g.player={id:99,kind:'tank',cls:'scout',x:1000,y:1000,vx:0,vy:0,
   alive:true,isPlayer:true,angle:0,hp:100,maxHp:100,stats:{regen:0},
   level:1,abilityCd:0,fireCd:0,regenDelay:1,perk:null};
  g.tanks=[g.player];g.input={moveVec:()=>({x:0,y:0}),aimVec:()=>null,
   mouseActive:false,firing:false,autofire:false,abilityQueued:false};
  g.parts=[];g.texts=[];g.shapeTimer=100;g.powerupTimer=100;
  g.crasherTimer=100;g.eliteTimer=100;g.hudTimer=1;
  g.powerups=[];g.shapeCounts=new Map();g.aiRespawns=[];
  g.cb={event(){}};g.tankSpeed=()=>0;g.bodyCollisions=()=>{};
  g.updateOrbs=()=>{};g.updatePowerups=()=>{};g.syncHud=()=>{};
  g.updateMusicIntensity=()=>{};g.spawnAITank=()=>{};
  g.cam={x:0,y:0,zoom:1,shake:0};
 }
 return g;
}
function bullet(){return{id:3,kind:'bullet',ownerId:1,
 x:0,y:0,vx:1500,vy:0,r:3,dmg:10,pen:0,ttl:1,
 hits:0,dead:false,shell:false,beam:false};}
function world(fps,initialY,vy,withPerf=false){
 const g=boot(withPerf),dt=1/fps;
 const s={id:5,kind:'shape',type:'crasher',x:10,y:initialY,
  vx:0,vy,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 for(let i=0;i<Math.ceil(fps/10)&&g.bullets.length;i++)g.update(dt);
 return{hits:g.hits.length,hp:s.hp};
}
for(const fps of [30,60,120,240]){
 test('real shipping moving Crasher contact at '+fps+' Hz',()=>{
  const v=world(fps,17,105);
  assert.equal(v.hits,1,'moving Crasher crosses projectile before it passes');
  assert.equal(v.hp,10);
 });
 test('no phantom hit from moving Crasher at '+fps+' Hz',()=>{
  const v=world(fps,20.5,-105);
  assert.equal(v.hits,0,'Crasher enters old projectile path only after shot passes');
  assert.equal(v.hp,20);
 });
}
test('static neutral shape outside projectile corridor stays untouched',()=>{
 const v=world(30,20.5,0);assert.equal(v.hits,0);assert.equal(v.hp,20);
});
test('stationary neutral shape in projectile corridor still takes damage',()=>{
 const v=world(30,0,0);assert.equal(v.hits,1);assert.equal(v.hp,10);
});
test('materialized production includes Battlefield overlay',()=>{
 assert.ok(html.includes('nova-updates/battlefield-v1.6.0.js'));
});

for(const reverse of [false,true]){
 test('earliest moving Crasher beats a later static shape, reverse='+reverse,()=>{
  const g=boot(),dt=1/30;
  const cr={id:5,kind:'shape',type:'crasher',x:10,y:17,vx:0,vy:105,r:15,hp:20,maxHp:20};
  const later={id:6,kind:'shape',type:'square',x:34,y:0,vx:0,vy:0,r:15,hp:20,maxHp:20};
  g.shapes=reverse?[later,cr]:[cr,later];g.bullets=[bullet()];
  g.update(dt);
  assert.deepEqual(g.hits,[5],'first physical shape must win, regardless of insertion order');
  assert.equal(cr.hp,10);assert.equal(later.hp,20);
 });
}
test('teleported shape does not invent a hit along its relocation gap',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'star',x:10,y:150,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 g.__testShapeMotion=()=>{s.y=0;}; // instant relocation, not physical movement
 g.update(1/30);
 assert.equal(g.hits.length,0);
 assert.equal(s.hp,20);
});
test('moving shape can be hit on the next frame after a teleport',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'star',x:10,y:150,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 g.__testShapeMotion=()=>{s.y=0;};
 g.update(1/30);assert.equal(g.hits.length,0);
 g.__testShapeMotion=null;g.bullets=[bullet()];
 g.update(1/30);
 assert.equal(g.hits.length,1);
});

test('seeded moving-shape contacts agree with independent relative-motion oracle',()=>{
 let seed=338253;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const g=boot();let checked=0,expectedHits=0;
 for(const fps of [30,60,120,240]){
  const dt=1/fps;
  for(let k=0;k<250;k++){
   const sx=2+rand()*44,sy=-26+rand()*52;
   const vy=-105+rand()*210,vx=400+rand()*1100;
   const fx=-sx,fy=-sy,dx=vx*dt,dy=-vy*dt;
   const a=dx*dx+dy*dy;
   const t=Math.max(0,Math.min(1,-(fx*dx+fy*dy)/a));
   const sep=(fx+dx*t)**2+(fy+dy*t)**2;
   if(Math.abs(sep-18*18)<1e-5)continue; // numerical tangency is a separate gate
   const shouldHit=sep<18*18;
   const s={id:k+1000,kind:'shape',type:'crasher',x:sx,y:sy,
    vx:0,vy,r:15,hp:20,maxHp:20};
   g.shapes=[s];g.bullets=[{...bullet(),vx}];g.hits.length=0;
   g.update(dt);
   assert.equal(g.hits.length,shouldHit?1:0,
    'fps='+fps+' case='+k+' x='+sx+' y='+sy+' vy='+vy+' vx='+vx);
   expectedHits+=Number(shouldHit);checked++;
  }
 }
 assert.ok(checked>=995);
 assert.ok(expectedHits>100,'oracle exercised actual contacts');
});

for(const fps of [30,60,120,240]){
 test('Zero Churn shipping composition: moving Crasher hit at '+fps+' Hz',()=>{
  assert.equal(world(fps,17,105,true).hits,1);
 });
 test('Zero Churn shipping composition: no phantom at '+fps+' Hz',()=>{
  assert.equal(world(fps,20.5,-105,true).hits,0);
 });
}

test('swept grid recovers moving shape absent from endpoint spatial hash',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'crasher',x:10,y:17,
  vx:0,vy:105,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 g.hash.query=(_x,_y,_r,out)=>{out.length=0;}; // endpoint hash misses motion
 g.update(1/30);
 assert.deepEqual(g.hits,[5]);
});
for(const y of [18,18.0001,18.1]){
 test('parallel moving shape at separation '+y+' is not a phantom hit',()=>{
  const g=boot(),s={id:5,kind:'shape',type:'crasher',x:10,y,
   vx:105,vy:0,r:15,hp:20,maxHp:20};
  g.shapes=[s];g.bullets=[bullet()];g.update(1/30);
  assert.equal(g.hits.length,0);
 });
}

for(const [label,x,vx,expected] of [
 ['separating at start boundary',-18,-105,0],
 ['arriving at end boundary',64.5,105,0],
 ['crossing into overlap before end',69,-105,1]
]){
 test('strict moving-shape frame contact: '+label,()=>{
  const g=boot(),s={id:5,kind:'shape',type:'crasher',x,y:0,
   vx,vy:0,r:15,hp:20,maxHp:20};
  g.shapes=[s];g.bullets=[bullet()];g.update(1/30);
  assert.equal(g.hits.length,expected);
 });
}

for(const fps of [30,60,120,240]){
 test('actual materialized Game.update + Battlefield: Crasher hit at '+fps+' Hz',()=>{
  const g=boot(false,true),s={id:5,kind:'shape',type:'crasher',x:10,y:17,
   vx:0,vy:105,r:15,hp:20,maxHp:20,wanderT:999,spin:0,angle:0};
  g.shapes=[s];g.bullets=[bullet()];
  g.update(1/fps);
  assert.equal(g.hits.length,1);
 });
 test('actual materialized Game.update + Battlefield: no phantom at '+fps+' Hz',()=>{
  const g=boot(false,true),s={id:5,kind:'shape',type:'crasher',x:10,y:20.5,
   vx:0,vy:-105,r:15,hp:20,maxHp:20,wanderT:999,spin:0,angle:0};
  g.shapes=[s];g.bullets=[bullet()];
  g.update(1/fps);
  assert.equal(g.hits.length,0);
 });
}

test('moving shape can cross a nearly stationary projectile in one frame',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'crasher',x:0,y:-25,
  vx:0,vy:1500,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),vx:0}];
 g.update(1/30);
 assert.deepEqual(g.hits,[5]);
 assert.equal(s.hp,10);
});

test('swept-shape index releases active references when the battlefield goes quiet',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'crasher',x:10,y:17,
  vx:0,vy:105,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];g.update(1/30);
 const ix=g.__novaSweptShapeGrid;
 assert.ok(ix&&ix.active.length>0&&ix.all.length===1);
 g.bullets=[];g.update(1/30);
 assert.equal(ix.active.length,0);
 assert.equal(ix.all.length,0);
 for(const bucket of ix.cells.values())assert.equal(bucket.length,0);
});

/* Run 339: independently exact-binary64-classified shallow moving-disc contacts.
 * The old quadratic discriminant loses precision near tangency. These worlds
 * keep both endpoints outside the shape; only the swept path can hit it. */
test('grazing precision: genuine shallow moving Crasher contact 1',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[1806.8924210965633,-1448.5023515298963,1896.2322791427555,-1488.9638600445567,1888.062145787248,-1465.5036768836706,1885.0422216023267,-1464.1359705676537];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,1,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,10);
});
test('grazing precision: genuine shallow moving Crasher contact 2',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[425.71261897683144,-1758.6256982758641,512.5132621706505,-1718.172087500193,467.37055548466793,-1719.3520769633997,461.16862892063585,-1722.2424970576428];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,1,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,10);
});
test('grazing precision: genuine shallow moving Crasher contact 3',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[1358.7517030537128,1122.797372750938,1436.8931394806789,1217.1272763839493,1408.2192022352415,1210.7291438500679,1403.0890303130552,1204.5361603938077];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,1,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,10);
});
test('grazing precision: near-tangent noncontact 1',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[-1711.5245945751667,1468.4866620227695,-1761.5560889055323,1598.5130896787873,-1768.676435323737,1566.8945217507512,-1770.1755729126724,1570.7906177571383];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,0,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,20);
});
test('grazing precision: near-tangent noncontact 2',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[1283.8673777878284,-1708.7158234789968,1263.40077874557,-1606.4848111239937,1250.8238944265452,-1635.3574614191966,1249.0250381514252,-1626.3721435504606];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,0,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,20);
});
test('grazing precision: near-tangent noncontact 3',()=>{
 const [ax,ay,ex,ey,sx,sy,sxe,sye]=[1658.739771693945,-1237.2492449358106,1719.8996091526515,-1157.028499015139,1681.0691552929975,-1178.271958643633,1686.3837409300604,-1171.3010437135154];
 const g=boot(),s={id:700,kind:'shape',type:'crasher',x:sx,y:sy,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[{...bullet(),x:ax,y:ay,vx:ex-ax,vy:ey-ay,ttl:2}];
 g.__testShapeMotion=()=>{s.x=sxe;s.y=sye;};
 g.update(1);
 assert.equal(g.hits.length,0,'strict physical moving-disc contact must be frame-order independent');
 assert.equal(s.hp,20);
});
