/* NOVA TANKS v1.10.2 — Terrain Intelligence
 * Bounded multi-step routing, anti-stuck recovery, wall-aware tactical positioning,
 * and swarm lane discipline without omniscient target knowledge or a heavyweight navmesh.
 */
(function(){
'use strict';
if(window.__NOVA_TERRAIN_INTELLIGENCE__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.2] module registry unavailable');return;}

var VERSION='1.10.2',CODENAME='Terrain Intelligence',TAU=Math.PI*2;
var MAX_OBSTACLES=6,MAX_NODES=30,ROUTE_TTL_TANK=1.28,ROUTE_TTL_DRONE=.92;
var CONTROLLER_IDS={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};

window.__NOVA_VERSION=VERSION;
window.__NOVA_TERRAIN_INTELLIGENCE__={
  version:VERSION,codename:CODENAME,plans:0,cacheHits:0,stuckRecoveries:0,spotterReroutes:0,idleDroneReroutes:0,
  guarantees:{hiddenTracking:false,teleportRecovery:false,dashSteering:false,globalNavmesh:false}
};
window.__NOVA_TERRAIN_INTELLIGENCE_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-09',
  headline:'Bots stop treating every wall like a one-corner puzzle and start using terrain as navigable tactical space.',
  groups:{
    'Navigation Intelligence':[
      'The existing fast corner detour remains the cheap path for simple walls; complex occlusion escalates to a bounded local visibility route that can chain multiple safe corners through U-shapes, serial walls, gates and pockets.',
      'Routes are cached, string-pulled when a later waypoint becomes directly reachable, and invalidated when the goal moves materially or progress stalls.',
      'A movement watchdog detects genuine no-progress states and uses a short physical tangent escape plus alternate-side replanning instead of teleporting or repeatedly choosing the same failed corner.'
    ],
    'Tactical Terrain Use':[
      'Ranged AI slightly prefers route nodes that open a legitimate firing angle while preserving standoff, so Snipers and Cannons naturally work wall edges instead of blindly driving to a target coordinate.',
      'AI Controllers may route their hull toward a target currently sensed by their own drones, but only while that observation is physically valid; otherwise terrain pursuit falls back to frozen legitimate last-seen memory.',
      'Close-range lineages still favor direct pressure, while all lineages inherit safer multi-wall traversal and escape behavior.'
    ],
    'Drone Fieldcraft':[
      'Controller drones reuse the multi-step route cache for commands, screens, repairs and flanks, with small deterministic lane offsets that reduce several drones selecting the exact same corner pixel.',
      'Forward Observers apply terrain-aware steering to their own patrol velocity, so suspicion/search patrols bend around walls instead of repeatedly pushing their scout vector through them.',
      'Friendly swarm separation is velocity-based and restrained; committed windups and attack dashes remain commitment states and are never magically steered around cover.'
    ],
    'Performance and Fair Play':[
      'The visibility planner is local and bounded to a small set of nearby obstacle corners, activates only when the cheap one-corner answer cannot resolve the route, and reuses cached plans between decisions.',
      'No hidden tank coordinates, future movement, free through-wall sensing, stat changes or global map omniscience are introduced.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function dist(ax,ay,bx,by){return Math.sqrt(d2(ax,ay,bx,by));}
function liveSolid(s){return !!s&&s.solid!==false&&(!s.destructible||s.hp>0);}
function isController(t){return !!(t&&CONTROLLER_IDS[t.cls]);}
function lineage(classes,t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function safe(g,x,y,pad){return !g.isTerrainSafe||g.isTerrainSafe(x,y,Math.max(3,(pad||8)*.72));}
function visible(g,ax,ay,bx,by,pad){return !g.hasLineOfSight||g.hasLineOfSight(ax,ay,bx,by,Math.max(2,(pad||8)*.34));}
function seedSide(seed){var n=Math.abs(Number(seed)||0);return (n%2)?1:-1;}
function segDistanceSq(ax,ay,bx,by,px,py){var dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(l2<1e-8)return d2(ax,ay,px,py);var t=((px-ax)*dx+(py-ay)*dy)/l2;t=clamp(t,0,1);return d2(px,py,ax+dx*t,ay+dy*t);}
function solidRadius(s){return s.shape==='circle'?(s.r||0):Math.hypot((s.w||0)*.5,(s.h||0)*.5);}
function solidRouteScore(s,ax,ay,bx,by){return segDistanceSq(ax,ay,bx,by,s.x,s.y)-solidRadius(s)*solidRadius(s)*.65;}
function addNode(out,g,x,y,pad,solidId){if(out.length>=MAX_NODES||!safe(g,x,y,pad))return;for(var i=0;i<out.length;i++)if(d2(x,y,out[i].x,out[i].y)<18*18)return;out.push({x:x,y:y,solidId:solidId});}
function obstacleNodes(g,ax,ay,bx,by,pad){
  var terrain=g.__novaTerrain||[],ranked=[],corridor=Math.max(230,Math.min(660,dist(ax,ay,bx,by)*.34+120));
  for(var i=0;i<terrain.length;i++){
    var s=terrain[i];if(!liveSolid(s))continue;
    var reach=solidRadius(s)+corridor;if(segDistanceSq(ax,ay,bx,by,s.x,s.y)>reach*reach)continue;
    ranked.push({s:s,score:solidRouteScore(s,ax,ay,bx,by)});
  }
  ranked.sort(function(a,b){return a.score-b.score;});if(ranked.length>MAX_OBSTACLES)ranked.length=MAX_OBSTACLES;
  var out=[],clear=Math.max(13,(pad||8)+11);
  for(var r=0;r<ranked.length&&out.length<MAX_NODES;r++){
    var q=ranked[r].s;
    if(q.shape==='circle'){
      var rr=(q.r||35)+clear;for(var k=0;k<6;k++){var a=k*TAU/6;addNode(out,g,q.x+Math.cos(a)*rr,q.y+Math.sin(a)*rr,pad,q.id);}
    }else{
      var hx=(q.w||80)*.5+clear,hy=(q.h||80)*.5+clear;
      addNode(out,g,q.x-hx,q.y-hy,pad,q.id);addNode(out,g,q.x-hx,q.y+hy,pad,q.id);
      addNode(out,g,q.x+hx,q.y-hy,pad,q.id);addNode(out,g,q.x+hx,q.y+hy,pad,q.id);
    }
  }
  return out;
}
function tacticalFactor(g,node,ctx,pad){
  if(!ctx||!ctx.target)return 1;
  var ln=ctx.lineage;if(ln!=='sniper'&&ln!=='cannon'&&ln!=='controller')return 1;
  if(!visible(g,node.x,node.y,ctx.target.x,ctx.target.y,pad))return 1;
  var td=dist(node.x,node.y,ctx.target.x,ctx.target.y),preferred=ctx.preferred||520;
  if(ln==='controller'&&td<250)return 1.08;
  var err=Math.abs(td-preferred)/Math.max(220,preferred);
  if(ln==='sniper')return .88+Math.min(.08,err*.06);
  if(ln==='cannon')return .91+Math.min(.07,err*.055);
  return .94+Math.min(.05,err*.04);
}
function planVisibilityRoute(g,ax,ay,bx,by,pad,seed,ctx){
  pad=Math.max(5,pad||10);if(visible(g,ax,ay,bx,by,pad))return [];
  var mids=obstacleNodes(g,ax,ay,bx,by,pad),nodes=[{x:ax,y:ay,start:true},{x:bx,y:by,goal:true}];
  for(var i=0;i<mids.length&&nodes.length<MAX_NODES;i++)nodes.push(mids[i]);
  var n=nodes.length,gScore=new Array(n),fScore=new Array(n),came=new Array(n),open=[],closed=new Array(n),side=seedSide(seed),dx=bx-ax,dy=by-ay;
  for(i=0;i<n;i++){gScore[i]=Infinity;fScore[i]=Infinity;came[i]=-1;closed[i]=false;}
  gScore[0]=0;fScore[0]=dist(ax,ay,bx,by);open.push(0);
  var checks=0,maxChecks=520;
  while(open.length&&checks<maxChecks){
    var bi=0;for(i=1;i<open.length;i++)if(fScore[open[i]]<fScore[open[bi]])bi=i;
    var cur=open.splice(bi,1)[0];if(cur===1)break;if(closed[cur])continue;closed[cur]=true;
    var cn=nodes[cur];
    for(var j=1;j<n&&checks<maxChecks;j++){
      if(j===cur||closed[j])continue;var nn=nodes[j];
      var edge=dist(cn.x,cn.y,nn.x,nn.y);if(edge<8)continue;
      if(cur!==0&&j!==1&&edge>760)continue;
      checks++;if(!visible(g,cn.x,cn.y,nn.x,nn.y,pad))continue;
      var cross=dx*(nn.y-ay)-dy*(nn.x-ax),tie=(cross===0?0:(cross>0?1:-1)===side?-2.5:2.5);
      var cost=edge*tacticalFactor(g,nn,ctx,pad)+tie,ng=gScore[cur]+Math.max(1,cost);
      if(ng+1e-6<gScore[j]){gScore[j]=ng;came[j]=cur;fScore[j]=ng+dist(nn.x,nn.y,bx,by)*.91;if(open.indexOf(j)<0)open.push(j);}
    }
  }
  if(came[1]<0)return null;
  var rev=[],at=1,guard=0;while(at>0&&guard++<n+2){rev.push(nodes[at]);at=came[at];if(at<0)return null;}rev.reverse();
  var pulled=[],cx=ax,cy=ay,index=0;
  while(index<rev.length){var best=index;for(var k=rev.length-1;k>index;k--){if(visible(g,cx,cy,rev[k].x,rev[k].y,pad)){best=k;break;}}var p=rev[best];pulled.push({x:p.x,y:p.y,solidId:p.solidId});cx=p.x;cy=p.y;index=best+1;}
  return pulled;
}
function cacheKey(seed,pad){return String(seed==null?'x':seed)+':'+Math.round((pad||8)/4);}
function invalidateRoute(g,seed,pad){if(g&&g.__v1102Routes)delete g.__v1102Routes[cacheKey(seed,pad)];}
function laneOffset(g,x,y,wp,pad,seed){
  if((pad||99)>18||!wp)return wp;var lane=((Math.abs(Number(seed)||0)%3)-1)*Math.min(8,(pad||8)*.48);if(!lane)return wp;
  var dx=wp.x-x,dy=wp.y-y,m=Math.hypot(dx,dy)||1,px=-dy/m,py=dx/m,cx=wp.x+px*lane,cy=wp.y+py*lane;
  return safe(g,cx,cy,pad)&&visible(g,x,y,cx,cy,pad)?{x:cx,y:cy,solidId:wp.solidId,lane:lane}:wp;
}
function cachedWaypoint(g,x,y,gx,gy,pad,seed,oldWaypoint){
  pad=Math.max(5,pad||10);var now=g.time||0,key=cacheKey(seed,pad),map=g.__v1102Routes||(g.__v1102Routes=Object.create(null)),c=map[key],goalTol=Math.max(68,pad*4.5);
  if(c&&(now>c.until||d2(c.gx,c.gy,gx,gy)>goalTol*goalTol)){delete map[key];c=null;}
  if(c&&c.points&&c.index<c.points.length){
    while(c.index<c.points.length&&d2(x,y,c.points[c.index].x,c.points[c.index].y)<Math.pow(20+pad*.65,2))c.index++;
    if(c.index>=c.points.length){delete map[key];c=null;}
    else{
      if(now>=(c.validateAt||0)){
        c.validateAt=now+.11;
        for(var k=c.points.length-1;k>c.index;k--){if(visible(g,x,y,c.points[k].x,c.points[k].y,pad)){c.index=k;break;}}
        if(!visible(g,x,y,c.points[c.index].x,c.points[c.index].y,pad)){delete map[key];c=null;}
      }
      if(c){window.__NOVA_TERRAIN_INTELLIGENCE__.cacheHits++;return laneOffset(g,x,y,c.points[c.index],pad,seed);}
    }
  }
  var cheap=oldWaypoint?oldWaypoint.call(g,x,y,gx,gy,pad,seed):null;
  if(cheap&&visible(g,cheap.x,cheap.y,gx,gy,pad))return cheap;
  var ctx=g.__v1102RouteContext||null,route=planVisibilityRoute(g,x,y,gx,gy,pad,seed,ctx);
  if(route&&route.length){c=map[key]={gx:gx,gy:gy,points:route,index:0,until:now+((pad<=18)?ROUTE_TTL_DRONE:ROUTE_TTL_TANK),validateAt:now+.11};window.__NOVA_TERRAIN_INTELLIGENCE__.plans++;return laneOffset(g,x,y,route[0],pad,seed);}
  return cheap;
}
function controllerSenses(g,owner,target){
  if(!owner||!target||!target.alive)return false;
  if(d2(owner.x,owner.y,target.x,target.y)<=850*850&&visible(g,owner.x,owner.y,target.x,target.y,3))return true;
  var ds=g.drones||[];for(var i=0;i<ds.length;i++){var d=ds[i];if(!d||d.hp<=0||d.ownerId!==owner.id)continue;if(d2(d.x,d.y,target.x,target.y)<=520*520&&visible(g,d.x,d.y,target.x,target.y,2))return true;}return false;
}
function observedPoint(g,t,classes,now){
  if(!t||!t.ai)return null;var a=t.ai,target=a.targetId>=0&&g.getTank?g.getTank(a.targetId):null;
  if(target&&target.alive&&visible(g,t.x,t.y,target.x,target.y,3))return{x:target.x,y:target.y,id:target.id,live:true,source:'sight'};
  if(target&&target.alive&&isController(t)&&t.__novaCommandAI&&t.__novaCommandAI.targetId===target.id&&controllerSenses(g,t,target))return{x:target.x,y:target.y,id:target.id,live:true,source:'drone'};
  var age=now-(a.__v172LastSeenAt==null?-99:a.__v172LastSeenAt),memory=a.isElite?2.25:1.55;
  if(a.__v172LastSeenId>=0&&age>=0&&age<memory&&a.__v172LastSeenX!=null)return{x:a.__v172LastSeenX,y:a.__v172LastSeenY,id:a.__v172LastSeenId,live:false,source:'memory'};
  return null;
}
function preferredRange(g,t,classes){var ln=lineage(classes,t),r=g.weaponRange?g.weaponRange(t):620;if(ln==='sniper')return r*.76;if(ln==='cannon')return r*.62;if(ln==='controller')return Math.max(360,r*.70);return r*.52;}
function tangentEscape(hit,ux,uy,seed,flip){
  var side=seedSide(seed)*(flip?-1:1),nx=hit&&hit.hit&&(hit.hit.nx||0),ny=hit&&hit.hit&&(hit.hit.ny||0),m=Math.hypot(nx,ny);
  if(m>.1){nx/=m;ny/=m;return{x:-ny*side,y:nx*side};}
  return{x:-uy*side,y:ux*side};
}
function sampleStuck(g,obj,vx,vy,pad,seed,state){
  var now=g.time||0,sp=Math.hypot(vx||0,vy||0);state=state||(obj.__v1102Nav||(obj.__v1102Nav={}));if(sp<16){state.sampleAt=now;state.x=obj.x;state.y=obj.y;state.stuck=Math.max(0,(state.stuck||0)-1);return state;}
  if(state.sampleAt==null){state.sampleAt=now;state.x=obj.x;state.y=obj.y;return state;}
  var elapsed=now-state.sampleAt;if(elapsed<.30)return state;
  var moved=dist(state.x,state.y,obj.x,obj.y),wanted=sp*elapsed,ux=vx/sp,uy=vy/sp,hit=g.firstTerrainHit?g.firstTerrainHit(obj.x,obj.y,obj.x+ux*Math.max(70,pad*3),obj.y+uy*Math.max(70,pad*3),pad*.58):null;
  if(moved<Math.max(3.5,wanted*.11)&&(hit||obj.__v172Routing))state.stuck=(state.stuck||0)+1;else state.stuck=Math.max(0,(state.stuck||0)-1);
  state.sampleAt=now;state.x=obj.x;state.y=obj.y;
  if(state.stuck>=2&&now>=(state.escapeCooldown||0)){
    state.flip=!state.flip;var e=tangentEscape(hit,ux,uy,seed,state.flip);state.escapeX=e.x;state.escapeY=e.y;state.escapeUntil=now+.34;state.escapeCooldown=now+.62;state.stuck=0;
    invalidateRoute(g,seed,pad);obj.__v172Waypoint=null;window.__NOVA_TERRAIN_INTELLIGENCE__.stuckRecoveries++;
  }
  return state;
}
function applyEscape(state,vx,vy){var sp=Math.hypot(vx||0,vy||0);if(!state||sp<1||!state.escapeX)return{x:vx,y:vy};var ux=vx/sp,uy=vy/sp,x=ux*.24+state.escapeX*.76,y=uy*.24+state.escapeY*.76,m=Math.hypot(x,y)||1;return{x:x/m*sp,y:y/m*sp};}
function droneIntent(d){
  var vx=d.__novaVX||0,vy=d.__novaVY||0;if(d.__novaSpotter&&Math.hypot(d.__novaScoutVX||0,d.__novaScoutVY||0)>24){vx=d.__novaScoutVX||0;vy=d.__novaScoutVY||0;}return{x:vx,y:vy};
}
function separateSwarm(group){
  for(var i=0;i<group.length;i++){var a=group[i];if(!a||a.hp<=0||a.__novaPhase==='dash'||a.__novaPhase==='windup')continue;var sx=0,sy=0,n=0;
    for(var j=0;j<group.length;j++){if(i===j)continue;var b=group[j];if(!b||b.hp<=0)continue;var dd=d2(a.x,a.y,b.x,b.y);if(dd<=1||dd>30*30)continue;var m=Math.sqrt(dd);sx+=(a.x-b.x)/m*(1-m/30);sy+=(a.y-b.y)/m*(1-m/30);n++;}
    if(n){var sm=Math.hypot(sx,sy)||1,speed=Math.max(80,Math.hypot(a.__novaVX||0,a.__novaVY||0));a.__novaVX=(a.__novaVX||0)+sx/sm*speed*.075;a.__novaVY=(a.__novaVY||0)+sy/sm*speed*.075;}
  }
}
function idleControllerGoal(d){
  if(!d)return null;var mode=d.__novaIdleMode,t=null;
  if(mode==='defend')t=d.__novaDefenseTarget;
  else if(mode==='farm')t=d.__novaIdleShape;
  else if(mode==='return'||mode==='guard')t=d.__novaHomePoint;
  if(!t||!Number.isFinite(t.x)||!Number.isFinite(t.y)||t.hp===0)return null;
  return{x:t.x,y:t.y};
}
function blockedDroneStep(g,ax,ay,bx,by,pad){
  if(!safe(g,bx,by,pad))return true;
  if(g.firstTerrainHit&&g.firstTerrainHit(ax,ay,bx,by,Math.max(3,(pad||8)*.58)))return true;
  return false;
}
function preserveIdleDroneTerrain(g,d,pre,dt,pad){
  if(!g||!d||!pre)return false;var px=d.x,py=d.y,step=dist(pre.x,pre.y,px,py);if(step<.001||!blockedDroneStep(g,pre.x,pre.y,px,py,pad))return false;
  var goal=idleControllerGoal(d),wp=goal&&g.novaBattlefieldWaypoint?g.novaBattlefieldWaypoint(pre.x,pre.y,goal.x,goal.y,pad,d.id):null;
  d.x=pre.x;d.y=pre.y;
  if(!wp){d.__novaVX=(d.__novaVX||0)*.2;d.__novaVY=(d.__novaVY||0)*.2;d.__novaIdleVX=d.__novaVX;d.__novaIdleVY=d.__novaVY;return true;}
  var dx=wp.x-pre.x,dy=wp.y-pre.y,m=Math.hypot(dx,dy);if(m<.001)return true;var travel=Math.min(step,m),nx=pre.x+dx/m*travel,ny=pre.y+dy/m*travel;
  if(blockedDroneStep(g,pre.x,pre.y,nx,ny,pad))return true;
  d.x=nx;d.y=ny;var speed=step/Math.max(.001,Number(dt)||.016);d.__novaVX=dx/m*speed;d.__novaVY=dy/m*speed;d.__novaIdleVX=d.__novaVX;d.__novaIdleVY=d.__novaVY;d.angle=Math.atan2(d.__novaVY,d.__novaVX);d.__v172Routing=true;window.__NOVA_TERRAIN_INTELLIGENCE__.idleDroneReroutes++;return true;
}

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaTerrainIntelligence)return;Game.prototype.__novaTerrainIntelligence=true;
  var classes=require('./classes'),C=classes.CLASSES||{};
  var oldWaypoint=Game.prototype.novaBattlefieldWaypoint;
  Game.prototype.novaBattlefieldWaypoint=function(x,y,gx,gy,pad,seed){
    var ctx=this.__v1102RouteContext;
    if(ctx&&ctx.forceGoal&&ctx.target){gx=ctx.target.x;gy=ctx.target.y;}
    return cachedWaypoint(this,x,y,gx,gy,pad,seed,oldWaypoint);
  };
  Game.prototype.novaInvalidateRoute=function(seed,pad){invalidateRoute(this,seed,pad);};

  var oldMove=Game.prototype.moveTank;
  if(oldMove)Game.prototype.moveTank=function(t,vx,vy,dt){
    if(!t||t.isPlayer||!t.ai)return oldMove.apply(this,arguments);
    var now=this.time||0,pad=((C[t.cls]&&C[t.cls].size)||15)+8,sp=Math.hypot(vx||0,vy||0),obs=observedPoint(this,t,classes,now),ln=lineage(classes,t),ctx=null;
    if(obs&&(ln==='sniper'||ln==='cannon'||ln==='controller'))ctx={tank:t,lineage:ln,target:obs,preferred:preferredRange(this,t,classes),forceGoal:ln==='controller'&&obs.source==='drone'};
    var st=sampleStuck(this,t,vx,vy,pad,t.id,t.ai.__v1102Nav||(t.ai.__v1102Nav={}));
    if(st.escapeUntil>now&&sp>1){var e=applyEscape(st,vx,vy);vx=e.x;vy=e.y;}
    var prev=this.__v1102RouteContext;this.__v1102RouteContext=ctx;
    try{return oldMove.call(this,t,vx,vy,dt);}finally{this.__v1102RouteContext=prev;}
  };

  var oldDrones=Game.prototype.updateDrones;
  if(oldDrones)Game.prototype.updateDrones=function(dt){
    var before=Object.create(null),preDs=this.drones||[],pi;
    for(pi=0;pi<preDs.length;pi++){
      var pd=preDs[pi];if(!pd||pd.hp<=0||pd.__novaPhase==='dash'||pd.__novaPhase==='windup')continue;var po=this.getTank&&this.getTank(pd.ownerId);
      if(po&&po.alive&&isController(po)&&po.__novaSwarm&&!po.__novaSwarm.active)before[pd.id]={x:pd.x,y:pd.y};
    }
    var out=oldDrones.call(this,dt),now=this.time||0,groups=Object.create(null),ds=this.drones||[];
    for(var i=0;i<ds.length;i++){
      var d=ds[i];if(!d||d.hp<=0)continue;var owner=this.getTank&&this.getTank(d.ownerId);if(!owner||!owner.alive)continue;
      if(isController(owner)) (groups[owner.id]||(groups[owner.id]=[])).push(d);
      if(d.__novaPhase==='dash'||d.__novaPhase==='windup')continue;
      var pad=(d.r||8)+5;
      if(before[d.id]&&owner.__novaSwarm&&!owner.__novaSwarm.active)preserveIdleDroneTerrain(this,d,before[d.id],dt,pad);
      var intent=droneIntent(d),sp=Math.hypot(intent.x,intent.y),st=sampleStuck(this,d,intent.x,intent.y,pad,d.id,d.__v1102Nav||(d.__v1102Nav={}));
      if(st.escapeUntil>now&&sp>1){var e=applyEscape(st,intent.x,intent.y);if(d.__novaSpotter){d.__novaScoutVX=e.x;d.__novaScoutVY=e.y;}else{d.__novaVX=e.x;d.__novaVY=e.y;}}
      if(d.__novaSpotter&&sp>28&&now>=(d.__v1102SpotterPlanAt||0)){
        d.__v1102SpotterPlanAt=now+.125+((Math.abs(d.id||0)%3)*.014);var ux=intent.x/sp,uy=intent.y/sp,gx=d.x+ux*360,gy=d.y+uy*360;
        if(this.hasLineOfSight&&!this.hasLineOfSight(d.x,d.y,gx,gy,Math.max(2,pad*.35))){
          var wp=this.novaBattlefieldWaypoint(d.x,d.y,gx,gy,pad,d.id);if(wp){var dx=wp.x-d.x,dy=wp.y-d.y,m=Math.hypot(dx,dy)||1,speed=Math.max(180,sp);d.__novaScoutVX=(d.__novaScoutVX||0)*.34+dx/m*speed*.66;d.__novaScoutVY=(d.__novaScoutVY||0)*.34+dy/m*speed*.66;d.__v172Routing=true;window.__NOVA_TERRAIN_INTELLIGENCE__.spotterReroutes++;}
        }
      }
    }
    Object.keys(groups).forEach(function(k){separateSwarm(groups[k]);});
    return out;
  };
});

window.__NOVA_TERRAIN_INTELLIGENCE_TEST__={
  obstacleNodes:obstacleNodes,planVisibilityRoute:planVisibilityRoute,seedSide:seedSide,segDistanceSq:segDistanceSq,
  controllerSenses:controllerSenses,observedPoint:observedPoint,tangentEscape:tangentEscape,applyEscape:applyEscape,
  idleControllerGoal:idleControllerGoal,blockedDroneStep:blockedDroneStep,preserveIdleDroneTerrain:preserveIdleDroneTerrain,
  isControllerId:function(id){return !!CONTROLLER_IDS[id];},limits:{maxObstacles:MAX_OBSTACLES,maxNodes:MAX_NODES}
};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
