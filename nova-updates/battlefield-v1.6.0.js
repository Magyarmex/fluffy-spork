/* NOVA TANKS v1.6.0  Battlefield
 * Terrain, line-of-sight, destructible cover, tactical lanes, AI pathing,
 * spawn safety, drone/spotter terrain interaction, battlefield rendering and SFX.
 * Performance hardening: exact spatial broad-phase for every private terrain hot path.
 */
(function(){
'use strict';
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.6.0] module registry unavailable');return;}
var VERSION='1.6.0', CODENAME='Battlefield', MAP_LIMIT=2250, TAU=Math.PI*2, TERRAIN_CELL=360;
window.__NOVA_BATTLEFIELD_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'The arena becomes a battlefield: cover, lanes, line-of-sight and breachable ground.',
  groups:{
    'Battlefield Geometry':[
      'The open arena is replaced by one of three mirrored tactical battlefield layouts built from permanent walls, pillars and destructible cover.',
      'Layouts preserve broad movement space while creating sniper lanes, flank routes, protected crossings, choke points and contested central approaches.',
      'Spawn positions for tanks, shapes and powerups are terrain-aware and avoid materializing inside solid geometry.'
    ],
    'Line of Sight and Projectiles':[
      'Solid terrain blocks automatic target acquisition and AI firing solutions. Snipers still need ordinary direct sight or a valid Observer relay, but neither hull nor Observer can see through walls.',
      'Projectile-to-terrain collision uses swept segment tests so hypervelocity rounds cannot tunnel through thin cover between frames.',
      'Permanent fortifications stop projectiles; destructible barricades absorb damage, crack visibly, can be breached, and leave non-blocking rubble.',
      'High-penetration rounds can punch through a barricade only when the impact actually destroys it and the projectile retains enough integrity.'
    ],
    'Movement and AI':[
      'Tanks, drones and neutral shapes collide with battlefield geometry instead of ghosting through it.',
      'Collision resolves into sliding rather than hard stopping so the twin-stick movement grammar remains fluid around corners.',
      'AI loses firing permission through occlusion, remembers recent cover contacts briefly, and changes strafe/path intent after repeated terrain bumps instead of endlessly pushing into a wall.',
      'Controller drones are terrain-constrained during formation, farming, defense and committed attack runs; wall impacts abort impossible dives and create recovery rather than jitter loops.'
    ],
    'Sniper and Controller Integration':[
      'Forward Observers require real terrain line-of-sight for a contact relay. Cover can therefore break the reconnaissance chain without destroying the spotter.',
      'Observer suspicion remains useful: scouts can search around likely activity, but terrain denies the actual contact until the target enters the cone with unobstructed sight.',
      'Controller Command Nodes may be placed beyond cover, but drones must physically route/slide around obstacles and cannot deal attack-run damage through walls.'
    ],
    'Presentation and Tactics':[
      'Fortifications receive layered shadows, neon rim lighting, breach cracks, impact flashes and persistent rubble so the arena reads as constructed space rather than invisible collision boxes.',
      'A compact tactical battlefield strip identifies the current layout and communicates cover status without adding another control surface.',
      'Added procedural cover-impact, breach and scrape sounds plus restrained camera/particle feedback for heavy terrain hits.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function segRectHit(ax,ay,bx,by,s,pad){
  pad=pad||0;var minx=s.x-s.w*.5-pad,maxx=s.x+s.w*.5+pad,miny=s.y-s.h*.5-pad,maxy=s.y+s.h*.5+pad;
  var dx=bx-ax,dy=by-ay,t0=0,t1=1;
  function slab(p,q){if(Math.abs(p)<1e-9)return q>=0;var z=q/p;if(p<0){if(z>t1)return false;if(z>t0)t0=z;}else{if(z<t0)return false;if(z<t1)t1=z;}return true;}
  if(!slab(-dx,ax-minx)||!slab(dx,maxx-ax)||!slab(-dy,ay-miny)||!slab(dy,maxy-ay))return null;
  var t=clamp(t0,0,1),x=ax+dx*t,y=ay+dy*t,nx=0,ny=0,eps=2.5;
  if(Math.abs(x-minx)<eps)nx=-1;else if(Math.abs(x-maxx)<eps)nx=1;else if(Math.abs(y-miny)<eps)ny=-1;else if(Math.abs(y-maxy)<eps)ny=1;
  return {t:t,x:x,y:y,nx:nx,ny:ny};
}
function segCircleHit(ax,ay,bx,by,s,pad){
  var r=s.r+(pad||0),dx=bx-ax,dy=by-ay,fx=ax-s.x,fy=ay-s.y,A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-r*r,D=B*B-4*A*C;if(D<0||A<1e-9)return null;D=Math.sqrt(D);var t=(-B-D)/(2*A);if(t<0||t>1){t=(-B+D)/(2*A);if(t<0||t>1)return null;}var x=ax+dx*t,y=ay+dy*t,l=Math.hypot(x-s.x,y-s.y)||1;return{t:t,x:x,y:y,nx:(x-s.x)/l,ny:(y-s.y)/l};
}
function solidAlive(s){return !!s&&s.solid!==false&&(!s.destructible||s.hp>0);}
function solidHit(s,ax,ay,bx,by,pad){if(!solidAlive(s))return null;return s.shape==='circle'?segCircleHit(ax,ay,bx,by,s,pad||0):segRectHit(ax,ay,bx,by,s,pad||0);}
function pointInsideSolid(s,x,y,pad){if(!solidAlive(s))return false;pad=pad||0;if(s.shape==='circle'){var r=s.r+pad;return d2(x,y,s.x,s.y)<=r*r;}return Math.abs(x-s.x)<=s.w*.5+pad&&Math.abs(y-s.y)<=s.h*.5+pad;}
/* A projectile spawned exactly on a wall/pillar face may leave or skim it.
 * Never excuse a genuinely embedded origin or a segment entering solid space. */
function outwardFaceTravel(s,ax,ay,bx,by,pad){
 if(!solidAlive(s)||pointInsideSolid(s,ax,ay,-1e-6))return false;
 var dx=bx-ax,dy=by-ay;if(dx*dx+dy*dy<1e-18)return false;
 /* Preserve the existing padded-origin contract: overlap *near* a wall
  * still collides. Only the exact physical face may release outward. */
 var eps=1e-7;
 if(s.shape==='circle'){
   var fx=ax-s.x,fy=ay-s.y;
   return Math.abs(Math.hypot(fx,fy)-s.r)<=eps&&fx*dx+fy*dy>=0;
 }
 var hx=s.w*.5,hy=s.h*.5;
 return (Math.abs(ax-(s.x+hx))<=eps&&dx>=0)||
        (Math.abs(ax-(s.x-hx))<=eps&&dx<=0)||
        (Math.abs(ay-(s.y+hy))<=eps&&dy>=0)||
        (Math.abs(ay-(s.y-hy))<=eps&&dy<=0);
}
function addRect(a,id,x,y,w,h,type,hp){a.push({id:id,kind:'terrain',shape:'rect',x:x,y:y,w:w,h:h,type:type,destructible:type==='cover',hp:hp||0,maxHp:hp||0,solid:true,flash:0,brokenAt:0});}
function addCircle(a,id,x,y,r,type,hp){a.push({id:id,kind:'terrain',shape:'circle',x:x,y:y,r:r,type:type,destructible:type==='cover',hp:hp||0,maxHp:hp||0,solid:true,flash:0,brokenAt:0});}
function txPoint(p,rot,mirror){var x=p[0]*(mirror?-1:1),y=p[1];for(var i=0;i<rot;i++){var q=x;x=-y;y=q;}return[x,y];}
function txRect(x,y,w,h,rot,mirror){var p=txPoint([x,y],rot,mirror);if(rot%2){var q=w;w=h;h=q;}return[p[0],p[1],w,h];}
var TEMPLATES=[
 {name:'CROSSFIRE',desc:'Four fortified approaches surround an exposed central crossing.',build:function(a,rot,mir){var id=1,r;
   [[0,-690,520,92],[0,690,520,92],[-690,0,92,520],[690,0,92,520],[-1180,-470,82,520],[-1180,470,82,520],[1180,-470,82,520],[1180,470,82,520]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'wall');});
   [[-470,-470,92],[470,-470,92],[-470,470,92],[470,470,92]].forEach(function(v){var p=txPoint(v,rot,mir);addCircle(a,id++,p[0],p[1],v[2],'pillar');});
   [[-250,-250,180,60],[250,-250,180,60],[-250,250,180,60],[250,250,180,60],[-920,0,65,210],[920,0,65,210],[0,-920,210,65],[0,920,210,65]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'cover',300);});
 }},
 {name:'SPLIT HORIZON',desc:'Two long spines create dangerous sightlines with wide exterior flanks.',build:function(a,rot,mir){var id=1,r;
   [[-520,-760,90,680],[-520,0,90,450],[-520,760,90,680],[520,-760,90,680],[520,0,90,450],[520,760,90,680]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'wall');});
   [[0,-520,105],[0,520,105],[-1060,-1060,95],[1060,1060,95]].forEach(function(v){var p=txPoint(v,rot,mir);addCircle(a,id++,p[0],p[1],v[2],'pillar');});
   [[-260,-500,190,65],[260,-500,190,65],[-260,500,190,65],[260,500,190,65],[-1160,0,240,70],[1160,0,240,70],[0,-1180,70,240],[0,1180,70,240]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'cover',330);});
 }},
 {name:'FOUR GATES',desc:'A central bastion creates four gates, side pockets and rotating flank pressure.',build:function(a,rot,mir){var id=1,r;
   [[0,-430,390,90],[0,430,390,90],[-430,0,90,390],[430,0,90,390],[-1080,-640,420,80],[1080,640,420,80],[-1080,640,420,80],[1080,-640,420,80]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'wall');});
   [[-250,-250,76],[250,-250,76],[-250,250,76],[250,250,76]].forEach(function(v){var p=txPoint(v,rot,mir);addCircle(a,id++,p[0],p[1],v[2],'pillar');});
   [[0,-760,240,62],[0,760,240,62],[-760,0,62,240],[760,0,62,240],[-1320,-260,180,64],[1320,260,180,64],[-1320,260,180,64],[1320,-260,180,64]].forEach(function(v){r=txRect(v[0],v[1],v[2],v[3],rot,mir);addRect(a,id++,r[0],r[1],r[2],r[3],'cover',290);});
 }}
];
function ensureTerrain(g){
 if(g.__novaTerrain)return g.__novaTerrain;
 var raw=((Date.now()>>>8)^(Math.random()*0x7fffffff))>>>0,idx=raw%TEMPLATES.length,rot=(raw>>>3)%4,mir=((raw>>>5)&1)!==0,a=[];
 TEMPLATES[idx].build(a,rot,mir);
 for(var i=0;i<a.length;i++)a[i].id=-(i+1000);
 var total=0;for(var j=0;j<a.length;j++)if(a[j].destructible)total++;
 g.__novaTerrain=a;g.__novaTerrainRubble=[];g.__novaBattlefield={name:TEMPLATES[idx].name,desc:TEMPLATES[idx].desc,seed:raw,announced:false,coverTotal:total,coverBroken:0};
 return a;
}

/* Exact broad phase. Terrain itself is static in position; destroyed cover only
 * toggles solidity, so the cell index is built once and stays valid all run. */
function terrainIndex(g){
 var a=ensureTerrain(g),ix=g.__novaBattlefieldIndex;if(ix&&ix.terrain===a&&ix.length===a.length)return ix;
 ix={terrain:a,length:a.length,cells:new Map(),scratch:[],stamp:0};
 for(var i=0;i<a.length;i++){
   var s=a[i],r=s.shape==='circle'?s.r:0,x0=s.shape==='circle'?s.x-r:s.x-s.w*.5,x1=s.shape==='circle'?s.x+r:s.x+s.w*.5,y0=s.shape==='circle'?s.y-r:s.y-s.h*.5,y1=s.shape==='circle'?s.y+r:s.y+s.h*.5;
   var cx0=Math.floor(x0/TERRAIN_CELL),cx1=Math.floor(x1/TERRAIN_CELL),cy0=Math.floor(y0/TERRAIN_CELL),cy1=Math.floor(y1/TERRAIN_CELL);
   for(var cx=cx0;cx<=cx1;cx++)for(var cy=cy0;cy<=cy1;cy++){var k=cx*10000+cy,b=ix.cells.get(k);if(!b){b=[];ix.cells.set(k,b);}b.push(s);}
 }
 g.__novaBattlefieldIndex=ix;return ix;
}
function terrainCandidates(g,x0,y0,x1,y1,pad){
 var ix=terrainIndex(g),p=pad||0,cx0=Math.floor((Math.min(x0,x1)-p)/TERRAIN_CELL),cx1=Math.floor((Math.max(x0,x1)+p)/TERRAIN_CELL),cy0=Math.floor((Math.min(y0,y1)-p)/TERRAIN_CELL),cy1=Math.floor((Math.max(y0,y1)+p)/TERRAIN_CELL);
 if((cx1-cx0+1)*(cy1-cy0+1)>80)return ix.terrain;
 var out=ix.scratch;out.length=0;var stamp=++ix.stamp;if(stamp>0x3fffffff){ix.stamp=stamp=1;for(var z=0;z<ix.terrain.length;z++)ix.terrain[z].__novaBattlefieldStamp=0;}
 for(var cx=cx0;cx<=cx1;cx++)for(var cy=cy0;cy<=cy1;cy++){var b=ix.cells.get(cx*10000+cy);if(!b)continue;for(var i=0;i<b.length;i++){var s=b[i];if(s.__novaBattlefieldStamp===stamp)continue;s.__novaBattlefieldStamp=stamp;out.push(s);}}
 var perf=g.__novaPerf;if(perf){perf.battlefieldQueries=(perf.battlefieldQueries||0)+1;perf.battlefieldCandidates=(perf.battlefieldCandidates||0)+out.length;}
 return out;
}
function safePoint(g,x,y,pad){pad=pad||40;var a=terrainCandidates(g,x,y,x,y,pad);for(var i=0;i<a.length;i++)if(pointInsideSolid(a[i],x,y,pad))return false;return true;}

/* Find the first clear Phase landing on the chord from the blocked intended
 * endpoint back toward departure. A fixed-distance scan can leap over a
 * legitimate narrow gap between two padded solids. Intervals describe the
 * exact blocked portion of this one chord, not the teleport travel path. */
