/* NOVA TANKS v1.9.0 — Hardlight Foundry
 * Whole-game visual quality pass: arena surface language, fortification detail,
 * chassis material accents, neutral-shape facets, powerup housings and restrained
 * screen finishing. Decorative only: no simulation, targeting, visibility or stats.
 */
(function(){
'use strict';
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.9.0] module registry unavailable');return;}
if(window.__NOVA_VISUAL_OVERHAUL__)return;

var VERSION='1.9.0',CODENAME='Hardlight Foundry',TAU=Math.PI*2,ARENA_HALF=2250;
var LINEAGE_COLORS={gunner:'#65e8ff',cannon:'#ffb35b',sniper:'#c69aff',controller:'#83f0aa',guardian:'#ff8fcf',scout:'#a8d8ff'};
window.__NOVA_VERSION=VERSION;
window.__NOVA_VISUAL_OVERHAUL__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'The arena gets a material pass: cleaner machinery, richer surfaces and more deliberate light.',
  groups:{
    'Arena Surface':['World-anchored service seams, inspection marks, perimeter segmentation and persistent breach scorch make empty floor read as a constructed combat space instead of a flat backdrop.','Decorative marks are deterministic and culled to the camera, so the ground does not shimmer or reshuffle while moving.'],
    'Vehicles and Drones':['Visible tank hulls gain restrained panel seams, rivets, specular arcs, damage scoring and lineage-tinted material accents without changing silhouettes or hit readability.','Controller and escort drones gain tiny chassis cores and directional noses while retaining the existing allegiance glow as the primary team-read signal.'],
    'Battlefield Materials':['Walls, pillars and destructible cover gain hardware seams, recessed plates, bolts and damage-aware hazard details layered onto Battlefield geometry.','Destroyed cover leaves a darker under-surface scar beneath persistent rubble instead of disappearing into a clean floor.'],
    'World Objects':['Neutral shapes gain inner facets and mineral cores; powerups gain compact mechanical housings and orbit indicators while preserving their existing icons and colors.'],
    'Image Finish':['A cached edge vignette and faint glass grain add depth to the frame without per-frame gradient allocation or obscuring the central combat space. Low quality automatically uses a lighter decorative budget.'],
    'Fair Play':['Decorative entity accents obey terrain visibility checks and nearby-cover clearance, preventing the graphics layer from revealing tanks, drones, shapes or pickups through fortifications.']
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hash2(x,y){var n=(x*374761393+y*668265263)|0;n=(n^(n>>>13))*1274126177|0;return ((n^(n>>>16))>>>0)/4294967295;}
function colorFor(t,classes){if(t.__v190MaterialClass===t.cls&&t.__v190MaterialColor)return t.__v190MaterialColor;var lin=null;try{lin=classes.lineageForClass(t.cls);}catch(_){}var col=LINEAGE_COLORS[lin||'scout']||(t.color||'#9ee7ff');t.__v190MaterialClass=t.cls;t.__v190MaterialColor=col;return col;}
function onScreen(x,y,r,w,h){return x+r>=-24&&x-r<=w+24&&y+r>=-24&&y-r<=h+24;}
function terrainVisible(g,x,y,pad){if(!g||!g.player)return true;if(g.hasLineOfSight&&!g.hasLineOfSight(g.player.x,g.player.y,x,y,Math.max(1,pad||2)))return false;return true;}
function terrainClear(g,x,y,pad){return !g.isTerrainSafe||g.isTerrainSafe(x,y,pad||18);}
function d2(ax,ay,bx,by){var dx=bx-ax,dy=by-ay;return dx*dx+dy*dy;}
function floorClear(g,x,y,rad,classes){
  if(!terrainClear(g,x,y,rad))return false;var ts=g.tanks||[],ss=g.shapes||[],ds=g.drones||[],ps=g.powerups||[];
  for(var i=0;i<ts.length;i++){var t=ts[i];if(!t||t.alive===false)continue;var def=classes.CLASSES&&classes.CLASSES[t.cls],rr=rad+((def&&def.size)||15)+7;if(d2(x,y,t.x,t.y)<rr*rr)return false;}
  for(var j=0;j<ss.length;j++){var sh=ss[j];if(!sh||sh.hp<=0)continue;var sr=rad+(sh.r||12)+5;if(d2(x,y,sh.x,sh.y)<sr*sr)return false;}
  for(var k=0;k<ds.length;k++){var dr=ds[k];if(!dr||dr.hp<=0)continue;var rr2=rad+(dr.r||7)+4;if(d2(x,y,dr.x,dr.y)<rr2*rr2)return false;}
  for(var q=0;q<ps.length;q++){var pu=ps[q];if(!pu)continue;var pr=rad+28;if(d2(x,y,pu.x,pu.y)<pr*pr)return false;}
  return true;
}

function ensureFinish(g,w,h){
  var c=g.__v190FinishCache,dpr=g.dpr||1;
  if(c&&c.w===w&&c.h===h&&c.dpr===dpr&&c.quality===g.quality)return c;
  if(typeof document==='undefined'||!document.createElement)return null;
  var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w));canvas.height=Math.max(1,Math.ceil(h));
  var x=canvas.getContext&&canvas.getContext('2d');if(!x)return null;
  var rg=x.createRadialGradient(w*.5,h*.47,Math.min(w,h)*.18,w*.5,h*.47,Math.max(w,h)*.72);
  rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(.62,'rgba(0,0,0,.018)');rg.addColorStop(1,'rgba(0,4,13,.22)');
  x.fillStyle=rg;x.fillRect(0,0,w,h);
  var step=5,grainAlpha=g.quality==='low'?.010:.016;
  x.fillStyle='rgba(185,225,255,'+grainAlpha+')';
  for(var gy=2;gy<h;gy+=step)for(var gx=((gy/step)&1)?2:4;gx<w;gx+=step*2){if(hash2(gx,gy)>.77)x.fillRect(gx,gy,1,1);}
  x.strokeStyle='rgba(112,203,255,.055)';x.lineWidth=1;
  x.beginPath();x.moveTo(16,1);x.lineTo(Math.min(86,w*.18),1);x.moveTo(w-16,1);x.lineTo(Math.max(w-86,w*.82),1);x.stroke();
  c={w:w,h:h,dpr:dpr,quality:g.quality,canvas:canvas};g.__v190FinishCache=c;return c;
}

