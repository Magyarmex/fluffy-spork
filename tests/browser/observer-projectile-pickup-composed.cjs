'use strict';
// Composed 49-overlay Game acceptance for observer-visible projectile risk.
// Controlled pickup/projectile fixture, not natural-match incidence.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaProjectileWitnessGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaProjectileWitnessGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaProjectileWitnessGame;
   g.setPaused(true);
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const choose=window.__NOVA_BATTLE_SENSE_TEST__?.chooseResource;
   const fair=window.__NOVA_FAIR_ENGAGEMENT__;
   const classes=window.__novaMakeRequire('')('game/classes');
   if(!bot||typeof choose!=='function'||typeof fair?.inGameplayWorldPoint!=='function')
    throw Error('missing composed Game, Battle Sense or Fair Engagement');
   const originals={w:g.w,h:g.h,cam:g.cam,los:g.hasLineOfSight,bullets:g.bullets,
    powerups:g.powerups,tanks:g.tanks,visibleTanks:g.__novaFairVisibleTanks};
   const state={...bot},ai={...bot.ai};
   const results=[];
   try{
    Object.assign(bot,{id:700007,cls:'guard',x:0,y:0,hp:20,maxHp:100,alive:true});
    bot.ai={...ai};g.tanks=[bot];g.__novaFairVisibleTanks=[bot];g.cam={...(g.cam||{}),zoom:1};
    g.hasLineOfSight=()=>true;
    // Public pickup coordinates are allowed outside the observer viewport.
    const near={id:'near',type:'heal',x:600,y:0},far={id:'far',type:'heal',x:620,y:0};
    g.powerups=[near,far];
    const bullet={id:bot.id,ownerId:999,x:600,y:20,vx:0,vy:0,ttl:1};
    const departing={...bullet,vx:500,ttl:10};
    const slow={...bullet,y:0,vx:50,ttl:10};
    const special={...departing,y:0,shell:true};
    // Research-only negative control: legal Minigun-class stream. Do not freeze its choice as desirable.
    const gunSpeed=classes.CLASSES.minigun.bullet.speed;
    const minigunTrain=[0,.15,.30].map((age,i)=>({...bullet,id:9000+i,x:600+gunSpeed*age,y:0,vx:gunSpeed,vy:0,ttl:10}));
    for(const [label,w,h,zoom,bullets,occluded,expected] of [
     ['portrait-baseline',320,480,1,[],false,'near'],
     ['portrait-unseen',320,480,1,[bullet],false,'near'],
     ['landscape-unseen',480,320,1,[bullet],false,'near'],
     ['wide-visible',1600,900,1,[bullet],false,'far'],
     ['wide-departing',1600,900,1,[departing],false,'near'],
     ['wide-slow',1600,900,1,[slow],false,'far'],
     ['wide-special',1600,900,1,[special],false,'far'],
     ['zoom-out-visible',900,700,.7,[bullet],false,'far'],
     ['zoom-in-unseen',900,700,1.2,[bullet],false,'near'],
     ['wide-terrain-hidden',1600,900,1,[bullet],true,'near'],
     ['research-single-shot-offlane',1600,900,1,[minigunTrain[0]],false,null],
     ['research-minigun-stream',1600,900,1,minigunTrain,false,null],
     ['research-minigun-stream-prethreshold',1600,900,1,minigunTrain,false,null],
     ['research-minigun-stream-nearby',1600,900,1,minigunTrain,false,null],
    ]){
     g.w=w;g.h=h;g.cam.zoom=zoom;g.bullets=bullets;
     bot.x=label==='research-minigun-stream-nearby'?336:label==='research-minigun-stream-prethreshold'?334:0;bot.y=0;
     if(label.startsWith('research-')){bot.vx=0;bot.vy=0;bot.hasteT=0;bot.perk=null;bot.gene=null;bot.stats={...bot.stats,speed:0};}
     // Only the observational volley arm compares a same-distance off-lane heal.
     const safeHeal={id:'safe',type:'heal',x:600,y:220};
     g.powerups=label.startsWith('research-')?[near,safeHeal]:[near,far];
     g.hasLineOfSight=occluded?(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===bullet.x&&by===bullet.y):()=>true;
     const observed=fair.inGameplayWorldPoint(g,bot,bullet.x,bullet.y);
     const selected=choose(g,bot,classes)?.id||null;
     const modelArrival=Math.max(0,Math.hypot(near.x-bot.x,near.y-bot.y)-50)/(124*1.18*(1+.045*8)*1.45*1.9*1.14*1.10);
     const diagnostic=label.startsWith('research-')?{observerX:bot.x,modelArrival,bulletCount:bullets.length,bulletSpeed:gunSpeed,baselineRisk:window.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,near.x,near.y,bot.id,bot),projectedRisk:window.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,near.x,near.y,bot.id,bot,modelArrival),offLaneRisk:window.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,safeHeal.x,safeHeal.y,bot.id,bot)}:null;
     results.push({label,w,h,zoom,observed,selected,expected,...(diagnostic||{})});
     if(expected!==null&&selected!==expected)throw Error('wrong composed-game pickup choice: '+JSON.stringify(results.at(-1)));
     if(label.includes('unseen')&&observed)throw Error('fixture bullet unexpectedly visible: '+label);
     if((label==='wide-visible'||label==='zoom-out-visible')&&!observed)throw Error('fixture bullet unexpectedly offscreen');
    }
   // Research-only time series: the same public Minigun projectile grammar,
   // with either one departing round or a shooter that continues replacing it.
   // This exercises the actual composed Battle Sense choice every 0.1s.
   // Bullets are analytically placed; this is NOT a real damage/collision trial.
   const cadence=.15, speed=gunSpeed, birthX=600, samples=[];
   g.w=1600;g.h=900;g.cam.zoom=1;g.hasLineOfSight=()=>true;
   g.powerups=[near,{id:'safe',type:'heal',x:600,y:220}];
   Object.assign(bot,{x:0,y:0,vx:0,vy:0,hasteT:0,perk:null,gene:null,
    stats:{...bot.stats,speed:0}});
   for(const policy of ['single','continuous']){
    for(let step=0;step<=20;step++){
     const elapsed=step*.1;
     const births=policy==='single'?[0]:Array.from(
      {length:Math.floor((elapsed+1e-9)/cadence)+1},(_,i)=>i*cadence);
     g.bullets=births.map((birth,i)=>({
      id:100000+i,ownerId:999,x:birthX+speed*(elapsed-birth),y:0,
      vx:speed,vy:0,ttl:10
     })).filter(b=>b.x<1600);
     const arrival=Math.max(0,Math.hypot(near.x-bot.x,near.y-bot.y)-50)/
      (124*1.18*(1+.045*8)*1.45*1.9*1.14*1.10);
     samples.push({policy,elapsed:Number(elapsed.toFixed(2)),
      active:g.bullets.length,selected:choose(g,bot,classes)?.id||null,
      nearRisk:window.__NOVA_BATTLE_SENSE_TEST__.laneRisk(
       g,near.x,near.y,bot.id,bot,arrival)});
    }
   }
   results.push({label:'research-replenishment-time-series',
    syntheticProjectileMotion:true,realDamageOrCollision:false,samples});
   }finally{
    Object.assign(bot,state);bot.ai=ai;
    Object.assign(g,{w:originals.w,h:originals.h,cam:originals.cam,
     hasLineOfSight:originals.los,bullets:originals.bullets,powerups:originals.powerups,
     tanks:originals.tanks,__novaFairVisibleTanks:originals.visibleTanks});
   }
   return results;
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  if(report.length!==15)throw Error('missing composed-game acceptance or research arms');
  console.log('OBSERVER_PROJECTILE_COMPOSED_GAME '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
