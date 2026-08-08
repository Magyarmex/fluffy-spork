/* NOVA TANKS v1.7.2 — Combined Arms
 * Battlefield refinement + Three Disciplines integration.
 * Predictive terrain routing, blast occlusion, cover-aware cannon previews,
 * legitimate last-seen AI memory, intentional breaching, and Controller corner routing.
 * Performance hardening: tactical math reuses state and avoids transient objects.
 */
(function(){
'use strict';

var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.2] module registry unavailable');return;}

var VERSION='1.7.2',CODENAME='Combined Arms',TAU=Math.PI*2;
window.__NOVA_COMBINED_ARMS_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'The new disciplines learn to fight the battlefield instead of merely colliding with it.',
  groups:{
    'Battlefield Physics':[
      'Hard cover now occludes blast damage as well as bullets and sight; partial exposure around an edge produces partial blast damage instead of full through-wall splash.',
      'AI tanks use short predictive look-ahead and local corner waypoints to route around nearby walls before physically grinding into them.',
      'Controller swarms reuse the same local corner logic while forming, farming, defending, and recalling; committed dives still crash and recover instead of magically steering after lock.',
      'Routing uses only visible geometry and remembered destinations. It does not grant hidden target coordinates.'
    ],
    'Information and AI':[
      'AI records the last position at which it actually had terrain line-of-sight to a target and briefly investigates that remembered location after contact is broken.',
      'Once the memory expires, the hidden opponent is no longer tracked. Reacquisition still requires legitimate sight, Observer relay, or ordinary target logic.',
      'Cannon AI can deliberately breach a destructible barricade that blocks a recent legitimate contact instead of vibrating against cover or pretending it can shoot through it.',
      'Snipers and other ranged AI use local route waypoints to seek a new angle around occlusion rather than maintaining impossible through-wall pressure.'
    ],
    'Three Disciplines × Battlefield':[
      'The Cannon fuse display now distinguishes the programmed detonation point from an earlier physical terrain impact, including barricade integrity when relevant.',
      'Countercharged Guardian shots gain modest structural authority, allowing a correctly timed defense to convert into a real map-opening punish without replacing Cannon breach identity.',
      'Apex Cannon structural multipliers remain owned by the v1.7 discipline stack while Battlefield remains responsible for the actual break, rubble, score, and feedback event.',
      'Meteor and Ravager benefit from predictive route awareness but still lose earned Stampede momentum when they steer hard or collide, preserving commitment.'
    ],
    'Readability and Validation':[
      'Blocked Cannon fuse paths receive a clear IMPACT marker at the actual wall/barricade contact instead of presenting an unreachable airburst point as if the shell could pass through terrain.',
      'Heavy blast damage fully absorbed by cover can display a restrained COVERED confirmation to the player.',
      'New regression coverage verifies blast occlusion, partial exposure, local waypoint selection, last-seen memory discipline, and Cannon cover-impact preview behavior.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var dx=bx-ax,dy=by-ay;return dx*dx+dy*dy;}
function lineage(classes,t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function world(g,x,y,out){var z=(g.cam&&g.cam.zoom)||1,p=out||{};p.x=(x-g.cam.x)*z+g.w*.5;p.y=(y-g.cam.y)*z+g.h*.5;p.z=z;return p;}
function classSize(C,t){return ((t&&C[t.cls]&&C[t.cls].size)||15);}
function solidPointSafe(g,x,y,pad){return !g.isTerrainSafe||g.isTerrainSafe(x,y,pad||8);}
function candidateScore(g,x,y,gx,gy,pad,cx,cy,side,tie){
  if(!solidPointSafe(g,cx,cy,pad*.55))return Infinity;
  if(g.hasLineOfSight&&!g.hasLineOfSight(x,y,cx,cy,Math.max(1,pad*.28)))return Infinity;
  var score=Math.sqrt(d2(x,y,cx,cy))+Math.sqrt(d2(cx,cy,gx,gy));if(side===tie)score-=3;return score;
}

/* Pick one visible local waypoint around the first blocking solid. This is not
 * global pathfinding: it is deliberately short-horizon, readable navigation. */
function chooseWaypoint(g,x,y,gx,gy,pad,seed){
  pad=Math.max(5,pad||12);
  if(!g.firstTerrainHit)return null;
  if(g.hasLineOfSight&&g.hasLineOfSight(x,y,gx,gy,Math.max(2,pad*.35)))return null;
  var fh=g.firstTerrainHit(x,y,gx,gy,Math.max(2,pad*.45));
  if(!fh||!fh.solid)return null;
  var s=fh.solid,extra=pad+14,tie=((seed||0)&1)?1:-1,bx=0,by=0,bs=0,bestScore=Infinity,score;
  if(s.shape==='circle'){
    var base=Math.atan2(y-s.y,x-s.x),rr=(s.r||40)+extra,cx=s.x+Math.cos(base+1.05)*rr,cy=s.y+Math.sin(base+1.05)*rr;
    score=candidateScore(g,x,y,gx,gy,pad,cx,cy,1,tie);if(score<bestScore){bestScore=score;bx=cx;by=cy;bs=1;}
    cx=s.x+Math.cos(base-1.05)*rr;cy=s.y+Math.sin(base-1.05)*rr;
    score=candidateScore(g,x,y,gx,gy,pad,cx,cy,-1,tie);if(score<bestScore){bestScore=score;bx=cx;by=cy;bs=-1;}
  }else{
    var hx=(s.w||80)*.5+extra,hy=(s.h||80)*.5+extra;
    score=candidateScore(g,x,y,gx,gy,pad,s.x-hx,s.y-hy,-1,tie);if(score<bestScore){bestScore=score;bx=s.x-hx;by=s.y-hy;bs=-1;}
    score=candidateScore(g,x,y,gx,gy,pad,s.x-hx,s.y+hy,1,tie);if(score<bestScore){bestScore=score;bx=s.x-hx;by=s.y+hy;bs=1;}
    score=candidateScore(g,x,y,gx,gy,pad,s.x+hx,s.y-hy,1,tie);if(score<bestScore){bestScore=score;bx=s.x+hx;by=s.y-hy;bs=1;}
    score=candidateScore(g,x,y,gx,gy,pad,s.x+hx,s.y+hy,-1,tie);if(score<bestScore){bestScore=score;bx=s.x+hx;by=s.y+hy;bs=-1;}
  }
  if(bestScore<Infinity)return{x:bx,y:by,solidId:s.id,side:bs};
  var h=fh.hit,nx=0,ny=0,hx0=x,hy0=y;if(h){hx0=h.x==null?x:h.x;hy0=h.y==null?y:h.y;var nl=Math.hypot(h.nx||0,h.ny||0)||1;nx=(h.nx||0)/nl;ny=(h.ny||0)/nl;}
  var tx=-ny*tie,ty=nx*tie;
  return{x:hx0+nx*(pad+8)+tx*(pad+46),y:hy0+ny*(pad+8)+ty*(pad+46),solidId:s.id,side:tie};
}

function blastExposure(g,C,t,x,y){
  if(!g.hasLineOfSight||!t)return 1;
  var dx=t.x-x,dy=t.y-y,len=Math.hypot(dx,dy)||1,px=-dy/len,py=dx/len,r=classSize(C,t)*.58,e=0;
  if(g.hasLineOfSight(x,y,t.x,t.y,1.5))e+=.56;
  if(g.hasLineOfSight(x,y,t.x+px*r,t.y+py*r,1.5))e+=.22;
  if(g.hasLineOfSight(x,y,t.x-px*r,t.y-py*r,1.5))e+=.22;
  return clamp(e,0,1);
}

function cannonStructure(cls){
  if(cls==='siegebomber')return 2.35;
  if(cls==='annihilator')return 2.10;
  if(cls==='quakecannon')return 2.00;
  if(cls==='demolisher')return 1.70;
  if(cls==='clusterking')return 1.55;
  if(cls==='bomber')return 1.42;
  return 1.30;
}

wrap('game/audio',function(audio){
  var Sfx=audio.Sfx;if(!Sfx||Sfx.prototype.__novaCombinedArms)return;
  Sfx.prototype.__novaCombinedArms=true;
  function route(self,node,p){if(self.ctx&&self.ctx.createStereoPanner){var q=self.ctx.createStereoPanner();q.pan.value=clamp(p||0,-1,1);node.connect(q);q.connect(self.master);}else node.connect(self.master);}
  function tone(self,f0,f1,dur,gain,p,type){self.resume();if(!self.ctx||!self.master||self.muted)return;var c=self.ctx,t=c.currentTime,o=c.createOscillator(),v=c.createGain();o.type=type||'triangle';o.frequency.setValueAtTime(Math.max(25,f0),t);o.frequency.exponentialRampToValueAtTime(Math.max(25,f1),t+dur);v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.01);v.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(v);route(self,v,p);o.start(t);o.stop(t+dur+.02);}
  Sfx.prototype.novaCoverAbsorb=function(p){var now=performance.now();if(this.__novaCoverAbsorbAt&&now-this.__novaCoverAbsorbAt<180)return;this.__novaCoverAbsorbAt=now;tone(this,260,110,.08,.012,p,'square');};
  Sfx.prototype.novaRouteCommit=function(p){var now=performance.now();if(this.__novaRouteAt&&now-this.__novaRouteAt<260)return;this.__novaRouteAt=now;tone(this,420,620,.05,.006,p,'triangle');};
});

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaCombinedArms)return;
  Game.prototype.__novaCombinedArms=true;
  var classes=require('./classes'),C=classes.CLASSES||{};

  Game.prototype.novaBattlefieldWaypoint=function(x,y,gx,gy,pad,seed){return chooseWaypoint(this,x,y,gx,gy,pad,seed);};
  Game.prototype.novaBlastExposure=function(t,x,y){return blastExposure(this,C,t,x,y);};

  /* Reuse one blast context object. Primitive state is restored after the
   * synchronous splash call, so nested/re-entrant behavior remains correct. */
  var oldSplash=Game.prototype.splashAt;
  Game.prototype.splashAt=function(x,y,radius){
    var c=this.__v172BlastContext||(this.__v172BlastContext={active:false,x:0,y:0,radius:0}),pa=c.active,px=c.x,py=c.y,pr=c.radius;
    c.active=true;c.x=x;c.y=y;c.radius=radius||0;
    try{return oldSplash.apply(this,arguments);}finally{c.active=pa;c.x=px;c.y=py;c.radius=pr;}
  };
  var oldDamage=Game.prototype.damageTank;
  Game.prototype.damageTank=function(t,dmg,srcId,kx,ky){
    var c=this.__v172BlastContext;
    if(c&&c.active&&t&&t.alive){
      var e=blastExposure(this,C,t,c.x,c.y);
      if(e<=.001){
        if(t.isPlayer&&dmg>18&&this.time-(t.__v172CoveredAt||-99)>.45){
          t.__v172CoveredAt=this.time;
          if(this.addText)this.addText(t.x,t.y-30,'COVERED','#aeeaff',9);
          if(this.sfx&&this.sfx.novaCoverAbsorb)this.sfx.novaCoverAbsorb(0);
        }
        return 0;
      }
      dmg*=e;kx=(kx||0)*e;ky=(ky||0)*e;
    }
    return oldDamage.call(this,t,dmg,srcId,kx,ky);
  };

  var oldTry=Game.prototype.tryFire;
  Game.prototype.tryFire=function(t){
    var before=this.bullets?this.bullets.length:0,out=oldTry.call(this,t);
    if(t&&this.bullets&&this.bullets.length>before&&lineage(classes,t)==='guardian'){
      for(var i=before;i<this.bullets.length;i++){
        var b=this.bullets[i];if(!b||b.ownerId!==t.id||!b.__v17Counter)continue;
        b.__novaStructureMult=Math.max(b.__novaStructureMult||1,1.34);b.__v172CounterBreach=true;
      }
    }
    return out;
  };

  function liveFuseDist(g,t){
    var range=g.weaponRange?g.weaponRange(t):650,a=g.input&&g.input.aim;
    if(t.isPlayer&&a&&a.active){var mag=Math.hypot(a.dx||0,a.dy||0),dep=clamp((mag-5)/55,.08,1);return clamp(range*(.20+.78*dep),150,range*.965);}
    return t.__v17FuseDist||range*.72;
  }
  function updateFusePreview(g,t){
    var dist=liveFuseDist(g,t),ex=t.x+Math.cos(t.angle)*dist,ey=t.y+Math.sin(t.angle)*dist,hit=g.firstTerrainHit?g.firstTerrainHit(t.x,t.y,ex,ey,4):null,p=t.__v172FusePreview||(t.__v172FusePreview={});
    if(hit&&hit.hit){p.blocked=true;p.x=hit.hit.x;p.y=hit.hit.y;p.programX=ex;p.programY=ey;p.programDist=dist;p.solid=hit.solid;p.actualDist=Math.hypot(hit.hit.x-t.x,hit.hit.y-t.y);}
    else{p.blocked=false;p.x=ex;p.y=ey;p.programX=ex;p.programY=ey;p.programDist=dist;p.solid=null;p.actualDist=dist;}
    return p;
  }
  Game.prototype.novaFusePreview=function(t){return updateFusePreview(this,t);};

  var oldMove=Game.prototype.moveTank;
  Game.prototype.moveTank=function(t,vx,vy,dt){
    if(t&&!t.isPlayer&&t.ai&&this.firstTerrainHit){
      var sp=Math.hypot(vx||0,vy||0);
      if(sp>18){
        var now=this.time||0,pad=classSize(C,t)+8,look=clamp(55+sp*.46,72,170),ux=vx/sp,uy=vy/sp,ax=t.x+ux*look,ay=t.y+uy*look;
        var probe=this.firstTerrainHit(t.x,t.y,ax,ay,pad*.62),wp=t.ai.__v172Waypoint;
        if(wp&&now>(t.ai.__v172WaypointUntil||0))wp=null;
        if(wp&&d2(t.x,t.y,wp.x,wp.y)<34*34)wp=null;
        if(probe&&!wp){
          var gx=ax+ux*look,gy=ay+uy*look;
          if(t.ai.__v172LastSeenAt!=null&&now-t.ai.__v172LastSeenAt<2.4){gx=t.ai.__v172LastSeenX;gy=t.ai.__v172LastSeenY;}
          wp=chooseWaypoint(this,t.x,t.y,gx,gy,pad,t.id);
          if(wp){t.ai.__v172Waypoint=wp;t.ai.__v172WaypointUntil=now+.95;}
        }
        if(wp){
          var qx=wp.x-t.x,qy=wp.y-t.y,ql=Math.hypot(qx,qy)||1;qx/=ql;qy/=ql;var blend=probe?.82:.58,sx=ux*(1-blend)+qx*blend,sy=uy*(1-blend)+qy*blend,nl=Math.hypot(sx,sy)||1,snx=sx/nl,sny=sy/nl;
          vx=snx*sp;vy=sny*sp;t.ai.__v172Routing=true;t.ai.wanderA=Math.atan2(sny,snx);
        }else t.ai.__v172Routing=false;
      }
    }
    return oldMove.call(this,t,vx,vy,dt);
  };

  Game.prototype.novaBreachCover=function(t,hit){
    if(!t||lineage(classes,t)!=='cannon'||!hit||!hit.solid||!hit.solid.destructible||hit.solid.hp<=0||t.fireCd>0)return false;
    var hx=hit.hit&&hit.hit.x!=null?hit.hit.x:hit.solid.x,hy=hit.hit&&hit.hit.y!=null?hit.hit.y:hit.solid.y;
    t.angle=Math.atan2(hy-t.y,hx-t.x);
    var oldTarget=t.ai?t.ai.targetId:-1,before=this.bullets?this.bullets.length:0;
    if(t.ai)t.ai.targetId=-1;
    t.__v172BreachFire=true;
    this.tryFire(t);
    t.__v172BreachFire=false;
    if(t.ai)t.ai.targetId=oldTarget;
    var mult=cannonStructure(t.cls);
    for(var i=before;i<(this.bullets?this.bullets.length:0);i++){
      var b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;b.__novaStructureMult=Math.max(b.__novaStructureMult||1,mult);b.__v172BreachIntent=true;
    }
    t.__v172BreachAt=this.time;
    return (this.bullets?this.bullets.length:0)>before;
  };

  var oldDrones=Game.prototype.updateDrones;
  Game.prototype.updateDrones=function(dt){
    var out=oldDrones.call(this,dt);
    if(!this.drones||!this.firstTerrainHit)return out;
    for(var i=0;i<this.drones.length;i++){
      var d=this.drones[i];if(!d||d.hp<=0||d.__novaSpotter||d.__novaPhase==='dash')continue;
      var owner=this.getTank&&this.getTank(d.ownerId);if(!owner||!owner.alive||!owner.__novaSwarm)continue;
      var gx,gy,tr=d.__novaTarget||d.targetRef;
      if(tr&&typeof tr==='object'&&tr.x!=null){gx=tr.x;gy=tr.y;}
      else if(typeof tr==='number'){var e=this.getTank&&this.getTank(tr);if(e&&e.alive){gx=e.x;gy=e.y;}}
      if(gx==null&&owner.__novaSwarm.active){gx=owner.__novaSwarm.nodeX;gy=owner.__novaSwarm.nodeY;}
      if(gx==null){gx=owner.x;gy=owner.y;}
      var pad=(d.r||8)+5;
      if(this.hasLineOfSight&&this.hasLineOfSight(d.x,d.y,gx,gy,Math.max(2,pad*.35))){d.__v172Waypoint=null;continue;}
      var wp=d.__v172Waypoint;
      if(!wp||this.time>(d.__v172WaypointUntil||0)||d2(d.x,d.y,wp.x,wp.y)<24*24){wp=chooseWaypoint(this,d.x,d.y,gx,gy,pad,d.id);d.__v172Waypoint=wp;d.__v172WaypointUntil=this.time+.72;}
      if(!wp)continue;
      var qx=wp.x-d.x,qy=wp.y-d.y,ql=Math.hypot(qx,qy)||1;qx/=ql;qy/=ql;var speed=Math.max(80,Math.hypot(d.__novaVX||0,d.__novaVY||0));
      d.__novaVX=(d.__novaVX||0)*.42+qx*speed*.58;d.__novaVY=(d.__novaVY||0)*.42+qy*speed*.58;
      d.x+=qx*22*dt;d.y+=qy*22*dt;d.__v172Routing=true;
    }
    return out;
  };

  var oldUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    var out=oldUpdate.call(this,dt);
    if(this.player&&this.player.alive&&lineage(classes,this.player)==='cannon')updateFusePreview(this,this.player);
    return out;
  };
});

