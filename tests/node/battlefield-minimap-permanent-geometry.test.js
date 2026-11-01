'use strict';
/* Permanent terrain is public topology, not a new source of live enemy/cover intel.
 * Exercise the exact HTML-ordered Game.drawMinimap path, not an isolated canvas. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const seeds=[1517802,1517816,1517854,1517825,1517871,1517913,1517962,1517981,1518019,1518053,1518097,1518149];
function sample(seed){return withSeed(seed,()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const mm=g.mmCtx,rect=mm.strokeRect,arc=mm.arc,ops=[];
 mm.strokeRect=function(x,y,w,h){ops.push({kind:'rect',x,y,w,h,alpha:this.globalAlpha,width:this.lineWidth});return rect.apply(this,arguments);};
 mm.arc=function(x,y,r){ops.push({kind:'circle',x,y,r,alpha:this.globalAlpha,width:this.lineWidth});return arc.apply(this,arguments);};
 const before=digest(physical(g));g.drawMinimap();const after=digest(physical(g));
 return {seed,layout:g.__novaBattlefield?.name,ops,terrain:g.__novaTerrain,before,after};
});}
test('all three real Battlefield layouts draw permanent geometry without mutating the game',()=>{
 const layouts=new Set();
 for(const seed of seeds){const x=sample(seed);layouts.add(x.layout);
  assert.equal(x.before,x.after,'minimap drawing must not change physical state');
  const expected=x.terrain.filter(s=>!s.destructible&&s.solid!==false);
  const drawn=x.ops.filter(o=>o.width===2.8&&o.alpha===.72);
  assert.equal(drawn.length,expected.length,'one minimap primitive per permanent wall/pillar');
  assert.ok(drawn.every(o=>o.kind==='rect'||o.kind==='circle'));
  assert.ok(drawn.every(o=>o.width*60/216>=.7),'visible at 60 CSS px');
  assert.ok(drawn.every(o=>o.x>=0&&o.x<=216&&o.y>=0&&o.y<=216));
  assert.ok(expected.length>=10&&expected.length<=12);
 }
 assert.equal(layouts.size,3);
});
test('destroyed and intact destructible cover never alter public static topology',()=>{
 const a=withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const ops=[],ctx=g.mmCtx,orig=ctx.strokeRect,origArc=ctx.arc;
  ctx.strokeRect=function(){if(this.lineWidth===2.8)ops.push(['rect',...arguments]);return orig.apply(this,arguments);};
  ctx.arc=function(){if(this.lineWidth===2.8)ops.push(['circle',...arguments]);return origArc.apply(this,arguments);};
  g.drawMinimap();const before=JSON.stringify(ops);ops.length=0;
  for(const t of g.__novaTerrain)if(t.destructible){t.solid=false;t.hp=0;}
  g.drawMinimap();return{before,after:JSON.stringify(ops)};
 });assert.equal(a.before,a.after);
});
test('missing and malformed terrain fail closed',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const before=g.__novaTerrain;g.__novaTerrain=[null,
  {destructible:false,shape:'rect',x:NaN,y:0,w:200,h:40},
  {destructible:false,shape:'circle',x:0,y:0,r:NaN}];
 assert.doesNotThrow(()=>g.drawMinimap());g.__novaTerrain=before;
});
