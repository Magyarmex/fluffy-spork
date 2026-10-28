'use strict';
/* Research-only physical migration memory test: canonical 0.42 decay,
 * alternative 0.28; both keep the real Director's 5-crossing gate. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(flag){
 const modules={'game/engine':function(module){
  class Game{constructor(){this.time=0;this.status='playing';this.shapes=[];this.tanks=[];this.orbs=[];this.player=null;this.nextId=1;}
   update(dt){this.time+=dt;}}
  module.exports.Game=Game;
 }};
 const window={__novaModules:modules},context={window,console:{info(){},warn(){},error(){}},
  Math,Number,Object,Array,Date,JSON,Map,Set,performance:{now:()=>0},
  setTimeout(){},clearTimeout(){}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates/living-front-core-v1.12.0.js'),'utf8'),
  context,{filename:'living-front-core-v1.12.0.js'});
 const module={exports:{}};
 modules['game/engine'](module,module.exports,()=>({SHAPE_DEFS:{}}));
 const g=new module.exports.Game();
 if(flag!==undefined)g.__novaResearchMigrationHeatDecay=flag;
 const LF=window.__NOVA_LIVING_FRONT_INTERNAL__,st=LF.ensure(g,{});
 st.migrationHeat=10;st.migrationX=5;st.migrationY=2;
 st.sectorT=.22;st.behaviorT=10;st.directorT=10;
 g.update(.22);
 return{g,st,LF};
}
test('canonical migration memory decays at 0.42 in the real Game.update owner',()=>{
 const {st}=boot();
 assert.ok(Math.abs(st.migrationHeat-10*Math.exp(-.22*.42))<1e-10);
});
test('exact 0.28 opt-in lengthens only the public migration heat memory',()=>{
 const off=boot(),on=boot(.28);
 assert.ok(Math.abs(on.st.migrationHeat-10*Math.exp(-.22*.28))<1e-10);
 assert.ok(on.st.migrationHeat>off.st.migrationHeat);
 assert.equal(on.st.migrationX,off.st.migrationX);
 assert.equal(on.st.migrationY,off.st.migrationY);
 assert.equal(on.st.age,off.st.age);
 assert.equal(on.st.ceiling,off.st.ceiling);
 assert.deepEqual(JSON.parse(JSON.stringify(on.st.sectors)),JSON.parse(JSON.stringify(off.st.sectors)));
 assert.deepEqual(JSON.parse(JSON.stringify(on.st.cooldowns)),JSON.parse(JSON.stringify(off.st.cooldowns)));
});
test('invalid flags cannot change production ecology',()=>{
 const baseline=boot().st.migrationHeat;
 for(const invalid of [null,false,true,0,.24,.42,'0.28',NaN,Infinity,{}])
  assert.equal(boot(invalid).st.migrationHeat,baseline,'invalid research opt-in must fail closed');
});
test('the public Director still requires heat >=5 and coherent flow',()=>{
 const files=['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js',
  'living-front-director-v1.12.0.js'];
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const context={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const f of files)vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',f),'utf8'),context,{filename:f});
 const T=window.__NOVA_LIVING_FRONT_TEST__;
 const st={sectors:Array.from({length:16},(_,i)=>({...T.makeSector(i),value:80,maturity:.1,outbound:i===5?6:0})),
  ceiling:1,signal:null,lastSignalAt:-99,lastMeaningfulAt:100,lastBloomSector:-1,
  migrationHeat:4.99,migrationX:1,migrationY:0,cooldowns:{bloom:100,migration:0,star:100}};
 const ctx={enabled:true,now:100,hasStar:true,migrationFrom:5};
 assert.equal(T.directorDecision(st,ctx),null);
 st.migrationHeat=5.01;
 assert.equal(T.directorDecision(st,ctx)?.type,'MIGRATION');
 st.migrationX=0;st.migrationY=0;
 assert.notEqual(T.directorDecision(st,ctx)?.type,'MIGRATION');
});
test('shipping core is still in the real 48-overlay materialized game',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-core-v1.12.0.js'));
 const core=fs.readFileSync(path.join(root,'nova-updates/living-front-core-v1.12.0.js'),'utf8');
 assert.match(core,/__novaResearchMigrationHeatDecay===\.28\?\.28:\.42/);
});
