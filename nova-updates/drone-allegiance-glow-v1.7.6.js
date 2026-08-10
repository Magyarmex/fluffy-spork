/* NOVA TANKS v1.7.6 — IFF Halo
 * Reinforced allegiance readability for drones: friendly/owned = blue, hostile = red.
 * Purely visual; targeting, damage, ownership and drone AI are unchanged.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.7.6] module registry unavailable');return;}
var VERSION='1.7.6',CODENAME='IFF Halo';
var FRIENDLY='#4da8ff',HOSTILE='#ff4d62',HALO_ALPHA=.18,CORE_ALPHA=.30;
window.__NOVA_DRONE_IFF_RELEASE__={
 version:VERSION,
 codename:CODENAME,
 date:'2026-08-09',
 headline:'Drone allegiance reads at a glance without flattening each drone into a team-colored blob.',
 groups:{
  'IFF readability':['Owned and allied drones receive a broader blue allegiance halo plus a tighter blue core-light.','Hostile drones receive the same two-stage cue in red.','The stronger outer light survives crowded fights and motion blur, while the smaller core keeps allegiance readable when drones overlap.','The native class-color body/glow remains visible between the two IFF layers, preserving lineage identity.'],
  'Safety and performance':['The layer changes rendering only; ownership, targeting, damage and AI behavior are untouched.','Off-screen drones are culled before any allegiance draw call, and both IFF passes reuse NOVA\'s existing cached glow sprites in the same drone loop.']
 }
};
function wrap(id,after){var original=mods[id];if(!original)return;mods[id]=function(module,exports,require){original(module,exports,require);after(module.exports,require);};}
function ownerOf(g,d){return g&&g.tankById&&g.tankById.get?g.tankById.get(d.ownerId):null;}
function sameSide(a,b){
 var keys=['teamId','team','factionId','faction','side'];
 for(var i=0;i<keys.length;i++){
  var k=keys[i];
  if(a&&b&&a[k]!=null&&b[k]!=null)return a[k]===b[k];
 }
 return null;
}
function relation(g,d){
 var p=g&&g.player;if(!p||!d)return 0;
 if(d.ownerId===p.id)return 1;
 var o=ownerOf(g,d);if(!o||o.alive===false)return 0;
 if(typeof g.areAllies==='function'&&g.areAllies(p,o))return 1;
 if(typeof g.areHostile==='function')return g.areHostile(p,o)?-1:0;
 var side=sameSide(p,o);if(side!==null)return side?1:-1;
 return -1;
}
function drawIFF(g,w,h,glowSprite){
 if(!g||!g.ctx||!g.player||!g.cam||!g.drones||!g.drones.length)return;
 var ctx=g.ctx,cam=g.cam,zoom=cam.zoom||1,dpr=g.dpr||1;
 var halfW=w/(2*zoom),halfH=h/(2*zoom),pad=78;
 var x0=cam.x-halfW-pad,x1=cam.x+halfW+pad,y0=cam.y-halfH-pad,y1=cam.y+halfH+pad;
 ctx.save();
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.translate(w/2,h/2);
 ctx.scale(zoom,zoom);
 ctx.translate(-cam.x,-cam.y);
 ctx.globalCompositeOperation='lighter';
 for(var i=0;i<g.drones.length;i++){
  var d=g.drones[i];
  if(!d||d.hp<=0||d.x<x0||d.x>x1||d.y<y0||d.y>y1)continue;
  var rel=relation(g,d);if(!rel)continue;
  var col=rel>0?FRIENDLY:HOSTILE;
  var outer=d.role==='hunter'?31:24,inner=d.role==='hunter'?18:14,sprite=glowSprite(col);
  ctx.globalAlpha=HALO_ALPHA;
  ctx.drawImage(sprite,d.x-outer,d.y-outer,outer*2,outer*2);
  ctx.globalAlpha=CORE_ALPHA;
  ctx.drawImage(sprite,d.x-inner,d.y-inner,inner*2,inner*2);
 }
 ctx.restore();
}
wrap('game/render',function(render){
 if(!render||typeof render.render!=='function'||typeof render.glowSprite!=='function'||render.__novaDroneIFF)return;
 render.__novaDroneIFF=true;
 var oldRender=render.render,glowSprite=render.glowSprite;
 render.render=function(g,w,h){oldRender(g,w,h);drawIFF(g,w,h,glowSprite);};
});
window.__NOVA_DRONE_IFF_TEST__={relation:relation,sameSide:sameSide,friendlyColor:FRIENDLY,hostileColor:HOSTILE,alpha:HALO_ALPHA,coreAlpha:CORE_ALPHA};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' drone allegiance linked');
})();
