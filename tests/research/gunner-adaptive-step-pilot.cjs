'use strict';
/* #648: RESEARCH ONLY. An adaptive presentation frame can execute 2x60Hz
 * updates while firing and 1x30Hz while idle. This tests its actual cost,
 * projectile counts and world divergence against native30 and fixed60.
 * It is NOT a shipping scheduler, input model, or device FPS claim.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
const SEEDS=[1517800,1517802,1517810];
function run({seed,mode,scenario='mixed',seconds=6}){
 assert.ok(SEEDS.includes(seed)&&['native30','fixed60','adaptive'].includes(mode)&&
  ['mixed','held','pulse'].includes(scenario)&&seconds===6);
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  assert.ok(p&&p.alive);
  g.sfx.muted=true;g.setClass(p,'tempest');
  p.stats.reload=8;p.perk='alacrity';
  // Prevent mortality from censoring the timebase experiment; not natural play.
  p.hp=1e6;p.maxHp=1e6;
  g.input.autofire=false;g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  let shots=0,fireCalls=0,peakHeat=0;
  const old=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const out=old.apply(this,arguments);
   if(t===p){fireCalls++;shots+=Math.max(0,this.bullets.length-before);}
   return out;
  };
  const checkpoints=[],start=performance.now();
  try{
   for(let frame=0;frame<seconds*30;frame++){
    const t=frame/30;
    const fire=scenario==='held'||(scenario==='mixed'&&t>=2&&t<5)||
     (scenario==='pulse'&&frame%2===0);
    g.input.firing=fire;
    if(((scenario==='held'||scenario==='pulse')&&frame===0)||(scenario==='mixed'&&frame===60))
      g.useAbility(p);
    const ticks=mode==='fixed60'||(mode==='adaptive'&&fire)?2:1;
    for(let k=0;k<ticks;k++){
     g.update(1/(ticks===2?60:30));
     peakHeat=Math.max(peakHeat,p.__v17Heat||0);
    }
    if(frame===59||frame===149||frame===179)
     checkpoints.push({at:(frame+1)/30,shots,hash:digest(physical(g)),
      rngDraws:draws(),heat:p.__v17Heat||0});
   }
   return {seed,mode,scenario,seconds,shots,fireCalls,peakHeat,
    elapsedMs:performance.now()-start,finalHash:digest(physical(g)),
    rngDraws:draws(),checkpoints};
  }finally{g.destroy();}
 });
}
function suite(){
 const rows=[];
 for(let pass=0;pass<3;pass++){
  const configs=[];
  for(const seed of SEEDS)for(const scenario of ['mixed','held','pulse'])
   for(const mode of ['native30','fixed60','adaptive'])
    configs.push({seed,scenario,mode});
  if(pass===1)configs.reverse();
  if(pass===2)configs.sort((a,b)=>a.mode.localeCompare(b.mode)||b.seed-a.seed);
  for(const c of configs)rows.push({...run(c),pass});
 }
 const groups=[];
 for(const scenario of ['mixed','held','pulse'])for(const seed of SEEDS)
  for(let pass=0;pass<3;pass++){
   const arm=mode=>rows.find(r=>r.scenario===scenario&&r.seed===seed&&r.pass===pass&&r.mode===mode);
   const native=arm('native30'),fixed=arm('fixed60'),adaptive=arm('adaptive');
   if(scenario==='held'){
    assert.equal(adaptive.finalHash,fixed.finalHash,'held adaptive must exactly equal fixed60');
    assert.equal(adaptive.rngDraws,fixed.rngDraws);
    assert.equal(adaptive.shots,fixed.shots);
   }
   groups.push({scenario,seed,pass,nativeShots:native.shots,
    fixedShots:fixed.shots,adaptiveShots:adaptive.shots,
    adaptiveVsFixedShotDelta:adaptive.shots-fixed.shots,
    adaptiveVsFixedWorldEqual:adaptive.finalHash===fixed.finalHash,
    adaptiveVsFixedRngEqual:adaptive.rngDraws===fixed.rngDraws,
    nativeMs:native.elapsedMs,fixedMs:fixed.elapsedMs,adaptiveMs:adaptive.elapsedMs});
  }
 return {schema:1,method:'actual 49-overlay Game, 3 seeds, 3 counterbalanced passes; 30Hz presentation; fixed60 vs adaptive vs native30',limits:['Node VM CPU, not device FPS','synthetic 1e6 HP prevents death censoring','mixed input: 2s idle, 3s firing with legal Overheat, 1s idle','no input-event chronology or actual render measured','mixed world-state differences are expected, not automatically defects'],groups,rows};
}
if(require.main===module)console.log(JSON.stringify(suite(),null,2));
module.exports={run,suite};
