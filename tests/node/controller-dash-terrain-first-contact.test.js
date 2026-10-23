'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
function extract(name){const i=source.indexOf('function '+name+'(');assert.ok(i>=0,'missing '+name);const start=source.indexOf('{',i);let depth=0;for(let j=start;j<source.length;j++){if(source[j]==='{')depth++;else if(source[j]==='}'&&--depth===0)return source.slice(i,j+1);}throw new Error('unclosed '+name);}
const ctx=vm.createContext({Math,Object,Number,CLASSES:{medium:{size:15}}});
for(const name of ['clamp','dist2','pointSegmentDist2','entityRadius','findDashHit','simulateControllerDrone'])vm.runInContext(extract(name),ctx);
const candidate=ctx.simulateControllerDrone;
function firstHit(s,ax,ay,bx,by,pad){
 if(!s||s.solid===false||(s.destructible&&s.hp<=0))return null;
 const dx=bx-ax,dy=by-ay;
 if(s.shape==='rect'){
  let lo=0,hi=1;
  for(const [a,d,min,max] of [[ax,dx,s.x-s.w/2-pad,s.x+s.w/2+pad],[ay,dy,s.y-s.h/2-pad,s.y+s.h/2+pad]]){
   if(Math.abs(d)<1e-12){if(a<min||a>max)return null;continue;}
   const u=(min-a)/d,v=(max-a)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return null;
  }
  const hx=ax+dx*lo,hy=ay+dy*lo;const nx=Math.abs(hx-(s.x-s.w/2-pad))<1e-6?-1:Math.abs(hx-(s.x+s.w/2+pad))<1e-6?1:0;const ny=nx?0:Math.abs(hy-(s.y-s.h/2-pad))<1e-6?-1:Math.abs(hy-(s.y+s.h/2+pad))<1e-6?1:0;return {solid:s,hit:{t:lo,x:hx,y:hy,nx,ny}};
 }
 const rr=s.r+pad,fx=ax-s.x,fy=ay-s.y,A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr;
 if(A<1e-12)return C<=0?{solid:s,hit:{t:0,x:ax,y:ay}}:null;
 if(C<=0){const disc=B*B-4*A*C,t=(-B+Math.sqrt(Math.max(0,disc)))/(2*A);return t>=0&&t<=1?{solid:s,hit:{t,x:ax+dx*t,y:ay+dy*t}}:null;}
 const disc=B*B-4*A*C;if(disc<0)return null;
 const t=(-B-Math.sqrt(disc))/(2*A);return t>=0&&t<=1?{solid:s,hit:{t,x:ax+dx*t,y:ay+dy*t}}:null;
}
function isSafe(s,x,y,pad){if(!s||s.solid===false||(s.destructible&&s.hp<=0))return true;
 if(s.shape==='circle')return (x-s.x)**2+(y-s.y)**2>(s.r+pad)**2;
 return Math.abs(x-s.x)>s.w/2+pad||Math.abs(y-s.y)>s.h/2+pad;
}
function run(fn,{wall=null,targetX=80,screenX=null,speed=600,dt=.2,mask=false,phaseT=.3,spawnX=0,spawnY=0,speedY=0,targetY=0,wallApi=true,active=true,swarming=false}={}){
 const owner={id:1,swarmT:swarming?1:0};
 const t={id:2,kind:'tank',cls:'medium',x:targetX,y:targetY,alive:true,spawnShieldT:0};
 const d={id:100,kind:'drone',ownerId:1,x:spawnX,y:spawnY,r:5,hp:20,dmg:10,speed:200,__novaPhase:'dash',__novaPhaseT:phaseT,__novaVX:speed,__novaVY:speedY,__novaHitRun:false,__novaCommitted:true,color:'#fff'};
 const screen=screenX==null?null:{id:3,kind:'drone',ownerId:3,x:screenX,y:0,r:5,hp:10};
 const terrain=wall==null?[]:(Array.isArray(wall)?wall:[wall]);
 const events=[];class Game{firstTerrainHit(ax,ay,bx,by,pad){this.calls++;return terrain.map(s=>firstHit(s,ax,ay,bx,by,pad)).filter(Boolean).sort((a,b)=>a.hit.t-b.hit.t)[0]||null;}isTerrainSafe(x,y,pad){return terrain.every(s=>isSafe(s,x,y,pad))}}
 const g=new Game();g.__novaTerrain=terrain;g.calls=0;g.tanks=[t];g.drones=screen?[d,screen]:[d];g.time=2;g.damageTank=(x,amt,id)=>events.push({kind:'tank',id:x.id,amt,owner:id});g.damageDrone=(x,amt,id)=>events.push({kind:'drone',id:x.id,amt,owner:id});g.addParticles=()=>events.push({kind:'wall-cue'});
 if(mask)g.firstTerrainHit=null;if(!wallApi){g.firstTerrainHit=null;Game.prototype.firstTerrainHit=null;}
 fn(g,owner,d,[],null,{active},{diveDamage:1.5,recover:.6},dt,false);
 return {events,drone:d,terrainCalls:g.calls};
}
const rect=(x=55)=>({shape:'rect',x,y:0,w:10,h:100,solid:true});
const pillar=(x=55)=>({shape:'circle',x,y:0,r:12,solid:true});
const damage=r=>r.events.filter(x=>x.kind==='tank'||x.kind==='drone');
for(const w of [rect(),pillar()])for(const mask of [false,true]){
 test(`wall blocks behind-target ${w.shape} masked=${mask}`,()=>{
  const neu=run(candidate,{wall:w,mask});
  assert.equal(damage(neu).length,0);
  assert.equal(neu.drone.__novaPhase,'recover');assert.equal(neu.drone.__novaCommitted,false);
  assert.ok(neu.drone.x<50);assert.ok(neu.terrainCalls>=1);
 });
 test(`target in front of ${w.shape} receives one hit masked=${mask}`,()=>{
  const neu=run(candidate,{wall:w,targetX:24,mask});assert.deepEqual(damage(neu),[{kind:'tank',id:2,amt:15,owner:1}]);assert.equal(neu.drone.__novaPhase,'recover');
 });
}
test('open field keeps normal damage and dash phase',()=>{const b=run(candidate);assert.deepEqual(damage(b),[{kind:'tank',id:2,amt:15,owner:1}]);assert.equal(b.drone.x,120);assert.equal(b.drone.__novaPhase,'dash')});
test('destroyed cover is passable',()=>{const b=run(candidate,{wall:{...rect(),destructible:true,hp:0}});assert.equal(damage(b).length,1);assert.equal(b.drone.__novaPhase,'dash')});
test('drone screen before cover takes hit',()=>{const b=run(candidate,{wall:rect(),screenX:25});assert.deepEqual(damage(b),[{kind:'drone',id:3,amt:15,owner:1}]);});
test('drone screen behind cover is protected',()=>{const b=run(candidate,{wall:rect(),screenX:80,targetX:105});assert.equal(damage(b).length,0)});
test('start inside a pillar aborts before any damage',()=>{const b=run(candidate,{wall:pillar(0),spawnX:0,targetX:15});assert.equal(damage(b).length,0);assert.equal(b.drone.x,0);assert.equal(b.drone.__novaPhase,'recover')});
test('collision against cover occurs on route planning skip frame',()=>{const b=run(candidate,{wall:rect(),mask:true});assert.equal(b.terrainCalls,1);assert.equal(damage(b).length,0)});
test('phase time naturally expires in open field',()=>{const b=run(candidate,{phaseT:.1});assert.equal(b.drone.__novaPhase,'recover');assert.equal(b.drone.__novaPhaseT,.6)});
test('missing terrain API with no solid terrain preserves open combat',()=>{const b=run(candidate,{wallApi:false});assert.equal(damage(b).length,1);});
test('missing terrain authority with live solids fails closed',()=>{const b=run(candidate,{wall:rect(),wallApi:false});assert.equal(damage(b).length,0);assert.equal(b.drone.__novaPhase,'recover');});
for(const fps of [30,60,120,240])test(`wall fairness across ${fps}Hz`,()=>{const b=run(candidate,{wall:rect(),dt:1/fps,speed:16000,targetX:80});assert.equal(damage(b).length,0);assert.equal(b.drone.__novaPhase,'recover')});

