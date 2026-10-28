'use strict';
// Real shipping-game Chromium acceptance: a public Rogue Star's INITIAL
// bearing must fit the existing toast at phone widths without live radar.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const width of [280,320]){
   const page=await browser.newPage({viewport:{width,height:568},deviceScaleFactor:2});
   const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaStarCompassGame=this;
      return old.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaStarCompassGame?.status==='playing'&&
     !!window.__novaStarCompassGame.__lfState,{timeout:30000});
    const signal=await page.evaluate(()=>{
     const g=window.__novaStarCompassGame,LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
     if(!LF||!g?.player||!g.toast)throw Error('real Director or pilot missing');
     g.setPaused(true);
     const st=g.__lfState;
     /* Jumping to age 100 must also advance the one-time age-14 ecology
      * tutorial. Otherwise its delayed startup toast overwrites the Star
      * announcement on the next real update, a fixture-only time paradox. */
     if(!st.tutorial||typeof st.tutorial.ecology!=='boolean')
      throw Error('canonical ecology tutorial state missing');
     st.tutorial.ecology=true;
     st.age=100;st.ceiling=1;st.signal=null;st.directorEnabled=true;
     st.lastSignalAt=-99;st.lastMeaningfulAt=0;
     st.migrationHeat=0;st.cooldowns.bloom=100;
     st.cooldowns.migration=100;st.cooldowns.star=0;
     /* The rare Star is allowed only when no genuine BLOOM exists.
      * Isolate that Director precondition without faking the Star itself. */
     st.sectors.forEach(s=>{s.value=0;s.maturity=.1;s.pressure=0;s.outbound=0;});
     if(g.__novaBattlefield)g.__novaBattlefield.announced=true;
     g.time=100; // Research-only natural-age gate; no forced survival in production.
     const T=window.__NOVA_LIVING_FRONT_TEST__;
     const baseline=g.shapes.find(s=>s&&s.type==='star'&&s.hp>0);
     if(!baseline)throw Error('canonical one-Star population missing');
     const priorStars=g.shapes.filter(s=>s&&s.type==='star'&&s.hp>0).length;
     const priorPosition={x:baseline.x,y:baseline.y},priorShapeCount=g.shapes.length;
     /* The browser fixture advances the AGE of an existing physical Star,
      * never removes it, creates another one, or teleports it. This isolates
      * the natural fresh-Star adoption path at a valid public decision age. */
     baseline.__lfStarBorn=g.time-2;
     baseline.__lfPublicAnnounced=false;
     const candidate=T.directorDecision(st,{enabled:true,now:g.time,
      hasStar:true,adoptStarId:baseline.id});
     let emitted=null;const old=g.toast;
     g.toast=function(message){emitted=message;return old.apply(this,arguments);};
     try{LF.directorTick(g,st);}finally{g.toast=old;g.setPaused(false);}
     const sig=st.signal,s=sig&&g.getShape&&g.getShape(sig.starId);
     return{emitted,priorStars,priorPosition,priorShapeCount,
      currentShapeCount:g.shapes.length,adoptedPosition:{x:s?.x,y:s?.y},
      candidate,bloomCandidate:T.bloomCandidate(st),type:sig?.type,starId:sig?.starId,
      initialX:sig?.x,initialY:sig?.y,
      starX:s?.x,starY:s?.y,viewport:window.innerWidth};
    });
    assert.equal(signal.type,'ROGUE STAR','real Director must announce a public Star: '+JSON.stringify(signal));
    assert.ok(signal.starId>0,'real Star entity must be present');
    assert.equal(signal.priorStars,1,'canonical one-Star population must be preserved');
    assert.equal(signal.currentShapeCount,signal.priorShapeCount,'adoption must not duplicate a Star');
    assert.deepEqual(signal.adoptedPosition,signal.priorPosition,'adoption must not teleport the Star');
    assert.equal(signal.initialX,signal.starX,'public bearing must use public report');
    assert.equal(signal.initialY,signal.starY);
    // The actual composed minimap must retain the public announcement
    // position even if the living Star has moved out of sight. The AI already
    // uses last-visible memory; the minimap must not be a stronger radar.
    const marker=await page.evaluate(()=>{
     const g=window.__novaStarCompassGame,st=g.__lfState,sig=st.signal;
     if(sig?.type!=='ROGUE STAR'||!g.mmCtx)throw Error('live Star minimap owner missing');
     const star=g.getShape(sig.starId),originalArc=g.mmCtx.arc,
      originalFill=g.mmCtx.fillRect,originalSight=g.hasLineOfSight;
     if(!star)throw Error('announced Star missing before marker verification');
     const original={x:star.x,y:star.y},points=[],dots=[];
     g.setPaused(true);
     try{
      g.mmCtx.arc=function(x,y,r){
       if(Math.abs(r-4)<1e-6)points.push([x,y]);
       return originalArc.apply(this,arguments);
      };
      g.mmCtx.fillRect=function(x,y,w,h){
       if(w===2&&h===2&&this.fillStyle==='#ffe066')dots.push([x,y]);
       return originalFill.apply(this,arguments);
      };
      const sample=()=>{
       points.length=0;dots.length=0;g.drawMinimap();
       return{points:points.slice(),dots:dots.slice()};
      };
      // Force the physical Star far outside the pilot's actual viewport,
      // without changing its frozen public report or hiding ordinary shapes.
      star.x=g.player.x>0?-2100:2100;
      star.y=g.player.y>0?-2100:2100;
      const hiddenPosition={x:star.x,y:star.y},hidden=sample();
      star.x=g.player.x;star.y=g.player.y+50;
      g.hasLineOfSight=()=>true;
      const visible=sample();
      return{points:hidden.points,hiddenDots:hidden.dots,visibleDots:visible.dots,
       expected:[(sig.x+2250)*216/4500,(sig.y+2250)*216/4500],
       live:[(hiddenPosition.x+2250)*216/4500,(hiddenPosition.y+2250)*216/4500]};
     }finally{
      g.mmCtx.arc=originalArc;g.mmCtx.fillRect=originalFill;
      g.hasLineOfSight=originalSight;
      star.x=original.x;star.y=original.y;g.setPaused(false);
     }
    });
    const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<.02;
    assert.ok(marker.points.some(p=>near(p,marker.expected)),
     'minimap must mark the frozen public report: '+JSON.stringify(marker));
    assert.ok(!marker.points.some(p=>near(p,marker.live)),
     'hidden live Star must not become a minimap tracking beacon: '+JSON.stringify(marker));
    assert.equal(marker.hiddenDots.length,0,
     'generic 2px Star dot must not reveal an off-screen live position: '+JSON.stringify(marker));
    assert.equal(marker.visibleDots.length,1,
     'Star dot should remain available when physically visible: '+JSON.stringify(marker));
    assert.match(signal.emitted,/^★ ROGUE STAR · REPORTED (?:E|SE|S|SW|W|NW|N|NE|NEAR YOU) · cut its route$/);
    assert.equal(signal.viewport,width);
    await page.waitForFunction(message=>[...document.querySelectorAll('.panel.anim-pop')].
     some(n=>n.textContent===message),signal.emitted,{timeout:10000});
    assert.equal(await page.getByText('PAUSED',{exact:true}).count(),0);
    await page.waitForTimeout(400);
    const ui=await page.evaluate(message=>{
     const n=[...document.querySelectorAll('.panel.anim-pop')].find(n=>n.textContent===message);
     if(!n)return null;
     const r=n.getBoundingClientRect(),range=document.createRange();
     range.selectNodeContents(n);
     const glyph=range.getBoundingClientRect(),gear=document.getElementById('nova-pilot-gear');
     const gr=gear&&!gear.hidden?gear.getBoundingClientRect():null;
     return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,
      glyphLeft:glyph.left,glyphRight:glyph.right,
      scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,
      scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,
      gear:gr?{left:gr.left,right:gr.right,top:gr.top,bottom:gr.bottom}:null,
      viewport:window.innerWidth,viewportHeight:window.innerHeight};
    },signal.emitted);
    assert.ok(ui,'Star announcement must remain visible after settling: '+
     JSON.stringify({signal,visible:await page.evaluate(()=>
      [...document.querySelectorAll('.panel.anim-pop')].map(n=>n.textContent)),
      state:await page.evaluate(()=>{
       const g=window.__novaStarCompassGame;
       return{time:g?.time,status:g?.status,signal:g?.__lfState?.signal,
        starCount:g?.shapes?.filter(s=>s?.type==='star'&&s.hp>0).length};
      })}));
    assert.ok(ui.left>=-1&&ui.right<=ui.viewport+1,'panel clips: '+JSON.stringify(ui));
    assert.ok(ui.glyphLeft>=-1&&ui.glyphRight<=ui.viewport+1,'text clips: '+JSON.stringify(ui));
    assert.ok(ui.scrollWidth<=ui.clientWidth+1&&ui.scrollHeight<=ui.clientHeight+1,
     'text overflows: '+JSON.stringify(ui));
    assert.ok(ui.height<110&&ui.top>=0&&ui.bottom<=ui.viewportHeight,
     'announcement obstructs portrait combat: '+JSON.stringify(ui));
    assert.ok(ui.gear,'gameplay settings button must be present');
    assert.ok(ui.bottom<=ui.gear.top||ui.top>=ui.gear.bottom||
     ui.right<=ui.gear.left||ui.left>=ui.gear.right,
     'Star announcement overlaps settings: '+JSON.stringify(ui));
    const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
    await page.screenshot({path:path.join(dir,'frontlines-rogue-star-compass-'+width+'.png')});
    assert.deepEqual(errors,[],'no runtime errors');
    results.push({width,signal,ui});
   }finally{await page.close();}
  }
  console.log('NOVA_ROGUE_STAR_COMPASS '+JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
