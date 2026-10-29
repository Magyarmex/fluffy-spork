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

    if(label==='mobile-320'){
      // Real React/War Room DOM: one unrelated child-list mutation must not
      // cause Fieldcraft to rewrite the already-correct TIPS heading every RAF.
      const feedback=await page.evaluate(async()=>{
        const menu=document.querySelector('#root .menu-grid-bg');
        const heading=menu?.querySelector('.nv-brief-k');
        if(!menu||!heading)return {error:'canonical Fieldcraft heading missing'};
        let writes=0;
        const observer=new MutationObserver(records=>{
          writes+=records.filter(r=>r.type==='childList').length;
        });
        observer.observe(heading,{childList:true});
        const marker=document.createComment('fieldcraft-observer-probe');
        menu.appendChild(marker);
        try{await new Promise(resolve=>setTimeout(resolve,450));}
        finally{observer.disconnect();marker.remove();}
        return {writes,heading:heading.textContent,stillConnected:heading.isConnected};
      });
      assert.ok(!feedback.error&&feedback.stillConnected,
        label+': real Fieldcraft menu must be present: '+JSON.stringify(feedback));
      assert.equal(feedback.heading,'TIPS');
      assert.equal(feedback.writes,0,
        label+': unrelated DOM mutation must not perpetually rewrite TIPS: '+JSON.stringify(feedback));
      console.log('NOVA_FIELDCRAFT_OBSERVER_IDLE '+JSON.stringify(feedback));
    }

    // Fieldcraft's rotating briefing must render every registered lesson in full.
    // The previous fixed-height line silently cropped longer tactical advice on
    // 320px handsets even though the primary lobby buttons remained visible.
    if(label==='mobile-320-short'||label==='mobile-320'||label==='mobile-360'){
      await page.locator('.nova-tip-line').waitFor({state:'visible',timeout:15000});
      const tipFit=await page.evaluate(()=>{
        const line=document.querySelector('.nova-tip-line');
        const surface=line?.closest('[data-nova-slot="tips"]')||line?.parentElement;
        const tips=window.NOVATips?.current?.()||[];
        if(!line||!surface||!tips.length)return {error:'shipping Fieldcraft surface or registry unavailable'};
        const original=line.textContent;
        let worst={overflow:-1,height:0,id:null,text:null};
        for(const tip of tips){
          line.textContent=tip.text;
          const range=document.createRange();range.selectNodeContents(line);
          const glyph=range.getBoundingClientRect();
          const panel=surface.getBoundingClientRect();
          const overflow=Math.max(0,line.scrollHeight-line.clientHeight,
            glyph.bottom-panel.bottom,glyph.bottom-innerHeight);
          if(overflow>worst.overflow||
             (overflow===worst.overflow&&glyph.height>worst.height))
            worst={overflow,height:glyph.height,id:tip.id,text:tip.text};
        }
        line.textContent=worst.text;
        return {count:tips.length,worst,viewport:innerWidth,height:innerHeight,
          panel:surface.getBoundingClientRect().toJSON(),
          line:line.getBoundingClientRect().toJSON(),
          lineScrollHeight:line.scrollHeight,lineClientHeight:line.clientHeight,
          overflowStyle:getComputedStyle(line).overflowY,
          original};
      });
      assert.ok(!tipFit.error,label+': '+JSON.stringify(tipFit));
      await page.screenshot({path:path.join(output,label+'-longest-fieldcraft-tip.png')});
      if(label==='mobile-320-short'){
        // Keep the *longest* real tip mounted while checking action geometry.
        // Fixing clipping by growing the card must not push Deploy, the
        // utility row, or the Archive link off a short phone.
        const longTipActions=await page.evaluate(()=>{
          const root=document.querySelector('#root');
          const buttons=[...root.querySelectorAll('button')];
          const deploy=buttons.find(b=>/DEPLOY/i.test(b.textContent||''));
          const targets=[deploy,
            root.querySelector('[data-nova-action="blackglass"]'),
            root.querySelector('[data-nova-action="controls"]'),
            root.querySelector('[data-nova-action="debug"]')];
          const rects=targets.map(e=>e?.getBoundingClientRect().toJSON()||null);
          const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
          let node,archive=null;
          while((node=walk.nextNode())){
            if(!node.textContent.includes('OPEN ARCHIVE'))continue;
            const range=document.createRange();range.selectNodeContents(node);
            const b=range.getBoundingClientRect();
            if(b.width>0&&b.height>0){archive=b.toJSON();break;}
          }
          return {rects,archive,viewport:innerWidth,height:innerHeight};
        });
        assert.ok([...longTipActions.rects,longTipActions.archive].every(r=>
          r&&r.left>=-1&&r.top>=-1&&r.right<=longTipActions.viewport+1&&
          r.bottom<=longTipActions.height-1),
          label+': longest Fieldcraft tip must not displace primary lobby actions: '+JSON.stringify(longTipActions));
      }

      await page.evaluate(original=>{
        const line=document.querySelector('.nova-tip-line');
        if(line)line.textContent=original;
      },tipFit.original);
      assert.ok(tipFit.worst.overflow<=1,
        label+': every registered Fieldcraft tip must fit its actual lobby card and viewport: '+JSON.stringify(tipFit));
      console.log('NOVA_FIELDCRAFT_TIP_FIT '+JSON.stringify({label,...tipFit,original:undefined}));
    }

    // A 320x568 CSS-pixel handset must expose the complete primary lobby,
    // not merely a centered Deploy button with the archive/control row clipped.
    if(label==='mobile-320-short'){
      const critical={
        DEPLOY:page.getByRole('button',{name:/DEPLOY/i}).first(),
        BLACKGLASS:page.locator('[data-nova-action="blackglass"]'),
        CONTROLS:page.locator('[data-nova-action="controls"]'),
        DEBUG:page.locator('[data-nova-action="debug"]')
      };
      for(const [caption,element] of Object.entries(critical)){
        assert.ok(await element.count(),label+': missing lobby action '+caption);
        const box=await element.first().boundingBox();
        assert.ok(box&&box.x>=-1&&box.y>=-1&&
          box.x+box.width<=320+1&&box.y+box.height<=568-1,
          label+': '+caption+' must fit inside the visible lobby: '+JSON.stringify(box));
      }
      // The release archive is a text-bearing feature rail, not the hidden
      // legacy updates action. Measure its actually painted text node.
      const archive=await page.evaluate(()=>{
        const root=document.querySelector('#root');
        if(!root)return null;
        const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        let node;
        while((node=walk.nextNode())){
          if(!node.textContent.includes('OPEN ARCHIVE'))continue;
          const range=document.createRange();range.selectNodeContents(node);
          const b=range.getBoundingClientRect();
          if(b.width>0&&b.height>0)return {x:b.x,y:b.y,width:b.width,height:b.height};
        }
        return null;
      });
      assert.ok(archive&&archive.x>=-1&&archive.y>=-1&&
        archive.x+archive.width<=321&&archive.y+archive.height<=567,
        label+': OPEN ARCHIVE text must fit inside the visible lobby: '+JSON.stringify(archive));

    }


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

    // The real evolution and mastery dialogs must remain operable on short
    // phones. Trigger the shipping Game -> React event callback, not a mock
    // modal; all choices and DECIDE LATER must remain reachable.
    if(label==='landscape-568'||label==='mobile-320-short'){
      for(const [tier,title] of [
        [1,'EVOLVE — CHOOSE YOUR PATH'],
        [3,'★ MASTERY PERK ★']
      ]){
        await page.evaluate(tier=>{
          const g=window.__novaBrowserLiveGame;
          if(!g?.openOffer)throw new Error('real Game offer lifecycle unavailable');
          g.pendingOffer=tier;
          g.openOffer();
        },tier);
        const heading=page.getByText(title,{exact:true});
        await heading.waitFor({state:'visible',timeout:8000});
        // Wait for the real anim-pop entrance to settle before measuring glyphs
        // and buttons; a scaled transition can briefly hide full-size overflow.
        await page.waitForTimeout(500);
        const panel=heading.locator('xpath=..');
        const geometry=await panel.evaluate(el=>{
          const box=el.getBoundingClientRect();
          const later=[...el.querySelectorAll('button')].find(b=>
            /DECIDE LATER/i.test(b.textContent||''));
          const button=later?.getBoundingClientRect();
          return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,
            viewportWidth:innerWidth,viewportHeight:innerHeight,
            scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
            overflowY:getComputedStyle(el).overflowY,
            later:button?.toJSON()||null};
        });
        console.log('NOVA_EVOLUTION_MODAL '+JSON.stringify({label,tier,geometry}));
        await page.screenshot({path:path.join(output,label+'-offer-'+tier+'.png')});
        assert.ok(geometry.top>=-1&&geometry.bottom<=geometry.viewportHeight+1,
          label+': '+title+' must fit the visible screen: '+JSON.stringify(geometry));
        assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewportWidth+1,
          label+': '+title+' must fit the screen width: '+JSON.stringify(geometry));
        assert.ok(geometry.scrollHeight<=geometry.clientHeight+1||
          ['auto','scroll'].includes(geometry.overflowY),
          label+': tall evolution options must scroll inside the modal: '+JSON.stringify(geometry));
        await panel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        await page.waitForTimeout(100);
        const later=panel.getByRole('button',{name:/DECIDE LATER/i});
        const laterBox=await later.boundingBox();
        assert.ok(laterBox&&laterBox.y>=-1&&
          laterBox.y+laterBox.height<=geometry.viewportHeight+1,
          label+': DECIDE LATER must be reachable after scrolling: '+JSON.stringify(laterBox));
        await later.click();
        await heading.waitFor({state:'detached',timeout:8000});
        assert.equal(await page.evaluate(()=>window.__novaBrowserLiveGame?.paused),false,
          label+': dismissing the choice must resume the real game');
      }
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

    // Capture actual Canvas2D IFF strokes in the React-owned playable game,
    // not only in a mocked renderer. Mobile zoom previously shrank the
    // non-color ownership outline below one CSS pixel.
    if(label==='mobile-320'){
      const iff=await page.evaluate(async()=>{
        const g=window.__novaBrowserLiveGame,ctx=g&&g.ctx;
        if(!ctx)return {error:'live Canvas2D owner missing'};
        const original=ctx.stroke,samples=[];
        ctx.stroke=function(){
          const color=String(this.strokeStyle).toLowerCase();
          if(this.globalCompositeOperation==='lighter'&&
             Math.abs(this.globalAlpha-.58)<.0001&&
             (color==='#4da8ff'||color==='rgb(77, 168, 255)')){
            const z=g.cam.zoom||1;
            samples.push({zoom:z,width:this.lineWidth,
              expected:Math.min(1.8,Math.max(1.35,1.35*z))});
          }
          return original.apply(this,arguments);
        };
        try{await new Promise(resolve=>setTimeout(resolve,700));}
        finally{ctx.stroke=original;}
        return {samples:samples.slice(0,30),count:samples.length};
      });
      assert.ok(!iff.error&&iff.count>0,
        label+': actual Controller drones must paint shape-coded friendly IFF: '+JSON.stringify(iff));
      assert.ok(iff.samples.every(s=>Math.abs(s.width*s.zoom-s.expected)<.025),
        label+': actual IFF stroke must remain screen-pixel legible: '+JSON.stringify(iff));
      console.log('NOVA_IFF_REAL_CANVAS '+JSON.stringify({label,...iff}));
    }

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
    if(label==='desktop'||label.startsWith('mobile')||label==='landscape-568'){
      await page.evaluate(label=>{
        const g=window.__novaBrowserLiveGame;
        const enemy=g.tanks.find(t=>t&&!t.isPlayer&&t.alive);
        if(!enemy)throw new Error('real AI killer unavailable');
        enemy.cls='marksman'; // known Sniper-lineage opponent
        // The optional NEW HIGH SCORE line is the worst-case height; prove
        // both actions remain visible even when the player earns a record.
        if(label==='landscape-568')g.player.score=Math.max(200,(Number(g.best)||0)+200);
        g.player.spawnShieldT=0;g.player.shieldT=0;
        g.player.bulwarkT=0;g.player.tauntT=0;
        g.damageTank(g.player,1e8,enemy.id);
        if(g.status!=='dying')throw new Error('lethal damage did not enter dying state');
      },label);
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
      if(label==='landscape-568'){
        // A scrollable death panel can fit its outer box while hiding both
        // critical next-run actions below the fold. Require immediate access.
        const actionFit=await page.evaluate(()=>{
          const note=document.querySelector('[data-nova-death-insight]');
          const panel=note?.parentElement;
          const buttons=[...(panel?.querySelectorAll('button')||[])].filter(b=>getComputedStyle(b).display!=='none');
          const rect=b=>{const r=b.getBoundingClientRect();return{
            text:b.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
          return {height:innerHeight,scrollTop:panel?.scrollTop||0,
            actions:buttons.map(rect),panel:panel?.getBoundingClientRect().toJSON()};
        });
        assert.equal(actionFit.actions.length,3,
          'landscape death screen retains both redeploy choices and Main Menu');
        assert.ok(actionFit.actions.some(b=>/REDEPLOY FRESH/.test(b.text))&&
          actionFit.actions.some(b=>/REDEPLOY RETURN/.test(b.text))&&
          actionFit.actions.some(b=>/MAIN MENU/.test(b.text)),
          'all three next-run actions must be present');
        assert.ok(actionFit.actions.every(b=>b.top>=8&&b.bottom<=actionFit.height-8),
          'both next-run actions must be visible WITHOUT scrolling at 568x320: '+
          JSON.stringify(actionFit));
        assert.ok(actionFit.actions.every(b=>b.bottom-b.top>=30),
          'FRESH, RETURN and Main Menu must all provide >=30px physical touch targets: '+
          JSON.stringify(actionFit));
        assert.equal(actionFit.scrollTop,0,'actions must fit at initial scroll position');
        console.log('NOVA_LANDSCAPE_DEATH_ACTIONS '+JSON.stringify(actionFit));
      }
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
      if(label==='landscape-568')assert.equal(deathTitle.fontSize,'20px',
        label+': compact only the short-landscape death title');
      else if(deathTitle.viewport>=390)assert.equal(deathTitle.fontSize,'30px',
        label+': retain desktop/large-phone title scale');
      console.log('NOVA_DEATH_TITLE '+JSON.stringify({label,deathTitle}));
      await page.screenshot({path:path.join(output,label+'-death-insight.png')});
      await page.locator('[data-nova-insertion="fresh"]').click();
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
    await scenario(browser,'mobile-320-short',{viewport:{width:320,height:568},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile-360',{viewport:{width:360,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile-430',{viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    // The compact 568x320 landscape phone must keep its full death/redeploy panel on-screen.
    await scenario(browser,'landscape-568',{viewport:{width:568,height:320},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
