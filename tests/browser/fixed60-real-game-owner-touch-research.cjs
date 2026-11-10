'use strict';
// RESEARCH ONLY: opt-in fixed60 owner in the actual shipping React/Game path.
// Measures real Chromium Game.update and renderer JavaScript; not physical
// touch-to-photon, GPU presentation or a production scheduler promotion.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const maxSteps=Number(process.env.NOVA_FIXED60_MAX_STEPS||2);
const controlledGate=process.env.NOVA_FIXED60_CONTROLLED_GATE==='1';
const controlledExtra=Number(process.env.NOVA_FIXED60_EXTRA_TICKS||2);
assert.ok([2,3,4].includes(controlledExtra),'invalid research backlog');
// Compare against the materialized shell, not a brittle hardcoded DOM count.
const expectedOverlays=[...fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8')
 .matchAll(/<script\b[^>]*src=["']([^"']*nova-updates\/[^"']+)["']/gi)]
 .map(m=>m[1].split('/').pop().split('?')[0]);
assert.ok(expectedOverlays.length>0&&new Set(expectedOverlays).size===expectedOverlays.length,
 'materialized shell must declare unique canonical overlays');
// Three-step is an opt-in test-only active-jitter policy; >100ms stalls
// retain the original two-step safety budget.
assert.ok([2,3].includes(maxSteps),'research Chromium only supports 2 or 3 steps');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const errors=[],consoleErrors=[];
 try{
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.addScriptTag({path:path.resolve(__dirname,
   '../../nova-updates/fixed60-research-browser.js')});
  await page.evaluate(({maxSteps,controlledGate,controlledExtra})=>{
   window.__novaFixedMaxSteps=maxSteps;
   window.__novaControlledGate=controlledGate;
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const renderMod=window.__novaMakeRequire('')('game/render');
   const baseStart=Game.prototype.start;
   window.__novaFixedResearch={births:0,updates:[],renders:[],errors:[],lifecycle:[],touchEvents:[],frames:[]};
   const profile=window.__novaFixedResearch;
   const gateGaps=[250/3,50/3,50/3,50/3];
   let gateNext=null,gateIndex=0,gateToken=0;
   const gatePending=new Map();
   profile.pendingGateRequests=()=>gatePending.size;
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch')
      profile.touchEvents.push({type,trusted:e.isTrusted,pointerId:e.pointerId});
    },{capture:true,passive:true});
   const baseUpdate=Game.prototype.update;
   Game.prototype.update=function(...args){
    if(this!==window.__novaFixedGame)return baseUpdate.apply(this,args);
    const at=performance.now();
    try{return baseUpdate.apply(this,args);}
    finally{profile.updates.push(performance.now()-at);}
   };
   const baseRender=renderMod.render;
   renderMod.render=function(...args){
    if(args[0]!==window.__novaFixedGame)return baseRender.apply(this,args);
    const at=performance.now();
    try{return baseRender.apply(this,args);}
    finally{profile.renders.push(performance.now()-at);}
   };
   const baseFire=Game.prototype.tryFire;
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length,out=baseFire.call(this,t,...args);
    if(this===window.__novaFixedGame&&t===this.player&&this.bullets.length>before)
     profile.births+=this.bullets.length-before;
    return out;
   };
   Game.prototype.start=function(...args){
    if(this.__novaDecorativeWorld)return baseStart.apply(this,args);
    if(window.__novaFixedPilot)throw Error('unexpected second playable fixed60 owner');
    window.__novaFixedGame=this;
    profile.lifecycle.push({event:'game-start',at:performance.now(),status:this.status});
    // Execute the composed shipping start wrappers (including Settings'
    // active-game registration), then cancel ONLY the core Game RAF before
    // its first callback. This avoids bypassing legitimate start side effects.
    const result=baseStart.apply(this,args);
    const shippingRaf=this.raf;
    if(!Number.isInteger(shippingRaf)||shippingRaf<=0)
     throw Error('shipping Game.start did not schedule its expected RAF');
    cancelAnimationFrame(shippingRaf);
    this.raf=null;
    const pilot=window.__novaFixed60Research.createFixedStepBrowserPilot(this,{
     window,document,clock:performance,
     request:fn=>{
      const token=++gateToken,state={id:null,cancelled:false};
      gatePending.set(token,state);
      const deliver=ts=>{
       if(state.cancelled)return;
       if(controlledGate){
        if(gateNext===null)gateNext=ts;
        if(ts+0.2<gateNext){state.id=requestAnimationFrame(deliver);return;}
        gateNext+=gateGaps[gateIndex++%4];
       }
       gatePending.delete(token);
      // Measure real RAF callback spacing and per-callback fixed-step work.
      // These are browser callback intervals, NOT physical display times.
      const owner=window.__novaFixedPilot?.owner;
      const beforeTicks=owner?.ticks??0,beforeDropped=owner?.droppedMs??0;
      const beforeBirths=profile.births;
      const rawGapMs=owner?Math.max(0,ts-owner.lastMs):null;
      // Arm the research-only ready shot at the actual RAF boundary.
      // Arming before a 65ms main-thread block is unsound: a normal
      // one-step callback can fire before the intended three-step burst.
      // The scheduler still determines whether three real updates occur.
      if(profile.armShotOnThree&&owner&&rawGapMs>=48&&rawGapMs<=100+1e-7&&
       window.__novaFixedGame?.input?.aim?.active){
       window.__novaFixedGame.player.fireCd=0;
       profile.armShotOnThree=false;
      }
      const at=performance.now();
      fn(ts);
      const current=window.__novaFixedPilot?.owner;
      if(current){
       const frames=profile.frames;
       const previous=frames.length?frames[frames.length-1].ts:null;
       frames.push({ts,intervalMs:previous===null?null:ts-previous,
        steps:current.ticks-beforeTicks,budget:current.maxSteps,
        playerProjectileBirths:profile.births-beforeBirths,
        rawGapMs,lagMs:current.lagMs,droppedMs:current.droppedMs-beforeDropped,
        dropReason:current.droppedMs>beforeDropped?
         (rawGapMs>100.0000001?'long-stall':'backlog'):null,
        callbackJsMs:performance.now()-at});
      }
      };
      state.id=requestAnimationFrame(deliver);
      return token;
     },
     cancel:token=>{
      const state=gatePending.get(token);
      if(!state)return;
      state.cancelled=true;cancelAnimationFrame(state.id);
      gatePending.delete(token);
     },
     render:(g,w,h)=>renderMod.render(g,w,h),
     maxSteps:window.__novaFixedMaxSteps,backlogExtraTicks:controlledExtra});
    window.__novaFixedPilot=pilot;
    // Reuse PR #888's exact-source active-only policy in the real browser.
    // This is intentionally NOT installed in production or the bundle.
    if(window.__novaFixedMaxSteps===3){
     const baseAdvance=pilot.owner.advance;
     pilot.owner.advance=function(ts){
      this.maxSteps=Math.max(0,ts-this.lastMs)>100+1e-7?2:3;
      return baseAdvance.call(this,ts);
     };
    }
    const originalStop=pilot.owner.stop.bind(pilot.owner);
    pilot.owner.stop=function(...stopArgs){
     profile.lifecycle.push({event:'owner-stop',at:performance.now(),status:pilot.owner.game.status,
      stack:(new Error('owner stopped')).stack});
     return originalStop(...stopArgs);
    };
    profile.lifecycle.push({event:'owner-created',at:performance.now(),status:this.status});
    pilot.start();
    profile.lifecycle.push({event:'owner-start-returned',at:performance.now(),started:pilot.owner.started});
    return result;
   };
  },{maxSteps,controlledGate,controlledExtra});
  await deploy.click();
  try{
   await page.waitForFunction(()=>window.__novaFixedGame?.status==='playing'&&
    window.__novaFixedPilot?.owner?.started,null,{timeout:30000});
  }catch(error){
   const diagnostic=await page.evaluate(()=>({
    gameSeen:!!window.__novaFixedGame,
    status:window.__novaFixedGame?.status||null,
    pilotSeen:!!window.__novaFixedPilot,
    pilotStarted:!!window.__novaFixedPilot?.owner?.started,
    gameRaf:window.__novaFixedGame?.raf??null,
    loading:!!document.querySelector('.nv-loading:not([hidden])'),
    lifecycle:window.__novaFixedResearch?.lifecycle?.slice(-12),
    ticks:window.__novaFixedPilot?.owner?.ticks??null,
    droppedMs:window.__novaFixedPilot?.owner?.droppedMs??null
   }));
   throw Error('fixed60 boot gate: '+JSON.stringify({diagnostic,errors,consoleErrors}),{cause:error});
  }
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   g.input.autofire=false;g.input.firing=false;
   g.player.fireCd=0;g.player.spawnShieldT=10;
   window.__novaFixedResearch.births=0;
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const cdp=await context.newCDPSession(page);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await page.waitForFunction(()=>window.__novaFixedGame?.input?.aim?.active,null,{timeout:5000});
  const centered=await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   return {owner:g.input.stickId.aim,active:g.input.aim.active,
    births:window.__novaFixedResearch.births};
  });
  assert.equal(centered.active,true,'centered trusted touch must own aim');
  assert.ok(centered.owner>=0,'aim must have an actual pointer owner');
  assert.equal(centered.births,0,'centered touch must not fire');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
   {...origin,x:origin.x+Math.min(34,box.width*.1),y:origin.y-20}]});
  await page.waitForFunction(()=>window.__novaFixedResearch.births>0,null,{timeout:12000});
  const held=await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   return {owner:g.input.stickId.aim,active:g.input.aim.active,
    dx:g.input.aim.dx,dy:g.input.aim.dy,births:window.__novaFixedResearch.births};
  });
  assert.equal(held.owner,centered.owner,'moving touch must retain aim ownership');
  assert.equal(held.active,true);
  assert.ok(held.births>0,'real Game must emit player-owned projectile');
  assert.ok(Math.hypot(held.dx,held.dy)>5,'real analog extension must be sampled');
  if(process.env.NOVA_FIXED60_ACTIVE_BURST==='1'){
   // Exercise three-update callbacks while the real right stick is held.
   // RAF alignment varies: a 55ms main-thread block may yield a 33ms
   // callback rather than 50ms. Retry boundedly, but never waive the gate.
   const heldBurstStart=await page.evaluate(()=>window.__novaFixedResearch.frames.length);
   let shotInThree=false;
   for(let attempt=0;attempt<8&&!shotInThree;attempt++){
    const beforeFrame=await page.evaluate(()=>window.__novaFixedResearch.frames.length);
    await page.evaluate(()=>{
     // The RAF wrapper arms the ready shot at the burst boundary, not
     // during this blocked task (which could precede a one-step RAF).
     window.__novaFixedResearch.armShotOnThree=true;
     const end=performance.now()+65;
     while(performance.now()<end){}
    });
    await page.waitForFunction(before=>window.__novaFixedResearch.frames.length>before,
     beforeFrame,{timeout:5000});
    shotInThree=await page.evaluate(start=>window.__novaFixedResearch.frames
     .slice(start).some(f=>f.steps===3&&f.budget===3&&f.rawGapMs<=100+1e-7&&
      f.playerProjectileBirths>0),heldBurstStart);
   }
   const heldBurstDiagnostic=await page.evaluate(start=>({
    frames:window.__novaFixedResearch.frames.slice(start).map(f=>({
     gap:f.rawGapMs,steps:f.steps,budget:f.budget,births:f.playerProjectileBirths})),
    aimActive:window.__novaFixedGame.input.aim.active,
    aimOwner:window.__novaFixedGame.input.stickId.aim,
    firing:window.__novaFixedGame.input.firing,
    fireCd:window.__novaFixedGame.player.fireCd,
    gameStatus:window.__novaFixedGame.status,
    totalBirths:window.__novaFixedResearch.births
   }),heldBurstStart);
   assert.equal(shotInThree,true,
    'a real three-update callback must emit a player-owned projectile while held: '+
    JSON.stringify(heldBurstDiagnostic));
   const during=await page.evaluate(()=>({
    owner:window.__novaFixedGame.input.stickId.aim,
    active:window.__novaFixedGame.input.aim.active,
    births:window.__novaFixedResearch.births
   }));
   assert.equal(during.owner,held.owner,'three-step callbacks must preserve held touch owner');
   assert.equal(during.active,true,'three-step callbacks must preserve held aim');
   assert.ok(during.births>=held.births,'three-step callbacks must not undo real projectiles');
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__novaFixedGame?.input?.aim?.active===false,null,{timeout:5000});
  // Opt-in research: force active (<100ms) RAF gaps in real Chromium.
  // This must exercise the actual three-update Game path, not merely allow it.
  if(process.env.NOVA_FIXED60_ACTIVE_BURST==='1'){
   assert.equal(maxSteps,3,'active burst requires three-step research owner');
   const releasedBurstStart=await page.evaluate(()=>window.__novaFixedResearch.frames.length);
   const birthsAtRelease=await page.evaluate(()=>window.__novaFixedResearch.births);
   for(let attempt=0;attempt<8;attempt++){
    const before=await page.evaluate(()=>window.__novaFixedResearch.frames.length);
    await page.evaluate(()=>{
     const end=performance.now()+65;
     while(performance.now()<end){} // intentional research-only foreground work
    });
    await page.waitForFunction(before=>window.__novaFixedResearch.frames.length>before,
     before,{timeout:5000});
   }
   const bursts=await page.evaluate(start=>window.__novaFixedResearch.frames
    .slice(start).filter(f=>f.steps===3&&f.rawGapMs<=100+1e-7&&f.budget===3)
    .map(f=>({rawGapMs:f.rawGapMs,steps:f.steps,callbackJsMs:f.callbackJsMs})),releasedBurstStart);
   assert.ok(bursts.length>0,
    'post-release active Chromium gaps must independently exercise three-update Game callbacks');
   assert.equal(await page.evaluate(()=>window.__novaFixedResearch.births),birthsAtRelease,
    'released right stick must not ghost-fire during three-update catch-up');
   console.log('NOVA_FIXED60_ACTIVE_THREE_UPDATE_BURSTS '+JSON.stringify(bursts));
  }
  // Force one genuine foreground RAF gap, after releasing the stick.
  // The active-only three-step policy must revert to two steps on this gap.
  const beforeStall=await page.evaluate(()=>({
   drops:window.__novaFixedPilot.owner.droppedFrames,
   long:window.__novaFixedResearch.frames.filter(f=>f.dropReason==='long-stall').length
  }));
  await page.evaluate(()=>{
   const end=performance.now()+135;
   while(performance.now()<end){} // research-only main-thread stall
  });
  await page.waitForFunction(before=>
   window.__novaFixedPilot?.owner?.droppedFrames>before.drops &&
   window.__novaFixedResearch?.frames?.filter(f=>f.dropReason==='long-stall').length>before.long,
   beforeStall,{timeout:5000});
  const report=await page.evaluate(()=>{
   const g=window.__novaFixedGame,p=window.__novaFixedPilot;
   const values=a=>{const s=[...a].sort((x,y)=>x-y);
    return {n:s.length,p95:s.length?s[Math.ceil(.95*s.length)-1]:null};};
   const frames=window.__novaFixedResearch.frames;
   const frameIntervals=frames.map(f=>f.intervalMs).filter(Number.isFinite);
   const controlledLongGaps=frames.filter(f=>f.rawGapMs>=70&&f.rawGapMs<=100).length;
   const callbackCosts=frames.map(f=>f.callbackJsMs);
   const backlogSamples=frames.map(f=>f.lagMs);
   const stepCounts={};
   for(const f of frames)stepCounts[f.steps]=(stepCounts[f.steps]||0)+1;
   const droppedFrameCount=frames.filter(f=>f.droppedMs>0).length;
   const longStallDrops=frames.filter(f=>f.dropReason==='long-stall').length;
   const backlogDrops=frames.filter(f=>f.dropReason==='backlog').length;
   const attributedDroppedMs=frames.reduce((sum,f)=>sum+f.droppedMs,0);
   const longStallDroppedMs=frames.filter(f=>f.dropReason==='long-stall')
    .reduce((sum,f)=>sum+f.droppedMs,0);
   const backlogDroppedMs=frames.filter(f=>f.dropReason==='backlog')
    .reduce((sum,f)=>sum+f.droppedMs,0);
   return {configuredMaxSteps:window.__novaFixedMaxSteps,
    controlledGate:window.__novaControlledGate,
    maxSteps:p.owner.maxSteps,ticks:p.owner.ticks,droppedMs:p.owner.droppedMs,
    raf:{frames:frames.length,intervals:values(frameIntervals),controlledLongGaps,
     callbackJs:values(callbackCosts),backlogMs:values(backlogSamples),
     stepCounts,droppedFrameCount,
     longStallDrops,backlogDrops,attributedDroppedMs,
     longStallDroppedMs,backlogDroppedMs,
     maxIntervalMs:frameIntervals.length?Math.max(...frameIntervals):null},
    productionRafActive:!!g.raf,pilotStarted:p.owner.started,
    aimActive:g.input.aim.active,aimOwner:g.input.stickId.aim,
    updates:values(window.__novaFixedResearch.updates),
    renders:values(window.__novaFixedResearch.renders),
    births:window.__novaFixedResearch.births,
    runtimeScriptNames:[...document.querySelectorAll('script[src*="nova-updates/"]')]
     .map(s=>s.src.split('/').pop().split('?')[0]),
    // Playwright addScriptTag({path}) injects inline contents, not a src URL.
    researchFactoryPresent:typeof window.__novaFixed60Research?.createFixedStepBrowserPilot==='function'};
  });
  assert.equal(report.aimActive,false,'release must clear aim');
  const touches=await page.evaluate(()=>window.__novaFixedResearch.touchEvents.slice());
  assert.ok(touches.some(e=>e.type==='pointerdown'),'real touch down must reach DOM');
  assert.ok(touches.some(e=>e.type==='pointermove'),'real touch move must reach DOM');
  assert.ok(touches.some(e=>e.type==='pointerup'),'real touch release must reach DOM');
  assert.ok(touches.every(e=>e.trusted),'touches must be browser-trusted, not synthetic Event objects');
  const owners=new Set(touches.map(e=>e.pointerId));
  assert.equal(owners.size,1,'touch gesture must retain one DOM pointer owner');
  assert.equal(report.productionRafActive,false,'never run two RAF owners');
  assert.equal(report.configuredMaxSteps,maxSteps,'requested catch-up policy must own real Game');
  assert.equal(report.controlledGate,controlledGate,'research RAF gate configuration drift');
  if(controlledGate){
   console.log('NOVA_FIXED60_CONTROLLED_GATE_DIAGNOSTIC '+JSON.stringify({
    frames:report.raf.frames,intervals:report.raf.intervals,
    longGaps:report.raf.controlledLongGaps,stepCounts:report.raf.stepCounts,
    droppedMs:report.droppedMs,backlogDrops:report.raf.backlogDrops}));
   assert.ok((report.raf.stepCounts['3']||0)>0,
    'controlled Chromium presentation must exercise real three-update callbacks');
   assert.ok(report.raf.intervals.p95>=45,
    'controlled RAF must actually delay browser callbacks');
   assert.ok(report.raf.controlledLongGaps>=3,
    'controlled RAF must deliver multiple real 70–100ms active gaps');
  }
  if(maxSteps===3){
   const frames=await page.evaluate(()=>window.__novaFixedResearch.frames.map(f=>({
    rawGapMs:f.rawGapMs,budget:f.budget,steps:f.steps
   })));
   assert.ok(frames.every(f=>f.budget===(f.rawGapMs>100+1e-7?2:3)),
    'three-step pilot must retain two-step budget after a foreground stall');
   assert.ok(frames.every(f=>f.steps<=f.budget),
    'browser pilot must not exceed its per-frame simulation budget');
  }
  assert.equal(report.pilotStarted,true,'research owner must remain active');
  assert.ok(report.ticks>0&&report.updates.n>0);
  assert.ok(report.renders.n>0&&Number.isFinite(report.renders.p95));
  assert.ok(report.raf.frames>2&&report.raf.intervals.n>0,
   'actual browser RAF spacing must be observed');
  assert.ok(Number.isFinite(report.raf.intervals.p95)&&
   Number.isFinite(report.raf.callbackJs.p95)&&
   Number.isFinite(report.raf.backlogMs.p95),
   'real browser callback intervals and JavaScript costs must be finite');
  assert.equal(Object.values(report.raf.stepCounts).reduce((a,b)=>a+b,0),
   report.raf.frames,'every observed RAF callback needs a step count');
  assert.ok(report.raf.longStallDrops>=1,
   'controlled >100ms Chromium stall must be classified as a long stall');
  assert.equal(report.raf.longStallDrops+report.raf.backlogDrops,
   report.raf.droppedFrameCount,'every dropped-time frame must have a cause');
  assert.ok(Math.abs(report.raf.longStallDroppedMs+
   report.raf.backlogDroppedMs-report.droppedMs)<1e-5,
   'long-stall and ordinary-backlog losses must reconcile');
  assert.ok(Math.abs(report.raf.attributedDroppedMs-report.droppedMs)<1e-5,
   'RAF-level dropped-time attribution must match the actual owner total');
  assert.ok(Number.isFinite(report.updates.p95));
  assert.deepEqual(expectedOverlays.filter(name=>!report.runtimeScriptNames.includes(name)),[],
   'every canonical materialized overlay must load (optional dynamic scripts are allowed)');
  assert.equal(report.researchFactoryPresent,true,'opt-in fixed60 research factory must be installed');
  assert.deepEqual(errors,[],'browser errors');
  assert.deepEqual(consoleErrors,[],'browser console errors');
  const teardown=await page.evaluate(()=>{
   const g=window.__novaFixedGame,p=window.__novaFixedPilot;
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   p.stop();
   const stopped={started:p.owner.started,captureActive:p.capture.active,
    raf:g.raf,inputRestored:g.input.canvas===g.canvas,
    startRestored:g.start===Game.prototype.start,
    destroyRestored:g.destroy===Game.prototype.destroy,
    pauseRestored:g.setPaused===Game.prototype.setPaused};
   g.destroy();
   return {...stopped,destroyed:!!g.__novaDestroyed,
    musicTimer:g.sfx.musicTimer,
    pendingGateRequests:window.__novaFixedResearch.pendingGateRequests()};
  });
  assert.deepEqual(teardown,{
   started:false,captureActive:false,raf:null,inputRestored:true,
   startRestored:true,destroyRestored:true,pauseRestored:true,
   destroyed:true,musicTimer:null,pendingGateRequests:0
  },'pilot teardown must restore native controls and release Game/audio/RAF ownership');
  console.log('NOVA_FIXED60_CHROMIUM_OWNER_TOUCH '+JSON.stringify(report));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
