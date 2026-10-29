'use strict';
/* Real React + production overlay chain: between-life insertion is an actual
 * player choice, not a unit-only helper. No hidden world manipulation. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function run(browser,width,height){
 const context=await browser.newContext({viewport:{width,height}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update,oldToast=Game.prototype.toast;
   window.__novaFrontNotices=[];
   Game.prototype.toast=function(message,kind){
    if(!this.__novaDecorativeWorld&&String(message).includes('RETURN'))
     window.__novaFrontNotices.push({message,kind});
    return oldToast.apply(this,arguments);
   };
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing')window.__novaFrontSmokeGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFrontSmokeGame?.status==='playing',null,{timeout:30000});
  const death=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame;
   const p=g.player;
   const pos={x:p.x,y:p.y};
   g.killTank(p,null);
   return pos;
  });
  const returnButton=page.locator('[data-nova-insertion="return"]');
  await returnButton.waitFor({state:'visible',timeout:15000});
  // Freeze the *real* CSS entrance at its first frame. The former popIn
  // scale(.85) shrank a 32.4px control to 27.5px, even though the same
  // button passed after the 280ms animation finished. A settled-only
  // screenshot cannot catch this touch-target regression.
  const entry=await returnButton.evaluate(b=>{
   if(!(innerHeight<=400&&innerWidth>innerHeight))return null;
   const panel=b.closest('.panel.anim-pop');
   if(!panel)throw Error('missing React-owned death modal');
   const animation=panel.getAnimations().find(a=>a.animationName);
   if(!animation)throw Error('death modal entrance animation unavailable');
   animation.pause();
   animation.currentTime=0;
   const menu=[...panel.querySelectorAll('button')].find(node=>
    (node.textContent||'').includes('MAIN MENU'));
   if(!menu)throw Error('missing compact death Main Menu action');
   const result={height:b.getBoundingClientRect().height,
    menuHeight:menu.getBoundingClientRect().height,
    transform:getComputedStyle(panel).transform,
    animationName:getComputedStyle(panel).animationName};
   animation.finish();
   return result;
  });
  if(entry){
   assert.ok(entry.height>=30,'RETURN must remain >=30px at entrance frame zero: '+JSON.stringify(entry));
   assert.ok(entry.menuHeight>=30,'Main Menu must remain >=30px at entrance frame zero: '+JSON.stringify(entry));
   assert.equal(entry.transform,'none','compact death entrance must not shrink physical touch targets');
   assert.equal(entry.animationName,'nova-death-compact-fade',
    'only the compact death card uses the non-scaling entrance');
  }
  // React owns the modal, not this injected action row. Exercise a real DOM
  // reconciliation loss while the game remains dead: no hidden-button softlock.
  await page.evaluate(()=>{
   const row=document.querySelector('[data-nova-front-choice]');
   if(!row)throw Error('missing first death action row');
   row.remove();
  });
  await page.waitForFunction(()=>!!document.querySelector('[data-nova-insertion="return"]'),
   null,{timeout:7000});
  assert.equal(await page.locator('[data-nova-insertion="fresh"]').count(),1);
  const fit=await returnButton.evaluate(b=>{
   const rect=b.getBoundingClientRect(),font=getComputedStyle(b).fontSize;
   return {font:parseFloat(font),height:rect.height,left:rect.left,right:rect.right,
    top:rect.top,bottom:rect.bottom,width:innerWidth,viewportHeight:innerHeight,
    scrollWidth:document.documentElement.scrollWidth};
  });
  assert.ok(fit.font>=12&&fit.height>=30,'return choice must be readable and touchable: '+JSON.stringify(fit));
  assert.ok(fit.left>=0&&fit.right<=fit.width&&fit.top>=0&&fit.bottom<=fit.viewportHeight,
   'return action must remain on screen: '+JSON.stringify(fit));
  assert.ok(fit.scrollWidth<=fit.width,'return choice must not create horizontal overflow');
  // Witness a surviving physical Star through the actual React RETURN click.
  // Fix its age to ten seconds immediately before redeploy, so UI latency
  // cannot turn this into a test of a random natural Star's birth time.
  const starClock=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame,star=g.shapes.find(s=>s.type==='star'&&s.hp>0);
   if(!star)throw Error('expected the baseline physical Rogue Star');
   star.__lfStarBorn=g.time-10;
   star.__lfPublicAnnounced=true;
   return {id:star.id,age:g.time-star.__lfStarBorn};
  });
  // Witness Star age on both sides of the *actual* redeploy call. A fixed
  // wall-clock tolerance is invalid here: CI may advance 0.4+ seconds of
  // legitimate simulation between Playwright evaluations. This invariant
  // tests the clock rebase itself, not test-runner scheduling latency.
  await page.evaluate(id=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const original=Game.prototype.redeploy;
   Game.prototype.redeploy=function(){
    const before=this.shapes.find(s=>s.id===id);
    const ageBefore=before?this.time-before.__lfStarBorn:null;
    const out=original.apply(this,arguments);
    const after=this.shapes.find(s=>s.id===id);
    window.__novaStarAgeRebaseWitness={ageBefore,
     ageAfter:after?this.time-after.__lfStarBorn:null,
     timeAfter:this.time,stillHere:!!after};
    return out;
   };
  },starClock.id);
  await returnButton.click();
  await page.waitForFunction(()=>window.__novaFrontSmokeGame?.status==='playing',null,{timeout:15000});
  const after=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame;
   return {x:g.player.x,y:g.player.y,choice:g.__novaRedeployChoice,
    terrain:g.isTerrainSafe(g.player.x,g.player.y,75),notices:window.__novaFrontNotices};
  });
  // The original notice is transient: verify it while visible, before
  // running extra full-canvas pixel comparisons and unrelated star checks.
  const directions=['E','SE','S','SW','W','NW','N','NE'];
  const angle=Math.atan2(death.y-after.y,death.x-after.x);
  const bearing=directions[(Math.round(angle/(Math.PI/4))+8)%8];
  assert.ok(after.notices.some(n=>n.message==='↩ RETURN · LAST FRONT '+bearing),
   'real React redeploy must tell the player the direction of their witnessed last front: '+
   JSON.stringify(after.notices));
  await page.getByText('↩ RETURN · LAST FRONT '+bearing,{exact:true})
   .waitFor({state:'visible',timeout:2000});
  const survivingStar=await page.evaluate(id=>{
   const g=window.__novaFrontSmokeGame,star=g.getShape(id);
   return star?{age:g.time-star.__lfStarBorn,announced:star.__lfPublicAnnounced,
    now:g.time,witness:window.__novaStarAgeRebaseWitness}:null;
  },starClock.id);
  assert.ok(survivingStar,'React RETURN must retain the physical Star body');
  const ageWitness=survivingStar.witness;
  assert.ok(ageWitness&&ageWitness.stillHere,
   'the production redeploy must retain the same witnessed Star');
  assert.ok(Math.abs(ageWitness.ageBefore-ageWitness.ageAfter)<1e-6,
   'the actual redeploy call must preserve Star age exactly across its clock reset: '+
   JSON.stringify(ageWitness));
  assert.ok(Math.abs(survivingStar.age-
   (ageWitness.ageAfter+survivingStar.now-ageWitness.timeAfter))<1e-6,
   'subsequent simulation time must advance the Star age without a jump: '+
   JSON.stringify(survivingStar));
  assert.equal(survivingStar.announced,true,'a public Star must not become announceable twice');
  const waypoint=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame,ctx=g.mmCtx,m=g.__novaLastFrontMarker;
   if(!m)throw Error('RETURN waypoint was not armed');
   const x=(m.x+2250)*216/4500,y=(m.y+2250)*216/4500;
   const left=Math.max(0,Math.min(199,Math.floor(x)-8));
   const top=Math.max(0,Math.min(199,Math.floor(y)-8));
   g.__novaLastFrontMarker=null;
   g.drawMinimap(); // Baseline full materialized minimap without the waypoint.
   const base=ctx.getImageData(left,top,17,17).data;
   g.__novaLastFrontMarker=m;
   g.drawMinimap(); // Exact same world, only the fixed waypoint changes.
   const withMarker=ctx.getImageData(left,top,17,17).data;
   let changed=0,gold=0;
   for(let i=0;i<base.length;i+=4){
    if(Math.abs(base[i]-withMarker[i])+
       Math.abs(base[i+1]-withMarker[i+1])+
       Math.abs(base[i+2]-withMarker[i+2])>40)changed++;
    if(withMarker[i]>190&&withMarker[i+1]>120&&withMarker[i+1]<240&&
       withMarker[i+2]<170)gold++;
   }
   return {marker:g.__novaLastFrontMarker,time:g.time,changed,gold};
  });
  assert.ok(waypoint.marker,'RETURN must expose its fixed last-front waypoint');
  assert.ok(waypoint.changed>=10&&waypoint.gold>=5,
   'the actual minimap must visibly paint a gold last-front crosshair: '+JSON.stringify(waypoint));
  assert.equal(waypoint.marker.x,death.x);
  assert.equal(waypoint.marker.y,death.y);
  assert.ok(waypoint.marker.until-waypoint.time>20,
   'the player gets enough time to orient after redeploy');
  const dist=Math.hypot(after.x-death.x,after.y-death.y);
  assert.ok(dist>=420-1e-6&&dist<=850+1e-6,'return inserts near the witnessed front');
  assert.equal(after.terrain,true,'return position is terrain safe');
  assert.equal(after.choice,'fresh','choice resets after redeploy');
  await page.locator('[data-nova-front-choice]').waitFor({state:'hidden',timeout:5000});
  assert.deepEqual(errors,[],'no page errors');
  console.log('NOVA_REDEPLOY_FRONT_SMOKE '+JSON.stringify({width,height,dist,terrain:after.terrain,reset:after.choice}));
 }finally{await context.close();}
}

/* The original FRESH action must remain a real, independent React path.
 * RETURN's minimap marker and death position must not leak into FRESH. */
