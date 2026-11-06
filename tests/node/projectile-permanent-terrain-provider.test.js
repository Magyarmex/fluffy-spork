'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {makePermanentTerrainProvider}=require('../research/projectile-permanent-terrain-provider.cjs');
const {observeProjectilePairs}=require('../research/projectile-pair-chronology-observer.cjs');
const shot=(ownerId,x,vx)=>({kind:'bullet',dead:false,shell:false,beam:false,pen:0,hits:0,ttl:.42,r:3,ownerId,x,y:0,vx,vy:0});
const wall=()=>({shape:'rect',x:0,y:0,w:4,h:40,solid:true,destructible:false});
function fixture(wallFraction){return {__novaResearchHostilityFixture:true,bullets:[shot(1,-20,1000),shot(2,20,-1000)],tanks:[],shapes:[],drones:[],terrain:[],__novaTerrain:[wall()],firstTerrainHit:function(){return wallFraction==null?null:{solid:this.__novaTerrain[0],hit:{t:wallFraction}};}};}
test('wall before interception vetoes chronological certificate',()=>{
 const g=fixture(.1),dt=.04;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);assert.equal(r.certified.length,0);
});
test('wall after interception preserves chronological certificate',()=>{
 const g=fixture(.9),dt=.04;
 const r=observeProjectilePairs(g,dt,makePermanentTerrainProvider(g,dt));
 assert.equal(r.incomplete,false);assert.equal(r.certified.length,1);
});
test('active destructible cover vetoes provider',()=>{
 const g=fixture(.9);g.__novaTerrain[0].destructible=true;g.__novaTerrain[0].hp=10;
 assert.equal(makePermanentTerrainProvider(g,.04),null);
});
test('live game and bullet snapshots stay unchanged',()=>{
 const g=fixture(.9),before=JSON.stringify(g.__novaTerrain),bullets=JSON.stringify(g.bullets);
 makePermanentTerrainProvider(g,.04);
 assert.equal(JSON.stringify(g.__novaTerrain),before);assert.equal(JSON.stringify(g.bullets),bullets);
});

test('unmarked live Game is not treated as a hostile-owner fixture',()=>{
 const g=fixture(.9);delete g.__novaResearchHostilityFixture;
 assert.equal(makePermanentTerrainProvider(g,.04),null);
});

test('provider rejects terrain that changes between snapshot and certificate',()=>{
 const g=fixture(.9),dt=.04;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 g.__novaTerrain[0].x=7;
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,true);
 assert.equal(r.certified.length,0);
});

test('provider refuses bodies or withdrawn fixture authorization after snapshot',()=>{
 for (const mutation of [g=>g.tanks.push({id:9,x:0,y:0}),
   g=>{g.__novaResearchHostilityFixture=false;},
   g=>{g.terrain.push(wall());}]) {
   const g=fixture(.9),dt=.04,provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function');
   mutation(g);
   const r=observeProjectilePairs(g,dt,provider);
   assert.equal(r.incomplete,true);
   assert.equal(r.certified.length,0);
 }
});

test('earlier wall-blocked projectile contact cannot veto later clear hostile interception',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,27.5,-1000)];
 g.__novaTerrain=[{...wall(),x:-12,w:2}];
 // Use the actual firstTerrainHit geometry in the composed Battlefield test;
 // this synthetic query explicitly models the earlier wall hit for shot A.
 g.firstTerrainHit=function(ax,ay,bx,by,pad){
   if(ax!==-17.5)return null;
   return {solid:this.__novaTerrain[0],hit:{t:.08}};
 };
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
 assert.equal(r.certified[0].i,1);
 assert.equal(r.certified[0].j,2);
 assert.ok(Math.abs(r.certified[0].time-.02)<1e-9);
});

test('wall resolves geometric shared-projectile tie before valid-contact arbitration',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,17.5,-1000)];
 g.__novaTerrain=[{...wall(),x:-12,w:2}];
 g.firstTerrainHit=function(ax){
   return ax===-17.5?{solid:this.__novaTerrain[0],hit:{t:.08}}:null;
 };
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
 assert.deepEqual([r.certified[0].i,r.certified[0].j],[1,2]);
 assert.ok(Math.abs(r.certified[0].time-.01)<1e-9);
});

