'use strict';
// Research-only read-only first-event geometry; not wired to shipping combat.
function firstContact(a,b,dt,context) {
  if (!(dt>0) || !Number.isFinite(dt) || !context || context.complete!==true ||
      context.allied!==false || context.unscanned!==false) return null;
  for (const s of [a,b]) if (!s || s.kind!=='bullet' || s.dead || s.shell || s.beam || s.splash || s.__v17Cannon ||
      s.__novaRail || s.pen!==0 || (s.hits||0)!==0 || !(s.ttl>0) ||
      !(s.r>0) || !['x','y','vx','vy','ttl','r','ownerId'].every(k=>Number.isFinite(s[k]))) return null;
  if (a.ownerId===b.ownerId) return null;
  const dx=a.x-b.x, dy=a.y-b.y, vx=a.vx-b.vx, vy=a.vy-b.vy;
  const radius=a.r+b.r+1.5, c=dx*dx+dy*dy-radius*radius;
  let t=0;
  if (c>0) {
    const speed2=vx*vx+vy*vy, dot=dx*vx+dy*vy;
    if (!(speed2>0) || !(dot<0)) return null;
    const disc=dot*dot-speed2*c;
    if (!(disc>64*Number.EPSILON*(Math.abs(dot*dot)+Math.abs(speed2*c)))) return null;
    t=c/(-dot+Math.sqrt(disc));
  }
  if (!Number.isFinite(t) || t<0 || t>=Math.min(dt,a.ttl,b.ttl)-1e-9) return null;
  for (const s of [a,b]) {
    if (Math.abs(s.x)>=2230 || Math.abs(s.y)>=2230) return null;
    for (const [p,v] of [[s.x,s.vx],[s.y,s.vy]]) {
      const exit=v>0?(2230-p)/v:v<0?(-2230-p)/v:Infinity;
      if (exit<=t+1e-9) return null;
    }
  }
  for (const key of ['aTerrain','bTerrain','aBody','bBody','aOtherProjectile','bOtherProjectile']) {
    if (!Object.hasOwn(context,key)) return null;
    const event=context[key];
    if (event===null) continue;
    if (!Number.isFinite(event) || event<0 || event<=t+1e-9) return null;
  }
  return t;
}
module.exports={firstContact};
