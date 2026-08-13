/* NOVA TANKS v1.7.2 — Blast Cover Hardening
 * Resolves wall-surface explosion ambiguity by sampling physical first-hit
 * geometry from a tiny source-side offset. Loaded after Combined Arms.
 * Performance hardening: scalar exposure sampling and reusable blast context.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods)return;
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaBlastHardening)return;Game.prototype.__novaBlastHardening=true;
  var C=require('./classes').CLASSES||{};
  function size(t){return ((t&&C[t.cls]&&C[t.cls].size)||15);}
  function clear(g,x,y,tx,ty){
    if(!g.firstTerrainHit)return true;
    var dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1,sx=x-dx/d*3.5,sy=y-dy/d*3.5;
    return !g.firstTerrainHit(sx,sy,tx,ty,1.35);
  }
  function exposure(g,t,x,y){
    var dx=t.x-x,dy=t.y-y,d=Math.hypot(dx,dy)||1,px=-dy/d,py=dx/d,r=size(t)*.58,e=0;
    if(clear(g,x,y,t.x,t.y))e+=.56;
    if(clear(g,x,y,t.x+px*r,t.y+py*r))e+=.22;
    if(clear(g,x,y,t.x-px*r,t.y-py*r))e+=.22;
    return clamp(e,0,1);
  }
  Game.prototype.novaHardBlastExposure=function(t,x,y){return exposure(this,t,x,y);};
  var oldSplash=Game.prototype.splashAt;
  Game.prototype.splashAt=function(x,y,radius){
    var c=this.__v172HardBlast||(this.__v172HardBlast={active:false,x:0,y:0,radius:0}),pa=c.active,px=c.x,py=c.y,pr=c.radius;
    c.active=true;c.x=x;c.y=y;c.radius=radius||0;
    try{return oldSplash.apply(this,arguments);}finally{c.active=pa;c.x=px;c.y=py;c.radius=pr;}
  };
  var oldDamage=Game.prototype.damageTank;
  Game.prototype.damageTank=function(t,dmg,srcId,kx,ky){
    var c=this.__v172HardBlast;if(!c||!c.active||!t||!t.alive)return oldDamage.apply(this,arguments);
    var e=exposure(this,t,c.x,c.y);if(e<=.001)return 0;
    var soft=this.__v172BlastContext,softActive=soft&&soft.active;if(soft)soft.active=false;
    try{return oldDamage.call(this,t,dmg*e,srcId,(kx||0)*e,(ky||0)*e);}finally{if(soft)soft.active=softActive;}
  };
});
window.__NOVA_BLAST_HARDENING__={version:'1.7.2'};
console.info('[NOVA TANKS] v1.7.2 blast-cover hardening linked');
})();
