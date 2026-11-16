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
