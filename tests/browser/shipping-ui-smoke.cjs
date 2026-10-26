'use strict';
// Real Chromium/React smoke. Runs against the repository's shipping index.html,
// not a mocked module registry. It deliberately does not claim physical-device FPS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

async function assertPortraitHud(page, label, expectedClass) {
  const metrics=await page.evaluate(()=>{
    const root=document.querySelector('[class~="right-[78px]"]');
    const panel=root?.querySelector(':scope > .panel');
    const row=panel?.firstElementChild;
    const identity=row?.children[1];
    const className=identity?.querySelector('span:last-child');
    const score=row?.querySelector('[class~="ml-auto"]');
    const kills=score?.querySelector('span:first-child');
    const clock=score?.querySelector('span:last-child');
    const gene=row?.querySelector('[title^="Hybrid gene:"]');
    const buttons=[...(row?.querySelectorAll(':scope > button')||[])];
    const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};};
    return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      root:box(root),panel:box(panel),identity:box(identity),class:box(className),kills:box(kills),clock:box(clock),clockDisplay:clock&&getComputedStyle(clock).display,gene:box(gene),
      classText:className?.textContent,visibleClassWidth:className?.clientWidth,
      requiredClassWidth:className?.scrollWidth,
      buttons:buttons.map(b=>({name:b.getAttribute('aria-label'),box:box(b)}))};
  });
  assert.ok(metrics.root&&metrics.class&&metrics.kills,label+': actual TopBar exists: '+JSON.stringify(metrics));
  assert.equal(metrics.classText,expectedClass,label+': canonical class label remains present');
  assert.ok(metrics.requiredClassWidth<=metrics.visibleClassWidth,
    label+': full class name must remain readable at narrow widths: '+JSON.stringify(metrics));
  if(metrics.gene&&metrics.viewport<=360){
    assert.equal(metrics.clockDisplay,'none',label+': 320px hybrid badge takes clock space instead of clipping class');
  }else{
    assert.notEqual(metrics.clockDisplay,'none',label+': elapsed match time remains visible');
    assert.ok(metrics.kills.right+1<=metrics.clock.left,label+': kills and clock do not collide: '+JSON.stringify(metrics));
  }
  if(metrics.gene)assert.ok(metrics.class.right+1<=metrics.gene.left&&metrics.gene.right+1<=metrics.kills.left,
    label+': hybrid gene badge does not cover class or kills: '+JSON.stringify(metrics));
  assert.ok(metrics.class.right+1<=metrics.kills.left,
    label+': class identity must not collide with kill indicator: '+JSON.stringify(metrics));
  assert.ok(metrics.buttons.every(b=>b.box.bottom-b.box.top>=29.5),
    label+': compact combat controls retain at least a 30px vertical tap target: '+JSON.stringify(metrics));
  assert.ok(metrics.buttons.every(b=>b.box.left>=metrics.panel.left&&b.box.right<=metrics.panel.right+1),
    label+': autofire, leaderboard and pause remain inside HUD: '+JSON.stringify(metrics));
  assert.ok(metrics.scrollWidth<=metrics.viewport+1,
    label+': portrait HUD must not create horizontal page overflow: '+JSON.stringify(metrics));
  console.log('NOVA_PORTRAIT_HUD '+JSON.stringify({label,expectedClass,metrics}));
}