async function runFresh(browser){
 const context=await browser.newContext({viewport:{width:320,height:568}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const oldUpdate=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing')
     window.__novaFreshSmokeGame=this;
    return oldUpdate.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFreshSmokeGame?.status==='playing',null,{timeout:30000});
  await page.evaluate(()=>{
   const g=window.__novaFreshSmokeGame;
   g.killTank(g.player,null);
  });
  const fresh=page.locator('[data-nova-insertion="fresh"]');
  await fresh.waitFor({state:'visible',timeout:15000});
  await fresh.click();
  await page.waitForFunction(()=>window.__novaFreshSmokeGame?.status==='playing',null,{timeout:15000});
  const result=await page.evaluate(()=>{
   const g=window.__novaFreshSmokeGame;
   return{choice:g.__novaRedeployChoice,origin:g.__novaRedeployOrigin,
    marker:g.__novaLastFrontMarker,alive:g.player?.alive,
    safe:g.isTerrainSafe(g.player.x,g.player.y,75),
    actionCount:document.querySelectorAll('[data-nova-front-choice]').length};
  });
  assert.equal(result.choice,'fresh','FRESH must reset the next-life choice');
  assert.equal(result.origin,null,'FRESH cannot retain a stale death position');
  assert.equal(result.marker,null,'FRESH cannot display a RETURN waypoint');
  assert.equal(result.alive,true,'FRESH must return to actual combat');
  assert.equal(result.safe,true,'FRESH must preserve terrain-safe spawn');
  assert.equal(result.actionCount,0,'the death action row must be removed');
  assert.deepEqual(errors,[],'FRESH must not throw browser errors');
  console.log('NOVA_REDEPLOY_FRESH_SMOKE '+JSON.stringify(result));
 }finally{await context.close();}
}

async function main(){const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const [width,height] of [[280,568],[320,568],[568,320],[640,320],[900,700]])await run(browser,width,height);
 await runFresh(browser);
}finally{await browser.close();}}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
