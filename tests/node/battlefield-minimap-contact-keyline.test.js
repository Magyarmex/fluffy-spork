'use strict';
/* Exercise the composed 49-overlay minimap. This is paint-only: all contacts
 * originate from the core minimap's public paint commands, not hidden entities. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const SCALE=216/4500;
function scene(seed,{crowded=false,powerup=false,neutral=false}={}){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const enemies=g.tanks.filter(t=>t.alive&&!t.isPlayer);
  assert.ok(enemies.length>=2,'real match contains rivals');
  g.player.x=-1800;g.player.y=-1800;
  /* Isolate the contact from incidental random neutral spawns. */
  for(let i=0;i<g.shapes.length;i++){
   g.shapes[i].x=-1800+(i%12)*35;
   g.shapes[i].y=1400+Math.floor(i/12)*35;
  }
  for(let i=0;i<enemies.length;i++){
   enemies[i].x=1300+(i%4)*180;
   enemies[i].y=1200+Math.floor(i/4)*180;
  }
  const target=enemies[0];target.x=0;target.y=0;
  if(crowded){enemies[1].x=70;enemies[1].y=0;}
  if(powerup)g.powerups.push({type:'health',x:75,y:0});
  if(neutral){const sh=g.shapes.find(s=>s.type!=='star');assert.ok(sh);sh.x=75;sh.y=0;}
  const ctx=g.mmCtx,orig=ctx.fillRect,rect=ctx.strokeRect,ops=[];
  ctx.fillRect=function(x,y,w,h){ops.push({kind:'fill',x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha});return orig.apply(this,arguments);};
  ctx.strokeRect=function(){if(this.lineWidth===2.8)ops.push({kind:'wall'});return rect.apply(this,arguments);};
  const spy=ctx.fillRect,before=digest(physical(g));
  try{g.drawMinimap();assert.equal(ctx.fillRect,spy,'instrumented canvas restored');}
  finally{ctx.fillRect=orig;ctx.strokeRect=rect;}
  assert.equal(digest(physical(g)),before,'minimap drawing cannot change physical game state');
  return{ops,enemyColor:target.color,enemyX:(target.x+2250)*SCALE-1.5,enemyY:(target.y+2250)*SCALE-1.5,
   playerX:(g.player.x+2250)*SCALE-2.5,playerY:(g.player.y+2250)*SCALE-2.5};
 });
}
function near(op,x,y,w,h){return op.kind==='fill'&&op.w===w&&op.h===h&&Math.abs(op.x-x)<1e-7&&Math.abs(op.y-y)<1e-7;}
for(const seed of [1517802,1517816,1517854]){
 test('isolated public rival gains bounded contrast keyline in composed game '+seed,()=>{
  const {ops,enemyX:x,enemyY:y,enemyColor:color}=scene(seed);
  const wall=ops.findLastIndex(o=>o.kind==='wall');assert.ok(wall>=0);
  const after=ops.slice(wall+1),dot=after.findIndex(o=>near(o,x,y,3,3));
  assert.ok(dot>=2,'rival remains above walls');
  assert.equal(after[dot].color,color,'rival class color unchanged');
  assert.equal(after[dot].alpha,1,'rival original opacity unchanged');
  assert.ok(near(after[dot-2],x-2,y-2,7,7));
  assert.equal(after[dot-2].color,'#020a18');
  assert.ok(near(after[dot-1],x-1,y-1,5,5));
  assert.equal(after[dot-1].color,'#f4f9ff');
 });
}
test('nearby rivals retain original dots without merging enlarged keylines',()=>{
 const {ops,enemyX:x,enemyY:y}=scene(1517802,{crowded:true});
 const dot=ops.findLastIndex(o=>near(o,x,y,3,3));assert.ok(dot>0);
 assert.ok(!near(ops[dot-1],x-1,y-1,5,5),'no enlarged white keyline in crowded fight');
 assert.ok(!near(ops[dot-1],x-2,y-2,7,7),'no enlarged dark keyline in crowded fight');
});
test('powerup next to rival prevents halo obscuring its public marker',()=>{
 const {ops,enemyX:x,enemyY:y}=scene(1517802,{powerup:true});
 const dot=ops.findLastIndex(o=>near(o,x,y,3,3));assert.ok(dot>0);
 assert.ok(!near(ops[dot-1],x-1,y-1,5,5));
 assert.ok(ops.some(o=>o.kind==='fill'&&o.w===4&&o.h===4),'powerup remains painted');
});
test('neutral resources near a rival remain visible instead of being covered by its halo',()=>{
 const {ops,enemyX:x,enemyY:y}=scene(1517802,{neutral:true});
 const dot=ops.findLastIndex(o=>near(o,x,y,3,3));assert.ok(dot>0);
 assert.ok(!near(ops[dot-1],x-1,y-1,5,5));
 assert.ok(ops.some(o=>o.kind==='fill'&&o.w===2&&o.h===2),'resource dot remains painted');
});
test('public player contact retains original cyan 5px dot, with a final high-contrast keyline',()=>{
 const {ops,playerX:x,playerY:y}=scene(1517802);
 const last=ops.at(-1);assert.ok(near(last,x,y,5,5));assert.equal(last.color,'#7df3ff');assert.equal(last.alpha,1);
 assert.ok(near(ops.at(-3),x-2,y-2,9,9));
 assert.ok(near(ops.at(-2),x-1,y-1,7,7));
});
