'use strict';
// A bounded, interruptible public-BLOOM tactical turn must create a real
// directional choice without hidden ecology, dogpiling or combat overrides.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(id=7){
 const window={__novaModules:{
  'game/engine':function(m){m.exports={Game:class{}};},
  'game/ai':function(m){m.exports={updateAI:function(t,g,dt){
   if(g.__testBeforeMove)g.__testBeforeMove(t,g);
   g.moveTank(t,g.__testMoveVelocity==null?-100:g.__testMoveVelocity,0,dt);
  }};}
 }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const aiModule={exports:{}};window.__novaModules['game/ai'](aiModule,aiModule.exports,()=>({SHAPE_DEFS:{}}));
 const t={id,x:-900,y:-900,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:null,directorEnabled:true,bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),stats:{aiRotations:0}};
 const moves=[],originalMove=(_t,x,y)=>moves.push({x,y});
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st,
  moveTank:originalMove,tankSpeed:()=>100};
 const tick=(dt=.3)=>{aiModule.exports.updateAI(t,g,dt);return moves.at(-1);};
 return {t,g,st,moves,tick,originalMove,T:window.__NOVA_LIVING_FRONT_TEST__};
}
test('one healthy, unengaged AI can deliberately reverse toward a recent public BLOOM',()=>{
 const s=scene();const move=s.tick();
 assert.equal(s.t.ai.__lfEcoMode,'memory');
 assert.ok(move.x>0&&move.y>0,'short strategic turn must overcome an opposite idle heading');
 assert.equal(s.st.stats.aiFrontlineCommitments,1);
 assert.equal(s.g.moveTank,s.originalMove,'temporary movement authority must be restored');
});
test('a tactical turn is bounded and cannot restart repeatedly on the same announcement',()=>{
 const s=scene();s.tick();s.g.time=109;s.tick();
 assert.ok(s.moves.at(-1).x<0,'after commitment expires the ordinary mild memory bias resumes');
 assert.equal(s.st.stats.aiFrontlineCommitments,1);
 s.g.time=110;s.tick();assert.equal(s.st.stats.aiFrontlineCommitments,1);
});
test('a genuinely new public BLOOM can support a new tactical turn',()=>{
 const s=scene();s.tick();s.g.time=109;s.tick();
 s.st.bloomMemory={sector:5,announcedAt:140,until:164};s.g.time=146;s.tick();
 assert.ok(s.moves.at(-1).x>0);
 assert.equal(s.st.stats.aiFrontlineCommitments,2);
});
test('a visible hostile target acquired during the underlying AI update interrupts commitment',()=>{
 const s=scene();s.tick();const target={id:99,x:-850,y:-850,hp:100,alive:true,team:2};
 s.g.getTank=id=>id===99?target:null;
 s.g.__testBeforeMove=t=>{t.ai.__v1112TargetId=99;};
 s.g.time=106.3;const move=s.tick();
 assert.ok(move.x<0,'combat priority must beat the public farm');
 assert.equal(s.t.ai.__lfFrontTurn,null);
});
test('low health and recent damage cancel or prevent the tactical turn',()=>{
 const s=scene();s.tick();s.t.hp=50;s.g.time=106.3;
 assert.ok(s.tick().x<0);assert.equal(s.t.ai.__lfFrontTurn,null);
 const q=scene();q.t.ai.__v180HitAt=q.g.time;
 assert.ok(q.tick().x<0);assert.equal(q.st.stats.aiFrontlineCommitments||0,0);
});
test('the turn does not hijack a faster committed movement or zero-speed hold',()=>{
 const s=scene();s.g.__testMoveVelocity=-220;
 assert.equal(s.tick().x,-220,'dash/boost movement remains with its canonical owner');
 const q=scene();q.g.__testMoveVelocity=0;
 assert.equal(q.tick().x,0,'standing still must not become forced ecological travel');
});
test('only a bounded subset of rivals turns, and no stale/disabled opportunity can start it',()=>{
 const other=scene(3);assert.ok(other.tick().x<0);assert.equal(other.st.stats.aiFrontlineCommitments||0,0);
 const stale=scene();stale.g.time=125;assert.ok(stale.tick().x<0);assert.equal(stale.st.stats.aiFrontlineCommitments||0,0);
 const off=scene();off.st.directorEnabled=false;assert.ok(off.tick().x<0);assert.equal(off.st.stats.aiFrontlineCommitments||0,0);
});
test('hidden sector value never affects tactical turn eligibility or heading',()=>{
 const a=scene(),b=scene();
 b.st.sectors[5].value=999999;b.st.sectors[5].maturity=1;b.st.sectors[5].pressure=99;
 const av=a.tick(),bv=b.tick();
 assert.equal(av.x,bv.x);assert.equal(av.y,bv.y);
 assert.equal(a.st.stats.aiFrontlineCommitments,b.st.stats.aiFrontlineCommitments);
});
