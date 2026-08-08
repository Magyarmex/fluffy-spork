/* NOVA TANKS v1.7.5 — Frame Budget
 * Performance campaign: exact terrain broad-phase, staggered predictive AI,
 * throttled swarm route planning, and low-overhead frame telemetry.
 *
 * The optimization contract is deliberately conservative:
 * - collision / LoS answers remain exact after candidate pruning;
 * - physical movement, projectile simulation and combat still run every frame;
 * - only predictive route planning is decimated, while cached steering remains live;
 * - no gameplay stat, range, damage, cooldown or evolution value changes.
 */
(function(){
'use strict';

var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.5] module registry unavailable');return;}

var VERSION='1.7.5',CODENAME='Frame Budget';
var CELL=360, AI_ROUTE_HZ=11, DRONE_ROUTE_HZ=14;
var AI_ROUTE_STEP=1/AI_ROUTE_HZ, DRONE_ROUTE_STEP=1/DRONE_ROUTE_HZ;

window.__NOVA_PERFORMANCE_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Spend frame time on combat, not repeated geometry work.',
  guarantees:[
    'Terrain line-of-sight and first-hit queries keep exact narrow-phase collision answers after spatial candidate pruning.',
    'Predictive AI routing is staggered across tanks instead of probing terrain for every AI on every frame.',
    'Controller corner planning runs at a bounded planning rate while cached waypoint steering remains frame-rate smooth.',
    'Simulation and render CPU timing are recorded with constant-memory exponential moving averages for regression diagnosis.'
  ]
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function norm(x,y){var m=Math.hypot(x,y)||1;return{x:x/m,y:y/m};}
function solidAlive(s){return !!s&&s.solid!==false&&(!s.destructible||s.hp>0);}

function segRectHit(ax,ay,bx,by,s,pad){
  pad=pad||0;
  var minx=s.x-s.w*.5-pad,maxx=s.x+s.w*.5+pad,miny=s.y-s.h*.5-pad,maxy=s.y+s.h*.5+pad;
  var dx=bx-ax,dy=by-ay,tmin=0,tmax=1,tx1,tx2,ty1,ty2;
  if(Math.abs(dx)<1e-9){if(ax<minx||ax>maxx)return null;}
  else{
    tx1=(minx-ax)/dx;tx2=(maxx-ax)/dx;if(tx1>tx2){var tq=tx1;tx1=tx2;tx2=tq;}
    if(tx1>tmin)tmin=tx1;if(tx2<tmax)tmax=tx2;if(tmin>tmax)return null;
  }
  if(Math.abs(dy)<1e-9){if(ay<miny||ay>maxy)return null;}
  else{
    ty1=(miny-ay)/dy;ty2=(maxy-ay)/dy;if(ty1>ty2){var uq=ty1;ty1=ty2;ty2=uq;}
    if(ty1>tmin)tmin=ty1;if(ty2<tmax)tmax=ty2;if(tmin>tmax)return null;
  }
  if(tmax<0||tmin>1)return null;
  var t=clamp(tmin,0,1),x=ax+dx*t,y=ay+dy*t,nx=0,ny=0,eps=2.5;
  if(Math.abs(x-minx)<eps)nx=-1;else if(Math.abs(x-maxx)<eps)nx=1;else if(Math.abs(y-miny)<eps)ny=-1;else if(Math.abs(y-maxy)<eps)ny=1;
  return{t:t,x:x,y:y,nx:nx,ny:ny};
}
function segCircleHit(ax,ay,bx,by,s,pad){
  pad=pad||0;
  var r=s.r+pad,dx=bx-ax,dy=by-ay,fx=ax-s.x,fy=ay-s.y,A=dx*dx+dy*dy;
  if(A<1e-9)return null;
  var B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-r*r,D=B*B-4*A*C;if(D<0)return null;
  D=Math.sqrt(D);var t=(-B-D)/(2*A);if(t<0||t>1){t=(-B+D)/(2*A);if(t<0||t>1)return null;}
  var x=ax+dx*t,y=ay+dy*t,l=Math.hypot(x-s.x,y-s.y)||1;
  return{t:t,x:x,y:y,nx:(x-s.x)/l,ny:(y-s.y)/l};
}
function exactHit(s,ax,ay,bx,by,pad){
  if(!solidAlive(s))return null;
  return s.shape==='circle'?segCircleHit(ax,ay,bx,by,s,pad):segRectHit(ax,ay,bx,by,s,pad);
}
function bounds(s,pad){
  pad=pad||0;
  if(s.shape==='circle'){var r=s.r+pad;return{x0:s.x-r,y0:s.y-r,x1:s.x+r,y1:s.y+r};}
  return{x0:s.x-s.w*.5-pad,y0:s.y-s.h*.5-pad,x1:s.x+s.w*.5+pad,y1:s.y+s.h*.5+pad};
}
function cellKey(x,y){return x+','+y;}
function ensureIndex(g){
  var terrain=g.__novaTerrain;if(!terrain)return null;
  var ix=g.__novaPerfTerrainIndex;
  if(ix&&ix.terrain===terrain&&ix.length===terrain.length)return ix;
  ix={terrain:terrain,length:terrain.length,cells:Object.create(null),stamp:0,cell:CELL};
  for(var i=0;i<terrain.length;i++){
    var s=terrain[i],b=bounds(s,0),x0=Math.floor(b.x0/CELL),x1=Math.floor(b.x1/CELL),y0=Math.floor(b.y0/CELL),y1=Math.floor(b.y1/CELL);
    for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){
      var k=cellKey(x,y),bucket=ix.cells[k];if(!bucket)bucket=ix.cells[k]=[];bucket.push(s);
    }
  }
  g.__novaPerfTerrainIndex=ix;
  return ix;
}
function segmentCandidates(g,ax,ay,bx,by,pad){
  var ix=ensureIndex(g);if(!ix)return null;
  pad=pad||0;
  var x0=Math.floor((Math.min(ax,bx)-pad)/CELL),x1=Math.floor((Math.max(ax,bx)+pad)/CELL),y0=Math.floor((Math.min(ay,by)-pad)/CELL),y1=Math.floor((Math.max(ay,by)+pad)/CELL);
  var cells=(x1-x0+1)*(y1-y0+1);if(cells>80)return ix.terrain;
  var out=[],stamp=++ix.stamp;if(stamp>0x3fffffff){ix.stamp=stamp=1;for(var r=0;r<ix.terrain.length;r++)ix.terrain[r].__novaPerfStamp=0;}
  for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){
    var bucket=ix.cells[cellKey(x,y)];if(!bucket)continue;
    for(var i=0;i<bucket.length;i++){var s=bucket[i];if(s.__novaPerfStamp===stamp)continue;s.__novaPerfStamp=stamp;out.push(s);}
  }
  return out;
}
function perfState(g){
  return g.__novaPerf||(g.__novaPerf={
    version:VERSION,updateMs:0,renderMs:0,updatePeakMs:0,renderPeakMs:0,
    terrainQueries:0,terrainCandidates:0,terrainNarrowTests:0,
    aiRouteFramesSkipped:0,aiRouteFramesPlanned:0,droneRouteFramesSkipped:0,droneRouteFramesPlanned:0,
    samples:0,lastSnapshotAt:0
  });
}
function ema(old,v,a){return old?old+(v-old)*a:v;}
function record(g,key,ms){
  if(!g)return;var p=perfState(g),peak=key==='updateMs'?'updatePeakMs':'renderPeakMs';
  p[key]=ema(p[key],ms,.08);p[peak]=Math.max(p[peak]*.997,ms);p.samples++;
  var now=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  if(now-p.lastSnapshotAt>2000){p.lastSnapshotAt=now;window.__NOVA_PERF_LAST__={version:VERSION,updateMs:+p.updateMs.toFixed(2),renderMs:+p.renderMs.toFixed(2),updatePeakMs:+p.updatePeakMs.toFixed(2),renderPeakMs:+p.renderPeakMs.toFixed(2),terrainQueries:p.terrainQueries,avgTerrainCandidates:p.terrainQueries?+(p.terrainCandidates/p.terrainQueries).toFixed(2):0,aiRouteFramesSkipped:p.aiRouteFramesSkipped,droneRouteFramesSkipped:p.droneRouteFramesSkipped,tanks:g.tanks?g.tanks.length:0,drones:g.drones?g.drones.length:0,bullets:g.bullets?g.bullets.length:0,shapes:g.shapes?g.shapes.length:0};}
}
function callWithoutFirstHit(g,fn,a,b,c,d){
  var own=Object.prototype.hasOwnProperty.call(g,'firstTerrainHit'),prev=g.firstTerrainHit;
  g.firstTerrainHit=null;
  try{return fn.call(g,a,b,c,d);}finally{if(own)g.firstTerrainHit=prev;else delete g.firstTerrainHit;}
}

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaFrameBudget)return;
  Game.prototype.__novaFrameBudget=true;

  var oldLOS=Game.prototype.hasLineOfSight,oldFirst=Game.prototype.firstTerrainHit;
  if(oldLOS)Game.prototype.hasLineOfSight=function(ax,ay,bx,by,pad){
    if(!this.__novaTerrain){var init=oldLOS.call(this,ax,ay,bx,by,pad);if(!this.__novaTerrain)return init;}
    var list=segmentCandidates(this,ax,ay,bx,by,pad||2);if(!list)return oldLOS.call(this,ax,ay,bx,by,pad);
    var p=perfState(this);p.terrainQueries++;p.terrainCandidates+=list.length;
    for(var i=0;i<list.length;i++){p.terrainNarrowTests++;var h=exactHit(list[i],ax,ay,bx,by,pad||2);if(h&&h.t>0.015&&h.t<1.01)return false;}
    return true;
  };
  if(oldFirst)Game.prototype.firstTerrainHit=function(ax,ay,bx,by,pad){
    if(!this.__novaTerrain){var init=oldFirst.call(this,ax,ay,bx,by,pad);if(!this.__novaTerrain)return init;}
    var list=segmentCandidates(this,ax,ay,bx,by,pad||0);if(!list)return oldFirst.call(this,ax,ay,bx,by,pad);
    var p=perfState(this),best=null;p.terrainQueries++;p.terrainCandidates+=list.length;
    for(var i=0;i<list.length;i++){p.terrainNarrowTests++;var s=list[i],h=exactHit(s,ax,ay,bx,by,pad||0);if(h&&(!best||h.t<best.hit.t))best={solid:s,hit:h};}
    return best;
  };

  /* The Combined Arms wrapper probes ahead on every moveTank call. Keep its
   * cached waypoint steering every frame, but only permit a fresh probe at a
   * staggered planning cadence. Physical Battlefield collision remains 60 Hz. */
  var oldMove=Game.prototype.moveTank;
  if(oldMove)Game.prototype.moveTank=function(t,vx,vy,dt){
    if(!t||t.isPlayer||!t.ai||!this.firstTerrainHit)return oldMove.call(this,t,vx,vy,dt);
    var a=t.ai,now=this.time||0,next=a.__novaPerfRouteProbeAt;
    if(next==null){a.__novaPerfRouteProbeAt=now+.018+((Math.abs(t.id||0)%6)*.011);perfState(this).aiRouteFramesSkipped++;return callWithoutFirstHit(this,oldMove,t,vx,vy,dt);}
    if(now+1e-6<next){perfState(this).aiRouteFramesSkipped++;return callWithoutFirstHit(this,oldMove,t,vx,vy,dt);}
    a.__novaPerfRouteProbeAt=now+AI_ROUTE_STEP+((Math.abs(t.id||0)%3)*.004);perfState(this).aiRouteFramesPlanned++;
    return oldMove.call(this,t,vx,vy,dt);
  };

  /* Drone path planning is a tactical decision, not a physics integration.
   * Re-plan at 14 Hz; on skipped frames keep the last waypoint's steering
   * correction so movement stays visually continuous. */
  var oldDrones=Game.prototype.updateDrones;
  function steerCachedDrones(g,dt){
    if(!g.drones)return;
    for(var i=0;i<g.drones.length;i++){
      var d=g.drones[i],wp=d&&d.__v172Waypoint;if(!d||!wp||d.hp<=0||d.__novaSpotter||d.__novaPhase==='dash')continue;
      if((d.__v172WaypointUntil||0)<(g.time||0)||d2(d.x,d.y,wp.x,wp.y)<24*24){d.__v172Waypoint=null;d.__v172Routing=false;continue;}
      var q=norm(wp.x-d.x,wp.y-d.y),speed=Math.max(80,Math.hypot(d.__novaVX||0,d.__novaVY||0));
      d.__novaVX=(d.__novaVX||0)*.42+q.x*speed*.58;d.__novaVY=(d.__novaVY||0)*.42+q.y*speed*.58;
      d.x+=q.x*22*dt;d.y+=q.y*22*dt;d.__v172Routing=true;
    }
  }
  if(oldDrones)Game.prototype.updateDrones=function(dt){
    var now=this.time||0,next=this.__novaPerfDronePlanAt;
    if(next==null)this.__novaPerfDronePlanAt=next=now;
    if(now+1e-6>=next){this.__novaPerfDronePlanAt=now+DRONE_ROUTE_STEP;perfState(this).droneRouteFramesPlanned++;return oldDrones.call(this,dt);}
    perfState(this).droneRouteFramesSkipped++;
    var out=callWithoutFirstHit(this,oldDrones,dt);steerCachedDrones(this,dt);return out;
  };

  var oldUpdate=Game.prototype.update;
  if(oldUpdate)Game.prototype.update=function(dt){var st=performance.now(),out=oldUpdate.call(this,dt);record(this,'updateMs',performance.now()-st);return out;};

  Game.prototype.novaPerfSnapshot=function(){
    var p=perfState(this);return{version:VERSION,updateMs:p.updateMs,renderMs:p.renderMs,updatePeakMs:p.updatePeakMs,renderPeakMs:p.renderPeakMs,terrainQueries:p.terrainQueries,terrainCandidates:p.terrainCandidates,terrainNarrowTests:p.terrainNarrowTests,aiRouteFramesSkipped:p.aiRouteFramesSkipped,aiRouteFramesPlanned:p.aiRouteFramesPlanned,droneRouteFramesSkipped:p.droneRouteFramesSkipped,droneRouteFramesPlanned:p.droneRouteFramesPlanned};
  };
});

wrap('game/render',function(render){
  var old=render.render;if(!old||old.__novaFrameBudget)return;
  function patched(g,w,h){var st=performance.now(),out=old(g,w,h);record(g,'renderMs',performance.now()-st);return out;}
  patched.__novaFrameBudget=true;render.render=patched;
});

window.__NOVA_PERFORMANCE_TEST__={
  cellSize:CELL,aiRouteHz:AI_ROUTE_HZ,droneRouteHz:DRONE_ROUTE_HZ,
  segRectHit:segRectHit,segCircleHit:segCircleHit,
  candidateCount:function(g,ax,ay,bx,by,pad){var a=segmentCandidates(g,ax,ay,bx,by,pad||0);return a?a.length:0;}
};
window.NovaPerf={snapshot:function(game){return game&&game.novaPerfSnapshot?game.novaPerfSnapshot():window.__NOVA_PERF_LAST__||null;}};

console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' performance layer online');
})();
