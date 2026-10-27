'use strict';
/* Research-only scripted Scout policy. No runtime gameplay or UI import.
 * Move toward a PUBLIC BLOOM sector's center through public terrain.
 * Aim only at neutral shapes currently in both the gameplay viewport and
 * rendered camera, with actual terrain line of sight. Never read private
 * ecology sector maturity/value or unseen enemy coordinates. */
(function(root){
 function publicSector(g){
  const st=g&&g.__lfState,now=g&&g.time||0,sig=st&&st.signal,mem=st&&st.bloomMemory;
  if(!st||st.directorEnabled===false)return null;
  const s=sig&&sig.type==='BLOOM'&&now<sig.until?sig.sector:
   mem&&now<mem.until?mem.sector:null;
  return Number.isInteger(s)&&s>=0&&s<16?s:null;
 }
 function moveTowardPublicBloom(g,p,LF){
  const sector=publicSector(g);
  if(sector==null)return null;
  const center=LF.sectorCenter(sector);
  if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.y))return null;
  const direct=Math.hypot(center.x-p.x,center.y-p.y);
  if(direct<85)return{x:0,y:0};
  let target=center;
  if(typeof g.hasLineOfSight==='function'&&
     !g.hasLineOfSight(p.x,p.y,center.x,center.y,18)&&
     typeof g.novaBattlefieldWaypoint==='function'){
   const wp=g.novaBattlefieldWaypoint(p.x,p.y,center.x,center.y,18,p.id);
   if(!wp||!Number.isFinite(wp.x)||!Number.isFinite(wp.y))return null;
   if(Math.hypot(wp.x-p.x,wp.y-p.y)>4)target=wp;
  }
  const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
  return d>1?{x:dx/d,y:dy/d}:{x:0,y:0};
 }
 function aimAtVisibleNeutral(g,p,LF,F){
  if(!g||!p||!LF||!F||typeof F.viewportHalfExtents!=='function'||
     typeof g.hasLineOfSight!=='function')return null;
  const ext=F.viewportHalfExtents(g);
  if(!ext||!(ext.x>0)||!(ext.y>0))return null;
  const cam=g.cam||{},cx=Number.isFinite(cam.x)?cam.x:p.x,
   cy=Number.isFinite(cam.y)?cam.y:p.y;
  const defs=g.__lfState&&g.__lfState.defs||LF.defs;
  let best=null,dist=Infinity;
  for(const s of g.shapes||[]){
   if(!s||Math.abs(s.x-p.x)>ext.x||Math.abs(s.y-p.y)>ext.y||
      Math.abs(s.x-cx)>ext.x||Math.abs(s.y-cy)>ext.y)continue;
   if(!(s.hp>0)||!(LF.xp(defs,s.type)>0)||
      !g.hasLineOfSight(p.x,p.y,s.x,s.y,2))continue;
   const d=Math.hypot(s.x-p.x,s.y-p.y);
   if(d>1&&d<dist){dist=d;best=s;}
  }
  return best?{x:(best.x-p.x)/dist,y:(best.y-p.y)/dist}:null;
 }
 const api={publicSector,moveTowardPublicBloom,aimAtVisibleNeutral};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.__novaResearchPublicPilot=api;
})(typeof window!=='undefined'?window:globalThis);