function drawArenaUnderlay(g,ctx,w,h,classes){
  var cam=g.cam||{x:0,y:0,zoom:1},z=cam.zoom||1;
  var x0=cam.x-w*.5/z,x1=cam.x+w*.5/z,y0=cam.y-h*.5/z,y1=cam.y+h*.5/z;
  var spacing=g.quality==='low'?720:480;
  var ix0=Math.floor(x0/spacing)-1,ix1=Math.ceil(x1/spacing)+1,iy0=Math.floor(y0/spacing)-1,iy1=Math.ceil(y1/spacing)+1;
  ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.lineCap='round';

  /* Persistent scars where destructible cover has been breached. The footprint
   * paints only while clear, so the post-render decal never sits over a unit. */
  var terrain=g.__novaTerrain||[];
  for(var ti=0;ti<terrain.length;ti++){
    var s=terrain[ti];if(!s||!s.destructible||s.hp>0)continue;
    var spx=(s.x-cam.x)*z+w*.5,spy=(s.y-cam.y)*z+h*.5,sw=(s.w||s.r*2)*z,sh=(s.h||s.r*2)*z;
    if(!onScreen(spx,spy,Math.max(sw,sh)*.6,w,h)||!floorClear(g,s.x,s.y,Math.max((s.w||s.r*2),(s.h||s.r*2))*.38,classes))continue;
    ctx.save();ctx.translate(spx,spy);ctx.globalAlpha=.44;ctx.fillStyle='rgba(3,8,12,.74)';ctx.strokeStyle='rgba(68,142,165,.18)';ctx.lineWidth=Math.max(.7,z);
    if(s.shape==='circle'){ctx.beginPath();ctx.ellipse(0,3*z,s.r*z*.9,s.r*z*.58,0,0,TAU);ctx.fill();ctx.stroke();}
    else{var rw=sw*.88,rh=sh*.62;ctx.fillRect(-rw*.5,-rh*.5,rw,rh);ctx.strokeRect(-rw*.5,-rh*.5,rw,rh);}
    ctx.restore();
  }

  /* World-anchored service wear. Hashing tile coordinates makes the surface
   * stable across frames and avoids both random shimmer and retained arrays. */
  ctx.lineWidth=1;ctx.globalAlpha=g.quality==='low'?.11:.16;
  for(var ix=ix0;ix<=ix1;ix++)for(var iy=iy0;iy<=iy1;iy++){
    var h0=hash2(ix,iy),wx=ix*spacing+(h0-.5)*spacing*.42,wy=iy*spacing+(hash2(iy,ix)-.5)*spacing*.42;
    if(Math.abs(wx)>ARENA_HALF-90||Math.abs(wy)>ARENA_HALF-90)continue;
    var px=(wx-cam.x)*z+w*.5,py=(wy-cam.y)*z+h*.5;if(!onScreen(px,py,34,w,h)||!floorClear(g,wx,wy,24,classes))continue;
    var a=h0*TAU,len=(g.quality==='low'?9:14)+(hash2(ix+17,iy-9)*10),dx=Math.cos(a)*len,dy=Math.sin(a)*len;
    ctx.strokeStyle=h0>.52?'rgba(89,174,205,.50)':'rgba(95,111,151,.42)';ctx.beginPath();ctx.moveTo(px-dx*.5,py-dy*.5);ctx.lineTo(px+dx*.5,py+dy*.5);ctx.stroke();
    if(g.quality!=='low'&&h0>.62){ctx.fillStyle='rgba(143,215,236,.36)';ctx.fillRect(px+dy*.28-1,py-dx*.28-1,1.4,1.4);}
  }

  /* Segmented arena perimeter. It is functional geometry already; this merely
   * makes the edge feel engineered when it enters the camera. */
  var left=(-ARENA_HALF-cam.x)*z+w*.5,right=(ARENA_HALF-cam.x)*z+w*.5,top=(-ARENA_HALF-cam.y)*z+h*.5,bottom=(ARENA_HALF-cam.y)*z+h*.5;
  ctx.globalAlpha=.34;ctx.strokeStyle='rgba(78,207,240,.48)';ctx.lineWidth=1;ctx.setLineDash([11,13]);ctx.beginPath();
  if(left>-12&&left<w+12){ctx.moveTo(left,Math.max(0,top));ctx.lineTo(left,Math.min(h,bottom));}
  if(right>-12&&right<w+12){ctx.moveTo(right,Math.max(0,top));ctx.lineTo(right,Math.min(h,bottom));}
  if(top>-12&&top<h+12){ctx.moveTo(Math.max(0,left),top);ctx.lineTo(Math.min(w,right),top);}
  if(bottom>-12&&bottom<h+12){ctx.moveTo(Math.max(0,left),bottom);ctx.lineTo(Math.min(w,right),bottom);}
  ctx.stroke();ctx.setLineDash([]);ctx.restore();
}

