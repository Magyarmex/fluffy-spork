'use strict';
// Real materialized Game: pickup contest must not consume a rival's private upgrade state.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaRivalSpeedGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaRivalSpeedGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaRivalSpeedGame;g.setPaused(true);
   const h=window.__NOVA_BATTLE_SENSE_TEST__,classes=window.__novaMakeRequire('')('game/classes');
   const bot=g.tanks.find(t=>t?.ai&&!t.isPlayer);
   if(!h?.resourceContest||!bot||!classes.CLASSES.guard)throw Error('missing composed source');
   const saved={tanks:g.tanks,visible:g.__novaFairVisibleTanks,powerups:g.powerups,los:g.hasLineOfSight,speed:g.tankSpeed,time:g.time,zoom:g.cam.zoom};
   const original={...bot};let privateCalls=0;
   try{
    Object.assign(bot,{id:700001,cls:'guard',x:0,y:0,alive:true,hp:20,maxHp:100,hasteT:0,stampedeT:0,perk:null,gene:null,stats:{...bot.stats,speed:0}});
    const rival={id:700002,cls:'guard',x:120,y:0,alive:true,stats:{speed:0},vx:0,vy:0};
    const pickup={id:'heal',type:'heal',x:300,y:0};
    g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;g.hasLineOfSight=()=>true;
    g.tankSpeed=t=>{if(t===rival){privateCalls++;throw Error('hidden rival tankSpeed called');}return saved.speed.call(g,t);};
    const baseline=h.resourceContest(g,bot,pickup,300,classes);
    rival.stats.speed=8;rival.perk='speed';rival.hasteT=10;
    const hiddenChanged=h.resourceContest(g,bot,pickup,300,classes);
    if(Math.abs(baseline-hiddenChanged)>1e-10||privateCalls)throw Error('hidden stat changed pickup contest');
    g.powerups=[pickup,{id:'far',type:'heal',x:-480,y:0}];
    const choice=window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot,classes)?.id;
    if(choice!=='heal')throw Error('hidden speed changed healing choice: '+choice);
    rival.cls='scout';
    const classChanged=h.resourceContest(g,bot,pickup,300,classes);
    if(!(classChanged>baseline))throw Error('public class mobility not respected');
    rival.cls='guard';rival.x=120;g.time=0;
    delete bot.ai.__v181RivalSpeedWitness;
    h.resourceContest(g,bot,{x:500,y:0},500,classes);
    g.time=.25;rival.x=165;h.resourceContest(g,bot,{x:500,y:0},500,classes);
    if(bot.ai.__v181RivalSpeedWitness['700002'].confirmed!==1)throw Error('first motion witness was not recorded');
    g.time=.5;rival.x=210;h.resourceContest(g,bot,{x:500,y:0},500,classes);
    g.time=.75;rival.x=255;const witnessed=h.resourceContest(g,bot,{x:500,y:0},500,classes);
    if(bot.ai.__v181RivalSpeedWitness['700002'].confirmed<3)throw Error('three sustained visible intervals were not learned');
    const witnessedState=bot.ai.__v181RivalSpeedWitness;delete bot.ai.__v181RivalSpeedWitness;
    const classOnly=h.resourceContest(g,bot,{x:500,y:0},500,classes);
    bot.ai.__v181RivalSpeedWitness=witnessedState;
    if(!(witnessed>classOnly))throw Error('witnessed movement did not improve identical-position race estimate');
    delete bot.ai.__v181RivalSpeedWitness;
    // Simulate a legitimate relay-only contact: present in fair tactical contacts
    // but beyond this observer's actual gameplay viewport.
    for(const [at,x] of [[.95,2000],[1.15,2036],[1.35,2072]]){
     g.time=at;rival.x=x;h.resourceContest(g,bot,{x:500,y:0},500,classes);
    }
    if(bot.ai.__v181RivalSpeedWitness)throw Error('offscreen relay leaked movement speed');
    // A camera zoom can move the previous sample outside the real viewport
    // while the rival's new position is visible. The old endpoint cannot
    // certify a continuous witnessed speed through that lost visibility.
    const fair=window.__NOVA_FAIR_ENGAGEMENT__;
    if(!fair?.inGameplayWorldPoint||!fair?.inGameplayViewport)throw Error('missing shipping viewport contract');
    g.cam.zoom=1;g.time=2;rival.x=g.w*.475;
    if(!fair.inGameplayViewport(g,bot,rival))throw Error('initial speed sample must be visible');
    h.resourceContest(g,bot,{x:500,y:0},500,classes);
    g.cam.zoom=1.15;g.time=2.25;rival.x-=45;
    if(!fair.inGameplayViewport(g,bot,rival))throw Error('new speed sample must be visible');
    if(fair.inGameplayWorldPoint(g,bot,rival.x+45,0))throw Error('old speed sample must be outside new viewport');
    h.resourceContest(g,bot,{x:500,y:0},500,classes);
    if(bot.ai.__v181RivalSpeedWitness?.['700002']?.confirmed!==0)
     throw Error('off-viewport prior sample incorrectly certified movement');
    if(privateCalls)throw Error('motion inference accessed private speed');
    return {baseline,hiddenChanged,classChanged,privateCalls};
   }finally{
    Object.assign(bot,original);g.tanks=saved.tanks;g.__novaFairVisibleTanks=saved.visible;
    g.powerups=saved.powerups;g.hasLineOfSight=saved.los;g.tankSpeed=saved.speed;g.time=saved.time;g.cam.zoom=saved.zoom;
   }
  });
  if(errors.length)throw Error('page errors '+JSON.stringify(errors));
  console.log('PUBLIC_RIVAL_SPEED_COMPOSED '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
