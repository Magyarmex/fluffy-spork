'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
// A public Rogue Star dot must be above permanent walls, exactly once.
// Use the shipping HTML/overlay composition, never a synthetic minimap owner.
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');

function scene(seed){return withSeed(seed,()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const star=g.shapes.find(s=>s.type==='star');
 assert.ok(star,'shipping world has Rogue Star');
 // A physically safe Star near a wall overlaps the 2.8px minimap outline.
 let point=null;
 for(const wall of g.__novaTerrain.filter(s=>!s.destructible&&s.shape==='rect')){
  for(const side of [-1,1]){
   const x=wall.x+side*(wall.w/2+(star.r||24)+3),y=wall.y,pilotX=x+side*80;
   if(g.isTerrainSafe(x,y,(star.r||24)+1)&&g.isTerrainSafe(pilotX,y,30)&&
      g.hasLineOfSight(pilotX,y,x,y,3)){
    point={x,y,pilotX,edge:wall.x+side*wall.w/2};break;
   }
  }if(point)break;
 }
 assert.ok(point,'terrain-safe Star/wall proximity is reachable');
 assert.ok(Math.abs(point.x-point.edge)*216/4500<2.4,'Star dot overlaps wall outline');
 star.x=point.x;star.y=point.y;
 g.player.x=point.pilotX;g.player.y=point.y;
 g.cam.x=point.x;g.cam.y=point.y;g.cam.zoom=1;g.w=800;g.h=600;
 const sight=g.hasLineOfSight;
 const ctx=g.mmCtx,fill=ctx.fillRect,stroke=ctx.strokeRect,arc=ctx.arc,events=[];
 ctx.fillRect=function(x,y,w,h){
  if(w===2&&h===2&&this.fillStyle==='#ffe066')
   events.push({type:'star',alpha:this.globalAlpha});
  return fill.apply(this,arguments);
 };
 ctx.strokeRect=function(){if(this.lineWidth===2.8)events.push({type:'wall'});return stroke.apply(this,arguments);};
 ctx.arc=function(){if(this.lineWidth===2.8)events.push({type:'wall'});return arc.apply(this,arguments);};
 const before=digest(physical(g));
 try{g.drawMinimap();}finally{
  g.hasLineOfSight=sight;ctx.fillRect=fill;ctx.strokeRect=stroke;ctx.arc=arc;
 }
 return{events,before,after:digest(physical(g))};
});}
for(const seed of [1517802,1517816,1517854,1517825,1517871,1517913]){
 test('Rogue Star appears once ABOVE permanent walls in seeded shipping world '+seed,()=>{
  const {events,before,after}=scene(seed);
  assert.equal(before,after,'rendering must not change physics');
  const stars=events.filter(e=>e.type==='star');
  assert.equal(stars.length,1,'one visibility-gated live Star dot');
  assert.equal(stars[0].alpha,.75,'preserve core Star alpha');
  const wall=events.findLastIndex(e=>e.type==='wall');
  assert.ok(wall>=0&&events.findIndex(e=>e.type==='star')>wall,
   'wall strokes must not obscure visible Star dot');
 });
}
test('missing permanent terrain leaves original visible Star intact',()=>{
 const g=bootGame();if(!g.player)g.redeploy();
 const star=g.shapes.find(s=>s.type==='star');assert.ok(star);
 star.x=g.player.x;star.y=g.player.y+50;
 g.cam.x=g.player.x;g.cam.y=g.player.y;g.cam.zoom=1;g.w=800;g.h=600;
 const sight=g.hasLineOfSight;g.hasLineOfSight=()=>true;
 const terrain=g.__novaTerrain;g.__novaTerrain=[];
 const ctx=g.mmCtx,fill=ctx.fillRect;let dots=0;
 ctx.fillRect=function(x,y,w,h){if(w===2&&h===2&&this.fillStyle==='#ffe066')dots++;return fill.apply(this,arguments);};
 try{g.drawMinimap();}finally{ctx.fillRect=fill;g.__novaTerrain=terrain;g.hasLineOfSight=sight;}
 assert.equal(dots,1);
});
