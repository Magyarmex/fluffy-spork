'use strict';
// #799 RESEARCH ONLY: one-tick Scout weapon-intent recovery after a browser-trusted
// short touch whose real Input owner armed firing but Game.update never sampled it.
// Not a production control patch, not a Controller/Sniper/Cannon certification.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {performance:clock}=require('node:perf_hooks');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const req=window.__novaMakeRequire(''),Game=req('game/engine').Game;
   const Input=req('game/input').Input,attach=Input.prototype.attach;
   const update=Game.prototype.update,fire=Game.prototype.tryFire;
   const witness=window.__novaShotPilot={trial:-1,enabled:false,armed:false,
    sampled:false,pending:null,events:[],births:[],recovered:[],rejected:[]};
   Input.prototype.attach=function(...args){
    const move=this.pm,release=this.pu;
    this.pm=function(e){
     const out=move.apply(this,arguments);
     if(e.pointerType==='touch'&&this.stickId?.aim===e.pointerId&&this.firing&&
        this.aim.active&&Math.hypot(this.aim.dx,this.aim.dy)>=9){
      witness.armed=true;
     }
     return out;
    };
    this.pu=function(e){
     const valid=e.isTrusted===true&&Number.isFinite(e.timeStamp)&&e.timeStamp>0&&\n      e.pointerType==='touch'&&e.type==='pointerup'&&
      this.stickId?.aim===e.pointerId&&this.firing&&this.aim.active&&
      Math.hypot(this.aim.dx,this.aim.dy)>=9;
     const aim=valid?{dx:this.aim.dx,dy:this.aim.dy}:null;
     const out=release.apply(this,arguments);
     if(valid&&!witness.sampled&&witness.enabled){
      witness.pending={trial:witness.trial,aim,at:e.timeStamp,
       player:window.__novaShotPilotGame?.player};
     }
     return out;
    };
    return attach.apply(this,args);
   };
   Game.prototype.update=function(...args){
    if(this.__novaDecorativeWorld||this!==window.__novaShotPilotGame)
     return update.apply(this,args);
    const w=witness,input=this.input;
    if(input.firing&&input.aim.active&&Math.hypot(input.aim.dx,input.aim.dy)>=9)
     w.sampled=true;
    const p=w.pending;w.pending=null;
    if(!p)return update.apply(this,args);
    const age=performance.now()-p.at;
    if(age<0||age>100||p.player!==this.player||this.status!=='playing'||
       this.paused||input.__novaInputPaused||document.hidden){
     w.rejected.push({trial:p.trial,age});return update.apply(this,args);
    }
    const old={firing:input.firing,active:input.aim.active,dx:input.aim.dx,dy:input.aim.dy};
    input.firing=true;input.aim.active=true;
    input.aim.dx=p.aim.dx;input.aim.dy=p.aim.dy;
    try{const result=update.apply(this,args);w.recovered.push({trial:p.trial,age});return result;}
    finally{input.firing=old.firing;input.aim.active=old.active;
     input.aim.dx=old.dx;input.aim.dy=old.dy;}
   };
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length,result=fire.call(this,t,...args);
    if(this===window.__novaShotPilotGame&&t===this.player&&this.bullets.length>before)
     witness.births.push({trial:witness.trial,at:performance.now()});
    return result;
   };
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch')witness.events.push({trial:witness.trial,type,
      stamp:e.timeStamp,at:performance.now(),trusted:e.isTrusted});
    },{capture:true,passive:true});
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.waitForFunction(()=>{
   const g=window.__novaMakeRequire('')('game/engine').Game;
   return !!window.__novaShotPilotGame||!!document.querySelector('canvas.absolute.inset-0');
  },null,{timeout:20000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   // The first non-decorative Game update owns the active match.
   const original=Game.prototype.update;
   Game.prototype.update=function(...args){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing')
     window.__novaShotPilotGame=this;
    return original.apply(this,args);
   };
  });
  await page.waitForFunction(()=>window.__novaShotPilotGame?.status==='playing',null,{timeout:20000});
  await page.evaluate(()=>{
   const g=window.__novaShotPilotGame;g.setClass(g.player,'scout');
   g.input.autofire=false;g.player.spawnShieldT=20;
  });
  const rect=await canvas.boundingBox();
  assert.ok(rect&&rect.width>200);
  const origin={x:rect.x+rect.width*.72,y:rect.y+rect.height*.68,
   id:41,radiusX:1,radiusY:1,force:1};
  const extended={...origin,x:origin.x+Math.min(35,rect.width*.12),y:origin.y-30};
  const cdp=await context.newCDPSession(page),rows=[];
  for(const rate of [1,4]){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate});
   for(const enabled of [false,true]){
    for(let trial=0;trial<8;trial++){
     const id=rows.length;
     await page.evaluate(({id,enabled})=>{
      const w=window.__novaShotPilot,g=window.__novaShotPilotGame;
      if(!g||g.status!=='playing')throw Error('match lost');
      w.trial=id;w.enabled=enabled;w.armed=false;w.sampled=false;w.pending=null;
      g.input.autofire=false;g.player.fireCd=0;g.player.spawnShieldT=20;
     },{id,enabled});
     const down=cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
     const move=cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[extended]});
     await new Promise(resolve=>setTimeout(resolve,40));
     const up=cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await Promise.all([down,move,up]);
     await page.waitForTimeout(120);
     const outcome=await page.evaluate(id=>{
      const w=window.__novaShotPilot,g=window.__novaShotPilotGame;
      const events=w.events.filter(x=>x.trial===id);
      return {armed:w.armed,sampled:w.sampled,
       recovered:w.recovered.filter(x=>x.trial===id).length,
       births:w.births.filter(x=>x.trial===id).length,
       canceled:events.some(x=>x.type==='pointercancel'),
       trusted:events.every(x=>x.trusted),
       released:events.some(x=>x.type==='pointerup'),
       stuck:!!g.input.firing||!!g.input.aim.active,
       pending:!!w.pending};
     },id);
     assert.ok(outcome.released||outcome.canceled);
     assert.ok(outcome.trusted);
     assert.equal(outcome.stuck,false,'right stick must release');
     assert.equal(outcome.pending,false,'pilot must not retain input');
     if(!enabled)assert.equal(outcome.recovered,0);
     if(enabled){\n      assert.ok(outcome.recovered<=1,'one recovered update maximum');\n      if(outcome.recovered)assert.ok(outcome.births>=1,\n       'a recovered Scout firing opportunity must create a real projectile');\n     }
     rows.push({rate,enabled,trial,...outcome});
    }
   }
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  assert.deepEqual(errors,[]);
  for(const rate of [1,4])for(const enabled of [false,true]){
   const group=rows.filter(x=>x.rate===rate&&x.enabled===enabled);
   console.log('NOVA_SHOT_ONLY_BROWSER_PILOT '+JSON.stringify({rate,enabled,
    attempts:group.length,armed:group.filter(x=>x.armed).length,
    sampled:group.filter(x=>x.sampled).length,
    recovered:group.reduce((n,x)=>n+x.recovered,0),
    births:group.reduce((n,x)=>n+x.births,0),
    armedUnsampled:group.filter(x=>x.armed&&!x.sampled).length,
    caveat:'Research-only Scout pulse A/B, sequential browser arms and synthetic CDP CPU throttling; not physical touch or Controller/Cannon/Sniper safety evidence.'}));
  }
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
