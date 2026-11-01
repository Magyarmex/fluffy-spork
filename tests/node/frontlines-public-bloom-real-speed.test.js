'use strict';
/* The real 48-overlay Game + renderer: starter-class movement must be able
 * to trigger the public BLOOM cue. A mocked 350u/s pilot missed this bug. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');

test('materialized Scout and slower hulls can see the public approach cue at real top speed',()=>{
 const g=bootGame(),p=g.player;
 assert.equal(p.cls,'scout');
 assert.equal(g.tankSpeed(p),124,'shipping unupgraded Scout speed, not a synthetic fast pilot');
 g.w=320;g.h=568;g.dpr=1;g.time=100;g.paused=false;
 Object.assign(p,{x:-1500,y:-560,vx:124,vy:0,spawnShieldT:0});
 Object.assign(g.cam,{x:p.x,y:p.y,zoom:1});
 const st=g.__lfState||(g.__lfState={});
 st.directorEnabled=true;
 st.signal={type:'BLOOM',sector:5,started:99,until:104};
 st.bloomMemory={sector:5,announcedAt:99,until:123};
 const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
 const labels=[],old=g.ctx.fillText;
 g.ctx.fillText=function(text){if(String(text).includes('BLOOM'))labels.push(String(text));return old.apply(this,arguments);};
 function cue(){labels.length=0;const before=[p.x,p.y,p.hp,g.time,p.vx,p.vy];
  render(g,g.w,g.h);
  assert.deepEqual([p.x,p.y,p.hp,g.time,p.vx,p.vy],before,
   'public presentation cannot alter gameplay state');
  return labels.filter(x=>/BLOOM\?? .*AWAY|BLOOM\?? · COVER/.test(x));
 }
 const expected=g.hasLineOfSight(p.x,p.y,-1125,p.y,Math.max(12,Math.min(30,(p.r||14)+6)))
  ?'BLOOM 375 AWAY':'BLOOM · COVER';
 assert.deepEqual(cue(),[expected],'real Battlefield cover determines the honest cue');
 p.vx=65;assert.deepEqual(cue(),[],'slow drifting must not generate the cue');
 p.vx=-124;assert.deepEqual(cue(),[],'movement away from the sector must not generate a cue');
 p.cls='bastion';p.vx=g.tankSpeed(p);
 assert.ok(p.vx<124,'heavy hull is genuinely slower');
 assert.deepEqual(cue(),[expected],'slower evolved classes retain the same public choice');
 g.paused=true;assert.deepEqual(cue(),[],'pause still hides the cue');
});

test('all 36 canonical unupgraded classes can receive a public cue at their real full speed',()=>{
 const g=bootGame(),p=g.player;
 const classes=g.__testWindow.__novaMakeRequire('')('game/classes').CLASSES;
 assert.equal(Object.keys(classes).length,36,'class roster is canonical');
 g.w=320;g.h=568;g.dpr=1;g.time=100;g.paused=false;
 Object.assign(p,{x:-1500,y:-560,vy:0,spawnShieldT:0});
 Object.assign(g.cam,{x:p.x,y:p.y,zoom:1});
 const st=g.__lfState||(g.__lfState={});
 st.directorEnabled=true;
 st.signal={type:'BLOOM',sector:5,started:99,until:104};
 st.bloomMemory={sector:5,announcedAt:99,until:123};
 const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
 const labels=[],old=g.ctx.fillText;
 g.ctx.fillText=function(text){if(/^BLOOM/.test(String(text)))labels.push(String(text));return old.apply(this,arguments);};
 const misses=[];
 for(const cls of Object.keys(classes)){
  p.cls=cls;p.vx=g.tankSpeed(p);labels.length=0;
  render(g,g.w,g.h);
  if(labels.length!==1||!/^BLOOM/.test(labels[0]))misses.push({cls,speed:p.vx,labels:labels.slice()});
 }
 assert.deepEqual(misses,[],
  'a normal full-speed hull should not lose public tactical information because of class speed');
});
