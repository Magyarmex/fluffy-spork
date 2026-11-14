'use strict';
// Research-only full-game paired trial. Requires the same local HTTP server
// as projectile-callback-ledger-natural-smoke.cjs (port 8765).
// No source changes are made to the shipping game.
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {comparePhysicalTraces}=require('../research/shot-ledger-trace-compare.cjs');
function arm(mode){
  const result=spawnSync(process.execPath,
    [path.join(__dirname,'projectile-callback-ledger-natural-smoke.cjs')],{
      env:{...process.env,NOVA_SHOT_LEDGER_ARM:mode},
      encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024
    });
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(mode+' browser arm failed:\n'+
    (result.stderr||'')+'\n'+(result.stdout||'').slice(-4000));
  const line=result.stdout.split(/\r?\n/).findLast(s=>s.includes('"research":"shot-ledger-browser-smoke"'));
  if(!line)throw Error(mode+' arm did not emit browser smoke JSON');
  const data=JSON.parse(line);
  assert.equal(data.arm,mode,'browser arm identity');
  assert.equal(data.observerErrors,0,'observer errors in '+mode);
  return data;
}
const off=arm('off'),on=arm('on');
const comparison=comparePhysicalTraces(off,on);
const report={research:'shot-ledger-paired-physical-parity',
  comparison,off:{frames:off.frames,p95UpdateMs:off.p95UpdateMs,maxUpdateMs:off.maxUpdateMs},
  on:{frames:on.frames,p95UpdateMs:on.p95UpdateMs,maxUpdateMs:on.maxUpdateMs,
    attributedCallbacks:on.attributedCallbacks,retirements:on.retirements,
    sniperInterceptions:on.sniperInterceptions,battlefieldTtlInterceptions:on.battlefieldTtlInterceptions},
  p95DifferenceMs:on.p95UpdateMs-off.p95UpdateMs,
  caveat:'Sequential Chromium CPU samples are not a real-device frame-pacing or isolated observer-cost measurement'};
console.log(JSON.stringify(report));
assert.ok(comparison.complete,'both trials must complete the same number of frames');
assert.equal(comparison.firstDivergence,null,'read-only observer changed physical state or trial was not deterministic');
