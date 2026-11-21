'use strict';
// Research-only #1029. Public, physical saturation alternative. Never loaded
// into the shipping game; evaluate its decision consequences before integration.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');

function physicalCrowd(g, observer, destination, options = {}) {
  if (!g || !observer || !destination ||
      !Number.isFinite(destination.x) || !Number.isFinite(destination.y)) return 0;
  const radius = options.radius ?? 300;
  const maxCount = options.maxCount ?? 4;
  const zoom = Math.max(.1, Number(g.cam && g.cam.zoom) || 1);
  const halfX = (Number(g.w) || 800) / (2 * zoom);
  const halfY = (Number(g.h) || 600) / (2 * zoom);
  let count = 0;
  for (const q of g.tanks || []) {
    if (!q || q === observer || q.id === observer.id || !q.ai ||
        !(q.hp > 0) || q.alive === false || q.spawnShieldT > 0 ||
        !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    // The candidate deliberately does not inspect __lfEcoKey, private target
    // IDs, unseen world sectors, or the target's actual planned destination.
    if (Math.abs(q.x - observer.x) > halfX ||
        Math.abs(q.y - observer.y) > halfY) continue;
    if (g.hasLineOfSight &&
        !g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 2)) continue;
    if (Math.hypot(q.x - destination.x, q.y - destination.y) > radius) continue;
    count++;
    if (count >= maxCount) break;
  }
  return count;
}

function scene() {
  const g = bootGame();
  const T = g.__testWindow.__NOVA_LIVING_FRONT_TEST__;
  assert.ok(T && typeof T.publicEcoBias === 'function',
    'must use the composed 49-overlay Living Front implementation');
  const bots = g.tanks.filter(t => t && t.ai && !t.isPlayer);
  assert.ok(bots.length >= 5);
  const [observer, ...others] = bots.slice(0, 5);
  const sector = T.sectorIndex(100, -400);
  const center = T.sectorCenter(sector);
  Object.assign(observer, {x:-400,y:-400,hp:100,maxHp:100,alive:true,
    spawnShieldT:0,cls:'twin'});
  observer.ai.__v1112TargetId = -1;
  others.forEach((q,i) => {
    Object.assign(q, {x:2000+i*30,y:2000,hp:100,maxHp:100,
      alive:true,spawnShieldT:0});
    q.ai.__lfEcoKey='none';
    q.ai.__lfEcoWeight=.25;
  });
  g.tanks=[observer,...others];
  g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  g.time=10;g.status='playing';g.paused=false;
  g.__lfState.directorEnabled=true;
  g.__lfState.signal={type:'BLOOM',sector,x:center.x,y:center.y,
    started:9,until:20};
  g.__lfState.queryScratch=g.__lfState.queryScratch||[];
  g.__lfState.queryScratch2=g.__lfState.queryScratch2||[];
  g.hasLineOfSight=()=>true;
  return {g,T,observer,others,sector,center};
}

test('public physical crowd is invariant to hidden AI intent in composed Game',()=>{
  withSeed(1517800,()=>{
    const s=scene();
    try {
      const before=physicalCrowd(s.g,s.observer,s.center);
      const shippingBefore=s.T.publicEcoBias(s.g,s.observer,{},{});
      assert.equal(shippingBefore.mode,'signal');
      s.others.forEach(q=>q.ai.__lfEcoKey='BLOOM:'+s.sector);
      const after=physicalCrowd(s.g,s.observer,s.center);
      const shippingAfter=s.T.publicEcoBias(s.g,s.observer,{},{});
      assert.equal(before,0);
      assert.equal(after,before,'private hidden commitments must not change public crowd');
      assert.notEqual(shippingAfter.mode,shippingBefore.mode,
        'control confirms the current private-intent leak is reproduced');
    } finally {s.g.destroy();}
  });
});

test('public physical crowd responds to observable occupancy, not private intent',()=>{
  withSeed(1517801,()=>{
    const s=scene();
    try {
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      // This visible participant is near the public destination. The
      // experimental observer viewport is widened only for this test.
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      const q=s.others[0];
      q.x=s.center.x;q.y=s.center.y;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      q.ai.__lfEcoKey='ROGUE STAR:999';
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      s.g.hasLineOfSight=()=>false;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
    } finally {s.g.destroy();}
  });
});

test('public crowd rejects dead, shielded, offscreen, invalid and remote participants',()=>{
  withSeed(1517802,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      const q=s.others[0];
      q.x=s.center.x;q.y=s.center.y;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      q.spawnShieldT=1;assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      q.spawnShieldT=0;q.hp=0;assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      q.hp=100;q.x=Infinity;assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      q.x=s.center.x;q.y=s.center.y;s.g.w=400;s.g.h=300;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
    } finally {s.g.destroy();}
  });
});

test('research candidate cannot infer remote coordinated rotations',()=>{
  withSeed(1517803,()=>{
    const s=scene();
    try {
      s.others.forEach(q=>q.ai.__lfEcoKey='BLOOM:'+s.sector);
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      // Known limitation: a distant public BLOOM may attract many unseen
      // participants. That is preferable to reading their private intent,
      // but must be measured against actual crowding before shipping.
      console.log('NOVA_PUBLIC_CROWD_RESEARCH '+JSON.stringify({
        hiddenCommitments:s.others.length,publicCrowd:0,
        destinationSector:s.sector,decision:'research-only'
      }));
    } finally {s.g.destroy();}
  });
});
