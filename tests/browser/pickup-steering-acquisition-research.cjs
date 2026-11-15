'use strict';
// Research-only composed-game acquisition witness for issue #979.
// The synthetic walls are controlled fixtures; results are NOT natural-match incidence.
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaPickupWitnessGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaPickupWitnessGame?.status==='playing',{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaPickupWitnessGame,ai=window.__novaMakeRequire('')('game/ai'),
    C=window.__novaMakeRequire('')('game/classes').CLASSES;
   g.setPaused(true);
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   if(!bot||typeof ai.updateAI!=='function')throw Error('missing actual composed bot/AI');
   const walls=[
    {id:91001,x:-130,y:-35,w:60,h:330,solid:true},
    {id:91002,x:0,y:35,w:60,h:330,solid:true},
    {id:91003,x:130,y:-35,w:60,h:330,solid:true}
   ];
   const hitRect=(ax,ay,bx,by,w,pad)=>{
    const minX=w.x-w.w/2-pad,maxX=w.x+w.w/2+pad,
     minY=w.y-w.h/2-pad,maxY=w.y+w.h/2+pad,dx=bx-ax,dy=by-ay;
    let lo=0,hi=1,nx=0,ny=0;
    for(const [p,q,fx,fy] of [[-dx,ax-minX,-1,0],[dx,maxX-ax,1,0],
      [-dy,ay-minY,0,-1],[dy,maxY-ay,0,1]]){
     if(Math.abs(p)<1e-9){if(q<0)return null;}
     else{const t=q/p;
      if(p<0){if(t>lo){lo=t;nx=fx;ny=fy;}}
      else hi=Math.min(hi,t);
      if(lo>hi)return null;
     }
    }
    return{t:lo,x:ax+dx*lo,y:ay+dy*lo,nx,ny};
   };
   const segment=(ax,ay,bx,by,w,pad)=>!!hitRect(ax,ay,bx,by,w,pad);
   const originals={los:g.hasLineOfSight,safe:g.isTerrainSafe,hit:g.firstTerrainHit,
    terrain:g.__novaTerrain,shapes:g.shapes,bullets:g.bullets,powerups:g.powerups,waypoint:g.novaBattlefieldWaypoint,strategic:g.novaStrategicRouteCost,
    hash:g.hash,time:g.time,playerX:g.player.x,playerY:g.player.y};
   const other=g.tanks.filter(t=>t!==bot).map(t=>({t,alive:t.alive,hp:t.hp}));
   const baseline={...bot},baseAI={...bot.ai};
   const originalRandom=Math.random,logs=[];
   try{
    g.player.x=2200;g.player.y=2200;
    for(const o of other){if(o.t!==g.player){o.t.alive=false;o.t.hp=0;}}
    g.shapes=[];g.bullets=[];g.hash=null;
    for(const arm of ['direct','three-walls','lower-only','lower-only-even-seed','lower-only-goal-hint','two-heals-lower-first','two-heals-upper-first','two-heals-lower-first-isolated-plans','two-heals-lower-first-budgeted-plans','two-heals-lower-first-even-seed','two-heals-upper-first-even-seed','two-heals-lower-first-even-seed-isolated-plans','two-heals-lower-first-even-seed-budgeted-plans']){
     const active=arm==='direct'?[]:walls;
     g.__novaTerrain=active;
     g.hasLineOfSight=(ax,ay,bx,by,pad=0)=>!active.some(w=>segment(ax,ay,bx,by,w,pad));
     g.isTerrainSafe=(x,y,pad=0)=>!active.some(w=>Math.abs(x-w.x)<=w.w/2+pad&&Math.abs(y-w.y)<=w.h/2+pad);
     g.firstTerrainHit=(ax,ay,bx,by,pad=0)=>{
      const hits=active.map(w=>({w,hit:hitRect(ax,ay,bx,by,w,pad)}))
       .filter(h=>h.hit).sort((a,b)=>a.hit.t-b.hit.t);
      return hits.length?{solid:hits[0].w,hit:hits[0].hit}:null;
     };
     for(const k of Object.keys(bot))if(!(k in baseline))delete bot[k];
     Object.assign(bot,baseline);bot.ai={...baseAI};
     bot.id=arm.includes('even-seed')?700008:700007;bot.cls='guard';bot.x=-340;bot.y=0;bot.hp=10;bot.maxHp=100;bot.alive=true;
     // Booted AI hulls can have random IDs and applied stats. Normalize both
     // before every arm so separate Chromium jobs compare the same Guard.
     bot.level=1;bot.tier=0;bot.angle=0;bot.fireCd=0;bot.fireSpin=0;
     bot.abilityCd=0;bot.shieldT=0;bot.tripleT=0;bot.hasteT=0;
     bot.stats={damage:0,reload:0,bulletspeed:0,penetration:0,maxhp:0,regen:0,speed:0,body:0};
     bot.isPlayer=false;bot.vx=0;bot.vy=0;bot.spawnShieldT=0;
     bot.ai.state='wander';bot.ai.targetId=-1;bot.ai.thinkT=0;
     bot.ai.strafe=1;bot.ai.aggression=.5;bot.ai.archetype='brawler';
     bot.ai.isElite=false;bot.ai.dodgeX=0;bot.ai.dodgeY=0;
     bot.ai.dodgeT=0;bot.ai.preferredRange=0;bot.ai.fireHold=0;
     bot.dmgMult=1;
     bot.ai.wanderA=0;bot.ai.wanderT=0;bot.ai.__v181Think=0;
     bot.ai.__v172LastSeenAt=null;bot.ai.__v172LastSeenId=-1;
     bot.ai.__v172Waypoint=null;bot.ai.__v172WaypointUntil=0;
     bot.ai.__v1102Nav=null;bot.ai.__v181BiasX=0;bot.ai.__v181BiasY=0;
     bot.ai.__v181BiasW=0;bot.ai.__v181Mode='none';bot.ai.__v181ResourceId=null;
     const upper={id:'upper',type:'heal',x:340,y:40},lower={id:'lower',type:'heal',x:340,y:-40};
     g.powerups=(arm==='lower-only'||arm==='lower-only-even-seed'||arm==='lower-only-goal-hint')?[lower]:
      arm.startsWith('two-heals-lower-first')?[lower,upper]:
      arm.startsWith('two-heals-upper-first')?[upper,lower]:[upper];
     const initialIds=g.powerups.map(p=>p.id),initialCount=g.powerups.length;
     g.time=10;g.__v1102Routes=Object.create(null);g.__v1102RouteContext=null;
     // Isolate each candidate's exact full route before the live AI trial.
     // Research shadow calls must never donate their cache to live movement.
     const isolatedCosts={};
     for(const p of [lower,upper]){
      g.__v1102Routes=Object.create(null);
      const pad=(Number(C[bot.cls]?.size)||15)+8,
       wp=g.novaBattlefieldWaypoint(bot.x,bot.y,p.x,p.y,pad,bot.id),
       cost=wp&&g.novaRouteLength(bot.x,bot.y,p.x,p.y,pad,bot.id,wp);
      isolatedCosts[p.id]=Number.isFinite(cost)?+cost.toFixed(3):null;
     }
     g.__v1102Routes=Object.create(null);
     // Research-only upper bound: force independent plans for each exact heal
     // candidate. This intentionally spends more planner work; it is NOT a
     // proposed production strategy or a performance-neutral comparison.
     let nextBudgetedAt=-Infinity;
     g.novaBattlefieldWaypoint=(arm.includes('isolated-plans')||arm.includes('budgeted-plans'))?
      function(x,y,gx,gy,pad,seed){
       if(g.powerups.some(p=>p.x===gx&&p.y===gy)){
        const key=String(seed==null?'x':seed)+':'+Math.round((pad||8)/4);
        const cached=g.__v1102Routes&&g.__v1102Routes[key];
        if(cached&&(cached.gx!==gx||cached.gy!==gy)){
         const isOtherPickup=g.powerups.some(p=>p.x===cached.gx&&p.y===cached.gy);
         if(arm.includes('isolated-plans')||
            (isOtherPickup&&g.time>=nextBudgetedAt)){
          delete g.__v1102Routes[key];
          if(arm.includes('budgeted-plans'))nextBudgetedAt=g.time+1.0;
         }
        }
       }
       return originals.waypoint.call(this,x,y,gx,gy,pad,seed);
      }:originals.waypoint;
     // Passive certification census: observe the real strategic lookup after
     // it runs; never issue an additional waypoint plan or change its result.
     const routeCertSummary={exact:0,nearby:0,fallback:0,unverified:0,failures:[]};
     const selectedWaypoint=g.novaBattlefieldWaypoint;
     let goalHintOverrides=0;
     const routePlanCosts=[],strategicPlanCosts=[];
     g.novaStrategicRouteCost=originals.strategic;
     if(typeof originals.strategic==='function'){
      g.novaStrategicRouteCost=function(...args){
       const before=window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicPlans||0;
       const started=performance.now();
       const value=originals.strategic.apply(this,args);
       if((window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicPlans||0)>before)
        strategicPlanCosts.push(performance.now()-started);
       return value;
      };
     }
     g.novaBattlefieldWaypoint=function(x,y,gx,gy,pad,seed){
      let routeGx=gx,routeGy=gy;
      // Research-only intervention: when the Guard is actively pursuing its
      // sole heal, replace the local steering horizon with that same goal.
      // This tests goal ownership; it is NOT a production movement change.
      if(arm==='lower-only-goal-hint'&&seed===bot.id&&bot.ai.__v181Mode==='resource'&&
         (gx!==lower.x||gy!==lower.y)){
       routeGx=lower.x;routeGy=lower.y;goalHintOverrides++;
      }
      const plansBeforeCall=window.__NOVA_TERRAIN_INTELLIGENCE__?.plans||0;
      const routeStart=performance.now();
      const wp=selectedWaypoint.call(this,x,y,routeGx,routeGy,pad,seed);
      if((window.__NOVA_TERRAIN_INTELLIGENCE__?.plans||0)>plansBeforeCall)
       routePlanCosts.push(performance.now()-routeStart);
      if(seed===bot.id&&g.powerups.some(p=>p.x===gx&&p.y===gy)){
       const full=wp&&g.novaRouteLength?.(x,y,gx,gy,pad,seed,wp);
       const near=wp&&g.novaNearbyRouteLength?.(x,y,gx,gy,pad,seed,wp);
       const clear=wp&&g.hasLineOfSight?.(wp.x,wp.y,gx,gy,Math.max(2,pad-5));
       const type=Number.isFinite(full)?'exact':Number.isFinite(near)?'nearby':clear?'fallback':'unverified';
       routeCertSummary[type]++;
       if(type==='unverified'&&routeCertSummary.failures.length<12){
        const cache=g.__v1102Routes?.[String(seed)+':'+Math.round(pad/4)];
        routeCertSummary.failures.push({t:+g.time.toFixed(3),goal:{x:gx,y:gy},
         wp:wp?{x:wp.x,y:wp.y}:null,cacheGoal:cache?{x:cache.gx,y:cache.gy}:null});
       }
      }
      return wp;
     };
     let state=0x6d2b79f5;Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
     const plansBefore=window.__NOVA_TERRAIN_INTELLIGENCE__?.plans||0,
      strategicBefore=window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicPlans||0,
      localDeferralsBefore=window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicLocalDeferrals||0,
      globalDeferralsBefore=window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicGlobalDeferrals||0,
      routeGoalOccupancy={selected:0,otherHeal:0,unrelated:0,empty:0};
     const trace=[],aiUpdateCosts=[],dt=1/60,steps=720;
     let invalidPositions=0,invalidSegments=0,resourceFrames=0,acquiredAt=null,firstChosen=null,acquiredId=null;
     const decisionTransitions=[];let priorMode=null,priorResource=null,minimumGoalDistance=Infinity;
     for(let i=0;i<steps;i++){
      g.time=10+i*dt;
      const px=bot.x,py=bot.y;
      const aiStart=performance.now();
      ai.updateAI(bot,g,dt);
      aiUpdateCosts.push(performance.now()-aiStart);
      if(bot.ai.__v181Mode!==priorMode||bot.ai.__v181ResourceId!==priorResource){
       decisionTransitions.push({t:+(i*dt).toFixed(3),mode:bot.ai.__v181Mode,resourceId:bot.ai.__v181ResourceId??null,x:+bot.x.toFixed(2),y:+bot.y.toFixed(2)});
       priorMode=bot.ai.__v181Mode;priorResource=bot.ai.__v181ResourceId;
      }
      minimumGoalDistance=Math.min(minimumGoalDistance,...g.powerups.map(p=>Math.hypot(p.x-bot.x,p.y-bot.y)));
      const routeKey=String(bot.id)+':'+Math.round(((Number(C[bot.cls]?.size)||15)+8)/4),
       cachedGoal=g.__v1102Routes?.[routeKey],
       selectedHeal=g.powerups.find(p=>p.id===bot.ai.__v181ResourceId);
      if(!cachedGoal)routeGoalOccupancy.empty++;
      else if(selectedHeal&&cachedGoal.gx===selectedHeal.x&&cachedGoal.gy===selectedHeal.y)routeGoalOccupancy.selected++;
      else if(g.powerups.some(p=>p.x===cachedGoal.gx&&p.y===cachedGoal.gy))routeGoalOccupancy.otherHeal++;
      else routeGoalOccupancy.unrelated++;
      if(bot.ai.__v181Mode==='resource'){
       resourceFrames++;
       if(firstChosen==null)firstChosen=bot.ai.__v181ResourceId;
      }
      const radius=(Number(C[bot.cls]?.size)||15)+3;
      if(!g.isTerrainSafe(bot.x,bot.y,radius-.5))invalidPositions++;
      if(active.some(w=>segment(px,py,bot.x,bot.y,w,radius-.5)))invalidSegments++;
      g.updatePowerups(dt);
      if(g.powerups.length<initialCount&&acquiredAt==null){
       acquiredAt=+(i*dt).toFixed(3);
       acquiredId=initialIds.find(id=>!g.powerups.some(p=>p.id===id));
      }
      if(i%30===0||!g.powerups.length){
       const cache=g.__v1102Routes||{},entry=Object.entries(cache).find(([k])=>k.startsWith(String(bot.id)+':')),
        route=entry&&entry[1];
       trace.push({t:+(i*dt).toFixed(2),x:+bot.x.toFixed(2),y:+bot.y.toFixed(2),
        mode:bot.ai.__v181Mode,goal:route?{x:+route.gx.toFixed(1),y:+route.gy.toFixed(1)}:null,
        wp:bot.ai.__v172Waypoint?{x:+bot.ai.__v172Waypoint.x.toFixed(1),y:+bot.ai.__v172Waypoint.y.toFixed(1)}:null,
        stuck:bot.ai.__v1102Nav?.stuck||0,healRemaining:g.powerups.length});
      }
      if(g.powerups.length<initialCount)break;
     }
     const sortedCosts=aiUpdateCosts.slice().sort((a,b)=>a-b);
     const aiUpdateMsP95=sortedCosts[Math.floor((sortedCosts.length-1)*.95)]||0;
     const aiUpdateMsMean=aiUpdateCosts.reduce((a,b)=>a+b,0)/Math.max(1,aiUpdateCosts.length);
     const sortedRouteCosts=routePlanCosts.slice().sort((a,b)=>a-b);
     const routePlanMsP95=sortedRouteCosts[Math.floor((sortedRouteCosts.length-1)*.95)]||0;
     const sortedStrategicCosts=strategicPlanCosts.slice().sort((a,b)=>a-b);
     const strategicPlanMsP95=sortedStrategicCosts[Math.floor((sortedStrategicCosts.length-1)*.95)]||0;
     logs.push({arm,isolatedCosts,routePlanMsP95:+routePlanMsP95.toFixed(4),
      routePlanMsMax:+(sortedRouteCosts.at(-1)||0).toFixed(4),
      routePlanMsTotal:+routePlanCosts.reduce((a,b)=>a+b,0).toFixed(4),
      strategicPlanMsP95:+strategicPlanMsP95.toFixed(4),
      strategicPlanMsTotal:+strategicPlanCosts.reduce((a,b)=>a+b,0).toFixed(4),
      aiUpdateMsP95:+aiUpdateMsP95.toFixed(4),
      aiUpdateMsMean:+aiUpdateMsMean.toFixed(4),selectedResource:firstChosen,acquiredId,
      acquired:g.powerups.length<initialCount,acquiredAt,invalidPositions,invalidSegments,
      resourceFrames,decisionTransitions,routeCertSummary,minimumGoalDistance:+minimumGoalDistance.toFixed(3),final:{x:bot.x,y:bot.y,hp:bot.hp},
      routePlans:window.__NOVA_TERRAIN_INTELLIGENCE__?.plans,
      routePlansDelta:(window.__NOVA_TERRAIN_INTELLIGENCE__?.plans||0)-plansBefore,
      strategicPlansDelta:(window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicPlans||0)-strategicBefore,
      strategicLocalDeferralsDelta:(window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicLocalDeferrals||0)-localDeferralsBefore,
      strategicGlobalDeferralsDelta:(window.__NOVA_TERRAIN_INTELLIGENCE__?.strategicGlobalDeferrals||0)-globalDeferralsBefore,
      routeGoalOccupancy,
      goalHintOverrides,
      trace});
    }
   }finally{
    Math.random=originalRandom;g.hasLineOfSight=originals.los;
    g.isTerrainSafe=originals.safe;g.firstTerrainHit=originals.hit;
    g.__novaTerrain=originals.terrain;g.shapes=originals.shapes;
    g.bullets=originals.bullets;g.powerups=originals.powerups;
    g.hash=originals.hash;g.time=originals.time;g.novaBattlefieldWaypoint=originals.waypoint;g.novaStrategicRouteCost=originals.strategic;
    g.player.x=originals.playerX;g.player.y=originals.playerY;
    for(const o of other){o.t.alive=o.alive;o.t.hp=o.hp;}
   }
   return logs;
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  if(result.length!==13||result.some(r=>!r.trace.length))throw Error('empty composed-game witness');
  fs.writeFileSync('pickup-steering-results.json',JSON.stringify({head:process.env.GITHUB_SHA||null,arms:result},null,2)+'\n');
  console.log('PICKUP_STEERING_WITNESS '+JSON.stringify(result));
  for(const arm of result){
   if(!arm.acquired||arm.acquiredAt==null||arm.acquiredAt>12)
    throw Error('composed-game heal not acquired within 12s: '+JSON.stringify(arm));
   if(arm.invalidPositions||arm.invalidSegments)
    throw Error('physical route violated wall clearance: '+JSON.stringify(arm));
   if(arm.resourceFrames<100)
    throw Error('AI did not maintain meaningful resource pursuit: '+JSON.stringify(arm));
   if(!['upper','lower'].includes(arm.acquiredId))
    throw Error('acquired identity is not an eligible fixture heal: '+JSON.stringify(arm));
   // A bot may legally collect a different nearby heal while moving toward its
   // selected goal. Record the mismatch; do not confuse it with failed pickup.
   if(arm.selectedResource!==arm.acquiredId)
    console.log('PICKUP_OPPORTUNISTIC_ACQUISITION '+JSON.stringify({arm:arm.arm,selected:arm.selectedResource,acquired:arm.acquiredId}));
  }
  if(result[1].acquiredAt<=result[0].acquiredAt)
   throw Error('three-wall fixture did not exercise a real travel detour');
  // The current AI can prefer the first cached nearby heal even when a second
  // has a shorter independent full route. Expose this as research evidence;
  // do not freeze that suboptimal choice as a passing gameplay golden.
  const lowerFirst=result.find(r=>r.arm==='two-heals-lower-first');
  const upperFirst=result.find(r=>r.arm==='two-heals-upper-first');
  const isolated=result.find(r=>r.arm==='two-heals-lower-first-isolated-plans');
  const budgeted=result.find(r=>r.arm==='two-heals-lower-first-budgeted-plans');
  if(!lowerFirst||!upperFirst||!isolated||!budgeted)
   throw Error('missing controlled candidate-order arms');
  const lowerFirstEven=result.find(r=>r.arm==='two-heals-lower-first-even-seed');
  const upperFirstEven=result.find(r=>r.arm==='two-heals-upper-first-even-seed');
  const isolatedEven=result.find(r=>r.arm==='two-heals-lower-first-even-seed-isolated-plans');
  const budgetedEven=result.find(r=>r.arm==='two-heals-lower-first-even-seed-budgeted-plans');
  if(!lowerFirstEven||!upperFirstEven||!isolatedEven||!budgetedEven)
   throw Error('missing even-seed candidate-order arms');
  console.log('PICKUP_ORDER_DIAGNOSTIC '+JSON.stringify({
   lowerFirst:lowerFirst.selectedResource,upperFirst:upperFirst.selectedResource,
   isolated:isolated.selectedResource,budgeted:budgeted.selectedResource,
   exactCosts:lowerFirst.isolatedCosts,
   choiceFlipped:lowerFirst.selectedResource!==upperFirst.selectedResource,
   evenSeed:{lowerFirst:lowerFirstEven.selectedResource,upperFirst:upperFirstEven.selectedResource,
    isolated:isolatedEven.selectedResource,budgeted:budgetedEven.selectedResource,
    choiceFlipped:lowerFirstEven.selectedResource!==upperFirstEven.selectedResource,
    routePlans:{lowerFirst:lowerFirstEven.routePlansDelta,upperFirst:upperFirstEven.routePlansDelta,
     isolated:isolatedEven.routePlansDelta,budgeted:budgetedEven.routePlansDelta}},
   routePlans:{lowerFirst:lowerFirst.routePlansDelta,upperFirst:upperFirst.routePlansDelta,
    isolated:isolated.routePlansDelta,budgeted:budgeted.routePlansDelta}
  }));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
