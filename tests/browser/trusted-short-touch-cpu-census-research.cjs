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
   const Input=window.__novaMakeRequire('')('game/input').Input;
   const originalMove=Input.prototype.pm,originalRelease=Input.prototype.pu;
   window.__novaPulseWitness={trial:-1,events:[],samples:[],births:[],inputEdges:[]};
   Input.prototype.pm=function(e){
    const result=originalMove.apply(this,arguments);
    if(e.pointerType==='touch'){
     const w=window.__novaPulseWitness;
     w.inputEdges.push({trial:w.trial,type:'move',armed:!!this.firing,at:performance.now()});
    }
    return result;
   };
   Input.prototype.pu=function(e){
    const result=originalRelease.apply(this,arguments);
    if(e.pointerType==='touch'){
     const w=window.__novaPulseWitness;
     w.inputEdges.push({trial:w.trial,type:'release',armed:!!this.firing,at:performance.now()});
    }
    return result;
   };
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
  // Hold the class constant so a missed projectile is not a class cooldown artifact.
  await page.evaluate(()=>{
   const g=window.__novaPulseGame;
   g.setClass(g.player,'scout');
   g.input.autofire=false;
   g.player.spawnShieldT=20;
  });
  const rect=await canvas.boundingBox();
  assert.ok(rect&&rect.width>200&&rect.height>200);
  const origin={x:rect.x+rect.width*.72,y:rect.y+rect.height*.68,
   id:41,radiusX:1,radiusY:1,force:1};
  const extended={...origin,x:origin.x+Math.min(35,rect.width*.12),y:origin.y-30};
  const cdp=await context.newCDPSession(page);
  const summary=[];
  for(const rate of [1,4]){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate});
   // A 300ms control at each rate distinguishes a broken fixture from missed short pulses.
   for(let trial=0;trial<9;trial++){
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
    // Queue protocol events in order without serial round-trip inflation.
    // The measured DOM move-to-up interval, not this timer, is authoritative.
    const startDelivery=cdp.send('Input.dispatchTouchEvent',
     {type:'touchStart',touchPoints:[origin]});
    const moveDelivery=cdp.send('Input.dispatchTouchEvent',
     {type:'touchMove',touchPoints:[extended]});
    await new Promise(resolve=>setTimeout(resolve,trial===8?300:40));
    const endDelivery=cdp.send('Input.dispatchTouchEvent',
     {type:'touchEnd',touchPoints:[]});
    await Promise.all([startDelivery,moveDelivery,endDelivery]);
    await page.waitForTimeout(110);
    const result=await page.evaluate(i=>{
     const w=window.__novaPulseWitness,g=window.__novaPulseGame;
     const events=w.events.filter(e=>e.trial===i);
     const samples=w.samples.filter(s=>s.trial===i);
     const births=w.births.filter(b=>b.trial===i);
     const inputEdges=w.inputEdges.filter(e=>e.trial===i);
     return {events,inputEdges,sampleCount:samples.length,
      heldSamples:samples.filter(s=>s.held).length,
      births:births.length,stuckAim:!!g.input.aim.active,
      gameStatus:g.status};
    },id);
    assert.ok(result.events.some(e=>e.type==='pointerdown'));
    assert.ok(result.events.some(e=>e.type==='pointerup'));
    assert.ok(result.events.every(e=>e.trusted),'CDP events must be browser-trusted');
    assert.ok(result.inputEdges.some(e=>e.type==='release'&&!e.armed),
     'the real Input owner must observe release and clear firing');
    assert.equal(result.stuckAim,false,'touch release must clear right-stick aim');
    assert.equal(result.gameStatus,'playing');
    const down=result.events.find(e=>e.type==='pointerdown');
    const move=result.events.find(e=>e.type==='pointermove');
    const up=result.events.find(e=>e.type==='pointerup');
    assert.ok(down.at<=up.at,'trusted press must precede release');
    if(move)assert.ok(down.at<=move.at&&move.at<=up.at,
     'delivered deflection must occur within the press');
    summary.push({rate,trial,control:trial===8,
     moveDelivered:!!move,
     pressDurationMs:+(up.at-down.at).toFixed(2),
     deliveredHoldMs:move?+(up.at-move.at).toFixed(2):null,
     inputArmed:result.inputEdges.some(e=>e.type==='move'&&e.armed),
     samples:result.sampleCount,heldSamples:result.heldSamples,births:result.births});
   }
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  assert.deepEqual(errors,[],'real composed game must not throw');
  for(const rate of [1,4]){
   const rows=summary.filter(x=>x.rate===rate&&!x.control);
   const control=summary.find(x=>x.rate===rate&&x.control);
   assert.ok(control,'long control must be recorded');
   if(rate===1){
    assert.ok(control.inputArmed,'normal-speed long control must arm the real Input');
    assert.ok(control.heldSamples>0,'normal-speed long control must reach Game.update');
    assert.ok(control.births>0,'normal-speed long control must produce a real projectile');
   }
   console.log('NOVA_TRUSTED_SHORT_TOUCH_CPU_CENSUS '+JSON.stringify({
    cpuThrottle:rate,attempts:rows.length,
    control:{moveDelivered:control.moveDelivered,
     deliveredHoldMs:control.deliveredHoldMs,
     heldSamples:control.heldSamples,births:control.births},
    missingDeflection:rows.filter(x=>!x.moveDelivered).length,
    inputNotArmed:rows.filter(x=>!x.inputArmed).length,
    armedButUnsampled:rows.filter(x=>x.inputArmed&&x.heldSamples===0).length,
    deliveredHeldWithoutUpdate:rows.filter(x=>x.heldSamples===0).length,
    deliveredHeldWithoutProjectile:rows.filter(x=>x.births===0).length,
    deliveredHoldMs:rows.map(x=>x.deliveredHoldMs),
    pressDurationMs:rows.map(x=>x.pressDurationMs),
    samples:rows.map(x=>x.heldSamples),births:rows.map(x=>x.births),
    caveat:'Chromium/CDP browser-trusted touch; not a physical Android trial, fixed 40ms request is not guaranteed delivery duration'
   }));
  }
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
