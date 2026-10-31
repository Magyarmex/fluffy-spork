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
 {CLASSES:{scout:{size:15},marksman:{size:14}}},2250);

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
  ?{CLASSES:{scout:{size:15},marksman:{size:14}}}:{ARENA_HALF:2250});
 return m.exports.Game;
}

function scenario(Game,{fps=30,positions=[40,70,100],pen=2,
 wall=null,shield=false,shape=false,moving=false,competitor=false,
 reverse=false,ttl=.2,velocity=6000,frames=1,remoteBullets=0,witnessed=false,
 targetClass='scout',radius=3}={}){
 const g=new Game();
 g.tanks=positions.map((x,i)=>({kind:'tank',id:i+2,x,y:0,
  cls:targetClass,hp:100,alive:true,hitCount:0}));
 if(reverse)g.tanks.reverse();
 if(witnessed){
  g.__novaShapeSweepActive=true;
  for(const t of g.tanks){
   t.__novaSweepMoveTime=g.time+1/fps;
   t.__novaSweepPrevX=t.x;
   t.__novaSweepPrevY=t.y;
  }
 }
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
  r:radius,dmg:20,ttl,pen,hits:0,dead:false,shell:false,beam:false}];
 for(let i=0;i<remoteBullets;i++)g.bullets.push({kind:'bullet',
  id:100+i,ownerId:1000+i,x:0,y:1000+i*2,vx:6000,vy:0,
  r:3,dmg:20,ttl:.2,pen:2,hits:0,dead:false,shell:false,beam:false});
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
 test(label+': 200 remote live pen-2 rounds do not hide the local certified chain',()=>{
  const out=scenario(boot(optimized),{remoteBullets:200});
  assert.deepEqual(out.byId,{2:1,3:1,4:1});
 });
 test(label+': live movement-epoch witnesses certify stationary hulls',()=>{
  assert.deepEqual(scenario(boot(optimized),{witnessed:true}).byId,
   {2:1,3:1,4:1});
 });
 test(label+': reverse enumeration does not change chronological victims',()=>{
  assert.deepEqual(scenario(boot(optimized),{reverse:true}).byId,
   {2:1,3:1,4:1});
 });
 test(label+': upgraded Marksman at legitimate speed hits three non-overlapping hulls at 30Hz',()=>{
  const speed=1050*(1+0.085*8); // canonical marksman + eight bullet-speed points
  const out=scenario(boot(optimized),{fps:30,positions:[25,52,79],
   velocity:speed,ttl:1.6,pen:2,targetClass:'marksman',radius:5,witnessed:true});
  assert.deepEqual(out.byId,{2:1,3:1,4:1});
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

/* Independent analytic first-contact oracle. This checks the ACTUAL
 * production wrappers, not a copy of their quadratic solver. Every
 * certified three-contact world must receive all three hits; worlds whose
 * third hull lies beyond the frame must never receive that third hit.
 * A split-frame 120Hz miss remains a separate known-red chronology issue.
 */
test('seeded 4,000-world FPS differential never fabricates a pen-2 contact',()=>{
 let seed=3191707;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const variants=[boot(false),boot(true)];
 let certified=0,proved=0;
 for(const fps of [30,60,120,240])for(let i=0;i<1000;i++){
  const dt=1/fps,velocity=600+rand()*10000;
  const spacing=27+rand()*65,x1=24+rand()*90;
  const positions=[x1,x1+spacing,x1+2*spacing];
  const first=(positions[0]-21)/velocity;
  const third=(positions[2]-21)/velocity;
  const full=first>0&&third<dt;
  const results=variants.map(Game=>scenario(Game,{fps,positions,velocity}));
  assert.deepEqual(results[0].byId,results[1].byId,
   'Performance must not change body results at '+fps+'Hz');
  for(const result of results){
   assert.ok(Object.values(result.byId).every(h=>h<=1),
    'no duplicate victim hits at '+fps+'Hz');
   if(full)assert.deepEqual(result.byId,{2:1,3:1,4:1},
    'all certified contacts must resolve at '+fps+'Hz');
   if(third>dt)assert.equal(result.byId[4],0,
    'cannot hit third hull beyond frame at '+fps+'Hz');
  }
  if(full){certified++;proved++;}
 }
 assert.ok(certified>100,'oracle must exercise many genuine full chains');
 assert.equal(proved,certified);
});

/* Run 497: a pen=2 round may have struck one hull in a previous frame.
 * Two later stationary hulls can then lie in the same frame's physical path;
 * endpoint-only core resolution must not skip the middle hull. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test('pen=2 continuation preserves both later physical contacts at '+fps+'Hz optimized='+optimized,()=>{
  const positions=[93.7598181758076,139.03676807903686,184.3137179822661];
  const velocity=3363.217242434621,ttl=.2043253394891508;
  const result=scenario(boot(optimized),{fps,positions,velocity,ttl,
   frames:Math.ceil(ttl*fps)+2});
  assert.deepEqual(result.byId,{2:1,3:1,4:1},
   'all three nonlethal stationary hulls are reached before expiry');
 });
}

test('continuing pen=2 round cannot damage hulls behind permanent cover',()=>{
 for(const optimized of [false,true])for(const fps of [30,60,120,240]){
  const result=scenario(boot(optimized),{
   fps,positions:[93.7598181758076,139.03676807903686,184.3137179822661],
   velocity:3363.217242434621,ttl:.2043253394891508,
   wall:120,frames:Math.ceil(.2043253394891508*fps)+2});
  assert.deepEqual(result.byId,{2:1,3:0,4:0},
   'wall must stop continued shot before both later hulls at '+fps+'Hz');
 }
});

test('seeded nonlethal stationary pen=2 contacts agree with physical reach at every FPS',()=>{
 let seed=3191707;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const optimized of [false,true]){
  const Game=boot(optimized);
  for(let i=0;i<500;i++){
   const velocity=600+rand()*4000,spacing=45+rand()*45,
    x1=24+rand()*90,positions=[x1,x1+spacing,x1+2*spacing],
    ttl=.1+rand()*.15;
   const expected=positions.map(x=>(x-21)/velocity<ttl?1:0);
   for(const fps of [30,60,120,240]){
    const result=scenario(Game,{fps,positions,velocity,ttl,
     frames:Math.ceil(ttl*fps)+2});
    assert.deepEqual(Object.values(result.byId),expected,
     'no missed/phantom contact at fps='+fps+' seed='+i+' optimized='+optimized);
   }
  }
 }
});

test('continued two-hit shortcut requires a single live prior tank victim',()=>{
 for(const optimized of [false,true])for(const valid of [true,false]){
  const Game=boot(optimized),g=new Game();
  const prior={kind:'tank',id:2,x:93.7598181758076,y:0,
   cls:'scout',hp:100,alive:true,hitCount:0};
  const middle={kind:'tank',id:3,x:139.03676807903686,y:0,
   cls:'scout',hp:100,alive:true,hitCount:0};
  const last={kind:'tank',id:4,x:184.3137179822661,y:0,
   cls:'scout',hp:100,alive:true,hitCount:0};
  g.tanks=[prior,middle,last];
  const oldVictim=valid?prior:{kind:'shape',id:22,hp:100};
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:112.10724141448736,y:0,
   vx:3363.217242434621,vy:0,r:3,dmg:20,ttl:.17,pen:1,hits:1,
   dead:false,shell:false,beam:false,__novaDirectVictims:new Set([oldVictim])}];
  g.updateBullets(1/30);
  if(valid){assert.equal(middle.hitCount,1);assert.equal(last.hitCount,1);}
  else assert.ok(middle.hitCount+last.hitCount<=1,
   'shape-only history cannot authorize a two-tank continuation');
 }
});

test('200 unrelated remote shots cannot suppress a local continuing pen=2 chain',()=>{
 for(const optimized of [false,true])for(const fps of [30,60,120,240]){
  const ttl=.2043253394891508;
  const result=scenario(boot(optimized),{
   fps,positions:[93.7598181758076,139.03676807903686,184.3137179822661],
   velocity:3363.217242434621,ttl,frames:Math.ceil(ttl*fps)+2,
   remoteBullets:200});
  assert.deepEqual(result.byId,{2:1,3:1,4:1},
   'unrelated remote fire cannot disable local physical contact at '+fps+'Hz');
 }
});
