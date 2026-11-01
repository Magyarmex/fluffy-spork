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

test('the already-public player dot stays above wall outlines near a wall',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const wall=g.__novaTerrain.find(s=>!s.destructible&&s.shape==='rect');
 g.player.x=wall.x+wall.w*.5+25;g.player.y=wall.y;
 const ctx=g.mmCtx,ops=[],origFill=ctx.fillRect,origRect=ctx.strokeRect,origArc=ctx.arc;
 ctx.fillRect=function(x,y,w,h){ops.push({kind:'fill',x,y,w,h,alpha:this.globalAlpha,color:this.fillStyle});return origFill.apply(this,arguments);};
 ctx.strokeRect=function(){if(this.lineWidth===2.8)ops.push({kind:'wall'});return origRect.apply(this,arguments);};
 ctx.arc=function(){if(this.lineWidth===2.8)ops.push({kind:'wall'});return origArc.apply(this,arguments);};
 g.drawMinimap();const last=ops[ops.length-1],wallIndex=ops.findLastIndex(o=>o.kind==='wall');
 assert.ok(wallIndex>=0&&ops.length-1>wallIndex);
 assert.equal(last.kind,'fill');assert.equal(last.color,'#7df3ff');assert.equal(last.alpha,1);
 const sc=216/4500;
 assert.ok(Math.abs(last.x-((g.player.x+2250)*sc-2.5))<1e-8);
 assert.ok(Math.abs(last.y-((g.player.y+2250)*sc-2.5))<1e-8);
 assert.equal(last.w,5);assert.equal(last.h,5);
});

test('permanent wall strokes never hide existing public neutral, hostile, or powerup markers',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const wall=g.__novaTerrain.find(s=>!s.destructible&&s.shape==='rect');
 const x=wall.x+wall.w*.5,y=wall.y;
 // These entities already appear on the canonical minimap. They are placed
 // precisely on the permanent wall stroke to make paint order observable.
 const shape=g.shapes.find(s=>s.type!=='star');
 shape.x=x;shape.y=y;
 const hostile=g.tanks.find(t=>t.alive&&!t.isPlayer);
 assert.ok(hostile);hostile.x=x+9;hostile.y=y;
 const pu={type:'health',x:x+18,y};g.powerups.push(pu);
 const ctx=g.mmCtx,ops=[],oldFill=ctx.fillRect,oldRect=ctx.strokeRect;
 ctx.fillRect=function(a,b,w,h){ops.push({kind:'fill',x:a,y:b,w,h,alpha:this.globalAlpha,color:this.fillStyle});return oldFill.apply(this,arguments);};
 ctx.strokeRect=function(){if(this.lineWidth===2.8)ops.push({kind:'wall'});return oldRect.apply(this,arguments);};
 g.drawMinimap();
 const lastWall=ops.findLastIndex(o=>o.kind==='wall');
 assert.ok(lastWall>=0);
 for(const [size,label] of [[2,'neutral'],[3,'hostile'],[4,'powerup']]){
  assert.ok(ops.slice(lastWall+1).some(o=>o.kind==='fill'&&o.w===size&&o.h===size),
   label+' minimap marker must remain visible above the wall outline');
 }
});

test('permanent minimap overlay cannot reveal an offscreen Rogue Star through marker replay',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const star=g.shapes.find(s=>s.type==='star');
 assert.ok(star);
 star.x=2100;star.y=2100;
 g.cam.x=-2000;g.cam.y=-2000;g.cam.zoom=1;g.w=320;g.h=568;
 const ctx=g.mmCtx,ops=[],oldFill=ctx.fillRect;
 ctx.fillRect=function(x,y,w,h){if(w===2&&h===2)ops.push([x,y]);return oldFill.apply(this,arguments);};
 g.drawMinimap();
 const sx=(star.x+2250)*216/4500-1,sy=(star.y+2250)*216/4500-1;
 assert.equal(ops.filter(([x,y])=>Math.abs(x-sx)<1e-6&&Math.abs(y-sy)<1e-6).length,0);
});
