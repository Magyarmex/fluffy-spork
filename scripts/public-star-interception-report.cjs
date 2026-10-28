'use strict';
/* Strict predeclared six-pair natural-match report.
 * Never discard no-exposure, dead-pilot, missing, or failed arms.
 * A change in pilot policy is not proof of human benefit.
 */
const fs=require('node:fs'),path=require('node:path');
const layouts=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
const modes=['control','intercept'];
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
   if(x.protocol!=='public-star-intercept-v1'||x.mode!==mode||
      x.initial?.mode!==mode||x.initial?.seed!==seed||
      x.initial?.layout!==layouts[layout]||
      x.initial?.initialStars!==1||x.initial?.initialBots<8||
      !finite(x.result?.time)||!finite(x.result?.playerScore)||
      !finite(x.result?.audit?.announcements)||
      x.result.audit.announcements!==x.result.stats?.starAnnouncements||
      x.censored!==(x.result.time<x.horizon)||
      x.horizon!==300)throw Error('invalid natural-match evidence: '+name);
   const p=x.result.audit.pilot;
   if(p?.mode!==mode||!finite(p.cues)||!finite(p.visibleCues)||
      !finite(p.reportCues)||p.cues!==p.visibleCues+p.reportCues||
      !finite(p.near100Frames)||!finite(p.near250Frames)||
      (p.minStarDistanceAfterReport!==null&&
       (!finite(p.minStarDistanceAfterReport)||p.minStarDistanceAfterReport<0)))
     throw Error('invalid public pilot audit: '+name);
   arms[mode]={
    time:x.result.time,score:x.result.playerScore,
    announcements:x.result.audit.announcements,
    cues:p.cues,visibleCues:p.visibleCues,reportCues:p.reportCues,
    near100Frames:p.near100Frames,near250Frames:p.near250Frames,
    minDistance:p.minStarDistanceAfterReport,censored:x.censored
   };
  }
  pairs.push({layout:layouts[layout],seed,
   exposed:arms.control.announcements>0||arms.intercept.announcements>0,
   arms,deltaScore:+(arms.intercept.score-arms.control.score).toFixed(2),
   deltaTime:+(arms.intercept.time-arms.control.time).toFixed(3)});
 }
 const actual=fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&x.startsWith('layout-'));
 if(actual.length!==used.size||actual.some(x=>!used.has(x)))
  throw Error('unexpected or duplicate trial file(s)');
 const exposed=pairs.filter(p=>p.exposed),censored=pairs.filter(p=>
  p.arms.control.censored||p.arms.intercept.censored);
 const summary={protocol:'public-star-intercept-v1',pairs:pairs.length,
  exposedPairs:exposed.length,noExposurePairs:pairs.length-exposed.length,
  censoredPairs:censored.length,
  controlAnnouncements:pairs.reduce((s,p)=>s+p.arms.control.announcements,0),
  interceptAnnouncements:pairs.reduce((s,p)=>s+p.arms.intercept.announcements,0),
  interceptPublicCues:pairs.reduce((s,p)=>s+p.arms.intercept.reportCues,0),
  interceptVisibleCues:pairs.reduce((s,p)=>s+p.arms.intercept.visibleCues,0),
  interceptNear100Frames:pairs.reduce((s,p)=>s+p.arms.intercept.near100Frames,0),
  controlNear100Frames:pairs.reduce((s,p)=>s+p.arms.control.near100Frames,0),
  interpretation:'Observational scripted-pilot comparison, not a human-fun or old-vs-new minimap causal claim.',
  trials:pairs};
 return summary;
}
module.exports={collate};
if(require.main===module){
 const dir=process.argv[2]||'artifacts/star-public-intercept';
 const report=collate(dir);
 fs.mkdirSync('artifacts/star-public-report',{recursive:true});
 fs.writeFileSync('artifacts/star-public-report/summary.json',
  JSON.stringify(report,null,2)+'\n');
 console.log('NOVA_PUBLIC_STAR_REPORT '+JSON.stringify(report));
}
