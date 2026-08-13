/* NOVA TANKS v1.8.0 — Predator Doctrine
 * Competence campaign for rival tanks: tactical target selection, fair perception,
 * analytical interception, projectile-risk dodging, role-aware spacing, anti-cheese
 * flanking, cover discipline, and deliberate ability timing.
 *
 * Fair-play contract:
 * - no hidden target coordinates after legitimate sight is lost;
 * - no stat, level, damage, cooldown, or movement bonuses are granted here;
 * - decisions are sampled at a bounded reaction cadence and held between plans;
 * - expensive geometry is sampled only on planning ticks; existing Frame Budget
 *   movement routing remains responsible for continuous collision-safe steering.
 */
(function(){
'use strict';

var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.8.0] module registry unavailable');return;}

var VERSION='1.8.0',CODENAME='Predator Doctrine',TAU=Math.PI*2,ARENA=2250;
window.__NOVA_VERSION=VERSION;
window.__NOVA_PREDATOR_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Rivals stop following scripts and start reading fights — without reading through walls.',
  groups:{
    'Predatory Decision-Making':[
      'Rivals score visible threats by danger, vulnerability, distance, recent damage, and target saturation instead of blindly choosing the nearest body.',
      'Each class lineage now fights for a useful range and angle: snipers kite and relocate, Cannons shape lanes, Controllers orbit behind their swarm, Gunners pressure, and Guardians close with intent.',
      'Repeated circle-strafing, edge hugging and prolonged cover peeks influence flank direction, so one safe pattern does not solve every encounter.',
      'Wounded tanks choose between cover, break-contact, or continued pressure according to role and nerve instead of sharing one universal panic threshold.'
    ],
    'Aim, Fire and Abilities':[
      'Projectile interception solves target velocity analytically and adds bounded acceleration reading, then applies a persistent human-like aim error instead of frame-by-frame random spray.',
      'Fire discipline checks line-of-sight, weapon identity, range, aim settlement, heat, and cover before committing a shot.',
      'Abilities are used for recognizable tactical reasons — defensive guards under pressure, Stampede on committed lanes, Phase for escape or execution, Overheat inside pressure windows, and artillery/rail abilities when a real shot exists.',
      'Bots still rotate and react through the normal simulation; Predator Doctrine never snaps a turret from an unaligned state into a guaranteed hit.'
    ],
    'Survival and Counterplay':[
      'Incoming projectiles are evaluated by time-to-closest-approach, producing deterministic risk-minimizing dodges instead of coin-flip sidesteps.',
      'Low-health ranged units actively look for nearby occluded positions while Guardians are more willing to hold or counter-push.',
      'Last-seen pursuit remains frozen to the last legitimate contact and expires quickly; hidden movement is never sampled for pursuit or fire.',
      'Player dogpiles are softened by target-saturation scoring so danger comes from crossfire and roles, not every bot receiving the same invisible order.'
    ],
    'Performance and QA':[
      'Tactical plans run at a staggered bounded cadence and cache movement, aim, posture, and threat state between updates.',
      'The existing Combined Arms waypoint system and Frame Budget terrain broad-phase remain authoritative for route execution.',
      'Predator telemetry exposes plan, dodge, held-shot, flank and ability counts for Blackglass/debug inspection without adding per-frame allocations.',
      'Regression tests lock fair memory, target saturation, projectile threat math, intercept prediction, cover seeking, ability intent, and the no-stat-buff contract.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function ad(target,current){var d=(target-current+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}
function lerp(a,b,t){return a+(b-a)*t;}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function lineage(classes,t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function sizeOf(C,t){return (t&&C[t.cls]&&C[t.cls].size)||15;}
function abilityOf(C,t){return t&&C[t.cls]&&C[t.cls].ability||null;}
function alive(t){return !!t&&t.alive!==false&&t.hp>0;}
function visible(g,a,b,pad){
  if(!alive(b))return false;
  return !g.hasLineOfSight||g.hasLineOfSight(a.x,a.y,b.x,b.y,pad==null?3:pad);
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
  var range=g.weaponRange?g.weaponRange(t):650,ln=lineage(classes,t),id=t.cls;
  if(a&&a.archetype==='ram'||id==='juggernaut'||id==='meteor'||id==='ravager')return Math.min(145,range*.28);
  if(ln==='sniper')return clamp(range*.72,500,1080);
  if(ln==='cannon')return clamp(range*.60,360,780);
  if(ln==='controller')return clamp(range*.54,330,680);
  if(ln==='guardian')return clamp(range*.32,170,360);
  if(id==='shotgun'||id==='breachlord')return clamp(range*.34,135,260);
  if(id==='flakmaster')return clamp(range*.52,260,520);
  if(ln==='gunner')return clamp(range*.48,240,520);
  return clamp(range*.48,220,520);
}
function saturation(g,targetId,selfId){
  var n=0,ts=g.tanks||[];
  for(var i=0;i<ts.length;i++){
    var q=ts[i];if(!q||q.id===selfId||!q.ai||!alive(q))continue;
    if(q.ai.targetId===targetId&&(q.ai.state==='hunt'||q.ai.__v180Posture==='pressure'||q.ai.__v180Posture==='flank'))n++;
  }
  return n;
}
function targetDanger(classes,t){
  var ln=lineage(classes,t),x=.45;
  if(ln==='sniper')x=.78;else if(ln==='cannon')x=.72;else if(ln==='controller')x=.68;else if(ln==='guardian')x=.64;else if(ln==='gunner')x=.62;
  if(t&&t.tier>=3)x+=.12;
  return clamp(x,0,1);
}
function scoreTarget(g,classes,t,a,q,vision,now){
  if(!alive(q)||q.id===t.id)return -Infinity;
  var dx=q.x-t.x,dy=q.y-t.y,dist=Math.hypot(dx,dy);
  if(dist>vision)return -Infinity;
  var seen=visible(g,t,q,3);
  var retaliate=a.__v180LastAttacker===q.id&&now-(a.__v180HitAt||-99)<1.8;
  /* A recent attacker is more important only after legitimate reacquisition. */
  if(!seen)return -Infinity;
  var hp=clamp(q.hp/Math.max(1,q.maxHp||q.hp||1),0,1),near=1-clamp(dist/vision,0,1);
  var score=near*.82+(1-hp)*.62+targetDanger(classes,q)*.42+(retaliate?.82:0);
  if(q.isPlayer)score+=.46;
  var sat=saturation(g,q.id,t.id);
  score-=sat*(q.isPlayer?.18:.28);
  if(q.isPlayer&&sat>=5)score-=.72+(sat-5)*.2;
  return score;
}
function chooseTarget(g,classes,t,a,now){
  var vision=780+((t.level||1)*7)+(a.isElite?320:0),best=null,bs=-Infinity,ts=g.tanks||[];
  for(var i=0;i<ts.length;i++){
    var q=ts[i],s=scoreTarget(g,classes,t,a,q,vision,now);
    if(s>bs){bs=s;best=q;}
  }
  return best;
}
function solveIntercept(sx,sy,tx,ty,tvx,tvy,speed,maxT,out){
  out=out||{};var rx=tx-sx,ry=ty-sy,a=tvx*tvx+tvy*tvy-speed*speed,b=2*(rx*tvx+ry*tvy),c=rx*rx+ry*ry,t=0;
  if(Math.abs(a)<1e-6){t=Math.abs(b)>1e-6?-c/b:0;}
  else{
    var disc=b*b-4*a*c;
    if(disc>=0){var root=Math.sqrt(disc),t1=(-b-root)/(2*a),t2=(-b+root)/(2*a);t=t1>0&&t2>0?Math.min(t1,t2):Math.max(t1,t2);}
  }
  if(!(t>0))t=Math.sqrt(c)/Math.max(1,speed);
  t=clamp(t,0,maxT==null?1.05:maxT);out.t=t;out.x=tx+tvx*t;out.y=ty+tvy*t;return out;
}
function threatVector(g,C,t,out){
  out=out||{};var vx=0,vy=0,risk=0,soon=9,bs=g.bullets||[],safe=sizeOf(C,t)+20;
  for(var i=0;i<bs.length;i++){
    var b=bs[i];if(!b||b.dead||b.ownerId===t.id)continue;
    var rx=b.x-t.x,ry=b.y-t.y,v2=(b.vx||0)*(b.vx||0)+(b.vy||0)*(b.vy||0);if(v2<100)continue;
    var tc=-(rx*(b.vx||0)+ry*(b.vy||0))/v2;if(tc<0||tc>.82)continue;
    var cx=rx+(b.vx||0)*tc,cy=ry+(b.vy||0)*tc,cd=Math.hypot(cx,cy);if(cd>safe*1.75)continue;
    var w=(1-clamp(cd/(safe*1.75),0,1))*(1-clamp(tc/.82,0,1));
    var l=Math.hypot(cx,cy);
    if(l>2){vx-=cx/l*w;vy-=cy/l*w;}
    else{var sp=Math.sqrt(v2),side=(((t.id||0)+(b.ownerId||0))&1)?1:-1;vx+=(-(b.vy||0)/sp)*side*w;vy+=((b.vx||0)/sp)*side*w;}
    risk+=w;if(tc<soon)soon=tc;
  }
  var m=Math.hypot(vx,vy);out.x=m>0?vx/m:0;out.y=m>0?vy/m:0;out.risk=clamp(risk,0,1.8);out.soon=soon;return out;
}
function pathClear(g,t,x,y,pad){return !g.hasLineOfSight||g.hasLineOfSight(t.x,t.y,x,y,pad||8);}
function seekCover(g,C,t,target,out){
  out=out||{};if(!target||!g.hasLineOfSight)return null;
  var best=-Infinity,bx=0,by=0,r=155,pad=sizeOf(C,t)+7;
  for(var i=0;i<8;i++){
    var ang=i*TAU/8+((t.id||0)%3)*.11,cx=t.x+Math.cos(ang)*r,cy=t.y+Math.sin(ang)*r;
    if(Math.abs(cx)>ARENA-90||Math.abs(cy)>ARENA-90)continue;
    if(g.isTerrainSafe&&!g.isTerrainSafe(cx,cy,pad*.7))continue;
    if(!pathClear(g,t,cx,cy,pad*.45))continue;
    var blocked=!g.hasLineOfSight(target.x,target.y,cx,cy,3),dist=Math.hypot(cx-target.x,cy-target.y);
    var score=(blocked?2.2:0)+clamp(dist/700,0,1)*.42;
    if(score>best){best=score;bx=cx;by=cy;}
  }
  if(best<1.8)return null;
  var dx=bx-t.x,dy=by-t.y,m=Math.hypot(dx,dy)||1;out.x=dx/m;out.y=dy/m;out.score=best;return out;
}
function trackMotion(a,t,target,now){
  if(a.__v180TrackId!==target.id){a.__v180TrackId=target.id;a.__v180TrackAt=now;a.__v180TrackVx=target.vx||0;a.__v180TrackVy=target.vy||0;a.__v180Orbit=0;return;}
  var dt=Math.max(.04,now-(a.__v180TrackAt||now)),pvx=a.__v180TrackVx||0,pvy=a.__v180TrackVy||0;
  a.__v180Ax=clamp(((target.vx||0)-pvx)/dt,-240,240);a.__v180Ay=clamp(((target.vy||0)-pvy)/dt,-240,240);
  var rx=target.x-t.x,ry=target.y-t.y,cross=rx*(target.vy||0)-ry*(target.vx||0),speed=Math.hypot(target.vx||0,target.vy||0),rad=Math.hypot(rx,ry)||1;
  var orbit=speed>35?clamp(cross/(rad*speed),-1,1):0;a.__v180Orbit=(a.__v180Orbit||0)*.72+orbit*.28;
  a.__v180TrackAt=now;a.__v180TrackVx=target.vx||0;a.__v180TrackVy=target.vy||0;
}
function rolePosture(classes,t,a,hp,dist,pref,risk){
  var ln=lineage(classes,t);
  if(hp<.28&&ln!=='guardian')return 'break';
  if(risk>.85&&hp<.55)return 'break';
  if(ln==='sniper'&&dist<pref*.72)return 'kite';
  if(ln==='cannon'&&dist<pref*.58)return 'kite';
  if(ln==='guardian'||a.archetype==='ram')return 'pressure';
  if(dist>pref*1.28)return 'pressure';
  return 'flank';
}
function movementPlan(g,classes,C,t,a,target,memX,memY,seen,risk,out){
  out=out||{};var tx=target?target.x:memX,ty=target?target.y:memY;
  if(tx==null){out.own=false;return out;}
  var dx=tx-t.x,dy=ty-t.y,dist=Math.hypot(dx,dy)||1,ux=dx/dist,uy=dy/dist,px=-uy,py=ux;
  var pref=a.__v180Preferred||preferredRange(g,classes,C,t,a),hp=clamp(t.hp/Math.max(1,t.maxHp||t.hp||1),0,1);
  var posture=seen&&target?rolePosture(classes,t,a,hp,dist,pref,risk.risk):'investigate';
  var side=a.__v180FlankSide||((((t.id||0)*17+(target?target.id:0))&1)?1:-1);
  if(target&&Math.abs(a.__v180Orbit||0)>.46)side=a.__v180Orbit>0?1:-1;
  if(target&&(Math.abs(target.x)>ARENA-260||Math.abs(target.y)>ARENA-260)){
    var centerX=-target.x/(Math.hypot(target.x,target.y)||1),centerY=-target.y/(Math.hypot(target.x,target.y)||1),cross=ux*centerY-uy*centerX;
    if(Math.abs(cross)>.12)side=cross>0?1:-1;
  }
  a.__v180FlankSide=side;
  var radial=0,tangent=0;
  if(posture==='investigate'){radial=1;tangent=.36*side;}
  else if(posture==='break'){radial=-1;tangent=.62*side;}
  else if(posture==='kite'){radial=dist<pref?-.9:.18;tangent=.78*side;}
  else if(posture==='pressure'){radial=dist>pref*.82?1:.18;tangent=.40*side;}
  else{radial=dist>pref*1.15?.55:dist<pref*.78?-.42:.04;tangent=.96*side;}
  var mx=ux*radial+px*tangent,my=uy*radial+py*tangent;
  var cover=null;
  if(target&&seen&&(posture==='break'||(hp<.46&&lineage(classes,t)!=='guardian')))cover=seekCover(g,C,t,target,a.__v180Cover||(a.__v180Cover={}));
  if(cover){mx=cover.x*1.15+mx*.25;my=cover.y*1.15+my*.25;posture='cover';}
  if(risk.risk>.12){var dw=clamp(.38+risk.risk*.72,.38,1.25);mx+=risk.x*dw;my+=risk.y*dw;if(risk.risk>.45)posture='evade';}
  if(t.x>ARENA-240)mx-=clamp((t.x-(ARENA-240))/170,0,1.2);if(t.x<-ARENA+240)mx+=clamp((-ARENA+240-t.x)/170,0,1.2);
  if(t.y>ARENA-240)my-=clamp((t.y-(ARENA-240))/170,0,1.2);if(t.y<-ARENA+240)my+=clamp((-ARENA+240-t.y)/170,0,1.2);
  var m=Math.hypot(mx,my)||1;out.x=mx/m;out.y=my/m;out.own=true;out.posture=posture;out.dist=dist;return out;
}
function lineBlocked(g,t,x,y,pad){return !!(g.firstTerrainHit&&g.firstTerrainHit(t.x,t.y,x,y,pad||3));}
function planAim(g,classes,C,t,a,target,now,out){
  out=out||{};var speed=Math.max(60,g.bulletSpeed?g.bulletSpeed(t):(C[t.cls]&&C[t.cls].bullet&&C[t.cls].bullet.speed)||450);
  var range=g.weaponRange?g.weaponRange(t):650,maxT=clamp(range/speed,0.18,1.2),iv=a.__v180Intercept||(a.__v180Intercept={});
  solveIntercept(t.x,t.y,target.x,target.y,target.vx||0,target.vy||0,speed,maxT,iv);
  var ax=a.__v180Ax||0,ay=a.__v180Ay||0,accelWeight=.16*iv.t*iv.t;iv.x+=ax*accelWeight;iv.y+=ay*accelWeight;
  var s=skillOf(t,a),err=lerp(.092,.018,s),noise=Math.sin(now*(2.15+(t.id%7)*.13)+(t.id||0)*1.913)*err;
  out.x=iv.x;out.y=iv.y;out.angle=Math.atan2(iv.y-t.y,iv.x-t.x)+noise;out.error=err;out.time=iv.t;return out;
}
function fireTolerance(classes,t){var ln=lineage(classes,t);if(ln==='sniper')return .065;if(ln==='cannon')return .10;if(t.cls==='shotgun'||t.cls==='breachlord')return .15;if(ln==='guardian')return .16;return .115;}
function shouldFire(g,classes,C,t,a,target,now){
  if(!target||!alive(target)||!visible(g,t,target,3))return false;
  var range=g.weaponRange?g.weaponRange(t):650,dist=Math.hypot(target.x-t.x,target.y-t.y),ln=lineage(classes,t);
  if(dist>range*.96)return false;
  if((t.cls==='shotgun'||t.cls==='breachlord')&&dist>range*.69)return false;
  if(ln==='gunner'&&(t.__v17Heat||0)>.89)return false;
  if(ln==='gunner'&&(t.__v17Heat||0)>.76&&dist>range*.58)return false;
  var aim=a.__v180AimAngle==null?t.angle:a.__v180AimAngle;if(Math.abs(ad(aim,t.angle))>fireTolerance(classes,t))return false;
  if(g.firstTerrainHit){var hit=g.firstTerrainHit(t.x,t.y,a.__v180AimX||target.x,a.__v180AimY||target.y,2.5);if(hit&&ln!=='cannon')return false;}
  return true;
}
function canBreachMemory(g,classes,t,a,now){
  if(lineage(classes,t)!=='cannon'||!a.__v172Investigating||a.__v172LastSeenAt==null||now-a.__v172LastSeenAt>1.05||!g.firstTerrainHit)return false;
  var hit=g.firstTerrainHit(t.x,t.y,a.__v172LastSeenX,a.__v172LastSeenY,4);return !!(hit&&hit.solid&&hit.solid.destructible&&hit.solid.hp>0);
}
function planAbility(g,classes,C,t,a,target,seen,risk,now){
  a.__v180AbilityPermit=false;a.__v180AbilityAngle=null;
  if((t.abilityCd||0)>0)return;
  var ab=abilityOf(C,t);if(!ab||ab==='none')return;
  var hp=clamp(t.hp/Math.max(1,t.maxHp||t.hp||1),0,1),dist=target?Math.hypot(target.x-t.x,target.y-t.y):9999,range=g.weaponRange?g.weaponRange(t):650;
  var due=false,ang=target?Math.atan2(target.y-t.y,target.x-t.x):t.angle;
  if(ab==='bulwark'||ab==='taunt')due=(risk.risk>.34)||(seen&&target&&dist<420&&hp<.72);
  else if(ab==='stampede')due=!!(seen&&target&&dist>150&&dist<560&&Math.abs(ad(ang,t.angle))<.34&&!lineBlocked(g,t,target.x,target.y,sizeOf(C,t)*.35));
  else if(ab==='overheat')due=!!(seen&&target&&dist<range*.72&&(t.__v17Heat||0)<.68);
  else if(ab==='pointblank')due=!!(seen&&target&&dist<Math.min(285,range*.58));
  else if(ab==='ragnarok')due=!!(seen&&target&&dist<range*.88&&Math.abs(ad(a.__v180AimAngle||ang,t.angle))<.18);
  else if(ab==='supercharge')due=!!(seen&&target&&dist>300&&dist<range*.94&&Math.abs(ad(a.__v180AimAngle||ang,t.angle))<.12);
  else if(ab==='swarm')due=!!(seen&&target&&dist<760);
  else if(ab==='phase'){
    if(target&&hp<.36&&dist<520){ang=Math.atan2(t.y-target.y,t.x-target.x);due=true;}
    else if(seen&&target&&target.hp<target.maxHp*.32&&dist<440){ang=Math.atan2(target.y-t.y,target.x-t.x)+(a.__v180FlankSide||1)*.34;due=true;}
  }
  if(due&&now-(a.__v180LastAbilityAt||-99)>.55){a.__v180AbilityPermit=true;a.__v180AbilityAngle=ang;}
}
function plan(t,g,classes,C,a,now){
  var target=chooseTarget(g,classes,t,a,now),seen=false;
  if(target){seen=visible(g,t,target,3);a.targetId=target.id;a.state='hunt';a.__v180TargetId=target.id;a.__v180Seen=seen;if(seen){trackMotion(a,t,target,now);a.__v180LastSeenX=target.x;a.__v180LastSeenY=target.y;a.__v180LastSeenAt=now;}}
  else{a.__v180Seen=false;}
  var memory=a.isElite?2.05:1.48,memAge=now-(a.__v180LastSeenAt==null?-99:a.__v180LastSeenAt);
  if(!target&&a.__v180TargetId>=0&&memAge>=0&&memAge<memory){
    var remembered=g.getTank?g.getTank(a.__v180TargetId):null;
    /* Do not read remembered.x/y here. The only legal pursuit coordinates are the frozen snapshot. */
    target=remembered;seen=false;a.targetId=-1;a.state='wander';a.__v180Seen=false;
  }else if(!target){
    a.__v180TargetId=-1;var sh=g.nearestShape?g.nearestShape(t.x,t.y,620):null;
    if(sh){a.targetId=sh.id;a.state='farm';}else{a.targetId=-1;a.state='wander';}
  }
  a.__v180Preferred=preferredRange(g,classes,C,t,a);a.preferredRange=a.__v180Preferred;
  var risk=threatVector(g,C,t,a.__v180Threat||(a.__v180Threat={}));
  var mv=movementPlan(g,classes,C,t,a,seen?target:null,a.__v180LastSeenX,a.__v180LastSeenY,seen,risk,a.__v180Move||(a.__v180Move={}));
  a.__v180OwnMove=!!mv.own;a.__v180MoveX=mv.x||0;a.__v180MoveY=mv.y||0;a.__v180Posture=mv.posture||a.state;
  if(seen&&target){var aim=planAim(g,classes,C,t,a,target,now,a.__v180Aim||(a.__v180Aim={}));a.__v180AimX=aim.x;a.__v180AimY=aim.y;a.__v180AimAngle=aim.angle;}
  planAbility(g,classes,C,t,a,seen?target:null,seen,risk,now);
  a.__v180PlanT=reactionFor(t,a);a.thinkT=Math.max(a.thinkT||0,a.__v180PlanT+.06);
  var tel=window.__NOVA_AI_DIRECTOR__;if(tel){tel.plans++;if(risk.risk>.25)tel.dodgePlans++;if(a.__v180Posture==='cover')tel.coverPlans++;if(a.__v180Posture==='flank')tel.flankPlans++;}
}

wrap('game/engine',function(engine){
  var Game=engine.Game;if(!Game||Game.prototype.__novaPredatorDoctrine)return;
  Game.prototype.__novaPredatorDoctrine=true;
  var oldDamage=Game.prototype.damageTank;
  if(oldDamage)Game.prototype.damageTank=function(t,dmg,sourceId){
    if(t&&t.ai&&sourceId!=null&&sourceId!==t.id){t.ai.__v180LastAttacker=sourceId;t.ai.__v180HitAt=this.time||0;}
    return oldDamage.apply(this,arguments);
  };
  var oldSpawn=Game.prototype.spawnAITank;
  if(oldSpawn)Game.prototype.spawnAITank=function(){
    var before=this.tanks?this.tanks.length:0,out=oldSpawn.apply(this,arguments),after=this.tanks?this.tanks.length:0;
    for(var i=before;i<after;i++){
      var t=this.tanks[i];if(!t||!t.ai)continue;
      t.ai.__v180FlankSide=(((t.id||0)*1103515245+12345)&1)?1:-1;t.ai.__v180TargetId=-1;t.ai.__v180PlanT=.025+((t.id||0)%6)*.013;
    }
    return out;
  };
});

wrap('game/ai',function(ai,require){
  var old=ai.updateAI;if(!old||old.__novaPredatorDoctrine)return;
  var classes=require('./classes'),C=classes.CLASSES||{};
  function patched(t,g,dt){
    if(!t||!t.ai)return old(t,g,dt);
    var a=t.ai,now=g.time||0;
    a.__v180PlanT=(a.__v180PlanT==null?0:a.__v180PlanT)-dt;
    if(a.__v180PlanT<=0)plan(t,g,classes,C,a,now);
    else a.thinkT=Math.max(a.thinkT||0,.07);

    var ownMove=Object.prototype.hasOwnProperty.call(g,'moveTank'),ownFire=Object.prototype.hasOwnProperty.call(g,'tryFire'),ownAbility=Object.prototype.hasOwnProperty.call(g,'useAbility');
    var move=g.moveTank,fire=g.tryFire,use=g.useAbility,target=a.__v180TargetId>=0&&g.getTank?g.getTank(a.__v180TargetId):null;
    if(move)g.moveTank=function(tt,vx,vy,dd){
      if(tt===t&&a.__v180OwnMove){var sp=g.tankSpeed?g.tankSpeed(tt):Math.hypot(vx||0,vy||0);return move.call(g,tt,a.__v180MoveX*sp,a.__v180MoveY*sp,dd);}
      return move.apply(g,arguments);
    };
    if(fire)g.tryFire=function(tt){
      if(tt!==t)return fire.apply(g,arguments);
      var ok=shouldFire(g,classes,C,t,a,target,now),breach=!ok&&canBreachMemory(g,classes,t,a,now);
      if(!ok&&!breach){if(window.__NOVA_AI_DIRECTOR__)window.__NOVA_AI_DIRECTOR__.shotsHeld++;return;}
      if(ok&&a.__v180AimAngle!=null){var tol=fireTolerance(classes,t);if(Math.abs(ad(a.__v180AimAngle,t.angle))>tol)return;t.angle=a.__v180AimAngle;}
      return fire.apply(g,arguments);
    };
    if(use)g.useAbility=function(tt){
      if(tt!==t)return use.apply(g,arguments);
      if(!a.__v180AbilityPermit)return;
      a.__v180AbilityPermit=false;a.__v180LastAbilityAt=now;
      if(a.__v180AbilityAngle!=null)t.angle=a.__v180AbilityAngle;
      if(window.__NOVA_AI_DIRECTOR__)window.__NOVA_AI_DIRECTOR__.abilities++;
      return use.apply(g,arguments);
    };
    var out;
    try{out=old(t,g,dt);}finally{
      if(move){if(ownMove)g.moveTank=move;else delete g.moveTank;}
      if(fire){if(ownFire)g.tryFire=fire;else delete g.tryFire;}
      if(use){if(ownAbility)g.useAbility=use;else delete g.useAbility;}
    }
    /* Deliberate ability intent should not wait for the legacy 2% random roll. */
    if(use&&a.__v180AbilityPermit&&(t.abilityCd||0)<=0){
      if(a.__v180AbilityAngle!=null)t.angle=a.__v180AbilityAngle;
      a.__v180AbilityPermit=false;a.__v180LastAbilityAt=now;
      if(window.__NOVA_AI_DIRECTOR__)window.__NOVA_AI_DIRECTOR__.abilities++;
      use.call(g,t);
    }
    /* During legitimate memory pursuit, do not let the legacy aim rotation leak the hidden live position. */
    if(!a.__v180Seen&&a.__v180Posture==='investigate'&&a.__v180LastSeenX!=null)t.angle=Math.atan2(a.__v180LastSeenY-t.y,a.__v180LastSeenX-t.x);
    return out;
  }
  patched.__novaPredatorDoctrine=true;ai.updateAI=patched;
});

window.__NOVA_AI_DIRECTOR__={
  version:VERSION,codename:CODENAME,plans:0,dodgePlans:0,coverPlans:0,flankPlans:0,shotsHeld:0,abilities:0,
  fairPlay:{wallVision:false,hiddenTracking:false,statBuffs:false,reactionFloorMs:78,normalMemorySeconds:1.48,eliteMemorySeconds:2.05}
};
window.__NOVA_PREDATOR_TEST__={
  solveIntercept:solveIntercept,threatVector:threatVector,reactionFor:reactionFor,preferredRange:preferredRange,
  saturation:saturation,scoreTarget:scoreTarget,seekCover:seekCover,fireTolerance:fireTolerance
};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' hunting intelligently');
})();
