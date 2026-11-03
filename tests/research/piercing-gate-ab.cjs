'use strict';
/* #648 / #682: compare the draft piercing gate with the EXACT same
 * composed game minus that gate. No historical artifact or synthetic model.
 * Run: node tests/research/piercing-gate-ab.cjs
 * Node wall time is NOT physical-device frame rate.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
const overlaySuffix=path.join('nova-updates','battlefield-v1.6.0.js');
const marker='  /* A direct, bounded hull-pair proof';
const endMarker='  if(tanks.length){';
const originalRead=fs.readFileSync;
function removeGate(source){
 const start=source.indexOf(marker);
 const end=source.indexOf(endMarker,start);
 assert.ok(start>=0&&end>start,'#682 gate markers changed; do not benchmark wrong code');
 return source.slice(0,start)+source.slice(end);
}
function run({seed,hz,seconds=3,gate=true,fire=true,dense=false}){
 assert.ok(Number.isInteger(seed)&&seed>0&&[30,60].includes(hz)&&seconds>0&&seconds<=5);
 return withSeed(seed,draws=>{
  const prior=fs.readFileSync;
  fs.readFileSync=function(file,...rest){
   const data=prior.call(this,file,...rest);
   if(!gate&&typeof file==='string'&&file.endsWith(overlaySuffix))
    return removeGate(data);
   return data;
  };
  let g;
  try{g=bootGame();}
  finally{fs.readFileSync=prior;}
  try{
   const p=g.player;
   assert.ok(p&&p.alive,'composed player missing');
   g.sfx.muted=true;
   g.setClass(p,'tempest');
   if(fire){p.stats.reload=8;p.perk='alacrity';g.useAbility(p);}
   g.input.aim.active=true;g.input.aim.dx=40;
   g.input.firing=fire;g.input.autofire=false;
   if(dense){
    // Controlled crowding: relocate existing AI, never add invented actors.
    let n=0;
    for(const t of g.tanks){
     if(!t||!t.alive||t===p)continue;
     const a=2*Math.PI*n/8;
     t.x=p.x+95*Math.cos(a);t.y=p.y+95*Math.sin(a);n++;
     if(n===8)break;
    }
   }
   const start=performance.now();
   for(let i=0;i<seconds*hz;i++)g.update(1/hz);
   const elapsedMs=performance.now()-start;
   return {seed,hz,seconds,gate,fire,dense,elapsedMs,
    physicalHash:digest(physical(g)),rngDraws:draws()};
  }finally{g.destroy();}
 });
}
function median(a){const v=a.slice().sort((x,y)=>x-y);return v[Math.floor(v.length/2)];}
function suite({seeds=[1517800,1517802,1517810],passes=3,seconds=3}={}){
 const rows=[];
 for(let pass=0;pass<passes;pass++){
  const cases=[];
  for(const seed of seeds)for(const hz of [30,60])
   for(const dense of [false,true])for(const fire of [false,true])
    cases.push({seed,hz,dense,fire});
  if(pass%2)cases.reverse();
  for(const c of cases){
   const order=pass%2?[true,false]:[false,true],pair=[];
   for(const gate of order)pair.push(run({...c,gate,seconds}));
   const a=pair.find(x=>!x.gate),b=pair.find(x=>x.gate);
   assert.equal(a.physicalHash,b.physicalHash,'physical mismatch '+JSON.stringify(c));
   assert.equal(a.rngDraws,b.rngDraws,'RNG mismatch '+JSON.stringify(c));
   rows.push({...c,pass,baselineMs:a.elapsedMs,candidateMs:b.elapsedMs,
    deltaPercent:100*(b.elapsedMs/a.elapsedMs-1)});
  }
 }
 const groups=[];
 for(const hz of [30,60])for(const dense of [false,true])
  for(const fire of [false,true]){
   const group=rows.filter(r=>r.hz===hz&&r.dense===dense&&r.fire===fire);
   groups.push({hz,dense,fire,n:group.length,
    medianDeltaPercent:median(group.map(r=>r.deltaPercent)),
    medianBaselineMs:median(group.map(r=>r.baselineMs)),
    medianCandidateMs:median(group.map(r=>r.candidateMs))});
  }
 return {schema:1,method:'same-head composed game, gate stripped from baseline, counterbalanced order, seeded parity',limitations:['Node VM time, not device FPS','JIT, GC and runtime noise; no performance pass threshold','synthetic clustered AI is not natural encounter balance'],groups,rows};
}
if(require.main===module)console.log(JSON.stringify(suite(),null,2));
module.exports={run,suite,removeGate};
