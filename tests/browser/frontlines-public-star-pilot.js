'use strict';
/* Research-only public-information Star interception policy.
 * Hidden world entities may be inspected solely to apply the exact
 * visibility gate. Their coordinates cannot influence the pilot until
 * Fair Engagement viewport + camera frame + terrain LoS all pass.
 * No gameplay module imports this helper in production.
 */
(function(root){
  function visibleStar(g,p,F){
    if(!g||!p||!p.alive||!F||typeof F.inGameplayViewport!=='function'||
       typeof F.viewportHalfExtents!=='function'||
       typeof g.hasLineOfSight!=='function')return null;
    const ext=F.viewportHalfExtents(g),cam=g.cam||{};
    if(!ext||!(ext.x>0)||!(ext.y>0)||
       !Number.isFinite(cam.x)||!Number.isFinite(cam.y))return null;
    let best=null,nearest=Infinity;
    for(const s of g.shapes||[]){
      if(!s||s.type!=='star'||!(s.hp>0))continue;
      if(!F.inGameplayViewport(g,p,s)||
         Math.abs(s.x-cam.x)>ext.x||Math.abs(s.y-cam.y)>ext.y||
         !g.hasLineOfSight(p.x,p.y,s.x,s.y,3))continue;
      const d=Math.hypot(s.x-p.x,s.y-p.y);
      if(d<nearest){nearest=d;best={x:s.x,y:s.y,source:'visible'};}
    }
    return best;
  }
  function publicReport(g){
    const st=g&&g.__lfState,now=g&&g.time,sig=st&&st.signal;
    if(!st||st.directorEnabled===false||!Number.isFinite(now)||
       !sig||sig.type!=='ROGUE STAR'||!(now>=sig.started&&now<sig.until)||
       !Number.isFinite(sig.x)||!Number.isFinite(sig.y))return null;
    return{x:sig.x,y:sig.y,source:'report'};
  }
  function cue(g,p,F){return p&&p.alive?(visibleStar(g,p,F)||publicReport(g)):null;}
  function moveTowardPublicStar(g,p,F){
    const target=cue(g,p,F);if(!target)return null;
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    if(d<100)return{x:0,y:0};
    let waypoint=target;
    if(typeof g.hasLineOfSight==='function'&&
       !g.hasLineOfSight(p.x,p.y,target.x,target.y,18)){
      if(typeof g.novaBattlefieldWaypoint!=='function')return null;
      const wp=g.novaBattlefieldWaypoint(p.x,p.y,target.x,target.y,18,p.id);
      if(!wp||!Number.isFinite(wp.x)||!Number.isFinite(wp.y))return null;
      waypoint=wp;
    }
    const vx=waypoint.x-p.x,vy=waypoint.y-p.y,len=Math.hypot(vx,vy);
    return len>1?{x:vx/len,y:vy/len}:{x:0,y:0};
  }
  function aimAtVisibleStar(g,p,F){
    const target=visibleStar(g,p,F);if(!target)return null;
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    return d>1?{x:dx/d,y:dy/d}:null;
  }
  /* Research-only alternative to naive pursuit. A public report gives one
   * old coordinate, NOT the Star's direction. Its current location is only
   * bounded by a growing uncertainty disk (speed cap from canonical
   * 78u/s Star * 1.95 Living Front multiplier * 1.12 cap).
   * The nearest possible boundary point is a route-cut candidate, not
   * a predicted Star position. Abstain when the disk already contains the
   * pilot or when the remaining public window cannot cover the approach. */
  const STAR_SPEED_CAP=78*1.95*1.12,SCOUT_SPEED=124,ARRIVAL_MARGIN=85;
  function publicRouteCutTarget(g,p){
    const report=publicReport(g);
    if(!report||!p||!p.alive||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
    const signal=g.__lfState.signal,age=g.time-signal.started,
      remaining=signal.until-g.time;
    if(!(age>=0&&remaining>0))return null;
    const dx=report.x-p.x,dy=report.y-p.y,d=Math.hypot(dx,dy);
    if(!(d>0&&Number.isFinite(d)))return null;
    const radius=STAR_SPEED_CAP*age;
    if(d<=radius+ARRIVAL_MARGIN)return null;
    const distance=d-radius;
    if(distance>SCOUT_SPEED*remaining+ARRIVAL_MARGIN)return null;
    return{x:report.x-dx/d*radius,y:report.y-dy/d*radius,
      radius,age,remaining,source:'public-route-cut'};
  }
  function moveToPublicRouteCut(g,p,F,defense){
    if(!g||!p||!p.alive||typeof g.hasLineOfSight!=='function')return null;
    /* A witnessed hostile in weapon range takes priority over an uncertain
     * historical prize. The defensive helper itself uses only visible,
     * unshielded, hostile units and actual terrain LoS. */
    if(defense&&typeof defense.aimAtVisibleHostile==='function'&&
       defense.aimAtVisibleHostile(g,p,F))return null;
    const live=visibleStar(g,p,F);
    if(live)return moveTowardPublicStar(g,p,F);
    const target=publicRouteCutTarget(g,p);
    if(!target)return null;
    let point=target;
    if(!g.hasLineOfSight(p.x,p.y,target.x,target.y,18)){
      if(typeof g.novaBattlefieldWaypoint!=='function')return null;
      const wp=g.novaBattlefieldWaypoint(p.x,p.y,target.x,target.y,18,p.id);
      if(!wp||!Number.isFinite(wp.x)||!Number.isFinite(wp.y))return null;
      point=wp;
    }
    const dx=point.x-p.x,dy=point.y-p.y,d=Math.hypot(dx,dy);
    return d>1?{x:dx/d,y:dy/d}:null;
  }
  const api={visibleStar,publicReport,cue,moveTowardPublicStar,aimAtVisibleStar,
    publicRouteCutTarget,moveToPublicRouteCut};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.__novaResearchPublicStarPilot=api;
})(typeof window!=='undefined'?window:globalThis);