test('nearest of multiple solids stops the dash before target',()=>{
 const b=run(candidate,{wall:[rect(55),rect(105)],targetX:80});
 assert.equal(damage(b).length,0);assert.ok(b.drone.x<45);
});
test('destroyed first barricade permits hit before the next solid',()=>{
 const b=run(candidate,{wall:[{...rect(55),destructible:true,hp:0},rect(105)],targetX:80});
 assert.deepEqual(damage(b),[{kind:'tank',id:2,amt:15,owner:1}]);assert.equal(b.drone.__novaPhase,'recover');
});
test('live destructible barricade blocks without damaging the barricade',()=>{
 const wall={...rect(55),destructible:true,hp:25};const b=run(candidate,{wall});
 assert.equal(damage(b).length,0);assert.equal(wall.hp,25);
});
test('committed dash respects wall even when command is released',()=>{
 const b=run(candidate,{wall:rect(),targetX:80,active:false});assert.equal(damage(b).length,0);
});
test('short dash that cannot reach the wall stays committed',()=>{
 const b=run(candidate,{wall:rect(),speed:120,dt:.1});assert.equal(damage(b).length,0);assert.equal(b.drone.__novaPhase,'dash');
});
test('swarm bonus remains unchanged in front of wall',()=>{
 const b=run(candidate,{wall:rect(),targetX:24,swarming:true});assert.equal(damage(b)[0].amt,19.2);
});
test('exact wall/entity contact tie favors solid cover',()=>{
 const b=run(candidate,{wall:rect(),targetX:67});assert.equal(damage(b).length,0);
});
test('subpixel target contact just before wall remains valid',()=>{
 const b=run(candidate,{wall:rect(),targetX:67-0.00001});assert.equal(damage(b).length,1);
});
test('subpixel target contact just behind wall remains protected',()=>{
 const b=run(candidate,{wall:rect(),targetX:67+0.00001});assert.equal(damage(b).length,0);
});
test('near-wall valid contact survives physical position safety epsilon',()=>{
 const b=run(candidate,{wall:rect(),targetX:67-0.00000004});assert.equal(damage(b).length,1);
});
test('dash can depart from rectangular wall boundary without phantom collision',()=>{
 const b=run(candidate,{wall:rect(),spawnX:44,speed:-600,targetX:-80});
 assert.equal(damage(b).length,1);assert.equal(b.drone.__novaPhase,'dash');
});
test('dash can depart from circular pillar boundary without phantom collision',()=>{
 const b=run(candidate,{wall:pillar(),spawnX:37,speed:-600,targetX:-80});
 assert.equal(damage(b).length,1);assert.equal(b.drone.__novaPhase,'dash');
});

test('committed dash can skim along a rectangular wall face',()=>{
 const b=run(candidate,{wall:rect(),spawnX:44,speed:0,speedY:600,targetX:44,targetY:80});
 assert.equal(damage(b).length,1);assert.equal(b.drone.__novaPhase,'dash');
});
test('committed dash can skim tangentially along a pillar',()=>{
 const b=run(candidate,{wall:pillar(),spawnX:37,speed:0,speedY:600,targetX:37,targetY:80});
 assert.equal(damage(b).length,1);assert.equal(b.drone.__novaPhase,'dash');
});
test('starting on wall face and diving inward is blocked',()=>{
 const b=run(candidate,{wall:rect(),spawnX:44,speed:600,targetX:80});
 assert.equal(damage(b).length,0);assert.equal(b.drone.__novaPhase,'recover');
});
test('tangent escape still respects a second wall ahead',()=>{
 const cross={shape:'rect',x:44,y:80,w:70,h:10,solid:true};
 const b=run(candidate,{wall:[rect(),cross],spawnX:44,speed:0,speedY:600,targetX:44,targetY:115});
 assert.equal(damage(b).length,0);assert.equal(b.drone.__novaPhase,'recover');
});
