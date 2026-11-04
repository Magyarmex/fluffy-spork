'use strict';
// Research-only: sustained Tempest firing in the actual composed browser Game.
// This measures real browser work; it does NOT certify Android or input-to-photon.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  const observations=[];
  for(const fixed60 of [false,true]){
   const context=await browser.newContext({viewport:{width:800,height:600}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   const cdp=await context.newCDPSession(page);
   try{
    await page.goto(origin+(fixed60?'?nova_fixed60=pilot':''),{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:20000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const original=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaCombatBenchGame=this;
      return original.apply(this,arguments);
     };
    });
    await deploy.click();
    await page.waitForFunction(expected=>{
     const g=window.__novaCombatBenchGame;
     return !!g && g.status==='playing' &&
      (expected?g.__novaFixed60Pilot?.owner.ticks>5:!!g.raf);
    },fixed60,{timeout:20000});
    await page.evaluate(()=>{
     const g=window.__novaCombatBenchGame;
     g.setClass(g.player,'tempest');
     g.player.stats.reload=8;
     g.player.perk='alacrity';
     g.useAbility(g.player);
     g.player.hp=1000000; // prevent an unrelated AI kill from censoring the trial
     g.input.aim.active=true;
     g.input.aim.dx=40;
     g.input.aim.dy=0;
     g.input.firing=true;
     g.input.autofire=false;
     const m=window.__novaCombatBench={
      updates:0,simMs:0,updateWorkMs:0,projectiles:0,fireCalls:0,
      frameGaps:[],lastFrame:null,frames:0,active:true
     };
     const update=g.update,fire=g.tryFire;
     g.update=function(dt){
      const t=performance.now();
      try{return update.apply(this,arguments)}
      finally{m.updates++;m.simMs+=dt*1000;m.updateWorkMs+=performance.now()-t}
     };
     g.tryFire=function(tank){
      const before=this.bullets.length;
      try{return fire.apply(this,arguments)}
      finally{if(tank===this.player){
       m.fireCalls++;m.projectiles+=Math.max(0,this.bullets.length-before);
      }}
     };
     const frame=at=>{
      if(!m.active)return;
      if(m.lastFrame!==null)m.frameGaps.push(at-m.lastFrame);
      m.lastFrame=at;m.frames++;
      requestAnimationFrame(frame);
     };
     requestAnimationFrame(frame);
    });
    for(const throttle of [1,3]){
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
     const before=await page.evaluate(()=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      return {updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       gaps:m.frameGaps.length,ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0};
     });
     const wallStart=Date.now();
     await page.waitForTimeout(3000);
     const wallMs=Date.now()-wallStart;
     const after=await page.evaluate(()=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      return {updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       gaps:m.frameGaps.length,ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0,
       frameGaps:m.frameGaps.slice(-240)};
     });
     const delta=(k)=>after[k]-before[k];
     const gaps=after.frameGaps.slice(Math.max(0,before.gaps-(after.gaps-after.frameGaps.length)));
     const sorted=gaps.slice().sort((a,b)=>a-b);
     const p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null;
     const result={fixed60,throttle,wallMs,updates:delta('updates'),
      simulatedMs:delta('simMs'),updateWorkMs:delta('work'),
      projectiles:delta('projectiles'),fireCalls:delta('fireCalls'),
      frames:delta('frames'),frameGapP95Ms:p95,droppedMs:delta('droppedMs'),
      ticks:delta('ticks')};
     assert.ok(result.updates>0 && result.simulatedMs>0 &&
      Number.isFinite(result.updateWorkMs),'real combat must advance');
     assert.ok(result.fireCalls>0,'Tempest must attempt to fire in real browser Game');
     if(fixed60)assert.equal(await page.evaluate(()=>window.__novaCombatBenchGame.raf||0),0,
      'fixed60 must never coexist with production RAF');
     observations.push(result);
    }
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    await page.evaluate(()=>{
     window.__novaCombatBench.active=false;
     window.__novaCombatBenchGame.destroy();
    });
    assert.deepEqual(errors,[],'combat browser errors: '+errors.join('; '));
   }finally{
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
    await context.close();
   }
  }
  console.log('NOVA_FIXED60_SUSTAINED_COMBAT '+JSON.stringify(observations));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
