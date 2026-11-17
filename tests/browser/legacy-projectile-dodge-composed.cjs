'use strict';
// Composed 49-overlay Game/AI witness for the patched legacy projectile owner.
// This checks that Fair Engagement is present when the actual AI wrapper runs;
// it does not equate legacy dodge state with final movement ownership.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaLegacyDodgeGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaLegacyDodgeGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaLegacyDodgeGame,ai=window.__novaMakeRequire('')('game/ai');
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const fair=window.__NOVA_FAIR_ENGAGEMENT__;
   if(!bot||typeof ai?.updateAI!=='function'||typeof fair?.inGameplayWorldPoint!=='function')
    throw Error('missing composed Game, AI, or Fair Engagement');
   g.setPaused(true);
   const original={tanks:g.tanks,bullets:g.bullets,w:g.w,h:g.h,player:g.player,
    los:g.hasLineOfSight,nearestShape:g.nearestShape,nearestTank:g.nearestTank,
    moveTank:g.moveTank};
   const own={};
   for(const k of ['hasLineOfSight','nearestShape','nearestTank','moveTank'])
    own[k]=Object.prototype.hasOwnProperty.call(g,k);
   const botState={...bot},brain=bot.ai,results=[];
   try{
    Object.assign(bot,{x:0,y:0,hp:20,maxHp:100,alive:true,isPlayer:false,level:10});
    g.tanks=[bot];g.player=null;g.w=280;g.h=600;
    g.nearestShape=()=>null;g.nearestTank=()=>null;
    g.moveTank=()=>{};
    for(const [name,x,vx,los] of [
     ['offscreen-incoming',145,-600,true],
     ['visible-departing',100,600,true],
     ['occluded-incoming',100,-600,false],
     ['visible-incoming',100,-600,true]
    ]){
     bot.ai={...brain,thinkT:0,dodgeT:0,dodgeX:0,dodgeY:0,
      __v1112NextThink:0,__v181Think:0,__v180PlanT:0,
      targetId:-1,__v1112TargetId:-1,__v180TargetId:-1};
     g.bullets=[{id:900001,ownerId:900002,x,y:0,vx,vy:0,ttl:1}];
     g.hasLineOfSight=()=>los;
     ai.updateAI(bot,g,1/60);
     const state={name,dodgeT:bot.ai.dodgeT||0,mode:bot.ai.__v181Mode||null,
      state:bot.ai.state||null,visible:fair.inGameplayWorldPoint(g,bot,x,0)};
     results.push(state);
     if(name==='offscreen-incoming'&&state.visible)
      throw Error('offscreen fixture unexpectedly visible');
     if(name==='visible-incoming'&&!state.visible)
      throw Error('incoming fixture unexpectedly offscreen');
    }
   }finally{
    Object.assign(bot,botState);bot.ai=brain;
    g.tanks=original.tanks;g.bullets=original.bullets;g.w=original.w;g.h=original.h;g.player=original.player;
    for(const k of ['hasLineOfSight','nearestShape','nearestTank','moveTank']){
     if(own[k])g[k]=original[k];else delete g[k];
    }
   }
   return results;
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  if(report.length!==4)throw Error('missing composed legacy dodge arms');
  console.log('NOVA_LEGACY_DODGE_COMPOSED '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
