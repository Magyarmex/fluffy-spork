/* NOVA TANKS v1.7.8 — Zero Churn
 * Second performance campaign: eliminate avoidable per-frame allocation,
 * repeated layout reads, and React work from continuous twin-stick input.
 * Gameplay, input sampling, render cadence and visual quality remain unchanged.
 */
(function(){
'use strict';
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.8] module registry unavailable');return;}

var VERSION='1.7.8',CODENAME='Zero Churn';
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
    /* Until the next insertion, queries must use the live entity fallback.
       Reused but empty buckets are not a populated current-frame index. */
    hash.__novaReady=false;
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
    /* Core Game.update handles mouse world-coordinate aim only when this returns null. */
    if(this.mouseActive)return null;
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
      var self=this,originalMethod=canvas.getBoundingClientRect,original=originalMethod.bind(canvas);
      this.__novaRectOriginal=originalMethod;
      this.__novaRectHadOwn=Object.prototype.hasOwnProperty.call(canvas,'getBoundingClientRect');
      function refresh(){try{var oldRect=self.__novaCachedRect,nextRect=original();if(oldRect){var shiftX=oldRect.left-nextRect.left,shiftY=oldRect.top-nextRect.top;if(Number.isFinite(shiftX)&&Number.isFinite(shiftY)&&(shiftX||shiftY)){/* Stick origins are canvas-relative. Preserve held-finger vectors when the viewport pans underneath them. */if(self.move&&self.move.active){self.move.ox+=shiftX;self.move.oy+=shiftY;}if(self.aim&&self.aim.active){self.aim.ox+=shiftX;self.aim.oy+=shiftY;}}}self.__novaCachedRect=nextRect;}catch(_){}}
      this.__novaRectRefresh=refresh;refresh();
      canvas.getBoundingClientRect=function(){return self.__novaCachedRect||original();};
      if(typeof window!=='undefined'){
        window.addEventListener('resize',refresh,{passive:true});
        window.addEventListener('scroll',refresh,{passive:true,capture:true});
        if(window.visualViewport){window.visualViewport.addEventListener('resize',refresh,{passive:true});window.visualViewport.addEventListener('scroll',refresh,{passive:true});}
      }
      if(typeof ResizeObserver!=='undefined')try{this.__novaRectObserver=new ResizeObserver(refresh);this.__novaRectObserver.observe(canvas);}catch(_){}
    }
    return out;
  };
  Input.prototype.detach=function(){
    if(this.__novaStickPaintRaf&&typeof cancelAnimationFrame==='function'){cancelAnimationFrame(this.__novaStickPaintRaf);this.__novaStickPaintRaf=0;}
    var canvas=this.canvas,refresh=this.__novaRectRefresh;
    if(canvas&&this.__novaRectOriginal){if(this.__novaRectHadOwn)canvas.getBoundingClientRect=this.__novaRectOriginal;else delete canvas.getBoundingClientRect;}
    if(typeof window!=='undefined'&&refresh){window.removeEventListener('resize',refresh);window.removeEventListener('scroll',refresh,true);if(window.visualViewport){window.visualViewport.removeEventListener('resize',refresh);window.visualViewport.removeEventListener('scroll',refresh);}}
    if(this.__novaRectObserver){try{this.__novaRectObserver.disconnect();}catch(_){}this.__novaRectObserver=null;}
    this.__novaRectOriginal=null;this.__novaRectHadOwn=null;this.__novaCachedRect=null;this.__novaRectRefresh=null;this.__novaStickDom=null;
    return oldDetach.call(this);
  };
});

