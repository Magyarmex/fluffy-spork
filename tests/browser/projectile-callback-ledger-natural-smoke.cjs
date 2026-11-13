'use strict';
// Research-only browser smoke. The HTTP response is patched in this test
// context only; neither canonical index.html nor production is modified.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {patchMaterializedCore}=require('../research/projectile-callback-source-patch.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:900,height:700}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  let patches=0;
  try{
    await page.route('http://127.0.0.1:8765/',async route=>{
      const response=await route.fetch(),html=await response.text();
      assert.equal(response.status(),200);
      const patched=patchMaterializedCore(html);
      patches++;
      await route.fulfill({response,body:patched});
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(patches,1,'exactly one shipping HTML response transformed');
    await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,
      '../research/projectile-callback-ledger.cjs'),'utf8')});
    await page.evaluate(()=>{
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      const start=Game.prototype.start,update=Game.prototype.update;
      Game.prototype.start=function(){
        if(!this.__novaDecorativeWorld)window.__novaShotResearchGame=this;
        return start.apply(this,arguments);
      };
      Game.prototype.update=function(){
        if(!this.__novaDecorativeWorld)window.__novaShotResearchGame=this;
        return update.apply(this,arguments);
      };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaShotResearchGame?.status==='playing',
      {timeout:30000});
    const result=await page.evaluate(()=>{
      const g=window.__novaShotResearchGame;
      const factory=window.__novaResearchProjectileCallbackLedger?.createProjectileCallbackLedger;
      if(typeof factory!=='function')throw Error('browser ledger missing');
      g.setPaused(true);
      if(g.raf){cancelAnimationFrame(g.raf);g.raf=0;}
      const ledger=factory(g,{limit:4096});
      ledger.install();
      g.__novaShotLedger=ledger;
      let frames=0,callbacks=0,scopedCalls=0,unusedScopes=0,observerErrors=0,unknown=0,unidentifiedTargets=0;
      const frameMs=[];
      for(let i=0;i<60&&g.status==='playing';i++){
        g.update(1/30);
        const s=ledger.counters();
        frames++;callbacks+=s.eventsCaptured;scopedCalls+=s.scopedCalls;
        unusedScopes+=s.unusedScopes;observerErrors+=s.observerErrors;\n        unknown+=s.unknown;unidentifiedTargets+=s.unidentifiedTargets;
        if(s.overflow)throw Error('research callback buffer overflow');
        ledger.nextFrame();
      }
      delete g.__novaShotLedger;
      if(!ledger.uninstall())throw Error('failed to restore real damage methods');
      return{frames,callbacks,scopedCalls,unusedScopes,observerErrors,status:g.status,
        time:g.time};
    });
    assert.ok(result.frames>=1,'real composed game must advance');
    assert.equal(result.observerErrors,0,'observer must not fail in natural gameplay');
    assert.ok(Number.isFinite(result.time));\n    assert.ok(Number.isFinite(result.p95FrameMs),'browser frame-time sample required');
    assert.deepEqual(errors,[],'no browser runtime exceptions');
    console.log(JSON.stringify({research:'shot-ledger-browser-smoke',...result}));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