test('unblocked simultaneous shared-projectile tie remains conservatively uncertified',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,17.5,-1000)];
 g.__novaTerrain=[{...wall(),x:200}];
 g.firstTerrainHit=()=>null;
 assert.equal(makePermanentTerrainProvider(g,dt),null);
});

test('terrain witness ignores unrelated projectile payload getters',()=>{
 const g=fixture(.9),dt=.04;
 Object.defineProperty(g.bullets[0],'unrelated',{enumerable:true,get(){throw Error('not geometry');}});
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
});

test('terrain-qualified provider preserves open-field certificates when no walls exist',()=>{
 const {makeOpenFieldProvider}=require('../research/projectile-open-field-event-provider.cjs');
 let seed=0x5eed1234;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const dt=.04;
 for(let world=0;world<500;world++){
   const g=fixture(null);
   g.__novaTerrain=[];g.firstTerrainHit=()=>null;
   g.bullets=Array.from({length:3+Math.floor(random()*4)},(_,i)=>{
     const s=shot(i+1,(random()-.5)*100,(random()-.5)*2400);
     s.y=(random()-.5)*100;s.vy=(random()-.5)*2400;
     return s;
   });
   const baseline=makeOpenFieldProvider({...g,terrain:[],__novaTerrain:[]},dt);
   const terrain=makePermanentTerrainProvider(g,dt);
   assert.equal(terrain===null,baseline===null,'world '+world);
   if(baseline===null)continue;
   const expected=observeProjectilePairs(g,dt,baseline);
   const actual=observeProjectilePairs(g,dt,terrain);
   assert.deepEqual(actual.certified,expected.certified,'world '+world);
   assert.equal(actual.incomplete,expected.incomplete,'world '+world);
 }
});

test('seeded one-dimensional wall chronology agrees with independent first-contact oracle',()=>{
 let seed=0x147735;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const dt=.04, radius=7.5, boundary=2.35;
 const wallTime=(x,v)=>{
   if(Math.abs(x)<=boundary)return 0;
   if(x< -boundary && v>0)return (-boundary-x)/v;
   if(x>boundary && v<0)return (boundary-x)/v;
   return null;
 };
 const contact=(a,b)=>{
   const dx=a.x-b.x,dv=a.vx-b.vx;
   if(Math.abs(dx)<=radius)return 0;
   if(dx*dv>=0)return null;
   const t=(Math.abs(dx)-radius)/Math.abs(dv);
   return t<dt-1e-9?t:null;
 };
 for(let world=0;world<1000;world++){
   const g=fixture(null);
   const positions=[-50,-30,30,50];
   g.bullets=positions.map((x,i)=>shot(i+1,x,(random()-.5)*3000));
   g.__novaTerrain=[{...wall(),x:0,w:2}];
   g.firstTerrainHit=function(ax,ay,bx,by,pad){
     const v=(bx-ax)/dt,t=wallTime(ax,v);
     return t!==null && t<=dt?
       {solid:this.__novaTerrain[0],hit:{t:t/dt}}:null;
   };
   const events=[];
   for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
     const a=g.bullets[i],b=g.bullets[j],t=contact(a,b);
     if(t===null)continue;
     const wa=wallTime(a.x,a.vx),wb=wallTime(b.x,b.vx);
     if((wa!==null && wa<=t+1e-9)||(wb!==null && wb<=t+1e-9))continue;
     events.push({i,j,time:t});
   }
   events.sort((a,b)=>a.time-b.time);
   const expected=events.length && !(events.length>1 &&
     events[1].time<=events[0].time+1e-9)?events[0]:null;
   const provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function','world '+world);
   const actual=observeProjectilePairs(g,dt,provider);
   assert.equal(actual.incomplete,false,'world '+world);
   if(!expected){assert.equal(actual.certified.length,0,'world '+world);continue;}
   assert.equal(actual.certified.length,1,'world '+world);
   assert.deepEqual([actual.certified[0].i,actual.certified[0].j],
     [expected.i,expected.j],'world '+world);
   assert.ok(Math.abs(actual.certified[0].time-expected.time)<1e-9,'world '+world);
 }
});


