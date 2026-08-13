/* NOVA TANKS v1.6.0 — Battlefield
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
function lineOfSight(g,ax,ay,bx,by,pad){pad=pad||1;var a=terrainCandidates(g,ax,ay,bx,by,pad);for(var i=0;i<a.length;i++){var h=solidHit(a[i],ax,ay,bx,by,pad);if(h&&h.t>0.015&&h.t<1.01)return false;}return true;}
function firstSolidHit(g,ax,ay,bx,by,pad){pad=pad||0;var a=terrainCandidates(g,ax,ay,bx,by,pad),bestS=null,bestH=null;for(var i=0;i<a.length;i++){var s=a[i],h=solidHit(s,ax,ay,bx,by,pad);if(h&&(!bestH||h.t<bestH.t)){bestS=s;bestH=h;}}return bestH?{solid:bestS,hit:bestH}:null;}
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
 Game.prototype.hasLineOfSight=function(ax,ay,bx,by,pad){return lineOfSight(this,ax,ay,bx,by,pad||2);};
 Game.prototype.firstTerrainHit=function(ax,ay,bx,by,pad){return firstSolidHit(this,ax,ay,bx,by,pad||0);};
 Game.prototype.isTerrainSafe=function(x,y,pad){return safePoint(this,x,y,pad||40);};

 var oldSpawnPlayer=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(){ensureTerrain(this);var out=oldSpawnPlayer.apply(this,arguments);var p=this.player;if(p&&!safePoint(this,p.x,p.y,terrainRadiusForTank(p,CLASSES)+32)){for(var i=0;i<40;i++){var a=Math.random()*TAU,r=700+Math.random()*1100,x=Math.cos(a)*r,y=Math.sin(a)*r;if(safePoint(this,x,y,terrainRadiusForTank(p,CLASSES)+45)){p.x=x;p.y=y;break;}}}return out;};
 var oldRandSpawn=Game.prototype.randSpawnPos;Game.prototype.randSpawnPos=function(minDist){ensureTerrain(this);for(var i=0;i<34;i++){var p=oldRandSpawn.call(this,minDist);if(safePoint(this,p.x,p.y,75))return p;}return oldRandSpawn.call(this,minDist);};
 var oldSpawnShape=Game.prototype.spawnShape;Game.prototype.spawnShape=function(type,anywhere){ensureTerrain(this);var before=this.shapes.length,out=oldSpawnShape.apply(this,arguments),s=this.shapes[this.shapes.length-1];if(this.shapes.length>before&&s&&!safePoint(this,s.x,s.y,(s.r||12)+12)){for(var i=0;i<24;i++){var p=this.randSpawnPos(260);if(safePoint(this,p.x,p.y,(s.r||12)+12)){s.x=p.x;s.y=p.y;break;}}}return out;};
 var oldSpawnPower=Game.prototype.spawnPowerup;Game.prototype.spawnPowerup=function(){ensureTerrain(this);var before=this.powerups.length,out=oldSpawnPower.apply(this,arguments),p=this.powerups[this.powerups.length-1];if(this.powerups.length>before&&p&&!safePoint(this,p.x,p.y,36)){for(var i=0;i<20;i++){var q=this.randSpawnPos(500);if(safePoint(this,q.x,q.y,36)){p.x=q.x;p.y=q.y;break;}}}return out;};

 var oldMove=Game.prototype.moveTank;Game.prototype.moveTank=function(t,vx,vy,dt){ensureTerrain(this);var ox=t.x,oy=t.y,out=oldMove.call(this,t,vx,vy,dt),r=terrainRadiusForTank(t,CLASSES),hit=circleResolve(this,t,r);if(hit){var moved=Math.hypot(t.x-ox,t.y-oy);if(!t.isPlayer&&t.ai){t.ai.__novaTerrainStuck=(t.ai.__novaTerrainStuck||0)+(moved<Math.hypot(vx,vy)*dt*.18?dt:0);if(t.ai.__novaTerrainStuck>.28){t.ai.strafe=(t.ai.strafe||1)*-1;t.ai.wanderA=(t.angle||0)+(t.ai.strafe||1)*(1.0+Math.random()*.65);t.ai.wanderT=.55+Math.random()*.7;t.ai.thinkT=0;t.ai.__novaTerrainStuck=0;}}else if(t.isPlayer&&this.sfx&&this.sfx.novaTerrainScrape&&Math.hypot(vx,vy)>45)this.sfx.novaTerrainScrape((t.x-(this.player?this.player.x:t.x))/600);}else if(t.ai)t.ai.__novaTerrainStuck=Math.max(0,(t.ai.__novaTerrainStuck||0)-dt*2);return out;};

 Game.prototype.nearestTank=function(x,y,max,excludeId){var best=null,bd=max*max;for(var i=0;i<this.tanks.length;i++){var t=this.tanks[i];if(!t||!t.alive||t.id===excludeId)continue;var q=d2(x,y,t.x,t.y);if(q>=bd)continue;if(!lineOfSight(this,x,y,t.x,t.y,3))continue;bd=q;best=t;}return best;};

 var oldTryFire=Game.prototype.tryFire;Game.prototype.tryFire=function(t){if(t&&!t.isPlayer&&t.ai&&t.ai.targetId>=0){var target=this.getTank(t.ai.targetId);if(target&&target.alive&&!lineOfSight(this,t.x,t.y,target.x,target.y,4)){t.__novaTerrainDeniedFire=true;t.__novaTerrainDeniedUntil=this.time+.15;return;}}return oldTryFire.apply(this,arguments);};

 var oldUpdateBullets=Game.prototype.updateBullets;Game.prototype.updateBullets=function(dt){var terrain=ensureTerrain(this);for(var i=0;i<this.bullets.length;i++){var b=this.bullets[i];if(!b||b.dead)continue;var nx=b.x+(b.vx||0)*dt,ny=b.y+(b.vy||0)*dt,fh=firstSolidHit(this,b.x,b.y,nx,ny,(b.r||2)*.45);if(!fh)continue;var s=fh.solid,h=fh.hit;b.x=h.x;b.y=h.y;b.px=b.x;b.py=b.y;var broken=false;if(s.destructible){broken=damageCover(this,s,b.dmg,b.ownerId,h.x,h.y,b);if(broken&&b.pen>=2){b.pen-=2;if(this.weakenBullet)this.weakenBullet(b,(b.maxHp||b.dmg)*.38);b.x=h.x+(b.vx||0)*.003;b.y=h.y+(b.vy||0)*.003;continue;}}
   if(b.shell&&this.clusterBurst)this.clusterBurst(b);if(b.splash&&this.splashAt)this.splashAt(h.x,h.y,b.splash,b.splashDmg||.4,b.ownerId,b.knock||0,b.color,b.dmg);b.dead=true;if(this.addFlash)this.addFlash(h.x,h.y,s.destructible?'#8fd4ff':'#b9c7e7',Math.min(46,14+(b.dmg||0)*.24));if(this.cam&&b.dmg>42)this.cam.shake=Math.max(this.cam.shake,.08);
 }
 var out=oldUpdateBullets.call(this,dt);for(var j=0;j<terrain.length;j++){var q=terrain[j];if(q.flash>0)q.flash=Math.max(0,q.flash-dt);}return out;};

 var splashBullet={shell:true,beam:false,vx:0,vy:0};
 var oldSplash=Game.prototype.splashAt;Game.prototype.splashAt=function(x,y,radius,frac,ownerId,knock,color,dmg){var out=oldSplash.apply(this,arguments),a=terrainCandidates(this,x,y,x,y,radius);for(var i=0;i<a.length;i++){var s=a[i];if(!s.destructible||s.hp<=0)continue;var dx=Math.max(Math.abs(x-s.x)-(s.shape==='rect'?s.w*.5:s.r),0),dy=Math.max(Math.abs(y-s.y)-(s.shape==='rect'?s.h*.5:s.r),0),dist=Math.hypot(dx,dy);if(dist>radius)continue;var fall=1-clamp(dist/Math.max(1,radius),0,1)*.55;damageCover(this,s,(dmg||0)*(frac||.4)*fall,ownerId,x,y,splashBullet);}return out;};

 var oldUpdateDrones=Game.prototype.updateDrones;Game.prototype.updateDrones=function(dt){ensureTerrain(this);var out=oldUpdateDrones.call(this,dt);for(var j=0;j<this.drones.length;j++){var d=this.drones[j],hit=circleResolve(this,d,(d.r||8)+1);if(hit){if(d.__novaPhase==='dash'){d.__novaPhase='recover';d.__novaPhaseT=Math.max(.28,d.__novaPhaseT||0);d.__novaCommitted=false;d.__novaTarget=null;if(this.addParticles)this.addParticles(d.x,d.y,d.color,4,65,'spark');}var n=d.__novaTerrainBump,side=d.__novaTerrainBias||(((d.id||0)&1)?1:-1);d.__novaTerrainBias=side;if(n){d.x+=-n.y*side*28*dt;d.y+=n.x*side*28*dt;}circleResolve(this,d,(d.r||8)+1);}}
   var spotMap=this.__novaSpotterByOwner||(this.__novaSpotterByOwner=new Map());spotMap.clear();for(var di=0;di<this.drones.length;di++){var sd=this.drones[di];if(sd&&sd.__novaSpotter&&!spotMap.has(sd.ownerId))spotMap.set(sd.ownerId,sd);}
   for(var ti=0;ti<this.tanks.length;ti++){var o=this.tanks[ti];if(!o||!o.alive||o.__novaSpotterContactId==null||o.__novaSpotterContactId<0)continue;var target=this.getTank(o.__novaSpotterContactId),spot=spotMap.get(o.id)||null;if(target&&spot&&!lineOfSight(this,spot.x,spot.y,target.x,target.y,2)){o.__novaSpotterContactId=-1;o.__novaSpotterContactUntil=0;o.__novaSpotterDroneId=-1;}}
 return out;};

 var oldUpdate=Game.prototype.update;Game.prototype.update=function(dt){ensureTerrain(this);if(this.__novaBattlefield&&!this.__novaBattlefield.announced&&this.status==='playing'&&this.time>.1){this.__novaBattlefield.announced=true;if(this.toast)this.toast('▦ BATTLEFIELD · '+this.__novaBattlefield.name+' — COVER CHANGES THE FIGHT','info');}
   var out=oldUpdate.call(this,dt);for(var i=0;i<this.shapes.length;i++){var s=this.shapes[i];if(!s||s.hp<=0)continue;circleResolve(this,s,(s.r||10)*.86);}return out;};
});

wrap('game/ai',function(ai){var old=ai.updateAI;if(!old||old.__novaBattlefieldAI)return;function patched(t,g,dt){if(t&&t.ai&&t.ai.targetId>=0){var tar=g.getTank&&g.getTank(t.ai.targetId);if(tar&&tar.alive&&g.hasLineOfSight&&!g.hasLineOfSight(t.x,t.y,tar.x,tar.y,3)){t.ai.__novaOccluded=(t.ai.__novaOccluded||0)+dt;if(t.ai.__novaOccluded>.28){t.ai.targetId=-1;t.ai.state='wander';t.ai.thinkT=0;t.ai.fireHold=Math.max(t.ai.fireHold||0,.18);}}else t.ai.__novaOccluded=Math.max(0,(t.ai.__novaOccluded||0)-dt*2);}var out=old(t,g,dt);if(t&&t.__novaTerrainBumpT>0){t.__novaTerrainBumpT-=dt;if(t.ai&&t.__novaTerrainBumpT>0&&Math.random()<dt*4){t.ai.strafe=(t.ai.strafe||1)*-1;t.ai.thinkT=0;}}return out;}patched.__novaBattlefieldAI=true;ai.updateAI=patched;});

wrap('game/render',function(render){var old=render.render;if(!old||old.__novaBattlefieldRender)return;function patched(g,w,h){old(g,w,h);if(g&&g.ctx)drawTerrain(g.ctx,g,w,h);}patched.__novaBattlefieldRender=true;render.render=patched;});

window.__NOVA_BATTLEFIELD_PERF_TEST__={candidateCount:function(g,x,y,pad){return terrainCandidates(g,x,y,x,y,pad||0).length;},circleResolve:circleResolve};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' terrain and line-of-sight online');
})();
