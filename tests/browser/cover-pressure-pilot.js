'use strict';
/* Research-only visible-cover pilot for #572. No production import.
 * Cover geometry is rendered to the player; hidden AI/ecology state is not
 * consulted. The pilot uses ordinary movement, aim and weapon input only. */
(function(root){
 const finite=Number.isFinite;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function face(p,c){
  if(!p||!c||![p.x,p.y,c.x,c.y].every(finite))return null;
  const dx=p.x-c.x,dy=p.y-c.y;
  if(c.shape==='circle'){
   if(!(finite(c.r)&&c.r>0))return null;
   const d=Math.hypot(dx,dy);if(!(d>c.r+2))return null;
   return{x:c.x+dx/d*(c.r+8),y:c.y+dy/d*(c.r+8)};
  }
  if(c.shape!=='rect'||![c.w,c.h].every(v=>finite(v)&&v>0))return null;
  const hw=c.w/2,hh=c.h/2;
  if(Math.abs(dx)<=hw+2&&Math.abs(dy)<=hh+2)return null;
  /* Pick a face exposed toward the pilot, not the occluded center.
   * The 8-unit outward offset clears the production 2-unit LOS pad. */
  if(Math.abs(dx)/hw>=Math.abs(dy)/hh)
   return{x:c.x+Math.sign(dx)*(hw+8),y:clamp(p.y,c.y-hh,c.y+hh)};
  return{x:clamp(p.x,c.x-hw,c.x+hw),y:c.y+Math.sign(dy)*(hh+8)};
 }
 function select(g,p,F){
  if(!g||!p||p.alive===false||(p.hp!=null&&!(finite(p.hp)&&p.hp>0))||
     (g.player&&g.player!==p)||![p.x,p.y].every(finite)||
     !Array.isArray(g.__novaTerrain)||typeof g.hasLineOfSight!=='function'||
     !F||typeof F.viewportHalfExtents!=='function')return null;
  const ext=F.viewportHalfExtents(g);
  if(!ext||!(finite(ext.x)&&ext.x>0&&finite(ext.y)&&ext.y>0))return null;
  const cam=g.cam;
  if(!cam||!finite(cam.x)||!finite(cam.y))return null;
  const cx=cam.x,cy=cam.y;
  let best=null,bestDist=Infinity,bestId=Infinity;
  for(const c of g.__novaTerrain){
   if(!c||c.destructible!==true||c.solid!==true||!(finite(c.hp)&&c.hp>0)||
      !Number.isSafeInteger(c.id))continue;
   const f=face(p,c);if(!f)continue;
   if(Math.abs(f.x-p.x)>ext.x||Math.abs(f.y-p.y)>ext.y||
      Math.abs(f.x-cx)>ext.x||Math.abs(f.y-cy)>ext.y)continue;
   const d=Math.hypot(f.x-p.x,f.y-p.y);
   if(!(d>1)||!g.hasLineOfSight(p.x,p.y,f.x,f.y,2))continue;
   if(d<bestDist-1e-6||(Math.abs(d-bestDist)<=1e-6&&c.id<bestId)){
    best={cover:c,face:f,distance:d};bestDist=d;bestId=c.id;
   }
  }
  return best;
 }
 function aim(g,p,F){
  const s=select(g,p,F);if(!s)return null;
  const dx=s.cover.x-p.x,dy=s.cover.y-p.y,d=Math.hypot(dx,dy);
  return d>1?{x:dx/d,y:dy/d}:null;
 }
 function move(g,p,F){
  const s=select(g,p,F);if(!s)return null;
  /* Ordinary Scout weapon has sufficient range at this standoff.
   * Stop before colliding with cover, leaving room to dodge enemies. */
  if(s.distance<=225)return{x:0,y:0};
  const dx=s.face.x-p.x,dy=s.face.y-p.y;
  return{x:dx/s.distance,y:dy/s.distance};
 }
 const api={face,select,aim,move};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else if(root)root.__novaResearchCoverPressurePilot=api;
})(typeof window!=='undefined'?window:globalThis);