wrap('game/ai',function(ai,require){
  var old=ai.updateAI;if(!old||old.__novaCombinedArmsAI)return;
  var classes=require('./classes'),C=classes.CLASSES||{};
  function patched(t,g,dt){
    if(!t||!t.ai)return old(t,g,dt);
    var a=t.ai,now=g.time||0,pre=a.targetId>=0&&g.getTank?g.getTank(a.targetId):null;
    if(pre&&pre.alive&&(!g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,pre.x,pre.y,3))){a.__v172LastSeenId=pre.id;a.__v172LastSeenX=pre.x;a.__v172LastSeenY=pre.y;a.__v172LastSeenAt=now;}
    var out=old(t,g,dt);
    var post=a.targetId>=0&&g.getTank?g.getTank(a.targetId):null;
    if(post&&post.alive&&(!g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,post.x,post.y,3))){a.__v172LastSeenId=post.id;a.__v172LastSeenX=post.x;a.__v172LastSeenY=post.y;a.__v172LastSeenAt=now;a.__v172Investigating=false;return out;}
    var age=now-(a.__v172LastSeenAt==null?-99:a.__v172LastSeenAt),memory=a.isElite?2.25:1.55;
    if(age>=0&&age<memory&&a.state!=='flee'){
      var gx=a.__v172LastSeenX,gy=a.__v172LastSeenY,pad=((C[t.cls]&&C[t.cls].size)||15)+8;
      var hit=g.firstTerrainHit?g.firstTerrainHit(t.x,t.y,gx,gy,pad*.4):null;
      var wp=hit&&g.novaBattlefieldWaypoint?g.novaBattlefieldWaypoint(t.x,t.y,gx,gy,pad,t.id):null;
      var tx=wp?wp.x:gx,ty=wp?wp.y:gy;
      a.wanderA=Math.atan2(ty-t.y,tx-t.x);a.wanderT=Math.max(a.wanderT||0,.38);a.thinkT=Math.max(a.thinkT||0,.08);a.state='wander';a.__v172Investigating=true;
      if(hit&&hit.solid&&hit.solid.destructible&&lineage(classes,t)==='cannon'&&age<1.05&&now-(t.__v172BreachAt||-99)>.42){
        var hx=hit.hit&&hit.hit.x!=null?hit.hit.x:hit.solid.x,hy=hit.hit&&hit.hit.y!=null?hit.hit.y:hit.solid.y;
        var dist=Math.hypot(hx-t.x,hy-t.y),range=g.weaponRange?g.weaponRange(t):650;
        if(dist<range*.94&&g.novaBreachCover)g.novaBreachCover(t,hit);
      }
    }else if(age>=memory){a.__v172Investigating=false;a.__v172LastSeenId=-1;}
    return out;
  }
  patched.__novaCombinedArmsAI=true;ai.updateAI=patched;
});