async function scenario(browser, label, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error && error.stack || error)));
  const output = path.join('artifacts','browser');
  fs.mkdirSync(output,{recursive:true});
  try {
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    const deploy = page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.locator('.nv-lobby-battlefield').waitFor({state:'attached',timeout:30000});
    const menu = await page.evaluate(() => {
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      return {
        fair:Game.prototype.__novaFairEngagement===true,
        ecology:Game.prototype.__novaLivingFrontCore===true,
        decorative:!!document.querySelector('.nv-lobby-battlefield'),
        active:window.NOVALivingFront?.snapshot?.().active
      };
    });
    assert.equal(menu.fair,true,label+': browser must load Fair Engagement owner');
    assert.equal(menu.ecology,true,label+': browser must load Living Front owner');
    assert.equal(menu.decorative,true,label+': War Room must be visible');
    assert.equal(menu.active,false,label+': War Room must not impersonate active game');
    await page.screenshot({path:path.join(output,label+'-menu.png')});

    // Observe the actual React-owned Game instance without replacing its update logic.
    await page.evaluate(()=>{
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      const original=Game.prototype.update;
      Game.prototype.update=function(dt){
        if(!this.__novaDecorativeWorld)window.__novaBrowserLiveGame=this;
        return original.apply(this,arguments);
      };
    });

    await deploy.click();
    await page.locator('canvas.absolute.inset-0').waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(1300);
    const live=await page.evaluate(()=>window.NOVALivingFront?.snapshot?.());
    assert.equal(live?.active,true,label+': actual React gameplay must advance ecology');
    assert.ok(live.age>0,label+': ecological match age must advance');
    assert.equal(live.sectors?.length,16,label+': all ecological sectors present');
    if(label.startsWith('mobile'))await assertPortraitHud(page,label+'-scout','SCOUT');
    await page.screenshot({path:path.join(output,label+'-playing.png')});

    if(label==='desktop'){
      await page.evaluate(()=>{
        const Game=window.__novaMakeRequire('')('game/engine').Game;
        const original=Game.prototype.tryFire;
        window.__novaBrowserPlayerShots=0;
        Game.prototype.tryFire=function(t){
          const n=this.bullets.length;
          const result=original.apply(this,arguments);
          if(t&&t.isPlayer&&this.bullets.length>n)window.__novaBrowserPlayerShots++;
          return result;
        };
      });
      const box=await page.locator('canvas.absolute.inset-0').boundingBox();
      assert.ok(box&&box.width>100&&box.height>100);
      await page.mouse.move(box.x+box.width*.66,box.y+box.height*.5);
      await page.keyboard.down('d');
      await page.mouse.down();
      await page.waitForTimeout(900);
      await page.mouse.up();
      await page.keyboard.up('d');
      const shots=await page.evaluate(()=>window.__novaBrowserPlayerShots);
      assert.ok(shots>0,'actual desktop mouse+WASD gameplay must launch projectiles');
    }

    await page.getByRole('button',{name:'Pause'}).click();
    await page.getByText('PAUSED',{exact:true}).waitFor({state:'visible'});
    const paused=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    await page.waitForTimeout(550);
    const still=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    assert.equal(still,paused,label+': pause must freeze ecological age');
    await page.screenshot({path:path.join(output,label+'-paused.png')});
    await page.getByRole('button',{name:/RESUME/i}).click();
    await page.waitForTimeout(600);
    const resumed=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    assert.ok(resumed>paused,label+': resume must restart ecological simulation');

    // Exercise Controller on the same live React/game path, not a synthetic VM.
    if(label.startsWith('mobile'))await page.evaluate(()=>{
      const proto=CanvasRenderingContext2D.prototype;
      const original=proto.fillText;
      window.__novaPortraitCanvasTutorialLines=0;
      proto.fillText=function(text){
        if(typeof text==='string'&&text.includes('AIM = GUN + SWARM'))
          window.__novaPortraitCanvasTutorialLines++;
        return original.apply(this,arguments);
      };
    });
    await page.evaluate(()=>{
      const g=window.__novaBrowserLiveGame;
      if(!g||!g.player)throw new Error('React-owned playable Game missing');
      g.setClass(g.player,'warden');
      g.player.spawnShieldT=20;
    });
    await page.waitForTimeout(1000);
    if(label.startsWith('mobile')){
      const early=await page.evaluate(()=>window.__novaPortraitCanvasTutorialLines);
      assert.equal(early,0,label+': canvas tutorial must not duplicate the still-visible toast');
    }
    const controller=await page.evaluate(()=>{
      const g=window.__novaBrowserLiveGame;
      return {
        cls:g.player.cls,
        drones:g.drones.filter(d=>d.ownerId===g.player.id&&d.hp>0).length,
        ecology:!!g.__lfState,
        playing:g.status==='playing'
      };
    });
    assert.equal(controller.cls,'warden',label+': live Controller class transition works');
    assert.ok(controller.drones>0,label+': Controller actually deploys allied drones');
    assert.equal(controller.ecology,true,label+': ecology remains active after class change');
    assert.equal(controller.playing,true,label+': Controller transition does not end the run');
    if(label.startsWith('mobile')){
      const toastGeometry=await page.evaluate(()=>{
        const node=document.querySelector('[class~="top-[18%]"] > .panel.anim-pop');
        const rect=node?.getBoundingClientRect();
        return rect?{left:rect.left,right:rect.right,width:rect.width,height:rect.height,
          viewport:window.innerWidth,font:getComputedStyle(node).fontSize}:null;
      });
      assert.ok(toastGeometry,'Controller tutorial toast remains present');
      assert.ok(toastGeometry.left>=0&&toastGeometry.right<=toastGeometry.viewport,
        'portrait toast stays entirely inside viewport: '+JSON.stringify(toastGeometry));
      assert.ok(toastGeometry.height<110,
        'portrait tutorial toast must not obscure a large part of the arena: '+JSON.stringify(toastGeometry));
      console.log('NOVA_PORTRAIT_TOAST '+JSON.stringify(toastGeometry));
      await page.screenshot({path:path.join(output,label+'-warden-toast.png')});
    }
    if(label.startsWith('mobile'))await assertPortraitHud(page,label+'-warden','WARDEN');
    if(label.startsWith('mobile')){
      await page.evaluate(()=>{
        const g=window.__novaBrowserLiveGame;
        g.player.gene='gunner';g.syncHud();
      });
      await page.waitForTimeout(150);
      await assertPortraitHud(page,label+'-hybrid-warden','WARDEN');
      await page.evaluate(()=>{
        const g=window.__novaBrowserLiveGame;
        g.player.gene=null;g.syncHud();
      });
      await page.waitForTimeout(100);
      await assertPortraitHud(page,label+'-warden-restored','WARDEN');
    }
    if(label.startsWith('mobile')){
      // Tutorial timing uses simulated Game.time, not wall time. Under CI load
      // a fixed sleep can elapse before the actual 2.8s game-time reveal.
      await page.waitForFunction(()=>{
        const g=window.__novaBrowserLiveGame,p=g?.player;
        return p&&Number.isFinite(p.__novaLiveVectorTutorialStart)&&
          g.time>=p.__novaLiveVectorTutorialStart+0.15;
      },null,{timeout:12000});
      await page.waitForTimeout(120);
      const timing=await page.evaluate(()=>{
        const g=window.__novaBrowserLiveGame,p=g.player;
        return {time:g.time,start:p.__novaLiveVectorTutorialStart,until:p.__novaLiveVectorTutorialUntil};
      });
      assert.ok(timing.time<timing.until,label+': tutorial observation remains inside its intended window: '+JSON.stringify(timing));
      const later=await page.evaluate(()=>window.__novaPortraitCanvasTutorialLines);
      assert.ok(later>0,label+': canvas tutorial continues teaching after toast has cleared');
    }
    await page.screenshot({path:path.join(output,label+'-warden.png')});
    // Actual React-owned death panel: verify the Fieldcraft note is truthful,
    // readable at 320px, and discarded on redeploy. No synthetic DOM fixture.
    if(label==='desktop'||label.startsWith('mobile')){
      await page.evaluate(()=>{
        const g=window.__novaBrowserLiveGame;
        const enemy=g.tanks.find(t=>t&&!t.isPlayer&&t.alive);
        if(!enemy)throw new Error('real AI killer unavailable');
        enemy.cls='marksman'; // known Sniper-lineage opponent
        g.player.spawnShieldT=0;g.player.shieldT=0;
        g.player.bulwarkT=0;g.player.tauntT=0;
        g.damageTank(g.player,1e8,enemy.id);
        if(g.status!=='dying')throw new Error('lethal damage did not enter dying state');
      });
      await page.getByText('TERMINATED',{exact:true}).waitFor({state:'visible',timeout:20000});
      const deathDiagnostic=await page.evaluate(()=>{
        const g=window.__novaBrowserLiveGame;
        const Game=window.__novaMakeRequire('')('game/engine').Game;
        return {installed:!!Game.prototype.__novaDeathInsightInstalled,
          note:g?.__novaDeathInsight,attempted:g?.__novaDeathInsightAttempted,
          observer:!!g?.__novaDeathInsightObserver,
          status:g?.status,playerAlive:g?.player?.alive,
          panels:[...document.querySelectorAll('.panel')].map(p=>p.textContent.slice(0,130)),
          extension:!!window.__NOVA_DEATH_INSIGHT_TEST__};
      });
      console.log('NOVA_DEATH_DIAGNOSTIC '+JSON.stringify({label,deathDiagnostic}));
      const note=page.locator('[data-nova-death-insight]');
      await note.waitFor({state:'visible',timeout:12000});
      const geometry=await note.evaluate(el=>{
        const n=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
        return {text:el.textContent,top:n.top,bottom:n.bottom,left:n.left,right:n.right,
          panelLeft:p.left,panelRight:p.right,panelTop:p.top,panelBottom:p.bottom,
          viewport:innerWidth,viewportHeight:innerHeight,height:n.height,
          buttons:el.querySelectorAll('button').length};
      });
      assert.match(geometry.text,/LAST OPPONENT: MARKSMAN/,
        label+': death insight must name the actual killer class');
      assert.match(geometry.text,/sightline/,
        label+': lesson must be specific to the killer lineage');
      assert.equal(geometry.buttons,0,label+': no extra combat controls');
      assert.ok(geometry.left>=geometry.panelLeft-1&&geometry.right<=geometry.panelRight+1,
        label+': insight stays within the existing panel: '+JSON.stringify(geometry));
      assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewport+1&&geometry.height<100,
        label+': insight must fit the viewport: '+JSON.stringify(geometry));
      assert.ok(geometry.panelTop>=-1&&geometry.panelBottom<=geometry.viewportHeight+1,
        label+': complete TERMINATED panel must remain vertically visible: '+JSON.stringify(geometry));
      // Measure the text glyphs, not only the block box: the 320px defect
      // paints past the panel even though the block itself remains contained.
      const deathTitle=await page.getByText('TERMINATED',{exact:true}).evaluate(el=>{
        const panel=el.parentElement,pr=panel.getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(el);
        const glyph=range.getBoundingClientRect(),style=getComputedStyle(panel);
        return {glyphLeft:glyph.left,glyphRight:glyph.right,
          innerLeft:pr.left+parseFloat(style.paddingLeft),
          innerRight:pr.right-parseFloat(style.paddingRight),
          fontSize:getComputedStyle(el).fontSize,
          letterSpacing:getComputedStyle(el).letterSpacing,
          viewport:innerWidth};
      });
      assert.ok(deathTitle.glyphLeft>=deathTitle.innerLeft-1&&
        deathTitle.glyphRight<=deathTitle.innerRight+1,
        label+': TERMINATED glyphs must fit inside the panel content box: '+
        JSON.stringify(deathTitle));
      if(deathTitle.viewport>=390)assert.equal(deathTitle.fontSize,'30px',
        label+': retain desktop/large-phone title scale');
      console.log('NOVA_DEATH_TITLE '+JSON.stringify({label,deathTitle}));
      await page.screenshot({path:path.join(output,label+'-death-insight.png')});
      await page.getByRole('button',{name:/REDEPLOY/}).click();
      await page.waitForFunction(()=>window.__novaBrowserLiveGame?.status==='playing',
        null,{timeout:15000});
      assert.equal(await note.count(),0,label+': previous-life insight must be removed');
      if(label==='desktop'){
        await page.evaluate(()=>{
          const g=window.__novaBrowserLiveGame;
          g.killTank(g.player,null); // unknown cause cannot inherit the old killer
        });
        await page.getByText('TERMINATED',{exact:true}).waitFor({state:'visible',timeout:20000});
        assert.equal(await note.count(),0,'unknown second-life death must not fabricate a killer');
      }
    }
    assert.deepEqual(errors,[],label+': no uncaught browser exceptions');
    console.log('NOVA_BROWSER_SMOKE '+JSON.stringify({label,menu,liveAge:live.age,paused,resumed,errors}));
  } finally {
    await context.close();
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
  try {
    await scenario(browser,'desktop',{viewport:{width:1280,height:800},deviceScaleFactor:1});
    await scenario(browser,'mobile-320',{viewport:{width:320,height:700},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile-360',{viewport:{width:360,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile-430',{viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
