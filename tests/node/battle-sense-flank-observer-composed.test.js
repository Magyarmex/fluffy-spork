'use strict';
// Real 49-overlay Game composition: the local Battle Sense flank steering
// must not react to projectiles hidden outside the observer's actual viewport
// or behind solid cover. This is a fairness invariant, not an aim-assist buff.
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed Battle Sense flank respects observer viewport and cover',()=>{
  for(const seed of [1517800,1517802]){
    withSeed(seed,()=>{
      const g=bootGame();
      const oldLos=g.hasLineOfSight,oldSafe=g.isTerrainSafe;
      try{
        const t=g.player,side=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__.saferSide;
        const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
        assert.equal(typeof side,'function');
        assert.equal(typeof fair.inGameplayWorldPoint,'function');
        g.cam.zoom=1;
        g.bullets=[{id:999999,ownerId:999998,kind:'bullet',
          x:t.x+110,y:t.y+115,vx:0,vy:0,ttl:1,dead:false}];
        g.hasLineOfSight=()=>true;
        g.isTerrainSafe=()=>true;
        g.w=160;g.h=160;
        assert.equal(fair.inGameplayWorldPoint(g,t,t.x+110,t.y+115),false);
        assert.equal(side(g,t,1,0),0,'offscreen threat cannot alter steering');
        g.w=320;g.h=480;
        assert.equal(fair.inGameplayWorldPoint(g,t,t.x+110,t.y+115),true);
        assert.equal(side(g,t,1,0),-1,'observed threat retains dodge');
        g.hasLineOfSight=(ax,ay,bx,by)=>
          !(ax===t.x&&ay===t.y&&bx===t.x+110&&by===t.y+115);
        assert.equal(side(g,t,1,0),0,'terrain-hidden threat cannot alter steering');
      }finally{
        g.hasLineOfSight=oldLos;g.isTerrainSafe=oldSafe;g.destroy();
      }
    });
  }
});