test('distant active cover permits wall-qualified hostile interception',()=>{
 const g=fixture(null),dt=.04;
 g.__novaTerrain=[{...wall(),x:100,y:100,destructible:true,hp:20}];
 g.firstTerrainHit=()=>null;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
});
test('moving distant active cover into corridor invalidates snapshot',()=>{
 const g=fixture(null),dt=.04;
 g.__novaTerrain=[{...wall(),x:100,y:100,destructible:true,hp:20}];
 g.firstTerrainHit=()=>null;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 g.__novaTerrain[0].y=0;
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,true);
 assert.equal(r.certified.length,0);
});


test('distant active cover preserves earliest contact across 30–240Hz and storage order',()=>{
 for(const hz of [30,60,120,240])for(const reversed of [false,true]){
   const g=fixture(null),dt=1/hz;
   const a=shot(1,-5,1000),b=shot(2,5,-1000);
   g.bullets=reversed?[b,a]:[a,b];
   g.__novaTerrain=[{...wall(),x:200,y:200,destructible:true,hp:20}];
   g.firstTerrainHit=()=>null;
   const provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function',hz+'Hz');
   const r=observeProjectilePairs(g,dt,provider);
   assert.equal(r.incomplete,false,hz+'Hz');
   assert.equal(r.certified.length,1,hz+'Hz');
   assert.ok(Math.abs(r.certified[0].time-.00125)<1e-9,hz+'Hz');
 }
});


test('terrain-qualified event provider rejects stale third-projectile geometry',()=>{
 const g=fixture(null),dt=.04;
 g.__novaTerrain=[];g.firstTerrainHit=()=>null;
 g.bullets=[shot(1,-20,1000),shot(2,20,-1000),shot(3,200,0)];
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 g.bullets[2].x=0;
 const result=observeProjectilePairs(g,dt,provider);
 assert.equal(result.incomplete,true);
 assert.equal(result.certified.length,0);
});


test('terrain provider invalidates replaced terrain owner and first-hit method',()=>{
 const dt=.04;
 for(const mutate of [
   g=>{g.__novaTerrain=g.__novaTerrain.map(s=>({...s}));},
   g=>{g.firstTerrainHit=()=>null;}
 ]){
   const g=fixture(.9);
   const provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function');
   mutate(g);
   const result=observeProjectilePairs(g,dt,provider);
   assert.equal(result.incomplete,true);
   assert.equal(result.certified.length,0);
 }
});


test('terrain provider rejects replacement of live bullet array after snapshot',()=>{
 const g=fixture(.9),dt=.04;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 g.bullets=g.bullets.map(b=>({...b}));
 const result=observeProjectilePairs(g,dt,provider);
 assert.equal(result.incomplete,true);
 assert.equal(result.certified.length,0);
});

test('unknown permanent or destructible terrain shape fails closed instead of certifying a clear corridor',()=>{
 const dt=.04;
 for(const destructible of [false,true]){
  const g=fixture(null);
  g.__novaTerrain=[{shape:'polygon',x:0,y:0,solid:true,destructible,hp:20,
    w:4,h:40}];
  // A shipping first-hit implementation that does not recognize a new shape
  // could report no wall, but the observer must not interpret that as clear.
  g.firstTerrainHit=()=>null;
  assert.equal(makePermanentTerrainProvider(g,dt),null,
    'unknown '+(destructible?'active cover':'permanent wall')+' geometry');
 }
});

test('known rectangular and circular permanent terrain remain valid research geometry',()=>{
 const dt=.04;
 for(const shape of ['rect','circle']){
  const g=fixture(null);
  g.__novaTerrain=[shape==='rect'?{...wall(),x:100,y:100}:
    {shape:'circle',x:100,y:100,r:5,solid:true,destructible:false}];
  g.firstTerrainHit=()=>null;
  const provider=makePermanentTerrainProvider(g,dt);
  assert.equal(typeof provider,'function',shape);
  const r=observeProjectilePairs(g,dt,provider);
  assert.equal(r.incomplete,false,shape);
  assert.equal(r.certified.length,1,shape);
 }
});
