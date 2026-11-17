'use strict';
// Exact materialized 49-overlay AI path: visible spawn-protected rivals can
// contest public heals even when Fair Engagement has no legal combat target.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaNoTargetPickupGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaNoTargetPickupGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaNoTargetPickupGame;
   g.setPaused(true);
   const ai=window.__novaMakeRequire('')('game/ai');
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const rival=g.tanks.find(t=>t&&t!==bot&&t.alive&&!t.isPlayer);
   if(!bot||!rival||typeof ai?.updateAI!=='function')
    throw Error('composed Game/AI or rival missing');
   const originals={tanks:g.tanks,powerups:g.powerups,bullets:g.bullets,
    los:g.hasLineOfSight,speed:g.tankSpeed,w:g.w,h:g.h};
   const ownSpeed=Object.prototype.hasOwnProperty.call(g,'tankSpeed');
   const ownLos=Object.prototype.hasOwnProperty.call(g,'hasLineOfSight');
   const botState={...bot},rivalState={...rival},botAI=bot.ai;
   try{
    Object.assign(bot,{x:0,y:0,hp:20,maxHp:100,alive:true,isPlayer:false});
    bot.ai={...botAI,__v181Think:0,__v1112NextThink:0,
     __v1112TargetId:-1,__v1105TargetId:-1,__v180TargetId:-1,targetId:-1};
    Object.assign(rival,{x:100,y:0,alive:true,isPlayer:false,spawnShieldT:2});
    g.tanks=[bot,rival];g.powerups=[
     {id:990091,type:'heal',x:100,y:0},
     {id:990092,type:'heal',x:-120,y:0}
    ];
    g.bullets=[];g.w=1000;g.h=800;
    g.hasLineOfSight=()=>true;g.tankSpeed=()=>200;
    ai.updateAI(bot,g,1/60);
    const result={target:bot.ai.__v1112TargetId,
     mode:bot.ai.__v181Mode,pickup:bot.ai.__v181ResourceId,
     restored:g.tanks.length===2};
    if(result.target!==-1||result.mode!=='resource'||result.pickup!==990092)
     throw Error('composed no-target heal contest failed: '+JSON.stringify(result));
    return result;
   }finally{
    Object.assign(bot,botState);bot.ai=botAI;
    Object.assign(rival,rivalState);
    g.tanks=originals.tanks;g.powerups=originals.powerups;g.bullets=originals.bullets;
    g.w=originals.w;g.h=originals.h;
    if(ownLos)g.hasLineOfSight=originals.los;else delete g.hasLineOfSight;
    if(ownSpeed)g.tankSpeed=originals.speed;else delete g.tankSpeed;
   }
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  console.log('NOVA_NO_TARGET_PUBLIC_HEAL '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
