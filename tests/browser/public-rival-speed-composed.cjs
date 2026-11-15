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
   const saved={tanks:g.tanks,visible:g.__novaFairVisibleTanks,los:g.hasLineOfSight,speed:g.tankSpeed};
   const original={...bot};let privateCalls=0;
   try{
    Object.assign(bot,{id:700001,cls:'guard',x:0,y:0,alive:true,stats:{...bot.stats,speed:0}});
    const rival={id:700002,cls:'guard',x:150,y:0,alive:true,stats:{speed:0},vx:0,vy:0};
    const pickup={id:'heal',type:'heal',x:300,y:0};
    g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;g.hasLineOfSight=()=>true;
    g.tankSpeed=t=>{if(t===rival){privateCalls++;throw Error('hidden rival tankSpeed called');}return saved.speed.call(g,t);};
    const baseline=h.resourceContest(g,bot,pickup,300,classes);
    rival.stats.speed=8;rival.perk='speed';rival.hasteT=10;
    const hiddenChanged=h.resourceContest(g,bot,pickup,300,classes);
    if(Math.abs(baseline-hiddenChanged)>1e-10||privateCalls)throw Error('hidden stat changed pickup contest');
    rival.cls='scout';
    const classChanged=h.resourceContest(g,bot,pickup,300,classes);
    if(!(classChanged>baseline))throw Error('public class mobility not respected');
    return {baseline,hiddenChanged,classChanged,privateCalls};
   }finally{
    Object.assign(bot,original);g.tanks=saved.tanks;g.__novaFairVisibleTanks=saved.visible;
    g.hasLineOfSight=saved.los;g.tankSpeed=saved.speed;
   }
  });
  if(errors.length)throw Error('page errors '+JSON.stringify(errors));
  console.log('PUBLIC_RIVAL_SPEED_COMPOSED '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
