'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const CLASSES=['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie'];
function run(cls,seed,kind,shot){return withSeed(seed,()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);g.tryFire=()=>{};
 const t=new ChronologicalInput(g.input),d=new FixedStepPresentation(g,t,{maxSteps:2});
 const p=shot?new ShotOnlyFirePulse(g,t):null;
 const e={pointerType:kind,pointerId:kind==='touch'?22:1,button:0,buttons:1,clientX:600,clientY:200};
 t.push(.001,'pointerdown',e);
 if(kind==='touch')t.push(.002,'pointermove',{...e,clientX:640});
 t.push(.008,'pointerup',{...e,buttons:0,clientX:640});
 for(let f=1;f<=60;f++)d.frame(f/60);
 const drones=g.drones.filter(x=>x.ownerId===g.player.id).map(x=>
  [x.id,x.x,x.y,x.vx,x.vy,x.hp,x.__novaPhase]);
 const state=g.player.__novaSwarm;
 const out={drones,recall:state?.recallUntil,active:state?.active,
  power:state?.power,nodeX:state?.nodeX,nodeY:state?.nodeY};
 if(p)p.detach();g.destroy();return out;
});}
test('short firing opportunity cannot alter any Controller drone or recall state without a real command',()=>{
 for(const cls of CLASSES)for(const seed of [1517800,1517802,1517810])
  for(const kind of ['touch','mouse']){
   const baseline=run(cls,seed,kind,false);
   const shot=run(cls,seed,kind,true);
   assert.equal(JSON.stringify(shot),JSON.stringify(baseline),`${cls}, seed=${seed}, ${kind}`);
  }
});
