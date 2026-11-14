'use strict';
// Research-only paired physical-state comparison. Browser producer must
// establish identical seeded worlds; refuse incomparable starts.
const assert=require('node:assert/strict');
function comparePhysicalTraces(off,on){
  for(const [name,run] of [['OFF',off],['ON',on]]){
    assert.ok(run&&typeof run==='object',name+' result required');
    assert.ok(Number.isSafeInteger(run.frames)&&run.frames>0,name+' frames required');
    assert.ok(Array.isArray(run.physicalTrace)&&run.physicalTrace.length>=2,name+' trace required');
    assert.equal(run.physicalTrace.length,1+Math.floor(run.frames/10),name+' trace cadence');
    run.physicalTrace.forEach((s,i)=>{
      assert.equal(s.frame,i*10,name+' frame epoch');
      assert.match(s.hash,/^[0-9a-f]+:[0-9a-f]+$/,name+' physical hash');
    });
  }
  assert.equal(off.physicalTrace[0].hash,on.physicalTrace[0].hash,
    'OFF/ON worlds differ at frame zero; refuse causal attribution');
  const common=Math.min(off.physicalTrace.length,on.physicalTrace.length);
  let firstDivergence=null;
  for(let i=1;i<common;i++){
    const a=off.physicalTrace[i],b=on.physicalTrace[i];
    if(a.hash!==b.hash){firstDivergence={frame:a.frame,off:a.hash,on:b.hash};break;}
  }
  return {initialStateMatched:true,comparedSamples:common,
    firstDivergence,identicalThroughComparedFrames:firstDivergence===null,
    complete:off.frames===on.frames,offFrames:off.frames,onFrames:on.frames};
}
module.exports={comparePhysicalTraces};
if(require.main===module){
  const fs=require('node:fs');
  if(process.argv.length!==4)throw Error('Usage: node shot-ledger-trace-compare.cjs OFF.json ON.json');
  const parse=p=>{
    const lines=fs.readFileSync(p,'utf8').trim().split(/\r?\n/);
    const line=lines.findLast(x=>x.includes('"physicalTrace"'));
    if(!line)throw Error('No physicalTrace JSON in '+p);
    return JSON.parse(line);
  };
  const result=comparePhysicalTraces(parse(process.argv[2]),parse(process.argv[3]));
  console.log(JSON.stringify(result));
  if(!result.complete||!result.identicalThroughComparedFrames)process.exitCode=1;
}
