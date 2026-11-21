'use strict';
// Research-only #1029: observer-owned movement evidence, not a gameplay hook.
// Never use a rival's private __lfEcoKey or destination assignment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';

function observedApproach() {
  const records = new Map();
  return {
    sample(g, observer, rivals, now) {
      if (!Number.isFinite(now) || !observer ||
          !Number.isFinite(observer.x) || !Number.isFinite(observer.y)) return;
      const F = g.__testFair;
      if (!F || typeof F.inGameplayViewport !== 'function') return;
      for (const q of rivals) {
        if (!q || q === observer || !Number.isSafeInteger(q.id) ||
            !Number.isFinite(q.x) || !Number.isFinite(q.y) ||
            !(q.hp > 0) || q.alive === false || q.spawnShieldT > 0) continue;
        if (!F.inGameplayViewport(g, observer, q)) continue;
        if (g.hasLineOfSight &&
            !g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 2)) continue;
        const old = records.get(q.id);
        // A reused ID must never inherit the previous body's trajectory.
        const sameBody = old && old.body === q && now > old.at &&
          now - old.at <= 1.5;
        records.set(q.id, {
          body:q, at:now, x:q.x, y:q.y,
          vx:sameBody ? (q.x-old.x)/(now-old.at) : 0,
          vy:sameBody ? (q.y-old.y)/(now-old.at) : 0,
          witnessed:sameBody
        });
      }
      for (const [id, r] of records) {
        if (now < r.at || now-r.at > 2) records.delete(id);
      }
    },
    countToward(destination, now) {
      if (!destination || !Number.isFinite(destination.x) ||
          !Number.isFinite(destination.y) || !Number.isFinite(now)) return 0;
      let count=0;
      for (const r of records.values()) {
        if (!r.witnessed || now < r.at || now-r.at > 2 ||
            !(r.body.hp > 0) || r.body.alive === false) continue;
        const dx=destination.x-r.x, dy=destination.y-r.y;
        const dist=Math.hypot(dx,dy), speed=Math.hypot(r.vx,r.vy);
        // Require real, recent observed progress toward a public destination;
        // no prediction of unseen coordinates or private planned routes.
        if (dist > 50 && dist < 950 && speed >= 25 &&
            (r.vx*dx+r.vy*dy)/(speed*dist) >= .8) count++;
      }
      return count;
    },
    size(){return records.size;}
  };
}

function scene() {
  const g=bootGame(), bots=g.tanks.filter(t=>t && t.ai && !t.isPlayer);
  assert.ok(bots.length>=2);
  const [observer,rival]=bots;
  Object.assign(observer,{x:-300,y:-300,hp:100,alive:true,spawnShieldT:0});
  Object.assign(rival,{x:-100,y:-300,hp:100,alive:true,spawnShieldT:0});
  g.tanks=[observer,rival];
  g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  g.w=1600;g.h=1200;g.cam={zoom:1};
  g.hasLineOfSight=()=>true;
  return {g,observer,rival,destination:{x:300,y:-300}};
}

test('two public position samples establish approach; private ecology intent does not',()=>{
  withSeed(102901,()=>{
    const s=scene(),tracker=observedApproach();
    try {
      tracker.sample(s.g,s.observer,[s.rival],10);
      assert.equal(tracker.countToward(s.destination,10),0);
      s.rival.x=-60;
      tracker.sample(s.g,s.observer,[s.rival],10.5);
      assert.equal(tracker.countToward(s.destination,10.5),1);
      s.rival.ai.__lfEcoKey='LOCAL:14';
      assert.equal(tracker.countToward(s.destination,10.5),1);
      s.rival.ai.__lfEcoKey='BLOOM:5';
      assert.equal(tracker.countToward(s.destination,10.5),1);
      assert.equal(tracker.countToward(s.destination,12.51),0,
        'stale movement must not imply a current commitment');
    } finally {s.g.destroy();}
  });
});

test('blocked or offscreen rival cannot supply new movement samples',()=>{
  withSeed(102902,()=>{
    const s=scene(),tracker=observedApproach();
    try {
      tracker.sample(s.g,s.observer,[s.rival],10);
      s.rival.x=-60;s.g.hasLineOfSight=()=>false;
      tracker.sample(s.g,s.observer,[s.rival],10.5);
      assert.equal(tracker.countToward(s.destination,10.5),0);
      s.g.hasLineOfSight=()=>true;s.rival.x=3000;
      tracker.sample(s.g,s.observer,[s.rival],11);
      assert.equal(tracker.countToward(s.destination,11),0);
    } finally {s.g.destroy();}
  });
});

test('reused IDs, reverse movement, invalid positions and clock reset fail closed',()=>{
  withSeed(102903,()=>{
    const s=scene(),tracker=observedApproach();
    try {
      tracker.sample(s.g,s.observer,[s.rival],10);
      s.rival.x=-60;tracker.sample(s.g,s.observer,[s.rival],10.5);
      assert.equal(tracker.countToward(s.destination,10.5),1);
      const replacement={...s.rival,ai:{...s.rival.ai},x:-30};
      tracker.sample(s.g,s.observer,[replacement],11);
      assert.equal(tracker.countToward(s.destination,11),0,
        'a new object with a reused ID cannot inherit observed velocity');
      replacement.x=-90;tracker.sample(s.g,s.observer,[replacement],11.5);
      assert.equal(tracker.countToward(s.destination,11.5),0,
        'movement away from the destination is not an approach');
      replacement.x=Infinity;tracker.sample(s.g,s.observer,[replacement],12);
      assert.equal(tracker.countToward(s.destination,12),0);
      tracker.sample(s.g,s.observer,[],0);
      assert.equal(tracker.size(),0,'reset simulation time must purge evidence');
    } finally {s.g.destroy();}
  });
});
