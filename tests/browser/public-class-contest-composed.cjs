'use strict';
// Composed shipping-game acceptance: a visible rival's hidden speed upgrades
// cannot influence pickup scoring, even with an eligible combat target.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaPublicContestGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaPublicContestGame?.status==='playing',{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaPublicContestGame;g.setPaused(true);
   const h=window.__NOVA_BATTLE_SENSE_TEST__,classes=window.__novaMakeRequire('')('game/classes');
   const bot=g.tanks.find(t=>t?.ai&&!t.isPlayer);
   if(!h?.resourceContest||!h?.chooseResource||!bot||!classes.CLASSES.guard)throw Error('missing materialized game owners');
   const saved={tanks:g.tanks,contacts:g.__novaFairVisibleTanks,powerups:g.powerups,los:g.hasLineOfSight,speed:g.tankSpeed};
   const original={...bot};let privateReads=0;
   try{
    Object.assign(bot,{id:700001,cls:'guard',x:0,y:0,alive:true,hp:40,maxHp:100,hasteT:0});
    const rival={id:700002,cls:'guard',x:200,y:0,alive:true,stats:{speed:0},vx:0,vy:0};
    const contested={id:'contested',type:'heal',x:300,y:0};
    const safe={id:'safe',type:'heal',x:0,y:600};
    g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;
    g.powerups=[contested,safe];g.hasLineOfSight=()=>true;
    g.tankSpeed=t=>{if(t===rival){privateReads++;throw Error('private rival speed read');}return saved.speed.call(g,t);};
    const baseline=h.resourceContest(g,bot,contested,300,classes);
    const choice=h.chooseResource(g,bot,classes)?.id;
    rival.stats.speed=8;rival.perk='speed';rival.hasteT=10;
    const boosted=h.resourceContest(g,bot,contested,300,classes);
    const boostedChoice=h.chooseResource(g,bot,classes)?.id;
    if(privateReads||Math.abs(baseline-boosted)>1e-10||choice!==boostedChoice)
     throw Error('private rival upgrades changed the composed pickup decision');
    rival.cls='scout';
    const publicClass=h.resourceContest(g,bot,contested,300,classes);
    if(!(publicClass>baseline))throw Error('public class speed did not affect contest');
    return {baseline,boosted,choice,boostedChoice,publicClass,privateReads};
   }finally{
    Object.assign(bot,original);g.tanks=saved.tanks;g.__novaFairVisibleTanks=saved.contacts;
    g.powerups=saved.powerups;g.hasLineOfSight=saved.los;g.tankSpeed=saved.speed;
   }
  });
  if(errors.length)throw Error('browser page errors '+JSON.stringify(errors));
  console.log('PUBLIC_CLASS_CONTEST_COMPOSED '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