function nearestPhaseLanding(g,ax,ay,bx,by,pad){
 var dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
 if(!(len>=24))return null;
 var solids=terrainCandidates(g,ax,ay,bx,by,pad),intervals=[];
 for(var i=0;i<solids.length;i++){
   var s=solids[i];if(!solidAlive(s))continue;
   var a=0,b=1;
   if(s.shape==='circle'){
     var fx=ax-s.x,fy=ay-s.y,rr=s.r+pad,A=dx*dx+dy*dy;
     var B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr,D=B*B-4*A*C;
     if(D<0)continue;
     var root=Math.sqrt(D);
     a=Math.max(0,(-B-root)/(2*A));
     b=Math.min(1,(-B+root)/(2*A));
   }else{
     var minx=s.x-s.w*.5-pad,maxx=s.x+s.w*.5+pad;
     var miny=s.y-s.h*.5-pad,maxy=s.y+s.h*.5+pad;
     var p0,p1,tmp;
     if(Math.abs(dx)<1e-12){if(ax<minx||ax>maxx)continue;}
     else{
       p0=(minx-ax)/dx;p1=(maxx-ax)/dx;
       if(p0>p1){tmp=p0;p0=p1;p1=tmp;}
       a=Math.max(a,p0);b=Math.min(b,p1);
     }
     if(Math.abs(dy)<1e-12){if(ay<miny||ay>maxy)continue;}
     else{
       p0=(miny-ay)/dy;p1=(maxy-ay)/dy;
       if(p0>p1){tmp=p0;p0=p1;p1=tmp;}
       a=Math.max(a,p0);b=Math.min(b,p1);
     }
   }
   if(a<=b&&b>=0&&a<=1)intervals.push([Math.max(0,a),Math.min(1,b)]);
 }
 intervals.sort(function(a,b){return a[0]-b[0];});
 var blockedUntil=0;
 for(var k=0;k<=intervals.length;k++){
   var next=k<intervals.length?intervals[k]:null;
   if(next&&next[0]<=blockedUntil+1e-12){
     if(next[1]>blockedUntil)blockedUntil=next[1];
     continue;
   }
   var gapEnd=next?next[0]:1;
   if(gapEnd>blockedUntil){
     var f=blockedUntil+Math.min(.02/len,(gapEnd-blockedUntil)*.5);
     if(len*(1-f)<24)return null;
     var x=ax+dx*f,y=ay+dy*f;
     if(safePoint(g,x,y,pad))return{x:x,y:y};
   }
   if(next&&next[1]>blockedUntil)blockedUntil=next[1];
 }
 return null;
}

/* An entity may start inside cover before its movement collision recovery.
 * Physical interior always occludes; a point exactly on the physical face may
 * look outward or along the face, but not through it. The tiny inset is solely
 * for distinguishing a boundary touch from travel through actual solid space. */
function lineOfSight(g,ax,ay,bx,by,pad){
  pad=pad||1;
  var a=terrainCandidates(g,ax,ay,bx,by,pad);
  for(var i=0;i<a.length;i++){
    var s=a[i];
    if(pointInsideSolid(s,ax,ay,1e-6)){
      if(pointInsideSolid(s,ax,ay,-1e-6)||solidHit(s,ax,ay,bx,by,-1e-6))return false;
      continue;
    }
    var h=solidHit(s,ax,ay,bx,by,pad);
    if(h&&h.t>0.015&&h.t<1.01)return false;
    /* A padded hit near the origin was historically ignored. It can still
     * cross physical cover. A circle with both endpoints inside its padded
     * radius may have no padded boundary crossing at all. */
    if(((h&&h.t<=0.015)||(!h&&s.shape==='circle'&&(pointInsideSolid(s,ax,ay,pad)||pointInsideSolid(s,bx,by,pad))))&&solidHit(s,ax,ay,bx,by,-1e-6))return false;
  }
  return true;
}
function firstSolidHit(g,ax,ay,bx,by,pad){pad=pad||0;var a=terrainCandidates(g,ax,ay,bx,by,pad),bestS=null,bestH=null;for(var i=0;i<a.length;i++){var s=a[i],h=s.shape==='circle'&&pointInsideSolid(s,ax,ay,pad)?{t:0,x:ax,y:ay,nx:0,ny:0}:solidHit(s,ax,ay,bx,by,pad);if(h&&h.t===0&&outwardFaceTravel(s,ax,ay,bx,by,pad))continue;if(h&&(!bestH||h.t<bestH.t)){bestS=s;bestH=h;}}return bestH?{solid:bestS,hit:bestH}:null;}
function circleResolve(g,e,r){
 var hitAny=false,lastNx=0,lastNy=0;
 for(var pass=0;pass<2;pass++){
   var a=terrainCandidates(g,e.x,e.y,e.x,e.y,r);
   for(var i=0;i<a.length;i++){var s=a[i];if(!solidAlive(s))continue;
     if(s.shape==='circle'){
       var dx=e.x-s.x,dy=e.y-s.y,dist=Math.hypot(dx,dy),min=s.r+r;if(dist<min){if(dist<1e-4){dx=1;dy=0;dist=1;}var nx=dx/dist,ny=dy/dist,p=min-dist+0.35;e.x+=nx*p;e.y+=ny*p;lastNx=nx;lastNy=ny;hitAny=true;}
     }else{
       var minx=s.x-s.w*.5-r,maxx=s.x+s.w*.5+r,miny=s.y-s.h*.5-r,maxy=s.y+s.h*.5+r;if(e.x<=minx||e.x>=maxx||e.y<=miny||e.y>=maxy)continue;
       var dl=e.x-minx,dr=maxx-e.x,dt=e.y-miny,db=maxy-e.y,m=Math.min(dl,dr,dt,db),rx=0,ry=0;if(m===dl){e.x=minx;rx=-1;}else if(m===dr){e.x=maxx;rx=1;}else if(m===dt){e.y=miny;ry=-1;}else{e.y=maxy;ry=1;}lastNx=rx;lastNy=ry;hitAny=true;
     }
   }
 }
 if(hitAny){var dot=(e.vx||0)*lastNx+(e.vy||0)*lastNy;if(dot<0){e.vx-=lastNx*dot;e.vy-=lastNy*dot;}var n=e.__novaTerrainBump||(e.__novaTerrainBump={x:0,y:0});n.x=lastNx;n.y=lastNy;e.__novaTerrainBumpT=.22;}
 return hitAny;
}
function damageCover(g,s,dmg,ownerId,x,y,bullet){if(!s||!s.destructible||s.hp<=0)return false;var mult=bullet&&bullet.shell?1.35:bullet&&bullet.beam?.92:1;s.hp-=dmg*mult;s.flash=.16;if(g.addImpactDebris)g.addImpactDebris(x,y,bullet?bullet.vx:0,bullet?bullet.vy:0,'#8fd4ff',4);if(g.sfx&&g.sfx.novaCoverHit)g.sfx.novaCoverHit((x-(g.player?g.player.x:x))/700,Math.min(1,dmg/70));if(s.hp<=0){s.hp=0;s.solid=false;s.brokenAt=g.time;(g.__novaTerrainRubble||(g.__novaTerrainRubble=[])).push({x:s.x,y:s.y,w:s.w||s.r*2,h:s.h||s.r*2,r:s.r||0,shape:s.shape,life:999});if(g.addParticles)g.addParticles(s.x,s.y,'#8fd4ff',16,180,'spark');if(g.addRing)g.addRing(s.x,s.y,'#8fd4ff',Math.min(100,(s.w||s.r*2)*.45));if(g.sfx&&g.sfx.novaCoverBreak)g.sfx.novaCoverBreak((s.x-(g.player?g.player.x:s.x))/700);if(g.__novaBattlefield)g.__novaBattlefield.coverBroken++;var killer=ownerId>=0&&g.getTank?g.getTank(ownerId):null;if(killer&&killer.alive){if(g.gainXP)g.gainXP(killer,18);if(killer.isPlayer&&g.addText)g.addText(s.x,s.y-24,'BREACHED +18','#9fe8ff',10);}return true;}return false;}
/* A terrain-triggered shell burst creates its children during the pre-core
 * projectile pass. Only outward-facing children may clear the collision
 * padding of the surface they were born against. Inward fragments still hit
 * the wall; a later obstacle is tested normally in this same pass. */
