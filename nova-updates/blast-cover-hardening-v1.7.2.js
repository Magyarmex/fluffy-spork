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
  function size(t){return t&&t.kind!=='tank'&&t.r>0?t.r:((t&&C[t.cls]&&C[t.cls].size)||15);}
  function clear(g,x,y,tx,ty){
    if(!g.firstTerrainHit)return true;
    /* Physical face-exit handling lives in Battlefield; backing away from
     * the source can move outward explosions inside their impact wall. */
    return !g.firstTerrainHit(x,y,tx,ty,.001);
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
    var c=this.__v172HardBlast||(this.__v172HardBlast={active:false,x:0,y:0,radius:0,targets:[]}),pa=c.active,px=c.x,py=c.y,pr=c.radius;
    c.active=true;c.x=x;c.y=y;c.radius=radius||0;
    /* Core splash directly subtracts shape HP, bypassing damageTank cover.
     * Divert all combat candidates, preserve their original query order and
     * exact core falloff, and reuse damageTank's existing cover wrapper.
     * Core retains its audio, visual and screen-shake effects. */
    var targets=pa?[]:(c.targets||(c.targets=[]));targets.length=0;
    var hash=this.hash,oldQuery=hash&&hash.query,hadQuery=hash&&Object.prototype.hasOwnProperty.call(hash,'query');
    var expanded=false,self=this,temporary=[];
    var ts=this.tanks||[];
    for(var i=0;i<ts.length;i++){
      var t=ts[i];
      if(t&&t.r==null){t.r=size(t);temporary.push(t);}
    }
    if(hash&&typeof oldQuery==='function'){
      var hook=function(qx,qy,qr,out){
        if(hash.query===hook&&!expanded&&out===self.tmp&&qx===x&&qy===y&&qr===radius){
          expanded=true;
          var result=oldQuery.call(this,qx,qy,qr+33,out),write=0;
          for(var k=0;k<out.length;k++){
            var e=out[k];
            if(e&&(e.kind==='shape'||e.kind==='tank'||e.kind==='drone'))targets.push(e);
            else out[write++]=e;
          }
          out.length=write;
          return result;
        }
        return oldQuery.apply(this,arguments);
      };
      hash.query=hook;
    }
    try{
      var result=oldSplash.apply(this,arguments),frac=arguments[3],ownerId=arguments[4],dmg=arguments[7];
      for(var j=0;j<targets.length;j++){
        var e=targets[j];
        if(!e)continue;
        var d=Math.hypot(e.x-x,e.y-y);
        if(d>radius+e.r)continue;
        var fall=1-(d/radius)*.5,sd=dmg*frac*fall;
        if(e.kind==='shape'&&e.hp<=0)continue;
        if(e.kind==='shape'){
          var se=exposure(this,e,x,y);
          if(se<=.001)continue;
          e.hp-=sd*se;e.flash=Math.max(e.flash,0.12);
          if(e.hp<=0)this.killShape(e);
        }else if(e.kind==='tank'&&e.id!==ownerId&&e.alive){
          /* Existing damageTank wrapper applies tank exposure exactly once. */
          var ang=Math.atan2(e.y-y,e.x-x);
          this.damageTank(e,sd,ownerId,Math.cos(ang)*(arguments[5]||0)*fall*.01,Math.sin(ang)*(arguments[5]||0)*fall*.01);
        }else if(e.kind==='drone'&&e.ownerId!==ownerId&&e.hp>0){
          var de=exposure(this,e,x,y);
          if(de>.001)this.damageDrone(e,sd*de,ownerId);
        }
      }
      return result;
    }finally{
      if(hash&&typeof oldQuery==='function'){
        if(hadQuery)hash.query=oldQuery;else delete hash.query;
      }
      for(var k=0;k<temporary.length;k++)delete temporary[k].r;
      targets.length=0;c.active=pa;c.x=px;c.y=py;c.radius=pr;
    }
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
