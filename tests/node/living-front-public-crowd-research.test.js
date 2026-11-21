'use strict';
// Research-only #1029. Public, physical saturation alternative. Never loaded
// into the shipping game; evaluate its decision consequences before integration.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');

function physicalCrowd(g, observer, destination, options = {}) {
  if (!g || !observer || !destination ||
      !(observer.hp > 0) || observer.alive === false ||
      !Number.isFinite(observer.x) || !Number.isFinite(observer.y) ||
      !Number.isFinite(destination.x) || !Number.isFinite(destination.y) ||
      typeof g.hasLineOfSight !== 'function') return 0;
  const radius = options.radius ?? 300;
  const maxCount = options.maxCount ?? 4;
  const F = g.__testFair;
  // Fair Engagement's tank predicate reads target health before geometry.
  // Use its exported point-only extents to avoid inspecting unseen rivals.
  const ext = F && typeof F.viewportHalfExtents === 'function'
    ? F.viewportHalfExtents(g) : null;
  if (!ext || !Number.isFinite(ext.x) || !Number.isFinite(ext.y) ||
      !(ext.x > 0) || !(ext.y > 0)) return 0;
  let count = 0;
  for (const q of g.tanks || []) {
    if (!q || q === observer || q.id === observer.id ||
        !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    // The candidate deliberately does not inspect __lfEcoKey, private target
    // IDs, unseen world sectors, or the target's actual planned destination.
    const seen = Math.abs(q.x-observer.x) <= ext.x &&
      Math.abs(q.y-observer.y) <= ext.y;
    if (!seen) continue;
    // Cheap public geometry first: do not spend a terrain ray on a visible
    // bot that is nowhere near the public opportunity.
    if (Math.hypot(q.x - destination.x, q.y - destination.y) > radius) continue;
    if (!g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 2)) continue;
    // Only publicly witnessed candidates may expose live status. Never
    // query hidden health, spawn state or AI assignment through a crowd scan.
    if (!q.ai || !(q.hp > 0) || q.alive === false || q.spawnShieldT > 0)
      continue;
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
  assert.ok(bots.length >= 4);
  const [observer, ...others] = bots.slice(0, 4);
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
      console.log('NOVA_PUBLIC_CROWD_LIVE_COUNTERFACTUAL '+
        JSON.stringify({before:shippingBefore.mode,after:shippingAfter.mode}));
      // Do not freeze a known information leak as a required CI golden:
      // a future production fix should make both decisions agree.
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

/* Alternative B: deterministic public-signal dispersion. No bot scans, no
 * private plans, no global random draws. This is an explicit research foil,
 * not a proposed balance change: hash gating can feel arbitrary to players. */
function publicSignalLane(id, sector, announcedAt) {
  if (!Number.isSafeInteger(id) || !Number.isInteger(sector) ||
      sector < 0 || sector >= 16 || !Number.isFinite(announcedAt)) return null;
  const epoch = Math.trunc(announcedAt * 1000);
  if (!Number.isSafeInteger(epoch)) return null;
  let x = Math.imul(id ^ Math.imul(sector + 1, 0x9e3779b1) ^ epoch,
    0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

test('public signal dispersion is stable and independent of hidden AI plans',()=>{
  withSeed(1517804,()=>{
    const s=scene();
    try {
      const before=s.g.tanks.map(q=>publicSignalLane(q.id,s.sector,
        s.g.__lfState.signal.started));
      s.others.forEach((q,i)=>{
        q.ai.__lfEcoKey=i%2?'BLOOM:'+s.sector:'none';
        q.ai.__v1112TargetId=9999-i;
      });
      const after=s.g.tanks.map(q=>publicSignalLane(q.id,s.sector,
        s.g.__lfState.signal.started));
      assert.deepEqual(after,before);
      assert.ok(before.every(x=>x>=0&&x<1));
      assert.equal(publicSignalLane(NaN,s.sector,9),null);
      assert.equal(publicSignalLane(1,17,9),null);
      assert.equal(publicSignalLane(1,s.sector,Infinity),null);
    } finally {s.g.destroy();}
  });
});

test('public signal dispersion spreads a cohort without extra random draws',()=>{
  withSeed(1517807,draws=>{
    const before=draws();
    const cohort=Array.from({length:64},(_,i)=>publicSignalLane(i+1,5,9));
    const lower=cohort.filter(v=>v<.33).length;
    const upper=cohort.filter(v=>v>.66).length;
    assert.ok(lower>=8&&upper>=8,
      'public-signal hash must not collapse a 64-bot cohort into one lane');
    assert.notDeepEqual(
      Array.from({length:64},(_,i)=>publicSignalLane(i+1,5,9)),
      Array.from({length:64},(_,i)=>publicSignalLane(i+1,6,9)),
      'a new public destination may create a different dispersion');
    assert.equal(draws(),before,'public-signal dispersion must not consume game RNG');
  });
});

/* Alternative C: distance-sensitive, public-signal threshold. Nearer
 * participants retain their normal strategic advantage; faraway bots need
 * a stronger public-signal affinity to rotate. No hidden commitment scan.
 * This is a falsifiable research model, not production balance. */
function publicOpportunityAdmitted(base, routeCost, id, sector, started) {
  const lane = publicSignalLane(id, sector, started);
  if (lane === null || !Number.isFinite(base) ||
      !Number.isFinite(routeCost) || routeCost < 0) return false;
  const score = base - routeCost / 2300;
  return score > .20 + .28 * lane;
}

test('public-signal admission favors legitimate shorter routes without private coordination',()=>{
  const sector=5,started=9,ids=Array.from({length:64},(_,i)=>i+1);
  const admitted = d => ids.filter(id=>
    publicOpportunityAdmitted(.68,d,id,sector,started)).length;
  const near=admitted(300),middle=admitted(900),far=admitted(1100);
  assert.equal(near,64,'strong nearby public opportunity remains attractive');
  assert.ok(middle>0&&middle<near,
    'medium routes should diversify without private coordination');
  assert.ok(far<middle,'long routes must not gain priority over shorter routes');
  assert.equal(publicOpportunityAdmitted(.68,300,NaN,sector,started),false);
  assert.equal(publicOpportunityAdmitted(.68,-1,1,sector,started),false);
});

test('public-signal admission is unchanged by hidden rivals private ecology keys',()=>{
  withSeed(1517805,()=>{
    const s=scene();
    try {
      const route=900;
      const before=publicOpportunityAdmitted(.68,route,s.observer.id,
        s.sector,s.g.__lfState.signal.started);
      s.others.forEach(q=>q.ai.__lfEcoKey='BLOOM:'+s.sector);
      const after=publicOpportunityAdmitted(.68,route,s.observer.id,
        s.sector,s.g.__lfState.signal.started);
      assert.equal(after,before);
    } finally {s.g.destroy();}
  });
});

test('public crowd performs terrain rays only for visible near-destination candidates',()=>{
  withSeed(1517806,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      const near=s.others[0],far=s.others[1];
      near.x=s.center.x;near.y=s.center.y;
      far.x=s.observer.x+40;far.y=s.observer.y+40;
      let rays=0;s.g.hasLineOfSight=()=>{rays++;return true;};
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      assert.equal(rays,1,'only one visible destination occupant merits terrain LoS');
    } finally {s.g.destroy();}
  });
});

test('composed LOCAL farming private-intent counterfactual remains observable',()=>{
  withSeed(1517808,()=>{
    const s=scene(),LF=s.g.__testLivingFront;
    const originalQuery=LF.query;
    try {
      s.g.__lfState.signal=null;
      s.g.__lfState.bloomMemory=null;
      const shapes=Array.from({length:4},(_,i)=>({
        id:900+i,kind:'shape',type:'hexagon',hp:100,alive:true,
        x:-250+i*3,y:-400+i*2
      }));
      // Controlled visible neutral concentration, with the real composed
      // strategy function and real Fair Engagement visibility predicate.
      LF.query=()=>shapes;
      const defs={hexagon:{xp:200}};
      const localSector=s.T.sectorIndex(
        shapes.reduce((a,q)=>a+q.x,0)/shapes.length,
        shapes.reduce((a,q)=>a+q.y,0)/shapes.length);
      const before=s.T.publicEcoBias(s.g,s.observer,defs,{});
      assert.equal(before.mode,'local');
      assert.equal(before.key,'LOCAL:'+localSector);
      const publicSnapshot=JSON.stringify(shapes.map(q=>[q.id,q.x,q.y,q.hp]));
      s.others.forEach(q=>q.ai.__lfEcoKey='LOCAL:'+localSector);
      const after=s.T.publicEcoBias(s.g,s.observer,defs,{});
      console.log('NOVA_PUBLIC_CROWD_LOCAL_COUNTERFACTUAL '+
        JSON.stringify({before:before.mode,after:after.mode}));
      // A corrected shipping planner may legitimately retain local mode.
      assert.equal(JSON.stringify(shapes.map(q=>[q.id,q.x,q.y,q.hp])),
        publicSnapshot,'visible local farm changed during hidden counterfactual');
      assert.equal(physicalCrowd(s.g,s.observer,{x:-245,y:-397}),0,
        'public physical crowd cannot see those remote private assignments');
    } finally {LF.query=originalQuery;s.g.destroy();}
  });
});

test('composed remembered BLOOM private-intent counterfactual remains observable',()=>{
  withSeed(1517809,()=>{
    const s=scene(),LF=s.g.__testLivingFront,originalQuery=LF.query;
    try {
      // Isolate the public memory choice from unrelated local shape farming.
      LF.query=()=>[];
      s.observer.x=-200;s.observer.y=-400;
      s.g.time=11;
      s.g.__lfState.signal=null;
      s.g.__lfState.bloomMemory={
        sector:s.sector,announcedAt:9,until:33,initialValue:500
      };
      const baseline=s.T.publicEcoBias(s.g,s.observer,{},{});
      assert.equal(baseline.mode,'memory',
        'public remembered BLOOM must be a valid route before intervention');
      s.others.forEach(q=>q.ai.__lfEcoKey='BLOOM:'+s.sector);
      const hidden=s.T.publicEcoBias(s.g,s.observer,{},{});
      console.log('NOVA_PUBLIC_CROWD_MEMORY_COUNTERFACTUAL '+
        JSON.stringify({before:baseline.mode,after:hidden.mode}));
      // A corrected shipping planner may legitimately retain memory mode.
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
    } finally {LF.query=originalQuery;s.g.destroy();}
  });
});

test('research public crowd cannot read offscreen private health or AI',()=>{
  withSeed(1517810,()=>{
    const s=scene();
    try {
      const hidden={id:99101,x:3000,y:3000,
        get ai(){throw Error('hidden AI must not be inspected');},
        get hp(){throw Error('hidden HP must not be inspected');}};
      s.g.tanks.push(hidden);
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      s.g.tanks.pop(); // Do not expose the artificial poison object to teardown.
    } finally {s.g.destroy();}
  });
});

test('research public crowd fails closed without authoritative terrain LOS',()=>{
  withSeed(1517811,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      s.others[0].x=s.center.x;s.others[0].y=s.center.y;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      s.g.hasLineOfSight=null;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
    } finally {s.g.destroy();}
  });
});

