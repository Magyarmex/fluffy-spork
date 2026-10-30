'use strict';
// Crasher's recover->track handoff promises a 0.28s tracking window.
// An aligned target must not erase that window on the very next ecology tick.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{}};
 const ctx={window,Math,Map,Set,Number,Object,Array,Date,JSON,
  performance:{now:()=>0},console:{info(){},error(){},warn(){}}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   ctx,{filename:name});
 return window.__NOVA_LIVING_FRONT_INTERNAL__;
}
function scenario(){
 const LF=boot();
 const cr={id:1,kind:'shape',type:'crasher',x:0,y:0,r:15,hp:95,
  vx:10,vy:0,__lfPredatorState:'track',__lfPredatorT:.28,
  __lfTargetId:2,__lfTargetKind:'tank',__lfCommitAngle:0};
 const target={id:2,kind:'tank',x:150,y:0,hp:100,maxHp:100,r:18,alive:true};
 const g={time:10,shapes:[cr],tanks:[target],bullets:[],
  getTank(id){return id===2?target:null;},hasLineOfSight(){return true;}};
 const defs={crasher:{speed:105}},st=LF.ensure(g,defs);
 return {LF,cr,target,g,defs,st,tick(dt){LF.behaviorTick(g,st,defs,dt);g.time+=dt;}};
}
test('track window is a real cooldown, not an unused timer',()=>{
 const LF=boot();
 const afterRecover=LF.crasherState('recover',.01,.02,true,true);
 assert.equal(afterRecover.state,'track');
 assert.ok(Math.abs(afterRecover.t-.28)<1e-12);
 const stillTracking=LF.crasherState('track',afterRecover.t,.10,true,true);
 assert.equal(stillTracking.state,'track',
  'aligned target must not bypass the post-recovery tracking interval');
 assert.ok(Math.abs(stillTracking.t-.18)<1e-12);
 const ready=LF.crasherState('track',stillTracking.t,.18,true,true);
 assert.equal(ready.state,'telegraph');
 assert.equal(ready.t,.40);
});
test('real Wild Instincts keeps the recovery vulnerability before a new telegraph',()=>{
 const s=scenario();
 s.tick(.1);
 assert.equal(s.cr.__lfPredatorState,'track');
 assert.equal(s.st.stats.crasherCharges,0);
 s.tick(.1);
 assert.equal(s.cr.__lfPredatorState,'track');
 s.tick(.1);
 assert.equal(s.cr.__lfPredatorState,'telegraph');
 assert.equal(s.cr.__lfPredatorT,.40);
 assert.equal(s.st.stats.crasherCharges,0);
 s.tick(.41);
 assert.equal(s.cr.__lfPredatorState,'charge');
 assert.equal(s.st.stats.crasherCharges,1);
});
for(const hz of [30,60,120,240]){
 test('Crasher track delay survives '+hz+'Hz cadence',()=>{
  const s=scenario(),dt=1/hz;
  for(let elapsed=0;elapsed+dt<.28-1e-9;elapsed+=dt){
   s.tick(dt);
   assert.equal(s.cr.__lfPredatorState,'track',
    'charge telegraph started before the advertised tracking interval');
  }
  for(let i=0;i<3&&s.cr.__lfPredatorState==='track';i++)s.tick(dt);
  assert.equal(s.cr.__lfPredatorState,'telegraph');
 });
}
test('track expiry does not manufacture a target or skip telegraph',()=>{
 const LF=boot();
 assert.equal(LF.crasherState('track',.01,.02,false,false).state,'track');
 assert.equal(LF.crasherState('track',.01,.02,true,false).state,'track');
 assert.equal(LF.crasherState('track',.01,.02,true,true).state,'telegraph');
 assert.equal(LF.crasherState('telegraph',.01,.02,true,true).state,'charge');
});
test('test exercises the actual materialized game overlay',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('./nova-updates/living-front-instincts-v1.12.0.js'));
});
