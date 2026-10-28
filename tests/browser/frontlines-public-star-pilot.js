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
  function cue(g,p,F){return visibleStar(g,p,F)||publicReport(g);}
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
  const api={visibleStar,publicReport,cue,moveTowardPublicStar,aimAtVisibleStar};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.__novaResearchPublicStarPilot=api;
})(typeof window!=='undefined'?window:globalThis);
