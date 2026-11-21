'use strict';
// Research-only #1029: observer-owned movement evidence; never shipped as AI.
// A rival's hidden __lfEcoKey, target or current offscreen state is not read.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');

function observedApproach() {
  const records=new Map();
  let lastTime=-Infinity;
  function sample(g,observer,rivals,now) {
    if (!Number.isFinite(now)) return;
    if (now<lastTime) records.clear(); // new match / rewound clock
    lastTime=now;
    if (!g || !observer || !Number.isFinite(observer.x) ||
        !Number.isFinite(observer.y)) return;
    const F=g.__testFair;
    if (!F || typeof F.inGameplayViewport!=='function') return;
    for (const q of rivals || []) {
      if (!q || q===observer || !Number.isSafeInteger(q.id)) continue;
      if (!(q.hp>0) || q.alive===false || q.spawnShieldT>0) {
        // Only a currently observable death is public evidence.
        if (Number.isFinite(q.x) && Number.isFinite(q.y) &&
            F.inGameplayWorldPoint(g,observer,q.x,q.y) &&
            (!g.hasLineOfSight ||
             g.hasLineOfSight(observer.x,observer.y,q.x,q.y,2)))
          records.delete(q.id);
        continue;
      }
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y) ||
          !F.inGameplayViewport(g,observer,q)) continue;
      if (g.hasLineOfSight &&
          !g.hasLineOfSight(observer.x,observer.y,q.x,q.y,2)) continue;
      const old=records.get(q.id),previous=old&&old.history.at(-1);
      const dt=previous ? now-previous.at : 0;
      const travel=previous ? Math.hypot(q.x-previous.x,q.y-previous.y) : 0;
      const continuous=old && old.body===q && dt>0 && dt<=.6 &&
        travel<=400*dt+1; // teleport / respawn / long observation gap
      const history=continuous?old.history.slice(-31):[];
      history.push({at:now,x:q.x,y:q.y});
      records.delete(q.id);
      records.set(q.id,{body:q,at:now,history});
      // Bound per-observer memory independently of the global tank roster.
      if (records.size>16) records.delete(records.keys().next().value);
    }
    for (const [id,r] of records)
      if (now-r.at>1.25) records.delete(id);
  }
  function countToward(destination,now) {
    if (!destination || !Number.isFinite(destination.x) ||
        !Number.isFinite(destination.y) || !Number.isFinite(now)) return 0;
    let count=0;
    for (const r of records.values()) {
      if (now<r.at || now-r.at>1.25 || r.history.length<3) continue;
      const h=r.history,latest=h[h.length-1];
      const dx=destination.x-latest.x,dy=destination.y-latest.y;
      const dist=Math.hypot(dx,dy);
      if (!(dist>50 && dist<950)) continue;
      let alignedSeconds=0,segments=0;
      for (let i=h.length-1;i>0;i--) {
        const a=h[i-1],b=h[i],dt=b.at-a.at;
        if (!(dt>0 && dt<=.6)) break;
        const vx=(b.x-a.x)/dt,vy=(b.y-a.y)/dt;
        const speed=Math.hypot(vx,vy);
        if (!(speed>=25 && speed<=401) ||
            (vx*dx+vy*dy)/(speed*dist)<.8) break;
        alignedSeconds+=dt;segments++;
      }
      if (segments>=2 && alignedSeconds+1e-9>=.25) count++;
    }
    return count;
  }
  return {sample,countToward,size:()=>records.size};
}

function scene() {
  const g=bootGame(),bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(bots.length>=2);
  const [observer,rival]=bots;
  Object.assign(observer,{x:-300,y:-300,hp:100,alive:true,spawnShieldT:0});
  Object.assign(rival,{x:-100,y:-300,hp:100,alive:true,spawnShieldT:0});
  g.tanks=[observer,rival];g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  g.w=1600;g.h=1200;g.cam={zoom:1};g.hasLineOfSight=()=>true;
  return {g,observer,rival,destination:{x:300,y:-300}};
}
function run(name,seed,fn) {
  test(name,()=>withSeed(seed,()=>{
    const s=scene(),tracker=observedApproach();
    try {fn(s,tracker);} finally {s.g.destroy();}
  }));
}

