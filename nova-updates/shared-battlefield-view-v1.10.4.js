/* NOVA TANKS v1.10.4 — Shared Battlefield View
 * AI perception now mirrors the information already exposed to the player:
 * every living tank is globally tracked by the minimap, so terrain occlusion
 * cannot erase a rival from AI awareness either.
 *
 * Knowledge is deliberately separated from execution:
 * - cover never deletes a known tank or freezes its coordinates;
 * - bullets, direct-fire abilities and movement still obey physical terrain;
 * - reaction cadence, imperfect aim, cooldowns, class rules and drone leash stay real;
 * - Cannons may use known live positions to breach destructible cover, exactly
 *   because the player can make the same structural decision from the overhead view.
 */
(function(){
'use strict';
if(window.__NOVA_SHARED_BATTLEFIELD_VIEW__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.4] module registry unavailable');return;}

var VERSION='1.10.4',CODENAME='Shared Battlefield View',TAU=Math.PI*2,ARENA=2250;
var CONTROLLER_IDS={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};

window.__NOVA_VERSION=VERSION;
window.__NOVA_SHARED_BATTLEFIELD_VIEW__={
  version:VERSION,codename:CODENAME,plans:0,coveredTracks:0,globalTracks:0,controllerPlans:0,breachPlans:0,
  contract:{
    playerMinimapParity:true,
    globalLivingTankTracking:true,
    occlusionBreaksAwareness:false,
    occlusionBlocksDirectFire:true,
    physicalTerrain:true,
    reactionLimited:true,
    statBuffs:false,
    inputReading:false
  }
};
window.__NOVA_SHARED_BATTLEFIELD_VIEW_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-10',
  headline:'Rivals finally see the battlefield the way the player does: cover blocks weapons, not knowledge.',
  groups:{
    'Player-View Parity':[
      'Every living tank already appears on the player minimap, so AI tank awareness now uses that same global battlefield truth instead of a separate eye-level line-of-sight bubble.',
      'Moving behind a wall no longer makes a rival forget, freeze, or expire the player position; live position and motion remain trackable at the normal AI decision cadence.',
      'Target choice remains tactical rather than obsessive: distance, vulnerability, class danger, current commitment and target saturation still decide which known opponent matters most.'
    ],
    'Knowledge Is Not Permission':[
      'Terrain occlusion continues to block ordinary direct fire. Knowing where a tank is does not let a projectile pass through a wall.',
      'AI may pre-aim, flank, route, hold a lane, predict an exit, or choose a breach while the target is covered — the same decisions available to a player looking down on the arena.',
      'Destructible cover remains a real exception only through existing structural mechanics; permanent walls remain permanent walls.'
    ],
    'System Parity':[
      'Controllers keep their tactical target through cover and distance while their drones still obey leash, pathing, attack commitment and collision rules.',
      'Sniper/Observer, Cannon fuse, Gunner heat, Guardian facing, ability cooldown, projectile physics and terrain systems remain authoritative; this layer supplies information, not mechanical exemptions.',
      'Reaction cadence and coherent aim error remain bounded, so broader awareness does not become frame-perfect execution.'
    ],
    'Future Contract':[
      'AI may consume information that the normal player presentation makes public. If a future stealth mechanic removes a tank from the player map/view, the shared-awareness predicate must remove it from AI knowledge too.',
      'Regression coverage locks covered tracking, long-range map awareness, through-wall fire denial, Cannon structural decisions, Controller parity, reaction cadence and the no-stat-buff rule.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function alive(t){return !!t&&t.alive!==false&&t.hp>0;}
function lineage(classes,t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function abilityOf(C,t){return t&&C[t.cls]&&C[t.cls].ability||null;}
function sizeOf(C,t){return (t&&C[t.cls]&&C[t.cls].size)||15;}
function angleDiff(target,current){var d=(target-current+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}

/* Canonical information predicate.
 * Today the minimap renders every living tank without LOS, range, cloak or cover
 * filtering. Keep this tiny and explicit so a future player-visibility change has
 * one obvious AI parity hook to update. */
function playerTracksTank(g,observer,target){
  return !!(g&&observer&&target&&observer.id!==target.id&&alive(target));
}
function physicalSight(g,a,b,pad){
  if(!alive(b))return false;
  return !g.hasLineOfSight||g.hasLineOfSight(a.x,a.y,b.x,b.y,pad==null?3:pad);
}
function saturation(g,targetId,selfId){
  var n=0,ts=g.tanks||[];
  for(var i=0;i<ts.length;i++){
    var q=ts[i];if(!q||q.id===selfId||!q.ai||!alive(q))continue;
    var id=q.ai.__v1104TargetId>=0?q.ai.__v1104TargetId:(q.ai.__v180TargetId>=0?q.ai.__v180TargetId:q.ai.targetId);
    if(id===targetId&&(q.ai.state==='hunt'||q.ai.__v180Posture==='pressure'||q.ai.__v180Posture==='flank'||q.ai.__v180Posture==='route'))n++;
  }
  return n;
}
function targetDanger(classes,t){
  var ln=lineage(classes,t),x=.45;
  if(ln==='sniper')x=.78;else if(ln==='cannon')x=.72;else if(ln==='controller')x=.68;else if(ln==='guardian')x=.64;else if(ln==='gunner')x=.62;
  if(t&&t.tier>=3)x+=.12;
  return clamp(x,0,1);
}
function scoreTarget(g,classes,t,a,q,now){
  if(!playerTracksTank(g,t,q))return -Infinity;
  var dist=Math.hypot(q.x-t.x,q.y-t.y),near=1/(1+dist/720);
  var hp=clamp(q.hp/Math.max(1,q.maxHp||q.hp||1),0,1);
  var score=near*1.18+(1-hp)*.58+targetDanger(classes,q)*.38;
  if(q.isPlayer)score+=.28;
  if(q.spawnShieldT>0)score-=.48;
  if(a.__v1104TargetId===q.id)score+=.24;
  if(a.__v180LastAttacker===q.id&&now-(a.__v180HitAt||-99)<2.2)score+=.32;
  var sat=saturation(g,q.id,t.id);
  score-=sat*(q.isPlayer?.16:.25);
  if(q.isPlayer&&sat>=5)score-=.56+(sat-5)*.18;
  return score;
}
function chooseTarget(g,classes,t,a,now){
  var ts=g.tanks||[],best=null,bs=-Infinity;
  for(var i=0;i<ts.length;i++){var q=ts[i],s=scoreTarget(g,classes,t,a,q,now);if(s>bs){bs=s;best=q;}}
  return best;
}
function skillOf(t,a){
  var level=clamp(((t&&t.level)||1)-1,0,49)/49;
  return clamp(.28+level*.46+(a&&a.isElite?.13:0)+clamp((a&&a.aggression)||.5,0,1.25)*.07,.28,.92);
}
function reactionFor(t,a){
  var s=skillOf(t,a),base=lerp(.175,.105,s);
  if(a&&a.isElite)base-=.018;
  return clamp(base,.078,.18)+((Math.abs((t&&t.id)||0)%5)*.006);
}
function preferredRange(g,classes,C,t,a){
  if(window.__NOVA_PREDATOR_TEST__&&window.__NOVA_PREDATOR_TEST__.preferredRange){
    try{return window.__NOVA_PREDATOR_TEST__.preferredRange(g,classes,C,t,a);}catch(_){}
  }
  var range=g.weaponRange?g.weaponRange(t):650,ln=lineage(classes,t);
  if(ln==='sniper')return clamp(range*.72,500,1080);
  if(ln==='cannon')return clamp(range*.60,360,780);
  if(ln==='controller')return clamp(range*.54,330,680);
  if(ln==='guardian')return clamp(range*.32,170,360);
  return clamp(range*.48,220,520);
}
function solveIntercept(sx,sy,tx,ty,tvx,tvy,speed,maxT,out){
  if(window.__NOVA_PREDATOR_TEST__&&window.__NOVA_PREDATOR_TEST__.solveIntercept){
    try{return window.__NOVA_PREDATOR_TEST__.solveIntercept(sx,sy,tx,ty,tvx,tvy,speed,maxT,out);}catch(_){}
  }
  out=out||{};var rx=tx-sx,ry=ty-sy,A=tvx*tvx+tvy*tvy-speed*speed,B=2*(rx*tvx+ry*tvy),C=rx*rx+ry*ry,tt=0;
  if(Math.abs(A)<1e-6)tt=Math.abs(B)>1e-6?-C/B:0;
  else{var disc=B*B-4*A*C;if(disc>=0){var root=Math.sqrt(disc),t1=(-B-root)/(2*A),t2=(-B+root)/(2*A);tt=t1>0&&t2>0?Math.min(t1,t2):Math.max(t1,t2);}}
  if(!(tt>0))tt=Math.sqrt(C)/Math.max(1,speed);
  tt=clamp(tt,0,maxT==null?1.05:maxT);out.t=tt;out.x=tx+tvx*tt;out.y=ty+tvy*tt;return out;
}
function threatVector(g,C,t,out){
  out=out||{};var vx=0,vy=0,risk=0,soon=9,bs=g.bullets||[],safe=sizeOf(C,t)+20;
  for(var i=0;i<bs.length;i++){
    var b=bs[i];if(!b||b.dead||b.ownerId===t.id)continue;
    var rx=b.x-t.x,ry=b.y-t.y,v2=(b.vx||0)*(b.vx||0)+(b.vy||0)*(b.vy||0);if(v2<100)continue;
    var tc=-(rx*(b.vx||0)+ry*(b.vy||0))/v2;if(tc<0||tc>.82)continue;
    var cx=rx+(b.vx||0)*tc,cy=ry+(b.vy||0)*tc,cd=Math.hypot(cx,cy);if(cd>safe*1.75)continue;
    var w=(1-clamp(cd/(safe*1.75),0,1))*(1-clamp(tc/.82,0,1)),m=Math.hypot(cx,cy);
    if(m>2){vx-=cx/m*w;vy-=cy/m*w;}else{var sp=Math.sqrt(v2),side=(((t.id||0)+(b.ownerId||0))&1)?1:-1;vx+=(-(b.vy||0)/sp)*side*w;vy+=((b.vx||0)/sp)*side*w;}
    risk+=w;if(tc<soon)soon=tc;
  }
  var l=Math.hypot(vx,vy);out.x=l?vx/l:0;out.y=l?vy/l:0;out.risk=clamp(risk,0,1.8);out.soon=soon;return out;
}
function movementPlan(g,classes,C,t,a,target,sight,risk,out){
  out=out||{};if(!target){out.own=false;return out;}
  var dx=target.x-t.x,dy=target.y-t.y,dist=Math.hypot(dx,dy)||1,ux=dx/dist,uy=dy/dist,px=-uy,py=ux;
  var pref=a.__v180Preferred||preferredRange(g,classes,C,t,a),ln=lineage(classes,t),hp=clamp(t.hp/Math.max(1,t.maxHp||t.hp||1),0,1);
  var side=a.__v1104FlankSide||a.__v180FlankSide||((((t.id||0)*17+target.id)&1)?1:-1);
  var radial=0,tangent=0,posture='flank';
  if(!sight){
    posture='route';
    radial=ln==='sniper'?.62:ln==='cannon'?.70:ln==='controller'?.68:.88;
    tangent=(ln==='guardian'?.18:.42)*side;
  }else if(hp<.28&&ln!=='guardian'){
    posture='break';radial=-1;tangent=.18*side;
  }else if((ln==='sniper'||ln==='cannon')&&dist<pref*.72){
    posture='kite';radial=-.82;tangent=.46*side;
  }else if(ln==='guardian'||a.archetype==='ram'){
    posture='pressure';radial=1;tangent=.12*side;
  }else if(dist>pref*1.28){
    posture='pressure';radial=.96;tangent=.20*side;
  }else{
    posture='flank';radial=(dist>pref?.24:-.18);tangent=.84*side;
  }
  var x=ux*radial+px*tangent,y=uy*radial+py*tangent;
  if(risk.risk>.16){var rw=clamp(risk.risk*.72,0,.92);x=x*(1-rw)+risk.x*rw;y=y*(1-rw)+risk.y*rw;posture=risk.risk>.72?'dodge':posture;}
  var m=Math.hypot(x,y)||1;out.x=x/m;out.y=y/m;out.own=true;out.posture=posture;return out;
}
function planAim(g,t,a,target,now,out){
  out=out||{};var speed=g.bulletSpeed?g.bulletSpeed(t):500,maxT=1.08;
  var p=solveIntercept(t.x,t.y,target.x,target.y,target.vx||0,target.vy||0,speed,maxT,out);
  var s=skillOf(t,a),err=lerp(.052,.010,s),bucket=Math.floor(now/Math.max(.078,reactionFor(t,a)));
  var seed=Math.sin((t.id||1)*12.9898+(target.id||1)*78.233+bucket*37.719)*43758.5453;
  var frac=seed-Math.floor(seed),offset=(frac*2-1)*err;
  p.angle=Math.atan2(p.y-t.y,p.x-t.x)+offset;
  var range=g.weaponRange?g.weaponRange(t):650,dist=Math.hypot(target.x-t.x,target.y-t.y),lead=clamp(dist/Math.max(1,range),0,1);
  p.x=t.x+Math.cos(p.angle)*Math.max(40,dist+lead*4);p.y=t.y+Math.sin(p.angle)*Math.max(40,dist+lead*4);
  return p;
}
function blockedDestructible(g,t,target,C){
  if(!g.firstTerrainHit||!target)return null;
  var hit=g.firstTerrainHit(t.x,t.y,target.x,target.y,Math.max(3,sizeOf(C,t)*.28));
  return hit&&hit.solid&&hit.solid.destructible&&hit.solid.hp>0?hit:null;
}
function planAbility(g,classes,C,t,a,target,sight,risk,now){
  a.__v180AbilityPermit=false;a.__v180AbilityAngle=null;
  if((t.abilityCd||0)>0)return;
  var ab=abilityOf(C,t);if(!ab||ab==='none')return;
  var hp=clamp(t.hp/Math.max(1,t.maxHp||t.hp||1),0,1),dist=target?Math.hypot(target.x-t.x,target.y-t.y):9999,range=g.weaponRange?g.weaponRange(t):650;
  var due=false,ang=target?Math.atan2(target.y-t.y,target.x-t.x):t.angle;
  if(ab==='bulwark'||ab==='taunt')due=(risk.risk>.34)||(sight&&target&&dist<420&&hp<.72);
  else if(ab==='stampede')due=!!(sight&&target&&dist>150&&dist<560&&Math.abs(angleDiff(ang,t.angle))<.34);
  else if(ab==='overheat')due=!!(sight&&target&&dist<range*.72&&(t.__v17Heat||0)<.68);
  else if(ab==='pointblank')due=!!(sight&&target&&dist<Math.min(285,range*.58));
  else if(ab==='ragnarok'||ab==='supercharge')due=!!(sight&&target&&dist<range*.92);
  else if(ab==='swarm')due=!!(target&&dist<900);
  else if(ab==='phase'){
    if(target&&hp<.36&&dist<520){ang=Math.atan2(t.y-target.y,t.x-target.x);due=true;}
    else if(sight&&target&&target.hp<target.maxHp*.32&&dist<440){ang+= (a.__v1104FlankSide||1)*.34;due=true;}
  }
  if(due&&now-(a.__v180LastAbilityAt||-99)>.55){a.__v180AbilityPermit=true;a.__v180AbilityAngle=ang;}
}
function rememberPublicTarget(a,target,now){
  a.__v1104TargetId=target.id;a.__v1104TrackX=target.x;a.__v1104TrackY=target.y;a.__v1104TrackVx=target.vx||0;a.__v1104TrackVy=target.vy||0;a.__v1104TrackAt=now;
  /* Compatibility fields used by Combined Arms and Predator are intentionally
   * refreshed from public map knowledge. Their old names say "LastSeen", but the
   * source is now the same live battlefield view the player owns. */
  a.__v180TargetId=target.id;a.__v180LastSeenX=target.x;a.__v180LastSeenY=target.y;a.__v180LastSeenAt=now;
  a.__v172LastSeenId=target.id;a.__v172LastSeenX=target.x;a.__v172LastSeenY=target.y;a.__v172LastSeenAt=now;
}
function plan(t,g,classes,C,a,now){
  var target=chooseTarget(g,classes,t,a,now);
  if(!target){
    a.__v1104TargetId=-1;a.__v180TargetId=-1;a.__v180Seen=false;a.__v180OwnMove=false;a.__v180AbilityPermit=false;
    if(a.state!=='flee'){a.targetId=-1;}
    a.__v1104PlanT=reactionFor(t,a);return;
  }
  var sight=physicalSight(g,t,target,3);
  rememberPublicTarget(a,target,now);
  a.targetId=target.id;if(a.state!=='flee')a.state='hunt';
  a.__v180Seen=sight;a.__v180Preferred=preferredRange(g,classes,C,t,a);a.preferredRange=a.__v180Preferred;
  if(!sight)window.__NOVA_SHARED_BATTLEFIELD_VIEW__.coveredTracks++;
  if(Math.hypot(target.x-t.x,target.y-t.y)>1200)window.__NOVA_SHARED_BATTLEFIELD_VIEW__.globalTracks++;
  var risk=threatVector(g,C,t,a.__v180Threat||(a.__v180Threat={})),mv=movementPlan(g,classes,C,t,a,target,sight,risk,a.__v180Move||(a.__v180Move={}));
  a.__v180OwnMove=!!mv.own;a.__v180MoveX=mv.x||0;a.__v180MoveY=mv.y||0;a.__v180Posture=mv.posture||'hunt';
  var aim=planAim(g,t,a,target,now,a.__v180Aim||(a.__v180Aim={}));
  a.__v180AimX=aim.x;a.__v180AimY=aim.y;a.__v180AimAngle=aim.angle;
  planAbility(g,classes,C,t,a,target,sight,risk,now);
  var breach=!sight&&lineage(classes,t)==='cannon'&&blockedDestructible(g,t,target,C);
  a.__v1104Breach=!!breach;
  /* Predator's existing Cannon breach path keys off this compatibility bit. */
  a.__v172Investigating=!!breach;
  if(breach)window.__NOVA_SHARED_BATTLEFIELD_VIEW__.breachPlans++;
  a.__v1104PlanT=reactionFor(t,a);window.__NOVA_SHARED_BATTLEFIELD_VIEW__.plans++;
}
function controllerPlan(g,classes,owner,now){
  if(!owner||!owner.ai||!CONTROLLER_IDS[owner.cls])return;
  var target=chooseTarget(g,classes,owner,owner.ai,now),p=owner.__novaCommandAI||(owner.__novaCommandAI={thinkAt:0,commitUntil:0,targetId:-1,flankSide:(owner.id&1)?1:-1,pressure:'probe',lastCueAt:-99,cueUntil:0,lastProgressAt:now,lastOwnHp:owner.hp});
  if(!target){p.targetId=-1;p.thinkAt=now+.28;return;}
  var changed=p.targetId!==target.id;
  if(changed||now>=(p.commitUntil||0)){p.targetId=target.id;p.commitUntil=now+(owner.ai.isElite?.78:1.02);if(changed)p.flankSide*=-1;p.pressure=changed?'probe':(p.pressure==='probe'?'breach':'probe');}
  p.thinkAt=now+(owner.ai.isElite?.22:.34)+((owner.id%3)*.025);
  owner.ai.targetId=target.id;owner.ai.__v1104TargetId=target.id;if(owner.ai.state!=='flee')owner.ai.state='hunt';
  window.__NOVA_SHARED_BATTLEFIELD_VIEW__.controllerPlans++;
}

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaSharedBattlefieldView)return;
  Game.prototype.__novaSharedBattlefieldView=true;
  var classes=require('./classes');
  Game.prototype.novaPlayerTracksTank=function(observer,target){return playerTracksTank(this,observer,target);};
  var oldDrones=Game.prototype.updateDrones;
  if(oldDrones)Game.prototype.updateDrones=function(dt){
    var now=this.time||0,ts=this.tanks||[];
    for(var i=0;i<ts.length;i++){var t=ts[i];if(!t||t.isPlayer||!alive(t)||!t.ai||!CONTROLLER_IDS[t.cls])continue;controllerPlan(this,classes,t,now);}
    return oldDrones.apply(this,arguments);
  };
});

wrap('game/ai',function(ai,require){
  var old=ai.updateAI;if(!old||old.__novaSharedBattlefieldView)return;
  var classes=require('./classes'),C=classes.CLASSES||{};
  function patched(t,g,dt){
    if(!t||!t.ai)return old(t,g,dt);
    var a=t.ai,now=g.time||0;
    a.__v1104PlanT=(a.__v1104PlanT==null?0:a.__v1104PlanT)-dt;
    if(a.__v1104PlanT<=0)plan(t,g,classes,C,a,now);

    var target=a.__v1104TargetId>=0&&g.getTank?g.getTank(a.__v1104TargetId):null;
    if(target&&alive(target)){
      /* Keep the old Predator planner asleep; this layer owns perception/plan
       * inputs while Predator continues to enforce its mature execution gates. */
      a.__v180PlanT=Math.max(a.__v180PlanT||0,.46);
      rememberPublicTarget(a,target,now);
      a.targetId=target.id;
      if(a.state!=='flee')a.state='hunt';
      var sight=physicalSight(g,t,target,3);
      a.__v180Seen=sight;
      a.__v172Investigating=!!(!sight&&lineage(classes,t)==='cannon'&&blockedDestructible(g,t,target,C));
      /* Battle Sense's old LOS-only strategic bias must not pull an actively
       * tracked rival off-route merely because cover exists. */
      if(!sight){a.__v181BiasW=0;a.__v181Think=Math.max(a.__v181Think||0,.22);}
    }

    var out=old(t,g,dt);

    /* Combined Arms historically rewrites an occluded contact into wander after
     * its update. Restore the shared-view contract after the legacy chain runs. */
    target=a.__v1104TargetId>=0&&g.getTank?g.getTank(a.__v1104TargetId):null;
    if(target&&alive(target)){
      rememberPublicTarget(a,target,now);
      a.targetId=target.id;if(a.state!=='flee')a.state='hunt';
      a.__v172Investigating=false;
      a.__v180Seen=physicalSight(g,t,target,3);
    }
    return out;
  }
  patched.__novaSharedBattlefieldView=true;ai.updateAI=patched;
});

/* Supersede historical debug wording so diagnostics describe the active rules,
 * while leaving the old standalone module tests/history intact. */
if(window.__NOVA_AI_DIRECTOR__&&window.__NOVA_AI_DIRECTOR__.fairPlay){
  window.__NOVA_AI_DIRECTOR__.fairPlay.wallVision='player-map-parity';
  window.__NOVA_AI_DIRECTOR__.fairPlay.hiddenTracking='not-hidden-to-player';
  window.__NOVA_AI_DIRECTOR__.fairPlay.occlusionBlocksFire=true;
  window.__NOVA_AI_DIRECTOR__.fairPlay.occlusionBreaksAwareness=false;
}
if(window.__NOVA_TERRAIN_INTELLIGENCE__&&window.__NOVA_TERRAIN_INTELLIGENCE__.guarantees){
  window.__NOVA_TERRAIN_INTELLIGENCE__.guarantees.hiddenTracking='player-map-parity';
}

window.__NOVA_SHARED_BATTLEFIELD_VIEW_TEST__={
  playerTracksTank:playerTracksTank,physicalSight:physicalSight,scoreTarget:scoreTarget,chooseTarget:chooseTarget,
  reactionFor:reactionFor,movementPlan:movementPlan,blockedDestructible:blockedDestructible,isControllerId:function(id){return !!CONTROLLER_IDS[id];}
};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' online');
})();