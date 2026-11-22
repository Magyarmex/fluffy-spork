'use strict';
// #1025 RESEARCH ONLY. A bounded, observer-owned, event-time shot ledger.
// It is not wired into AI targeting or the materialized game.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');

const MAX_SHOOTERS=4,MAX_AGE=1.25,CONE=.95;
function alive(t){return !!t&&t.alive!==false&&(t.hp==null||t.hp>0);}
function hostile(g,a,b){
 if(!a||!b||a.id===b.id)return false;
 if(typeof g.areAllies==='function'&&g.areAllies(a,b))return false;
 if(typeof g.areHostile==='function')return !!g.areHostile(a,b);
 for(const k of ['teamId','team','factionId','faction','side'])
  if(a[k]!=null&&b[k]!=null)return a[k]!==b[k];
 return true;
}
function recordShot(g,fair,ledger,shooter,metrics){
 if(!shooter||!Number.isFinite(shooter.x)||!Number.isFinite(shooter.y)||
    !Number.isFinite(shooter.angle))return;
 const now=Number(g.time);
 if(!Number.isFinite(now))return;
 // During the Fair Engagement wrapper g.tanks is narrowed to [self, target].
 // Its explicit full-world shot witness roster is the authorized source here.
 const witnesses=g.__novaFairShotWitnesses||g.tanks||[];
 for(const observer of witnesses){
  metrics.witnessChecks=(metrics.witnessChecks||0)+1;
  if(!observer||!observer.ai||observer.id===shooter.id||!alive(observer))continue;
  if(!fair.inGameplayViewport(g,observer,shooter))continue;
  if(typeof g.hasLineOfSight==='function'&&
     !g.hasLineOfSight(observer.x,observer.y,shooter.x,shooter.y,3))continue;
  let events=ledger.get(observer.id);
  if(!events){events=new Map();ledger.set(observer.id,events);}
  events.delete(shooter.id);
  events.set(shooter.id,Object.freeze({
   shooterId:shooter.id,x:shooter.x,y:shooter.y,
   angle:shooter.angle,at:now
  }));
  if(events.size>MAX_SHOOTERS)events.delete(events.keys().next().value);
  metrics.witnesses++;
 }
}
function publicPressure(g,fair,ledger,observer,target,metrics){
 if(!observer||!target||!alive(target)||
    !fair.inGameplayViewport(g,observer,target))return 0;
 const events=ledger.get(observer.id);
 if(!events)return 0;
 const now=Number(g.time);
 let n=0;
 for(const ev of events.values()){
  metrics.candidateChecks++;
  if(!Number.isFinite(now)||now-ev.at<0||now-ev.at>MAX_AGE)continue;
  const shooter=g.getTank&&g.getTank(ev.shooterId);
  if(!alive(shooter)||!hostile(g,shooter,target))continue;
  // This is a current-position geometric proxy, NOT an event-time
  // certification that the target was in the actual projectile lane.
  if(typeof g.hasLineOfSight==='function'&&
     !g.hasLineOfSight(ev.x,ev.y,target.x,target.y,3))continue;
  const bearing=Math.atan2(target.y-ev.y,target.x-ev.x);
  if(Math.cos(ev.angle-bearing)>=CONE)n++;
 }
 return n;
}
test('event-time public shot ledger ignores hidden private assignments and shooter relocation',()=>{
 const fair={inGameplayViewport(g,o,t){
  return Math.abs(t.x-o.x)<=400&&Math.abs(t.y-o.y)<=300;
 }};
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:-150,y:0,angle:0,hp:100,alive:true,ai:{__v1112TargetId:3}};
 const target={id:3,x:100,y:0,hp:100,alive:true,ai:{}};
 const other={id:4,x:-100,y:120,hp:100,alive:true,ai:{}};
 const tanks=[observer,shooter,target,other];
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:()=>true};
 const ledger=new Map(),m={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,m);
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),1);
 shooter.ai.__v1112TargetId=other.id;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),1,
  'private target slot is not public evidence');
 shooter.x=200;shooter.y=120;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),1,
  'historical shot origin does not follow a moving shooter');
 target.x=-250;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),0);
 g.time=11.26;target.x=100;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),0,
  'expired evidence cannot become permanent saturation');
});
test('offscreen or occluded shooter cannot seed an observer-owned event',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:500,y:0,angle:0,hp:100,alive:true,ai:{}};
 const g={time:10,tanks:[observer,shooter],hasLineOfSight:()=>true};
 const fair={inGameplayViewport:(_g,o,t)=>Math.abs(t.x-o.x)<=400};
 const ledger=new Map(),m={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,m);
 assert.equal(ledger.has(observer.id),false,'offscreen shooter is not observed');
 shooter.x=100;g.hasLineOfSight=()=>false;
 recordShot(g,fair,ledger,shooter,m);
 assert.equal(ledger.has(observer.id),false,'opaque cover blocks shot observation');
 g.hasLineOfSight=()=>true;
 recordShot(g,fair,ledger,shooter,m);
 assert.equal(ledger.get(observer.id).size,1,'visible firing event is recorded');
});
test('negative control: a target entering the old shot lane is not a certified event-time victim',()=>{
 const fair={inGameplayViewport:()=>true};
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:0,y:0,angle:0,hp:100,alive:true,ai:{}};
 const target={id:3,x:100,y:100,hp:100,alive:true,ai:{}};
 const tanks=[observer,shooter,target],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:()=>true};
 const m={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,m);
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),0);
 target.y=0;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),1,
  'falsifier: current target position can retroactively create a false witness');
 // Do not promote this proxy without event-time victim or actual projectile
 // lane evidence; preserving the firing origin alone is insufficient.
});
test('ledger retains at most four distinct shooter events per observer',()=>{
 const fair={inGameplayViewport:()=>true};
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooters=Array.from({length:9},(_,i)=>({
  id:10+i,x:20+i*10,y:0,angle:0,hp:100,alive:true,ai:{}
 }));
 const g={time:10,tanks:[observer,...shooters],hasLineOfSight:()=>true};
 const ledger=new Map(),m={witnesses:0,candidateChecks:0};
 for(const shooter of shooters)recordShot(g,fair,ledger,shooter,m);
 assert.equal(ledger.get(observer.id).size,MAX_SHOOTERS);
 assert.deepEqual([...ledger.get(observer.id).keys()],shooters.slice(-4).map(s=>s.id));
});
function run(seed,instrument){
 return withSeed(seed,draws=>{
  const g=bootGame(),ledger=new Map(),fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const metrics={seed,shots:0,witnesses:0,witnessChecks:0,candidateChecks:0,
   visiblePairs:0,privatePositive:0,publicPositive:0,bothPositive:0,
   maxLedgerSize:0,frames:0};
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.status='playing';g.paused=false;
   if(instrument){
    const oldFire=g.tryFire;
    g.tryFire=function(shooter){
     const before=this.bullets.length;
     // Preserve the firing-time origin, not a potentially moved hull.
     // Successful projectile birth certifies an active shooter; do not read
     // hidden live HP before each observer's public-geometry sight gate.
     const fired=shooter?{id:shooter.id,x:shooter.x,y:shooter.y,
      angle:shooter.angle,hp:1,alive:true}:null;
     const out=oldFire.apply(this,arguments);
     if(this.bullets.length>before){
      metrics.shots++;
      recordShot(this,fair,ledger,fired,metrics);
     }
     return out;
    };
   }
   for(let frame=0;frame<720;frame++){
    g.update(1/60);metrics.frames++;
    if(!instrument||frame%30!==0)continue;
    const observers=g.tanks.filter(t=>t&&t.ai&&alive(t));
    for(const observer of observers)for(const target of g.tanks){
     if(!target||!hostile(g,observer,target)||!alive(target)||
        !fair.inGameplayViewport(g,observer,target))continue;
     metrics.visiblePairs++;
     const priv=fair.saturation(g,target.id,observer.id)>0;
     const pub=publicPressure(g,fair,ledger,observer,target,metrics)>0;
     if(priv)metrics.privatePositive++;
     if(pub)metrics.publicPositive++;
     if(priv&&pub)metrics.bothPositive++;
    }
    for(const events of ledger.values())
     metrics.maxLedgerSize=Math.max(metrics.maxLedgerSize,events.size);
   }
   return {hash:digest(physical(g)),draws:draws(),metrics};
  }finally{g.destroy();}
 });
}
test('two seeded composed games: observer-owned ledger measures evidence without altering simulation',()=>{
 for(const seed of [1517800,1517802]){
  const control=run(seed,false),research=run(seed,true);
  assert.equal(research.hash,control.hash,'read-only research changed physical game');
  assert.equal(research.draws,control.draws,'research consumed gameplay RNG');
  assert.equal(research.metrics.frames,720);
  assert.ok(research.metrics.visiblePairs>0);
  assert.ok(research.metrics.maxLedgerSize<=MAX_SHOOTERS);
  console.log('NOVA_FAIR_OBSERVER_SHOT_LEDGER_RESEARCH '+JSON.stringify(research.metrics));
 }
});