function drawTerrainHardware(g,ctx,w,h){
  var a=g.__novaTerrain||[],cam=g.cam||{x:0,y:0,zoom:1},z=cam.zoom||1;
  for(var i=0;i<a.length;i++){
    var s=a[i];if(!s||s.solid===false||(s.destructible&&s.hp<=0))continue;
    var px=(s.x-cam.x)*z+w*.5,py=(s.y-cam.y)*z+h*.5,ww=(s.w||s.r*2)*z,hh=(s.h||s.r*2)*z,r=Math.max(ww,hh)*.55;
    if(!onScreen(px,py,r,w,h))continue;
    var frac=s.destructible?clamp(s.hp/Math.max(1,s.maxHp),0,1):1;
    ctx.save();ctx.translate(px,py);ctx.lineWidth=Math.max(.7,z*.78);ctx.globalAlpha=.64;
    if(s.shape==='circle'){
      var rr=s.r*z,ir=rr*.62;ctx.strokeStyle=s.destructible?'rgba(108,225,244,.38)':'rgba(151,174,216,.26)';ctx.beginPath();ctx.arc(0,0,ir,0,TAU);ctx.stroke();
      for(var k=0;k<4;k++){var aa=k*Math.PI*.5+Math.PI*.25,bx=Math.cos(aa)*rr*.76,by=Math.sin(aa)*rr*.76;ctx.fillStyle='rgba(198,226,239,.42)';ctx.beginPath();ctx.arc(bx,by,Math.max(1,1.35*z),0,TAU);ctx.fill();}
      ctx.strokeStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.moveTo(-ir*.7,0);ctx.lineTo(ir*.7,0);ctx.moveTo(0,-ir*.7);ctx.lineTo(0,ir*.7);ctx.stroke();
    }else{
      var x=-ww*.5,y=-hh*.5,bolt=Math.max(1,1.25*z),mx=ww*.38,my=hh*.34;
      ctx.fillStyle='rgba(190,221,236,.36)';
      ctx.beginPath();ctx.arc(-mx,-my,bolt,0,TAU);ctx.arc(mx,-my,bolt,0,TAU);ctx.arc(-mx,my,bolt,0,TAU);ctx.arc(mx,my,bolt,0,TAU);ctx.fill();
      ctx.strokeStyle=s.destructible?'rgba(105,225,244,'+(.22+.2*frac)+')':'rgba(141,170,214,.22)';
      ctx.beginPath();if(ww>hh*1.35){ctx.moveTo(x+ww*.32,y+hh*.18);ctx.lineTo(x+ww*.32,y+hh*.82);ctx.moveTo(x+ww*.68,y+hh*.18);ctx.lineTo(x+ww*.68,y+hh*.82);}else if(hh>ww*1.35){ctx.moveTo(x+ww*.18,y+hh*.32);ctx.lineTo(x+ww*.82,y+hh*.32);ctx.moveTo(x+ww*.18,y+hh*.68);ctx.lineTo(x+ww*.82,y+hh*.68);}else{ctx.strokeRect(x+ww*.24,y+hh*.24,ww*.52,hh*.52);}ctx.stroke();
      if(s.destructible&&frac<.62){ctx.globalAlpha=.26+(1-frac)*.28;ctx.strokeStyle='rgba(255,184,95,.72)';ctx.lineWidth=Math.max(1,z);var stripe=Math.max(7,13*z);ctx.beginPath();for(var q=-ww*.34;q<ww*.34;q+=stripe){ctx.moveTo(q-5*z,hh*.39);ctx.lineTo(q+5*z,hh*.31);}ctx.stroke();}
    }
    ctx.restore();
  }
}

