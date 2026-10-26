'use strict';
// Research-only falsification: prove the initial-overlap oracle catches
// plausible wrong implementations, not just agreement with itself.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=fs.readFileSync(path.resolve(__dirname,
  '../research/chronology-initial-overlap-atomic.js'),'utf8');
const mutations=[
 ['cover-before-body','if(covers.length){','if(false&&covers.length){'],
 ['insufficient-penetration','if(bodies.length>s.pen+1)','if(false)'],
 ['hostile-interception','if(hostile.length){','if(false&&hostile.length){'],
 ['simultaneous-cover-owners','if(covers.length>1)','if(false&&covers.length>1)'],
 ['reverse-event-time','a.time-b.time||a.kind.localeCompare','b.time-a.time||a.kind.localeCompare'],
 ['moving-body-relative-velocity','entryLocal(w.p,w.v,b.x,b.v,w.r+b.r,start,horizon)',
  'entryLocal(w.p,w.v,b.x,0,w.r+b.r,start,horizon)']
];
test('six adversarial collision-chronology mutants are rejected',()=>{
 for(const [name,needle,replacement] of mutations){
  assert.equal(script.split(needle).length,2,name+' has exactly one mutation site');
  const mutant=script.replace(needle,replacement);
  const run=spawnSync(process.execPath,['-e',mutant],{encoding:'utf8',timeout:30000});
  assert.notEqual(run.status,0,name+' survived: '+run.stdout+' '+run.stderr);
  assert.ok(/Error:/.test(run.stderr),name+' failed for an unexpected reason: '+run.stderr);
 }
});
