'use strict';
// #799 research: browser-trusted short right-stick pulses under two CPU rates.
// Records delivered pointer edges, real Game.update fire samples and projectile
// births. It does NOT measure physical touch, photon latency or device FPS.
// Do not assert a particular loss rate from shared-runner timing.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const update=Game.prototype.update,fire=Game.prototype.tryFire;
   window.__novaPulseWitness={trial:-1,events:[],samples:[],births:[]};
   Game.prototype.update=function(...args){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing'){
     window.__novaPulseGame=this;
     const w=window.__novaPulseWitness;
     w.samples.push({trial:w.trial,at:performance.now(),held:!!this.input.firing});
    }
    return update.apply(this,args);
   };
   Game.prototype.tryFire=function(t,...args){
    const n=this.bullets.length,result=fire.call(this,t,...args);
    if(!this.__novaDecorativeWorld&&t&&t.isPlayer&&this.bullets.length>n){
     const w=window.__novaPulseWitness;
     w.births.push({trial:w.trial,at:performance.now()});
    }
    return result;
   };
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch'){
      const w=window.__novaPulseWitness;
      w.events.push({trial:w.trial,type,at:performance.now(),trusted:e.isTrusted});
     }
    },{capture:true,passive:true});
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.waitForFunction(()=>window.__novaPulseGame?.status==='playing',null,{timeout:20000});
  const rect=await canvas.boundingBox();
  assert.ok(rect&&rect.width>200&&rect.height>200);
  const origin={x:rect.x+rect.width*.72,y:rect.y+rect.height*.68,
   id:41,radiusX:1,radiusY:1,force:1};
  const extended={...origin,x:origin.x+Math.min(35,rect.width*.12),y:origin.y-30};
  const cdp=await context.newCDPSession(page);
  const summary=[];
  for(const rate of [1,4]){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate});
   for(let trial=0;trial<8;trial++){
    const id=summary.length;
    await page.evaluate(i=>{
     const g=window.__novaPulseGame,w=window.__novaPulseWitness;
     assertGame(g);
     w.trial=i;
     g.input.autofire=false;
     g.player.spawnShieldT=20;
     g.player.fireCd=0;
     function assertGame(game){
      if(!game||game.status!=='playing'||!game.player)throw Error('player no longer active');
     }
    },id);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[extended]});
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(110);
    const result=await page.evaluate(i=>{
     const w=window.__novaPulseWitness,g=window.__novaPulseGame;
     const events=w.events.filter(e=>e.trial===i);
     const samples=w.samples.filter(s=>s.trial===i);
     const births=w.births.filter(b=>b.trial===i);
     return {events,sampleCount:samples.length,
      heldSamples:samples.filter(s=>s.held).length,
      births:births.length,stuckAim:!!g.input.aim.active,
      gameStatus:g.status};
    },id);
    assert.ok(result.events.some(e=>e.type==='pointerdown'));
    assert.ok(result.events.some(e=>e.type==='pointermove'));
    assert.ok(result.events.some(e=>e.type==='pointerup'));
    assert.ok(result.events.every(e=>e.trusted),'CDP events must be browser-trusted');
    assert.equal(result.stuckAim,false,'touch release must clear right-stick aim');
    assert.equal(result.gameStatus,'playing');
    const down=result.events.find(e=>e.type==='pointerdown');
    const move=result.events.find(e=>e.type==='pointermove');
    const up=result.events.find(e=>e.type==='pointerup');
    assert.ok(down.at<=move.at&&move.at<=up.at);
    summary.push({rate,trial,deliveredHoldMs:+(up.at-move.at).toFixed(2),
     samples:result.sampleCount,heldSamples:result.heldSamples,births:result.births});
   }
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  assert.deepEqual(errors,[],'real composed game must not throw');
  for(const rate of [1,4]){
   const rows=summary.filter(x=>x.rate===rate);
   console.log('NOVA_TRUSTED_SHORT_TOUCH_CPU_CENSUS '+JSON.stringify({
    cpuThrottle:rate,attempts:rows.length,
    deliveredHeldWithoutUpdate:rows.filter(x=>x.heldSamples===0).length,
    deliveredHeldWithoutProjectile:rows.filter(x=>x.births===0).length,
    deliveredHoldMs:rows.map(x=>x.deliveredHoldMs),
    samples:rows.map(x=>x.heldSamples),births:rows.map(x=>x.births),
    caveat:'Chromium/CDP browser-trusted touch; not a physical Android trial, fixed 40ms request is not guaranteed delivery duration'
   }));
  }
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