run('two aligned movement intervals establish public evidence independent of hidden plans',102901,(s,t)=>{
  t.sample(s.g,s.observer,[s.rival],10);
  s.rival.x=-85;t.sample(s.g,s.observer,[s.rival],10.15);
  assert.equal(t.countToward(s.destination,10.15),0);
  s.rival.x=-70;t.sample(s.g,s.observer,[s.rival],10.3);
  assert.equal(t.countToward(s.destination,10.3),1);
  s.rival.ai.__lfEcoKey='BLOOM:5';
  assert.equal(t.countToward(s.destination,10.3),1);
  s.rival.hp=0;s.rival.alive=false; // hidden later death must not be queried
  assert.equal(t.countToward(s.destination,10.3),1);
  t.sample(s.g,s.observer,[s.rival],10.35);
  assert.equal(t.countToward(s.destination,10.35),0,
    'a genuinely witnessed death clears the public movement memory');
  assert.equal(t.countToward(s.destination,11.56),0);
});

run('covered and offscreen rivals cannot provide fresh evidence',102902,(s,t)=>{
  t.sample(s.g,s.observer,[s.rival],10);
  s.rival.x=-85;s.g.hasLineOfSight=()=>false;
  t.sample(s.g,s.observer,[s.rival],10.15);
  s.g.hasLineOfSight=()=>true;s.rival.x=3000;
  t.sample(s.g,s.observer,[s.rival],10.3);
  assert.equal(t.countToward(s.destination,10.3),0);
});

run('reused identity, reverse motion, teleport and clock reset fail closed',102903,(s,t)=>{
  t.sample(s.g,s.observer,[s.rival],10);
  s.rival.x=-85;t.sample(s.g,s.observer,[s.rival],10.15);
  s.rival.x=-70;t.sample(s.g,s.observer,[s.rival],10.3);
  assert.equal(t.countToward(s.destination,10.3),1);
  const replacement={...s.rival,ai:{...s.rival.ai},x:-55};
  t.sample(s.g,s.observer,[replacement],10.45);
  assert.equal(t.countToward(s.destination,10.45),0);
  replacement.x=-70;t.sample(s.g,s.observer,[replacement],10.6);
  replacement.x=-85;t.sample(s.g,s.observer,[replacement],10.75);
  assert.equal(t.countToward(s.destination,10.75),0);
  replacement.x=150;t.sample(s.g,s.observer,[replacement],10.8);
  assert.equal(t.countToward(s.destination,10.8),0);
  t.sample(s.g,s.observer,[],0);
  assert.equal(t.size(),0);
});

run('same 120u/s approach is recognized across 20/30/60Hz sampling',102904,(s,t)=>{
  for (const hz of [20,30,60]) {
    const tracker=observedApproach();
    s.rival.x=-100;
    for (let frame=0;frame<=Math.round(hz*.4);frame++) {
      s.rival.x=-100+120*frame/hz;
      tracker.sample(s.g,s.observer,[s.rival],10+frame/hz);
    }
    assert.equal(tracker.countToward(s.destination,10+.4),1,
      'cadence-dependent evidence at '+hz+'Hz');
  }
});

run('short-lived observer memory never reads private remote assignments',102905,(s,t)=>{
  t.sample(s.g,s.observer,[s.rival],10);
  s.rival.x=-85;t.sample(s.g,s.observer,[s.rival],10.15);
  s.rival.x=-70;t.sample(s.g,s.observer,[s.rival],10.3);
  const before=t.countToward(s.destination,10.3);
  for (const key of ['none','LOCAL:7','BLOOM:5','MIGRATION:3'])
    {s.rival.ai.__lfEcoKey=key;assert.equal(t.countToward(s.destination,10.3),before);}
});
