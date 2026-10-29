'use strict';
/* Strict predeclared six-pair natural-match report.
 * Never discard no-exposure, dead-pilot, missing, or failed arms.
 * A change in pilot policy is not proof of human benefit; route actions are counted separately from visible cues.
 */
const fs=require('node:fs'),path=require('node:path');
const layouts=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
const modes=['control','routecut'];
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function collate(dir){
 const pairs=[],used=new Set();
 for(let layout=0;layout<3;layout++)for(let seed=0;seed<2;seed++){
  const arms={};
  for(const mode of modes){
   const name=`layout-${layout}-seed-${seed}-${mode}.json`;
   const file=path.join(dir,name);
   if(!fs.existsSync(file))throw Error('missing predeclared arm: '+name);
   const x=JSON.parse(fs.readFileSync(file,'utf8'));used.add(name);
   if(x.protocol!=='public-star-routecut-v1'||x.mode!==mode||
      x.initial?.mode!==mode||x.initial?.seed!==seed||
      x.initial?.layout!==layouts[layout]||
      x.initial?.initialStars!==1||x.initial?.initialBots<8||
      !finite(x.result?.time)||!finite(x.result?.playerScore)||
      !finite(x.result?.audit?.announcements)||
      x.result.audit.announcements!==(x.result.stats?.starAnnouncements||0)||
      x.censored!==(x.result.time<x.horizon)||
      x.horizon!==300)throw Error('invalid natural-match evidence: '+name);
   const p=x.result.audit.pilot;
   if(p?.mode!==mode||!finite(p.cues)||!finite(p.visibleCues)||
      !finite(p.reportCues)||p.cues!==p.visibleCues+p.reportCues||
      !finite(p.near100Frames)||!finite(p.near250Frames)||
      !finite(p.routeActions)||p.routeActions<0||p.routeActions>p.cues||
      !finite(p.routeVisibleActions)||!finite(p.routeReportActions)||
      p.routeVisibleActions<0||p.routeReportActions<0||
      p.routeVisibleActions+p.routeReportActions!==p.routeActions||
      (p.minStarDistanceAfterReport!==null&&
       (!finite(p.minStarDistanceAfterReport)||p.minStarDistanceAfterReport<0)))
     throw Error('invalid public pilot audit: '+name);
   arms[mode]={
    time:x.result.time,score:x.result.playerScore,
    announcements:x.result.audit.announcements,
    cues:p.cues,visibleCues:p.visibleCues,reportCues:p.reportCues,
    routeActions:p.routeActions,
    routeVisibleActions:p.routeVisibleActions,routeReportActions:p.routeReportActions,
    near100Frames:p.near100Frames,near250Frames:p.near250Frames,
    minDistance:p.minStarDistanceAfterReport,censored:x.censored
   };
  }
  pairs.push({layout:layouts[layout],seed,
   exposed:arms.control.announcements>0||arms.routecut.announcements>0,
   arms,deltaScore:+(arms.routecut.score-arms.control.score).toFixed(2),
   deltaTime:+(arms.routecut.time-arms.control.time).toFixed(3)});
 }
 const actual=fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&x.startsWith('layout-'));
 if(actual.length!==used.size||actual.some(x=>!used.has(x)))
  throw Error('unexpected or duplicate trial file(s)');
 const exposed=pairs.filter(p=>p.exposed),censored=pairs.filter(p=>
  p.arms.control.censored||p.arms.routecut.censored);
 const summary={protocol:'public-star-routecut-v1',pairs:pairs.length,
  exposedPairs:exposed.length,noExposurePairs:pairs.length-exposed.length,
  censoredPairs:censored.length,
  controlAnnouncements:pairs.reduce((s,p)=>s+p.arms.control.announcements,0),
  routecutAnnouncements:pairs.reduce((s,p)=>s+p.arms.routecut.announcements,0),
  routecutActions:pairs.reduce((s,p)=>s+p.arms.routecut.routeActions,0),
  routecutReportActions:pairs.reduce((s,p)=>s+p.arms.routecut.routeReportActions,0),
  routecutVisibleActions:pairs.reduce((s,p)=>s+p.arms.routecut.routeVisibleActions,0),
  routecutPublicCues:pairs.reduce((s,p)=>s+p.arms.routecut.reportCues,0),
  routecutVisibleCues:pairs.reduce((s,p)=>s+p.arms.routecut.visibleCues,0),
  routecutNear100Frames:pairs.reduce((s,p)=>s+p.arms.routecut.near100Frames,0),
  controlNear100Frames:pairs.reduce((s,p)=>s+p.arms.control.near100Frames,0),
  interpretation:'Observational scripted-pilot comparison, not a human-fun or old-vs-new minimap causal claim.',
  trials:pairs};
 return summary;
}
module.exports={collate};
if(require.main===module){
 const dir=process.argv[2]||'artifacts/star-public-routecut';
 const report=collate(dir);
 fs.mkdirSync('artifacts/star-routecut-report',{recursive:true});
 fs.writeFileSync('artifacts/star-routecut-report/summary.json',
  JSON.stringify(report,null,2)+'\n');
 console.log('NOVA_PUBLIC_STAR_ROUTECUT_REPORT '+JSON.stringify(report));
}
