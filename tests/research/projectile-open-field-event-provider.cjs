'use strict';
// Research fixture ONLY: a complete competing-projectile event provider for
// deliberately empty arenas. Not a production battlefield certification.
const { firstContact } = require('./projectile-first-event-certificate.cjs');
const MAX_SHOTS = 32;
const FIELDS = ['kind','dead','shell','beam','splash','__v17Cannon',
  '__novaRail','pen','hits','x','y','vx','vy','ttl','r','ownerId'];
const empty = () => ({ complete:true, allied:false, unscanned:false,
  aTerrain:null,bTerrain:null,aBody:null,bBody:null,
  aOtherProjectile:null,bOtherProjectile:null });
function makeOpenFieldProvider(game, dt) {
  if (!game || !Number.isFinite(dt) || !(dt>0) ||
      !Array.isArray(game.bullets) || game.bullets.length>MAX_SHOTS ||
      !['tanks','shapes','drones','terrain'].every(key =>
        Array.isArray(game[key]) && game[key].length===0)) return null;
  // The caller must provide an intentionally constructed open-field fixture,
  // not a live Game whose unenumerated walls or bodies might be missed.
  let shots;
  try {
    shots = game.bullets.map(s => {
      if (!s || s.dead!==false) throw Error('invalid active shot');
      const copy = {};
      for (const key of FIELDS) copy[key] = s[key];
      return Object.freeze(copy);
    });
  } catch (_) { return null; }
  const n = shots.length, times = Array.from({length:n},() => Array(n).fill(null));
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
    const t = firstContact(shots[i], shots[j], dt, empty());
    times[i][j]=times[j][i]=t;
  }
  return (a,b,i,j,step) => {
    if (step!==dt || !Number.isInteger(i) || !Number.isInteger(j) ||
        i<0 || j<=i || j>=n || !a || !b) return null;
    for (const key of FIELDS)
      if (!Object.is(a[key],shots[i][key]) ||
          !Object.is(b[key],shots[j][key])) return null;
    let aOther=null,bOther=null;
    for (let k=0;k<n;k++) if (k!==i && k!==j) {
      const x=times[i][k], y=times[j][k];
      if (x!==null && (aOther===null || x<aOther)) aOther=x;
      if (y!==null && (bOther===null || y<bOther)) bOther=y;
    }
    return { ...empty(), aOtherProjectile:aOther, bOtherProjectile:bOther };
  };
}
module.exports = { makeOpenFieldProvider, MAX_SHOTS };
