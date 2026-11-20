'use strict';
// #648 RESEARCH ONLY: trusted Chromium right-stick -> actual composed Tempest
// projectile -> preplaced tank HP contact. This controlled geometry is not a
// natural match, short-pulse FPS comparison, or physical-device latency.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const halfRate=process.env.NOVA_TEMPEST_HALF_RATE==='1';
const latchMode=process.env.NOVA_TEMPEST_LATCH==='1';
const explicitMode=process.env.NOVA_TEMPEST_EXPLICIT==='1';
const {patchEngineHtml}=require('../research/explicit-shot-intent.cjs');
assert.ok(!explicitMode||latchMode,'explicit intent pilot requires latch mode');
assert.ok(!latchMode||halfRate,'latch pilot requires half-rate arm');
const trialCount=Number(process.env.NOVA_TEMPEST_TRIALS||8);
assert.ok(Number.isInteger(trialCount)&&trialCount>=8&&trialCount<=32,
 'short-touch research trials must stay bounded');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  if(explicitMode)await page.route('http://127.0.0.1:8765/',async route=>{
   const response=await route.fetch();
   assert.equal(response.status(),200,'research shell must load');
   await route.fulfill({response,body:patchEngineHtml(await response.text())});
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(({halfRate,latchMode,explicitMode})=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const start=Game.prototype.start,fire=Game.prototype.tryFire,damage=Game.prototype.damageTank,
    update=Game.prototype.update,updateDrones=Game.prototype.updateDrones;
   window.__novaTempestHp={births:[],hits:[],events:[],updates:[],latches:[],droneReads:[],targetReady:false};
   let activeTouch=null,pendingShot=null;
   const touchOwners=new Map();
   // Research-only: keep the actual Game.update/combat chain, but sample it
   // at roughly half the host RAF cadence. This is NOT a native 30Hz display
   // or a shipping scheduler: real callback timestamps remain the authority.
   let pendingDt=0;
   Game.prototype.update=function(...args){
    if(this===window.__novaTempestHpGame){
     if(halfRate){
      pendingDt+=Math.max(0,Number(args[0])||0);
      if(pendingDt<1/30-0.001)return;
      args[0]=Math.min(1/30,pendingDt);
      pendingDt=Math.max(0,pendingDt-args[0]);
     }
     if(!latchMode){
      window.__novaTempestHp.updates.push({at:performance.now(),gameTime:this.time,
       aimActive:!!this.input?.aim?.active,firing:!!this.input?.firing,
       aimMagnitude:Math.hypot(this.input?.aim?.dx||0,this.input?.aim?.dy||0)});
      return update.apply(this,args);
     }
     if(activeTouch&&this.input?.firing&&this.input?.aim?.active&&
        Math.hypot(this.input.aim.dx,this.input.aim.dy)>=9)activeTouch.sampled=true;
     const p=pendingShot,now=performance.now();pendingShot=null;
     const valid=latchMode&&p&&p.player===this.player&&this.player?.alive&&
      this.status==='playing'&&!this.paused&&!this.input?.__novaInputPaused&&
      !document.hidden&&this.input?.stickId?.aim===-1&&
      !this.input?.firing&&!this.input?.aim?.active&&
      now-p.at>=0&&now-p.at<=50&&
      Number.isFinite(p.physicalAt)&&now-p.physicalAt>=0&&
      now-p.physicalAt<=50&&
      Number.isFinite(p.physicalDownAt)&&now-p.physicalDownAt>=0&&
      now-p.physicalDownAt<=50;
     const input=this.input,aim=input.aim;
     const prior={firing:input.firing,active:aim.active,dx:aim.dx,dy:aim.dy};
     if(valid){
      if(explicitMode){
       const len=Math.hypot(p.dx,p.dy);
       input.__novaShotIntent=Object.freeze({fire:true,
        aim:Object.freeze({x:p.dx/len,y:p.dy/len})});
      }else{input.firing=true;aim.active=true;aim.dx=p.dx;aim.dy=p.dy;}
      window.__novaTempestHp.latches.push({at:now,releaseAt:p.at,
       mode:explicitMode?'weapon-only':'whole-update',
       physicalReleaseAgeMs:now-p.physicalAt,
       physicalPressAgeMs:now-p.physicalDownAt});
     }
     window.__novaTempestHp.updates.push({at:performance.now(),gameTime:this.time,
      aimActive:!!input?.aim?.active,firing:!!input?.firing,
      aimMagnitude:Math.hypot(input?.aim?.dx||0,input?.aim?.dy||0)});
     try{return update.apply(this,args);}
     finally{if(valid){
      if(explicitMode)delete input.__novaShotIntent;
      else{input.firing=prior.firing;aim.active=prior.active;
       aim.dx=prior.dx;aim.dy=prior.dy;}
     }}
    }
    return update.apply(this,args);
   };
   Game.prototype.updateDrones=function(...args){
    if(this===window.__novaTempestHpGame&&this.input?.__novaShotIntent)
     window.__novaTempestHp.droneReads.push({
      aimActive:!!this.input.aim?.active,firing:!!this.input.firing,
      intent:!!this.input.__novaShotIntent.fire
     });
    return updateDrones.apply(this,args);
   };
   Game.prototype.start=function(...args){
    if(!this.__novaDecorativeWorld)window.__novaTempestHpGame=this;
    return start.apply(this,args);
   };
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length,out=fire.call(this,t,...args);
    if(this===window.__novaTempestHpGame&&t===this.player&&this.bullets.length>before){
     const report=window.__novaTempestHp;
     const born=this.bullets.slice(before);
     report.births.push(...born.map(b=>({id:b.id,ownerId:b.ownerId,at:performance.now(),
      gameTime:this.time,x:b.x,y:b.y,vx:b.vx,vy:b.vy})));
    }
    return out;
   };
   Game.prototype.damageTank=function(t,...args){
    const before=t.hp,out=damage.call(this,t,...args);
    if(this===window.__novaTempestHpGame&&t===window.__novaTempestHpTarget&&t.hp<before){
     window.__novaTempestHp.hits.push({at:performance.now(),gameTime:this.time,
      damage:before-t.hp,sourceId:args[1],remainingHp:t.hp});
    }
    return out;
   };
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType!=='touch')return;
     window.__novaTempestHp.events.push({type,trusted:e.isTrusted,
      at:performance.now(),pointerId:e.pointerId});
     if(!latchMode||!e.isTrusted)return;
     const g=window.__novaTempestHpGame;
     // A second thumb may press the movement stick while the first aims.
     // Track each physical pointer independently; only the actual Input aim
     // owner may replace/cancel an aim-shot candidate.
     if(type==='pointerdown')
      touchOwners.set(e.pointerId,{id:e.pointerId,player:g?.player,
       sampled:false,physicalDownAt:e.timeStamp});
     if(type==='pointermove'&&g?.input?.stickId?.aim===e.pointerId){
      const candidate=touchOwners.get(e.pointerId);
      if(candidate&&activeTouch!==candidate){activeTouch=candidate;pendingShot=null;}
     }
     if(type==='pointerup'||type==='pointercancel'){
      // A newer right-stick press without a delivered move still supersedes
      // any older queued release; a left-stick release must not do so.
      if(g?.input?.stickId?.aim===e.pointerId&&activeTouch?.id!==e.pointerId)
       pendingShot=null;
      if(activeTouch?.id===e.pointerId){
       const a=g?.input?.aim,len=Math.hypot(a?.dx||0,a?.dy||0);
       if(type==='pointerup'&&!activeTouch.sampled&&g?.input?.firing&&
          g?.input?.stickId?.aim===e.pointerId&&a?.active&&len>=9)
        pendingShot={player:activeTouch.player,dx:a.dx,dy:a.dy,
         at:performance.now(),physicalAt:e.timeStamp,
         physicalDownAt:activeTouch.physicalDownAt};
       activeTouch=null;
      }
      touchOwners.delete(e.pointerId);
     }
     window.__novaTempestHp.aimOwnerId=activeTouch?.id??null;
    },{capture:true,passive:true});
   window.addEventListener('blur',()=>{pendingShot=null;activeTouch=null;touchOwners.clear();});
   document.addEventListener('visibilitychange',()=>{
    if(document.hidden){pendingShot=null;activeTouch=null;touchOwners.clear();}
   });
  },{halfRate,latchMode,explicitMode});
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaTempestHpGame?.status==='playing',null,{timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  const setup=await page.evaluate(()=>{
   const g=window.__novaTempestHpGame,p=g.player;
   if(!p)throw Error('no playable player');
   g.setClass(p,'tempest');p.fireCd=0;
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:10,droneRespawnT:Infinity});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;
   const target=g.tanks.find(t=>t!==p&&t.ai);
   if(!target)throw Error('no real AI target available');
   Object.assign(target,{cls:'scout',isPlayer:true,alive:true,x:58,y:-23,
    vx:0,vy:0,hp:100000,maxHp:100000,spawnShieldT:0,shieldT:0,
    bulwarkT:0,tauntT:0,cloakT:0,r:16});
   window.__novaTempestHpTarget=target;
   window.__novaTempestHp.targetReady=true;
   window.__novaTempestHp.targetAt={x:target.x,y:target.y,at:performance.now()};
   g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.shapeById)g.shapeById.clear();
   if(g.hash?.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.input.autofire=false;g.input.mouseActive=false;g.input.firing=false;
   return {playerId:p.id,targetId:target.id,cls:p.cls};
  });
  assert.equal(setup.cls,'tempest');
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await page.waitForFunction(()=>window.__novaTempestHpGame?.input?.aim?.active===true,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>window.__novaTempestHp.births.length),0,
   'centered touch must not create Tempest projectile');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
   {...origin,x:origin.x+35,y:origin.y-20}]});
  await page.waitForFunction(()=>window.__novaTempestHp.births.length>0,null,{timeout:12000});
  // Release as soon as the first actual shot is witnessed; the target must
  // still take damage from an already-existing projectile, not held autofire.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__novaTempestHp.hits.length>0,null,{timeout:12000});
  // A valid projectile can hit after release; a *new* player volley cannot.
  // Observe beyond Tempest's base reload so a stuck firing flag is exposed.
  await page.waitForTimeout(180);
  await page.waitForFunction(()=>{const i=window.__novaTempestHpGame?.input;
   return i&&!i.aim.active&&!i.firing&&i.stickId.aim===-1;},null,{timeout:5000});
  const report=await page.evaluate(()=>({
   ...window.__novaTempestHp,
   playerId:window.__novaTempestHpGame.player.id,
   targetId:window.__novaTempestHpTarget.id,
   aimActive:window.__novaTempestHpGame.input.aim.active,
   firing:window.__novaTempestHpGame.input.firing
  }));
  assert.ok(report.events.length>=3&&report.events.every(e=>e.trusted),
   'browser must deliver trusted down/move/up touch events');
  const press=report.events.find(e=>e.type==='pointerdown');
  const deflect=report.events.find(e=>e.type==='pointermove');
  assert.ok(press&&deflect&&press.at<=deflect.at,
   'trusted touch press must precede the firing deflection');
  assert.ok(report.targetReady&&report.targetAt,'target must be preplaced before any projectile');
  assert.ok(report.births.some(b=>b.ownerId===report.playerId),
   'trusted deflection must create a real player-owned projectile');
  assert.ok(report.targetAt.at<report.births[0].at,
   'target geometry must precede the measured projectile, not follow its trajectory');
  assert.ok(report.hits.some(h=>h.sourceId===report.playerId&&h.damage>0),
   'real composed Tempest projectile must reduce aligned target HP');
  assert.ok(report.births.every(b=>b.at>=deflect.at),
   'player projectile must not predate the trusted firing deflection');
  assert.ok(report.hits.every(h=>h.at>=report.births[0].at),
   'target HP loss must not predate the first player projectile');
  assert.ok(report.hits[0].at>=report.births[0].at,
   'physical HP contact cannot predate projectile birth');
  const release=report.events.find(e=>e.type==='pointerup'||e.type==='pointercancel');
  assert.ok(release&&release.trusted,'release must be a trusted browser event');
  assert.equal(deflect.pointerId,press.pointerId,
   'firing deflection must belong to the pressed touch');
  assert.equal(release.pointerId,press.pointerId,
   'release must belong to the same touch that fired');
  assert.ok(deflect.at<=release.at,
   'touch release must not predate firing deflection');
  assert.ok(report.births.every(b=>b.at<=release.at),
   'no new Tempest projectile may be born after touch release');
  assert.equal(report.aimActive,false);
  assert.equal(report.firing,false);
  assert.equal(errors.length,0,'no browser page errors: '+JSON.stringify(errors));
  // Diagnostic only: a ~20ms trusted touch is shorter than a 30Hz frame.
  // Never require a shot on every short gesture: Chromium delivery phase,
  // presentation cadence and OS scheduling vary. Record real event timing,
  // physical HP contact and any post-release births without forcing a frame.
  const shortTrials=[];
  for(let i=0;i<trialCount;i++){
   const before=await page.evaluate(()=>{
    const g=window.__novaTempestHpGame,r=window.__novaTempestHp;
    g.player.fireCd=0;g.player.__v17Heat=.56;
    g.player.__v17Stability=1;g.player.__v17FiredAt=-100;
    g.bullets=[];g.input.firing=false;
    Object.assign(g.player,{x:0,y:0,vx:0,vy:0,angle:0});
    Object.assign(window.__novaTempestHpTarget,
     {x:58,y:-23,vx:0,vy:0,hp:100000});
    if(g.hash?.clear){g.hash.clear();for(const t of g.tanks)g.hash.insert(t);}
    return {events:r.events.length,births:r.births.length,hits:r.hits.length,
     updates:r.updates.length,latches:r.latches.length};
   });
   const touch={...origin,id:100+i};
   // Queue the start and move in protocol order without waiting for two
   // separate CDP round trips; those added ~45ms before the aim deflection.
   const startDelivery=cdp.send('Input.dispatchTouchEvent',
    {type:'touchStart',touchPoints:[touch]});
   const moveDelivery=cdp.send('Input.dispatchTouchEvent',{type:'touchMove',
    touchPoints:[{...touch,x:touch.x+35,y:touch.y-20}]});
   // Start the 20ms hold clock immediately after queueing the ordered CDP
   // commands. Awaiting both delivery acknowledgements first previously added
   // ~30ms of protocol round-trip time *before* this timer even began, making
   // every nominal 20ms trial an approximately 50ms press. CDP commands are
   // serialized on this session; the end remains queued after start and move.
   // Real browser pointer-event timestamps below remain the authority.
   const holdTimer=new Promise(resolve=>setTimeout(resolve,20));
   await holdTimer;
   const endDelivery=cdp.send('Input.dispatchTouchEvent',
    {type:'touchEnd',touchPoints:[]});
   await Promise.all([startDelivery,moveDelivery,endDelivery]);
   // Deterministic jitter reduces repeated host-frame phase alignment.
   await page.waitForTimeout(140+(i*37)%97);
   const trial=await page.evaluate(before=>{
    const g=window.__novaTempestHpGame,r=window.__novaTempestHp;
    const events=r.events.slice(before.events),births=r.births.slice(before.births),
     hits=r.hits.slice(before.hits),updates=r.updates.slice(before.updates),
     latches=r.latches.slice(before.latches);
    const down=events.find(e=>e.type==='pointerdown');
    const move=events.find(e=>e.type==='pointermove');
    const up=events.find(e=>e.type==='pointerup'||e.type==='pointercancel');
    const previousUpdate=move?[...r.updates].reverse().find(u=>u.at<=move.at):null;
    const nextUpdate=move?r.updates.find(u=>u.at>move.at):null;
    return {recoveredIntents:latches.length,
     recoveredLatencyMs:latches.map(l=>l.at-l.releaseAt),
     physicalReleaseAgeMs:latches.map(l=>l.physicalReleaseAgeMs),
     physicalPressAgeMs:latches.map(l=>l.physicalPressAgeMs),
     postReleaseProjectileLatencyMs:up?births.filter(b=>b.at>up.at).map(b=>b.at-up.at):[],
     phaseSincePreviousUpdateMs:previousUpdate?move.at-previousUpdate.at:null,
     phaseUntilNextUpdateMs:nextUpdate?nextUpdate.at-move.at:null,
     trusted:events.every(e=>e.trusted),down:!!down,move:!!move,
     up:!!up,durationMs:down&&up?up.at-down.at:null,
     updatesDuringTouch:down&&up?updates.filter(u=>u.at>=down.at&&u.at<=up.at).length:null,
     activeAimSamples:down&&up?updates.filter(u=>u.at>=down.at&&u.at<=up.at&&u.aimActive).length:null,
     firingSamples:down&&up?updates.filter(u=>u.at>=down.at&&u.at<=up.at&&u.firing).length:null,
     aimedFiringSamples:down&&up?updates.filter(u=>u.at>=down.at&&u.at<=up.at&&u.firing&&u.aimMagnitude>=9).length:null,
     moveToReleaseMs:move&&up?up.at-move.at:null,
     births:births.length,hits:hits.length,
     postReleaseBirths:up?births.filter(b=>b.at>up.at).length:null,
     aimActive:g.input.aim.active,firing:g.input.firing,
     stickId:g.input.stickId.aim};
   },before);
   assert.ok(trial.trusted&&trial.down&&trial.up,
    'short trial must deliver trusted down/release');
   assert.ok(Number.isFinite(trial.durationMs)&&trial.durationMs>=0,
    'CDP overlap must not invert the trusted press/release chronology');
   if(trial.move)assert.ok(Number.isFinite(trial.moveToReleaseMs)&&
    trial.moveToReleaseMs>=0&&trial.moveToReleaseMs<=trial.durationMs,
    'a delivered deflection must occur within the measured touch lifetime');
   // A short move may be coalesced before release. Record that as an input
   // delivery outcome rather than falsely requiring an aim deflection.
   if(latchMode){
    assert.ok(trial.postReleaseBirths<=trial.recoveredIntents,
     'only a bounded deliberate intent may fire after release');
    assert.ok(trial.recoveredLatencyMs.every(ms=>ms>=0&&ms<=50),
     'a recovered shot intent must expire after 50ms');
    assert.ok(trial.physicalReleaseAgeMs.every(ms=>ms>=0&&ms<=50),
     'a trusted physically stale release cannot be recovered');
    assert.ok(trial.physicalPressAgeMs.every(ms=>ms>=0&&ms<=50),
     'a stalled long hold cannot masquerade as a short unsampled shot');
   }
   else assert.equal(trial.postReleaseBirths,0,
    'baseline short touch must not create projectiles after release');
   assert.equal(trial.aimActive,false,'short trial must release aim ownership');
   assert.equal(trial.firing,false,'short trial must release firing');
   assert.equal(trial.stickId,-1,'short trial must clear aim pointer ID');
   trial.outcome=trial.recoveredIntents&&trial.births?'recovered-intent-projectile':
    !trial.move?'move-not-delivered':
    trial.aimedFiringSamples===0?'no-deflected-simulation-sample':
    trial.births===0?'sampled-but-no-projectile':
    trial.hits===0?'projectile-without-hp-contact':'hp-contact';
   shortTrials.push(trial);
  }
  if(explicitMode)assert.ok(shortTrials.filter(t=>t.recoveredIntents>0)
   .every(t=>t.births===1&&t.postReleaseBirths===1),
   'each eligible weapon-only intent must create exactly one player projectile');
  if(latchMode){
   // A browser-trusted cancellation is not a deliberate completed shot.
   const beforeCancel=await page.evaluate(()=>window.__novaTempestHp.latches.length);
   const canceled={...origin,id:999};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[canceled]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    {...canceled,x:canceled.x+35,y:canceled.y-20}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
   await page.waitForTimeout(140);
   const afterCancel=await page.evaluate(()=>({
    latches:window.__novaTempestHp.latches.length,
    aimActive:window.__novaTempestHpGame.input.aim.active,
    firing:window.__novaTempestHpGame.input.firing
   }));
   assert.equal(afterCancel.latches,beforeCancel,'cancel cannot queue a shot intent');
   assert.equal(afterCancel.aimActive,false,'cancel releases aim ownership');
   assert.equal(afterCancel.firing,false,'cancel releases firing ownership');
   // Real twin-stick players hold movement while aiming. A second pointerdown
   // must not overwrite the first right-stick shot owner.
   for(const aimFirst of [true,false]){
    const right={...origin,id:1501+(aimFirst?0:10)};
    const left={...origin,x:box.x+box.width*.28,id:1502+(aimFirst?0:10)};
    if(aimFirst)
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right]});
    else
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
     right,left]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
     {...right,x:right.x+35,y:right.y-20},left]});
    await page.waitForFunction(()=>{
     const g=window.__novaTempestHpGame,r=window.__novaTempestHp;
     return g?.input?.stickId?.aim>=0&&r.aimOwnerId===g.input.stickId.aim;
    },null,{timeout:5000});
    const rightOwner=await page.evaluate(()=>window.__novaTempestHp.aimOwnerId);
    const twoFinger=await page.evaluate(()=>({
     tracked:window.__novaTempestHp.aimOwnerId,
     physical:window.__novaTempestHpGame.input.stickId.aim
    }));
    assert.equal(twoFinger.tracked,rightOwner,
     'second thumb must not steal the actual aim owner');
    assert.equal(twoFinger.physical,rightOwner,
     'physical aim owner must match tracked right stick');
    // CDP's partial touchEnd semantics are not reliable evidence of
    // independent finger release here; end the full gesture explicitly.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>{
     const i=window.__novaTempestHpGame.input;
     return i.stickId.aim===-1&&i.stickId.move===-1;
    },null,{timeout:5000});
   }
  }
  if(explicitMode){
   const {droneReads,latches}=await page.evaluate(()=>({
    droneReads:window.__novaTempestHp.droneReads,
    latches:window.__novaTempestHp.latches
   }));
   assert.equal(droneReads.length,latches.length,
    'each weapon-only intent must traverse the real drone-update owner once');
   assert.ok(droneReads.every(x=>x.intent&&!x.aimActive&&!x.firing),
    'weapon-only intent must never revive the physical right stick for drones');
  }
  assert.equal(errors.length,0,
   'no browser page errors during short-touch trials: '+JSON.stringify(errors));
  const sampledTimes=await page.evaluate(()=>window.__novaTempestHp.updates.map(u=>u.at));
  const sampleGaps=sampledTimes.slice(1).map((t,i)=>t-sampledTimes[i])
   .filter(g=>Number.isFinite(g)&&g>0&&g<100).sort((a,b)=>a-b);
  const medianSampleGapMs=sampleGaps.length?
   sampleGaps[Math.floor(sampleGaps.length/2)]:null;
  // Compare only phase-overlapping cohorts: identical trial numbers are not
  // matched physical input phases across independent Chromium runs.
  const phaseBuckets={'0-8ms':{trials:0,shots:0,recovered:0},
   '8-16ms':{trials:0,shots:0,recovered:0},
   '16-24ms':{trials:0,shots:0,recovered:0},
   '24ms+':{trials:0,shots:0,recovered:0},
   'unknown':{trials:0,shots:0,recovered:0}};
  for(const t of shortTrials){
   const phase=t.phaseSincePreviousUpdateMs;
   const key=!Number.isFinite(phase)?'unknown':phase<8?'0-8ms':
    phase<16?'8-16ms':phase<24?'16-24ms':'24ms+';
   const bucket=phaseBuckets[key];
   bucket.trials++;bucket.shots+=Number(t.births>0);
   bucket.recovered+=Number(t.recoveredIntents>0);
  }
  console.log('NOVA_TEMPEST_TRUSTED_20MS_DIAGNOSTIC '+JSON.stringify({
   requestedHoldMs:20,halfRateSamplingPilot:halfRate,latchPilot:latchMode,
   explicitWeaponOnlyPilot:explicitMode,
   medianObservedGameUpdateGapMs:medianSampleGapMs,
   attempts:shortTrials.length,
   phaseBuckets,
   shotTrials:shortTrials.filter(t=>t.births>0).length,
   hitTrials:shortTrials.filter(t=>t.hits>0).length,
   trials:shortTrials
  }));
  console.log('NOVA_TEMPEST_TRUSTED_TOUCH_REAL_HP '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
