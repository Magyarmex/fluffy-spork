/* NOVA TANKS v1.7.6 — IFF Halo
 * Subtle allegiance readability for drones: friendly/owned = blue, hostile = red.
 * Purely visual; targeting, damage, ownership and drone AI are unchanged.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.7.6] module registry unavailable');return;}
var VERSION='1.7.6',CODENAME='IFF Halo';
var FRIENDLY='#4da8ff',HOSTILE='#ff4d62',HALO_ALPHA=.13;
window.__NOVA_DRONE_IFF_RELEASE__={
 version:VERSION,
 codename:CODENAME,
 date:'2026-08-08',
 headline:'Drone allegiance reads at a glance without turning the arena into neon outlines.',
 groups:{
  'IFF readability':['Owned and allied drones receive a faint blue halo.','Hostile drones receive the same faint halo in red.','The cue is deliberately broader and dimmer than the drone\'s native class-color glow, preserving lineage identity while adding allegiance information.'],
  'Safety and performance':['The layer changes rendering only; ownership, targeting, damage and AI behavior are untouched.','Off-screen drones are culled before any allegiance draw call, and the renderer reuses NOVA\'s existing cached glow sprites.']
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
 // NOVA is currently free-for-all: a live non-player owner is hostile unless
 // a future team/faction system explicitly says otherwise above.
 return -1;
}
function drawIFF(g,w,h,glowSprite){
 if(!g||!g.ctx||!g.player||!g.cam||!g.drones||!g.drones.length)return;
 var ctx=g.ctx,cam=g.cam,zoom=cam.zoom||1,dpr=g.dpr||1;
 var halfW=w/(2*zoom),halfH=h/(2*zoom),pad=72;
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
  var r=d.role==='hunter'?27:20;
  ctx.globalAlpha=HALO_ALPHA;
  ctx.drawImage(glowSprite(col),d.x-r,d.y-r,r*2,r*2);
 }
 ctx.restore();
}
wrap('game/render',function(render){
 if(!render||typeof render.render!=='function'||typeof render.glowSprite!=='function'||render.__novaDroneIFF)return;
 render.__novaDroneIFF=true;
 var oldRender=render.render,glowSprite=render.glowSprite;
 render.render=function(g,w,h){oldRender(g,w,h);drawIFF(g,w,h,glowSprite);};
});
window.__NOVA_DRONE_IFF_TEST__={relation:relation,sameSide:sameSide,friendlyColor:FRIENDLY,hostileColor:HOSTILE,alpha:HALO_ALPHA};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' drone allegiance linked');
})();
