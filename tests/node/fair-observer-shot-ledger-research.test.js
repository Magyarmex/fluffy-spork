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
  if(!events||events.observerRef!==observer){
   events=new Map();events.observerRef=observer;ledger.set(observer.id,events);
  }
  // Certify potential victims AT the firing event. A target walking into
  // the old lane later must never become a retroactive witnessed attack.
  // This is a directional commitment, not a certified projectile hit.
  const targets=[],targetRefs=new WeakSet();
  for(const candidate of witnesses){
   metrics.eventTargetChecks=(metrics.eventTargetChecks||0)+1;
   if(!candidate||candidate.id===observer.id||candidate.id===shooter.id||
      !alive(candidate)||!hostile(g,shooter,candidate)||
      !fair.inGameplayViewport(g,observer,candidate))continue;
   // Reject out-of-cone candidates before expensive terrain LOS.
   const bearing=Math.atan2(candidate.y-shooter.y,candidate.x-shooter.x);
   if(Math.cos(shooter.angle-bearing)<CONE)continue;
   // The observer must have seen the candidate as well as the shooter.
   // Fail closed when terrain visibility cannot be established.
   if(typeof g.hasLineOfSight!=='function')continue;
   metrics.eventTargetRays=(metrics.eventTargetRays||0)+1;
   if(!g.hasLineOfSight(observer.x,observer.y,candidate.x,candidate.y,3))continue;
   metrics.eventTargetRays++;
   if(!g.hasLineOfSight(shooter.x,shooter.y,candidate.x,candidate.y,3))continue;
   targets.push(candidate.id);targetRefs.add(candidate);
  }
  events.delete(shooter.id);
  events.set(shooter.id,Object.freeze({
   shooterId:shooter.id,shooterRef:(g.getTank&&g.getTank(shooter.id))||shooter,x:shooter.x,y:shooter.y,
   angle:shooter.angle,at:now,targets:Object.freeze(targets),
   // Object identity prevents an unrelated respawn/replacement reusing an ID.
   targetRefs
  }));
  if(events.size>MAX_SHOOTERS)events.delete(events.keys().next().value);
  metrics.witnesses++;
 }
}
function publicPressure(g,fair,ledger,observer,target,metrics){
 // Public geometry must precede target health or status reads.
 if(!observer||!target||!fair.inGameplayViewport(g,observer,target)||
    !alive(target))return 0;
 const events=ledger.get(observer.id);
 if(!events||events.observerRef!==observer)return 0;
 const now=Number(g.time);
 let n=0;
 for(const ev of events.values()){
  metrics.candidateChecks++;
  if(!Number.isFinite(now)||now-ev.at<0||now-ev.at>MAX_AGE)continue;
  const shooter=g.getTank&&g.getTank(ev.shooterId);
  // Current offscreen shooter state is not public, even after a witnessed shot.
  // This conservative prototype drops such memories instead of inspecting HP.
  if(!shooter||shooter!==ev.shooterRef||!fair.inGameplayViewport(g,observer,shooter)||
     !alive(shooter)||!hostile(g,shooter,target))continue;
  // A public event-time target certificate survives target movement,
  // but never grows retroactively from a later target position.
  if(ev.targetRefs.has(target))n++;
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
 target.x=500;
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),0,
  'a target outside the observer viewport is not current public pressure');
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
 assert.equal(publicPressure(g,fair,ledger,observer,target,m),0,
  'a target entering an old firing lane cannot create a retroactive witness');
 // The event-time certificate records aim commitment, not projectile impact.
});
test('event-time certificate excludes allied and unobserved victims',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{},teamId:1};
 const shooter={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{},teamId:2};
 const enemy={id:3,x:100,y:0,hp:100,alive:true,teamId:3};
 const ally={id:4,x:120,y:0,hp:100,alive:true,teamId:2};
 const offscreen={id:5,x:500,y:0,hp:100,alive:true,teamId:3};
 const tanks=[observer,shooter,enemy,ally,offscreen],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:()=>true};
 const fair={inGameplayViewport:(_g,o,t)=>Math.abs(t.x-o.x)<=300};
 const metrics={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,metrics);
 const event=ledger.get(observer.id).get(shooter.id);
 assert.deepEqual(event.targets,[enemy.id],
  'public commitment must exclude allies and victims outside observer sight');
 assert.equal(publicPressure(g,fair,ledger,observer,ally,metrics),0);
 assert.equal(publicPressure(g,fair,ledger,observer,offscreen,metrics),0);
});
test('an occluded victim cannot be inferred merely from visible shooter aim',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{}};
 const target={id:3,x:100,y:0,hp:100,alive:true};
 const tanks=[observer,shooter,target],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:(ax,ay,bx,by)=>!(ax===observer.x&&ay===observer.y&&
   bx===target.x&&by===target.y)};
 const fair={inGameplayViewport:()=>true},metrics={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,metrics);
 assert.deepEqual(ledger.get(observer.id).get(shooter.id).targets,[]);
 g.hasLineOfSight=()=>true;
 assert.equal(publicPressure(g,fair,ledger,observer,target,metrics),0,
  'later cover removal cannot retroactively reveal the shot-time victim');
});
test('recycled target ID cannot inherit a historical firing certificate',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{}};
 const original={id:3,x:100,y:0,hp:100,alive:true};
 const tanks=[observer,shooter,original],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:()=>true};
 const fair={inGameplayViewport:()=>true},metrics={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,metrics);
 assert.equal(publicPressure(g,fair,ledger,observer,original,metrics),1);
 const replacement={id:3,x:100,y:0,hp:100,alive:true};
 tanks[2]=replacement;
 assert.equal(publicPressure(g,fair,ledger,observer,replacement,metrics),0,
  'a new object with a reused ID cannot inherit old shot pressure');
});
test('recycled shooter ID cannot inherit a historical firing certificate',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{}};
 const target={id:3,x:100,y:0,hp:100,alive:true};
 const tanks=[observer,shooter,target],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),hasLineOfSight:()=>true};
 const fair={inGameplayViewport:()=>true},metrics={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,metrics);
 assert.equal(publicPressure(g,fair,ledger,observer,target,metrics),1);
 const replacement={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{}};
 tanks[1]=replacement;
 assert.equal(publicPressure(g,fair,ledger,observer,target,metrics),0,
  'new shooter with reused numeric ID must not inherit prior-life shot');
 recordShot(g,fair,ledger,replacement,metrics);
 assert.equal(publicPressure(g,fair,ledger,observer,target,metrics),1,
  'new shooter can create its own witnessed firing evidence');
});
test('reused observer ID cannot inherit another life\'s public memory',()=>{
 const observer={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 const shooter={id:2,x:-100,y:0,angle:0,hp:100,alive:true,ai:{}};
 const target={id:3,x:100,y:0,hp:100,alive:true};
 const tanks=[observer,shooter,target],ledger=new Map();
 const g={time:10,tanks,getTank:id=>tanks.find(t=>t.id===id),
  hasLineOfSight:()=>true};
 const fair={inGameplayViewport:()=>true},metrics={witnesses:0,candidateChecks:0};
 recordShot(g,fair,ledger,shooter,metrics);
 assert.equal(publicPressure(g,fair,ledger,observer,target,metrics),1);
 const replacement={id:1,x:0,y:0,hp:100,alive:true,ai:{}};
 tanks[0]=replacement;
 assert.equal(publicPressure(g,fair,ledger,replacement,target,metrics),0,
  'replacement observer with same numeric ID has no old witness');
 recordShot(g,fair,ledger,shooter,metrics);
 assert.equal(publicPressure(g,fair,ledger,replacement,target,metrics),1,
  'new observer can independently witness a new real firing event');
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
  const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
  const metrics={seed,shots:0,witnesses:0,witnessChecks:0,candidateChecks:0,
   visiblePairs:0,privatePositive:0,publicPositive:0,bothPositive:0,
   choiceSamples:0,choiceChanges:0,playerFocusPrivate:0,playerFocusPublic:0,
   eventTargetChecks:0,eventTargetRays:0,
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
      angle:shooter.angle,hp:1,alive:true,
      teamId:shooter.teamId,team:shooter.team,
      factionId:shooter.factionId,faction:shooter.faction,
      side:shooter.side}:null;
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
    for(const observer of observers){
     let privateBest=null,publicBest=null,privateScore=-Infinity,publicScore=-Infinity;
     let choices=0;
     for(const target of g.tanks){
      if(!target||!hostile(g,observer,target)||!alive(target)||
         !fair.inGameplayViewport(g,observer,target))continue;
      const p=fair.scoreTarget(g,classes,observer,observer.ai,target,g.time);
      if(!Number.isFinite(p))continue;
      metrics.visiblePairs++;choices++;
      const priv=fair.saturation(g,target.id,observer.id);
      const pub=publicPressure(g,fair,ledger,observer,target,metrics);
      if(priv>0)metrics.privatePositive++;
      if(pub>0)metrics.publicPositive++;
      if(priv>0&&pub>0)metrics.bothPositive++;
      const counterfactual=p+.18*(priv-pub);
      if(p>privateScore){privateScore=p;privateBest=target;}
      if(counterfactual>publicScore){publicScore=counterfactual;publicBest=target;}
     }
     if(choices>=2&&privateBest&&publicBest){
      metrics.choiceSamples++;
      if(privateBest.id!==publicBest.id)metrics.choiceChanges++;
      if(privateBest.isPlayer)metrics.playerFocusPrivate++;
      if(publicBest.isPlayer)metrics.playerFocusPublic++;
     }
    }
    for(const events of ledger.values())
     metrics.maxLedgerSize=Math.max(metrics.maxLedgerSize,events.size);
   }
   const privateHash=digest((g.tanks||[]).map(t=>t&&t.ai?[
    t.id,t.ai.state,t.ai.__v180Posture,t.ai.__v1112TargetId,
    t.ai.__v1105TargetId,t.ai.__v180TargetId,t.ai.targetId,
    t.ai.__v1112NextThink,t.ai.__v181Mode]:null));
   return {hash:digest(physical(g)),privateHash,draws:draws(),metrics};
  }finally{g.destroy();}
 });
}
test('two seeded composed games: observer-owned ledger measures evidence without altering simulation',()=>{
 for(const seed of [1517800,1517802]){
  const control=run(seed,false),research=run(seed,true);
  assert.equal(research.hash,control.hash,'read-only research changed physical game');
  assert.equal(research.draws,control.draws,'research consumed gameplay RNG');
  assert.equal(research.privateHash,control.privateHash,
   'read-only witness sampling changed private AI state');
  assert.equal(research.metrics.frames,720);
  assert.ok(research.metrics.visiblePairs>0);
  assert.ok(research.metrics.maxLedgerSize<=MAX_SHOOTERS);
  console.log('NOVA_FAIR_OBSERVER_SHOT_LEDGER_RESEARCH '+JSON.stringify(research.metrics));
 }
});