wrap('game/render',function(renderMod,require){
  var old=renderMod.render;if(!old||old.__novaCombinedArms)return;
  var classes=require('./classes'),screen={x:0,y:0,z:1};
  function patched(g,w,h){
    old(g,w,h);
    if(!g||!g.ctx||!g.player||!g.player.alive||lineage(classes,g.player)!=='cannon')return;
    var p=g.player.__v172FusePreview;if(!p||!p.blocked)return;
    var ctx=g.ctx,a=world(g,p.x,p.y,screen),solid=p.solid;
    ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,238,204,.94)';ctx.fillStyle='rgba(255,167,94,.12)';ctx.lineWidth=1.4;
    var r=9+2*Math.sin((g.time||0)*8);ctx.beginPath();ctx.moveTo(a.x-r,a.y-r);ctx.lineTo(a.x+r,a.y+r);ctx.moveTo(a.x+r,a.y-r);ctx.lineTo(a.x-r,a.y+r);ctx.stroke();
    ctx.beginPath();ctx.arc(a.x,a.y,r+5,0,TAU);ctx.stroke();
    ctx.font='800 8px Orbitron,system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe5c4';var label='IMPACT '+Math.round(p.actualDist);
    if(solid&&solid.destructible&&solid.maxHp)label+=' · COVER '+Math.round(clamp(solid.hp/solid.maxHp,0,1)*100)+'%';
    ctx.fillText(label,a.x,a.y-17);
    ctx.restore();
  }
  patched.__novaCombinedArms=true;renderMod.render=patched;
});

window.__NOVA_COMBINED_ARMS_TEST__={
  blastWeights:function(c,l,r){return clamp((c?.56:0)+(l?.22:0)+(r?.22:0),0,1);},
  chooseWaypoint:chooseWaypoint,
  cannonStructure:cannonStructure
};

console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
