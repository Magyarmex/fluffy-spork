'use strict';
// Real Chromium touch regression: exercises the shipping React/Game/Input stack,
// never hand-dispatches fake PointerEvents and never replaces input methods.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

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
  await page.waitForFunction(()=>window.__novaTouchGame?.status==='playing',{timeout:20000});
  const rect=await canvas.boundingBox();
  assert.ok(rect&&rect.width>200&&rect.height>200,label+': game canvas has real dimensions');
  const left={x:rect.x+rect.width*.20,y:rect.y+rect.height*.68,id:11,radiusX:1,radiusY:1,force:1};
  const right={x:rect.x+rect.width*.78,y:rect.y+rect.height*.68,id:12,radiusX:1,radiusY:1,force:1};
  const leftMoved={...left,x:left.x+Math.min(42,rect.width*.13)};
  const rightMoved={...right,x:right.x+Math.min(38,rect.width*.10),y:right.y-35};
  const hit=await page.evaluate(({left,right})=>[left,right].map(p=>{
   const e=document.elementFromPoint(p.x,p.y);
   return {tag:e?.tagName,ui:!!e?.closest?.('[data-ui]'),canvas:e?.matches?.('canvas.absolute.inset-0')};
  }),{left,right});
  assert.ok(hit.every(h=>h.canvas&&!h.ui),label+': both contacts must land on actual gameplay canvas: '+JSON.stringify(hit));
  const cdp=await context.newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const snapshot=()=>page.evaluate(()=>{
   const g=window.__novaTouchGame, i=g?.input, p=g?.player;
   return {status:g?.status,x:p?.x,y:p?.y,cls:p?.cls,
    move:i&&{active:i.move.active,dx:i.move.dx,dy:i.move.dy,id:i.stickId.move},
    aim:i&&{active:i.aim.active,dx:i.aim.dx,dy:i.aim.dy,id:i.stickId.aim},
    firing:i?.firing,shots:window.__novaTouchShots,
    swarm:p?.__novaSwarm&&{active:p.__novaSwarm.active,nodeX:p.__novaSwarm.nodeX,nodeY:p.__novaSwarm.nodeY,power:p.__novaSwarm.power}};
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
  const moving=await snapshot();
  assert.ok(Math.hypot(moving.x-held.x,moving.y-held.y)>1,
   label+': actual player must move while two fingers are held: '+JSON.stringify({held,moving}));
  assert.ok(moving.shots>held.shots,
   label+': real player projectiles must launch under right-stick fire: '+JSON.stringify({held,moving}));
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
  // Warden command must be driven by the actual right touch, not merely a hull turn.
  await page.evaluate(()=>{
   const g=window.__novaTouchGame;
   g.setClass(g.player,'warden');
   g.player.spawnShieldT=20;
  });
  await page.waitForTimeout(200);
  await both();
  await page.waitForTimeout(240);
  const warden=await snapshot();
  assert.equal(warden.cls,'warden',label+': Warden transition occurred in actual game');
  assert.equal(warden.swarm?.active,true,label+': right touch activates Controller swarm command');
  assert.ok(Math.hypot(warden.swarm.nodeX-warden.x,warden.swarm.nodeY-warden.y)>35,
   label+': Controller command node follows live touch direction/depth: '+JSON.stringify(warden));
  await send('touchCancel',[]);
  await page.waitForTimeout(80);
  const events=await page.evaluate(()=>window.__novaTouchEvents);
  const downs=events.filter(e=>e.type==='pointerdown'),ups=events.filter(e=>e.type==='pointerup'),cancels=events.filter(e=>e.type==='pointercancel');
  assert.ok(downs.length>=8&&ups.length>=4&&cancels.length>=4,
   label+': Chromium generated genuine two-contact releases and cancellations: '+JSON.stringify({downs:downs.length,ups:ups.length,cancels:cancels.length}));
  assert.ok(events.every(e=>e.trusted),label+': touch events must be browser-trusted');
  assert.deepEqual(errors,[],label+': no uncaught JavaScript exceptions');
  console.log('NOVA_REAL_TOUCH '+JSON.stringify({label,viewport,held,moving,rightUp,leftUp,cancelled,warden,events:{downs:downs.length,ups:ups.length,cancels:cancels.length},errors}));
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  await run(browser,'touch-portrait-320',{width:320,height:700});
  await run(browser,'touch-landscape-844',{width:844,height:390});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
