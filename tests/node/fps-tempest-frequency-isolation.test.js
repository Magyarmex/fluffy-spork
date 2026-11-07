'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('Tempest frequency map never admits replenished shapes or escort drones',()=>{
  const script=path.resolve(__dirname,'../research/tempest-cadence-frequency-map.cjs');
  const output=execFileSync(process.execPath,[script],{
    cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,maxBuffer:1024*1024,
    env:{...process.env,NOVA_FREQ_HZ:'30,60',NOVA_FREQ_RELOAD:'4',
      NOVA_FREQ_SEEDS:'1517800',NOVA_FREQ_SECONDS:'2'}
  });
  const report=JSON.parse(output);
  assert.equal(report.results.length,2);
  assert.deepEqual(report.results.map(r=>r.hz),[30,60]);
  for(const row of report.results){
    assert.equal(row.worldLeaks,0);
    assert.equal(row.seconds,2);
    assert.ok(row.volleys>0);
    assert.ok(Number.isFinite(row.heat));
  }
});