function drawTankMaterial(g,ctx,t,classes,w,h){
  if(!t||t.alive===false)return;var def=classes.CLASSES&&classes.CLASSES[t.cls];if(!def)return;
  var z=(g.cam&&g.cam.zoom)||1,r=(def.size||15)*z,px=(t.x-g.cam.x)*z+w*.5,py=(t.y-g.cam.y)*z+h*.5;
  if(!onScreen(px,py,r+18,w,h)||!terrainClear(g,t.x,t.y,(def.size||15)+8))return;
  if(!t.isPlayer&&!terrainVisible(g,t.x,t.y,4))return;
  var ghost=(t.cls==='ghost'||t.cls==='specter'||t.cls==='assassin')&&!t.moving&&t.cloakT<=0;
  var col=colorFor(t,classes),a=t.angle||0,ux=Math.cos(a),uy=Math.sin(a),nx=-uy,ny=ux;
  ctx.save();ctx.translate(px,py);ctx.globalAlpha=ghost?.11:(t.isPlayer?.86:.62);ctx.lineCap='round';
  ctx.strokeStyle='rgba(230,246,255,.55)';ctx.lineWidth=Math.max(.7,z*.72);ctx.beginPath();ctx.arc(-r*.12,-r*.12,r*.47,-2.62,-1.05);ctx.stroke();
  ctx.strokeStyle=col;ctx.globalAlpha*=.68;ctx.beginPath();ctx.moveTo(nx*r*.48-ux*r*.10,ny*r*.48-uy*r*.10);ctx.lineTo(nx*r*.22+ux*r*.16,ny*r*.22+uy*r*.16);ctx.moveTo(-nx*r*.48-ux*r*.10,-ny*r*.48-uy*r*.10);ctx.lineTo(-nx*r*.22+ux*r*.16,-ny*r*.22+uy*r*.16);ctx.stroke();
  ctx.fillStyle='rgba(225,245,255,.62)';ctx.globalAlpha=ghost?.08:(t.isPlayer?.52:.34);var br=Math.max(.8,1.15*z);for(var i=0;i<3;i++){var aa=a+Math.PI*.67+i*Math.PI*.33;ctx.beginPath();ctx.arc(Math.cos(aa)*r*.52,Math.sin(aa)*r*.52,br,0,TAU);ctx.fill();}
  var hp=t.maxHp?clamp(t.hp/t.maxHp,0,1):1;if(hp<.58&&!ghost){ctx.globalAlpha=.25+(1-hp)*.28;ctx.strokeStyle='rgba(255,198,158,.78)';ctx.lineWidth=Math.max(.8,z);var seed=(t.id||1)*.73;for(var d=0;d<(hp<.3?2:1);d++){var da=seed+d*1.9,ox=Math.cos(da)*r*.16,oy=Math.sin(da)*r*.16;ctx.beginPath();ctx.moveTo(ox-r*.18,oy-r*.12);ctx.lineTo(ox+r*.04,oy+r*.08);ctx.lineTo(ox+r*.17,oy-r*.03);ctx.stroke();}}
  ctx.restore();
}

