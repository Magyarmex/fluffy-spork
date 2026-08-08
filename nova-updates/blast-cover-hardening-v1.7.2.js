/* NOVA TANKS v1.7.2 — Blast Cover Hardening
 * Resolves wall-surface explosion ambiguity by sampling physical first-hit
 * geometry from a tiny source-side offset. Loaded after Combined Arms.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods)return;
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function norm(x,y){var d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaBlastHardening)return;Game.prototype.__novaBlastHardening=true;
  var C=require('./classes').CLASSES||{};
  function size(t){return ((t&&C[t.cls]&&C[t.cls].size)||15);}
  function clear(g,x,y,tx,ty){
    if(!g.firstTerrainHit)return true;
    var d=norm(tx-x,ty-y),sx=x-d.x*3.5,sy=y-d.y*3.5;
    var h=g.firstTerrainHit(sx,sy,tx,ty,1.35);
    return !h;
  }
  function exposure(g,t,x,y){
    var d=norm(t.x-x,t.y-y),px=-d.y,py=d.x,r=size(t)*.58;
    var s=[{x:t.x,y:t.y,w:.56},{x:t.x+px*r,y:t.y+py*r,w:.22},{x:t.x-px*r,y:t.y-py*r,w:.22}],e=0;
    for(var i=0;i<s.length;i++)if(clear(g,x,y,s[i].x,s[i].y))e+=s[i].w;
    return clamp(e,0,1);
  }
  Game.prototype.novaHardBlastExposure=function(t,x,y){return exposure(this,t,x,y);};
  var oldSplash=Game.prototype.splashAt;
  Game.prototype.splashAt=function(x,y,radius){var prev=this.__v172HardBlast;this.__v172HardBlast={x:x,y:y,radius:radius||0};try{return oldSplash.apply(this,arguments);}finally{this.__v172HardBlast=prev;}};
  var oldDamage=Game.prototype.damageTank;
  Game.prototype.damageTank=function(t,dmg,srcId,kx,ky){
    var c=this.__v172HardBlast;if(!c||!t||!t.alive)return oldDamage.apply(this,arguments);
    var e=exposure(this,t,c.x,c.y);
    if(e<=.001)return 0;
    var soft=this.__v172BlastContext;this.__v172BlastContext=null;
    try{return oldDamage.call(this,t,dmg*e,srcId,(kx||0)*e,(ky||0)*e);}finally{this.__v172BlastContext=soft;}
  };
});
window.__NOVA_BLAST_HARDENING__={version:'1.7.2'};
console.info('[NOVA TANKS] v1.7.2 blast-cover hardening linked');
})();
