'use strict';
// Real Chromium touch regression: exercises the shipping React/Game/Input stack,
// never hand-dispatches fake PointerEvents and never replaces input methods.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

async function run(browser,label,viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const oldUpdate=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld)window.__novaTouchGame=this;
    return oldUpdate.apply(this,arguments);
   };
   const oldFire=Game.prototype.tryFire;
   window.__novaTouchShots=0;
   Game.prototype.tryFire=function(t){
    const before=this.bullets.length;
    const out=oldFire.apply(this,arguments);
    if(t&&t.isPlayer&&this.bullets.length>before)window.__novaTouchShots++;
    return out;
   };
   window.__novaTouchEvents=[];
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch')window.__novaTouchEvents.push({
      type,id:e.pointerId,trusted:e.isTrusted,x:e.clientX,y:e.clientY
     });
    },{capture:true});
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaTouchGame?.status==='playing',null,{timeout:20000});
  // The React loading veil intentionally outlives Game.status='playing'.
  // A real finger cannot reach the canvas until the veil finishes leaving.
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.evaluate(()=>{const g=window.__novaTouchGame;g.input.autofire=false;g.player.spawnShieldT=20;});
  // Regression #615: earn a REAL level point before the first joystick touch.
  // A pending upgrade must never trap either stick, even after the dwell expires.
  await page.evaluate(()=>{
   const g=window.__novaTouchGame;
   const types=window.__novaMakeRequire('')('game/types');
   g.gainXP(g.player,types.xpForLevel(g.player.level));
  });
  const upgradeChip=page.getByRole('button',{name:/UPGRADE READY/i});
  await upgradeChip.waitFor({state:'visible',timeout:10000});
  const rect=await canvas.boundingBox();
  assert.ok(rect&&rect.width>200&&rect.height>200,label+': game canvas has real dimensions');
  const stickClear=()=>page.evaluate(()=>[.20,.78].map(f=>{
   const e=document.elementFromPoint(innerWidth*f,innerHeight*.68);
   return {canvas:!!e?.matches?.('canvas.absolute.inset-0'),tag:e?.tagName,cls:String(e?.className||'').slice(0,100)};
  }));
  assert.ok((await stickClear()).every(v=>v.canvas),label+': newly earned upgrade cannot cover first joystick contact');
  await upgradeChip.tap();
  const minimize=page.getByRole('button',{name:'MINIMIZE'});
  await minimize.waitFor({state:'visible',timeout:10000});
  assert.ok((await stickClear()).every(v=>v.canvas),label+': even deliberately opened upgrade tray must not cover either stick');
  await minimize.tap();
  await upgradeChip.waitFor({state:'visible',timeout:10000});
  await upgradeChip.tap();
  await minimize.waitFor({state:'visible',timeout:10000});
  const beforeStat=await page.evaluate(()=>window.__novaTouchGame.statPoints);
  await page.locator('[data-nova-upgrade-tray] .stat-btn').first().tap();
  assert.equal(await page.evaluate(()=>window.__novaTouchGame.statPoints),beforeStat-1,label+': touch upgrade spends exactly one earned point');
  await page.evaluate(()=>{
   const g=window.__novaTouchGame;
   const types=window.__novaMakeRequire('')('game/types');
   g.gainXP(g.player,types.xpForLevel(g.player.level));
  });
  await upgradeChip.waitFor({state:'visible',timeout:10000});
  assert.ok((await stickClear()).every(v=>v.canvas),label+': next earned point also preserves first-touch clearance');
  // Regression #617: the read-only leaderboard must not capture the right
  // joystick. Keep it visible through real two-finger movement and firing.
  const leaderboardToggle=page.getByRole('button',{name:'Leaderboard'});
  await leaderboardToggle.tap();
  const leaderboardLabel=page.getByText('LEADERBOARD',{exact:true});
  await leaderboardLabel.waitFor({state:'visible',timeout:10000});
  const leaderboardPanel=page.locator('.anim-pop.panel.absolute.right-2').filter({has:leaderboardLabel});
  assert.equal(await leaderboardPanel.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
   label+': informational leaderboard is pointer-transparent');
  assert.ok((await stickClear()).every(v=>v.canvas),
   label+': open leaderboard cannot intercept either stick landing point');
  const left={x:rect.x+rect.width*.20,y:rect.y+rect.height*.68,id:11,radiusX:1,radiusY:1,force:1};
  const right={x:rect.x+rect.width*.78,y:rect.y+rect.height*.68,id:12,radiusX:1,radiusY:1,force:1};
  const leftMoved={...left,x:left.x+Math.min(42,rect.width*.13)};
  const rightMoved={...right,x:right.x+Math.min(38,rect.width*.10),y:right.y-35};
  const hit=await page.evaluate(({left,right})=>[left,right].map(p=>{
   const e=document.elementFromPoint(p.x,p.y);
   return {tag:e?.tagName,cls:String(e?.className||'').slice(0,240),html:e?.outerHTML?.slice(0,350),pointerEvents:e?getComputedStyle(e).pointerEvents:null,ui:!!e?.closest?.('[data-ui]'),canvas:e?.matches?.('canvas.absolute.inset-0'),status:window.__novaTouchGame?.status};
  }),{left,right});
  assert.ok(hit.every(h=>h.canvas&&!h.ui),label+': both contacts must land on actual gameplay canvas: '+JSON.stringify(hit));
  const cdp=await context.newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const snapshot=()=>page.evaluate(()=>{
   const g=window.__novaTouchGame, i=g?.input, p=g?.player;
   return {status:g?.status,time:g?.time,x:p?.x,y:p?.y,cls:p?.cls,
    move:i&&{active:i.move.active,dx:i.move.dx,dy:i.move.dy,id:i.stickId.move},
    aim:i&&{active:i.aim.active,dx:i.aim.dx,dy:i.aim.dy,id:i.stickId.aim},
    firing:i?.firing,shots:window.__novaTouchShots,
    swarm:p?.__novaSwarm&&{active:p.__novaSwarm.active,angle:p.__novaSwarm.angle,nodeX:p.__novaSwarm.nodeX,nodeY:p.__novaSwarm.nodeY,power:p.__novaSwarm.power}};
  });
  async function both(){
   await send('touchStart',[left]);
   await send('touchStart',[left,right]);
   await send('touchMove',[leftMoved,rightMoved]);
   await page.waitForTimeout(160);
   const state=await snapshot();
   assert.equal(state.move?.active,true,label+': left touch owns movement');
   assert.equal(state.aim?.active,true,label+': right touch owns aiming');
   assert.ok(state.move.dx>9&&state.aim.dx>9,label+': independent sticks receive displacement: '+JSON.stringify(state));
   assert.equal(state.firing,true,label+': aiming touch initiates fire');
   return state;
  }
  const held=await both();
  await page.waitForTimeout(650);
  // Game.start caps each simulation step at 33 ms. Under a busy CI renderer,
  // 650 ms of wall time can advance less than Scout's 0.5 s reload, making a
  // correct held-fire input look broken. Preserve the same shot assertion but
  // give the engine at least 0.65 s of authoritative simulation time.
  assert.ok(Number.isFinite(held.time),label+': gameplay simulation clock is available');
  await page.waitForFunction(start=>{
   const g=window.__novaTouchGame;
   return g&&g.status==='playing'&&g.time>=start+0.65;
  },held.time,{timeout:15000});
  const moving=await snapshot();
  assert.ok(Math.hypot(moving.x-held.x,moving.y-held.y)>1,
   label+': actual player must move while two fingers are held: '+JSON.stringify({held,moving}));
  assert.ok(moving.shots>held.shots,
   label+': real player projectiles must launch under right-stick fire: '+JSON.stringify({held,moving}));
  fs.mkdirSync(path.join('artifacts','browser'),{recursive:true});
  await page.screenshot({path:path.join('artifacts','browser',label+'-dual-touch.png')});
  // Release right first. CDP touchEnd carries the contact being released.
  await send('touchEnd',[rightMoved]);
  await page.waitForTimeout(120);
  const rightUp=await snapshot();
  assert.equal(rightUp.aim.active,false,label+': right release clears aim');
  assert.equal(rightUp.firing,false,label+': right release stops fire');
  assert.equal(rightUp.move.active,true,label+': left movement survives right release');
  await send('touchEnd',[leftMoved]);
  await page.waitForTimeout(80);
  let released=await snapshot();
  assert.equal(released.move.active,false,label+': left release clears movement');
  assert.equal(released.aim.active,false,label+': both sticks released');
  // Opposite release order: right must remain held after left release.
  await both();
  await send('touchEnd',[leftMoved]);
  await page.waitForTimeout(90);
  const leftUp=await snapshot();
  assert.equal(leftUp.move.active,false,label+': left release clears only movement');
  assert.equal(leftUp.aim.active,true,label+': right aim survives left release');
  assert.equal(leftUp.firing,true,label+': right aim retains firing');
  await send('touchEnd',[rightMoved]);
  // Cancellation must clear both owners without leaving a phantom shot.
  await both();
  await send('touchCancel',[]);
  await page.waitForTimeout(100);
  const cancelled=await snapshot();
  assert.equal(cancelled.move.active,false,label+': cancel clears movement');
  assert.equal(cancelled.aim.active,false,label+': cancel clears aim');
  assert.equal(cancelled.firing,false,label+': cancel clears firing');
  // Closing the informational overlay remains possible after dual-touch.
  await leaderboardToggle.tap();
  await leaderboardLabel.waitFor({state:'hidden',timeout:10000});
  assert.ok((await stickClear()).every(v=>v.canvas),
   label+': closing leaderboard preserves both joystick hit targets');
  // Warden command must be driven by the actual right touch, not merely a hull turn.
  await page.evaluate(()=>{
   if(window.innerWidth>window.innerHeight&&window.innerHeight<500){
    const proto=CanvasRenderingContext2D.prototype,old=proto.fillText;
    window.__novaLandscapeHints=[];
    proto.fillText=function(text,x,y){
     if(typeof text==='string'&&text.startsWith('RIGHT STICK ANGLE = GUN + SWARM'))
      window.__novaLandscapeHints.push({y,time:window.__novaTouchGame?.time});
     return old.apply(this,arguments);
    };
   }
   const g=window.__novaTouchGame;
   g.setClass(g.player,'warden');
   g.player.spawnShieldT=20;
  });
  await page.waitForTimeout(200);
  await both();
  await page.waitForTimeout(240);
  if(label==='touch-landscape-844'){
   const early=await page.evaluate(()=>window.__novaLandscapeHints.length);
   assert.equal(early,0,label+': canvas tutorial must not duplicate the immediate React toast');
  }
  const warden=await snapshot();
  assert.equal(warden.cls,'warden',label+': Warden transition occurred in actual game');
  assert.equal(warden.swarm?.active,true,label+': right touch activates Controller swarm command');
  assert.ok(Math.hypot(warden.swarm.nodeX-warden.x,warden.swarm.nodeY-warden.y)>35,
   label+': Controller command node follows live touch direction/depth: '+JSON.stringify(warden));
  // The command node is clamped at arena edges; its final displacement can
  // differ from the requested bearing. Compare the authoritative stick bearing.
  const commandBearing=warden.swarm.angle;
  const stickBearing=Math.atan2(warden.aim.dy,warden.aim.dx);
  const bearingError=Math.atan2(Math.sin(commandBearing-stickBearing),Math.cos(commandBearing-stickBearing));
  assert.ok(Math.abs(bearingError)<0.12,
   label+': Controller command bearing must match right-stick direction: '+JSON.stringify({commandBearing,stickBearing,bearingError,warden}));
  await page.screenshot({path:path.join('artifacts','browser',label+'-warden-command.png')});
  const rightShallow={...right,x:right.x+14,y:right.y-14};
  await send('touchMove',[leftMoved,rightShallow]);
  await page.waitForTimeout(190);
  const shallow=await snapshot();
  await send('touchMove',[leftMoved,rightMoved]);
  await page.waitForTimeout(190);
  const deep=await snapshot();
  assert.ok(deep.swarm.power>shallow.swarm.power+0.15,
   label+': Controller analog depth must increase command power: '+JSON.stringify({shallow,deep}));
  await send('touchCancel',[]);
  await page.waitForTimeout(80);
  if(label==='touch-landscape-844'){
   await page.waitForFunction(()=>{
    const g=window.__novaTouchGame,p=g?.player;
    return g&&p&&g.time>=p.__novaLiveVectorTutorialStart+0.15;
   },null,{timeout:12000});
   await page.waitForTimeout(90);
   const hint=await page.evaluate(()=>({
    calls:window.__novaLandscapeHints.slice(-8),
    expectedY:window.__novaTouchGame.h*.57
   }));
   assert.ok(hint.calls.length>0,label+': delayed canvas reminder appears later');
   assert.ok(hint.calls.every(v=>Math.abs(v.y-hint.expectedY)<2),
    label+': short landscape reminder stays above upgrade badge: '+JSON.stringify(hint));
  }
  // Pausing during a live two-finger chord must release gameplay ownership.
  await both();
  await page.getByRole('button',{name:'Pause'}).click();
  await page.getByText('PAUSED',{exact:true}).waitFor({state:'visible'});
  const paused=await page.evaluate(()=>{
   const g=window.__novaTouchGame;
   return {paused:g.paused,move:g.input.move.active,aim:g.input.aim.active,
    firing:g.input.firing,ability:g.input.abilityQueued};
  });
  assert.equal(paused.paused,true,label+': gameplay is paused');
  assert.equal(paused.move,false,label+': pause releases movement touch');
  assert.equal(paused.aim,false,label+': pause releases aim touch');
  assert.equal(paused.firing,false,label+': pause stops firing');
  assert.equal(paused.ability,false,label+': pause clears queued ability');
  await send('touchCancel',[]);
  await page.getByRole('button',{name:/RESUME/i}).click();
  await page.waitForTimeout(120);
  const resumed=await snapshot();
  assert.equal(resumed.move.active,false,label+': resume does not resurrect movement');
  assert.equal(resumed.aim.active,false,label+': resume does not resurrect aiming');
  assert.equal(resumed.firing,false,label+': resume does not resurrect fire');
  const events=await page.evaluate(()=>window.__novaTouchEvents);
  const downs=events.filter(e=>e.type==='pointerdown'),ups=events.filter(e=>e.type==='pointerup'),cancels=events.filter(e=>e.type==='pointercancel');
  assert.ok(downs.length>=8&&ups.length>=4&&cancels.length>=4,
   label+': Chromium generated genuine two-contact releases and cancellations: '+JSON.stringify({downs:downs.length,ups:ups.length,cancels:cancels.length}));
  assert.ok(events.every(e=>e.trusted),label+': touch events must be browser-trusted');
  // Compact landscape: the in-game Pilot Settings must remain operable at
  // 320 CSS pixels of height without stealing or resurrecting stick ownership.
  if(label==='touch-landscape-568'){
   const gear=page.locator('#nova-pilot-gear');
   await gear.waitFor({state:'visible',timeout:10000});
   await gear.click();
   const dialog=page.getByRole('dialog',{name:'Gameplay settings'});
   await dialog.waitFor({state:'visible',timeout:10000});
   const panel=await page.locator('#nova-pilot-panel').evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      viewportW:innerWidth,viewportH:innerHeight};
   });
   assert.ok(panel.left>=-1&&panel.right<=panel.viewportW+1&&
     panel.top>=-1&&panel.bottom<=panel.viewportH+1,
     label+': settings panel must stay within short landscape viewport: '+JSON.stringify(panel));
   assert.equal(await page.evaluate(()=>window.__novaTouchGame.paused),true,
     label+': opening Pilot Settings pauses real gameplay');
   const opacity=page.getByRole('slider',{name:'Joystick opacity'});
   await opacity.focus();
   await page.keyboard.press('Home');
   assert.equal(await opacity.inputValue(),'30',
     label+': keyboard and accessibility slider input remains usable in short landscape');
   await page.getByRole('button',{name:'RESET DEFAULTS'}).click();
   await page.getByRole('button',{name:'DONE · RESUME'}).click();
   await dialog.waitFor({state:'hidden',timeout:10000});
   const after=await snapshot();
   assert.equal(await page.evaluate(()=>window.__novaTouchGame.paused),false,
     label+': Pilot Settings resumes gameplay');
   assert.equal(after.move.active,false,label+': settings cannot resurrect movement');
   assert.equal(after.aim.active,false,label+': settings cannot resurrect aim');
   assert.equal(after.firing,false,label+': settings cannot resurrect firing');
   console.log('NOVA_COMPACT_LANDSCAPE_SETTINGS '+JSON.stringify({panel,after}));
  }
  assert.deepEqual(errors,[],label+': no uncaught JavaScript exceptions');
  console.log('NOVA_REAL_TOUCH '+JSON.stringify({label,viewport,held,moving,rightUp,leftUp,cancelled,warden,events:{downs:downs.length,ups:ups.length,cancels:cancels.length},errors}));
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  await run(browser,'touch-portrait-320',{width:320,height:700});
  await run(browser,'touch-landscape-844',{width:844,height:390});
  // Compact landscape phones must retain two independently usable real-touch sticks.
  await run(browser,'touch-landscape-568',{width:568,height:320});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
