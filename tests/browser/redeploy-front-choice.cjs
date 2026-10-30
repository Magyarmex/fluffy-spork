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
  assert.equal(await returnButton.textContent(),'↩ RETURN · NEAR FRONT');
  assert.match(await returnButton.getAttribute('aria-label'),/^↩ RETURN · NEAR FRONT.*420–850 world units.*No stat bonus/);
  assert.equal(await page.locator('[data-nova-insertion="fresh"]').textContent(),'⚡ FRESH · RANDOM');
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
  // The React toast lasts only 2.6s. Capture its actual DOM box immediately
  // after the real click, before unrelated game-state/geometry evaluations
  // can outlive it on a slow CI runner. This is not a Game.toast-only witness.
  const cueDom=await page.getByText(/^↩ RETURN · FRONT /).evaluate(el=>{
   const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
   return {message:(el.textContent||'').trim(),
    left:rect.left,right:rect.right,width:rect.width,height:rect.height,
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    visible:rect.width>0&&rect.height>0&&style.display!=='none'&&
     style.visibility==='visible'&&Number(style.opacity)>0};
  });
  await page.waitForFunction(()=>window.__novaFrontSmokeGame?.status==='playing',null,{timeout:15000});
  const after=await page.evaluate(origin=>{
   const g=window.__novaFrontSmokeGame;
   const directBlocked=!g.hasLineOfSight(g.player.x,g.player.y,origin.x,origin.y,24);
   return {x:g.player.x,y:g.player.y,choice:g.__novaRedeployChoice,
    directBlocked,terrain:g.isTerrainSafe(g.player.x,g.player.y,75),
    notices:window.__novaFrontNotices};
  },death);
  // The original notice is transient: verify it while visible, before
  // running extra full-canvas pixel comparisons and unrelated star checks.
  const directions=['E','SE','S','SW','W','NW','N','NE'];
  const angle=Math.atan2(death.y-after.y,death.x-after.x);
  const bearing=directions[(Math.round(angle/(Math.PI/4))+8)%8];
  const direct=Math.round(Math.hypot(death.x-after.x,death.y-after.y)/10)*10;
  const cue='↩ RETURN · FRONT '+bearing+' · ~'+direct+'u'+
   (after.directBlocked?' · COVER':'');
  assert.ok(after.notices.some(n=>n.message===cue),
   'real React redeploy must tell the player the direction of their witnessed last front: '+
   JSON.stringify(after.notices));
  assert.equal(cueDom.message,cue,
   'the real React DOM must render the exact witnessed RETURN cue');
  assert.ok(cueDom.visible,
   'RETURN notice must actually be visible after the React click: '+JSON.stringify(cueDom));
  assert.ok(cueDom.left>=-1&&cueDom.right<=cueDom.viewport+1&&
   cueDom.scrollWidth<=cueDom.viewport+1,
   'RETURN orientation notice must fit the actual mobile viewport: '+JSON.stringify(cueDom));
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
  // Real Battlefield geometry, not a mocked visibility response: a nearby
  // intact barricade must not make the remembered-front marker disappear.
  const blockedApproach=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame,oldPlayer={x:g.player.x,y:g.player.y};
   const oldMarker=g.__novaLastFrontMarker;
   let candidate=null;
   for(const wall of g.__novaTerrain||[]){
    if(!wall||wall.shape!=='rect'||!wall.destructible||!(wall.hp>0))continue;
    if(Math.min(wall.w,wall.h)>70)continue;
    const pad=28,alongY=wall.h<=wall.w;
    const a=alongY?{x:wall.x,y:wall.y-wall.h/2-pad}:
     {x:wall.x-wall.w/2-pad,y:wall.y};
    const b=alongY?{x:wall.x,y:wall.y+wall.h/2+pad}:
     {x:wall.x+wall.w/2+pad,y:wall.y};
    if(Math.hypot(a.x-b.x,a.y-b.y)>=130)continue;
    if(!g.isTerrainSafe(a.x,a.y,24)||!g.isTerrainSafe(b.x,b.y,24))continue;
    if(g.hasLineOfSight(a.x,a.y,b.x,b.y,24))continue;
    candidate={wallId:wall.id,a,b};break;
   }
   if(!candidate)throw Error('no real intact short barricade for blocked approach');
   try{
    g.player.x=candidate.a.x;g.player.y=candidate.a.y;
    g.__novaLastFrontMarker={x:candidate.b.x,y:candidate.b.y,until:g.time+24};
    g.drawMinimap();
    const retained=!!g.__novaLastFrontMarker;
    g.player.x=candidate.b.x;g.player.y=candidate.b.y;
    g.drawMinimap();
    return {...candidate,retained,cleared:g.__novaLastFrontMarker===null};
   }finally{
    g.player.x=oldPlayer.x;g.player.y=oldPlayer.y;
    g.__novaLastFrontMarker=oldMarker;
   }
  });
  assert.equal(blockedApproach.retained,true,
   'RETURN marker must remain across real intact cover: '+JSON.stringify(blockedApproach));
  assert.equal(blockedApproach.cleared,true,
   'arrival on the same side must remove the marker: '+JSON.stringify(blockedApproach));
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

