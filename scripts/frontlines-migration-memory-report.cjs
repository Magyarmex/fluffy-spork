'use strict';
/* Predeclared 6-pair real-game 0.28-vs-0.42 migration heat decay experiment.
 * A zero-exposure result is evidence, not an excuse to cherry-pick seeds.
 * Physical outcomes are descriptive: scripted pilot, not human skill/fun. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function collect(root,expected=6){
 const folders=fs.readdirSync(root,{withFileTypes:true})
  .filter(d=>d.isDirectory()&&d.name.startsWith('nova-frontlines-migration-memory-'))
  .map(d=>d.name).sort();
 assert.equal(folders.length,expected,'all predeclared layout/seed pairs required');
 const rows=[],censored=[];
 for(const folder of folders){
  const base=path.join(root,folder);
  const report=read(path.join(base,'frontlines-natural-match-ab.json'));
  const manifest=read(path.join(base,'frontlines-natural-manifest.json'));
  const off=read(path.join(base,'frontlines-natural-off.json'));
  const on=read(path.join(base,'frontlines-natural-on.json'));
  assert.equal(report.abMode,'migration-memory');
  assert.equal(report.initialWorldIdentical,true);
  assert.equal(report.offReplayIdentical,true);
  assert.deepEqual(report.off,report.offReplay,'OFF replay must reproduce exactly');
  assert.deepEqual(report.off,off);assert.deepEqual(report.on,on);
  assert.equal(manifest.pairs.length,1);
  const meta=manifest.pairs[0];
  assert.equal(meta.abMode,'migration-memory');
  assert.ok(['CROSSFIRE','SPLIT HORIZON','FOUR GATES'].includes(meta.layout));
  assert.equal(meta.pilotPolicy,'public-bloom-harvest-defense');
  for(const [label,arm,gate,decay] of [['OFF',off,5,.42],['ON',on,5,.28]]){
   assert.equal(arm.metadata.layout,meta.layout);
   assert.equal(arm.metadata.seed,meta.seed);
   assert.equal(arm.metadata.abMode,'migration-memory');
   assert.ok(Number.isInteger(arm.naturalMigrations)&&arm.naturalMigrations>=0);
   assert.ok(Number.isInteger(arm.migrationAIBiasSamples)&&arm.migrationAIBiasSamples>=0);
   const m=arm.migrationDiagnostics,a=arm.migrationGateAudit;
   assert.ok(m&&a,'real migration diagnostics and Director-cadence audit required');
   assert.equal(m.threshold,gate,'canonical gate must stay at 5');
   assert.equal(m.decayRate,decay,'exact research decay rate must be recorded');
   assert.equal(m.horizonSeconds,300);
   assert.ok(Number.isInteger(m.transitions)&&m.transitions>=0);
   assert.ok(Number.isInteger(m.peak15s)&&m.peak15s>=0&&m.peak15s<=m.transitions);
   assert.ok(Number.isFinite(m.peakHeat)&&m.peakHeat>=0&&m.peakHeat<=m.transitions+1e-7);
   assert.equal(m.signals,arm.naturalMigrations);
   assert.ok(Number.isInteger(a.samples)&&a.samples>0);
   assert.ok(a.peakHeat>=0&&a.peakHeat<=m.transitions+1e-7);
   for(const key of ['3','3.5','4','5']){
    assert.ok(Number.isInteger(a.at[key])&&a.at[key]>=0);
    assert.ok(Number.isInteger(a.unblocked[key])&&a.unblocked[key]>=0);
    assert.ok(a.unblocked[key]<=a.at[key]);
   }
   assert.ok(a.unblocked[String(gate)]>=arm.naturalMigrations,
    label+' public migration must be supported by real Director gate eligibility');
   assert.equal(arm.contestGateAudit.gateMismatches,0,'no visibility/contest mismatch');
  }
  if(on.naturalMigrations===0){
   censored.push({layout:meta.layout,seed:meta.seed,
    reason:on.migrationGateAudit.unblocked['5']===0?
     'No public migration eligible at gate 5; Star gate may still be affected':
     'Director eligibility sampled but no announcement'});
   /* A no-migration arm is not an unexposed arm for the heat-memory
    * intervention: the same heat also gates future ROGUE STAR adoption.
    * Preserve all physical differences and count displaced Star signals. */
  }
  function row(arm){
   return{migrations:arm.naturalMigrations,blooms:arm.naturalBlooms,
    starsAnnounced:arm.stats.starAnnouncements||0,starsSpawned:arm.stats.starsSpawned||0,
    transitions:arm.migrationDiagnostics.transitions,peakHeat:arm.migrationDiagnostics.peakHeat,
    firstSignalAt:arm.migrationDiagnostics.firstSignalAt,
    gateEligible:arm.migrationGateAudit.unblocked['5'],
    decayRate:arm.migrationDiagnostics.decayRate,
    aiMigrationBiasSamples:arm.migrationAIBiasSamples,aiRotations:arm.stats.aiRotations||0,
    contests:arm.frontline?.counts?.observedContests||0,
    score:arm.game.score,seconds:arm.game.time,pilotAlive:arm.game.pilotAlive,
    status:arm.game.status};
  }
  rows.push({layout:meta.layout,seed:meta.seed,exposed:on.naturalMigrations>0,
   off:row(off),on:row(on)});
 }
 const total=(side,key)=>rows.reduce((n,r)=>n+r[side][key],0);
 return{method:'paired natural full-match 0.42 OFF versus 0.28 ON crossing memory (gate remains 5)',
  expectedPairs:expected,observedPairs:rows.length,
  exposedPairs:rows.filter(r=>r.exposed).length,censored,
  totals:{off:{migrations:total('off','migrations'),blooms:total('off','blooms'),
   starsAnnounced:total('off','starsAnnounced'),aiMigrationBiasSamples:total('off','aiMigrationBiasSamples'),
   contests:total('off','contests'),seconds:total('off','seconds')},
   on:{migrations:total('on','migrations'),blooms:total('on','blooms'),
   starsAnnounced:total('on','starsAnnounced'),aiMigrationBiasSamples:total('on','aiMigrationBiasSamples'),
   contests:total('on','contests'),seconds:total('on','seconds')}},
  rows,limits:[
   'Six predeclared layout/seed pairs, not independent human players',
   '300s is a ceiling, never forced survival',
   'Longer migration heat memory may replace later BLOOM/ROGUE STAR signals, not only add migrations',
   'AI bias samples are not physical interceptions, visible fights or fun',
   'Migration crossing counts are physical; decayed heat and gate samples are temporally correlated',
   'ON/OFF pilot policies can diverge after public announcements',
   'Zero-migration pairs remain in denominator and may still have changed Star timing; do not claim no treatment',
   'No other AI, projectile, economy, ecology or spawn parameter is intervened on']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||'artifacts/migration-memory';
  const expected=Number(process.argv[3]||6);
  const report=collect(root,expected);
  const out=path.join(root,'migration-memory-summary.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log('NOVA_MIGRATION_THRESHOLD_AB '+JSON.stringify({
   observedPairs:report.observedPairs,exposedPairs:report.exposedPairs,
   totals:report.totals,censored:report.censored}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collect};