function clearTerrainBurstChildren(g,s,h,start){
 if(!solidAlive(s)||!g.bullets)return;
 var nx=h.nx||0,ny=h.ny||0;if(nx*nx+ny*ny<.5)return;
 var cornerX=false,cornerY=false;
 if(s.shape==='rect'){
   /* A nearby *interior* coordinate is not an exposed second face:
    * clearing it would teleport fragments across solid cover. */
   cornerX=Math.abs(Math.abs(h.x-s.x)-s.w*.5)<=2.5&&Math.abs(h.x-s.x)>=s.w*.5-1e-7;
   cornerY=Math.abs(Math.abs(h.y-s.y)-s.h*.5)<=2.5&&Math.abs(h.y-s.y)>=s.h*.5-1e-7;
 }
 for(var i=start;i<g.bullets.length;i++){
   var child=g.bullets[i];if(!child||child.dead||child.shell)continue;
   var cx=nx,cy=ny;
   /* At a corner either exposed face can provide a legal exit. */
   if(cornerX&&cornerY){
     var sx=Math.sign(h.x-s.x),sy=Math.sign(h.y-s.y);
     if((child.vx||0)*sx>=0){cx=sx;cy=0;}
     else if((child.vy||0)*sy>=0){cx=0;cy=sy;}
     else continue;
   }
   if((child.vx||0)*cx+(child.vy||0)*cy<0)continue;
   var pad=(child.r||2)*.45;
   if(!pointInsideSolid(s,child.x,child.y,pad))continue;
   if(s.shape==='circle'){
     var dx=child.x-s.x,dy=child.y-s.y,dist=Math.hypot(dx,dy);
     if(dist<1e-9)continue;
     var radius=s.r+pad+.01;
     child.x=s.x+dx/dist*radius;child.y=s.y+dy/dist*radius;
   }else if(cx){
     child.x=s.x+cx*(s.w*.5+pad+.01);
   }else{
     child.y=s.y+cy*(s.h*.5+pad+.01);
   }
   child.px=child.x;child.py=child.y;
 }
}
function terrainRadiusForTank(t,classes){return ((classes[t.cls]&&classes[t.cls].size)||15)+3;}
function drawTerrain(ctx,g,w,h){var a=ensureTerrain(g),z=(g.cam&&g.cam.zoom)||1,camx=g.cam.x,camy=g.cam.y,hw=g.w*.5,hhw=g.h*.5;
 ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);
 for(var i=0;i<a.length;i++){var s=a[i];if(!solidAlive(s))continue;var px=(s.x-camx)*z+hw,py=(s.y-camy)*z+hhw,ww=(s.w||s.r*2)*z,hh=(s.h||s.r*2)*z;if(px+ww*.6<-30||px-ww*.6>w+30||py+hh*.6<-30||py-hh*.6>h+30)continue;var frac=s.destructible?clamp(s.hp/s.maxHp,0,1):1;
   ctx.save();ctx.translate(px,py);ctx.globalAlpha=.98;
   ctx.shadowColor='rgba(0,0,0,.75)';ctx.shadowBlur=18*z;ctx.shadowOffsetY=8*z;
   var grad=ctx.createLinearGradient(-ww*.5,-hh*.5,ww*.5,hh*.5);if(s.destructible){grad.addColorStop(0,'rgba(19,50,69,.97)');grad.addColorStop(1,'rgba(8,22,34,.99)');}else{grad.addColorStop(0,'rgba(24,33,53,.99)');grad.addColorStop(1,'rgba(7,12,24,.99)');}ctx.fillStyle=grad;ctx.strokeStyle=s.destructible?'rgba(111,220,255,'+(0.24+0.36*frac)+')':'rgba(142,165,210,.34)';ctx.lineWidth=Math.max(1,1.4*z);
   if(s.shape==='circle'){ctx.beginPath();ctx.arc(0,0,s.r*z,0,TAU);ctx.fill();ctx.stroke();}else{var rr=Math.min(12*z,Math.min(ww,hh)*.16);ctx.beginPath();ctx.roundRect(-ww*.5,-hh*.5,ww,hh,rr);ctx.fill();ctx.stroke();}
   ctx.shadowBlur=0;ctx.globalCompositeOperation='lighter';ctx.strokeStyle=s.destructible?'rgba(77,227,255,'+(0.08+frac*.12)+')':'rgba(176,107,255,.08)';ctx.lineWidth=Math.max(1,z);if(s.shape==='circle'){ctx.beginPath();ctx.arc(0,0,s.r*z*.83,0,TAU);ctx.stroke();}else{ctx.strokeRect(-ww*.43,-hh*.34,ww*.86,hh*.68);}
   if(s.destructible&&frac<.78){ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(197,235,255,'+(0.28+(1-frac)*.42)+')';ctx.lineWidth=Math.max(.8,z);var cracks=Math.min(5,1+Math.floor((1-frac)*6));for(var c=0;c<cracks;c++){var phase=(c*1.73+s.id*.41),cx=Math.sin(phase)*ww*.27,cy=Math.cos(phase*.7)*hh*.22;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(phase)*ww*.16,cy+Math.sin(phase)*hh*.18);ctx.lineTo(cx+Math.cos(phase+.8)*ww*.25,cy+Math.sin(phase+.8)*hh*.25);ctx.stroke();}}
   if(s.flash>0){ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(180,235,255,'+clamp(s.flash*3,0,.6)+')';if(s.shape==='circle'){ctx.beginPath();ctx.arc(0,0,s.r*z,0,TAU);ctx.fill();}else ctx.fillRect(-ww*.5,-hh*.5,ww,hh);}
   ctx.restore();
 }
 var rubble=g.__novaTerrainRubble||[];for(var j=0;j<rubble.length;j++){var rb=rubble[j],rpx=(rb.x-camx)*z+hw,rpy=(rb.y-camy)*z+hhw,rw=(rb.w||rb.r*2)*z,rh=(rb.h||rb.r*2)*z;if(rpx+rw*.6<-25||rpx-rw*.6>w+25||rpy+rh*.6<-25||rpy-rh*.6>h+25)continue;ctx.save();ctx.translate(rpx,rpy);ctx.globalAlpha=.46;ctx.strokeStyle='rgba(98,156,177,.28)';ctx.fillStyle='rgba(15,28,38,.38)';if(rb.shape==='circle'){ctx.beginPath();ctx.arc(0,0,rb.r*z*.9,0,TAU);ctx.fill();ctx.stroke();}else{ctx.fillRect(-rw*.47,-rh*.40,rw*.94,rh*.80);ctx.strokeRect(-rw*.47,-rh*.40,rw*.94,rh*.80);}ctx.restore();}
 if(g.__novaBattlefield){var b=g.__novaBattlefield,remaining=Math.max(0,b.coverTotal-b.coverBroken);ctx.save();ctx.globalAlpha=.88;ctx.fillStyle='rgba(3,9,18,.70)';ctx.strokeStyle='rgba(125,243,255,.25)';ctx.lineWidth=1;var sw=Math.min(218,w*.56),sx=w*.5-sw*.5,sy=44;ctx.beginPath();ctx.roundRect(sx,sy,sw,22,8);ctx.fill();ctx.stroke();ctx.fillStyle='#9fdff0';ctx.font='700 8px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText('BATTLEFIELD · '+b.name+'   COVER '+remaining+'/'+b.coverTotal,w*.5,sy+14);ctx.restore();}
 ctx.restore();
}

wrap('game/audio',function(audio){var Sfx=audio.Sfx;if(!Sfx||Sfx.prototype.__novaBattlefieldAudio)return;Sfx.prototype.__novaBattlefieldAudio=true;
 function tone(self,f0,f1,dur,gain,pan,type){if(self.muted)return;self.resume();if(!self.ctx||!self.master)return;var c=self.ctx,t=c.currentTime,o=c.createOscillator(),gg=c.createGain(),p=null;o.type=type||'triangle';o.frequency.setValueAtTime(Math.max(30,f0),t);o.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);gg.gain.setValueAtTime(Math.max(.0001,gain),t);gg.gain.exponentialRampToValueAtTime(.0001,t+dur);if(c.createStereoPanner){p=c.createStereoPanner();p.pan.value=clamp(pan||0,-1,1);o.connect(gg).connect(p).connect(self.master);}else o.connect(gg).connect(self.master);o.start(t);o.stop(t+dur+.02);}
 Sfx.prototype.novaCoverHit=function(pan,power){var now=performance.now();if(this.__novaCoverHitT&&now-this.__novaCoverHitT<55)return;this.__novaCoverHitT=now;tone(this,190,82,.085,.018+.024*(power||.3),pan,'square');tone(this,920,340,.04,.008,pan,'triangle');};
 Sfx.prototype.novaCoverBreak=function(pan){tone(this,150,44,.24,.055,pan,'sawtooth');tone(this,680,110,.17,.025,pan,'square');};
 Sfx.prototype.novaTerrainScrape=function(pan){var now=performance.now();if(this.__novaScrapeT&&now-this.__novaScrapeT<220)return;this.__novaScrapeT=now;tone(this,120,90,.06,.009,pan,'triangle');};
});

wrap('game/engine',function(engine,require){var Game=engine.Game;if(!Game||Game.prototype.__novaBattlefield)return;Game.prototype.__novaBattlefield=true;var CLASSES=require('./classes').CLASSES;
 /* A shell can retain penetration after a direct hit. The materialized core
  * invokes clusterBurst again on later contacts or expiry; one physical shell
  * must never create multiple six-child explosions. Preserve penetration,
  * shell cover multipliers and later Apex child-sector shaping unchanged. */
 if(Game.prototype.clusterBurst){
   var oldClusterBurst=Game.prototype.clusterBurst;
   Game.prototype.clusterBurst=function(parent){
     if(parent&&parent.__novaClusterBurstConsumed)return;
     if(parent)parent.__novaClusterBurstConsumed=true;
     return oldClusterBurst.apply(this,arguments);
   };
 }
 Game.prototype.hasLineOfSight=function(ax,ay,bx,by,pad){return lineOfSight(this,ax,ay,bx,by,pad||2);};
 Game.prototype.firstTerrainHit=function(ax,ay,bx,by,pad){return firstSolidHit(this,ax,ay,bx,by,pad||0);};
 Game.prototype.isTerrainSafe=function(x,y,pad){return safePoint(this,x,y,pad||40);};

 var oldSpawnPlayer=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(){ensureTerrain(this);var out=oldSpawnPlayer.apply(this,arguments);var p=this.player;if(p&&!safePoint(this,p.x,p.y,terrainRadiusForTank(p,CLASSES)+32)){for(var i=0;i<40;i++){var a=Math.random()*TAU,r=700+Math.random()*1100,x=Math.cos(a)*r,y=Math.sin(a)*r;if(safePoint(this,x,y,terrainRadiusForTank(p,CLASSES)+45)){p.x=x;p.y=y;break;}}}return out;};
 var oldRandSpawn=Game.prototype.randSpawnPos;Game.prototype.randSpawnPos=function(minDist){ensureTerrain(this);for(var i=0;i<34;i++){var p=oldRandSpawn.call(this,minDist);if(safePoint(this,p.x,p.y,75))return p;}return oldRandSpawn.call(this,minDist);};
 var oldSpawnShape=Game.prototype.spawnShape;Game.prototype.spawnShape=function(type,anywhere){ensureTerrain(this);var before=this.shapes.length,out=oldSpawnShape.apply(this,arguments),s=this.shapes[this.shapes.length-1];if(this.shapes.length>before&&s&&!safePoint(this,s.x,s.y,(s.r||12)+12)){for(var i=0;i<24;i++){var p=this.randSpawnPos(260);if(safePoint(this,p.x,p.y,(s.r||12)+12)){s.x=p.x;s.y=p.y;break;}}}return out;};
 var oldSpawnPower=Game.prototype.spawnPowerup;Game.prototype.spawnPowerup=function(){ensureTerrain(this);var before=this.powerups.length,out=oldSpawnPower.apply(this,arguments),p=this.powerups[this.powerups.length-1];if(this.powerups.length>before&&p&&!safePoint(this,p.x,p.y,36)){for(var i=0;i<20;i++){var q=this.randSpawnPos(500);if(safePoint(this,q.x,q.y,36)){p.x=q.x;p.y=q.y;break;}}}return out;};

 var oldMove=Game.prototype.moveTank;Game.prototype.moveTank=function(t,vx,vy,dt){ensureTerrain(this);var ox=t.x,oy=t.y;if(t.__novaSweepMoveTime!==this.time){t.__novaSweepMoveTime=this.time;t.__novaSweepPrevX=ox;t.__novaSweepPrevY=oy;}var out=oldMove.call(this,t,vx,vy,dt),r=terrainRadiusForTank(t,CLASSES),hit=circleResolve(this,t,r);if(hit){var moved=Math.hypot(t.x-ox,t.y-oy);if(!t.isPlayer&&t.ai){t.ai.__novaTerrainStuck=(t.ai.__novaTerrainStuck||0)+(moved<Math.hypot(vx,vy)*dt*.18?dt:0);if(t.ai.__novaTerrainStuck>.28){t.ai.strafe=(t.ai.strafe||1)*-1;t.ai.wanderA=(t.angle||0)+(t.ai.strafe||1)*(1.0+Math.random()*.65);t.ai.wanderT=.55+Math.random()*.7;t.ai.thinkT=0;t.ai.__novaTerrainStuck=0;}}else if(t.isPlayer&&this.sfx&&this.sfx.novaTerrainScrape&&Math.hypot(vx,vy)>45)this.sfx.novaTerrainScrape((t.x-(this.player?this.player.x:t.x))/600);}else if(t.ai)t.ai.__novaTerrainStuck=Math.max(0,(t.ai.__novaTerrainStuck||0)-dt*2);return out;};


 /* Phase Shift relocates instantly after normal movement but before bullets
  * update. Never turn the 420u teleport gap into a continuous swept hitbox. */
 var oldAbility=Game.prototype.useAbility;
 if(typeof oldAbility==='function')Game.prototype.useAbility=function(t){
   var def=t&&CLASSES[t.cls],phase=!!(t&&t.alive&&def&&def.ability==='phase'&&!(t.abilityCd>0));
   var ox=t&&t.x,oy=t&&t.y;
   if(phase&&Number.isFinite(ox)&&Number.isFinite(oy)&&Number.isFinite(t.angle)){
     /* Phase is a teleport, not a dash. Only its final position must be
      * clear: walls along the intervening chord are intentionally ignored.
      * Check before core ability side effects so a blocked shift cannot
      * spend cooldown or draw an arrival flash inside permanent cover. */
     var nx=clamp(ox+Math.cos(t.angle)*420,-MAP_LIMIT+30,MAP_LIMIT-30);
     var ny=clamp(oy+Math.sin(t.angle)*420,-MAP_LIMIT+30,MAP_LIMIT-30);
     var radius=terrainRadiusForTank(t,CLASSES)+.5;
     if(!safePoint(this,nx,ny,radius)){
       var landing=nearestPhaseLanding(this,nx,ny,ox,oy,radius);
       if(!landing){
         if(t.isPlayer&&this.addText)this.addText(ox,oy-30,'NO CLEAR LANDING','#c9a0ff',11);
         return; /* no displacement, cloak, VFX, or cooldown to refund */
       }
       /* Mirror the canonical phase case only for shortened landings.
        * Clear destinations continue through the original core method. */
       var abilityDefs=require('./classes').ABILITIES;
       t.abilityCd=abilityDefs&&abilityDefs.phase?abilityDefs.phase.cd:8;
       if(this.sfx&&this.sfx.ability)this.sfx.ability();
       this.addParticles(ox,oy,'#b06bff',16,120,'glow');
       this.addRing(ox,oy,'#b06bff',40);
       t.x=landing.x;t.y=landing.y;t.cloakT=.7;
       this.addParticles(t.x,t.y,'#b06bff',16,120,'glow');
       this.addRing(t.x,t.y,'#b06bff',40);
       this.addText(t.x,t.y-30,'PHASE SHIFT!','#c9a0ff',15);
       t.__novaSweepMoveTime=this.time;
       t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
       return;
     }
   }
   var out=oldAbility.apply(this,arguments);
   if(phase&&(t.x!==ox||t.y!==oy)){
     t.__novaSweepMoveTime=this.time;
     t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   return out;
 };

 Game.prototype.nearestTank=function(x,y,max,excludeId){var best=null,bd=max*max;for(var i=0;i<this.tanks.length;i++){var t=this.tanks[i];if(!t||!t.alive||t.id===excludeId)continue;var q=d2(x,y,t.x,t.y);if(q>=bd)continue;if(!lineOfSight(this,x,y,t.x,t.y,3))continue;bd=q;best=t;}return best;};

 var oldTryFire=Game.prototype.tryFire;Game.prototype.tryFire=function(t){if(t&&!t.isPlayer&&t.ai&&t.ai.targetId>=0){var target=this.getTank(t.ai.targetId);if(target&&target.alive&&!lineOfSight(this,t.x,t.y,target.x,target.y,4)){t.__novaTerrainDeniedFire=true;t.__novaTerrainDeniedUntil=this.time+.15;return;}}return oldTryFire.apply(this,arguments);};

/* Shape motion is resolved before projectiles in the canonical core. Keep a
 * frame-local start position so collisions use relative motion, not the
 * shape's later endpoint. Large jumps are relocations, never swept attacks. */
var SHAPE_SWEEP_CELL=128,SHAPE_SWEEP_TELEPORT=96;
function shapeSweepStart(g,s){
 if(!g.__novaShapeSweepActive||s.__novaShapeSweepEpoch!==g.__novaShapeSweepEpoch)return null;
 var x=s.__novaShapeSweepPrevX,y=s.__novaShapeSweepPrevY;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(s.x)||!Number.isFinite(s.y))return null;
 var dx=s.x-x,dy=s.y-y;
 if(dx*dx+dy*dy>SHAPE_SWEEP_TELEPORT*SHAPE_SWEEP_TELEPORT)return null;
 if(dx*dx+dy*dy<1e-16)return null;
 return{x:x,y:y};
}
function shapeWasTeleported(g,s){
 if(!g.__novaShapeSweepActive||s.__novaShapeSweepEpoch!==g.__novaShapeSweepEpoch)return false;
 var x=s.__novaShapeSweepPrevX,y=s.__novaShapeSweepPrevY;
 return Number.isFinite(x)&&Number.isFinite(y)&&
  d2(x,y,s.x,s.y)>SHAPE_SWEEP_TELEPORT*SHAPE_SWEEP_TELEPORT;
}
/* First entry of a projectile against a shape moving during this same
 * frame. Stable quadratic roots avoid cancellation on shallow crossings. */
/* Exact binary64 geometry is used only when the fast swept-circle
 * discriminant is too close to tangency to be trustworthy. No epsilon can
 * turn a genuine miss into damage; exact equality is not an overlap.
 * Ordinary collisions stay on the allocation-free fast path. */
var shapeExactView=new DataView(new ArrayBuffer(8));
function shapeDyadic(v){
 if(!Number.isFinite(v))return null;
 if(v===0)return [0n,0];
 shapeExactView.setFloat64(0,v,false);
 var hi=shapeExactView.getUint32(0,false),lo=shapeExactView.getUint32(4,false),exp=(hi>>>20)&2047;
 var mant=(BigInt(hi&0xfffff)<<32n)|BigInt(lo);
 return [(hi>>>31?-1n:1n)*(exp===0?mant:((1n<<52n)|mant)),exp===0?-1074:exp-1023-52];
}
function exactMovingShapeHitT(ax,ay,ex,ey,sx,sy,sxe,sye,rr){
 var raw=[ax,ay,ex,ey,sx,sy,sxe,sye,rr],parts=[],minExp=0;
 for(var i=0;i<raw.length;i++){var p=shapeDyadic(raw[i]);if(!p)return null;parts.push(p);if(p[1]<minExp)minExp=p[1];}
 var v=[];for(i=0;i<parts.length;i++)v.push(parts[i][0]<<BigInt(parts[i][1]-minExp));
 var fx=v[0]-v[4],fy=v[1]-v[5],dx=(v[2]-v[0])-(v[6]-v[4]),dy=(v[3]-v[1])-(v[7]-v[5]),r=v[8];
 var A=dx*dx+dy*dy,H=fx*dx+fy*dy,C=fx*fx+fy*fy-r*r;
 if(C<0n)return 0;
 if(A===0n||H>=0n||H*H-A*C<=0n)return null;
 var vertexBeforeEnd=-H<=A;
 if(!vertexBeforeEnd){
  var atEnd=A+2n*H+C;
  if(atEnd>0n||(atEnd===0n&&A+H<=0n))return null;
 }
 /* Exact bisection of the entry root. The high bound is either the
  * closest-approach time or the frame end, known to contain overlap. */
 var boundN=vertexBeforeEnd?-H:1n,boundD=vertexBeforeEnd?A:1n;
 var low=0n,high=1n,den=1n;
 for(i=0;i<58;i++){
  low*=2n;high*=2n;den*=2n;
  var mid=(low+high)>>1n,n=boundN*mid,d=boundD*den;
  var q=A*n*n+2n*H*n*d+C*d*d;
  if(q<=0n)high=mid;else low=mid;
 }
 var t=Number(boundN)/Number(boundD)*(Number(high)/Number(den));
 return Number.isFinite(t)?Math.min(t,1-Number.EPSILON/2):null;
}
function movingShapeHitT(g,s,ax,ay,ex,ey,rr){
 var start=shapeSweepStart(g,s);if(!start)return null;
 var dx=ex-ax-(s.x-start.x),dy=ey-ay-(s.y-start.y);
 var fx=ax-start.x,fy=ay-start.y,A=dx*dx+dy*dy;
 var B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr;
 if(!Number.isFinite(A)||!Number.isFinite(B)||!Number.isFinite(C))return null;
 if(C< -1e-9)return 0;
 var D=B*B-4*A*C,magnitude=B*B+4*A*(fx*fx+fy*fy+rr*rr);
 if(Math.abs(C)<=1e-9||(A>0&&Number.isFinite(D)&&Math.abs(D)<=1e-12*magnitude))
  return exactMovingShapeHitT(ax,ay,ex,ey,start.x,start.y,s.x,s.y,rr);
 if(A<1e-12||!(D>0))return null;
 var root=Math.sqrt(D),q=-.5*(B+(B<0?-root:root));
 if(!q)return null;
 var t0=q/A,t1=C/q,entry=Math.min(t0,t1),exit=Math.max(t0,t1);
 if(exit<=0||entry>=1)return null;
 return entry<=0?0:entry;
}
/* Only moving shapes require an additional swept broadphase: the canonical
 * hash already contains stationary shapes, tanks and drones. Index the shape
 * movement corridor once per frame, not once per projectile. */
function sweptShapeGrid(g){
 var ix=g.__novaSweptShapeGrid;
 if(ix){for(var z=0;z<ix.active.length;z++)ix.active[z].length=0;ix.active.length=0;ix.all.length=0;}
 if(!g.__novaShapeSweepActive||!g.bullets||!g.bullets.length)return null;
 if(!ix)ix=g.__novaSweptShapeGrid={cells:new Map(),active:[],all:[],scratch:[],stamp:0};
 var a=g.shapes||[];
 for(var i=0;i<a.length;i++){
  var s=a[i];if(!s||!(s.hp>0))continue;
  var start=shapeSweepStart(g,s);if(!start)continue;
  ix.all.push(s);
  var r=Math.max(0,s.r||0),x0=Math.floor((Math.min(start.x,s.x)-r)/SHAPE_SWEEP_CELL),x1=Math.floor((Math.max(start.x,s.x)+r)/SHAPE_SWEEP_CELL),y0=Math.floor((Math.min(start.y,s.y)-r)/SHAPE_SWEEP_CELL),y1=Math.floor((Math.max(start.y,s.y)+r)/SHAPE_SWEEP_CELL);
  for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){
   /* Arena cell coordinates are bounded to +/-19; numeric keys are unique. */
   var k=x*10000+y,arr=ix.cells.get(k);
   if(!arr){arr=[];ix.cells.set(k,arr);}
   if(!arr.length)ix.active.push(arr);
   arr.push(s);
  }
 }
 return ix;
}
function appendSweptShapes(ix,b,ax,ay,ex,ey,out){
 if(!ix||!ix.all.length)return;
 var r=Math.max(0,b.r||0),x0=Math.floor((Math.min(ax,ex)-r)/SHAPE_SWEEP_CELL),x1=Math.floor((Math.max(ax,ex)+r)/SHAPE_SWEEP_CELL),y0=Math.floor((Math.min(ay,ey)-r)/SHAPE_SWEEP_CELL),y1=Math.floor((Math.max(ay,ey)+r)/SHAPE_SWEEP_CELL);
 var stamp=++ix.stamp;if(stamp>1000000000){ix.stamp=stamp=1;for(var z=0;z<ix.all.length;z++)ix.all[z].__novaShapeQueryStamp=0;}
 function add(s){if(s.__novaShapeQueryStamp===stamp)return;s.__novaShapeQueryStamp=stamp;if(out.indexOf(s)<0)out.push(s);}
 if((x1-x0+1)*(y1-y0+1)>200){for(var z=0;z<ix.all.length;z++)add(ix.all[z]);return;}
 for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){
  var a=ix.cells.get(x*10000+y);if(!a)continue;
  for(var i=0;i<a.length;i++)add(a[i]);
 }
}
/* Core endpoint contact cannot win over a moving shape that was crossed
 * earlier in the frame. Defer the whole bullet's direct body query to the
 * existing swept recovery, which chooses the first physical victim. */
function needsMovingShapeRecovery(g,ix,b,candidates){
 if(!ix||!ix.all.length||!candidates.length||b.px==null)return false;
 /* Only defer when the core would otherwise apply an endpoint body hit.
  * The normal swept recovery already handles bullets with no endpoint hit. */
 var endpoint=false;
 for(var j=0;j<candidates.length;j++){
  var e=candidates[j],rr=0;
  if(e.kind==='shape'&&e.hp>0)rr=b.r+e.r;
  else if(e.kind==='tank'&&e.alive&&e.id!==b.ownerId)rr=b.r+CLASSES[e.cls].size+3;
  else if(e.kind==='drone'&&e.hp>0&&e.ownerId!==b.ownerId)rr=b.r+e.r+1;
  if(rr&&d2(b.x,b.y,e.x,e.y)<rr*rr){endpoint=true;break;}
 }
 if(!endpoint)return false;
 var ax=b.px,ay=b.py,ex=b.x,ey=b.y,moving=ix.scratch;moving.length=0;
 appendSweptShapes(ix,b,ax,ay,ex,ey,moving);
 for(var i=0;i<moving.length;i++){
  var s=moving[i];if(s.hp>0&&movingShapeHitT(g,s,ax,ay,ex,ey,b.r+s.r)!=null)return true;
 }
 return false;
}
var oldEntityBullets=Game.prototype.updateBullets;Game.prototype.updateBullets=function(dt){var movingShapes=sweptShapeGrid(this);for(var m=0;m<this.bullets.length;m++){var mb=this.bullets[m];if(mb)mb.__novaSweepHitsBefore=mb.hits||0;}var hash=this.hash,query=hash&&hash.query,hadOwn=hash&&Object.prototype.hasOwnProperty.call(hash,'query'),out,self=this,cursor=-1,started=false,generation=(this.__novaDirectQueryGeneration||0)+1,pending=[],splashDepth=0;
 this.__novaDirectQueryGeneration=generation;
 var oldSplashForContacts=this.splashAt,hadOwnSplash=Object.prototype.hasOwnProperty.call(this,'splashAt');
 /* A penetrating shot must contact each physical victim only once, even
  * across many rendered frames. The core queries live bullets in reverse
  * order. A generation marker survives array splices without cloning the
  * entire bullet array each frame. Splash queries are never direct hits. */
 if(oldSplashForContacts)this.splashAt=function(){splashDepth++;try{return oldSplashForContacts.apply(this,arguments);}finally{splashDepth--;}};
 if(query)hash.query=function(x,y,r,candidates){
   var value=query.call(this,x,y,r,candidates),b=null;
   if(!splashDepth&&candidates===self.tmp){
     if(!started){started=true;cursor=self.bullets.length-1;}
     while(cursor>=0&&(!self.bullets[cursor]||self.bullets[cursor].dead||self.bullets[cursor].__novaDirectQueryGeneration===generation))cursor--;
     var next=cursor>=0?self.bullets[cursor]:null;
     if(next&&x===next.x&&y===next.y&&r===next.r+46){
       b=next;b.__novaDirectQueryGeneration=generation;cursor--;
     }
   }
   var victims=b&&b.__novaDirectVictims,write=0;
   for(var scan=0;scan<candidates.length;scan++){
     var candidate=candidates[scan];
     if(!candidate||(candidate.kind==='shape'&&candidate.hp<=0)||(victims&&victims.has(candidate)))continue;
     candidates[write++]=candidate;
   }
   candidates.length=write;
   if(b&&needsMovingShapeRecovery(self,movingShapes,b,candidates)){candidates.length=0;return value;}
   /* The shipping core takes the first endpoint-overlapping body in hash
    * order. When several bodies overlap the same bullet endpoint, select the
    * surface crossed first. Splash queries must retain their original order.
    * Avoid quadratic contact math unless at least two direct hits are possible. */
   if(b&&candidates.length>1&&b.px!=null&&(b.px!==b.x||b.py!==b.y)){
     var overlaps=0;
     for(var oi=0;oi<candidates.length;oi++){
       var oe=candidates[oi],orr=0;
       if(oe.kind==='shape'&&oe.hp>0)orr=b.r+oe.r;
       else if(oe.kind==='tank'&&oe.id!==b.ownerId&&oe.alive)orr=b.r+CLASSES[oe.cls].size+3;
       else if(oe.kind==='drone'&&oe.ownerId!==b.ownerId&&oe.hp>0)orr=b.r+oe.r+1;
       if(orr&&d2(b.x,b.y,oe.x,oe.y)<orr*orr&&++overlaps>1)break;
     }
     if(overlaps>1){
       var px=b.px,py=b.py,dx=b.x-px,dy=b.y-py,firstIndex=-1,firstTime=2;
       for(var ci=0;ci<candidates.length;ci++){
         var ce=candidates[ci],rr=0;
         if(ce.kind==='shape'&&ce.hp>0)rr=b.r+ce.r;
         else if(ce.kind==='tank'&&ce.id!==b.ownerId&&ce.alive)rr=b.r+CLASSES[ce.cls].size+3;
         else if(ce.kind==='drone'&&ce.ownerId!==b.ownerId&&ce.hp>0)rr=b.r+ce.r+1;
         if(!rr||d2(b.x,b.y,ce.x,ce.y)>=rr*rr)continue;
         var rx=dx,ry=dy,tx=ce.x,ty=ce.y;
         if(ce.kind==='shape'){var sp=shapeSweepStart(self,ce);if(sp){rx-=ce.x-sp.x;ry-=ce.y-sp.y;tx=sp.x;ty=sp.y;}}
         if(ce.kind==='tank'&&ce.__novaSweepMoveTime===self.time){
           rx-=ce.x-ce.__novaSweepPrevX;ry-=ce.y-ce.__novaSweepPrevY;
           tx=ce.__novaSweepPrevX;ty=ce.__novaSweepPrevY;
         }
         var fx=px-tx,fy=py-ty,A=rx*rx+ry*ry,B=2*(fx*rx+fy*ry),C=fx*fx+fy*fy-rr*rr,t=0;
         if(C>=0){
           var D=B*B-4*A*C;
           if(A<1e-12||D<=0)continue;
           t=(-B-Math.sqrt(D))/(2*A);
           if(t<0||t>1)continue;
         }
         if(t<firstTime-1e-10){firstTime=t;firstIndex=ci;}
       }
       /* Reorder before the piercing ledger chooses the victim. */
       if(firstIndex>0){var swap=candidates[0];candidates[0]=candidates[firstIndex];candidates[firstIndex]=swap;}
     }
   }
   /* Single-contact rounds expire immediately; only penetrating bullets
    * need the extra geometric prediction and hit-identity bookkeeping. */
   if(b&&b.pen>0){
     for(var j=0;j<candidates.length;j++){
       var e=candidates[j],rr=0;
       if(e.kind==='shape')rr=b.r+e.r;
       else if(e.kind==='tank'&&e.id!==b.ownerId&&e.alive)rr=b.r+CLASSES[e.cls].size+3;
       else if(e.kind==='drone'&&e.ownerId!==b.ownerId&&e.hp>0)rr=b.r+e.r+1;
       if(rr>0&&d2(b.x,b.y,e.x,e.y)<rr*rr){
         pending.push([b,e,b.hits||0]);break;
       }
     }
   }
   return value;
 };
 try{out=oldEntityBullets.call(this,dt);}finally{
   if(query){if(hadOwn)hash.query=query;else delete hash.query;}
   if(oldSplashForContacts){if(hadOwnSplash)this.splashAt=oldSplashForContacts;else delete this.splashAt;}
   for(var pi=0;pi<pending.length;pi++){
     var item=pending[pi],pb=item[0];
     if((pb.hits||0)>item[2]){
       (pb.__novaDirectVictims||(pb.__novaDirectVictims=new Set())).add(item[1]);
     }
   }
 }for(var i=this.bullets.length-1;i>=0;i--){var b=this.bullets[i];if(!b||b.dead||(b.hits||0)!==b.__novaSweepHitsBefore)continue;var ax=b.px==null?b.x:b.px,ay=b.py==null?b.y:b.py,ex=b.x,ey=b.y,travel=Math.hypot(ex-ax,ey-ay);if(travel<1e-6&&!(movingShapes&&movingShapes.all.length))continue;this.hash.query((ax+ex)*.5,(ay+ey)*.5,travel*.5+b.r+46,this.tmp);appendSweptShapes(movingShapes,b,ax,ay,ex,ey,this.tmp);var first=null;for(var j=0;j<this.tmp.length;j++){var e=this.tmp[j],er=0;if(b.__novaDirectVictims&&b.__novaDirectVictims.has(e))continue;if(e.kind==='shape'&&e.hp>0&&!shapeWasTeleported(this,e))er=e.r;else if(e.kind==='tank'&&e.id!==b.ownerId&&e.alive)er=CLASSES[e.cls].size+3;else if(e.kind==='drone'&&e.ownerId!==b.ownerId&&e.hp>0)er=e.r+1;else continue;var rr=b.r+er,dx=ex-ax,dy=ey-ay,tx=e.x,ty=e.y;if(e.kind==='shape'){var start=shapeSweepStart(this,e);if(start){dx-=e.x-start.x;dy-=e.y-start.y;tx=start.x;ty=start.y;}}if(e.kind==='tank'&&e.__novaSweepMoveTime===this.time){dx-=e.x-e.__novaSweepPrevX;dy-=e.y-e.__novaSweepPrevY;tx=e.__novaSweepPrevX;ty=e.__novaSweepPrevY;}var fx=ax-tx,fy=ay-ty,A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr,t=null;if(e.kind==='shape'&&shapeSweepStart(this,e))t=movingShapeHitT(this,e,ax,ay,ex,ey,rr);else if(C<0)t=0;else{var D=B*B-4*A*C;if(D>0){var root=Math.sqrt(D),t0=(-B-root)/(2*A),t1=(-B+root)/(2*A);if(t0>=0&&t0<=1)t=t0;else if(t1>=0&&t1<=1)t=t1;}}if(t!=null&&(!first||t<first.t))first={e:e,t:t};}if(!first)continue;var e=first.e,hitT=first.t===0?0:Math.min(1,first.t+1e-9),hx=ax+(ex-ax)*hitT,hy=ay+(ey-ay)*hitT;b.x=hx;b.y=hy;if(e.kind==='shape'){if(b.shell)this.clusterBurst(b);this.damageShape(e,b.dmg,b.vx,b.vy);}else if(e.kind==='tank'){if(b.shell)this.clusterBurst(b);var ang=Math.atan2(b.vy,b.vx);this.damageTank(e,b.dmg,b.ownerId,Math.cos(ang)*(b.knock||0)*.006,Math.sin(ang)*(b.knock||0)*.006);}else this.damageDrone(e,b.dmg,b.ownerId);if(b.splash&&e.kind!=='drone')this.splashAt(hx,hy,b.splash,b.splashDmg||.4,b.ownerId,b.knock||0,b.color,b.dmg);b.hits++;b.pen--;if(b.pen<0)b.dead=true;else (b.__novaDirectVictims||(b.__novaDirectVictims=new Set())).add(e);if(!b.dead){b.x=ex;b.y=ey;}else this.bullets.splice(i,1);}return out;};


 /* Conservative physical-first-contact recovery for ordinary projectiles.
  * The materialized core kills TTL<=0 shots BEFORE body queries and otherwise
  * resolves only one endpoint body contact per projectile per frame.
  * Only settle an unambiguous earlier body contact: no shell/splash, no
  * competing projectile corridor, no earlier terrain, no uncertain drone
  * motion, and no simultaneous bodies. All ambiguous cases remain owned by
  * the existing engine until the full chronological resolver is ready. */
 /* Bounded first-event chain for ordinary piercing rounds.
  * Only unambiguous, witnessed-stationary, healthy tank hulls qualify.
  * No cover, hostile drones, other projectiles, shapes, initial overlap,
  * simultaneous contacts, defenses or on-hit deaths may enter this shortcut.
  * Other combat remains owned by the existing engine and the future #147
  * chronological solver. Live-frame shortcuts exhaust penetration; TTL
  * shortcuts settle only proven pre-expiry contacts before the shot dies.
  * Never leave a partially backdated bullet live. */
 /* A single eligible shot may prove a local corridor even when remote fire
  * exceeds the global 900-comparison estimate. Its own full-entity scan
  * remains capped; multi-shot local batches must pass a shared preflight. */
 var ISOLATED_RECOVERY_SCAN_CAP=1200;
 function isolatedTTLStationaryPiercingChain(g,b,dt,nonExpiring,localOthers){
  if(!b||b.dead||b.shell||b.beam||b.splash||b.__v17Cannon||
     b.__novaBreachAtTime===g.time||
     !(dt>0)||!(b.ttl>0)||
     (nonExpiring ? !(b.ttl>dt&&b.pen===1&&b.hits===0) : !(b.ttl<=dt))||
     !(b.pen===0||b.pen===1||(!nonExpiring&&b.pen===2))||
     !(b.hits>=0)||(b.hits===0&&b.pen===0)||
     (b.hits>0&&!(b.__novaDirectVictims instanceof Set))||
     !Number.isFinite(b.x)||!Number.isFinite(b.y)||
     !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
     !Number.isFinite(b.r)||!Number.isFinite(b.dmg)||
     !(b.r>0)||!(b.dmg>0))return false;
  var travelT=nonExpiring?dt:b.ttl,
      ax=b.x,ay=b.y,dx=b.vx*travelT,dy=b.vy*travelT,
      ex=ax+dx,ey=ay+dy,limit=MAP_LIMIT-20;
  if(!(dx*dx+dy*dy>1e-12)||
     !Number.isFinite(ex)||!Number.isFinite(ey)||
     Math.max(Math.abs(ax),Math.abs(ex),Math.abs(ay),Math.abs(ey))>=limit)return false;
  var owner=g.getTank&&g.getTank(b.ownerId);
  if(typeof g.areAllies==='function'&&!owner)return false;
  var minx=Math.min(ax,ex),maxx=Math.max(ax,ex),
      miny=Math.min(ay,ey),maxy=Math.max(ay,ey);
  function near(x0,y0,x1,y1,pad){
   if(!Number.isFinite(x0)||!Number.isFinite(y0)||
      !Number.isFinite(x1)||!Number.isFinite(y1)||
      !Number.isFinite(pad))return true;
   return Math.max(x0,x1)+pad>=minx&&Math.min(x0,x1)-pad<=maxx&&
          Math.max(y0,y1)+pad>=miny&&Math.min(y0,y1)-pad<=maxy;
  }
  /* A stationary-hull proof must cover the actual movement epoch. A
   * directly exercised test harness has no Game.update movement epoch;
   * live games do, so missing live witness conservatively abstains. */
  var tanks=g.tanks||[],shapes=g.shapes||[],drones=g.drones||[],
      others=localOthers||g.bullets||[],contacts=[];
  if(tanks.length+shapes.length+drones.length+others.length>
     ISOLATED_RECOVERY_SCAN_CAP)return false;
  for(var ti=0;ti<tanks.length;ti++){
   var t=tanks[ti];if(!t||!t.alive||t.id===b.ownerId)continue;
   var def=CLASSES[t.cls],rr=b.r+(def&&def.size||0)+3;
   if(!(rr>0)||!Number.isFinite(rr)||!Number.isFinite(t.x)||
      !Number.isFinite(t.y))return false;
   var known=t.__novaSweepMoveTime===g.time,
       sx=known?t.__novaSweepPrevX:t.x,
       sy=known?t.__novaSweepPrevY:t.y;
   if(!near(sx,sy,t.x,t.y,rr+2))continue;
   if(g.__novaShapeSweepActive&&!known)return false;
   if(!Number.isFinite(sx)||!Number.isFinite(sy)||
      Math.hypot(t.x-sx,t.y-sy)>1e-8)return false;
   if(t.spawnShieldT>0||t.shieldT>0||t.bulwarkT>0||
      t.tauntT>0||!Number.isFinite(t.hp)||t.hp<=b.dmg*2||
      (typeof g.areAllies==='function'&&g.areAllies(owner,t)))return false;
   if(b.__novaDirectVictims&&b.__novaDirectVictims.has(t))continue;
   var fx=ax-t.x,fy=ay-t.y,A=dx*dx+dy*dy,
       B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr;
   if(!(C>1e-9))return false; /* initial overlap is ambiguous */
   var D=B*B-4*A*C;
   if(Math.abs(D)<=1e-10*(B*B+4*A*(fx*fx+fy*fy+rr*rr)))return false;
   if(D<=0)continue;
   var root=Math.sqrt(D),q=-.5*(B+(B<0?-root:root));
   if(!q)return false;
   var enter=Math.min(q/A,C/q),leave=Math.max(q/A,C/q);
   if(leave<=0||enter>=1-1e-9)continue;
   if(!(enter>1e-9))return false;
   contacts.push({e:t,t:enter});
  }
  /* A live non-expiring round must exhaust its full pen=1 budget here.
   * A TTL-expiring round can settle a partial remaining budget safely:
   * the projectile will die at expiry regardless of unused penetration.
   * The original one-body TTL resolver retains first-hit ownership. */
  if(nonExpiring ? contacts.length!==2 :
     contacts.length<(b.hits>0?1:2)||contacts.length>b.pen+1||contacts.length>3)
   return false;
  contacts.sort(function(a,c){return a.t-c.t;});
  for(var oi=1;oi<contacts.length;oi++)
   if(contacts[oi].t-contacts[oi-1].t<1e-7)return false;
  /* Non-tank bodies, including newborns and discontinuously moving drones,
   * may take physical priority. Only prove their corridors are remote. */
  for(var si=0;si<shapes.length;si++){
   var s=shapes[si];if(!s||!(s.hp>0))continue;
   if(shapeWasTeleported(g,s))return false;
   var st=shapeSweepStart(g,s),sx=st?st.x:s.x,sy=st?st.y:s.y;
   if(near(sx,sy,s.x,s.y,(s.r||15)+b.r+4+Math.max(30,dt*800)))return false;
  }
  for(var di=0;di<drones.length;di++){
   var d=drones[di];if(!d||!(d.hp>0)||d.ownerId===b.ownerId)continue;
   if(!g.__novaShapeSweepActive||
      d.__novaChronoDroneEpoch!==g.__novaShapeSweepEpoch||
      !Number.isFinite(d.__novaChronoDronePrevX)||
      !Number.isFinite(d.__novaChronoDronePrevY)||
      !Number.isFinite(d.x)||!Number.isFinite(d.y))return false;
   var mx=d.x-d.__novaChronoDronePrevX,my=d.y-d.__novaChronoDronePrevY;
   if(mx*mx+my*my>96*96||!Number.isFinite(d.speed==null?0:d.speed))return false;
   var motionBound=Math.max(800,(d.speed>0?d.speed*4:800));
   if(near(d.__novaChronoDronePrevX,d.__novaChronoDronePrevY,d.x,d.y,
      (d.r||8)+b.r+1+Math.max(30,dt*motionBound)))return false;
  }
  for(var bi=0;bi<others.length;bi++){
   var o=others[bi];if(!o||o===b||o.dead)continue;
   if(!Number.isFinite(o.x)||!Number.isFinite(o.y)||
      !Number.isFinite(o.vx)||!Number.isFinite(o.vy)||
      !Number.isFinite(o.r)||!(o.r>0))return false;
   if(near(o.x,o.y,o.x+o.vx*dt,o.y+o.vy*dt,
      o.r+b.r+2))return false;
   /* A competing projectile can already overlap a target hull without
    * touching this shot's narrow corridor. Such a t=0 contact must not
    * be reordered behind our speculative multi-hit proof. Consider the
    * other bullet's conservative movement only UNTIL each body contact;
    * this veto awards no damage and leaves ordinary collisions intact. */
   for(var ct=0;ct<contacts.length;ct++){
    var target=contacts[ct].e;
    if(o.ownerId===target.id)continue;
    var targetDef=CLASSES[target.cls];
    if(!targetDef||!Number.isFinite(targetDef.size))return false;
    var until=Math.min(dt,contacts[ct].t*travelT),
        tx=o.x+o.vx*until,ty=o.y+o.vy*until,
        radius=o.r+Math.max(0,targetDef.size)+3;
    if(!Number.isFinite(tx)||!Number.isFinite(ty)||
       !Number.isFinite(radius))return false;
    if(Math.max(o.x,tx)+radius>=target.x&&
       Math.min(o.x,tx)-radius<=target.x&&
       Math.max(o.y,ty)+radius>=target.y&&
       Math.min(o.y,ty)-radius<=target.y)return false;
   }
  }
  if(firstSolidHit(g,ax,ay,ex,ey,b.r*.45))return false;
  /* Reuse the real damage owner, never fabricate HP or kill credit. */
  var ang=Math.atan2(b.vy,b.vx),kx=Math.cos(ang)*(b.knock||0)*.006,
      ky=Math.sin(ang)*(b.knock||0)*.006;
  for(var ci=0;ci<contacts.length;ci++){
   var hit=contacts[ci];
   b.x=ax+dx*hit.t;b.y=ay+dy*hit.t;
   g.damageTank(hit.e,b.dmg,b.ownerId,kx,ky);
   b.hits++;b.pen--;
   (b.__novaDirectVictims||(b.__novaDirectVictims=new Set())).add(hit.e);
  }
  b.dead=true;b.px=b.x;b.py=b.y;b.vx=0;b.vy=0;
  return true;
 }
 function isolatedTTLBodyContact(g,b,dt){
  if(!b||b.dead||b.shell||b.beam||b.splash||b.__v17Cannon||!(b.ttl>0)||
     !(b.ttl<=dt)||!(dt>0)||!(b.pen>=0)||(b.hits||0)>0||
     !Number.isFinite(b.x)||!Number.isFinite(b.y)||
     !Number.isFinite(b.vx)||!Number.isFinite(b.vy))return false;
  var dx=b.vx*dt,dy=b.vy*dt,limit=b.ttl/dt;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||!(dx*dx+dy*dy>1e-12)||
     Math.abs(b.x)>=MAP_LIMIT-20||Math.abs(b.y)>=MAP_LIMIT-20)return false;
  /* First resolve the earliest body candidate. A drone can only veto a
   * contact if it might intercept BEFORE that candidate, not somewhere later
   * on the projectile's remaining TTL path. */
  var ax=b.x,ay=b.y;
  var best=null,bestT=limit,tie=false,uncertain=false,blockedT=Infinity;
  function consider(e,kind){
   if(!e)return;
   /* Never infer a drone's exact path from phase checkpoints. For a
    * bounded-speed non-dashing drone, however, a projectile can sometimes
    * prove contact without knowing that path: at time t the drone cannot
    * be farther than speedBound*t from its witnessed frame-start position.
    * A projectile STRICTLY inside that shrinking circle must have touched
    * the drone by t. The sample time is an upper bound, not a fabricated
    * first-contact timestamp. Competing bodies are vetoed below. */
   if(kind==='drone'){
    if(!(e.hp>0)||e.ownerId===b.ownerId)return;
    var drR=b.r+e.r+1;
    if(!(drR>0)||!Number.isFinite(drR)||
       !Number.isFinite(e.x)||!Number.isFinite(e.y)){uncertain=true;return;}
    var dsx=e.__novaChronoDronePrevX,dsy=e.__novaChronoDronePrevY;
    var witnessed=g.__novaShapeSweepActive&&
       e.__novaChronoDroneEpoch===g.__novaShapeSweepEpoch&&
       Number.isFinite(dsx)&&Number.isFinite(dsy);
    var overlapNow=d2(ax,ay,e.x,e.y)<drR*drR;
    if(overlapNow&&!witnessed){uncertain=true;return;}
    if(overlapNow&&d2(ax,ay,dsx,dsy)<drR*drR){
     if(best&&bestT<1e-8){tie=true;return;}
     best={e:e,kind:'drone'};bestT=0;tie=false;return;
    }
    /* End-only overlap is not a zero-time contact. It can still have a
     * rigorous pre-expiry proof below, using the witnessed frame start. */
    if(!witnessed||!Number.isFinite(e.speed)||!(e.speed>0)||
       !Number.isFinite(e.__novaChronoDronePrevSpeed)||
       !(e.__novaChronoDronePrevSpeed>0)||
       !Number.isFinite(e.__novaChronoDronePrevV)||
       e.__novaPhase==='dash'||e.__novaChronoDronePrevPhase==='dash'||
       e.__novaCommitted||e.__novaChronoDronePrevCommitted||
       e.__novaSpotter||e.__novaTerrainBump){
     /* No new authority without a speed witness. The existing later
      * drone-corridor veto still protects an earlier tank/shape contact. */
     return;
    }
    var speedBound=Math.max(1200,e.speed*6,
      (e.__novaChronoDronePrevSpeed||0)*6,
      (e.__novaChronoDronePrevV||0)*2,
      Math.hypot(e.__novaVX||0,e.__novaVY||0)*2,
      Math.hypot(e.__lvVX||0,e.__lvVY||0)*2,
      Math.hypot(e.__novaIdleVX||0,e.__novaIdleVY||0)*2),
      move=Math.hypot(e.x-dsx,e.y-dsy);
    if(!Number.isFinite(speedBound)||speedBound>4000||
       move>96||move>speedBound*dt+1e-6){uncertain=true;return;}
    /* Cull remote drones before any quadratic/sampled proof. An earlier
     * tank or neutral hit shortens the only time window in which this
     * drone could affect the result. */
    var windowT=best?Math.min(bestT,limit):limit;
    var reach=drR+speedBound*dt*windowT;
    var potentiallyEarlier=
       Math.max(ax,ax+dx*windowT)+reach>=Math.min(dsx,e.x)&&
       Math.min(ax,ax+dx*windowT)-reach<=Math.max(dsx,e.x)&&
       Math.max(ay,ay+dy*windowT)+reach>=Math.min(dsy,e.y)&&
       Math.min(ay,ay+dy*windowT)-reach<=Math.max(dsy,e.y);
    if(!potentiallyEarlier)return;
    /* Minimize distance(projectile(t), droneStart) + speedBound*t
     * over the physical TTL interval. This function is convex. Four
     * fixed samples can miss a guaranteed contact near expiry or between
     * samples, even for ordinary Sniper-family projectile speeds.
     * The minimum is exact for the straight projectile and the enclosing
     * drone speed ball; it does NOT infer a drone trajectory. */
    var sample=null,k=speedBound*dt,v2=dx*dx+dy*dy;
    if(Number.isFinite(v2)&&v2>1e-12){
     var wx=ax-dsx,wy=ay-dsy,dot=wx*dx+wy*dy,optimal=0;
     if(v2>k*k){
      var perp2=Math.max(0,wx*wx+wy*wy-dot*dot/v2);
      optimal=-dot/v2-k*Math.sqrt(perp2)/
       (Math.sqrt(v2)*Math.sqrt(v2-k*k));
      optimal=Math.max(0,Math.min(windowT,optimal));
     }
     /* Without a bullet-birth witness, a start-only overlap followed by
      * drone departure is not enough to backdate a newly spawned shot. */
     if(optimal>1e-9&&
        Math.hypot(wx+dx*optimal,wy+dy*optimal)+k*optimal<drR-1e-5)
      sample=optimal;
    }
    if(sample===null||best){uncertain=true;return;}
    best={e:e,kind:'drone',guaranteed:true};bestT=sample;tie=false;return;
   }
   var rr=0,sx=e.x,sy=e.y,mx=0,my=0,discontinuousTankMove=false;
   if(kind==='tank'){
    if(!e.alive||e.id===b.ownerId)return;
    var def=CLASSES[e.cls];if(!def){uncertain=true;return;}
    rr=b.r+def.size+3;
    if(e.__novaSweepMoveTime===g.time){
     if(!Number.isFinite(e.__novaSweepPrevX)||!Number.isFinite(e.__novaSweepPrevY)){uncertain=true;return;}
     sx=e.__novaSweepPrevX;sy=e.__novaSweepPrevY;
     mx=e.x-sx;my=e.y-sy;
     /* A large finite jump is not proof of continuous travel through
      * intervening targets. Match the shape sweep's 96u relocation gate. */
     discontinuousTankMove=mx*mx+my*my>96*96;
    }
   }else{
    if(!(e.hp>0))return;
    rr=b.r+e.r;
    if(shapeWasTeleported(g,e)){
     /* Unknown jump: even an apparent crossing is not proof of contact. */
     uncertain=true;return;
    }
    var start=shapeSweepStart(g,e);
    if(start){sx=start.x;sy=start.y;mx=e.x-sx;my=e.y-sy;}
   }
   if(!(rr>0)||!Number.isFinite(sx)||!Number.isFinite(sy)||
      !Number.isFinite(mx)||!Number.isFinite(my)){uncertain=true;return;}
   /* Reject distant bodies before the more expensive swept-circle roots. */
   var bx=ax+dx*limit,by=ay+dy*limit,tx1=sx+mx,ty1=sy+my;
   if(Math.max(ax,bx)<Math.min(sx,tx1)-rr||
      Math.min(ax,bx)>Math.max(sx,tx1)+rr||
      Math.max(ay,by)<Math.min(sy,ty1)-rr||
      Math.min(ay,by)>Math.max(sy,ty1)+rr)return;
   /* A discontinuous tank corridor could be a teleport. It may matter,
    * but it cannot authorize a synthetic hit at any intermediate point. */
   if(discontinuousTankMove){uncertain=true;return;}
   /* Remote tanks cannot affect this shot's physical first contact, even
    * when protected or allied. Check defenses only after excluding their
    * complete observed movement corridor. Nearby cases still defer. */
   var protectedTank=false;
   if(kind==='tank'){
    var owner=g.getTank&&g.getTank(b.ownerId);
    protectedTank=e.spawnShieldT>0||e.shieldT>0||
      e.bulwarkT>0||e.tauntT>0||
      (typeof g.areAllies==='function'&&(!owner||g.areAllies(owner,e)));
    /* Moving protected bodies have no certified subframe trajectory. Keep
     * the existing conservative veto even when their endpoints look late. */
    if(protectedTank&&e.__novaSweepMoveTime===g.time){uncertain=true;return;}
   }
   /* A child shape created by an earlier hit during this very frame has no
    * valid frame-start existence interval. Defer rather than backdate it. */
   if(kind==='shape'&&e.born===g.time){uncertain=true;return;}
   var fx=ax-sx,fy=ay-sy,rx=dx-mx,ry=dy-my;
   var A=rx*rx+ry*ry,B=2*(fx*rx+fy*ry),C=fx*fx+fy*fy-rr*rr;
   if(!Number.isFinite(A)||!Number.isFinite(B)||!Number.isFinite(C)){uncertain=true;return;}
   var t=null;
   if(C<0)t=0;
   else if(A>1e-12){
    var D=B*B-4*A*C;
    /* Ambiguous near-tangencies belong to the exact chronological solver,
     * not an optimistic early damage path. */
    if(Math.abs(D)<1e-10*(B*B+4*A*(fx*fx+fy*fy+rr*rr))){uncertain=true;return;}
    if(D>0){
     var root=Math.sqrt(D),q=-.5*(B+(B<0?-root:root));
     if(q){
      var enter=Math.min(q/A,C/q),leave=Math.max(q/A,C/q);
      if(leave>0&&enter<1)t=Math.max(0,enter);
     }
    }
   }
   if(t==null||!(t<limit-1e-10))return;
   /* A stationary shield/ally can veto only a contact at or before the
    * first valid hit, not a physically later one. Never damage it here. */
   if(protectedTank){blockedT=Math.min(blockedT,t);return;}
   if(best&&Math.abs(t-bestT)<1e-8){tie=true;return;}
   if(t<bestT){best={e:e,kind:kind};bestT=t;tie=false;}
  }
  var tanks=g.tanks||[],shapes=g.shapes||[];
  for(var ti=0;ti<tanks.length;ti++)consider(tanks[ti],'tank');
  for(var si=0;si<shapes.length;si++)consider(shapes[si],'shape');
  var drones=g.drones||[];
  for(var di=0;di<drones.length;di++)consider(drones[di],'drone');
  if(!best||tie||uncertain||blockedT<=bestT+1e-8)return false;
  var hx=ax+dx*bestT,hy=ay+dy*bestT;
  /* A guaranteed-overlap time is an upper bound on the drone's actual
   * first contact. Another nearby body might have hit first. Do not let
   * this conservative proof reorder tank/shape damage or kill credit. */
  if(best.guaranteed){
   /* Piercing shots survive the drone hit until TTL. To commit their one
    * guaranteed hit, prove the ENTIRE remaining TTL corridor free of other
    * bodies, cover and competing shots; otherwise defer the whole event. */
   var proofX=b.pen>0?ax+dx*limit:hx,
       proofY=b.pen>0?ay+dy*limit:hy;
   if(b.pen>0&&firstSolidHit(g,hx,hy,proofX,proofY,(b.r||2)*.45))
    return false;
   for(var ti=0;ti<tanks.length;ti++){
    var t=tanks[ti];if(!t||!t.alive||t.id===b.ownerId)continue;
    var def=CLASSES[t.cls],pad=b.r+(def&&def.size||30)+3;
    var tx=t.x,ty=t.y,px=t.__novaSweepMoveTime===g.time?t.__novaSweepPrevX:tx,
        py=t.__novaSweepMoveTime===g.time?t.__novaSweepPrevY:ty;
    if(!Number.isFinite(px)||!Number.isFinite(py)||
       Math.max(ax,proofX)+pad>=Math.min(tx,px)&&
       Math.min(ax,proofX)-pad<=Math.max(tx,px)&&
       Math.max(ay,proofY)+pad>=Math.min(ty,py)&&
       Math.min(ay,proofY)-pad<=Math.max(ty,py))return false;
   }
   for(var si=0;si<shapes.length;si++){
    var s=shapes[si];if(!s||!(s.hp>0))continue;
    var st=shapeSweepStart(g,s),sx=st?st.x:s.x,sy=st?st.y:s.y,
        pad=b.r+(s.r||15)+4;
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||
       Math.max(ax,proofX)+pad>=Math.min(sx,s.x)&&
       Math.min(ax,proofX)-pad<=Math.max(sx,s.x)&&
       Math.max(ay,proofY)+pad>=Math.min(sy,s.y)&&
       Math.min(ay,proofY)-pad<=Math.max(sy,s.y))return false;
   }
   if(b.pen>0){
    for(var di=0;di<drones.length;di++){
     var d=drones[di];if(!d||d===best.e||!(d.hp>0)||
        d.ownerId===b.ownerId)continue;
     var sx=d.__novaChronoDronePrevX,sy=d.__novaChronoDronePrevY,
         pad=b.r+(d.r||8)+1+Math.max(30,dt*2400);
     if(!Number.isFinite(sx)||!Number.isFinite(sy)||
        Math.max(ax,proofX)+pad>=Math.min(sx,d.x)&&
        Math.min(ax,proofX)-pad<=Math.max(sx,d.x)&&
        Math.max(ay,proofY)+pad>=Math.min(sy,d.y)&&
        Math.min(ay,proofY)-pad<=Math.max(sy,d.y))return false;
    }
    var shots=g.bullets||[];
    for(var bi=0;bi<shots.length;bi++){
     var o=shots[bi];if(!o||o===b||o.dead)continue;
     var ox=o.x,oy=o.y,ex=ox+(o.vx||0)*dt,
         ey=oy+(o.vy||0)*dt,pad=b.r+(o.r||2)+2;
     if(!Number.isFinite(ox)||!Number.isFinite(oy)||
        !Number.isFinite(ex)||!Number.isFinite(ey)||
        Math.max(ax,proofX)+pad>=Math.min(ox,ex)&&
        Math.min(ax,proofX)-pad<=Math.max(ox,ex)&&
        Math.max(ay,proofY)+pad>=Math.min(oy,ey)&&
        Math.min(ay,proofY)-pad<=Math.max(oy,ey))return false;
    }
   }
  }
  if(Math.abs(hx)>=MAP_LIMIT-20||Math.abs(hy)>=MAP_LIMIT-20)return false;
  /* Owned drones are transparent to their own projectiles in the shipping
   * core. A hostile drone may still intercept earlier: only rule it out if
   * the witnessed start/end corridor plus a conservative curved-motion pad
   * is remote from the segment ending at the chosen FIRST body contact. */
  for(var di=0;di<drones.length;di++){
   var dr=drones[di];if(!dr||!(dr.hp>0)||dr.ownerId===b.ownerId||
      (best.kind==='drone'&&dr===best.e))continue;
   if(!g.__novaShapeSweepActive||
      dr.__novaChronoDroneEpoch!==g.__novaShapeSweepEpoch)return false;
   var sx=dr.__novaChronoDronePrevX,sy=dr.__novaChronoDronePrevY;
   if(!Number.isFinite(sx)||!Number.isFinite(sy)||
      !Number.isFinite(dr.x)||!Number.isFinite(dr.y))return false;
   var mx=dr.x-sx,my=dr.y-sy;
   if(mx*mx+my*my>96*96)return false;
   if(dr.speed!=null&&!Number.isFinite(dr.speed))return false;
   var motionBound=Math.max(800,(dr.speed>0?dr.speed*4:800));
   var pad=Math.max(0,b.r||2)+Math.max(0,dr.r||8)+1+
     Math.max(30,dt*motionBound);
   if(Math.max(ax,hx)+pad>=Math.min(sx,dr.x)&&
      Math.min(ax,hx)-pad<=Math.max(sx,dr.x)&&
      Math.max(ay,hy)+pad>=Math.min(sy,dr.y)&&
      Math.min(ay,hy)-pad<=Math.max(sy,dr.y))return false;
  }
  /* A cover event at or before the body makes this lane ambiguous, including
   * destructible-cover penetration and exact-time ties. */
  if(bestT===0){
   /* Zero-length circle sweeps have no quadratic root. Check containment
    * explicitly so a drone cannot be hit from inside a pillar or cover. */
   var originSolids=terrainCandidates(g,ax,ay,ax,ay,(b.r||2)*.45);
   for(var solidI=0;solidI<originSolids.length;solidI++)
    if(pointInsideSolid(originSolids[solidI],ax,ay,(b.r||2)*.45))return false;
  }
  if(firstSolidHit(g,ax,ay,hx,hy,(b.r||2)*.45))return false;
  /* A projectile that could have intercepted before contact also excludes
   * this bounded shortcut. AABB overlap is deliberately conservative. */
  var others=g.bullets||[];
  for(var bi=0;bi<others.length;bi++){
   var o=others[bi];if(!o||o===b||o.dead)continue;
   if(!Number.isFinite(o.x)||!Number.isFinite(o.y)||
      !Number.isFinite(o.vx)||!Number.isFinite(o.vy))return false;
   var ex=o.x+o.vx*dt*bestT,ey=o.y+o.vy*dt*bestT,pad=(b.r||0)+(o.r||0)+2;
   if(Math.min(ax,hx)-pad<=Math.max(o.x,ex)&&
      Math.max(ax,hx)+pad>=Math.min(o.x,ex)&&
      Math.min(ay,hy)-pad<=Math.max(o.y,ey)&&
      Math.max(ay,hy)+pad>=Math.min(o.y,ey))return false;
   /* A projectile may hit the chosen body from the side without crossing
    * this bullet's path. It can change HP/kill credit BEFORE first contact.
    * The fallback first-hit recovery must obey the same veto as piercing. */
   /* A competing projectile may reach the SAME drone from a different
    * direction without crossing our bullet corridor. Our guaranteed
    * overlap time is only an upper bound, so preserve earlier kill credit. */
   if(best.guaranteed&&o.ownerId!==best.e.id){
    var dr=best.e,dsx=dr.__novaChronoDronePrevX,
        dsy=dr.__novaChronoDronePrevY,rr=(o.r||2)+(dr.r||8)+1;
    if(!Number.isFinite(o.r)||!Number.isFinite(ex)||!Number.isFinite(ey)||
       Math.max(o.x,ex)+rr>=Math.min(dsx,dr.x)&&
       Math.min(o.x,ex)-rr<=Math.max(dsx,dr.x)&&
       Math.max(o.y,ey)+rr>=Math.min(dsy,dr.y)&&
       Math.min(o.y,ey)-rr<=Math.max(dsy,dr.y))return false;
   }
   if(best.kind==='tank'&&o.ownerId!==best.e.id){
    var td=CLASSES[best.e.cls];
    if(!td||!Number.isFinite(td.size)||
       !Number.isFinite(o.r)||!(o.r>0))return false;
    var rr=o.r+Math.max(0,td.size)+3,
        bx=best.e.x,by=best.e.y,
        sx=best.e.__novaSweepMoveTime===g.time?
           best.e.__novaSweepPrevX:bx,
        sy=best.e.__novaSweepMoveTime===g.time?
           best.e.__novaSweepPrevY:by;
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||
       !Number.isFinite(ex)||!Number.isFinite(ey))return false;
    if(Math.max(o.x,ex)+rr>=Math.min(sx,bx)&&
       Math.min(o.x,ex)-rr<=Math.max(sx,bx)&&
       Math.max(o.y,ey)+rr>=Math.min(sy,by)&&
       Math.min(o.y,ey)-rr<=Math.max(sy,by))return false;
   }
  }
  var vx=b.vx,vy=b.vy;
  b.x=hx;b.y=hy;b.px=hx;b.py=hy;
  if(best.kind==='tank'){
   var ang=Math.atan2(vy,vx);
   g.damageTank(best.e,b.dmg,b.ownerId,Math.cos(ang)*(b.knock||0)*.006,
     Math.sin(ang)*(b.knock||0)*.006);
  }else if(best.kind==='shape')g.damageShape(best.e,b.dmg,vx,vy);
  else g.damageDrone(best.e,b.dmg,b.ownerId);
  var piercingDrone=best.guaranteed&&b.pen>0;
  b.hits++;b.pen--;b.dead=true;b.vx=0;b.vy=0;
  if(piercingDrone){
   b.x=ax+dx*limit;b.y=ay+dy*limit;b.px=b.x;b.py=b.y;
  }
  return true;
 }
 /* Only skip a LATER terrain impact when a Cannon fuse is provably first.
  * Uncertain body, drone, projectile, expiry and breach chronology stays on
  * the original path; this is not a general event resolver. */
 function fuseDefinitelyBeforeTerrain(g,b,dt,ox,oy,nx,ny,hit){
  if(!b||!b.__v17Cannon||!(b.__v17FuseDist>0)||!(b.ttl>dt)||
     !(dt>0)||(b.hits||0)!==0||!(b.pen>=0)||b.pen>=2||
     b.__novaBreachAtTime===g.time||
     !Number.isFinite(b.__v17SpawnX)||!Number.isFinite(b.__v17SpawnY)||
     !Number.isFinite(ox)||!Number.isFinite(oy)||
     !Number.isFinite(nx)||!Number.isFinite(ny))return false;
  var dx=nx-ox,dy=ny-oy,A=dx*dx+dy*dy;
  if(!(A>1e-12))return false;
  var fx=ox-b.__v17SpawnX,fy=oy-b.__v17SpawnY,R=b.__v17FuseDist;
  var C=fx*fx+fy*fy-R*R,B=fx*dx+fy*dy;
  if(!(C<0)||!Number.isFinite(C)||!Number.isFinite(B)||
     Math.abs(C)<=1e-10*(fx*fx+fy*fy+R*R))return false;
  var D=B*B-A*C;
  if(!(D>0)||!Number.isFinite(D))return false;
  var root=Math.sqrt(D),fuseT=B>=0?-C/(B+root):(-B+root)/A;
  if(!(fuseT>=0&&fuseT<=1))return false;
  var wallT=((hit.x-ox)*dx+(hit.y-oy)*dy)/A;
  if(!(wallT>fuseT+1e-7&&wallT<=1+1e-7))return false;
  var px=ox+dx*fuseT,py=oy+dy*fuseT;
  /* The core checks the full-frame endpoint for arena exit before the
   * post-core fuse handler can fire. Do not skip a wall if that would
   * turn its existing burst into a silent out-of-bounds deletion. */
  if(Math.abs(px)>=MAP_LIMIT-20||Math.abs(py)>=MAP_LIMIT-20||
     Math.abs(nx)>=MAP_LIMIT-20||Math.abs(ny)>=MAP_LIMIT-20)return false;
  /* Battlefield captures live drone starts at Game.update entry. Unknown
   * births or discontinuous movement still retain original collision authority. */
  var drones=g.drones||[];
  var tanks=g.tanks||[],shapes=g.shapes||[],bullets=g.bullets||[];
  if(tanks.length+shapes.length+bullets.length>500)return false;
  var minx=Math.min(ox,nx),maxx=Math.max(ox,nx),
      miny=Math.min(oy,ny),maxy=Math.max(oy,ny);
  function near(x0,y0,x1,y1,pad){
   if(!Number.isFinite(x0)||!Number.isFinite(y0)||
      !Number.isFinite(x1)||!Number.isFinite(y1)||!Number.isFinite(pad))return true;
   return Math.max(x0,x1)+pad>=minx&&Math.min(x0,x1)-pad<=maxx&&
          Math.max(y0,y1)+pad>=miny&&Math.min(y0,y1)-pad<=maxy;
  }
  /* Only a witnessed, bounded drone corridor can be ruled out. A drone
   * near either endpoint, or moving through the projectile AABB, must defer.
   * The extra movement pad covers non-linear steering inside the frame. */
  for(var di=0;di<drones.length;di++){
   var dr=drones[di];if(!dr||!(dr.hp>0)||dr.ownerId===b.ownerId)continue;
   if(!g.__novaShapeSweepActive||
      dr.__novaChronoDroneEpoch!==g.__novaShapeSweepEpoch)return false;
   var dsx=dr.__novaChronoDronePrevX,dsy=dr.__novaChronoDronePrevY;
   if(!Number.isFinite(dsx)||!Number.isFinite(dsy)||
      !Number.isFinite(dr.x)||!Number.isFinite(dr.y))return false;
   var ddx=dr.x-dsx,ddy=dr.y-dsy;
   if(ddx*ddx+ddy*ddy>96*96)return false;
   if(dr.speed!=null&&!Number.isFinite(dr.speed))return false;
   var motionBound=Math.max(800,(dr.speed>0?dr.speed*4:800));
   if(near(dsx,dsy,dr.x,dr.y,
      Math.max(0,dr.r||8)+(b.r||2)+1+
      Math.max(30,dt*motionBound)))return false;
  }
  for(var ti=0;ti<tanks.length;ti++){
   var t=tanks[ti];if(!t||!t.alive||t.id===b.ownerId)continue;
   var def=CLASSES[t.cls],r=(def&&def.size||30)+(b.r||2)+3;
   var known=t.__novaSweepMoveTime===g.time;
   if(near(known?t.__novaSweepPrevX:t.x,known?t.__novaSweepPrevY:t.y,
           t.x,t.y,r+(known?0:Math.max(30,dt*800))))return false;
  }
  for(var si=0;si<shapes.length;si++){
   var s=shapes[si];if(!s||!(s.hp>0))continue;
   if(shapeWasTeleported(g,s))return false;
   var start=shapeSweepStart(g,s),r=(s.r||15)+(b.r||2);
   if(near(start?start.x:s.x,start?start.y:s.y,s.x,s.y,
           r+(start?0:Math.max(30,dt*800))))return false;
  }
  for(var bi=0;bi<bullets.length;bi++){
   var o=bullets[bi];if(!o||o===b||o.dead)continue;
   if(near(o.x,o.y,o.x+(o.vx||0)*dt,o.y+(o.vy||0)*dt,
           (o.r||2)+(b.r||2)+2))return false;
  }
  return true;
 }

 /* Physical-first TTL slice for an isolated Bomber shell. This does not
  * arbitrate contested contacts: it commits expiry only when every potentially
  * earlier wall/body/drone/projectile and newborn-fragment corridor is excluded.
  * The core otherwise retains authority until the full #147 solver lands. */
 function isolatedShellExpiry(g,b,dt,terrain){
  if(!b||b.dead||!b.shell||b.beam||b.__novaClusterBurstConsumed||
     typeof g.clusterBurst!=='function'||
     !(dt>0)||!(b.ttl>0&&b.ttl<dt-1e-9)||(b.hits||0)!==0||
     !(b.pen>=0)||b.__novaBreachAtTime===g.time||
     !Number.isFinite(b.x)||!Number.isFinite(b.y)||
     !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
     !Number.isFinite(b.r)||!Number.isFinite(b.ttl))return null;
  var x=b.x+b.vx*b.ttl,y=b.y+b.vy*b.ttl;
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  var remain=dt-b.ttl,childReach=360*remain+2.5;
  if(Math.abs(b.x)>=MAP_LIMIT-20||Math.abs(b.y)>=MAP_LIMIT-20||
     Math.abs(x)+childReach>=MAP_LIMIT-20||
     Math.abs(y)+childReach>=MAP_LIMIT-20)return null;
  /* Penetration upgrades do not extend physical TTL. This shortcut still
   * requires no earlier solid contact, breach, body, drone or projectile,
   * and keeps newborn fragments clear of nearby cover. */
  /* A programmed Cannon fuse may have already crossed before TTL. Keep
   * Three Disciplines authoritative, including its historical 2u tolerance. */
  if(b.__v17Cannon&&b.__v17FuseDist>0){
   if(!Number.isFinite(b.__v17SpawnX)||!Number.isFinite(b.__v17SpawnY)||
      Math.hypot(x-b.__v17SpawnX,y-b.__v17SpawnY)+2>=b.__v17FuseDist)return null;
  }
  if(firstSolidHit(g,b.x,b.y,x,y,(b.r||2)*.45))return null;
  /* Children travel at <=330u/s in the canonical cluster builder; Apex
   * rotates/clones those children without increasing speed. The 360u/s
   * clearance also covers their collision padding and numerical margin. */
  for(var ti=0;ti<terrain.length;ti++){
   var wall=terrain[ti];if(!solidAlive(wall))continue;
   var distance=wall.shape==='circle'
     ?Math.max(0,Math.hypot(x-wall.x,y-wall.y)-(wall.r||0))
     :Math.hypot(Math.max(0,Math.abs(x-wall.x)-(wall.w||0)*.5),
                 Math.max(0,Math.abs(y-wall.y)-(wall.h||0)*.5));
   if(!(distance>childReach))return null;
  }
  var sx=Math.min(b.x,x),ex=Math.max(b.x,x),
      sy=Math.min(b.y,y),ey=Math.max(b.y,y);
  function near(x0,y0,x1,y1,pad){
   if(!Number.isFinite(x0)||!Number.isFinite(y0)||
      !Number.isFinite(x1)||!Number.isFinite(y1)||
      !Number.isFinite(pad))return true;
   return Math.max(x0,x1)+pad>=sx&&Math.min(x0,x1)-pad<=ex&&
          Math.max(y0,y1)+pad>=sy&&Math.min(y0,y1)-pad<=ey;
  }
  var tanks=g.tanks||[],shapes=g.shapes||[],drones=g.drones||[],
      bullets=g.bullets||[];
  if(tanks.length+shapes.length+drones.length+bullets.length>600)return null;
  for(var i=0;i<tanks.length;i++){
   var t=tanks[i];if(!t||!t.alive)continue;
   var known=t.__novaSweepMoveTime===g.time;
   var tx=known?t.__novaSweepPrevX:t.x,ty=known?t.__novaSweepPrevY:t.y;
   if(near(tx,ty,t.x,t.y,childReach+85+(known?0:dt*2000)))return null;
  }
  for(var j=0;j<shapes.length;j++){
   var shape=shapes[j];if(!shape||!(shape.hp>0))continue;
   if(shapeWasTeleported(g,shape))return null;
   var start=shapeSweepStart(g,shape);
   if(near(start?start.x:shape.x,start?start.y:shape.y,shape.x,shape.y,
      childReach+(shape.r||15)+35+(start?0:dt*2000)))return null;
  }
  for(var k=0;k<drones.length;k++){
   var d=drones[k];if(!d||!(d.hp>0)||d.ownerId===b.ownerId)continue;
   if(!g.__novaShapeSweepActive||
      d.__novaChronoDroneEpoch!==g.__novaShapeSweepEpoch)return null;
   var dx=d.__novaChronoDronePrevX,dy=d.__novaChronoDronePrevY;
   if(!Number.isFinite(dx)||!Number.isFinite(dy)||
      !Number.isFinite(d.x)||!Number.isFinite(d.y)||
      Math.hypot(d.x-dx,d.y-dy)>96)return null;
   if(near(dx,dy,d.x,d.y,childReach+(d.r||8)+30+dt*1600))return null;
  }
  for(var q=0;q<bullets.length;q++){
   var other=bullets[q];if(!other||other===b||other.dead)continue;
   if(near(other.x,other.y,other.x+(other.vx||0)*dt,
           other.y+(other.vy||0)*dt,childReach+(other.r||2)+16))return null;
  }
  return {x:x,y:y,ttl:b.ttl,remain:remain};
 }
 /* A bounded, spatially local proof for several independent piercing shots.
  * Do not spend the global budget on unrelated distant projectiles. Preflight
  * every eligible shot before committing ANY extra damage: if the entire
  * batch cannot be checked within the same conservative work ceiling, all
  * shots retain the legacy engine's authority (no first-N array bias).
  * This is a cheap O(shots * bullets) prefilter, NOT a general event solver. */
 function localStationaryPiercingPlan(g,dt,nonExpiring){
  var bullets=g.bullets||[],shots=[],bodyCost=(g.tanks||[]).length+
      (g.shapes||[]).length+(g.drones||[]).length;
  if(!(dt>0)||!Number.isFinite(dt))return null;
  for(var i=0;i<bullets.length;i++){
   var b=bullets[i];
   if(!b||b.dead||b.shell||b.beam||b.splash||b.__v17Cannon)continue;
   if(nonExpiring ? b.ttl>dt&&b.pen===1&&(b.hits||0)===0 :
      b.ttl>0&&b.ttl<=dt&&
       (b.pen>=1||(b.pen===0&&(b.hits||0)>0)))shots.push(b);
  }
  /* The optional multi-hit proof is useful only when a shot can reach
   * enough distinct hulls. Remote piercing rounds still belong to the
   * ordinary engine and MUST remain in every local interception query.
   * Count conservative swept-AABB possibilities, not speculative hits.
   * Track shared hulls across ALL shots (including discarded ones): a
   * one-hull shot can still kill a victim before another shot arrives. */
  if(shots.length<2)return null;
  var tanks=g.tanks||[];
  if(tanks.length){
   if(shots.length*tanks.length>12000)return null;
   var eligible=[],possible=new Map(),targetUsers=new Map();
   for(var ps=0;ps<shots.length;ps++){
    var pb=shots[ps],span=nonExpiring?dt:pb.ttl;
    if(!(span>0)||!Number.isFinite(span)||
       !Number.isFinite(pb.x)||!Number.isFinite(pb.y)||
       !Number.isFinite(pb.vx)||!Number.isFinite(pb.vy)||
       !Number.isFinite(pb.r)||!(pb.r>0))return null;
    var bx=pb.x+pb.vx*span,by=pb.y+pb.vy*span;
    if(!Number.isFinite(bx)||!Number.isFinite(by))return null;
    var lx=Math.min(pb.x,bx),hx=Math.max(pb.x,bx),
        ly=Math.min(pb.y,by),hy=Math.max(pb.y,by),targets=[];
    for(var pt=0;pt<tanks.length;pt++){
     var target=tanks[pt];
     if(!target||!target.alive||target.id===pb.ownerId)continue;
     var cls=CLASSES[target.cls],sz=cls&&Number.isFinite(cls.size)?
        Math.max(0,cls.size):120;
     var pad=pb.r+sz+3,tx=target.x,ty=target.y,
         sx=target.__novaSweepMoveTime===g.time?target.__novaSweepPrevX:tx,
         sy=target.__novaSweepMoveTime===g.time?target.__novaSweepPrevY:ty;
     if(!Number.isFinite(tx)||!Number.isFinite(ty)||
        !Number.isFinite(sx)||!Number.isFinite(sy))return null;
     if(Math.max(tx,sx)+pad>=lx&&Math.min(tx,sx)-pad<=hx&&
        Math.max(ty,sy)+pad>=ly&&Math.min(ty,sy)-pad<=hy){
      targets.push(target);
      targetUsers.set(target,(targetUsers.get(target)||0)+1);
     }
    }
    possible.set(pb,targets);
    if(targets.length>=(nonExpiring?2:((pb.hits||0)>0?1:2)))
     eligible.push(pb);
   }
   /* A discarded one-hit projectile may still change another shot's
    * victim. Preserve the original shared-target batch veto. */
   for(var es=0;es<eligible.length;es++){
    var touched=possible.get(eligible[es]);
    for(var et=0;et<touched.length;et++)
     if(targetUsers.get(touched[et])>1)return null;
   }
   shots=eligible;
  }
  /* Bound full projectile scans only for shots that can benefit from them. */
  if(!shots.length||shots.length*bullets.length>12000)return null;
  var plan=new Map(),work=0,seenTargets=new Set();
  for(var si=0;si<shots.length;si++){
   var b=shots[si],travelT=nonExpiring?dt:b.ttl;
   if(!(travelT>0)||!Number.isFinite(travelT)||
      !Number.isFinite(b.x)||!Number.isFinite(b.y)||
      !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
      !Number.isFinite(b.r)||!(b.r>0))return null;
   var ex=b.x+b.vx*travelT,ey=b.y+b.vy*travelT;
   if(!Number.isFinite(ex)||!Number.isFinite(ey))return null;
   var minx=Math.min(b.x,ex),maxx=Math.max(b.x,ex),
       miny=Math.min(b.y,ey),maxy=Math.max(b.y,ey),local=[];
   /* If two shots might contact the same hull, their damage and defense
    * changes are not independent. Defer the whole batch rather than let
    * projectile array order decide which shortcut runs first. */
   var tanks=g.tanks||[];
   for(var ti=0;ti<tanks.length;ti++){
    var t=tanks[ti];if(!t||!t.alive||t.id===b.ownerId)continue;
    var def=CLASSES[t.cls],size=def&&Number.isFinite(def.size)?
       Math.max(0,def.size):120;
    var pad=b.r+size+3,tx=t.x,ty=t.y,
        px=t.__novaSweepMoveTime===g.time?t.__novaSweepPrevX:tx,
        py=t.__novaSweepMoveTime===g.time?t.__novaSweepPrevY:ty;
    if(!Number.isFinite(tx)||!Number.isFinite(ty)||
       !Number.isFinite(px)||!Number.isFinite(py))return null;
    if(Math.max(tx,px)+pad>=minx&&Math.min(tx,px)-pad<=maxx&&
       Math.max(ty,py)+pad>=miny&&Math.min(ty,py)-pad<=maxy){
     if(seenTargets.has(t))return null;
     seenTargets.add(t);
    }
   }
   var threatTargets=possible&&possible.get(b)||[];
   for(var bi=0;bi<bullets.length;bi++){
    var o=bullets[bi];if(!o||o===b||o.dead)continue;
    var ox=o.x,oy=o.y,tx=ox+(o.vx||0)*dt,
        ty=oy+(o.vy||0)*dt,pad=(o.r||2)+b.r+2;
    /* Unknown motion must remain a veto candidate, never be discarded.
     * A bullet outside THIS projectile's narrow corridor may nevertheless
     * already overlap one of its victim hulls. Keep it in the local proof
     * set so damage order cannot be silently reversed. */
    var compete=!Number.isFinite(ox)||!Number.isFinite(oy)||
       !Number.isFinite(tx)||!Number.isFinite(ty)||
       !Number.isFinite(pad)||
       (Math.max(ox,tx)+pad>=minx&&Math.min(ox,tx)-pad<=maxx&&
        Math.max(oy,ty)+pad>=miny&&Math.min(oy,ty)-pad<=maxy);
    if(!compete)for(var ht=0;ht<threatTargets.length;ht++){
     var hull=threatTargets[ht];
     if(o.ownerId===hull.id)continue;
     var hd=CLASSES[hull.cls],hr=(o.r||2)+
       (hd&&Number.isFinite(hd.size)?Math.max(0,hd.size):120)+3;
     if(Math.max(ox,tx)+hr>=hull.x&&Math.min(ox,tx)-hr<=hull.x&&
        Math.max(oy,ty)+hr>=hull.y&&Math.min(oy,ty)-hr<=hull.y){
      compete=true;break;
     }
    }
    if(compete)local.push(o);
   }
   var cost=bodyCost+local.length+1;
   if(cost>ISOLATED_RECOVERY_SCAN_CAP||(work+=cost)>900)return null;
   plan.set(b,local);
  }
  return plan;
 }
 var oldUpdateBullets=Game.prototype.updateBullets;Game.prototype.updateBullets=function(dt){var terrain=ensureTerrain(this);
 /* Bound pairwise geometry per frame, not total bullets: one expiring shot
  * remains eligible in a crowded but spatially separated firefight. When
  * projected work is too high, defer ALL shots to the existing path rather
  * than introducing arbitrary array-order fairness. */

 /* Commit only isolated first-event expirations. Scale newborn fragment
  * motion for this one frame, then restore full velocity; their TTL receives
  * the same birth-time adjustment. The core still owns ordinary collisions. */
 var ttlChildren=[];
 var shellWork=0;
 if(dt>0&&this.bullets&&this.bullets.length){
  for(var countS=0;countS<this.bullets.length;countS++){
   var shellS=this.bullets[countS];
   if(shellS&&shellS.shell&&shellS.ttl>0&&shellS.ttl<dt)shellWork++;
  }
  var work=shellWork*(this.bullets.length+(this.tanks||[]).length+
      (this.shapes||[]).length+(this.drones||[]).length+(terrain||[]).length);
  if(work>0&&work<=2500)for(var si=this.bullets.length-1;si>=0;si--){
   var shell=this.bullets[si],expiry=isolatedShellExpiry(this,shell,dt,terrain);
   if(!expiry)continue;
   var childStart=this.bullets.length;
   shell.x=expiry.x;shell.y=expiry.y;shell.px=expiry.x;shell.py=expiry.y;
   this.clusterBurst(shell);
   for(var ci=childStart;ci<this.bullets.length;ci++){
    var child=this.bullets[ci];if(!child||child.dead)continue;
    ttlChildren.push({child:child,vx:child.vx,vy:child.vy});
    child.vx*=expiry.remain/dt;child.vy*=expiry.remain/dt;
    if(Number.isFinite(child.ttl))child.ttl+=expiry.ttl;
   }
   shell.dead=true;shell.shell=false;shell.vx=0;shell.vy=0;
  }
 }
 var expiring=0,paired=0;
 if(dt>0)for(var countI=0;countI<this.bullets.length;countI++){
  var eb=this.bullets[countI];
  if(eb&&!eb.dead&&!eb.shell&&!eb.beam&&!eb.splash&&!eb.__v17Cannon&&eb.ttl>0&&eb.ttl<=dt)expiring++;
  if(eb&&!eb.dead&&!eb.shell&&!eb.beam&&!eb.splash&&!eb.__v17Cannon&&
     eb.ttl>dt&&eb.pen===1&&(eb.hits||0)===0)paired++;
 }
 var bodyWork=this.bullets.length+(this.tanks||[]).length+
   (this.shapes||[]).length+(this.drones||[]).length;
 var projected=expiring*bodyWork;
 var legacyExpiring=projected>0&&(projected<=900||
    (expiring===1&&bodyWork<=ISOLATED_RECOVERY_SCAN_CAP));
 var localExpiring=!legacyExpiring&&expiring>1?
    localStationaryPiercingPlan(this,dt,false):null;
 if(legacyExpiring||localExpiring)
  for(var pre=this.bullets.length-1;pre>=0;pre--){
   var expiringBullet=this.bullets[pre];
   if(localExpiring){
    if(localExpiring.has(expiringBullet))
     isolatedTTLStationaryPiercingChain(this,expiringBullet,dt,false,
      localExpiring.get(expiringBullet));
   }else if(!isolatedTTLStationaryPiercingChain(this,expiringBullet,dt))
    isolatedTTLBodyContact(this,expiringBullet,dt);
  }
 /* Non-expiring pen=1 shots may exhaust both contacts within this frame.
  * Reuse the identical physical-first-contact proof, but only when the
  * entire penetration budget is consumed before the frame boundary.
  * A surviving or uncertain round stays with the original engine. */
 var legacyPaired=paired>0&&(paired*bodyWork<=900||
    (paired===1&&bodyWork<=ISOLATED_RECOVERY_SCAN_CAP));
 var localPaired=!legacyPaired&&paired>1?
    localStationaryPiercingPlan(this,dt,true):null;
 if(legacyPaired||localPaired)
  for(var pair=this.bullets.length-1;pair>=0;pair--){
   var liveBullet=this.bullets[pair];
   if(liveBullet&&liveBullet.ttl>dt){
    if(localPaired){
     if(localPaired.has(liveBullet))
      isolatedTTLStationaryPiercingChain(this,liveBullet,dt,true,
       localPaired.get(liveBullet));
    }else isolatedTTLStationaryPiercingChain(this,liveBullet,dt,true);
   }
  }
 for(var i=0;i<this.bullets.length;i++){var b=this.bullets[i];if(!b||b.dead)continue;var ox=b.x,oy=b.y,sweepDt=dt;/* Terrain beyond physical projectile lifetime is unreachable, including shells. */if(Number.isFinite(b.ttl)){if(b.ttl<=0)continue;sweepDt=Math.min(dt,b.ttl);}var nx=ox+(b.vx||0)*sweepDt,ny=oy+(b.vy||0)*sweepDt,fh=firstSolidHit(this,ox,oy,nx,ny,(b.r||2)*.45);if(!fh)continue;if(fuseDefinitelyBeforeTerrain(this,b,dt,ox,oy,nx,ny,fh.hit))continue;var s=fh.solid,h=fh.hit;b.x=h.x;b.y=h.y;b.px=b.x;b.py=b.y;var broken=false;if(s.destructible){broken=damageCover(this,s,b.dmg,b.ownerId,h.x,h.y,b);if(broken&&b.pen>=2){b.pen-=2;if(this.weakenBullet)this.weakenBullet(b,(b.maxHp||b.dmg)*.38);if(!b.dead){b.__novaBreachAtTime=this.time;b.x=ox;b.y=oy;b.px=ox;b.py=oy;continue;}}}
   /* The core still advances a dead bullet before removing it; a shell may
     * expire or leave the arena in that pass. Consume its one-time burst now. */
    if(b.shell&&this.clusterBurst){var childStart=this.bullets.length;this.clusterBurst(b);clearTerrainBurstChildren(this,s,h,childStart);b.shell=false;}if(b.splash&&this.splashAt)this.splashAt(h.x,h.y,b.splash,b.splashDmg||.4,b.ownerId,b.knock||0,b.color,b.dmg);b.dead=true;if(this.addFlash)this.addFlash(h.x,h.y,s.destructible?'#8fd4ff':'#b9c7e7',Math.min(46,14+(b.dmg||0)*.24));if(this.cam&&b.dmg>42)this.cam.shake=Math.max(this.cam.shake,.08);/* The materialized core still advances dead bullets before removing them. Freeze a terrain-killed projectile at its impact so its final trail cannot leak through cover. Breaching live shots keep their velocity above. */b.vx=0;b.vy=0;
 }
 var out;try{out=oldUpdateBullets.call(this,dt);}finally{for(var ci=0;ci<ttlChildren.length;ci++){var saved=ttlChildren[ci];saved.child.vx=saved.vx;saved.child.vy=saved.vy;}}for(var j=0;j<terrain.length;j++){var q=terrain[j];if(q.flash>0)q.flash=Math.max(0,q.flash-dt);}return out;};

 var splashBullet={shell:true,beam:false,vx:0,vy:0};
 var oldSplash=Game.prototype.splashAt;Game.prototype.splashAt=function(x,y,radius,frac,ownerId,knock,color,dmg){var out=oldSplash.apply(this,arguments),a=terrainCandidates(this,x,y,x,y,radius);for(var i=0;i<a.length;i++){var s=a[i];if(!s.destructible||s.hp<=0)continue;var dx=Math.max(Math.abs(x-s.x)-(s.shape==='rect'?s.w*.5:s.r),0),dy=Math.max(Math.abs(y-s.y)-(s.shape==='rect'?s.h*.5:s.r),0),dist=Math.hypot(dx,dy);if(dist>radius)continue;var fall=1-clamp(dist/Math.max(1,radius),0,1)*.55;damageCover(this,s,(dmg||0)*(frac||.4)*fall,ownerId,x,y,splashBullet);}return out;};

 var oldUpdateDrones=Game.prototype.updateDrones;Game.prototype.updateDrones=function(dt){ensureTerrain(this);
 /* Optional observation only: base drone motion and terrain correction are
  * separate stages. These checkpoints are NOT time-stamped collision paths. */
 var traceOn=this.__novaDroneChronoTraceEnabled===true&&this.__novaShapeSweepActive===true;
 var out=oldUpdateDrones.call(this,dt);for(var j=0;j<this.drones.length;j++){
 var d=this.drones[j];
 var traced=traceOn&&d&&d.__novaChronoDroneEpoch===this.__novaShapeSweepEpoch;
 if(traced){d.__novaChronoDroneBaseX=d.x;d.__novaChronoDroneBaseY=d.y;}
 var hit=circleResolve(this,d,(d.r||8)+1);if(hit){if(d.__novaPhase==='dash'){d.__novaPhase='recover';d.__novaPhaseT=Math.max(.28,d.__novaPhaseT||0);d.__novaCommitted=false;d.__novaTarget=null;if(this.addParticles)this.addParticles(d.x,d.y,d.color,4,65,'spark');}var n=d.__novaTerrainBump,side=d.__novaTerrainBias||(((d.id||0)&1)?1:-1);d.__novaTerrainBias=side;if(n){d.x+=-n.y*side*28*dt;d.y+=n.x*side*28*dt;}circleResolve(this,d,(d.r||8)+1);
  /* Rectangle/circle contact is inclusive in isTerrainSafe. The legacy
   * resolver lands exactly on the padded face, which the later Live Vector
   * repair/peel sweep interprets as embedded and can freeze there. Release
   * only a confirmed terrain-contact drone by a tiny outward clearance,
   * and only when the candidate point is actually terrain-safe. */
  var pad=(d.r||8)+1,normal=d.__novaTerrainBump;
  if(!safePoint(this,d.x,d.y,pad)&&normal&&
     Number.isFinite(normal.x)&&Number.isFinite(normal.y)){
    var nx=d.x+normal.x*.001,ny=d.y+normal.y*.001;
    if(safePoint(this,nx,ny,pad)){d.x=nx;d.y=ny;}
  }
 }
 if(traced){d.__novaChronoDroneTerrainX=d.x;d.__novaChronoDroneTerrainY=d.y;
  d.__novaChronoDroneTraceEpoch=this.__novaShapeSweepEpoch;}}
   var spotMap=this.__novaSpotterByOwner||(this.__novaSpotterByOwner=new Map());spotMap.clear();for(var di=0;di<this.drones.length;di++){var sd=this.drones[di];if(sd&&sd.__novaSpotter&&!spotMap.has(sd.ownerId))spotMap.set(sd.ownerId,sd);}
   for(var ti=0;ti<this.tanks.length;ti++){var o=this.tanks[ti];if(!o||!o.alive||o.__novaSpotterContactId==null||o.__novaSpotterContactId<0)continue;var target=this.getTank(o.__novaSpotterContactId),spot=spotMap.get(o.id)||null;if(target&&spot&&!lineOfSight(this,spot.x,spot.y,target.x,target.y,2)){o.__novaSpotterContactId=-1;o.__novaSpotterContactUntil=0;o.__novaSpotterDroneId=-1;}}
 return out;};

 var oldUpdate=Game.prototype.update;Game.prototype.update=function(dt){ensureTerrain(this);var epoch=(this.__novaShapeSweepEpoch||0)+1;this.__novaShapeSweepEpoch=epoch;
 /* Capture drones before AI/drone movement; the later projectile pre-pass
  * may only exclude drones whose complete observed corridor is remote. */
 var chronoDrones=this.drones||[];for(var di=0;di<chronoDrones.length;di++){
  var cd=chronoDrones[di];if(!cd||!(cd.hp>0))continue;
  cd.__novaChronoDroneEpoch=epoch;
  cd.__novaChronoDronePrevX=cd.x;cd.__novaChronoDronePrevY=cd.y;
  /* Snapshot the actual motion envelope before the core/Controller stages
   * can change speed or enter/leave a committed dash. No interpolation or
   * stage checkpoint is treated as an authoritative contact timestamp. */
  cd.__novaChronoDronePrevSpeed=cd.speed;
  cd.__novaChronoDronePrevPhase=cd.__novaPhase;
  cd.__novaChronoDronePrevCommitted=!!cd.__novaCommitted;
  cd.__novaChronoDronePrevV=Math.max(
   Math.hypot(cd.__novaVX||0,cd.__novaVY||0),
   Math.hypot(cd.__lvVX||0,cd.__lvVY||0),
   Math.hypot(cd.__novaIdleVX||0,cd.__novaIdleVY||0));
  /* Start is recorded even without diagnostics for the existing conservative
   * collision gate; optional stages are kept separate from this authority. */
  if(this.__novaDroneChronoTraceEnabled===true){
   cd.__novaChronoDroneTraceEpoch=-1;cd.__novaChronoDroneRouteEpoch=-1;cd.__novaChronoDroneLiveEpoch=-1;
  }
 }
 var shapes=this.shapes||[];for(var si=0;si<shapes.length;si++){var sh=shapes[si];if(!sh)continue;sh.__novaShapeSweepEpoch=epoch;sh.__novaShapeSweepPrevX=sh.x;sh.__novaShapeSweepPrevY=sh.y;}this.__novaShapeSweepActive=true;if(this.__novaBattlefield&&!this.__novaBattlefield.announced&&this.status==='playing'&&this.time>.1){this.__novaBattlefield.announced=true;if(this.toast)this.toast('¦ BATTLEFIELD · '+this.__novaBattlefield.name+'  COVER CHANGES THE FIGHT','info');}
   var out;try{out=oldUpdate.call(this,dt);}finally{this.__novaShapeSweepActive=false;}for(var i=0;i<this.shapes.length;i++){var s=this.shapes[i];if(!s||s.hp<=0)continue;circleResolve(this,s,(s.r||10)*.86);}return out;};
});

