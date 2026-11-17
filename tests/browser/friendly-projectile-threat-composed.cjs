'use strict';
// Actual 49-overlay Game.tryFire birth witness and Battle Sense flank choice.
// Controlled team fixture; does not estimate natural team-match incidence.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaFriendlyProjectileGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFriendlyProjectileGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaFriendlyProjectileGame;
   g.setPaused(true);
   const observer=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const shooter=g.tanks.find(t=>t&&t.ai&&!t.isPlayer&&t!==observer);
   const helper=window.__NOVA_BATTLE_SENSE_TEST__;
   if(!observer||!shooter||typeof helper?.saferSide!=='function')
    throw Error('missing composed Game bots or Battle Sense');
   const original={bullets:g.bullets,w:g.w,h:g.h,cam:g.cam,los:g.hasLineOfSight,
    allies:g.areAllies,hostile:g.areHostile,player:g.player};
   const own={};
   for(const k of ['hasLineOfSight','areAllies','areHostile'])own[k]=Object.prototype.hasOwnProperty.call(g,k);
   const a={...observer},b={...shooter};
   try{
    Object.assign(observer,{x:0,y:0,alive:true,teamId:7});
    Object.assign(shooter,{x:80,y:115,angle:0,alive:true,teamId:7,
     cls:'basic',fireCd:0,overheatT:0,spawnShieldT:0});
    g.w=320;g.h=480;g.cam={...(g.cam||{}),zoom:1};
    g.hasLineOfSight=()=>true;
    g.areAllies=(x,y)=>x.teamId!=null&&y.teamId!=null&&x.teamId===y.teamId;
    g.areHostile=(x,y)=>!g.areAllies(x,y);
    g.bullets=[];
    const fire=()=>{shooter.fireCd=0;g.tryFire(shooter);const shot=g.bullets.at(-1);
     if(!shot||shot.ownerId!==shooter.id)throw Error('real Game.tryFire did not create expected shot');
     Object.assign(shot,{x:110,y:115,vx:0,vy:0,ttl:1,dead:false});
     return shot;};
    const baseline=helper.saferSide(g,observer,1,0);
    fire();const allied=helper.saferSide(g,observer,1,0);
    g.bullets=[];shooter.teamId=9;fire();
    const hostile=helper.saferSide(g,observer,1,0);
    if(baseline!==0||allied!==0||hostile!==-1)
     throw Error('composed friendly-fire threat contract failed: '+JSON.stringify({baseline,allied,hostile}));
    return {baseline,allied,hostile};
   }finally{
    Object.assign(observer,a);Object.assign(shooter,b);
    g.bullets=original.bullets;g.w=original.w;g.h=original.h;g.cam=original.cam;g.player=original.player;
    for(const k of ['hasLineOfSight','areAllies','areHostile']){
     if(own[k])g[k]=original[k];else delete g[k];
    }
   }
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  console.log('NOVA_FRIENDLY_PROJECTILE_COMPOSED '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
