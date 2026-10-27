'use strict';
// Real React/Chromium acceptance for Tactical Frontlines: no mock engine,
// no fake visibility API and no detached overlay-only render.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaFrontlineGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFrontlineGame?.status==='playing'&&
    !!window.__novaFrontlineGame.__lfState,{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaFrontlineGame,T=window.__NOVA_LIVING_FRONT_TEST__;
   g.setPaused(true);
   const p=g.player,e=g.tanks.find(t=>t!==p&&!t.isPlayer);
   if(!p||!e||!T)throw Error('canonical player/enemy/Frontlines API missing');
   p.hp=Math.max(100,p.hp);p.alive=true;p.spawnShieldT=0;
   e.hp=Math.max(100,e.hp);e.alive=true;e.spawnShieldT=0;
   let found=false;
   for(let iy=0;iy<6&&!found;iy++)for(let ix=0;ix<6&&!found;ix++){
    const x=-1000+ix*180,y=-1000+iy*180,ex=x+40,ey=y+20;
    if(g.isTerrainSafe&&(!g.isTerrainSafe(x,y,20)||!g.isTerrainSafe(ex,ey,20)))continue;
    if(!g.hasLineOfSight(x,y,ex,ey,2))continue;
    p.x=x;p.y=y;e.x=ex;e.y=ey;found=true;
   }
   if(!found)throw Error('no real terrain-safe visible pair in BLOOM sector 5');
   g.cam.x=p.x;g.cam.y=p.y;
   const st=g.__lfState,now=g.time;
   st.signal=null;st.bloomMemory={sector:5,announcedAt:now-7,until:now+17,initialValue:500};
   st.sectors[5].value=500;
   const visible=T.contestCandidate(g,st);
   if(!visible)throw Error('real Battlefield LOS/viewport does not certify chosen pair');
   if(!T.updateContest(g,st))throw Error('certified contest was not emitted');
   const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
   if(!LF.frontlineTick(g,st,true))throw Error('real Frontlines telemetry did not activate');
   const snap=window.NOVALivingFront.snapshot();
   if(!snap.frontline||snap.frontline.counts.observedContests!==1||snap.frontline.counts.playerEntries!==1)
    throw Error('real shipping telemetry did not record witnessed contest');
   if(!window.NOVALivingFront.diagnostics().includes('observed-contest'))
    throw Error('COPY ECOLOGY omits chronological Frontlines trace');
   g.drawMinimap();
   const ctx=g.mmCtx,S=216;
   const withContest=new Uint8Array(ctx.getImageData(0,0,S,S).data);
   st.contestSignal=null;
   g.drawMinimap();
   const withoutContest=ctx.getImageData(0,0,S,S).data;
   let changed=0;for(let i=0;i<withContest.length;i++)if(withContest[i]!==withoutContest[i])changed++;
   if(changed<100)throw Error('real shipping minimap did not visibly render CONTESTED: '+changed);
   e.alive=false;
   if(T.updateContest(g,st))throw Error('dead opponent still creates contest');
   e.alive=true;st.bloomMemory.until=now-1;
   if(T.contestCandidate(g,st))throw Error('expired memory still creates live contact');
   return{changedChannels:changed,publicMemoryTTL:24,liveSignalExpired:true,
     realFairEngagement:!!window.__NOVA_FAIR_ENGAGEMENT_TEST__,
     realBattlefieldLOS:typeof g.hasLineOfSight==='function'};
  });
  assert.equal(errors.length,0,errors.join('\n'));
  const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'tactical-frontlines-memory.png')});
  await page.setViewportSize({width:320,height:568});
  const mobile=await page.evaluate(()=>{
   const g=window.__novaFrontlineGame,T=window.__NOVA_LIVING_FRONT_TEST__;
   const st=g.__lfState,now=g.time;
   g.w=320;g.h=568;g.cam.x=g.player.x;g.cam.y=g.player.y;
   st.signal=null;st.bloomMemory={sector:5,announcedAt:now-7,until:now+17,initialValue:500};
   st.sectors[5].value=500;
   if(!T.updateContest(g,st))throw Error('320px viewport lost a physically visible local contest');
   g.drawMinimap();
   const S=216,ctx=g.mmCtx,withSignal=new Uint8Array(ctx.getImageData(0,0,S,S).data);
   st.contestSignal=null;g.drawMinimap();
   const without=ctx.getImageData(0,0,S,S).data;
   let changed=0;for(let i=0;i<withSignal.length;i++)if(withSignal[i]!==without[i])changed++;
   if(changed<100)throw Error('320px portrait lost CONTESTED minimap signal: '+changed);
   return{viewport:320,changedChannels:changed};
  });
  await page.screenshot({path:path.join(dir,'tactical-frontlines-mobile.png')});
  await page.evaluate(()=>{
   const g=window.__novaFrontlineGame,T=window.__NOVA_LIVING_FRONT_TEST__;
   T.updateContest(g,g.__lfState);g.drawMinimap();
   // Screenshot-only: uncover the paused game without changing simulation state.
   for(const el of document.querySelectorAll('div.fixed.inset-0'))
    if(/PAUSED|INITIALIZING CHASSIS/.test(el.textContent||''))el.style.display='none';
  });
  await page.screenshot({path:path.join(dir,'tactical-frontlines-mobile-visible.png')});
  console.log('NOVA_FRONTLINES_REAL_BROWSER '+JSON.stringify(result));
  console.log('NOVA_FRONTLINES_MOBILE_BROWSER '+JSON.stringify(mobile));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
