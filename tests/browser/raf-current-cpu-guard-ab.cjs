'use strict';
/* PR #869 research-only browser A/B. Real composed React/Game, trusted
 * Chromium touch, actual CPU throttling and shipping telemetry. This does
 * not emulate a particular Android phone or prove touch-to-photon latency. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const guarded='priorWork < 18 && earlierWork < 18 && performance.now() - workStart < Math.min(32, Math.max(18, elapsed * 500 - 2))) {';
const shipping='priorWork < 18 && earlierWork < 18) {';
assert.equal(html.split(guarded).length-1,1,'PR materializer must install one CPU guard');
const arms={shipping:html.replace(guarded,shipping),candidate:html};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const results=[];
 try{
  for(const name of ['shipping','candidate']){
   const context=await browser.newContext({viewport:{width:320,height:700},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(route.request().isNavigationRequest()&&u.pathname==='/')
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:arms[name]});
     return route.continue();
    });
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const requireNova=window.__novaMakeRequire('');
     const Game=requireNova('game/engine').Game;
     const renderModule=requireNova('game/render');
     const update=Game.prototype.update,fire=Game.prototype.tryFire;
     const originalRender=renderModule.render;
     window.__novaCpuAb={volleys:0,birthAt:null,touches:[],game:null,
      frameIndex:0,spikedFrame:-1,inject:false,spikes:0,outerUpdateMs:[],startAt:null,startGameTime:null};
     renderModule.render=function(g,...args){
      const out=originalRender.call(this,g,...args);
      if(g===window.__novaCpuAb.game)window.__novaCpuAb.frameIndex++;
      return out;
     };
     Game.prototype.update=function(...args){
      const outerStart=performance.now();
      if(!this.__novaDecorativeWorld){
       const s=window.__novaCpuAb;s.game=this;
       if(s.inject&&s.frameIndex%10===9&&s.spikedFrame!==s.frameIndex){
        s.spikedFrame=s.frameIndex;s.spikes++;
        const until=performance.now()+30;
        while(performance.now()<until){} // controlled current-update CPU spike
       }
      }
      const result=update.apply(this,args);
      if(!this.__novaDecorativeWorld&&window.__novaCpuAb.inject)
       window.__novaCpuAb.outerUpdateMs.push(performance.now()-outerStart);
      return result;
     };
     Game.prototype.tryFire=function(t,...args){
      const before=this.bullets.length,result=fire.call(this,t,...args);
      if(!this.__novaDecorativeWorld&&t===this.player&&this.bullets.length>before){
       window.__novaCpuAb.volleys++;
       if(window.__novaCpuAb.birthAt===null)window.__novaCpuAb.birthAt=performance.now();
      }
      return result;
     };
     document.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch')window.__novaCpuAb.touches.push({
       at:performance.now(),trusted:e.isTrusted,type:e.type});
     },{capture:true,passive:true});
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    const canvas=page.locator('canvas.absolute.inset-0');
    await canvas.waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(()=>window.__novaCpuAb?.game?.status==='playing',null,{timeout:30000});
    await page.evaluate(()=>{
     const g=window.__novaCpuAb.game,p=g.player;
     g.sfx.muted=true;g.setClass(p,'minigun');p.level=Math.max(p.level,30);
     p.stats.reload=1;p.spawnShieldT=20;p.fireCd=0;
     g.input.autofire=false;window.__novaCpuAb.volleys=0;
     window.__novaCpuAb.birthAt=null;window.__novaCpuAb.touches.length=0;
     window.__novaCpuAb.frameIndex=0;window.__novaCpuAb.spikedFrame=-1;
     window.__novaCpuAb.spikes=0;window.__novaCpuAb.outerUpdateMs.length=0;
     window.__novaCpuAb.startAt=performance.now();
     window.__novaCpuAb.startGameTime=g.time;window.__novaCpuAb.inject=true;
    });
    const box=await canvas.boundingBox();
    assert.ok(box&&box.width>200);
    const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,id:42,radiusX:1,radiusY:1,force:1};
    const extended={...origin,x:origin.x+30,y:origin.y-20};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[extended]});
    await page.waitForTimeout(5500);
    const metrics=await page.evaluate(()=>{
     const s=window.__novaCpuAb,g=s.game;
     return {volleys:s.volleys,birthAt:s.birthAt,touches:s.touches.slice(),
      gameTime:g.time,gameDelta:g.time-s.startGameTime,
      windowMs:performance.now()-s.startAt,
      outerUpdateP95Ms:(()=>{const a=s.outerUpdateMs.slice().sort((x,y)=>x-y);
       return a.length?a[Math.ceil(a.length*.95)-1]:null;})(),
      perf:window.__NOVA_PERF_LAST__||null,
      aimActive:g.input.aim.active,aimOwner:g.input.stickId.aim,
      firing:g.input.firing,spikes:s.spikes,renderedFrames:s.frameIndex};
    });
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(metrics.volleys>0,'trusted held touch must fire actual Minigun');
    assert.ok(metrics.spikes>0,'real composed Game must receive controlled CPU spikes');
    assert.ok(metrics.touches.some(t=>t.trusted),'CDP touch must arrive trusted');
    assert.ok(metrics.aimActive&&metrics.firing,'live right stick must own firing');
    assert.ok(Number.isFinite(metrics.gameTime)&&metrics.gameTime>0);
    assert.deepEqual(errors,[],'browser Game must not throw');
    results.push({arm:name,volleys:metrics.volleys,gameTime:metrics.gameTime,
     observationGameDelta:metrics.gameDelta,observationWindowMs:metrics.windowMs,
     outerUpdateP95Ms:metrics.outerUpdateP95Ms,
     injectedSpikes:metrics.spikes,renderedFrames:metrics.renderedFrames,
     touchToFirstBirthMs:metrics.birthAt-metrics.touches[0].at,
     perf:metrics.perf&&{
      fps:metrics.perf.fps,frameP95Ms:metrics.perf.frameP95Ms,
      simulationPacePct:metrics.perf.simulationPacePct,
      simulationHz:metrics.perf.simulationHz,updateP95Ms:metrics.perf.updateP95Ms,
      renderP95Ms:metrics.perf.renderP95Ms},touchTrusted:true});
   }finally{await context.close();}
  }
  console.log('RAF_CPU_GUARD_CHROMIUM_AB '+JSON.stringify({cpuThrottle:4,
   viewport:'320x700',holdMs:5500,results,
   limitations:['not counterbalanced','not a fixed 20Hz schedule',
    'shipping performance snapshot is rolling and not observation-window aligned',
    'not physical Android','not GPU presentation or photon latency']}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
