'use strict';
/* Run the irregular cadence research harness in CI against the real composed
 * game. Only assert harness integrity and the existing 60Hz reference; 30Hz
 * underfire is a known bug, not a golden to preserve. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('Tempest irregular-frame research measures equal simulated time and preserves 60Hz reference',()=>{
 const file=path.resolve(__dirname,'../research/tempest-irregular-cadence-pilot.cjs');
 const raw=execFileSync(process.execPath,[file],{
  cwd:path.resolve(__dirname,'../..'),
  env:{...process.env,NOVA_JITTER_SEEDS:'1517800',NOVA_JITTER_RELOAD:'0'},
  encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024
 });
 const report=JSON.parse(raw);
 assert.equal(report.results.length,7);
 const byName=new Map(report.results.map(row=>[row.name,row]));
 assert.equal(byName.get('native60').volleys,153);
 assert.equal(byName.get('native30').frames,240);
 assert.equal(byName.get('native60').frames,480);
 assert.equal(byName.get('native120').frames,960);
 for(const row of report.results){
  assert.equal(row.seed,1517800);
  assert.equal(row.reload,0);
  assert.ok(row.volleys>0);
  assert.ok(Number.isFinite(row.heat)&&Number.isFinite(row.fireCd));
  assert.equal(row.deltaVs60,row.volleys-153);
  assert.ok(row.firstShots.length>0&&row.lastShots.length>0);
 }
 console.log('Tempest irregular cadence research:',JSON.stringify(report.results.map(({name,frames,volleys,deltaVs60,heat,peakHeat})=>({name,frames,volleys,deltaVs60,heat,peakHeat}))));
 for(const name of ['mixedSlow','mixedFast','bursty','alternating'])
  assert.ok(byName.get(name).frames>240&&byName.get(name).frames<960);
});
