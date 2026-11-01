'use strict';
// Public BLOOM distance is announced-sector geometry, never an enemy warning.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 const draws=[],ctx={save(){draws.push('save');},restore(){draws.push('restore');},
  setTransform(){},beginPath(){},roundRect(){},rect(){},fill(){},stroke(){},setLineDash(){},
  fillText(text,x,y){draws.push({text,x,y});}};
 const window={__novaModules:{'game/render':m=>{
  m.exports={render(){draws.push('base');return 'base-render';}};}}};
 const sandbox={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),sandbox,{filename:name});
 const module={exports:{}};window.__novaModules['game/render'](module,module.exports,()=>({}));
 const p={id:1,x:-1500,y:-560,vx:350,vy:0,hp:100,alive:true,spawnShieldT:0};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:99,until:104},
  bloomMemory:{sector:5,announcedAt:99,until:123}};
 const g={player:p,__lfState:st,cam:{x:p.x,y:p.y,zoom:1},ctx,dpr:2,
  time:100,status:'playing',w:320,h:568};
 function render(){
  draws.length=0;const before=JSON.stringify({p,st,cam:g.cam,time:g.time});
  module.exports.render(g,g.w,g.h);
  assert.equal(JSON.stringify({p,st,cam:g.cam,time:g.time}),before,'presentation must not mutate simulation');
  return draws.filter(x=>x&&typeof x==='object'&&typeof x.text==='string');
 }
 return{g,p,st,draws,render,renderModule:module.exports};
}
test('announced public BLOOM gives early mobile distance, with no enemy or private ecology reads',()=>{
 const s=scene(),labels=s.render();
 assert.equal(labels.length,1);assert.equal(labels[0].text,'BLOOM 375 AWAY');
 assert.equal(s.g.tanks,undefined);assert.equal(s.g.shapes,undefined);
 assert.equal(s.draws[0],'base');assert.equal(s.draws.at(-1),'restore');
 assert.ok(labels[0].x>=57&&labels[0].x<=s.g.w-57);
 assert.ok(labels[0].y>=106&&labels[0].y<=s.g.h-149);
});
test('last-known public location is visibly uncertain, and expires without resurrection',()=>{
 const s=scene();s.st.signal=null;s.g.time=110;
 assert.equal(s.render()[0].text,'BLOOM? 375 AWAY');
 s.g.time=123;assert.equal(s.render().length,0);
 s.st.bloomMemory={sector:5,announcedAt:120,until:140};s.g.time=110;
 assert.equal(s.render().length,0);
});
test('a live unrelated Director event takes precedence over stale BLOOM',()=>{
 const s=scene();s.st.signal={type:'MIGRATION',started:99,until:103,from:1,to:2};
 assert.equal(s.render().length,0);
 s.g.time=104;assert.equal(s.render()[0].text,'BLOOM? 375 AWAY');
});
test('approach direction, sector crossing and low speed do not fabricate a cue',()=>{
 const s=scene();s.p.x=-1000;s.g.cam.x=-1000;
 assert.equal(s.render().length,0,'already inside');
 s.p.x=-1500;s.g.cam.x=-1500;s.p.vx=-350;
 assert.equal(s.render().length,0,'moving away');
 s.p.vx=350;s.p.x=-1210;s.g.cam.x=-1210;
 assert.equal(s.render().length,0,'yield to local contest warning');
 s.p.x=-1600;s.g.cam.x=-1600;s.p.vx=90;
 assert.equal(s.render().length,0,'slow approach');
});
test('desktop, landscape, death, shield, pause, disabled Director and Long Glass are fail-closed',()=>{
 const variants=['desktop','landscape','dead','shield','paused','decorative','disabled','long-glass','transition','invalid-camera'];
 for(const variant of variants){
  const s=scene();
  if(variant==='desktop')s.g.w=900;
  if(variant==='landscape'){s.g.w=420;s.g.h=300;}
  if(variant==='dead')s.p.alive=false;
  if(variant==='shield')s.p.spawnShieldT=1;
  if(variant==='paused')s.g.status='paused';
  if(variant==='decorative')s.g.__novaDecorativeWorld=true;
  if(variant==='disabled')s.st.directorEnabled=false;
  if(variant==='long-glass')s.g.__novaTacticalCamera={active:true};
  if(variant==='transition')s.g.__novaTacticalCamera={transition:true};
  if(variant==='invalid-camera')s.g.cam.zoom=0;
  assert.equal(s.render().length,0,variant);
 }
});
test('portrait positions reserve the top HUD and lower touch band; renderer owner metadata survives',()=>{
 for(const [w,h] of [[260,540],[280,568],[320,568],[375,667],[420,740]]){
  const s=scene();s.g.w=w;s.g.h=h;
  const labels=s.render();assert.equal(labels.length,1);
  assert.ok(labels[0].x>=57&&labels[0].x<=w-57);
  assert.ok(labels[0].y>=106&&labels[0].y<=h-149);
  assert.equal(s.renderModule.render.__novaLivingFront,true,'preserve existing late-bound VFX owner');
 }
});

test('engine pause flag hides the public approach cue even when game status remains playing',()=>{
 const s=scene();
 assert.equal(s.render().length,1,'precondition: cue is active');
 s.g.paused=true;
 assert.equal(s.g.status,'playing','engine pause leaves status playing');
 assert.equal(s.render().length,0,'no cue may draw behind a pause or upgrade overlay');
 s.g.paused=false;
 assert.equal(s.render().length,1,'cue returns when the same match resumes');
});