function drawShapeFacets(g,ctx,s,types,w,h){
  if(!s||s.hp<=0||!terrainVisible(g,s.x,s.y,2)||!terrainClear(g,s.x,s.y,(s.r||12)+4))return;
  var z=(g.cam&&g.cam.zoom)||1,r=(s.r||12)*z,px=(s.x-g.cam.x)*z+w*.5,py=(s.y-g.cam.y)*z+h*.5;if(!onScreen(px,py,r+10,w,h))return;
  var sides=s.type==='triangle'?3:s.type==='square'?4:s.type==='pentagon'?5:s.type==='hexagon'?6:6,col=types.SHAPE_DEFS&&types.SHAPE_DEFS[s.type]?types.SHAPE_DEFS[s.type].color:'#9ee7ff';
  var rot=(s.rot||0)+(g.time||0)*.06;
  ctx.save();ctx.translate(px,py);ctx.globalAlpha=.36;ctx.strokeStyle='rgba(240,249,255,.72)';ctx.lineWidth=Math.max(.65,z*.7);ctx.beginPath();for(var i=0;i<sides;i++){var a=rot+i/sides*TAU,x=Math.cos(a)*r*.48,y=Math.sin(a)*r*.48;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();
  ctx.globalAlpha=.34;ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,0,Math.max(1.3,r*.105),0,TAU);ctx.fill();
  if(g.quality!=='low'&&r>15){ctx.globalAlpha=.22;ctx.strokeStyle=col;ctx.beginPath();for(var j=0;j<sides;j++){var a2=rot+j/sides*TAU;ctx.moveTo(Math.cos(a2)*r*.48,Math.sin(a2)*r*.48);ctx.lineTo(0,0);}ctx.stroke();}
  ctx.restore();
}