wrap('game/ai',function(ai){var old=ai.updateAI;if(!old||old.__novaBattlefieldAI)return;function patched(t,g,dt){if(t&&t.ai&&t.ai.targetId>=0){var tar=g.getTank&&g.getTank(t.ai.targetId);if(tar&&tar.alive&&g.hasLineOfSight&&!g.hasLineOfSight(t.x,t.y,tar.x,tar.y,3)){t.ai.__novaOccluded=(t.ai.__novaOccluded||0)+dt;if(t.ai.__novaOccluded>.28){t.ai.targetId=-1;t.ai.state='wander';t.ai.thinkT=0;t.ai.fireHold=Math.max(t.ai.fireHold||0,.18);}}else t.ai.__novaOccluded=Math.max(0,(t.ai.__novaOccluded||0)-dt*2);}var out=old(t,g,dt);if(t&&t.__novaTerrainBumpT>0){t.__novaTerrainBumpT-=dt;if(t.ai&&t.__novaTerrainBumpT>0&&Math.random()<dt*4){t.ai.strafe=(t.ai.strafe||1)*-1;t.ai.thinkT=0;}}return out;}patched.__novaBattlefieldAI=true;ai.updateAI=patched;});

wrap('game/render',function(render){var old=render.render;if(!old||old.__novaBattlefieldRender)return;function patched(g,w,h){old(g,w,h);if(g&&g.ctx)drawTerrain(g.ctx,g,w,h);}patched.__novaBattlefieldRender=true;render.render=patched;});

window.__NOVA_BATTLEFIELD_PERF_TEST__={candidateCount:function(g,x,y,pad){return terrainCandidates(g,x,y,x,y,pad||0).length;},circleResolve:circleResolve};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' terrain and line-of-sight online');
})();
