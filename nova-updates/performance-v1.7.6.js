/* NOVA TANKS v1.7.6 — Zero Churn
 * Second performance campaign: eliminate avoidable per-frame allocation,
 * repeated layout reads, and React work from continuous twin-stick input.
 * Gameplay, input sampling, render cadence and visual quality remain unchanged.
 */
(function(){
'use strict';
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.6] module registry unavailable');return;}

var VERSION='1.7.6',CODENAME='Zero Churn';
window.__NOVA_PERFORMANCE_2_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Keep the frame loop hot and the garbage collector bored.',
  guarantees:[
    'The entity spatial hash reuses cell buckets instead of clearing and reallocating them every frame.',
    'Shape id lookups use a synchronized map while nearest-shape queries reuse the existing exact spatial hash.',
    'Movement and aim vectors reuse per-input scratch objects instead of allocating on every simulation frame.',
    'Twin-stick visuals remain refresh-rate smooth without forcing a full React state render for every pointer move.',
    'Canvas bounds are cached and refreshed on real layout changes instead of forcing layout reads in pointer and mouse-aim hot paths.'
  ]
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function d2(ax,ay,bx,by){var x=ax-bx,y=ay-by;return x*x+y*y;}

/* ---------------- zero-churn entity spatial hash ---------------- */
function optimizeHash(hash){
  if(!hash||hash.__novaZeroChurn)return hash;
  hash.__novaZeroChurn=true;
  var map=hash.map||(hash.map=new Map());
  var active=[];
  hash.__novaActiveBuckets=active;
  hash.__novaBucketCreates=0;
  hash.__novaReady=false;
  hash.clear=function(){
    for(var i=0;i<active.length;i++)active[i].length=0;
    active.length=0;
  };
  hash.insert=function(e){
    var cell=this.cell||180,cx=Math.floor(e.x/cell)+2000,cy=Math.floor(e.y/cell)+2000,k=cx*10000+cy;
    var a=map.get(k);
    if(!a){a=[];map.set(k,a);this.__novaBucketCreates++;}
    if(a.length===0)active.push(a);
    a.push(e);this.__novaReady=true;
  };
  hash.query=function(x,y,r,out){
    out.length=0;
    var cell=this.cell||180,minx=Math.floor((x-r)/cell)+2000,maxx=Math.floor((x+r)/cell)+2000,miny=Math.floor((y-r)/cell)+2000,maxy=Math.floor((y+r)/cell)+2000;
    for(var cx=minx;cx<=maxx;cx++)for(var cy=miny;cy<=maxy;cy++){
      var a=map.get(cx*10000+cy);if(!a)continue;
      for(var i=0;i<a.length;i++)out.push(a[i]);
    }
  };
  return hash;
}

/* ---------------- input: zero allocations + zero React pointer churn ---------------- */
wrap('game/input',function(input){
  var Input=input.Input;if(!Input||Input.prototype.__novaZeroChurn)return;
  Input.prototype.__novaZeroChurn=true;

  Input.prototype.moveVec=function(){
    var out=this.__novaMoveVec||(this.__novaMoveVec={x:0,y:0}),x=this.move.dx,y=this.move.dy;
    if(!this.move.active){x=(this.keyboard.right?1:0)-(this.keyboard.left?1:0);y=(this.keyboard.down?1:0)-(this.keyboard.up?1:0);}
    var l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}out.x=x;out.y=y;return out;
  };
  Input.prototype.aimVec=function(move){
    var out=this.__novaAimVec||(this.__novaAimVec={x:0,y:0}),x,y,l;
    if(this.aim.active){x=this.aim.dx;y=this.aim.dy;l=Math.hypot(x,y);if(l<4)return null;out.x=x/l;out.y=y/l;return out;}
    if(this.move.active||this.keyboard.up||this.keyboard.down||this.keyboard.left||this.keyboard.right){x=move.x;y=move.y;l=Math.hypot(x,y);if(l<.2)return null;out.x=x/l;out.y=y/l;return out;}
    return null;
  };

  function resolveStickDom(self){
    var dom=self.__novaStickDom||(self.__novaStickDom={moveBase:null,moveKnob:null,aimBase:null,aimKnob:null});
    var moveOk=dom.moveBase&&dom.moveBase.isConnected,aimOk=dom.aimBase&&dom.aimBase.isConnected;
    if((!self.move.active||moveOk)&&(!self.aim.active||aimOk))return dom;
    var root=self.canvas&&(self.canvas.parentElement||document),bases=root&&root.querySelectorAll?root.querySelectorAll('.stick-base'):[];
    for(var i=0;i<bases.length;i++){
      var base=bases[i],w=parseFloat(base.style.width)||0;
      if(w>=120){dom.moveBase=base;dom.moveKnob=base.querySelector?base.querySelector('.stick-knob'):null;}
      else{dom.aimBase=base;dom.aimKnob=base.querySelector?base.querySelector('.stick-knob'):null;}
    }
    return dom;
  }
  function paintOne(base,knob,s,radius,knobBase){
    if(!base||!base.isConnected)return false;
    base.style.left=(s.ox-radius)+'px';base.style.top=(s.oy-radius)+'px';
    if(knob){knob.style.left=(knobBase+s.dx)+'px';knob.style.top=(knobBase+s.dy)+'px';}
    return true;
  }
  function paintSticks(self){
    if(typeof document==='undefined'||!self.canvas)return;
    var dom=resolveStickDom(self);
    if(self.move.active&&!paintOne(dom.moveBase,dom.moveKnob,self.move,62,36)){dom.moveBase=null;dom.moveKnob=null;}
    if(self.aim.active&&!paintOne(dom.aimBase,dom.aimKnob,self.aim,58,34)){dom.aimBase=null;dom.aimKnob=null;}
  }
  function ensurePainter(self){
    if(self.__novaStickPaintRaf||typeof requestAnimationFrame!=='function')return;
    function tick(){
      self.__novaStickPaintRaf=0;
      if(!self.canvas)return;
      if(self.move.active||self.aim.active){paintSticks(self);self.__novaStickPaintRaf=requestAnimationFrame(tick);}
    }
    self.__novaStickPaintRaf=requestAnimationFrame(tick);
  }

  Input.prototype.emit=function(kind){
    var s=this.stickState(kind),flags=this.__novaEmittedActive||(this.__novaEmittedActive={move:false,aim:false}),active=!!(s&&s.active);
    /* React only owns mount/unmount of the stick layer. Position is painted
       directly from the live Input state, avoiding an App-wide render at
       pointer frequency while preserving one visual update per display frame. */
    if(flags[kind]!==active){flags[kind]=active;if(this.__novaStickDom){if(kind==='move'){this.__novaStickDom.moveBase=null;this.__novaStickDom.moveKnob=null;}else{this.__novaStickDom.aimBase=null;this.__novaStickDom.aimKnob=null;}}if(this.onStickChange)this.onStickChange(kind,s);}
    if(active)ensurePainter(this);
  };

  var oldAttach=Input.prototype.attach,oldDetach=Input.prototype.detach;
  Input.prototype.attach=function(canvas){
    var out=oldAttach.call(this,canvas);
    if(canvas&&canvas.getBoundingClientRect&&!this.__novaRectOriginal){
      var self=this,original=canvas.getBoundingClientRect.bind(canvas);
      this.__novaRectOriginal=original;
      function refresh(){try{self.__novaCachedRect=original();}catch(_){}}
      this.__novaRectRefresh=refresh;refresh();
      canvas.getBoundingClientRect=function(){return self.__novaCachedRect||original();};
      if(typeof window!=='undefined'){
        window.addEventListener('resize',refresh,{passive:true});
        window.addEventListener('scroll',refresh,{passive:true,capture:true});
        if(window.visualViewport)window.visualViewport.addEventListener('resize',refresh,{passive:true});
      }
      if(typeof ResizeObserver!=='undefined')try{this.__novaRectObserver=new ResizeObserver(refresh);this.__novaRectObserver.observe(canvas);}catch(_){}
    }
    return out;
  };
  Input.prototype.detach=function(){
    if(this.__novaStickPaintRaf&&typeof cancelAnimationFrame==='function'){cancelAnimationFrame(this.__novaStickPaintRaf);this.__novaStickPaintRaf=0;}
    var canvas=this.canvas,refresh=this.__novaRectRefresh;
    if(canvas&&this.__novaRectOriginal)canvas.getBoundingClientRect=this.__novaRectOriginal;
    if(typeof window!=='undefined'&&refresh){window.removeEventListener('resize',refresh);window.removeEventListener('scroll',refresh,true);if(window.visualViewport)window.visualViewport.removeEventListener('resize',refresh);}
    if(this.__novaRectObserver){try{this.__novaRectObserver.disconnect();}catch(_){}this.__novaRectObserver=null;}
    this.__novaRectOriginal=null;this.__novaCachedRect=null;this.__novaRectRefresh=null;this.__novaStickDom=null;
    return oldDetach.call(this);
  };
});