test('research public crowd requires Fair Engagement viewport authority',()=>{
  withSeed(1517812,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      s.others[0].x=s.center.x;s.others[0].y=s.center.y;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      // The composed Game exposes this test authority as read-only.
      // Mask it on an isolated shallow view instead of mutating the Game.
      const missingFair={...s.g,__testFair:null};
      assert.equal(physicalCrowd(missingFair,s.observer,s.center),0);
    } finally {s.g.destroy();}
  });
});

test('research public crowd cannot inspect a terrain-occluded visible rival',()=>{
  withSeed(1517813,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      const hidden={id:99102,x:s.center.x,y:s.center.y,
        get ai(){throw Error('occluded AI must not be inspected');},
        get hp(){throw Error('occluded HP must not be inspected');}};
      s.g.tanks.push(hidden);
      s.g.hasLineOfSight=()=>false;
      try {assert.equal(physicalCrowd(s.g,s.observer,s.center),0);}
      finally {s.g.tanks.pop();}
    } finally {s.g.destroy();}
  });
});

test('research public crowd rejects unbounded viewport authority before hidden reads',()=>{
  withSeed(1517814,()=>{
    const s=scene();
    try {
      const hidden={id:99103,x:3000,y:3000,
        get ai(){throw Error('unbounded viewport exposed hidden AI');},
        get hp(){throw Error('unbounded viewport exposed hidden health');}};
      const broken={...s.g,__testFair:{
        ...s.g.__testFair,viewportHalfExtents:()=>({x:Infinity,y:Infinity})
      }};
      broken.tanks=[s.observer,hidden];
      let rays=0;
      broken.hasLineOfSight=()=>{rays++;return true;};
      assert.equal(physicalCrowd(broken,s.observer,
        {x:3000,y:3000},{radius:100}),0);
      assert.equal(rays,0,'invalid authority cannot trigger terrain queries');
    } finally {s.g.destroy();}
  });
});

test('dead or non-finite observers cannot certify public crowd pressure',()=>{
  withSeed(1517815,()=>{
    const s=scene();
    try {
      s.g.w=2400;s.g.h=1200;s.g.cam={zoom:1};
      s.others[0].x=s.center.x;s.others[0].y=s.center.y;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),1);
      s.observer.hp=0;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
      s.observer.hp=100;s.observer.x=NaN;
      assert.equal(physicalCrowd(s.g,s.observer,s.center),0);
    } finally {s.g.destroy();}
  });
});
