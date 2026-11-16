'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const walls=[
  {id:91001,x:-130,y:-35,w:60,h:330,solid:true},
  {id:91002,x:0,y:35,w:60,h:330,solid:true},
  {id:91003,x:130,y:-35,w:60,h:330,solid:true}
];
function hitRect(ax,ay,bx,by,w,pad=0){
 const minX=w.x-w.w/2-pad,maxX=w.x+w.w/2+pad;
 const minY=w.y-w.h/2-pad,maxY=w.y+w.h/2+pad;
 const dx=bx-ax,dy=by-ay;let lo=0,hi=1;
 for(const [p,q] of [[-dx,ax-minX],[dx,maxX-ax],[-dy,ay-minY],[dy,maxY-ay]]){
  if(Math.abs(p)<1e-9){if(q<0)return false;}
  else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
 }
 return true;
}
function clear(ax,ay,bx,by,pad=0){return !walls.some(w=>hitRect(ax,ay,bx,by,w,pad));}
function setup(){
 function Game(){}
 Game.prototype.novaBattlefieldWaypoint=function(x,y){return{x,y};};
 Game.prototype.moveTank=function(){};
 const modules={'game/engine':m=>{m.exports={Game};}};
 const w={__novaModules:modules};
 const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/terrain-intelligence-v1.10.2.js'),'utf8');
 vm.runInNewContext(source,{window:w,console});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,()=>({CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'}));
 const g=new m.exports.Game();
 g.__novaTerrain=walls;g.time=15.55;g.hasLineOfSight=clear;
 g.isTerrainSafe=(x,y,pad=0)=>!walls.some(w=>Math.abs(x-w.x)<=w.w/2+pad&&Math.abs(y-w.y)<=w.h/2+pad);
 g.__researchTerrain=w.__NOVA_TERRAIN_INTELLIGENCE_TEST__;
 return g;
}
test('research: physical route exists around the even-seed third-wall corner',()=>{
 const p=[[81,-200],[66,-234],[194,-234],[340,-40]];
 for(let i=1;i<p.length;i++)
  assert.ok(clear(...p[i-1],...p[i],18),'certified leg '+i);
});
test('research: Terrain Intelligence can certify the reachable corner route',()=>{
 const g=setup(),wp=g.novaBattlefieldWaypoint(81,-200,340,-40,23,700008);
 assert.ok(wp&&Number.isFinite(wp.x)&&Number.isFinite(wp.y),'must produce a waypoint');
 const len=g.novaRouteLength(81,-200,340,-40,23,700008,wp);
 assert.ok(Number.isFinite(len)&&len>0,'reachable 3-wall corner should have certified complete route; waypoint='+JSON.stringify(wp)+' length='+len);
});

test('research: probe near-wall waypoint certification over the actual failed approach',()=>{
 const probes=[];
 for(const y of [-205,-201,-200,-199.306,-198.761,-195,-190,-180,-160]){
  const g=setup(),x=81;
  const wp=g.novaBattlefieldWaypoint(x,y,340,-40,23,700008);
  const len=wp&&g.novaRouteLength(x,y,340,-40,23,700008,wp);
  const flags=g.__novaTerrain.map(w=>({id:w.id,solid:w.solid,destructible:w.destructible??null,hp:w.hp??null}));
  const nodes=g.__researchTerrain.obstacleNodes(g,x,y,340,-40,23);
  const direct=g.__researchTerrain.planVisibilityRoute(g,x,y,340,-40,23,700008,null);
  probes.push({x,y,wp:wp?{x:wp.x,y:wp.y}:null,len:Number.isFinite(len)?+len.toFixed(3):null,nodes:nodes.length,direct:direct?direct.map(p=>({x:p.x,y:p.y})):null,flags});
 }
 console.log('EVEN_SEED_APPROACH_PROBE '+JSON.stringify(probes));
 assert.equal(probes.length,9);
});

test('research: physical Guard padding boundary versus route-visibility clearance',()=>{
 const out=[];
 for(const pad of [23,24]){
  for(const x of [80,80.5,80.99,81,81.01,82]){
   const g=setup(),y=-198.76061291335517;
   const wp=g.novaBattlefieldWaypoint(x,y,340,-40,pad,700008);
   const len=wp&&g.novaRouteLength(x,y,340,-40,pad,700008,wp);
   const mids=g.__researchTerrain.obstacleNodes(g,x,y,340,-40,pad);
   const graph=g.__researchTerrain.planVisibilityRoute(g,x,y,340,-40,pad,700008,null);
   out.push({pad,x,firstLeg:clear(x,y,130-30-(pad+11),-35-165-(pad+11),pad-5),nodes:mids.length,graph:graph?graph.length:null,wp:wp?{x:wp.x,y:wp.y}:null,len:Number.isFinite(len)?+len.toFixed(3):null});
  }
 }
 console.log('EVEN_SEED_CLEARANCE_BOUNDARY '+JSON.stringify(out));
 assert.equal(out.length,12);
});

test('Guard-size route accepts exact tangent without crossing wall interior',()=>{
 const g=setup(),pad=24,goal=[340,-40],seed=700008,y=-198.76061291335517;
 const wp=g.novaBattlefieldWaypoint(81,y,...goal,pad,seed);
 const length=wp&&g.novaRouteLength(81,y,...goal,pad,seed,wp);
 assert.ok(Number.isFinite(length)&&length>300,'legal tangent should retain a certified detour');
 const direct=g.__researchTerrain.planVisibilityRoute(g,81,y,...goal,pad,seed,null);
 assert.ok(direct&&direct.length>=3,'full route must exist, not just a first-corner guess');
 let from=[81,y];
 for(const node of direct){
  assert.ok(clear(...from,node.x,node.y,18.999),'route may touch but must not penetrate expanded obstacle');
  from=[node.x,node.y];
 }
 const inside=setup(),bad=inside.novaBattlefieldWaypoint(82,y,...goal,pad,seed);
 const badLength=bad&&inside.novaRouteLength(82,y,...goal,pad,seed,bad);
 assert.ok(!Number.isFinite(badLength),'do not certify a start inside the full clearance envelope');
});
