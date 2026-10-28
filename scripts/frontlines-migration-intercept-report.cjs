'use strict';
/* Six predeclared real-game migration A/B trials. An experiment can be
 * inconclusive when the Director never reports migration; do not discard it.
 * These are scripted-pilot outcomes, not human enjoyment or a causal estimate
 * from independent players. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function collect(root,expected=6){
 const folders=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&
  d.name.startsWith('nova-frontlines-migration-intercept-')).map(d=>d.name).sort();
 assert.equal(folders.length,expected,'all predeclared layout/seed trials must exist');
 const rows=[],censored=[];
 for(const folder of folders){
  const base=path.join(root,folder),report=read(path.join(base,'frontlines-natural-match-ab.json')),
   manifest=read(path.join(base,'frontlines-natural-manifest.json')),
   on=read(path.join(base,'frontlines-natural-on.json')),
   off=read(path.join(base,'frontlines-natural-off.json'));
  assert.equal(report.abMode,'migration-intercept');
  assert.equal(report.initialWorldIdentical,true);
  assert.equal(report.offReplayIdentical,true);
  assert.deepEqual(report.off,report.offReplay,'OFF replay must be identical');
  assert.deepEqual(report.on,on);assert.deepEqual(report.off,off);
  assert.equal(manifest.pairs.length,1);
  const meta=manifest.pairs[0];
  assert.equal(meta.abMode,'migration-intercept');
  assert.ok(['CROSSFIRE','SPLIT HORIZON','FOUR GATES'].includes(meta.layout));
  assert.equal(meta.pilotPolicy,'public-bloom-harvest-defense');
  for(const arm of [on,off]){
   assert.equal(arm.metadata.layout,meta.layout);
   assert.equal(arm.metadata.seed,meta.seed);
   assert.equal(arm.metadata.abMode,'migration-intercept');
   for(const k of ['naturalMigrations','migrationAIBiasSamples'])
    assert.ok(Number.isInteger(arm[k])&&arm[k]>=0,k+' must be measured');
   const m=arm.migrationDiagnostics;
   assert.ok(m,'migration diagnostics must be present in every real arm');
   assert.ok(Number.isInteger(m.transitions)&&m.transitions>=0,'real transitions must be counted');
   assert.ok(Number.isFinite(m.peakHeat)&&m.peakHeat>=0&&m.peakHeat<=m.transitions+1e-7,
    'migration heat must come from witnessed crossings');
   assert.ok(Number.isInteger(m.peak15s)&&m.peak15s>=0&&m.peak15s<=m.transitions,
    '15s burst must be backed by witnessed crossings');
   assert.equal(m.signals,arm.naturalMigrations,'Director and observer signal counts must agree');
   assert.equal(m.horizonSeconds,300,'all six predeclared trials use same maximum horizon');
  }
  const exposed=on.naturalMigrations>0&&off.naturalMigrations>0&&
   on.migrationAIBiasSamples>0&&off.migrationAIBiasSamples>0;
  if(!exposed)censored.push({layout:meta.layout,seed:meta.seed,
   reason:!on.naturalMigrations&&!off.naturalMigrations?
    (Math.max(on.migrationDiagnostics.transitions,off.migrationDiagnostics.transitions)===0?
     'No physical migration crossings observed':
     Math.max(on.migrationDiagnostics.peakHeat,off.migrationDiagnostics.peakHeat)<5?
      'Physical crossings occurred but decayed heat never reached the 5 gate':
      'Heat reached gate but Director never announced migration'):
    'No public migration plus AI migration bias in both arms'});
  if(!on.naturalMigrations&&!off.naturalMigrations)
   for(const key of ['game','stats','frontline','events','contestGateAudit',
     'naturalBlooms','visibleNeutralAimSamples','visibleDodgeSamples',
     'visibleHostileAimSamples'])
    assert.deepEqual(on[key],off[key],
     'without migration, physical outcome must not depend on waypoint probe: '+key);
  rows.push({layout:meta.layout,seed:meta.seed,exposed,
   off:{diagnostics:off.migrationDiagnostics,migrations:off.naturalMigrations,aiBiasSamples:off.migrationAIBiasSamples,
    score:off.game.score,pilotAlive:off.game.pilotAlive,seconds:off.game.time,
    aiRotations:off.stats.aiRotations||0,contests:off.frontline?.counts?.observedContests||0},
   on:{diagnostics:on.migrationDiagnostics,migrations:on.naturalMigrations,aiBiasSamples:on.migrationAIBiasSamples,
    score:on.game.score,pilotAlive:on.game.pilotAlive,seconds:on.game.time,
    aiRotations:on.stats.aiRotations||0,contests:on.frontline?.counts?.observedContests||0}});
 }
 return{method:'real shipping-game public migration waypoint paired scripted-pilot A/B',
  expectedPairs:expected,observedPairs:rows.length,exposedPairs:rows.filter(r=>r.exposed).length,
  censored,rows,
  physicalCrossings:{off:rows.reduce((a,r)=>a+r.off.diagnostics.transitions,0),
   on:rows.reduce((a,r)=>a+r.on.diagnostics.transitions,0)},
  peakHeat:{off:Math.max(...rows.map(r=>r.off.diagnostics.peakHeat)),
   on:Math.max(...rows.map(r=>r.on.diagnostics.peakHeat))},
  limits:['Not a human fun score','AI bias samples are not physical interceptions or visible fights',
   'BLOOM contest telemetry is not a migration-specific contact counter',
   'No-migration trials remain censored, never selected away',
   'Later public signals and pilot inputs may diverge after treatment',
   'Heat peaks are correlated time-series observations, not independent migration events',
   '300 seconds is a ceiling; the scripted pilot may die earlier']};
}
if(require.main===module){
 try{const root=process.argv[2]||'artifacts/migration',
  expected=Number(process.argv[3]||6),result=collect(root,expected);
  fs.writeFileSync(path.join(root,'migration-intercept-summary.json'),JSON.stringify(result,null,2));
  console.log('NOVA_MIGRATION_INTERCEPT_MATRIX '+JSON.stringify({
   pairs:result.observedPairs,exposed:result.exposedPairs,censored:result.censored.length,
   physicalCrossings:result.physicalCrossings,peakHeat:result.peakHeat}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collect};
