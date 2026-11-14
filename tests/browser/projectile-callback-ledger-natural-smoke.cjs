'use strict';
// Research-only browser smoke. The HTTP response is patched in this test
// context only; neither canonical index.html nor production is modified.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const PAIRED_ARM=process.env.NOVA_SHOT_LEDGER_ARM||'';
if(!['','off','on'].includes(PAIRED_ARM))throw Error('NOVA_SHOT_LEDGER_ARM must be off or on');
const OBSERVE=PAIRED_ARM!=='off';
// Different fixed seeds expose different battlefield interactions while keeping
// every OFF/OFF/ON arm for a given seed directly comparable.
const SEED_TEXT=process.env.NOVA_SHOT_LEDGER_SEED||'0x1d4a3f21';
if(!/^0x[0-9a-f]{8}$/i.test(SEED_TEXT))throw Error('NOVA_SHOT_LEDGER_SEED must be eight hex digits with 0x prefix');
const TRIAL_SEED=Number(SEED_TEXT)>>>0;
const LAYOUT_INDEX=Number(process.env.NOVA_SHOT_LEDGER_LAYOUT_INDEX??0);
if(!Number.isInteger(LAYOUT_INDEX)||LAYOUT_INDEX<0||LAYOUT_INDEX>2)
  throw Error('NOVA_SHOT_LEDGER_LAYOUT_INDEX must be 0, 1 or 2');
