'use strict';
/* Research-only defensive Scout pilot for natural Frontlines experiments.
 * No gameplay import. React only to physically visible hostile projectiles,
 * using the same gameplay viewport, rendered camera and terrain line of sight.
 * No hidden enemy coordinates, private ecology, AI stats or invulnerability.
 * The pilot can still die; this is a reproducible policy, not a fun metric. */
(function(root){
  const HORIZON=0.45, SCOUT_RADIUS=15, DODGE_MARGIN=10, STEP=90;
  function dodgeVisibleProjectile(g,p,F,desired){
    if(!g||!p||!F||typeof F.viewportHalfExtents!=='function'||
       typeof g.hasLineOfSight!=='function')return null;
    const ext=F.viewportHalfExtents(g);
    if(!ext||!(ext.x>0)||!(ext.y>0))return null;
    const cam=g.cam||{},cx=Number.isFinite(cam.x)?cam.x:p.x,
      cy=Number.isFinite(cam.y)?cam.y:p.y;
    let threat=null,soon=Infinity;
    for(const b of g.bullets||[]){
      if(!b||b.dead||b.ownerId===p.id||!Number.isFinite(b.x)||!Number.isFinite(b.y)||
         Math.abs(b.x-p.x)>ext.x||Math.abs(b.y-p.y)>ext.y||
         Math.abs(b.x-cx)>ext.x||Math.abs(b.y-cy)>ext.y)continue;
      /* Visibility is checked BEFORE projectile velocity/TTL is consulted. */
      if(!g.hasLineOfSight(p.x,p.y,b.x,b.y,2))continue;
      if(!Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
         !Number.isFinite(b.ttl)||b.ttl<=0)continue;
      const vx=b.vx-(Number(p.vx)||0),vy=b.vy-(Number(p.vy)||0);
      const vv=vx*vx+vy*vy;
      if(vv<100)continue;
      const rx=p.x-b.x,ry=p.y-b.y,t=(rx*vx+ry*vy)/vv;
      if(!(t>0.015&&t<=Math.min(HORIZON,b.ttl)))continue;
      const dx=rx-vx*t,dy=ry-vy*t;
      const radius=SCOUT_RADIUS+Math.max(0,Number(b.r)||0)+DODGE_MARGIN;
      if(dx*dx+dy*dy>radius*radius)continue;
      const id=Number.isFinite(b.id)?b.id:Infinity;
      if(t<soon-1e-9||(Math.abs(t-soon)<=1e-9&&id<(threat?.id??Infinity))){
        threat={vx,vy,id};soon=t;
      }
    }
    if(!threat)return null;
    const speed=Math.hypot(threat.vx,threat.vy);
    const nx=-threat.vy/speed,ny=threat.vx/speed;
    const bx=Number(desired?.x)||0,by=Number(desired?.y)||0;
    const prefer=bx*nx+by*ny>=0?1:-1;
    for(const sign of [prefer,-prefer]){
      const x=nx*sign,y=ny*sign;
      if(g.hasLineOfSight(p.x,p.y,p.x+x*STEP,p.y+y*STEP,SCOUT_RADIUS))
        return{x,y};
    }
    return null;
  }
  const api={dodgeVisibleProjectile};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.__novaResearchVisibleDefense=api;
})(typeof window!=='undefined'?window:globalThis);