/* ---------------- game indexes ---------------- */
wrap('game/engine',function(engine,require){
  var Base=engine.Game;if(!Base||Base.prototype.__novaZeroChurn)return;
  Base.prototype.__novaZeroChurn=true;

  /* Opt-in, read-only projectile chronology diagnostics. Disabled in normal play.
   * Sample at most 12 pre-existing shells per frame; never reorder or mutate them.
   * This measures definite TTL/arena overshoots, not speculative hit outcomes. */
  var CHRONO_SHADOW_LIMIT=12, CHRONO_ARENA_EDGE=2230;
  function chronoExitTime(s){
    if(Math.abs(s.x)>CHRONO_ARENA_EDGE||Math.abs(s.y)>CHRONO_ARENA_EDGE)return null;
    var t=Infinity;
    if(s.vx>0)t=Math.min(t,(CHRONO_ARENA_EDGE-s.x)/s.vx);
    else if(s.vx<0)t=Math.min(t,(-CHRONO_ARENA_EDGE-s.x)/s.vx);
    if(s.vy>0)t=Math.min(t,(CHRONO_ARENA_EDGE-s.y)/s.vy);
    else if(s.vy<0)t=Math.min(t,(-CHRONO_ARENA_EDGE-s.y)/s.vy);
    return t>=0&&isFinite(t)?t:null;
  }

  /* Conservative, opt-in first-body comparator for ordinary short-lived shots.
   * Compare geometry BEFORE Battlefield's pre-pass and the core TTL removal.
   * No combat writes: only count potential contacts not registered by the core.
   * An intercepted projectile may be a false positive, so the counter is
   * deliberately named "unregistered", not a proven missed hit. */
  var chronoClasses=null,chronoSideKeys=['teamId','team','factionId','faction','side'];
  try{chronoClasses=require('./classes').CLASSES||null;}catch(_){}
  /* A short-lived shot can legitimately lose its body contact if it first
   * intercepts a hostile projectile. This is a conservative geometry-only
   * ambiguity check: it does not predict which projectile survives, and it
   * never changes combat. Keep the optional audit bounded in dense fights. */
  function chronoPossibleInterception(g,b,bodyTime){
    if(!g.bullets)return false;
    if(g.bullets.length>256)return null;
    var shotOwner=typeof g.getTank==='function'?g.getTank(b.ownerId):null;
    for(var i=0;i<g.bullets.length;i++){
      var other=g.bullets[i];
      if(!other||other===b||other.dead||other.ownerId===b.ownerId||
         !(other.ttl>0)||!Number.isFinite(other.x)||!Number.isFinite(other.y)||
         !Number.isFinite(other.vx)||!Number.isFinite(other.vy))continue;
      /* Distinct owners can still be teammates. Friendly projectiles cannot
       * intercept one another; unknown/dead shooters remain conservative. */
      if(shotOwner&&typeof g.getTank==='function'){
        var otherOwner=g.getTank(other.ownerId),allied=false;
        if(otherOwner){
          if(typeof g.areAllies==='function'&&g.areAllies(shotOwner,otherOwner))allied=true;
          else if(typeof g.areHostile==='function'&&!g.areHostile(shotOwner,otherOwner))allied=true;
          else for(var side=0;side<chronoSideKeys.length;side++){
            var key=chronoSideKeys[side];
            if(shotOwner[key]!=null&&otherOwner[key]!=null){
              allied=shotOwner[key]===otherOwner[key];break;
            }
          }
        }
        if(allied)continue;
      }
      var until=Math.min(bodyTime,other.ttl);
      if(!(until>=0))continue;
      var dx=b.x-other.x,dy=b.y-other.y;
      var vx=b.vx-other.vx,vy=b.vy-other.vy;
      var speed2=vx*vx+vy*vy;
      if(!Number.isFinite(speed2))continue;
      var t=speed2>1e-12?Math.max(0,Math.min(until,-(dx*vx+dy*vy)/speed2)):0;
      var cx=dx+vx*t,cy=dy+vy*t;
      var radius=(b.r||2)+(other.r||2)+1.5;
      if(cx*cx+cy*cy<=radius*radius)return true;
    }
    return false;
  }
  /* Core shape/drone collision uses endpoint positions, not moving-tank history. */
  function chronoStaticBodyTime(b,e,radius){
    var fx=b.x-e.x,fy=b.y-e.y,vx=b.vx||0,vy=b.vy||0;
    var C=fx*fx+fy*fy-radius*radius;
    if(!Number.isFinite(C))return null;
    if(C<=0)return 0;
    var A=vx*vx+vy*vy,halfB=fx*vx+fy*vy;
    if(!(A>1e-12)||!Number.isFinite(A)||halfB>=0)return null;
    var D=halfB*halfB-A*C;
    if(!(D>=0)||!Number.isFinite(D))return null;
    /* Floating-point cancellation near tangency makes contact uncertain. */
    if(D<=64*Number.EPSILON*(Math.abs(halfB*halfB)+Math.abs(A*C)))return null;
    var hit=C/(-halfB+Math.sqrt(D));
    return Number.isFinite(hit)&&hit>=0?hit:null;
  }
  /* Shape motion is now captured by Battlefield's authoritative Game.update.
   * The opt-in audit must not mistake a later shape endpoint for an earlier
   * projectile contact, or miss a real moving crossing before expiration. */
  function chronoShapeTime(g,b,s,radius,dt){
    if(!g.__novaShapeSweepActive)return chronoStaticBodyTime(b,s,radius);
    if(s.__novaShapeSweepEpoch!==g.__novaShapeSweepEpoch)return null;
    var sx=s.__novaShapeSweepPrevX,sy=s.__novaShapeSweepPrevY;
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||!(dt>0))return null;
    var mx=s.x-sx,my=s.y-sy;
    if(mx*mx+my*my>96*96)return null; /* teleport: no physical sweep */
    if(mx*mx+my*my<1e-16)return chronoStaticBodyTime(b,s,radius);
    var fx=b.x-sx,fy=b.y-sy,vx=(b.vx||0)-mx/dt,vy=(b.vy||0)-my/dt;
    var C=fx*fx+fy*fy-radius*radius;
    if(!Number.isFinite(C))return null;
    if(C<0)return 0;
    var A=vx*vx+vy*vy,halfB=fx*vx+fy*vy;
    if(!(A>1e-12)||!Number.isFinite(A)||halfB>=0)return null;
    var D=halfB*halfB-A*C;
    if(!(D>0)||!Number.isFinite(D))return null;
    if(D<=64*Number.EPSILON*(Math.abs(halfB*halfB)+Math.abs(A*C)))return null;
    var hit=C/(-halfB+Math.sqrt(D));
    return Number.isFinite(hit)&&hit>=0&&hit<dt?hit:null;
  }
  function chronoAlliedOwner(g,a,b){
    if(!a||!b)return false;
    if(typeof g.areAllies==='function'&&g.areAllies(a,b))return true;
    if(typeof g.areHostile==='function'&&!g.areHostile(a,b))return true;
    for(var i=0;i<chronoSideKeys.length;i++){
      var key=chronoSideKeys[i];
      if(a[key]!=null&&b[key]!=null)return a[key]===b[key];
    }
    return false;
  }
  function chronoFirstBody(g,b,dt){
    /* Fail closed rather than attributing a tank hit behind an unscanned body. */
    if(g.shapes&&g.shapes.length>160||g.drones&&g.drones.length>64)return null;
    if(!g.tanks||g.tanks.length>64||!g.__novaTerrain||
       !Number.isFinite(b.x)||!Number.isFinite(b.y)||
       !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
       Math.abs(b.x)>CHRONO_ARENA_EDGE||Math.abs(b.y)>CHRONO_ARENA_EDGE)return null;
    var best=null,owner=typeof g.getTank==='function'?g.getTank(b.ownerId):null;
    for(var i=0;i<g.tanks.length;i++){
      var t=g.tanks[i];
      if(!t||!t.alive||t.id===b.ownerId||
         !Number.isFinite(t.x)||!Number.isFinite(t.y))continue;
      if(owner){
        if(typeof g.areAllies==='function'&&g.areAllies(owner,t))continue;
        var allied=false;
        for(var side=0;side<chronoSideKeys.length;side++){
          var key=chronoSideKeys[side];
          if(owner[key]!=null&&t[key]!=null){allied=owner[key]===t[key];break;}
        }
        if(allied)continue;
      }
      var def=chronoClasses&&chronoClasses[t.cls];
      var size=def&&def.size||t.r;
      if(!(size>0))continue;
      var moving=t.__novaSweepMoveTime===g.time&&
        Number.isFinite(t.__novaSweepPrevX)&&Number.isFinite(t.__novaSweepPrevY);
      var sx=moving?t.__novaSweepPrevX:t.x,sy=moving?t.__novaSweepPrevY:t.y;
      var fx=b.x-sx,fy=b.y-sy;
      var vx=(b.vx||0)-(t.x-sx)/dt,vy=(b.vy||0)-(t.y-sy)/dt;
      var radius=(b.r||2)+size+3,C=fx*fx+fy*fy-radius*radius;
      if(!Number.isFinite(C))continue;
      var hit=null;
      if(C<=0)hit=0;
      else{
        var A=vx*vx+vy*vy,halfB=fx*vx+fy*vy;
        if(!(A>1e-12)||!Number.isFinite(A)||halfB>=0)continue;
        var D=halfB*halfB-A*C;
        if(!(D>=0)||!Number.isFinite(D))continue;
        if(D<=64*Number.EPSILON*(Math.abs(halfB*halfB)+Math.abs(A*C)))continue;
        /* Stable entry root: avoids cancellation for fast shallow hits. */
        hit=C/(-halfB+Math.sqrt(D));
      }
      if(!Number.isFinite(hit)||hit<0||hit>b.ttl)continue;
      if(!best||hit<best.time)best={targetId:t.id,time:hit,
        immune:t.spawnShieldT>0||t.shieldT>0,guardAmbiguous:t.bulwarkT>0||t.tauntT>0,
        x:b.x+(b.vx||0)*hit,y:b.y+(b.vy||0)*hit};
    }
    /* The first victim may be a neutral shape or a hostile drone. */
    var shapes=g.shapes||[];
    for(var j=0;j<shapes.length;j++){
      var shape=shapes[j];
      if(!shape||shape.kind!=='shape'||!(shape.hp>0)||!(shape.r>0)||
         !Number.isFinite(shape.x)||!Number.isFinite(shape.y))continue;
      var shapeTime=chronoShapeTime(g,b,shape,(b.r||2)+shape.r,dt);
      if(shapeTime===null||shapeTime>b.ttl)continue;
      if(best&&Math.abs(shapeTime-best.time)<=1e-9)return null;
      if(!best||shapeTime<best.time)best={targetId:shape.id,kind:'shape',time:shapeTime,
        x:b.x+(b.vx||0)*shapeTime,y:b.y+(b.vy||0)*shapeTime};
    }
    var drones=g.drones||[];
    for(var k=0;k<drones.length;k++){
      var drone=drones[k];
      if(!drone||!(drone.hp>0)||drone.ownerId===b.ownerId||!(drone.r>0)||
         !Number.isFinite(drone.x)||!Number.isFinite(drone.y))continue;
      if(owner&&typeof g.getTank==='function'&&
         chronoAlliedOwner(g,owner,g.getTank(drone.ownerId)))continue;
      var droneTime=chronoStaticBodyTime(b,drone,(b.r||2)+drone.r+1);
      if(droneTime===null||droneTime>b.ttl)continue;
      if(best&&Math.abs(droneTime-best.time)<=1e-9)return null;
      if(!best||droneTime<best.time)best={targetId:drone.id,kind:'drone',time:droneTime,
        x:b.x+(b.vx||0)*droneTime,y:b.y+(b.vy||0)*droneTime};
    }
    if(!best)return null;
    /* Spawn and ordinary shields unconditionally block core damage. Guardian
     * bulwark is different: its v1.7 directional wrapper can allow damage. */
    if(best.immune)return null;
    var exit=chronoExitTime({x:b.x,y:b.y,vx:b.vx,vy:b.vy});
    if(exit!=null&&best.time>exit+1e-9)return null;
    /* A solid hit before the body makes this candidate ambiguous, including
     * destructible cover: do not claim a direct body contact in that case. */
    if(typeof g.firstTerrainHit==='function'&&
       g.firstTerrainHit(b.x,b.y,best.x,best.y,(b.r||2)*.45))
      return {occluded:true};
    if(typeof g.firstTerrainHit!=='function'&&
       g.__novaTerrain.some(function(t){return t&&t.solid!==false&&
         (!t.destructible||t.hp>0);}))return null;
    /* Without the full directional Guardian/Perfect Guard and taunt resolution this
     * contact is uncertain, not proven invulnerable and not a proven miss. */
    if(best.guardAmbiguous)return {defenseAmbiguous:true};
    var interception=chronoPossibleInterception(g,b,best.time);
    if(interception===null)return {interceptionUnscanned:true};
    if(interception)return {interceptionAmbiguous:true};
    return best;
  }
  /* Opt-in, read-only Cannon first-event diagnostic. A permanent wall after
   * the programmed fuse threshold must not win merely because Battlefield
   * executes before Three Disciplines. No combat state is modified here. */
  function chronoFuseBeforeWall(g,b,dt){
    if(!b.shell||!b.__v17Cannon||!(b.__v17FuseDist>2)||
       !g.__novaTerrain||typeof g.firstTerrainHit!=='function'||!(b.ttl>0)||
       !Number.isFinite(b.x)||!Number.isFinite(b.y)||
       !Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
       !Number.isFinite(b.__v17SpawnX)||!Number.isFinite(b.__v17SpawnY))return null;
    var active=Math.min(dt,b.ttl),radius=b.__v17FuseDist-2;
    if(!(active>0))return null;
    var fx=b.x-b.__v17SpawnX,fy=b.y-b.__v17SpawnY;
    var c=fx*fx+fy*fy-radius*radius;
    if(!(c<0))return null; /* already at threshold: no new crossing */
    var dx=b.vx*active,dy=b.vy*active,a=dx*dx+dy*dy;
    if(!(a>1e-12)||!Number.isFinite(a))return null;
    var ex=fx+dx,ey=fy+dy;
    if(ex*ex+ey*ey<radius*radius)return null;
    var halfB=fx*dx+fy*dy,disc=halfB*halfB-a*c;
    if(!(disc>=0)||!Number.isFinite(disc))return null;
    var root=Math.sqrt(disc);
    var fraction=halfB>=0?-c/(halfB+root):(-halfB+root)/a;
    if(!(fraction>=0&&fraction<=1))return null;
    var wall=g.firstTerrainHit(b.x,b.y,b.x+dx,b.y+dy,(b.r||2)*.45);
    if(!wall||!wall.solid||!wall.hit||wall.solid.destructible||
       wall.solid.solid===false||!(wall.hit.t>fraction+1e-7))return null;
    return {time:active*fraction,x:b.x+dx*fraction,y:b.y+dy*fraction,
      wallTime:active*wall.hit.t,wallId:wall.solid.id,
      wallX:wall.hit.x,wallY:wall.hit.y};
  }
  function chronoState(g){
    var s=g.__novaChronoShadow||(g.__novaChronoShadow={
      frames:0,sampledShells:0,sampledShortShots:0,bursts:0,
      ttlOvershoots:0,arenaOvershoots:0,fuseBeforeWallCandidates:0,fuseBeforeWallLateBursts:0,fuseWallAuditErrors:0,predictedBodyContacts:0,
      registeredBodyContacts:0,unregisteredBodyContacts:0,
      terrainOccludedBodyContacts:0,defenseAmbiguousBodyContacts:0,interceptionAmbiguousBodyContacts:0,
      interceptionUnscannedBodyContacts:0,bodyAuditErrors:0,
      maxOvershootUnits:0,events:[]
    });
    /* DevTools can inspect live counters without reaching into React game state. */
    window.__NOVA_CHRONO_SHADOW_LAST__=s;
    return s;
  }
  var oldChronoBurst=Base.prototype.clusterBurst;
  if(oldChronoBurst)Base.prototype.clusterBurst=function(shell){
    var frame=this.__novaChronoShadowFrame,s=frame&&frame.samples.get(shell);
    if(s&&!shell.__novaClusterBurstConsumed){
      var st=chronoState(this),v2=s.vx*s.vx+s.vy*s.vy;
      st.bursts++;
      if(v2>1e-9){
        var elapsed=((shell.x-s.x)*s.vx+(shell.y-s.y)*s.vy)/v2;
        /* Only call it a wall-caused late burst when the observed burst is
         * at that wall. A separate earlier body/interception is ambiguous. */
        if(s.fuseFirst&&elapsed>s.fuseFirst.time+1e-6&&
           Math.hypot(shell.x-s.fuseFirst.wallX,shell.y-s.fuseFirst.wallY)<1e-4){
          st.fuseBeforeWallLateBursts++;
          st.events.push({kind:'fuse-before-wall-late-burst',id:s.id,
            expectedX:s.fuseFirst.x,expectedY:s.fuseFirst.y,
            actualX:shell.x,actualY:shell.y,
            expectedTime:s.fuseFirst.time,wallTime:s.fuseFirst.wallTime,
            wallId:s.fuseFirst.wallId});
          if(st.events.length>12)st.events.shift();
        }
        var ttlOver=s.ttl>=0&&s.ttl<frame.dt&&elapsed>s.ttl+1e-6;
        var arenaOver=s.exit!=null&&s.exit<frame.dt&&elapsed>s.exit+1e-6;
        if(ttlOver||arenaOver){
          if(ttlOver)st.ttlOvershoots++;
          if(arenaOver)st.arenaOvershoots++;
          var limit=Math.min(ttlOver?s.ttl:Infinity,arenaOver?s.exit:Infinity);
          var overshoot=Math.max(0,(elapsed-limit)*Math.sqrt(v2));
          st.maxOvershootUnits=Math.max(st.maxOvershootUnits,overshoot);
          st.events.push({id:s.id,ttl:ttlOver,arena:arenaOver,
            expectedX:s.x+s.vx*limit,expectedY:s.y+s.vy*limit,
            actualX:shell.x,actualY:shell.y,overshoot:overshoot});
          if(st.events.length>12)st.events.shift();
        }
      }
    }
    return oldChronoBurst.apply(this,arguments);
  };
  var oldChronoBullets=Base.prototype.updateBullets;
  if(oldChronoBullets)Base.prototype.updateBullets=function(dt){
    /* The live War Room runs a decorative Game with spectator id -1000000.
     * Never let it overwrite the playable match's diagnostic snapshot. */
    if(!window.__NOVA_CHRONO_SHADOW_ENABLED__||!(dt>0)||!this.bullets||
       this.player&&this.player.id===-1000000)
      return oldChronoBullets.apply(this,arguments);
    var samples=new Map(),shortShots=[],bullets=this.bullets,st=chronoState(this);
    st.frames++;
    /* Rotate a bounded scan window so crowded arenas do not starve late
     * projectiles or make the diagnostic O(all bullets) each frame.
     * Independent 12-shell and 12-short-shot budgets preserve the existing
     * shell audit even during dense ordinary fire. */
    var count=bullets.length,scan=Math.min(count,64),start=count?(st.frames*CHRONO_SHADOW_LIMIT)%count:0;
    var shellSampled=0,shortSampled=0;
    for(var i=0;i<scan&&(shellSampled<CHRONO_SHADOW_LIMIT||shortSampled<CHRONO_SHADOW_LIMIT);i++){
      var b=bullets[(start+i)%count];
      if(!b||b.dead)continue;
      if(b.shell){
        if(shellSampled>=CHRONO_SHADOW_LIMIT)continue;
        shellSampled++;
        var s={id:b.id,x:b.x,y:b.y,vx:b.vx||0,vy:b.vy||0,ttl:b.ttl};
        s.exit=chronoExitTime(s);
        /* Diagnostics must fail open: terrain probes cannot interrupt combat. */
        try{s.fuseFirst=chronoFuseBeforeWall(this,b,dt);}
        catch(_){st.fuseWallAuditErrors++;s.fuseFirst=null;}
        if(s.fuseFirst)st.fuseBeforeWallCandidates++;
        samples.set(b,s);st.sampledShells++;
      }else if(b.ttl>0&&b.ttl<=dt&&!b.beam&&!(b.hits>0)){
        if(shortSampled>=CHRONO_SHADOW_LIMIT)continue;
        shortSampled++;
        var candidate=null;
        try{candidate=chronoFirstBody(this,b,dt);}
        catch(_){st.bodyAuditErrors++;}
        st.sampledShortShots++;
        if(candidate&&candidate.occluded)st.terrainOccludedBodyContacts++;
        else if(candidate&&candidate.defenseAmbiguous)st.defenseAmbiguousBodyContacts++;
        else if(candidate&&candidate.interceptionAmbiguous)st.interceptionAmbiguousBodyContacts++;
        else if(candidate&&candidate.interceptionUnscanned)st.interceptionUnscannedBodyContacts++;
        else if(candidate){
          st.predictedBodyContacts++;
          shortShots.push({bullet:b,before:b.hits||0,ttl:b.ttl,contact:candidate});
        }
        samples.set(b,null);
      }
    }
    var previous=this.__novaChronoShadowFrame;
    this.__novaChronoShadowFrame={samples:samples,dt:dt};
    var completed=false;
    try{var result=oldChronoBullets.apply(this,arguments);completed=true;return result;}
    finally{
      if(completed)for(var k=0;k<shortShots.length;k++){
        var shot=shortShots[k],c=shot.contact,b=shot.bullet;
        if((b.hits||0)>shot.before)st.registeredBodyContacts++;
        else{
          st.unregisteredBodyContacts++;
          st.events.push({kind:'unregistered-body-contact',id:b.id,
            targetId:c.targetId,targetKind:c.kind||'tank',expectedX:c.x,expectedY:c.y,
            contactTime:c.time,ttl:shot.ttl});
          if(st.events.length>12)st.events.shift();
        }
      }
      this.__novaChronoShadowFrame=previous;
    }
  };
  Base.prototype.novaChronoShadowSnapshot=function(){
    var s=this.__novaChronoShadow;
    return s?{frames:s.frames,sampledShells:s.sampledShells,
      sampledShortShots:s.sampledShortShots,bursts:s.bursts,
      ttlOvershoots:s.ttlOvershoots,arenaOvershoots:s.arenaOvershoots,
      fuseBeforeWallCandidates:s.fuseBeforeWallCandidates,
      fuseBeforeWallLateBursts:s.fuseBeforeWallLateBursts,
      fuseWallAuditErrors:s.fuseWallAuditErrors,
      predictedBodyContacts:s.predictedBodyContacts,
      registeredBodyContacts:s.registeredBodyContacts,
      unregisteredBodyContacts:s.unregisteredBodyContacts,
      terrainOccludedBodyContacts:s.terrainOccludedBodyContacts,
      defenseAmbiguousBodyContacts:s.defenseAmbiguousBodyContacts,
      interceptionAmbiguousBodyContacts:s.interceptionAmbiguousBodyContacts,
      interceptionUnscannedBodyContacts:s.interceptionUnscannedBodyContacts,
      bodyAuditErrors:s.bodyAuditErrors,maxOvershootUnits:s.maxOvershootUnits,events:s.events.slice()}:
      {frames:0,sampledShells:0,sampledShortShots:0,bursts:0,
       ttlOvershoots:0,arenaOvershoots:0,fuseBeforeWallCandidates:0,fuseBeforeWallLateBursts:0,fuseWallAuditErrors:0,predictedBodyContacts:0,
       registeredBodyContacts:0,unregisteredBodyContacts:0,
       terrainOccludedBodyContacts:0,defenseAmbiguousBodyContacts:0,interceptionAmbiguousBodyContacts:0,
       interceptionUnscannedBodyContacts:0,bodyAuditErrors:0,
       maxOvershootUnits:0,events:[]};
  };

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
    for(var j=0;j<this.shapes.length;j++){var z=this.shapes[j];if(!z||z.kind!=='shape'||z.hp<=0)continue;var qq=d2(x,y,z.x,z.y);if(qq<bd){bd=qq;best=z;}}
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
