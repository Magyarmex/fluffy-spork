'use strict';
// Neutral shapes and tanks can reuse numeric IDs. Fair Engagement's tank-ID
// self-filter must not make an actually visible neutral shape invisible to AI.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}},
  __NOVA_FAIR_ENGAGEMENT_TEST__:{
   viewportHalfExtents:()=>({x:400,y:300}),
   inGameplayViewport(g,a,b){return a.id!==b.id&&Math.abs(a.x-b.x)<=400&&Math.abs(a.y-b.y)<=300;}
  }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const n of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',n),'utf8'),ctx,{filename:n});
 return window.__NOVA_LIVING_FRONT_TEST__;
}
function world(){
 const t={id:3,kind:'tank',x:0,y:0,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const shapes=[3,4,5,6].map((id,i)=>({id,kind:'shape',type:'square',x:50+i*10,y:40,hp:100}));
 const g={time:100,w:800,h:600,cam:{zoom:1},player:t,tanks:[t],shapes,__lfState:null,
  hasLineOfSight:()=>true};
 return {t,shapes,g};
}
test('a visible same-ID neutral shape contributes to legitimate local AI farming',()=>{
 const T=boot(),{t,g}=world(),b=T.publicEcoBias(g,t,{square:{xp:100}},{});
 assert.equal(b.mode,'local','four visible squares must form a real local opportunity');
 assert.ok(b.weight>.08);
 assert.ok(b.x>0&&b.y>0);
});
test('same-ID neutral still requires real terrain line of sight',()=>{
 const T=boot(),{t,g}=world();
 g.hasLineOfSight=(_x,_y,sx)=>sx!==50;
 assert.equal(T.publicEcoBias(g,t,{square:{xp:100}},{}).mode,'none',
  'an occluded fourth square cannot be counted as visible value');
});
test('same-ID Rogue Star updates last-seen position only while genuinely visible',()=>{
 const T=boot(),{t,g}=world();
 const star={id:3,kind:'shape',type:'star',x:120,y:20,hp:100};
 g.shapes=[star];g.getShape=id=>id===3?star:null;
 g.__lfState={directorEnabled:true,signal:{type:'ROGUE STAR',starId:3,x:300,y:0,started:98,until:110},
  sectors:[],stats:{}};
 let b=T.publicEcoBias(g,t,{star:{xp:300}},{});
 assert.equal(b.mode,'signal');
 assert.equal(t.ai.__lfStarSeenId,3);
 assert.equal(t.ai.__lfStarSeenX,120);
 star.x=800;star.y=100;
 b=T.publicEcoBias(g,t,{star:{xp:300}},{});
 assert.equal(t.ai.__lfStarSeenX,120,'off-screen movement must not become live radar');
 star.x=130;g.hasLineOfSight=()=>false;
 b=T.publicEcoBias(g,t,{star:{xp:300}},{});
 assert.equal(t.ai.__lfStarSeenX,120,'occluded movement must not become live radar');
});
test('actual materialized runtime still loads the patched Living Front Director',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