/* ---------------- game indexes ---------------- */
wrap('game/engine',function(engine){
  var Base=engine.Game;if(!Base||Base.prototype.__novaZeroChurn)return;
  Base.prototype.__novaZeroChurn=true;

  var oldSpawnShape=Base.prototype.spawnShape;
  if(oldSpawnShape)Base.prototype.spawnShape=function(){
    var before=this.shapes?this.shapes.length:0,out=oldSpawnShape.apply(this,arguments);
    var map=this.shapeById||(this.shapeById=new Map());
    if(this.shapes)for(var i=before;i<this.shapes.length;i++){var s=this.shapes[i];if(s)map.set(s.id,s);}
    return out;
  };
  var oldKillShape=Base.prototype.killShape;
  if(oldKillShape)Base.prototype.killShape=function(s){
    var out=oldKillShape.apply(this,arguments);if(this.shapeById&&s)this.shapeById.delete(s.id);return out;
  };
  Base.prototype.getShape=function(id){return this.shapeById?this.shapeById.get(id)||null:null;};

  var oldRedeploy=Base.prototype.redeploy;
  if(oldRedeploy)Base.prototype.redeploy=function(){if(this.shapeById)this.shapeById.clear();return oldRedeploy.apply(this,arguments);};

  Base.prototype.nearestShape=function(x,y,max){
    var hash=this.hash,limit=max*max,best=null,bd=limit;
    if(hash&&hash.__novaReady&&hash.query){
      var tmp=this.__novaShapeQuery||(this.__novaShapeQuery=[]);hash.query(x,y,max,tmp);
      for(var i=0;i<tmp.length;i++){var s=tmp[i];if(!s||s.kind!=='shape'||s.hp<=0)continue;var q=d2(x,y,s.x,s.y);if(q<bd){bd=q;best=s;}}
      return best;
    }
    for(var j=0;j<this.shapes.length;j++){var z=this.shapes[j],qq=d2(x,y,z.x,z.y);if(qq<bd){bd=qq;best=z;}}
    return best;
  };

  var oldPerfSnapshot=Base.prototype.novaPerfSnapshot;
  if(oldPerfSnapshot)Base.prototype.novaPerfSnapshot=function(){
    var out=oldPerfSnapshot.call(this),p=this.__novaPerf||{},q=p.battlefieldQueries||0;
    out.battlefieldQueries=q;out.battlefieldCandidates=p.battlefieldCandidates||0;out.battlefieldAvgCandidates=q?(p.battlefieldCandidates||0)/q:0;out.entityHashBucketCreates=this.hash&&this.hash.__novaBucketCreates||0;
    return out;
  };
  var oldUpdate=Base.prototype.update;
  if(oldUpdate)Base.prototype.update=function(dt){
    var out=oldUpdate.call(this,dt),last=window.__NOVA_PERF_LAST__;
    if(last&&last!==this.__novaPerf2LastGlobal){this.__novaPerf2LastGlobal=last;var p=this.__novaPerf||{},q=p.battlefieldQueries||0;last.battlefieldQueries=q;last.battlefieldAvgCandidates=q?+((p.battlefieldCandidates||0)/q).toFixed(2):0;last.entityHashBucketCreates=this.hash&&this.hash.__novaBucketCreates||0;}
    return out;
  };

  /* Constructor work (seedShapes) happens before a subclass can initialize
     indexes, so spawnShape above lazily creates shapeById. The subclass only
     finishes the persistent hash conversion after Base construction. */
  class ZeroChurnGame extends Base{
    constructor(){
      super(...arguments);
      optimizeHash(this.hash);
      if(!this.shapeById)this.shapeById=new Map();
      for(var i=0;i<this.shapes.length;i++){var s=this.shapes[i];if(s)this.shapeById.set(s.id,s);}
      this.__novaPerf2={version:VERSION};
    }
  }
  engine.Game=ZeroChurnGame;
});

window.__NOVA_PERFORMANCE_2_TEST__={optimizeHash:optimizeHash};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' performance layer online');
})();
