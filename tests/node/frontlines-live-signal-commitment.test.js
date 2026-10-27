'use strict';
// A small subset of healthy, unengaged rivals should be able to act on the
// PUBLIC five-second BLOOM announcement, not only on its fading afterimage.
// This is the real composed Living Front AI wrapper, not a duplicate model.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 const window={__novaModules:{
  'game/engine':function(m){m.exports={Game:class{}};},
  'game/ai':function(m){m.exports={updateAI:function(t,g,dt){g.moveTank(t,-100,0,dt);}};}
 }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const mod={exports:{}};window.__novaModules['game/ai'](mod,mod.exports,()=>({SHAPE_DEFS:{}}));
 const t={id:7,x:-1130,y:-600,hp:100,maxHp:100,alive:true,spawnShieldT:0,
  ai:{isElite:false,__v1112TargetId:-1,__v180HitAt:-99,__v180Posture:'investigate'}};
 const st={signal:{type:'BLOOM',sector:5,x:-562.5,y:-562.5,started:105,until:110},
  directorEnabled:true,bloomMemory:{sector:5,announcedAt:105,until:129,initialValue:500},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),
  stats:{aiRotations:0}};
 const moves=[],originalMove=(_t,x,y)=>moves.push({x,y});
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st,
  moveTank:originalMove,tankSpeed:()=>100};
 const tick=(dt=.3)=>{t.ai.__lfEcoT=0;mod.exports.updateAI(t,g,dt);return moves.at(-1);};
 return{g,t,st,tick,moves,originalMove,T:window.__NOVA_LIVING_FRONT_TEST__};
}
test('outside rival can make one real directional turn during the public live BLOOM',()=>{
 const s=scene(),move=s.tick();
 assert.equal(s.t.ai.__lfEcoMode,'signal');
 assert.equal(s.t.ai.__lfEcoKey,'BLOOM:5');
 assert.ok(s.t.ai.__lfEcoWeight>.10);
 assert.equal(s.st.stats.aiFrontlineCommitments,1,'fresh public opportunity should be actionable');
 assert.ok(move.x>0&&move.y>0,'bounded commitment should overcome an opposing idle heading');
 assert.equal(s.g.moveTank,s.originalMove,'temporary movement owner must be restored');
});
test('already-arrived rivals and nonselected rivals cannot dogpile a live sector',()=>{
 const arrived=scene();arrived.t.x=-900;arrived.t.y=-600;arrived.tick();
 assert.equal(arrived.T.sectorIndex(arrived.t.x,arrived.t.y),5);
 assert.equal(arrived.st.stats.aiFrontlineCommitments||0,0);
 const other=scene();other.t.id=8;other.tick();
 assert.equal(other.st.stats.aiFrontlineCommitments||0,0);
});
test('live signal commitment yields to combat danger and damaged health',()=>{
 const threatened=scene();threatened.t.ai.__v180Threat={risk:.5};threatened.tick();
 assert.equal(threatened.st.stats.aiFrontlineCommitments||0,0);
 const damaged=scene();damaged.t.hp=60;damaged.tick();
 assert.equal(damaged.st.stats.aiFrontlineCommitments||0,0);
 const recentHit=scene();recentHit.t.ai.__v180HitAt=105;recentHit.tick();
 assert.equal(recentHit.st.stats.aiFrontlineCommitments||0,0);
});
test('disabled Director and non-BLOOM signals never grant a tactical turn',()=>{
 const disabled=scene();disabled.st.directorEnabled=false;disabled.tick();
 assert.equal(disabled.st.stats.aiFrontlineCommitments||0,0);
 const migration=scene();migration.st.signal={type:'MIGRATION',to:5,x:-562.5,y:-562.5,started:105,until:110};
 migration.st.bloomMemory=null;migration.tick();
 assert.equal(migration.st.stats.aiFrontlineCommitments||0,0);
});
test('one live turn cannot restart on its own remembered announcement',()=>{
 const s=scene();s.tick();assert.equal(s.st.stats.aiFrontlineCommitments,1);
 s.g.time=111;s.st.signal=null;s.tick();
 assert.equal(s.st.stats.aiFrontlineCommitments,1,'same public announcement has one turn budget');
 s.g.time=112;s.tick();assert.equal(s.st.stats.aiFrontlineCommitments,1);
});
test('live public commitment cannot depend on hidden ecological sector values',()=>{
 const a=scene(),b=scene();
 b.st.sectors[5].value=99999;b.st.sectors[5].maturity=1;
 b.st.sectors[3].value=1;b.st.sectors[3].pressure=999;
 const first=a.tick(),second=b.tick();
 assert.deepEqual(second,first,'private maturity/value must not steer a public decision');
 assert.equal(a.t.ai.__lfEcoWeight,b.t.ai.__lfEcoWeight);
 assert.equal(a.st.stats.aiFrontlineCommitments,b.st.stats.aiFrontlineCommitments);
});
test('a genuinely visible nearby combat target vetoes the live public turn',()=>{
 const s=scene(),enemy={id:99,x:-1100,y:-600,hp:100,maxHp:100,alive:true,spawnShieldT:0};
 s.t.ai.__v1112TargetId=99;s.g.getTank=id=>id===99?enemy:null;
 s.g.hasLineOfSight=()=>true;
 const move=s.tick();
 assert.equal(s.st.stats.aiFrontlineCommitments||0,0);
 assert.ok(move.x<0,'live public farm cannot override immediate visible combat');
});
