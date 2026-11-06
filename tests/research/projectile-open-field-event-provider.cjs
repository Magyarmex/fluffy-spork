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
function makeOpenFieldProvider(game, dt, options) {
  if (!game || !Number.isFinite(dt) || !(dt>0) ||
      !Array.isArray(game.bullets) || game.bullets.length>MAX_SHOTS ||
      game.player != null ||
      (game.__novaTerrain != null && (!Array.isArray(game.__novaTerrain) || game.__novaTerrain.length>0)) ||
      (game.powerups != null && (!Array.isArray(game.powerups) || game.powerups.length>0)) ||
      !['tanks','shapes','drones','terrain'].every(key =>
        Array.isArray(game[key]) && game[key].length===0)) return null;
  // The caller must provide an intentionally constructed open-field fixture,
  // not a live Game whose unenumerated walls or bodies might be missed.
  let shots;
  try {
    for (let i=0;i<game.bullets.length;i++)
      if (!Object.hasOwn(game.bullets,i)) throw Error('missing projectile slot');
    shots = game.bullets.map(s => {
      if (!s || s.dead!==false) throw Error('invalid active shot');
      const copy = {};
      for (const key of FIELDS) copy[key] = s[key];
      return Object.freeze(copy);
    });
  } catch (_) { return null; }
  const sourceBullets = game.bullets;
  const n = shots.length, times = Array.from({length:n},() => Array(n).fill(null));
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
    // Same-owner shots cannot intercept in the shipping resolver or oracle.
    // Avoid quadratic certificate work for a crowded single-owner volley.
    const t = shots[i].ownerId === shots[j].ownerId ? null :
      firstContact(shots[i], shots[j], dt, empty());
    times[i][j]=times[j][i]=t;
  }
  // A simultaneous earliest multi-shot event has no unique physical winner.
  // Pair-local blockers can suppress those tied contacts while accidentally
  // allowing an unrelated later pair to appear first: veto the whole frame.
  const allTimes = [];
  for (let i=0;i<n;i++) for (let j=i+1;j<n;j++)
    if (times[i][j]!==null) allTimes.push({i,j,t:times[i][j]});
  allTimes.sort((a,b)=>a.t-b.t);
  // A terrain-aware caller must arbitrate ties after wall-blocked contacts
  // are removed. The default open-field witness retains its original veto.
  if (!(options && options.deferSharedEarliestTie === true) && allTimes.length>1) {
    const earliest=allTimes[0].t;
    for (let a=0;a<allTimes.length && allTimes[a].t<=earliest+1e-9;a++)
      for (let b=a+1;b<allTimes.length && allTimes[b].t<=earliest+1e-9;b++) {
        const x=allTimes[a], y=allTimes[b];
        if (x.i===y.i || x.i===y.j || x.j===y.i || x.j===y.j)
          return null;
      }
  }
  return (a,b,i,j,step) => {
    if (step!==dt || !Number.isInteger(i) || !Number.isInteger(j) ||
        i<0 || j<=i || j>=n || !a || !b) return null;
    // Competing events depend on *every* projectile, not only the pair
    // being certified. Reject stale third shots and changed fixture state.
    if (game.bullets !== sourceBullets || game.bullets.length !== n ||
        game.player != null ||
        (game.__novaTerrain != null && (!Array.isArray(game.__novaTerrain) || game.__novaTerrain.length !== 0)) ||
        (game.powerups != null && (!Array.isArray(game.powerups) || game.powerups.length !== 0)) ||
        !['tanks','shapes','drones','terrain'].every(key =>
          Array.isArray(game[key]) && game[key].length === 0)) return null;
    for (let k=0;k<n;k++) {
      if (!Object.hasOwn(game.bullets,k) || !game.bullets[k]) return null;
      for (const key of FIELDS)
        if (!Object.is(game.bullets[k][key],shots[k][key])) return null;
    }
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