if(TRIAL_SEED===0)throw Error('zero xorshift seed cannot advance');
const {patchBattlefieldMutualInterception,patchSniperInterception,patchMaterializedCore,patchMaterializedRetirement,patchMaterializedInterception,patchBattlefieldCallbacks,patchBattlefieldCover}=require('../research/projectile-callback-source-patch.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:900,height:700}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  let patches=0,battlefieldPatches=0,sniperPatches=0;
  try{
    if(OBSERVE)await page.route('**/nova-updates/sniper-v1.2.0.js',async route=>{
      const response=await route.fetch(),source=await response.text();
      assert.equal(response.status(),200);sniperPatches++;
      await route.fulfill({response,body:patchSniperInterception(source)});
    });
    if(OBSERVE)await page.route('**/nova-updates/battlefield-v1.6.0.js',async route=>{
      const response=await route.fetch(),source=await response.text();
      assert.equal(response.status(),200);
      battlefieldPatches++;
      await route.fulfill({response,body:patchBattlefieldMutualInterception(patchBattlefieldCover(patchBattlefieldCallbacks(source)))});
    });
    if(OBSERVE)await page.route('http://127.0.0.1:8765/',async route=>{
      const response=await route.fetch(),html=await response.text();
      assert.equal(response.status(),200);
      const patched=patchMaterializedInterception(patchMaterializedRetirement(patchMaterializedCore(html)));
      patches++;
      await route.fulfill({response,body:patched});
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(patches,OBSERVE?1:0,'shipping HTML transformation count');
    assert.equal(battlefieldPatches,OBSERVE?1:0,'Battlefield transformation count');
    assert.equal(sniperPatches,OBSERVE?1:0,'Sniper transformation count');
    await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,
      '../research/projectile-callback-ledger.cjs'),'utf8')});
    await page.evaluate(({paired,seed,layoutIndex})=>{
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      const start=Game.prototype.start,update=Game.prototype.update;
      if(paired){
        let state=seed>>>0;
        const seeded=()=>{
          state^=state<<13;state^=state>>>17;state^=state<<5;
          return (state>>>0)/4294967296;
        };
        const spawn=Game.prototype.spawnPlayer,spawnAI=Game.prototype.spawnAITank;
        Game.prototype.spawnPlayer=function(){
          if(this.__novaTerrain||this.__novaDecorativeWorld)return spawn.apply(this,arguments);
          const rand=Math.random,now=Date.now;let first=true;
          this.__novaInitRandomRestore=rand;this.__novaInitSpawnCount=0;
          Date.now=()=>0;
          Math.random=()=>first?(first=false,layoutIndex/0x7fffffff):seeded();
          try{return spawn.apply(this,arguments);}
          finally{Date.now=now;Math.random=seeded;}
        };
        Game.prototype.spawnAITank=function(){
          const result=spawnAI.apply(this,arguments);
          if(this.__novaInitRandomRestore){
            this.__novaInitSpawnCount++;
            if(this.__novaInitSpawnCount>=8){
              Math.random=this.__novaInitRandomRestore;
              delete this.__novaInitRandomRestore;delete this.__novaInitSpawnCount;
            }
          }
          return result;
        };
        window.__novaShotSeeded=seeded;
        window.__novaShotSeedState=()=>state>>>0;
      }
      Game.prototype.start=function(){
        if(!this.__novaDecorativeWorld)window.__novaShotResearchGame=this;
        if(!paired||this.__novaDecorativeWorld)return start.apply(this,arguments);
        this.paused=true;
        const rand=Math.random,now=Date.now;
        Math.random=window.__novaShotSeeded;Date.now=()=>0;
        try{return start.apply(this,arguments);}
        finally{Math.random=rand;Date.now=now;}
      };
      Game.prototype.update=function(){
        if(!this.__novaDecorativeWorld)window.__novaShotResearchGame=this;
        return update.apply(this,arguments);
      };
    },{paired:!!PAIRED_ARM,seed:TRIAL_SEED,layoutIndex:LAYOUT_INDEX});
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaShotResearchGame?.status==='playing',
      {timeout:30000});
    const result=await page.evaluate(({observe,paired})=>{
      const g=window.__novaShotResearchGame;
      const factory=window.__novaResearchProjectileCallbackLedger?.createProjectileCallbackLedger;
      if(typeof factory!=='function')throw Error('browser ledger missing');
      g.setPaused(true);
      if(g.raf){cancelAnimationFrame(g.raf);g.raf=0;}
      const ledger=factory(g,{limit:4096});
      // Disclose the native tank ordering before the deterministic test sort.
      // Otherwise sorting could conceal a different browser startup world.
      const preSortTankIds=paired?g.tanks.map(t=>t.id):null;
      if(paired)g.tanks.sort((a,b)=>Number(a.id)-Number(b.id));
      if(observe){ledger.install();g.__novaShotLedger=ledger;}
      let frames=0,callbacks=0,scopedCalls=0,unusedScopes=0,observerErrors=0,unknown=0,unidentifiedTargets=0,coreAttributed=0,battlefieldAttributed=0,coverAttributed=0,retirements=0,ttlRetirements=0,boundsRetirements=0,ambiguousRetirements=0,rawPenOneZeroHitTtl=0,coreInterceptions=0,sniperInterceptions=0,battlefieldTtlInterceptions=0;
      // Read-only physical fingerprints: these make a later paired OFF/ON
      // comparison falsifiable without mistaking observer counts for hits.
      // Keep complete ordered state, including RNG-independent combat owners;
      // no gameplay state is modified by this witness.
      const physicalTrace=[];
      // Bounded event provenance enables later shot-ID joins without retaining
      // a full unbounded combat log or claiming event time is first contact.
      const eventSamples=[],MAX_EVENT_SAMPLES=256;
      let eventSamplesTruncated=0;
      const fingerprint=()=>{
        const state=JSON.stringify({
          time:g.time,rng:paired?window.__novaShotSeedState():null,
          player:g.player&&[g.player.id,g.player.x,g.player.y,g.player.hp,g.player.score,g.player.kills,g.player.level,g.player.alive],
          tanks:g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive,t.cls]),
          shapes:g.shapes.map(t=>[t.id,t.x,t.y,t.hp,t.type]),
          drones:g.drones.map(t=>[t.id,t.x,t.y,t.hp,t.ownerId]),
          bullets:g.bullets.map(t=>[t.id,t.x,t.y,t.ttl,t.dead,t.ownerId,t.pen,t.hits]),
          terrain:(g.__novaTerrain||[]).map(t=>[t.id,t.hp,t.solid,t.destructible]),
          powerups:(g.powerups||[]).map(t=>[t.id,t.x,t.y,t.type]),
          orbs:(g.orbs||[]).map(t=>[t.id,t.x,t.y,t.value])
        });
        let h1=2166136261,h2=0x9e3779b9;
        for(let j=0;j<state.length;j++){
          const c=state.charCodeAt(j);
          h1=Math.imul(h1^c,16777619);
          h2=Math.imul(h2^c,2246822519);
        }
        return (h1>>>0).toString(16)+':'+(h2>>>0).toString(16);
      };
      // Fold every frame into an order-sensitive digest. Ten-frame samples
      // locate broad divergence; the digest catches transient differences
      // that later converge before the next sampled epoch.
      let digestA=2166136261,digestB=0x9e3779b9;
      const foldFrame=hash=>{
        for(let j=0;j<hash.length;j++){
          const c=hash.charCodeAt(j);
          digestA=Math.imul(digestA^c,16777619);
          digestB=Math.imul(digestB^c,2246822519);
        }
      };
      const initialHash=fingerprint();
      physicalTrace.push({frame:0,hash:initialHash});foldFrame(initialHash);
      const updateMs=[];
      for(let i=0;i<600&&g.status==='playing';i++){
        const t0=performance.now();
        const rand=Math.random,now=Date.now;
        if(paired){Math.random=window.__novaShotSeeded;Date.now=()=>Math.round(g.time*1000);}
        try{g.update(1/30);}
        finally{if(paired){Math.random=rand;Date.now=now;}}
        updateMs.push(performance.now()-t0);
        if(observe){
          for(const e of ledger.snapshot().events){
            // Unknown-origin damage has scalar counters but cannot support a
            // shot-ID join; reserve the bounded sample for attributable events.
            if(!Number.isSafeInteger(e.shotId))continue;
            if(eventSamples.length>=MAX_EVENT_SAMPLES){eventSamplesTruncated++;continue;}
            eventSamples.push({frame:i+1,kind:e.kind,shotId:e.shotId,
              targetId:e.targetId,otherShotId:e.otherShotId??null,
              source:e.source??null,reason:e.reason??null,timing:e.timing??null});
          }
        }
        const s=observe?ledger.counters():{
          damageCallbacksCaptured:0,retiredAttributed:0,ttlRetirements:0,
          boundsRetirements:0,ambiguousRetirements:0,rawPenOneZeroHitTtl:0,
          coreInterceptions:0,sniperInterceptions:0,battlefieldTtlInterceptions:0,
          scopedCalls:0,unusedScopes:0,observerErrors:0,unknown:0,
          unidentifiedTargets:0,coreAttributed:0,battlefieldAttributed:0,
          coverAttributed:0,overflow:false
        };
        frames++;
        const frameHash=fingerprint();foldFrame(frameHash);
        if(frames%10===0)physicalTrace.push({frame:frames,hash:frameHash});
        callbacks+=s.damageCallbacksCaptured;retirements+=s.retiredAttributed;ttlRetirements+=s.ttlRetirements;boundsRetirements+=s.boundsRetirements;ambiguousRetirements+=s.ambiguousRetirements;rawPenOneZeroHitTtl+=s.rawPenOneZeroHitTtl;coreInterceptions+=s.coreInterceptions;sniperInterceptions+=s.sniperInterceptions;battlefieldTtlInterceptions+=s.battlefieldTtlInterceptions;scopedCalls+=s.scopedCalls;
        unusedScopes+=s.unusedScopes;observerErrors+=s.observerErrors;
        unknown+=s.unknown;unidentifiedTargets+=s.unidentifiedTargets;
        coreAttributed+=s.coreAttributed;battlefieldAttributed+=s.battlefieldAttributed;coverAttributed+=s.coverAttributed;
        if(s.overflow)throw Error('research callback buffer overflow');
        if(observe)ledger.nextFrame();
      }
      if(observe){delete g.__novaShotLedger;
        if(!ledger.uninstall())throw Error('failed to restore real damage methods');}
      updateMs.sort((a,b)=>a-b);
      return{arm:paired?(observe?'on':'off'):'smoke',preSortTankIds,layout:g.__novaBattlefield?.name??null,frames,physicalTrace,
        fullFrameDigest:(digestA>>>0).toString(16)+':'+(digestB>>>0).toString(16),eventSamples,eventSamplesTruncated,callbacks,attributedCallbacks:callbacks-unknown,coreAttributed,battlefieldAttributed,coverAttributed,retirements,ttlRetirements,boundsRetirements,ambiguousRetirements,rawPenOneZeroHitTtl,coreInterceptions,sniperInterceptions,battlefieldTtlInterceptions,scopedCalls,unusedScopes,observerErrors,unknown,unidentifiedTargets,
        p95UpdateMs:updateMs[Math.ceil(updateMs.length*.95)-1],
        maxUpdateMs:updateMs[updateMs.length-1],status:g.status,time:g.time};
    },{observe:OBSERVE,paired:!!PAIRED_ARM});
    assert.ok(result.frames>=1,'real composed game must advance');
    assert.equal(result.physicalTrace.length,1+Math.floor(result.frames/10),
      'initial and one-second physical fingerprints must be captured');
    assert.ok(result.physicalTrace.every((sample,i)=>sample.frame===i*10&&
      /^[0-9a-f]+:[0-9a-f]+$/.test(sample.hash)),
      'fingerprints must have monotonic frame epochs and bounded hash shape');
    assert.match(result.fullFrameDigest,/^[0-9a-f]+:[0-9a-f]+$/,
      'every-frame physical digest must be present');
    assert.ok(result.eventSamples.length<=256&&result.eventSamplesTruncated>=0,
      'bounded shot provenance sample');
    assert.ok(result.eventSamples.every(e=>Number.isSafeInteger(e.frame)&&
      e.frame>=1&&e.frame<=result.frames&&typeof e.kind==='string'),
      'shot provenance events must have real frame epochs');
    assert.ok(Number.isSafeInteger(result.retirements)&&result.retirements>=0,
      'core retirement witness must report bounded nonnegative count');
    assert.ok(Number.isSafeInteger(result.sniperInterceptions)&&result.sniperInterceptions>=0,
      'shipping Sniper interception events are separately counted');
    assert.ok(Number.isSafeInteger(result.coreInterceptions)&&result.coreInterceptions>=0,
      'core endpoint interception events are separately counted');
    assert.ok(Number.isSafeInteger(result.battlefieldTtlInterceptions)&&result.battlefieldTtlInterceptions>=0,
      'certified Battlefield mutual-TTL interceptions must be separately counted');
    assert.ok(result.rawPenOneZeroHitTtl<=result.ttlRetirements,
      'raw pen-one zero-hit retirements are a TTL subset, not missed-hit evidence');
    assert.equal(result.retirements,
      result.ttlRetirements+result.boundsRetirements+result.ambiguousRetirements,
      'every witnessed retirement must have exactly one terminal reason');
    assert.equal(result.observerErrors,0,'observer must not fail in natural gameplay');
    assert.ok(result.attributedCallbacks>=0&&result.attributedCallbacks<=result.callbacks,
      'attributed callback count must be bounded by actual captured callbacks');
    assert.ok(result.coreAttributed+result.battlefieldAttributed<=result.attributedCallbacks,
      'origin-specific counts cannot exceed attributed callbacks');
    assert.ok(Number.isFinite(result.time));
    assert.ok(Number.isFinite(result.p95UpdateMs),'browser Game.update CPU sample required');
    assert.deepEqual(errors,[],'no browser runtime exceptions');
    console.log(JSON.stringify({research:'shot-ledger-browser-smoke',seed:PAIRED_ARM?SEED_TEXT.toLowerCase():null,
      layoutIndex:PAIRED_ARM?LAYOUT_INDEX:null,...result}));
  }finally{
    await context.close();
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