/* Exercise the *blocked* branch against real intact Battlefield geometry.
 * The ordinary randomized RETURN smoke may land on a clear route in every
 * viewport, so its green result alone cannot certify the new COVER cue. */
async function runCoverCue(browser){
 const context=await browser.newContext({viewport:{width:320,height:568}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const update=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing')
     window.__novaCoverSmokeGame=this;
    return update.apply(this,arguments);
   };
   const randSpawn=Game.prototype.randSpawnPos;
   Game.prototype.randSpawnPos=function(minDist){
    if(this.__novaFrontSpawnArmed&&minDist===900){
     const previous=Math.random;let draws=0;
     Math.random=()=>draws++<2?0:previous(); // Only RETURN angle/radius.
     try{return randSpawn.apply(this,arguments);}finally{Math.random=previous;}
    }
    return randSpawn.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaCoverSmokeGame?.status==='playing',null,{timeout:30000});
  const setup=await page.evaluate(()=>{
   const g=window.__novaCoverSmokeGame;
   let chosen=null;
   for(const wall of g.__novaTerrain||[]){
    if(!wall||wall.shape!=='rect'||!wall.destructible||!(wall.hp>0))continue;
    const origin={x:wall.x-210,y:wall.y},spawn={x:wall.x+210,y:wall.y};
    if(Math.abs(origin.x)>2050||Math.abs(spawn.x)>2050)continue;
    if(!g.isTerrainSafe(origin.x,origin.y,75)||!g.isTerrainSafe(spawn.x,spawn.y,75))continue;
    if(g.hasLineOfSight(origin.x,origin.y,spawn.x,spawn.y,24))continue;
    chosen={origin,spawn,wallId:wall.id};break;
   }
   if(!chosen)throw Error('no intact real-cover eastward RETURN scenario');
   g.player.x=chosen.origin.x;g.player.y=chosen.origin.y;
   g.killTank(g.player,null);
   return chosen;
  });
  const button=page.locator('[data-nova-insertion="return"]');
  await button.waitFor({state:'visible',timeout:15000});
  await button.click();
  await page.waitForFunction(()=>window.__novaCoverSmokeGame?.status==='playing',null,{timeout:15000});
  const result=await page.evaluate(origin=>{
   const g=window.__novaCoverSmokeGame;
   return {x:g.player.x,y:g.player.y,
    directBlocked:!g.hasLineOfSight(g.player.x,g.player.y,origin.x,origin.y,24),
    marker:!!g.__novaLastFrontMarker};
  },setup.origin);
  assert.ok(Math.abs(result.x-setup.spawn.x)<1e-6&&Math.abs(result.y-setup.spawn.y)<1e-6,
   'test must force the intended 420u physical RETURN position: '+JSON.stringify({setup,result}));
  assert.equal(result.directBlocked,true,'real intact cover must obstruct direct return');
  assert.equal(result.marker,true,'blocked direct line must retain the front waypoint');
  const cue='↩ RETURN · FRONT W · ~420u · COVER';
  const el=page.getByText(cue,{exact:true});
  await el.waitFor({state:'visible',timeout:2500});
  const fit=await el.evaluate(node=>{const r=node.getBoundingClientRect();
   return {left:r.left,right:r.right,viewport:innerWidth,
    scrollWidth:document.documentElement.scrollWidth};});
  assert.ok(fit.left>=-1&&fit.right<=fit.viewport+1&&fit.scrollWidth<=fit.viewport+1,
   'actual blocked-route cue must fit a 320px viewport: '+JSON.stringify(fit));
  assert.deepEqual(errors,[]);
  console.log('NOVA_REDEPLOY_COVER_CUE_SMOKE '+JSON.stringify({setup,result,fit}));
 }finally{await context.close();}
}

async function main(){const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const [width,height] of [[280,568],[320,568],[568,320],[640,320],[900,700]])await run(browser,width,height);
 await runFresh(browser);
 await runCoverCue(browser);
}finally{await browser.close();}}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