function drawPowerHousing(g,ctx,p,w,h){
  if(!p||!terrainVisible(g,p.x,p.y,3)||!terrainClear(g,p.x,p.y,20))return;
  var z=(g.cam&&g.cam.zoom)||1,px=(p.x-g.cam.x)*z+w*.5,py=(p.y-g.cam.y)*z+h*.5+Math.sin((g.time||0)*3+p.id)*4*z;if(!onScreen(px,py,34,w,h))return;
  var col=(g.powerColors&&g.powerColors[p.type])||'#9ee7ff',r=23*z,ang=(g.time||0)*.52+(p.id||0);
  ctx.save();ctx.translate(px,py);ctx.globalAlpha=p.ttl<4?(Math.sin((g.time||0)*12)>0?.70:.18):.62;ctx.strokeStyle=col;ctx.lineWidth=Math.max(.8,z);ctx.setLineDash([Math.max(3,5*z),Math.max(3,6*z)]);ctx.beginPath();ctx.arc(0,0,r,-.4,TAU-.7);ctx.stroke();ctx.setLineDash([]);
  ctx.globalAlpha*=.82;ctx.fillStyle='rgba(235,250,255,.86)';ctx.beginPath();ctx.arc(Math.cos(ang)*r,Math.sin(ang)*r,Math.max(1.1,1.65*z),0,TAU);ctx.fill();
  ctx.globalAlpha=.32;ctx.strokeStyle='rgba(220,242,255,.72)';ctx.strokeRect(-10*z,-10*z,20*z,20*z);ctx.restore();
}

function drawDroneChassis(g,ctx,d,w,h){
  if(!d||d.hp<=0)return;var owner=g.tankById&&g.tankById.get(d.ownerId);if(!owner)return;if(!owner.isPlayer&&!terrainVisible(g,d.x,d.y,2))return;if(!terrainClear(g,d.x,d.y,(d.r||7)+3))return;
  var z=(g.cam&&g.cam.zoom)||1,r=(d.r||7)*z,px=(d.x-g.cam.x)*z+w*.5,py=(d.y-g.cam.y)*z+h*.5;if(!onScreen(px,py,r+8,w,h))return;
  var vx=d.vx||0,vy=d.vy||0,a=Math.hypot(vx,vy)>8?Math.atan2(vy,vx):(owner.angle||0),col=owner.isPlayer?'#aef8c6':'#ff9aa7';
  ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.globalAlpha=.5;ctx.strokeStyle='rgba(231,248,255,.70)';ctx.lineWidth=Math.max(.6,z*.65);ctx.beginPath();ctx.moveTo(r*.58,0);ctx.lineTo(-r*.18,-r*.32);ctx.lineTo(-r*.18,r*.32);ctx.closePath();ctx.stroke();ctx.globalAlpha=.42;ctx.fillStyle=col;ctx.beginPath();ctx.arc(-r*.05,0,Math.max(.9,r*.16),0,TAU);ctx.fill();ctx.restore();
}

function drawEntityFinish(g,ctx,w,h,classes,types){
  var ts=g.tanks||[],ss=g.shapes||[],ps=g.powerups||[],ds=g.drones||[];
  for(var i=0;i<ss.length;i++)drawShapeFacets(g,ctx,ss[i],types,w,h);
  for(var j=0;j<ps.length;j++)drawPowerHousing(g,ctx,ps[j],w,h);
  for(var k=0;k<ds.length;k++)drawDroneChassis(g,ctx,ds[k],w,h);
  for(var q=0;q<ts.length;q++)drawTankMaterial(g,ctx,ts[q],classes,w,h);
}

function drawFinish(g,ctx,w,h){var c=ensureFinish(g,w,h);if(!c)return;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.globalAlpha=g.quality==='low'?.70:1;ctx.drawImage(c.canvas,0,0,w,h);ctx.restore();}

wrap('game/render',function(render,require){
  var old=render.render;if(!old||old.__novaHardlightFoundry)return;
  var classes=require('./classes'),types=require('./types');
  function patched(g,w,h){
    old(g,w,h);
    if(!g||!g.ctx)return;
    var ctx=g.ctx;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);
    drawArenaUnderlay(g,ctx,w,h,classes);
    drawTerrainHardware(g,ctx,w,h);
    if(g.player&&g.player.alive!==false)drawEntityFinish(g,ctx,w,h,classes,types);
    ctx.restore();
    drawFinish(g,ctx,w,h);
  }
  patched.__novaHardlightFoundry=true;render.render=patched;
});

window.__NOVA_VISUAL_OVERHAUL_TEST__={hash2:hash2,terrainVisible:terrainVisible,terrainClear:terrainClear,version:VERSION};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' visual overhaul online');
})();